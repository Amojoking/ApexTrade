from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import asyncio
import logging
import time
import bcrypt
import jwt as pyjwt
import httpx
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from bson import ObjectId
from payments import entitlements, make_router as make_payments_router, make_webhook_router, FREE_WATCHLIST_MAX, FREE_RESET_MAX, sync_live_for_user

# ---------- Setup ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

app = FastAPI(title="ApexTrade Pro API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("apextrade")

# ---------- Auth utilities ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _public_user_from_doc(user: dict) -> dict:
    user["id"] = str(user.pop("_id"))
    user.pop("password_hash", None)
    return user

async def _user_from_session_token(session_token: str) -> Optional[dict]:
    sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"_id": ObjectId(sess["user_id"])})
    if not user:
        raise HTTPException(401, "User not found")
    return _public_user_from_doc(user)

async def get_current_user(request: Request) -> dict:
    session_token = request.cookies.get("session_token")
    token = request.cookies.get("access_token")
    bearer = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        bearer = auth[7:]
    if session_token:
        user = await _user_from_session_token(session_token)
        if user:
            return user
    if bearer and not bearer.count(".") == 2:
        user = await _user_from_session_token(bearer)
        if user:
            return user
    if not token:
        token = bearer
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(401, "User not found")
        return _public_user_from_doc(user)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=64)
    starting_balance: float = 100000.0

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class OrderIn(BaseModel):
    symbol: str
    asset_type: Literal["stock", "crypto", "etf"] = "stock"
    side: Literal["buy", "sell"]
    order_type: Literal["market", "limit"] = "market"
    quantity: float = Field(gt=0)
    limit_price: Optional[float] = None

class DepositIn(BaseModel):
    amount: float

class ResetIn(BaseModel):
    new_balance: float = 100000.0

class WatchIn(BaseModel):
    symbol: str
    asset_type: str = "stock"
    name: Optional[str] = None

# ---------- Market Data (Yahoo Finance public JSON) ----------
YF_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]
_YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*", "Accept-Language": "en-US,en;q=0.9",
}
QUOTE_TTL, CHART_TTL = 15, 45
_quote_cache = {}   # symbol -> (ts, data)
_chart_cache = {}   # (symbol,range,interval) -> (ts, data)
_yf_client = httpx.AsyncClient(timeout=10, headers=_YF_HEADERS)
_yf_sem = asyncio.Semaphore(6)

def _normalize_symbol(symbol: str, asset_type: str) -> str:
    s = symbol.upper().strip()
    if asset_type == "crypto" and "-" not in s:
        return f"{s}-USD"
    return s

async def _yf_get(path: str) -> Optional[dict]:
    async with _yf_sem:
        for host in YF_HOSTS:
            try:
                r = await _yf_client.get(host + path)
            except httpx.HTTPError:
                continue
            if r.status_code == 200:
                return r.json()
            if r.status_code in (404, 400):
                return None
    return None

def _quote_from_meta(symbol: str, meta: dict) -> dict:
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    change = (price - prev) if price is not None and prev else 0.0
    return {
        "symbol": meta.get("symbol", symbol),
        "shortName": meta.get("shortName") or meta.get("longName") or symbol,
        "longName": meta.get("longName") or meta.get("shortName") or symbol,
        "regularMarketPrice": price,
        "regularMarketPreviousClose": prev,
        "regularMarketOpen": meta.get("regularMarketOpen"),
        "regularMarketChange": change,
        "regularMarketChangePercent": (change / prev * 100) if prev else 0.0,
        "regularMarketDayHigh": meta.get("regularMarketDayHigh"),
        "regularMarketDayLow": meta.get("regularMarketDayLow"),
        "regularMarketVolume": meta.get("regularMarketVolume"),
        "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
        "currency": meta.get("currency", "USD"),
        "quoteType": meta.get("instrumentType"),
    }

async def _quote_one(symbol: str) -> Optional[dict]:
    now = time.time()
    cached = _quote_cache.get(symbol)
    if cached and now - cached[0] < QUOTE_TTL:
        return cached[1]
    try:
        chart = await yf_chart(symbol, "1d", "5m")
    except HTTPException:
        return cached[1] if cached else None
    q = _quote_from_meta(symbol, chart.get("meta") or {})
    if chart["candles"]:
        if q["regularMarketPrice"] is None:
            q["regularMarketPrice"] = chart["candles"][-1]["c"]
        if q["regularMarketOpen"] is None:
            q["regularMarketOpen"] = chart["candles"][0]["o"]
    _quote_cache[symbol] = (now, q)
    return q

async def yf_quote(symbols: List[str]) -> List[dict]:
    if not symbols:
        return []
    uniq = list(dict.fromkeys(s for s in symbols if s))
    results = await asyncio.gather(*(_quote_one(s) for s in uniq))
    return [q for q in results if q]

async def yf_chart(symbol: str, range_: str = "1d", interval: str = "5m") -> dict:
    key = (symbol, range_, interval)
    now = time.time()
    cached = _chart_cache.get(key)
    if cached and now - cached[0] < CHART_TTL:
        return cached[1]
    j = await _yf_get(f"/v8/finance/chart/{symbol}?range={range_}&interval={interval}")
    if j is None:
        if cached:
            return cached[1]
        raise HTTPException(503, "Market data temporarily unavailable, retrying shortly")
    result = (j.get("chart") or {}).get("result") or []
    if not result:
        raise HTTPException(404, "Symbol not found")
    res = result[0]
    ts = res.get("timestamp") or []
    ind = ((res.get("indicators") or {}).get("quote") or [{}])[0]
    opens = ind.get("open") or []
    highs = ind.get("high") or []
    lows = ind.get("low") or []
    closes = ind.get("close") or []
    vols = ind.get("volume") or []
    candles = []
    for i, t in enumerate(ts):
        if i < len(closes) and closes[i] is not None:
            candles.append({
                "t": t, "o": opens[i], "h": highs[i], "l": lows[i], "c": closes[i], "v": vols[i] if i < len(vols) else 0
            })
    payload = {"meta": res.get("meta", {}), "candles": candles}
    _chart_cache[key] = (now, payload)
    return payload

async def yf_search(query: str) -> List[dict]:
    j = await _yf_get(f"/v1/finance/search?q={query}&quotesCount=15&newsCount=0")
    return (j or {}).get("quotes", [])

# ---------- Startup: seed admin + indexes ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.orders.create_index([("user_id", 1), ("created_at", -1)])
    await db.positions.create_index([("user_id", 1), ("symbol", 1)], unique=True)
    await db.watchlist.create_index([("user_id", 1), ("symbol", 1)], unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@apextrade.com")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_pw),
            "name": "Admin", "role": "admin",
            "cash_balance": 100000.0, "starting_balance": 100000.0,
            "created_at": datetime.now(timezone.utc),
        })
        log.info("Seeded admin user %s", admin_email)
    elif not verify_password(admin_pw, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_pw)}})

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------- Auth Endpoints ----------
def set_auth_cookie(response: Response, token: str):
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=60*60*24*7, path="/")

def user_public(u: dict) -> dict:
    return {"id": u.get("id") or str(u.get("_id")), "email": u["email"], "name": u.get("name", ""),
            "role": u.get("role", "user"), "cash_balance": u.get("cash_balance", 0.0),
            "picture": u.get("picture"),
            "starting_balance": u.get("starting_balance", 100000.0),
            "entitlements": entitlements(u)}

@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {
        "email": email, "password_hash": hash_password(body.password),
        "name": body.name, "role": "user",
        "cash_balance": float(body.starting_balance),
        "starting_balance": float(body.starting_balance),
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    doc["id"] = uid
    return {"user": user_public(doc), "token": token}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    user["id"] = uid
    return {"user": user_public(user), "token": token}

@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}

class GoogleSessionIn(BaseModel):
    session_id: str

@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    # Exchange Emergent Auth session_id for user profile (must be done server-side)
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired Google session")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email})
    if user:
        updates = {"picture": data.get("picture")}
        if not user.get("name") and data.get("name"):
            updates["name"] = data["name"]
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)
    else:
        user = {
            "email": email, "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"), "role": "user", "auth_provider": "google",
            "cash_balance": 100000.0, "starting_balance": 100000.0,
            "created_at": datetime.now(timezone.utc),
        }
        res = await db.users.insert_one(user)
        user["_id"] = res.inserted_id
    uid = str(user["_id"])
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": uid, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", max_age=60*60*24*7, path="/")
    user["id"] = uid
    return {"user": user_public(user), "token": session_token}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    last = user.get("last_stripe_sync")
    if last is not None and not isinstance(last, datetime):
        last = None
    if last is None or (datetime.now(timezone.utc) - last.replace(tzinfo=timezone.utc)) > timedelta(hours=6):
        asyncio.create_task(_safe_sync(user))
    return user_public(user)

async def _safe_sync(user: dict):
    try:
        await sync_live_for_user(db, user)
    except Exception as e:
        log.warning("live stripe sync failed for %s: %s", user["email"], e)

class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)

@api.patch("/auth/profile")
async def update_profile(body: ProfileIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"name": body.name.strip()}})
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    return user_public(doc)

# ---------- Market Endpoints ----------
@api.get("/market/quote")
async def quote(symbols: str, asset_type: str = "stock"):
    syms = [_normalize_symbol(s, asset_type) for s in symbols.split(",") if s]
    data = await yf_quote(syms)
    return {"quotes": data}

@api.get("/market/chart/{symbol}")
async def chart(symbol: str, range: str = "1d", interval: str = "5m", asset_type: str = "stock"):
    s = _normalize_symbol(symbol, asset_type)
    return await yf_chart(s, range, interval)

@api.get("/market/search")
async def search(q: str):
    return {"results": await yf_search(q)}

CURATED = {
    "stock": [
        ("AAPL", "Apple Inc."), ("MSFT", "Microsoft Corp."), ("GOOGL", "Alphabet Inc."),
        ("AMZN", "Amazon.com Inc."), ("NVDA", "NVIDIA Corp."), ("META", "Meta Platforms"),
        ("TSLA", "Tesla Inc."), ("NFLX", "Netflix Inc."), ("AMD", "Advanced Micro Devices"),
        ("JPM", "JPMorgan Chase"), ("V", "Visa Inc."), ("DIS", "Walt Disney"),
    ],
    "crypto": [
        ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("SOL-USD", "Solana"),
        ("BNB-USD", "BNB"), ("XRP-USD", "XRP"), ("ADA-USD", "Cardano"),
        ("DOGE-USD", "Dogecoin"), ("AVAX-USD", "Avalanche"),
    ],
    "etf": [
        ("SPY", "SPDR S&P 500 ETF"), ("QQQ", "Invesco QQQ Trust"), ("IWM", "iShares Russell 2000"),
        ("DIA", "SPDR Dow Jones"), ("VOO", "Vanguard S&P 500"), ("VTI", "Vanguard Total Stock"),
        ("ARKK", "ARK Innovation ETF"), ("GLD", "SPDR Gold Trust"),
    ],
}

@api.get("/market/curated")
async def curated(asset_type: str = "stock"):
    items = CURATED.get(asset_type, [])
    syms = [s for s, _ in items]
    quotes = await yf_quote(syms)
    by_sym = {q.get("symbol"): q for q in quotes}
    out = []
    for sym, name in items:
        q = by_sym.get(sym, {})
        out.append({
            "symbol": sym, "name": name, "asset_type": asset_type,
            "price": q.get("regularMarketPrice"),
            "change": q.get("regularMarketChange"),
            "change_percent": q.get("regularMarketChangePercent"),
            "volume": q.get("regularMarketVolume"),
            "high": q.get("regularMarketDayHigh"),
            "low": q.get("regularMarketDayLow"),
        })
    return {"items": out}

@api.get("/market/ticker")
async def ticker():
    """Ticker tape: mixed feed of top items."""
    syms = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL",
            "SPY", "QQQ", "BTC-USD", "ETH-USD", "SOL-USD"]
    quotes = await yf_quote(syms)
    out = []
    for q in quotes:
        out.append({
            "symbol": q.get("symbol"),
            "price": q.get("regularMarketPrice"),
            "change_percent": q.get("regularMarketChangePercent"),
        })
    return {"items": out}

# ---------- Portfolio / Orders ----------
async def _current_price(symbol: str, asset_type: str) -> float:
    s = _normalize_symbol(symbol, asset_type)
    quotes = await yf_quote([s])
    if not quotes or quotes[0].get("regularMarketPrice") is None:
        raise HTTPException(400, "Unable to fetch market price")
    return float(quotes[0]["regularMarketPrice"])

def _serialize(doc: dict) -> dict:
    d = dict(doc)
    d["id"] = str(d.pop("_id"))
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d

@api.get("/portfolio")
async def get_portfolio(user: dict = Depends(get_current_user)):
    uid = user["id"]
    positions_cursor = db.positions.find({"user_id": uid})
    positions = []
    total_value = 0.0
    total_cost = 0.0
    async for p in positions_cursor:
        prev_close = None
        try:
            price = await _current_price(p["symbol"], p.get("asset_type", "stock"))
            q = _quote_cache.get(_normalize_symbol(p["symbol"], p.get("asset_type", "stock")))
            prev_close = q[1].get("regularMarketPreviousClose") if q else None
        except Exception:
            price = p.get("avg_price", 0.0)
        qty = p["quantity"]
        cost = qty * p["avg_price"]
        mv = qty * price
        pl = mv - cost
        pl_pct = (pl / cost * 100) if cost > 0 else 0.0
        total_value += mv
        total_cost += cost
        positions.append({
            "id": str(p["_id"]), "symbol": p["symbol"],
            "asset_type": p.get("asset_type", "stock"),
            "name": p.get("name", p["symbol"]),
            "quantity": qty, "avg_price": p["avg_price"],
            "current_price": price, "market_value": mv,
            "cost_basis": cost, "unrealized_pl": pl,
            "unrealized_pl_pct": pl_pct, "prev_close": prev_close,
        })
    user_doc = await db.users.find_one({"_id": ObjectId(uid)})
    cash = user_doc.get("cash_balance", 0.0)
    starting = user_doc.get("starting_balance", 100000.0)
    equity = cash + total_value
    total_pl = equity - starting
    total_pl_pct = (total_pl / starting * 100) if starting > 0 else 0.0
    asyncio.create_task(_snapshot(uid, equity, cash))
    return {
        "cash_balance": cash,
        "starting_balance": starting,
        "positions_value": total_value,
        "equity": equity,
        "unrealized_pl": total_value - total_cost,
        "total_pl": total_pl,
        "total_pl_pct": total_pl_pct,
        "day_pl": sum(_day_pl(p) for p in positions),
        "positions": positions,
    }

def _day_pl(pos: dict) -> float:
    prev = pos.get("prev_close")
    return (pos["current_price"] - prev) * pos["quantity"] if prev else 0.0

async def _snapshot(uid: str, equity: float, cash: float):
    # One point per user per hour; enough for a smooth equity curve
    bucket = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    await db.portfolio_snapshots.update_one(
        {"user_id": uid, "t": bucket},
        {"$set": {"equity": equity, "cash": cash}}, upsert=True)

@api.get("/portfolio/history")
async def portfolio_history(user: dict = Depends(get_current_user)):
    cur = db.portfolio_snapshots.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("t", 1).limit(2000)
    points = [{"t": s["t"].isoformat(), "equity": s["equity"], "cash": s.get("cash")} async for s in cur]
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    created = doc.get("created_at")
    if created and (not points or points[0]["equity"] != doc.get("starting_balance")):
        points.insert(0, {"t": created.isoformat() if isinstance(created, datetime) else created,
                          "equity": doc.get("starting_balance", 100000.0), "cash": doc.get("starting_balance", 100000.0)})
    return {"points": points}

@api.get("/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user)):
    users = [u async for u in db.users.find({}, {"name": 1, "email": 1, "cash_balance": 1, "starting_balance": 1, "picture": 1, "limits_removed": 1, "pro_until": 1})]
    positions = [p async for p in db.positions.find({}, {"user_id": 1, "symbol": 1, "asset_type": 1, "quantity": 1, "avg_price": 1})]
    syms = list({_normalize_symbol(p["symbol"], p.get("asset_type", "stock")) for p in positions})
    quotes = {q["symbol"]: q.get("regularMarketPrice") for q in await yf_quote(syms)} if syms else {}
    value_by_user = {}
    for p in positions:
        price = quotes.get(_normalize_symbol(p["symbol"], p.get("asset_type", "stock"))) or p["avg_price"]
        value_by_user[p["user_id"]] = value_by_user.get(p["user_id"], 0.0) + price * p["quantity"]
    rows = []
    for u in users:
        uid = str(u["_id"])
        starting = u.get("starting_balance") or 100000.0
        equity = u.get("cash_balance", 0.0) + value_by_user.get(uid, 0.0)
        rows.append({"user_id": uid, "name": u.get("name") or u["email"].split("@")[0], "picture": u.get("picture"),
                     "equity": equity, "roi_pct": (equity - starting) / starting * 100,
                     "pro": bool(u.get("limits_removed")) or bool(entitlements(u)["is_pro"]),
                     "positions": sum(1 for p in positions if p["user_id"] == uid), "is_me": uid == user["id"]})
    rows.sort(key=lambda r: r["roi_pct"], reverse=True)
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    me = next((r for r in rows if r["is_me"]), None)
    return {"items": rows[:50], "me": me, "total": len(rows)}

@api.get("/market/movers")
async def movers():
    items = [(s, n, t) for t, lst in CURATED.items() for s, n in lst]
    quotes = {q["symbol"]: q for q in await yf_quote([s for s, _, _ in items])}
    rows = []
    for s, n, t in items:
        q = quotes.get(s)
        if q and q.get("regularMarketChangePercent") is not None:
            rows.append({"symbol": s, "name": n, "asset_type": t, "price": q["regularMarketPrice"],
                         "change_percent": q["regularMarketChangePercent"]})
    rows.sort(key=lambda r: r["change_percent"], reverse=True)
    return {"gainers": rows[:6], "losers": list(reversed(rows[-6:]))}

@api.post("/portfolio/reset")
async def reset_portfolio(body: ResetIn, user: dict = Depends(get_current_user)):
    uid = user["id"]
    ent = entitlements(user)
    if not ent["unlimited"] and ent["resets_used"] >= FREE_RESET_MAX:
        raise HTTPException(402, f"Free plan allows {FREE_RESET_MAX} portfolio resets. Upgrade to Pro for unlimited resets.")
    await db.positions.delete_many({"user_id": uid})
    await db.orders.delete_many({"user_id": uid})
    await db.users.update_one(
        {"_id": ObjectId(uid)},
        {"$set": {"cash_balance": float(body.new_balance),
                  "starting_balance": float(body.new_balance)},
         "$inc": {"reset_count": 1}}
    )
    return {"ok": True, "new_balance": body.new_balance}

@api.post("/portfolio/deposit")
async def deposit(body: DepositIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$inc": {"cash_balance": float(body.amount),
                  "starting_balance": float(body.amount)}}
    )
    return {"ok": True}

@api.post("/orders")
async def create_order(body: OrderIn, user: dict = Depends(get_current_user)):
    uid = user["id"]
    symbol = body.symbol.upper()
    normalized = _normalize_symbol(symbol, body.asset_type)
    price = await _current_price(symbol, body.asset_type)
    exec_price = price
    status = "filled"
    if body.order_type == "limit" and body.limit_price:
        if body.side == "buy" and price > body.limit_price:
            status = "open"
        elif body.side == "sell" and price < body.limit_price:
            status = "open"
        else:
            exec_price = body.limit_price

    total = body.quantity * exec_price
    user_doc = await db.users.find_one({"_id": ObjectId(uid)})
    if status == "filled":
        if body.side == "buy":
            if user_doc.get("cash_balance", 0) < total:
                raise HTTPException(400, "Insufficient cash balance")
            await db.users.update_one({"_id": ObjectId(uid)},
                                      {"$inc": {"cash_balance": -total}})
            pos = await db.positions.find_one({"user_id": uid, "symbol": normalized})
            if pos:
                new_qty = pos["quantity"] + body.quantity
                new_avg = (pos["quantity"] * pos["avg_price"] + total) / new_qty
                await db.positions.update_one({"_id": pos["_id"]},
                    {"$set": {"quantity": new_qty, "avg_price": new_avg}})
            else:
                await db.positions.insert_one({
                    "user_id": uid, "symbol": normalized,
                    "asset_type": body.asset_type,
                    "quantity": body.quantity, "avg_price": exec_price,
                    "created_at": datetime.now(timezone.utc),
                })
        else:  # sell
            pos = await db.positions.find_one({"user_id": uid, "symbol": normalized})
            if not pos or pos["quantity"] < body.quantity:
                raise HTTPException(400, "Insufficient position quantity")
            await db.users.update_one({"_id": ObjectId(uid)},
                                      {"$inc": {"cash_balance": total}})
            new_qty = pos["quantity"] - body.quantity
            if new_qty <= 1e-9:
                await db.positions.delete_one({"_id": pos["_id"]})
            else:
                await db.positions.update_one({"_id": pos["_id"]},
                                              {"$set": {"quantity": new_qty}})

    order_doc = {
        "user_id": uid, "symbol": normalized, "asset_type": body.asset_type,
        "side": body.side, "order_type": body.order_type,
        "quantity": body.quantity, "limit_price": body.limit_price,
        "exec_price": exec_price if status == "filled" else None,
        "total": total if status == "filled" else None,
        "status": status,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.orders.insert_one(order_doc)
    order_doc["_id"] = res.inserted_id
    return _serialize(order_doc)

@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user), status: Optional[str] = None):
    q = {"user_id": user["id"]}
    if status:
        q["status"] = status
    cursor = db.orders.find(q).sort("created_at", -1).limit(200)
    return [_serialize(o) async for o in cursor]

@api.delete("/orders/{oid}")
async def cancel_order(oid: str, user: dict = Depends(get_current_user)):
    res = await db.orders.update_one(
        {"_id": ObjectId(oid), "user_id": user["id"], "status": "open"},
        {"$set": {"status": "cancelled"}}
    )
    if res.modified_count == 0:
        raise HTTPException(404, "Order not found or not cancellable")
    return {"ok": True}

# ---------- Watchlist ----------
@api.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    items = [_serialize(w) async for w in db.watchlist.find({"user_id": user["id"]})]
    if not items:
        return {"items": [], "quotes": []}
    syms = [w["symbol"] for w in items]
    quotes = await yf_quote(syms)
    by_sym = {q.get("symbol"): q for q in quotes}
    for w in items:
        q = by_sym.get(w["symbol"], {})
        w["price"] = q.get("regularMarketPrice")
        w["change_percent"] = q.get("regularMarketChangePercent")
    return {"items": items}

@api.post("/watchlist")
async def add_watch(body: WatchIn, user: dict = Depends(get_current_user)):
    normalized = _normalize_symbol(body.symbol, body.asset_type)
    ent = entitlements(user)
    if not ent["unlimited"]:
        count = await db.watchlist.count_documents({"user_id": user["id"]})
        exists = await db.watchlist.find_one({"user_id": user["id"], "symbol": normalized})
        if count >= FREE_WATCHLIST_MAX and not exists:
            raise HTTPException(402, f"Free plan watchlist is limited to {FREE_WATCHLIST_MAX} symbols. Upgrade to Pro for unlimited.")
    try:
        await db.watchlist.insert_one({
            "user_id": user["id"], "symbol": normalized,
            "asset_type": body.asset_type, "name": body.name or normalized,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass
    return {"ok": True}

@api.delete("/watchlist/{symbol}")
async def remove_watch(symbol: str, user: dict = Depends(get_current_user)):
    await db.watchlist.delete_one({"user_id": user["id"], "symbol": symbol.upper()})
    return {"ok": True}

@api.get("/")
async def root():
    return {"service": "ApexTrade Pro API", "status": "ok"}

app.include_router(api)
app.include_router(make_payments_router(db, get_current_user))
app.include_router(make_webhook_router(db))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)

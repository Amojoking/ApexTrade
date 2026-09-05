import os
import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import stripe
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("apextrade.payments")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_LIVE_WEBHOOK_SECRET = os.environ.get("STRIPE_LIVE_WEBHOOK_SECRET", "")
_live_key = os.environ.get("STRIPE_LIVE_RESTRICTED_KEY")
live = stripe.StripeClient(_live_key) if _live_key else None

PLANS = {
    "pro_monthly": {"title": "Pro Monthly", "grant": "pro", "days": 31},
    "pro_yearly": {"title": "Pro Yearly", "grant": "pro", "days": 366},
    "unlimited_lifetime": {"title": "Unlimited (Lifetime)", "grant": "unlimited"},
}
FREE_WATCHLIST_MAX = 5
FREE_RESET_MAX = 3
GRACE = timedelta(days=3)
_links_cache = {"ts": 0, "data": {}}


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def _ts(v):
    return datetime.fromtimestamp(v, tz=timezone.utc) if v else None


def entitlements(user: dict) -> dict:
    pro_until = _aware(user.get("pro_until"))
    is_pro = bool(pro_until and pro_until > _now())
    unlimited = bool(user.get("limits_removed")) or is_pro
    return {
        "is_pro": is_pro, "pro_until": pro_until.isoformat() if pro_until else None,
        "limits_removed": bool(user.get("limits_removed")), "unlimited": unlimited,
        "watchlist_max": None if unlimited else FREE_WATCHLIST_MAX,
        "resets_max": None if unlimited else FREE_RESET_MAX,
        "resets_used": int(user.get("reset_count", 0)),
        "subscription_status": user.get("stripe_subscription_status"),
        "cancel_at_period_end": bool(user.get("stripe_cancel_at_period_end")),
    }


class CheckoutRequest(BaseModel):
    lookup_key: str
    origin_url: str
    quantity: int = Field(1, ge=1, le=1)


# ---------- Live account (user's own Stripe, restricted key) ----------
async def live_links() -> dict:
    if not live:
        return {}
    if time.time() - _links_cache["ts"] < 600 and _links_cache["data"]:
        return _links_cache["data"]
    try:
        links = await asyncio.to_thread(live.v1.payment_links.list, {"active": True, "limit": 20, "expand": ["data.line_items"]})
    except stripe.error.StripeError as e:
        log.warning("live payment_links.list failed: %s", e)
        return _links_cache["data"]
    out = {}
    for pl in links.data:
        items = pl.line_items.data if pl.line_items else []
        if not items:
            continue
        price = items[0].price
        key = _lookup_for_price(price)
        if key in PLANS and key not in out:
            out[key] = {"url": pl.url, "plink_id": pl.id, "price_id": price.id, "amount": price.unit_amount / 100,
                        "currency": price.currency, "interval": price.recurring.interval if price.recurring else None}
    _links_cache.update(ts=time.time(), data=out)
    return out


def _lookup_for_price(price) -> Optional[str]:
    if price is None:
        return None
    if price.lookup_key in PLANS:
        return price.lookup_key
    if price.recurring:
        return "pro_monthly" if price.recurring.interval == "month" else "pro_yearly"
    return "unlimited_lifetime"


def _sub_period_end(sub) -> Optional[datetime]:
    end = getattr(sub, "current_period_end", None)
    if not end and getattr(sub, "items", None) and sub.items.data:
        end = getattr(sub.items.data[0], "current_period_end", None)
    return _ts(end)


async def apply_subscription(db, user_id: str, sub):
    active = sub.status in ("active", "trialing", "past_due")
    end = _sub_period_end(sub)
    update = {"stripe_subscription_status": sub.status, "stripe_live_subscription_id": sub.id,
              "stripe_live_customer_id": sub.customer if isinstance(sub.customer, str) else sub.customer.id,
              "stripe_cancel_at_period_end": bool(getattr(sub, "cancel_at_period_end", False))}
    if active and end:
        update["plan"] = "pro"
        update["pro_until"] = end + GRACE
    elif not active:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        cur = _aware(user.get("pro_until")) if user else None
        if cur and cur > _now() and user.get("stripe_live_subscription_id") == sub.id:
            update["pro_until"] = _now()
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})


async def _user_id_for_session(db, s) -> Optional[str]:
    if s.client_reference_id and ObjectId.is_valid(s.client_reference_id):
        if await db.users.find_one({"_id": ObjectId(s.client_reference_id)}, {"_id": 1}):
            return s.client_reference_id
    email = (s.customer_details.email if s.customer_details else None) or s.customer_email
    if email:
        u = await db.users.find_one({"email": email.lower()}, {"_id": 1})
        if u:
            return str(u["_id"])
    return None


async def record_live_session(db, s, user_id: Optional[str] = None) -> Optional[dict]:
    """Upsert a paid live Checkout Session into payment_transactions and grant entitlement."""
    if s.payment_status != "paid" and s.status != "complete":
        return None
    items = s.line_items.data if getattr(s, "line_items", None) else []
    if not items:
        items = (await asyncio.to_thread(live.v1.checkout.sessions.line_items.list, s.id)).data
    price = items[0].price if items else None
    lookup_key = _lookup_for_price(price)
    uid = user_id or await _user_id_for_session(db, s)
    if not uid or lookup_key not in PLANS:
        log.warning("live session %s: cannot map (uid=%s key=%s)", s.id, uid, lookup_key)
        return None
    tx = db.payment_transactions
    existing = await tx.find_one({"session_id": s.id})
    if not existing:
        await tx.insert_one({
            "session_id": s.id, "user_id": uid, "lookup_key": lookup_key, "live": True,
            "amount": (s.amount_total or 0) / 100, "currency": s.currency,
            "status": "completed", "payment_status": "paid", "fulfilled": False,
            "stripe_subscription_id": s.subscription, "stripe_payment_intent_id": s.payment_intent,
            "stripe_customer_id": s.customer, "created_at": _ts(s.created) or _now(), "updated_at": _now(),
        })
    if s.subscription:
        sub = await asyncio.to_thread(live.v1.subscriptions.retrieve, s.subscription)
        await apply_subscription(db, uid, sub)
        await tx.update_one({"session_id": s.id}, {"$set": {"fulfilled": True, "fulfilled_at": _now()}})
    else:
        await _fulfill_via(db, s.id)
    return await tx.find_one({"session_id": s.id}, {"_id": 0})


async def sync_live_for_user(db, user: dict) -> dict:
    if not live:
        return {"synced": False}
    email = user["email"]
    uid = user["id"]
    customers = (await asyncio.to_thread(live.v1.customers.list, {"email": email, "limit": 10})).data
    for c in customers:
        subs = (await asyncio.to_thread(live.v1.subscriptions.list, {"customer": c.id, "status": "all", "limit": 10})).data
        for sub in sorted(subs, key=lambda x: x.created):
            await apply_subscription(db, uid, sub)
    sessions = (await asyncio.to_thread(live.v1.checkout.sessions.list,
                                        {"customer_details": {"email": email}, "status": "complete", "limit": 20,
                                         "expand": ["data.line_items"]})).data
    for s in sessions:
        await record_live_session(db, s, uid)
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"last_stripe_sync": _now()}})
    return {"synced": True, "customers": len(customers), "sessions": len(sessions)}


def make_router(db, get_current_user) -> APIRouter:
    r = APIRouter(prefix="/api/payments")
    tx = db.payment_transactions

    async def mark_paid(session_id: str, s):
        await tx.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": "paid",
                      "stripe_subscription_id": s.get("subscription"),
                      "stripe_payment_intent_id": s.get("payment_intent"), "updated_at": _now()}},
        )
        await _fulfill_via(db, session_id)

    @r.get("/plans")
    async def plans():
        links = await live_links()
        out = []
        for key, meta in PLANS.items():
            if key in links:
                p = links[key]
                out.append({"lookup_key": key, "title": meta["title"], "amount": p["amount"], "currency": p["currency"],
                            "interval": p["interval"], "live": True})
                continue
            prices = (await asyncio.to_thread(stripe.Price.list, lookup_keys=[key], active=True, limit=1)).data
            if not prices:
                continue
            p = prices[0]
            out.append({"lookup_key": key, "title": meta["title"], "amount": p.unit_amount / 100,
                        "currency": p.currency, "interval": p.recurring.interval if p.recurring else None, "live": False})
        return {"plans": out}

    @r.post("/checkout")
    async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
        if req.lookup_key not in PLANS:
            raise HTTPException(400, "Unknown plan")
        links = await live_links()
        if req.lookup_key in links:
            qs = urlencode({"client_reference_id": user["id"], "prefilled_email": user["email"]})
            await tx.insert_one({"user_id": user["id"], "lookup_key": req.lookup_key, "live": True,
                                 "status": "link_redirect", "payment_status": "pending", "created_at": _now(), "updated_at": _now()})
            return {"checkout_url": f"{links[req.lookup_key]['url']}?{qs}", "session_id": None, "live": True}
        prices = (await asyncio.to_thread(stripe.Price.list, lookup_keys=[req.lookup_key], active=True, limit=1)).data
        if not prices:
            raise HTTPException(500, f"Price not found: {req.lookup_key}")
        price = prices[0]
        kwargs = dict(
            line_items=[{"price": price.id, "quantity": 1}],
            mode="subscription" if price.recurring else "payment",
            success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{req.origin_url}/payment/cancel",
            customer_email=user["email"],
            metadata={"user_id": user["id"], "lookup_key": req.lookup_key},
        )
        session = None
        attempts = [
            dict(payment_method_types=["card", "crypto"], automatic_tax={"enabled": True}, billing_address_collection="required"),
            dict(managed_payments={"enabled": True}),
            dict(automatic_tax={"enabled": True}, billing_address_collection="required"),
            dict(),
        ]
        last_err = None
        for extra in attempts:
            try:
                session = await asyncio.to_thread(stripe.checkout.Session.create, **kwargs, **extra)
                break
            except stripe.error.InvalidRequestError as e:
                last_err = e
                log.warning("Checkout attempt failed (%s): %s", list(extra.keys()), e.user_message)
        if not session:
            raise HTTPException(502, f"Stripe error: {getattr(last_err, 'user_message', 'unknown')}")
        await tx.insert_one({
            "session_id": session.id, "user_id": user["id"], "lookup_key": req.lookup_key, "live": False,
            "amount": (price.unit_amount or 0) / 100, "currency": price.currency,
            "status": "initiated", "payment_status": "pending", "fulfilled": False,
            "created_at": _now(), "updated_at": _now(),
        })
        return {"checkout_url": session.url, "session_id": session.id, "live": False}

    @r.get("/status/{session_id}")
    async def get_status(session_id: str):
        rec = await tx.find_one({"session_id": session_id})
        if session_id.startswith("cs_live_") and live and (not rec or not rec.get("fulfilled")):
            try:
                s = await asyncio.to_thread(live.v1.checkout.sessions.retrieve, session_id, {"expand": ["line_items"]})
            except stripe.error.StripeError:
                raise HTTPException(404, "Transaction not found")
            rec = await record_live_session(db, s) or rec
            if not rec:
                return {"session_id": session_id, "status": s.status, "payment_status": s.payment_status, "lookup_key": None}
        if not rec:
            raise HTTPException(404, "Transaction not found")
        if not rec.get("live") and rec.get("payment_status") != "paid":
            try:
                s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
                if s.payment_status == "paid" or s.status == "complete":
                    await mark_paid(session_id, s)
                    rec = await tx.find_one({"session_id": session_id})
            except stripe.error.StripeError:
                pass
        elif not rec.get("fulfilled"):
            await _fulfill_via(db, session_id)
        return {"session_id": rec["session_id"], "status": rec["status"],
                "payment_status": rec["payment_status"], "lookup_key": rec.get("lookup_key")}

    @r.post("/sync")
    async def sync(user: dict = Depends(get_current_user)):
        try:
            return await sync_live_for_user(db, user)
        except stripe.error.StripeError as e:
            raise HTTPException(502, f"Stripe error: {e.user_message or str(e)}")

    @r.get("/billing")
    async def billing(user: dict = Depends(get_current_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["id"])})
        cur = tx.find({"user_id": user["id"], "payment_status": "paid"}, {"_id": 0}).sort("created_at", -1).limit(20)
        items = [x async for x in cur]
        for it in items:
            for k in ("created_at", "updated_at", "fulfilled_at"):
                if isinstance(it.get(k), datetime):
                    it[k] = it[k].isoformat()
        return {"entitlements": entitlements(doc), "history": items,
                "subscription": {"status": doc.get("stripe_subscription_status"),
                                 "cancel_at_period_end": bool(doc.get("stripe_cancel_at_period_end")),
                                 "id": doc.get("stripe_live_subscription_id")},
                "last_sync": doc["last_stripe_sync"].isoformat() if isinstance(doc.get("last_stripe_sync"), datetime) else None,
                "live_enabled": live is not None}

    @r.get("/history")
    async def history(user: dict = Depends(get_current_user)):
        cur = tx.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(20)
        return {"items": [x async for x in cur]}

    return r


def make_webhook_router(db) -> APIRouter:
    w = APIRouter()
    tx = db.payment_transactions

    @w.post("/api/stripe/webhook")
    async def stripe_webhook(request: Request):
        payload = await request.body()
        sig = request.headers.get("stripe-signature", "")
        try:
            event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            raise HTTPException(400, "Invalid signature")
        obj, t = event["data"]["object"], event["type"]
        if t == "checkout.session.completed":
            await tx.update_one(
                {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                          "stripe_subscription_id": obj.get("subscription"),
                          "stripe_payment_intent_id": obj.get("payment_intent"), "updated_at": _now()}},
            )
            rec = await tx.find_one({"session_id": obj["id"]})
            if rec and rec.get("payment_status") == "paid" and not rec.get("fulfilled"):
                await _fulfill_via(db, obj["id"])
        elif t == "checkout.session.async_payment_succeeded":
            await tx.update_one({"session_id": obj["id"]}, {"$set": {"payment_status": "paid", "updated_at": _now()}})
            await _fulfill_via(db, obj["id"])
        elif t == "checkout.session.async_payment_failed":
            await tx.update_one({"session_id": obj["id"]}, {"$set": {"status": "failed", "payment_status": "failed", "updated_at": _now()}})
        elif t == "checkout.session.expired":
            await tx.update_one({"session_id": obj["id"]}, {"$set": {"status": "expired", "payment_status": "expired", "updated_at": _now()}})
        elif t == "charge.refunded":
            await tx.update_one({"stripe_payment_intent_id": obj.get("payment_intent")},
                                {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": _now()}})
        return {"status": "ok"}

    @w.post("/api/stripe/live-webhook")
    async def stripe_live_webhook(request: Request):
        if not live or not STRIPE_LIVE_WEBHOOK_SECRET:
            raise HTTPException(404, "Live webhook not configured")
        payload = await request.body()
        sig = request.headers.get("stripe-signature", "")
        try:
            event = stripe.Webhook.construct_event(payload, sig, STRIPE_LIVE_WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            raise HTTPException(400, "Invalid signature")
        obj, t = event["data"]["object"], event["type"]
        if t in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            s = await asyncio.to_thread(live.v1.checkout.sessions.retrieve, obj["id"], {"expand": ["line_items"]})
            await record_live_session(db, s)
        elif t in ("customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.created"):
            sub = await asyncio.to_thread(live.v1.subscriptions.retrieve, obj["id"])
            cust_id = sub.customer if isinstance(sub.customer, str) else sub.customer.id
            user = await db.users.find_one({"stripe_live_customer_id": cust_id}, {"_id": 1})
            if not user:
                c = await asyncio.to_thread(live.v1.customers.retrieve, cust_id)
                if c.email:
                    user = await db.users.find_one({"email": c.email.lower()}, {"_id": 1})
            if user:
                await apply_subscription(db, str(user["_id"]), sub)
        elif t == "charge.refunded":
            await tx.update_one({"stripe_payment_intent_id": obj.get("payment_intent")},
                                {"$set": {"status": "refunded", "payment_status": "refunded", "updated_at": _now()}})
        return {"status": "ok"}

    return w


async def _fulfill_via(db, session_id: str):
    tx = db.payment_transactions
    rec = await tx.find_one_and_update(
        {"session_id": session_id, "payment_status": "paid", "fulfilled": {"$ne": True}},
        {"$set": {"fulfilled": True, "fulfilled_at": _now()}},
    )
    if not rec or not rec.get("user_id"):
        return
    plan = PLANS.get(rec["lookup_key"])
    if not plan:
        return
    if plan["grant"] == "unlimited":
        update = {"$set": {"limits_removed": True}}
    else:
        user = await db.users.find_one({"_id": ObjectId(rec["user_id"])})
        base = _aware(user.get("pro_until")) if user else None
        start = base if base and base > _now() else _now()
        update = {"$set": {"plan": "pro", "pro_until": start + timedelta(days=plan["days"]),
                           "stripe_subscription_id": rec.get("stripe_subscription_id")}}
    await db.users.update_one({"_id": ObjectId(rec["user_id"])}, update)

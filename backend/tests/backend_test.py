"""ApexTrade Pro — iteration 2 backend tests: Stripe payments, entitlements/fulfilment,
free-tier limits (402), market-data regression, stripe webhook."""
import time

import pytest
import requests

from conftest import BASE_URL


# ---------------------------------------------------------------- payments: plans / checkout
class TestPaymentsPlansAndCheckout:
    def test_plans_returns_three(self, api):
        r = api.get(f"{BASE_URL}/api/payments/plans", timeout=60)
        assert r.status_code == 200, r.text[:300]
        plans = r.json()["plans"]
        keys = {p["lookup_key"] for p in plans}
        assert keys == {"pro_monthly", "pro_yearly", "unlimited_lifetime"}, keys
        by = {p["lookup_key"]: p for p in plans}
        assert by["pro_monthly"]["amount"] == 9.99
        assert by["pro_yearly"]["amount"] == 79
        assert by["unlimited_lifetime"]["amount"] == 49
        assert by["pro_monthly"]["interval"] == "month"
        assert by["pro_yearly"]["interval"] == "year"
        assert by["unlimited_lifetime"]["interval"] is None

    def test_checkout_unauthenticated_401(self, api):
        r = api.post(f"{BASE_URL}/api/payments/checkout",
                     json={"lookup_key": "pro_monthly", "origin_url": BASE_URL}, timeout=60)
        assert r.status_code == 401, f"{r.status_code} {r.text[:300]}"

    def test_checkout_unknown_lookup_key_400(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/payments/checkout",
                              json={"lookup_key": "bogus_plan", "origin_url": BASE_URL}, timeout=60)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"

    @pytest.mark.parametrize("key", ["pro_monthly", "pro_yearly", "unlimited_lifetime"])
    def test_checkout_creates_session_and_pending_tx(self, admin_client, mongo, key):
        r = admin_client.post(f"{BASE_URL}/api/payments/checkout",
                              json={"lookup_key": key, "origin_url": BASE_URL}, timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        data = r.json()
        assert data["checkout_url"].startswith("https://checkout.stripe.com"), data["checkout_url"]
        sid = data["session_id"]
        assert isinstance(sid, str) and sid.startswith("cs_")

        doc = mongo.payment_transactions.find_one({"session_id": sid})
        assert doc is not None, "payment_transactions doc not inserted"
        assert doc["payment_status"] == "pending"
        assert doc["status"] == "initiated"
        assert doc["lookup_key"] == key
        assert doc["fulfilled"] is False

        st = admin_client.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=60)
        assert st.status_code == 200, st.text[:300]
        sd = st.json()
        assert sd["payment_status"] == "pending"
        assert sd["session_id"] == sid
        assert sd["lookup_key"] == key
        assert "_id" not in sd

        mongo.payment_transactions.delete_one({"session_id": sid})

    def test_status_unknown_session_404(self, api):
        r = api.get(f"{BASE_URL}/api/payments/status/cs_test_doesnotexist_123", timeout=60)
        assert r.status_code == 404, f"{r.status_code} {r.text[:300]}"

    def test_history_requires_auth_and_returns_items(self, admin_client):
        assert requests.get(f"{BASE_URL}/api/payments/history", timeout=30).status_code == 401
        r = admin_client.get(f"{BASE_URL}/api/payments/history", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)


# ---------------------------------------------------------------- webhook
class TestStripeWebhook:
    def test_invalid_signature_400(self, api):
        r = requests.post(f"{BASE_URL}/api/stripe/webhook",
                          data=b'{"id":"evt_1","type":"checkout.session.completed"}',
                          headers={"stripe-signature": "t=1,v1=deadbeef", "Content-Type": "application/json"},
                          timeout=30)
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"


# ---------------------------------------------------------------- fulfilment simulation
class TestFulfilmentSimulation:
    def _paid(self, mongo, sid):
        mongo.payment_transactions.update_one(
            {"session_id": sid}, {"$set": {"payment_status": "paid", "status": "completed"}})

    def test_unlimited_lifetime_fulfilment_idempotent(self, fresh_user_factory, mongo):
        client, email = fresh_user_factory()
        r = client.post(f"{BASE_URL}/api/payments/checkout",
                        json={"lookup_key": "unlimited_lifetime", "origin_url": BASE_URL}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        sid = r.json()["session_id"]
        self._paid(mongo, sid)

        st = client.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=60)
        assert st.status_code == 200
        assert st.json()["payment_status"] == "paid"

        me = client.get(f"{BASE_URL}/api/auth/me", timeout=30).json()
        ent = me["entitlements"]
        assert ent["limits_removed"] is True
        assert ent["unlimited"] is True
        assert ent["watchlist_max"] is None and ent["resets_max"] is None

        # idempotency: repeat status call must not re-fulfil / duplicate
        doc_before = mongo.payment_transactions.find_one({"session_id": sid})
        for _ in range(2):
            assert client.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=30).json()["payment_status"] == "paid"
        doc_after = mongo.payment_transactions.find_one({"session_id": sid})
        assert doc_after["fulfilled"] is True
        assert doc_after["fulfilled_at"] == doc_before["fulfilled_at"], "fulfilment ran twice (not idempotent)"
        assert mongo.payment_transactions.count_documents({"session_id": sid}) == 1

    def test_pro_monthly_fulfilment_sets_pro_until(self, fresh_user_factory, mongo):
        client, email = fresh_user_factory()
        r = client.post(f"{BASE_URL}/api/payments/checkout",
                        json={"lookup_key": "pro_monthly", "origin_url": BASE_URL}, timeout=90)
        assert r.status_code == 200, r.text[:300]
        sid = r.json()["session_id"]
        self._paid(mongo, sid)
        assert client.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=60).json()["payment_status"] == "paid"

        ent = client.get(f"{BASE_URL}/api/auth/me", timeout=30).json()["entitlements"]
        assert ent["is_pro"] is True, ent
        assert ent["pro_until"], ent
        assert ent["unlimited"] is True
        from datetime import datetime, timezone
        until = datetime.fromisoformat(ent["pro_until"])
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        days = (until - datetime.now(timezone.utc)).days
        assert 29 <= days <= 32, f"pro_until ~31 days expected, got {days}"


# ---------------------------------------------------------------- free-tier limits
class TestFreeTierLimits:
    SYMS = ["AAPL", "MSFT", "TSLA", "AMZN", "GOOGL", "NVDA"]

    def test_watchlist_limit_402_and_duplicate_not_counted(self, fresh_user_factory, mongo):
        client, email = fresh_user_factory()
        for s in self.SYMS[:5]:
            r = client.post(f"{BASE_URL}/api/watchlist", json={"symbol": s}, timeout=60)
            assert r.status_code in (200, 201), f"{s}: {r.status_code} {r.text[:200]}"
        # duplicate does not count
        dup = client.post(f"{BASE_URL}/api/watchlist", json={"symbol": "AAPL"}, timeout=60)
        assert dup.status_code in (200, 201), f"duplicate rejected: {dup.status_code} {dup.text[:200]}"
        # 6th distinct -> 402
        r6 = client.post(f"{BASE_URL}/api/watchlist", json={"symbol": self.SYMS[5]}, timeout=60)
        assert r6.status_code == 402, f"{r6.status_code} {r6.text[:200]}"
        detail = r6.json().get("detail", "")
        assert "upgrade" in detail.lower(), detail

        # grant limits_removed -> succeeds
        mongo.users.update_one({"email": email}, {"$set": {"limits_removed": True}})
        r7 = client.post(f"{BASE_URL}/api/watchlist", json={"symbol": self.SYMS[5]}, timeout=60)
        assert r7.status_code in (200, 201), f"{r7.status_code} {r7.text[:200]}"

    def test_reset_limit_402_and_counter(self, fresh_user_factory, mongo):
        client, email = fresh_user_factory()
        for i in range(3):
            r = client.post(f"{BASE_URL}/api/portfolio/reset", json={"starting_balance": 100000}, timeout=60)
            assert r.status_code in (200, 201), f"reset {i+1}: {r.status_code} {r.text[:200]}"
            ent = client.get(f"{BASE_URL}/api/auth/me", timeout=30).json()["entitlements"]
            assert ent["resets_used"] == i + 1, ent
        r4 = client.post(f"{BASE_URL}/api/portfolio/reset", json={"starting_balance": 100000}, timeout=60)
        assert r4.status_code == 402, f"{r4.status_code} {r4.text[:200]}"
        assert "upgrade" in r4.json().get("detail", "").lower()

        mongo.users.update_one({"email": email}, {"$set": {"limits_removed": True}})
        r5 = client.post(f"{BASE_URL}/api/portfolio/reset", json={"starting_balance": 100000}, timeout=60)
        assert r5.status_code in (200, 201), f"{r5.status_code} {r5.text[:200]}"


# ---------------------------------------------------------------- market data regression
class TestMarketRegression:
    def test_quote(self, api):
        r = api.get(f"{BASE_URL}/api/market/quote?symbols=AAPL,BTC-USD", timeout=60)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        quotes = data.get("quotes", data)
        assert quotes, data
        items = quotes if isinstance(quotes, list) else list(quotes.values())
        assert len(items) >= 2
        for q in items:
            price = q.get("price") or q.get("regularMarketPrice") or 0
            assert float(price) > 0, q

    def test_ticker(self, api):
        r = api.get(f"{BASE_URL}/api/market/ticker", timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        items = body.get("items") or body.get("ticker") or body
        assert len(items) > 0

    def test_chart(self, api):
        r = api.get(f"{BASE_URL}/api/market/chart/AAPL?range=1d&interval=5m", timeout=60)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        candles = body.get("candles") or body.get("points") or body.get("data")
        assert candles and len(candles) > 3, str(body)[:300]
        c = candles[0]
        for f in ("o", "h", "l", "c"):
            assert f in c, f"chart point missing OHLC field {f}: {c}"
        assert c["h"] >= c["l"] > 0

    def test_search(self, api):
        r = api.get(f"{BASE_URL}/api/market/search?q=apple", timeout=60)
        assert r.status_code == 200, r.text[:300]
        res = r.json().get("results", r.json())
        assert any("AAPL" == (x.get("symbol") or "").upper() for x in res), str(res)[:300]

    def test_curated(self, api):
        r = api.get(f"{BASE_URL}/api/market/curated", timeout=60)
        assert r.status_code == 200, r.text[:300]
        assert r.json()


# ---------------------------------------------------------------- trading regression
class TestTradingRegression:
    def test_market_buy_decreases_cash(self, fresh_user_factory):
        client, _ = fresh_user_factory()
        before = client.get(f"{BASE_URL}/api/portfolio", timeout=60).json()
        cash_before = before.get("cash_balance", before.get("cash"))
        r = client.post(f"{BASE_URL}/api/orders",
                        json={"symbol": "AAPL", "side": "buy", "type": "market", "quantity": 2}, timeout=90)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
        time.sleep(1)
        after = client.get(f"{BASE_URL}/api/portfolio", timeout=60).json()
        cash_after = after.get("cash_balance", after.get("cash"))
        assert cash_after < cash_before, f"cash not reduced: {cash_before} -> {cash_after}"


# ---------------------------------------------------------------- google session regression
class TestGoogleSessionRegression:
    def test_seeded_session_token_works(self, mongo):
        from datetime import datetime, timedelta
        email = f"test_qa_google_{int(time.time())}@example.com"
        u = mongo.users.insert_one({
            "email": email, "name": "TEST QA Google", "picture": None, "role": "user",
            "auth_provider": "google", "cash_balance": 100000, "starting_balance": 100000,
            "created_at": datetime.utcnow()})
        token = f"test_session_{int(time.time())}"
        mongo.user_sessions.insert_one({"user_id": str(u.inserted_id), "session_token": token,
                                        "expires_at": datetime.utcnow() + timedelta(days=7),
                                        "created_at": datetime.utcnow()})
        try:
            r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
            assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
            assert r.json()["email"] == email
            r2 = requests.get(f"{BASE_URL}/api/auth/me", headers={"Cookie": f"session_token={token}"}, timeout=30)
            assert r2.status_code == 200, f"cookie auth failed: {r2.status_code}"
        finally:
            mongo.user_sessions.delete_many({"session_token": token})
            mongo.users.delete_one({"_id": u.inserted_id})

import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import stripe
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

log = logging.getLogger("apextrade.payments")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

PLANS = {
    "pro_monthly": {"title": "Pro Monthly", "grant": "pro", "days": 31},
    "pro_yearly": {"title": "Pro Yearly", "grant": "pro", "days": 366},
    "unlimited_lifetime": {"title": "Unlimited (Lifetime)", "grant": "unlimited"},
}
FREE_WATCHLIST_MAX = 5
FREE_RESET_MAX = 3


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


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
    }


class CheckoutRequest(BaseModel):
    lookup_key: str
    origin_url: str
    quantity: int = Field(1, ge=1, le=1)


def make_router(db, get_current_user) -> APIRouter:
    r = APIRouter(prefix="/api/payments")
    tx = db.payment_transactions

    async def fulfill(session_id: str):
        await _fulfill_via(db, session_id)

    async def mark_paid(session_id: str, s):
        await tx.update_one(
            {"session_id": session_id, "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": "paid",
                      "stripe_subscription_id": s.get("subscription"),
                      "stripe_payment_intent_id": s.get("payment_intent"), "updated_at": _now()}},
        )
        await fulfill(session_id)

    @r.get("/plans")
    async def plans():
        out = []
        for key, meta in PLANS.items():
            prices = (await asyncio.to_thread(stripe.Price.list, lookup_keys=[key], active=True, limit=1)).data
            if not prices:
                continue
            p = prices[0]
            out.append({"lookup_key": key, "title": meta["title"], "amount": p.unit_amount / 100,
                        "currency": p.currency, "interval": p.recurring.interval if p.recurring else None})
        return {"plans": out}

    @r.post("/checkout")
    async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
        if req.lookup_key not in PLANS:
            raise HTTPException(400, "Unknown plan")
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
        # Prefer card + crypto (user request); crypto is only enabled on eligible accounts
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
            "session_id": session.id, "user_id": user["id"], "lookup_key": req.lookup_key,
            "amount": (price.unit_amount or 0) / 100, "currency": price.currency,
            "status": "initiated", "payment_status": "pending", "fulfilled": False,
            "created_at": _now(), "updated_at": _now(),
        })
        return {"checkout_url": session.url, "session_id": session.id}

    @r.get("/status/{session_id}")
    async def get_status(session_id: str):
        rec = await tx.find_one({"session_id": session_id})
        if not rec:
            raise HTTPException(404, "Transaction not found")
        if rec.get("payment_status") != "paid":
            try:
                s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
                if s.payment_status == "paid" or s.status == "complete":
                    await mark_paid(session_id, s)
                    rec = await tx.find_one({"session_id": session_id})
            except stripe.error.StripeError:
                pass
        elif not rec.get("fulfilled"):
            await fulfill(session_id)
        return {"session_id": rec["session_id"], "status": rec["status"],
                "payment_status": rec["payment_status"], "lookup_key": rec.get("lookup_key")}

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

    return w


async def _fulfill_via(db, session_id: str):
    # Shared fulfilment used by the webhook (mirrors make_router.fulfill)
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

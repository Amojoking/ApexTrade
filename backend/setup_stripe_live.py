"""Configure the user's LIVE Stripe account (restricted key): payment-link redirects, yearly link, webhook.
Re-run after changing APP_PUBLIC_URL (e.g. after deploying)."""
import os
import sys
import stripe
from dotenv import load_dotenv
from pathlib import Path

ENV = Path(__file__).parent / ".env"
load_dotenv(ENV)
live = stripe.StripeClient(os.environ["STRIPE_LIVE_RESTRICTED_KEY"])
APP_URL = os.environ["APP_PUBLIC_URL"].rstrip("/")
SUCCESS = f"{APP_URL}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
WEBHOOK_URL = f"{APP_URL}/api/stripe/live-webhook"
LIVE_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded",
               "customer.subscription.created", "customer.subscription.updated",
               "customer.subscription.deleted", "charge.refunded"]


def set_env(key, value):
    lines = ENV.read_text().rstrip("\n").split("\n")
    lines = [l for l in lines if not l.startswith(key + "=")]
    lines.append(f'{key}="{value}"')
    ENV.write_text("\n".join(lines) + "\n")


def main():
    links = live.v1.payment_links.list({"active": True, "limit": 20, "expand": ["data.line_items"]}).data
    have = {}
    for pl in links:
        price = pl.line_items.data[0].price if pl.line_items and pl.line_items.data else None
        if not price:
            continue
        key = price.lookup_key or ("pro_monthly" if price.recurring and price.recurring.interval == "month"
                                   else "pro_yearly" if price.recurring else "unlimited_lifetime")
        if key:
            have[key] = pl
            cur = pl.after_completion.redirect.url if pl.after_completion.type == "redirect" else None
            if cur != SUCCESS:
                live.v1.payment_links.update(pl.id, {"after_completion": {"type": "redirect", "redirect": {"url": SUCCESS}}})
                print("redirect set", key)
            else:
                print("redirect ok", key)
    for key in ("pro_monthly", "pro_yearly", "unlimited_lifetime"):
        if key in have:
            continue
        prices = live.v1.prices.list({"lookup_keys": [key], "active": True, "limit": 1}).data
        if not prices:
            print("no live price for", key); continue
        pl = live.v1.payment_links.create({
            "line_items": [{"price": prices[0].id, "quantity": 1}],
            "after_completion": {"type": "redirect", "redirect": {"url": SUCCESS}},
            "allow_promotion_codes": True,
        })
        print("created link", key, pl.url)
    existing = [w for w in live.v1.webhook_endpoints.list({"limit": 20}).data if w.url == WEBHOOK_URL]
    if existing:
        print("webhook ok", existing[0].id)
        if not os.environ.get("STRIPE_LIVE_WEBHOOK_SECRET"):
            print("WARNING: webhook exists but STRIPE_LIVE_WEBHOOK_SECRET missing; delete it in Stripe and re-run")
    else:
        w = live.v1.webhook_endpoints.create({"url": WEBHOOK_URL, "enabled_events": LIVE_EVENTS,
                                              "description": "ApexTrade live fulfilment"})
        set_env("STRIPE_LIVE_WEBHOOK_SECRET", w.secret)
        print("created webhook", w.id, "(secret saved to .env)")


if __name__ == "__main__":
    sys.exit(main())

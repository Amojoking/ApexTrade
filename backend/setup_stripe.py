import os
import stripe
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

CATALOG = [
    {
        "emergent_product_id": "apex_pro",
        "name": "ApexTrade Pro",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "pro_monthly", "amount": 999, "currency": "usd", "interval": "month"},
            {"lookup_key": "pro_yearly", "amount": 7900, "currency": "usd", "interval": "year"},
        ],
    },
    {
        "emergent_product_id": "apex_unlimited",
        "name": "ApexTrade Unlimited (Lifetime)",
        "tax_code": "txcd_10103001",
        "prices": [
            {"lookup_key": "unlimited_lifetime", "amount": 4900, "currency": "usd"},
        ],
    },
]


def ensure_tax_settings():
    s = stripe.tax.Settings.retrieve()
    if s.head_office and getattr(s.head_office, "address", None):
        return
    stripe.tax.Settings.modify(
        head_office={"address": {"country": "GB", "line1": "1 Finsbury Avenue", "city": "London", "postal_code": "EC2M 2PF"}},
        defaults={"tax_behavior": "exclusive"},
    )


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(name=entry["name"], tax_code=entry.get("tax_code"),
                                 metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]})


def sync():
    ensure_tax_settings()
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                kwargs = dict(product=product.id, unit_amount=p["amount"], currency=p["currency"],
                              lookup_key=p["lookup_key"], transfer_lookup_key=True)
                if p.get("interval"):
                    kwargs["recurring"] = {"interval": p["interval"]}
                stripe.Price.create(**kwargs)
                print("created price", p["lookup_key"])
            else:
                print("ok price", p["lookup_key"])


if __name__ == "__main__":
    sync()

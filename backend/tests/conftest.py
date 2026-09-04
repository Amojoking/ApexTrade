import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

frontend_env = dotenv_values("/app/frontend/.env")
backend_env = dotenv_values("/app/backend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or backend_env.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or backend_env.get("DB_NAME")


@pytest.fixture(scope="session")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="class")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="class")
def admin_client():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@apextrade.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"no token in login response: {r.json().keys()}"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="class")
def fresh_user_factory():
    """Register throwaway users; cleaned up after the class."""
    created = []

    def _make():
        email = f"test_qa_{uuid.uuid4().hex[:10]}@example.com"
        pwd = "TestPass@123"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"email": email, "password": pwd, "name": "TEST QA User"}, timeout=30)
        if r.status_code not in (200, 201):
            pytest.fail(f"register failed {r.status_code}: {r.text[:300]}")
        body = r.json()
        token = body.get("token") or body.get("access_token")
        assert token, f"register response missing token: {body}"
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        created.append(email)
        return s, email

    yield _make
    c = MongoClient(MONGO_URL)
    db = c[DB_NAME]
    for email in created:
        u = db.users.find_one({"email": email})
        if u:
            uid = str(u["_id"])
            db.payment_transactions.delete_many({"user_id": uid})
            db.watchlist.delete_many({"user_id": uid})
            db.orders.delete_many({"user_id": uid})
            db.positions.delete_many({"user_id": uid})
            db.transactions.delete_many({"user_id": uid})
        db.users.delete_one({"email": email})
    c.close()


def wait(seconds=0.4):
    time.sleep(seconds)

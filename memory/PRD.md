# ApexTrade Pro — PRD

## Original Problem Statement
"I need a full power 1 line of code website which runs in my browser and fully simulates stock trading, crypto and ETFs with paper trading. This should look incredibly similar to every other actual trading site and should have graphs charts etc."

## User Choices
- Data: **Real market data** via Yahoo Finance public API (stocks, ETFs, and crypto with `-USD` suffix)
- Assets: **Stocks, Crypto, ETFs**
- Auth: **Multi-user signup/login** (JWT, httpOnly cookie + Bearer token)
- Starting cash: **$100,000 default, user-adjustable**
- Visual style: **Pro trader** (TradingView / Webull Pro Desktop dark)

## Architecture
- Backend: FastAPI + MongoDB (Motor), bcrypt + PyJWT auth, httpx to Yahoo Finance
- Frontend: React 19 + Router + Recharts + Sonner + shadcn/ui
- Live market data through Yahoo `v7/finance/quote` and `v8/finance/chart` endpoints (in-memory caching 5–15s)

## Core Features (Feb 2026)
- Auth: register, login, logout, `/me`
- Live ticker tape (12 mixed assets), auto-refresh
- Dashboard: equity/cash/invested/P/L, deposit + reset dialogs, positions table, watchlist, top movers per asset class
- Markets page: curated lists per tab (Stocks/Crypto/ETFs), top gainers/losers, live search (Yahoo), add-to-watchlist
- Trade page: symbol header, meta stats, area chart with 1D/1W/1M/1Y/5Y timeframes, buy/sell tabs, market/limit order types, quick % buttons, live P/L on positions
- Portfolio: allocation pie, holdings table with allocation %
- Orders: filter tabs (All/Filled/Open/Cancelled), cancel open orders

## Google Sign-In (Jun 2026)
- Emergent-managed Google Auth added alongside email/password. Button on Login + Signup (`GoogleButton.jsx`).
- Redirect: `window.location.origin + "/"` (never hardcoded). Callback `#session_id=` handled by `pages/AuthCallback.jsx` via `AppRouter` in `App.js` (reads `useLocation().hash`).
- Backend `POST /api/auth/google/session` exchanges session_id server-side, upserts user by email (new users get $100k), stores `user_sessions` (7d), sets httpOnly `session_token` cookie.
- `get_current_user` accepts `session_token` cookie/Bearer first, then JWT `access_token`. Logout deletes session + clears both cookies.
- Testing playbook: `/app/auth_testing.md`

## Payments + Candlesticks (Jun 2026)
- Stripe (Flow A claimable sandbox, GB account). Env: STRIPE_SECRET_KEY/PUBLISHABLE_KEY/ACCOUNT_ID/WEBHOOK_SECRET/MODE in backend/.env. Catalog via `backend/setup_stripe.py` (idempotent): `pro_monthly` $9.99/mo, `pro_yearly` $79/yr, `unlimited_lifetime` $49 one-time.
- Tax mode: "full" (Stripe managed payments) — checkout tries card+crypto first (crypto not enabled on sandbox → falls back to managed payments → automatic_tax → plain).
- `backend/payments.py`: `/api/payments/{plans,checkout,status/{sid},history}`, webhook `/api/stripe/webhook`. Fulfilment idempotent (`fulfilled` flag) → user.limits_removed or plan=pro/pro_until.
- Free-tier limits: 5 watchlist symbols, 3 portfolio resets → HTTP 402; axios interceptor toasts with Upgrade action. `user.entitlements` in /auth/me.
- Frontend: `/pricing`, `/payment/success` (polls status), `/payment/cancel`; header Upgrade button / Pro-Lifetime badge.
- Candlestick chart default (Recharts ComposedChart + custom Bar shape), area toggle, persisted in localStorage `apex_chart_mode`.
- Market data: dropped dead Yahoo v7 quote endpoint; quotes built from chart meta, browser UA, query1/query2 fallback, 15s/45s TTL + stale fallback (fixes 429s).
- PayPal: NOT implemented (user didn't provide credentials; chose Stripe).

## Backend Endpoints
- `/api/payments/{plans,checkout,status/{sid},history}`, `/api/stripe/webhook`
- `/api/auth/{register,login,logout,me}`, `/api/auth/google/session`
- `/api/market/{quote,chart/{symbol},search,curated,ticker}`
- `/api/portfolio` GET, `/api/portfolio/reset`, `/api/portfolio/deposit`
- `/api/orders` GET/POST, `/api/orders/{oid}` DELETE
- `/api/watchlist` GET/POST/DELETE

## Test Credentials
- Admin: admin@apextrade.com / admin123 (also usable via "Try Demo Account")

## P1 Backlog (post-1st-finish)
- ~~Candlestick chart mode toggle~~ (done)
- PayPal checkout (needs user's PayPal client id/secret)
- Stripe subscription cancel/portal + `customer.subscription.deleted` webhook to downgrade
- Limit-order matching worker
- Price alerts + notifications
- Leaderboard / social trading feed

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

## Backend Endpoints
- `/api/auth/{register,login,logout,me}`
- `/api/market/{quote,chart/{symbol},search,curated,ticker}`
- `/api/portfolio` GET, `/api/portfolio/reset`, `/api/portfolio/deposit`
- `/api/orders` GET/POST, `/api/orders/{oid}` DELETE
- `/api/watchlist` GET/POST/DELETE

## Test Credentials
- Admin: admin@apextrade.com / admin123 (also usable via "Try Demo Account")

## P1 Backlog (post-1st-finish)
- Candlestick chart mode toggle
- Limit-order matching worker
- Price alerts + notifications
- Leaderboard / social trading feed

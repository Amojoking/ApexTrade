import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import TickerTape from "@/components/TickerTape";
import { Brand } from "@/components/Layout";
import { GoogleButton } from "@/components/GoogleButton";
import { api } from "@/lib/api";
import { fmtNumber, fmtPct, trendClass } from "@/lib/format";
import { ArrowRight, CandlestickChart, Bitcoin, Shield, Trophy, Zap, LineChart, Check } from "lucide-react";

const FEATURES = [
  { icon: CandlestickChart, title: "Pro-grade charts", body: "Candlesticks, volume, OHLC readout and five timeframes — the same view real desks use." },
  { icon: Bitcoin, title: "Stocks, crypto & ETFs", body: "Live Yahoo Finance data across 3 asset classes. Trade AAPL at 9:31 or BTC at 3am." },
  { icon: Zap, title: "Instant fills", body: "Market and limit orders execute against real prices. No lag, no fake spreads." },
  { icon: Shield, title: "Zero risk", body: "Start with $100,000 in paper cash. Blow it up, reset, learn — without losing a cent." },
  { icon: Trophy, title: "Leaderboard", body: "Ranked by real return on capital. Prove your edge against every other trader." },
  { icon: LineChart, title: "Equity curve", body: "Track your portfolio value over time, day P&L, and unrealized gains per position." },
];

export default function Landing() {
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    api.get("/market/movers").then(({ data }) => setMovers(data)).catch(() => {});
    api.get("/payments/plans").then(({ data }) => setPlans(data.plans || [])).catch(() => {});
  }, []);
  const byKey = Object.fromEntries(plans.map((p) => [p.lookup_key, p]));

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200" data-testid="landing-page">
      <TickerTape />
      <header className="sticky top-0 z-40 bg-[#0B0E14]/80 backdrop-blur border-b border-[#2A2E39]">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between h-14 px-4">
          <Brand />
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="landing-login-btn" className="text-sm text-slate-300 hover:text-white px-3 py-1.5">Log in</Link>
            <Link to="/signup" data-testid="landing-signup-btn" className="text-sm font-semibold bg-[#2962FF] hover:bg-[#1E53E5] text-white px-4 py-1.5 rounded">Start free</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden grid-bg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(41,98,255,0.18),transparent_55%)]" />
        <div className="relative max-w-[1200px] mx-auto px-4 pt-20 pb-16 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#2962FF] font-semibold border border-[#2962FF]/30 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse" /> Live market data
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mt-5 leading-[1.05]">
              Trade like a pro.<br /><span className="text-[#2962FF]">Risk nothing.</span>
            </h1>
            <p className="text-slate-400 mt-5 max-w-xl text-sm md:text-base">
              ApexTrade is a paper-trading terminal with real-time stocks, crypto and ETFs. Practice strategies with $100,000 in virtual cash, on charts that look and feel like the real thing.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8 max-w-md">
              <Link to="/signup" data-testid="hero-cta-btn" className="flex-1 inline-flex items-center justify-center gap-2 bg-[#2962FF] hover:bg-[#1E53E5] text-white font-semibold px-5 py-3 rounded transition">
                Open a free account <ArrowRight size={16} />
              </Link>
              <div className="flex-1"><GoogleButton /></div>
            </div>
            <div className="flex items-center gap-6 mt-8 text-xs text-slate-500">
              <span><Check size={12} className="inline text-[#089981] mr-1" />No credit card</span>
              <span><Check size={12} className="inline text-[#089981] mr-1" />$100k paper cash</span>
              <span><Check size={12} className="inline text-[#089981] mr-1" />Real prices</span>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="bg-[#131722] border border-[#2A2E39] rounded-lg shadow-2xl overflow-hidden" data-testid="landing-movers">
              <div className="grid grid-cols-2 divide-x divide-[#2A2E39]">
                {[["Top gainers", movers.gainers], ["Top losers", movers.losers]].map(([title, rows]) => (
                  <div key={title}>
                    <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-[#2A2E39]">{title}</div>
                    {(rows.length ? rows : Array.from({ length: 6 }, () => null)).slice(0, 6).map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-[#1E222D] last:border-b-0">
                        {r ? (<>
                          <div><div className="text-xs font-semibold">{r.symbol}</div><div className="text-[10px] text-slate-500 truncate max-w-[90px]">{r.name}</div></div>
                          <div className="text-right"><div className="font-mono text-xs">{fmtNumber(r.price)}</div><div className={`font-mono text-[10px] ${trendClass(r.change_percent)}`}>{fmtPct(r.change_percent)}</div></div>
                        </>) : <div className="h-7 w-full rounded bg-[#1E222D]/60 animate-pulse" />}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 py-16">
        <div className="text-xs text-[#2962FF] uppercase tracking-[0.2em] font-semibold">Everything a terminal should have</div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold mt-2 max-w-xl">Built to feel like the real desk, minus the margin call.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="bg-[#131722] border border-[#2A2E39] rounded p-5 hover:border-[#2962FF]/60 transition" style={{ animationDelay: `${i * 60}ms` }}>
              <f.icon size={18} className="text-[#2962FF]" />
              <div className="font-semibold mt-3">{f.title}</div>
              <p className="text-sm text-slate-400 mt-1.5">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#2A2E39] bg-[#0E121A]">
        <div className="max-w-[1200px] mx-auto px-4 py-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="text-xs text-[#2962FF] uppercase tracking-[0.2em] font-semibold">Pricing</div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold mt-2">Free forever. Pro when you're ready.</h2>
            </div>
            <Link to="/pricing" className="text-sm text-[#2962FF] hover:underline">Compare plans →</Link>
          </div>
          <div className="grid md:grid-cols-4 gap-4 mt-8" data-testid="landing-pricing">
            {[
              ["Free", "$0", "5 watchlist symbols · 3 resets · all charts"],
              ["Pro Monthly", byKey.pro_monthly ? `$${byKey.pro_monthly.amount}/mo` : "—", "Unlimited watchlist & resets"],
              ["Pro Yearly", byKey.pro_yearly ? `$${byKey.pro_yearly.amount}/yr` : "—", "Best value for active traders"],
              ["Lifetime", byKey.unlimited_lifetime ? `$${byKey.unlimited_lifetime.amount}` : "—", "One payment, no limits forever"],
            ].map(([t, p, d]) => (
              <div key={t} className="bg-[#131722] border border-[#2A2E39] rounded p-5">
                <div className="text-xs uppercase tracking-wider text-slate-500">{t}</div>
                <div className="font-mono text-2xl font-bold mt-2">{p}</div>
                <div className="text-xs text-slate-400 mt-2">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#2A2E39]">
        <div className="max-w-[1200px] mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <Brand />
          <span>Paper trading only. Market data via Yahoo Finance; delayed for some exchanges. Not investment advice.</span>
        </div>
      </footer>
    </div>
  );
}

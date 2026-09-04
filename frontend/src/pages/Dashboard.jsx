import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { fmtMoney, fmtPct, fmtNumber, trendClass } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { ArrowUpRight, RefreshCw, Wallet, TrendingUp, Activity } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export default function Dashboard() {
  const { refresh } = useAuth();
  const [portfolio, setPortfolio] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [movers, setMovers] = useState({ stock: [], crypto: [], etf: [] });
  const [depositOpen, setDepositOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [depAmount, setDepAmount] = useState(10000);
  const [resetVal, setResetVal] = useState(100000);

  const load = async () => {
    try {
      const [p, w, s, c, e] = await Promise.all([
        api.get("/portfolio"),
        api.get("/watchlist"),
        api.get("/market/curated", { params: { asset_type: "stock" } }),
        api.get("/market/curated", { params: { asset_type: "crypto" } }),
        api.get("/market/curated", { params: { asset_type: "etf" } }),
      ]);
      setPortfolio(p.data);
      setWatchlist(w.data.items || []);
      setMovers({ stock: s.data.items, crypto: c.data.items, etf: e.data.items });
    } catch (e) { /* silent */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const deposit = async () => {
    try {
      await api.post("/portfolio/deposit", { amount: Number(depAmount) });
      toast.success(`Deposited ${fmtMoney(Number(depAmount))}`);
      setDepositOpen(false);
      await Promise.all([load(), refresh()]);
    } catch (err) { toast.error("Deposit failed"); }
  };

  const resetPortfolio = async () => {
    try {
      await api.post("/portfolio/reset", { new_balance: Number(resetVal) });
      toast.success(`Portfolio reset to ${fmtMoney(Number(resetVal))}`);
      setResetOpen(false);
      await Promise.all([load(), refresh()]);
    } catch (err) { if (!err.handled) toast.error("Reset failed"); }
  };

  const closePosition = async (pos) => {
    try {
      await api.post("/orders", {
        symbol: pos.symbol, asset_type: pos.asset_type,
        side: "sell", order_type: "market", quantity: pos.quantity,
      });
      toast.success(`Closed ${pos.symbol}`);
      await Promise.all([load(), refresh()]);
    } catch (e) { toast.error("Close failed"); }
  };

  const p = portfolio || {};
  const cash = p.cash_balance ?? 0;
  const equity = p.equity ?? 0;
  const totalPl = p.total_pl ?? 0;
  const totalPlPct = p.total_pl_pct ?? 0;
  const positions = p.positions || [];
  const invested = p.positions_value ?? 0;

  return (
    <Layout>
      <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
        {/* Metrics row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Equity" value={fmtMoney(equity)} icon={Wallet}
                      testId="portfolio-total-value" accent="text-slate-100" />
          <MetricCard label="Cash Available" value={fmtMoney(cash)} icon={Wallet}
                      testId="portfolio-cash-balance" accent="text-slate-100" />
          <MetricCard label="Invested" value={fmtMoney(invested)} icon={Activity}
                      testId="portfolio-invested" accent="text-slate-100" />
          <MetricCard label="Total P/L"
                      value={`${fmtMoney(totalPl)} (${fmtPct(totalPlPct)})`}
                      icon={TrendingUp} testId="portfolio-unrealized-pl"
                      accent={trendClass(totalPl)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDepositOpen(true)} data-testid="deposit-cash-button"
                  className="text-xs font-semibold px-3 py-2 bg-[#131722] border border-[#2A2E39] rounded hover:border-[#2962FF] text-slate-200 flex items-center gap-2">
            <Wallet size={14} /> Deposit Paper Cash
          </button>
          <button onClick={() => setResetOpen(true)} data-testid="reset-balance-button"
                  className="text-xs font-semibold px-3 py-2 bg-[#131722] border border-[#2A2E39] rounded hover:border-[#F23645] text-slate-200 flex items-center gap-2">
            <RefreshCw size={14} /> Reset Portfolio
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Positions */}
          <div className="xl:col-span-2 bg-[#131722] border border-[#2A2E39] rounded" data-testid="positions-table">
            <div className="px-4 py-3 border-b border-[#2A2E39] flex justify-between items-center">
              <div className="text-sm font-semibold text-slate-200">Active Positions</div>
              <span className="text-xs text-slate-500">{positions.length} open</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#1E222D] text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Symbol</th>
                    <th className="text-right px-4 py-2 font-medium">Qty</th>
                    <th className="text-right px-4 py-2 font-medium">Avg Price</th>
                    <th className="text-right px-4 py-2 font-medium">Last</th>
                    <th className="text-right px-4 py-2 font-medium">Mkt Value</th>
                    <th className="text-right px-4 py-2 font-medium">Unrealized P/L</th>
                    <th className="text-right px-4 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No open positions. <Link to="/markets" className="text-[#2962FF] hover:underline">Explore Markets →</Link>
                    </td></tr>
                  ) : positions.map((pos) => (
                    <tr key={pos.id} className="border-t border-[#1E222D] hover:bg-[#1E222D]/60">
                      <td className="px-4 py-2.5">
                        <Link to={`/trade/${pos.symbol}?type=${pos.asset_type}`} className="font-semibold text-slate-100 hover:text-[#2962FF]">
                          {pos.symbol}
                        </Link>
                        <div className="text-slate-500 uppercase text-[10px] mt-0.5">{pos.asset_type}</div>
                      </td>
                      <td className="text-right font-mono">{fmtNumber(pos.quantity, pos.quantity < 1 ? 4 : 2)}</td>
                      <td className="text-right font-mono text-slate-300">{fmtMoney(pos.avg_price)}</td>
                      <td className="text-right font-mono">{fmtMoney(pos.current_price)}</td>
                      <td className="text-right font-mono">{fmtMoney(pos.market_value)}</td>
                      <td className={`text-right font-mono ${trendClass(pos.unrealized_pl)}`}>
                        {fmtMoney(pos.unrealized_pl)}
                        <div className="text-[10px]">{fmtPct(pos.unrealized_pl_pct)}</div>
                      </td>
                      <td className="text-right">
                        <button
                          data-testid={`close-position-btn-${pos.symbol}`}
                          onClick={() => closePosition(pos)}
                          className="text-[10px] font-semibold px-2 py-1 rounded bg-[#F23645]/15 text-[#F23645] hover:bg-[#F23645]/25"
                        >CLOSE</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Watchlist */}
          <div className="bg-[#131722] border border-[#2A2E39] rounded" data-testid="watchlist-panel">
            <div className="px-4 py-3 border-b border-[#2A2E39] flex justify-between items-center">
              <div className="text-sm font-semibold text-slate-200">Watchlist</div>
              <Link to="/markets" className="text-xs text-[#2962FF] hover:underline flex items-center gap-1">
                Browse <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-[#1E222D]">
              {watchlist.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Add symbols from Markets to track them here.
                </div>
              ) : watchlist.map((w) => (
                <Link
                  key={w.id} to={`/trade/${w.symbol}?type=${w.asset_type}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[#1E222D]"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{w.symbol}</div>
                    <div className="text-[10px] text-slate-500">{w.name || w.asset_type}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm">{fmtNumber(w.price)}</div>
                    <div className={`font-mono text-[10px] ${trendClass(w.change_percent || 0)}`}>{fmtPct(w.change_percent || 0)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Movers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {["stock", "crypto", "etf"].map((cat) => (
            <MoversCard key={cat} title={cat.toUpperCase() + "S"} items={movers[cat] || []} />
          ))}
        </div>
      </div>

      {/* Deposit dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="bg-[#131722] border-[#2A2E39] text-slate-200">
          <DialogHeader><DialogTitle>Deposit Paper Cash</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">Amount (USD)</label>
            <input
              data-testid="deposit-amount-input"
              type="number" value={depAmount} onChange={(e) => setDepAmount(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#2A2E39] rounded px-3 py-2 font-mono text-sm outline-none focus:border-[#2962FF]"
            />
          </div>
          <DialogFooter>
            <button onClick={() => setDepositOpen(false)} className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
            <button onClick={deposit} data-testid="deposit-confirm-btn" className="px-3 py-2 text-xs font-semibold bg-[#2962FF] hover:bg-[#1E53E5] rounded text-white">Deposit</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-[#131722] border-[#2A2E39] text-slate-200">
          <DialogHeader><DialogTitle>Reset Portfolio</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-400">This will close all positions and set your new starting cash.</p>
          <div className="space-y-2">
            <label className="text-xs text-slate-400 uppercase tracking-wider">New Starting Balance (USD)</label>
            <input
              data-testid="reset-amount-input"
              type="number" value={resetVal} onChange={(e) => setResetVal(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#2A2E39] rounded px-3 py-2 font-mono text-sm outline-none focus:border-[#2962FF]"
            />
          </div>
          <DialogFooter>
            <button onClick={() => setResetOpen(false)} className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
            <button onClick={resetPortfolio} data-testid="reset-confirm-btn" className="px-3 py-2 text-xs font-semibold bg-[#F23645] hover:bg-[#d92e3e] rounded text-white">Reset Portfolio</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

const MetricCard = ({ label, value, icon: Icon, accent = "text-slate-100", testId }) => (
  <div className="bg-[#131722] border border-[#2A2E39] rounded p-4" data-testid={testId}>
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      {Icon && <Icon size={14} className="text-slate-600" />}
    </div>
    <div className={`font-mono text-2xl font-bold mt-2 ${accent}`}>{value}</div>
  </div>
);

const MoversCard = ({ title, items }) => (
  <div className="bg-[#131722] border border-[#2A2E39] rounded">
    <div className="px-4 py-3 border-b border-[#2A2E39] text-sm font-semibold text-slate-200">{title}</div>
    <div className="divide-y divide-[#1E222D]">
      {items.slice(0, 6).map((it) => (
        <Link key={it.symbol} to={`/trade/${it.symbol}?type=${it.asset_type}`}
              className="flex items-center justify-between px-4 py-2 hover:bg-[#1E222D]">
          <div>
            <div className="text-sm font-semibold text-slate-100">{it.symbol}</div>
            <div className="text-[10px] text-slate-500 truncate max-w-[160px]">{it.name}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-sm">{fmtNumber(it.price)}</div>
            <div className={`font-mono text-[10px] ${trendClass(it.change_percent || 0)}`}>{fmtPct(it.change_percent || 0)}</div>
          </div>
        </Link>
      ))}
    </div>
  </div>
);

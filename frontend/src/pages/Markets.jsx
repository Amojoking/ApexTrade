import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { fmtNumber, fmtPct, trendClass, fmtCompact } from "@/lib/format";
import { Search, Star } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "stock", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "etf", label: "ETFs" },
];

export default function Markets() {
  const [tab, setTab] = useState("stock");
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async (t = tab) => {
    setLoading(true);
    try {
      const { data } = await api.get("/market/curated", { params: { asset_type: t } });
      setRows(data.items || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(tab); }, [tab]);

  useEffect(() => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/market/search", { params: { q } });
        setSearchResults((data.results || []).slice(0, 8));
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const addWatch = async (symbol, asset_type, name) => {
    try {
      await api.post("/watchlist", { symbol, asset_type, name });
      toast.success(`Added ${symbol} to watchlist`);
    } catch (err) { if (!err.handled) toast.error("Failed to add"); }
  };

  const gainers = useMemo(() =>
    [...rows].filter(r => r.change_percent != null).sort((a, b) => b.change_percent - a.change_percent).slice(0, 3),
  [rows]);
  const losers = useMemo(() =>
    [...rows].filter(r => r.change_percent != null).sort((a, b) => a.change_percent - b.change_percent).slice(0, 3),
  [rows]);

  const routeType = (r) => {
    const qt = (r.quoteType || "").toLowerCase();
    if (qt === "cryptocurrency") return "crypto";
    if (qt === "etf") return "etf";
    return "stock";
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <h1 className="font-display text-2xl font-bold">Markets</h1>
          <div className="relative w-full lg:w-96">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              data-testid="market-search-input"
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search stocks, crypto, ETFs (e.g. TSLA, BTC-USD)…"
              className="w-full bg-[#131722] border border-[#2A2E39] rounded pl-9 pr-3 py-2 text-sm outline-none focus:border-[#2962FF]"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-30 top-full mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded shadow-xl">
                {searchResults.map((r) => (
                  <Link key={r.symbol} to={`/trade/${r.symbol}?type=${routeType(r)}`}
                        onClick={() => { setQ(""); setSearchResults([]); }}
                        className="flex justify-between items-center px-3 py-2 hover:bg-[#1E222D] text-xs">
                    <div>
                      <div className="text-slate-100 font-semibold">{r.symbol}</div>
                      <div className="text-slate-500 truncate max-w-[220px]">{r.shortname || r.longname}</div>
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase">{r.quoteType}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatPanel title="Top Gainers" items={gainers} color="text-[#089981]" />
          <StatPanel title="Top Losers" items={losers} color="text-[#F23645]" />
        </div>

        <div className="flex gap-1 bg-[#131722] border border-[#2A2E39] rounded p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              data-testid={`markets-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                tab === t.key ? "bg-[#2962FF] text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="bg-[#131722] border border-[#2A2E39] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#1E222D] text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Symbol</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-right px-4 py-2 font-medium">Price</th>
                <th className="text-right px-4 py-2 font-medium">24h Chg %</th>
                <th className="text-right px-4 py-2 font-medium">Volume</th>
                <th className="text-right px-4 py-2 font-medium">Day Range</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-500">Loading…</td></tr>
              ) : rows.map((r) => (
                <tr key={r.symbol} className="border-t border-[#1E222D] hover:bg-[#1E222D]/60">
                  <td className="px-4 py-2.5 font-semibold text-slate-100">{r.symbol}</td>
                  <td className="px-4 py-2.5 text-slate-400 max-w-[240px] truncate">{r.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtNumber(r.price)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono ${trendClass(r.change_percent || 0)}`}>
                    {fmtPct(r.change_percent || 0)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-400">{fmtCompact(r.volume)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                    {fmtNumber(r.low)} – {fmtNumber(r.high)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        data-testid={`watch-btn-${r.symbol}`}
                        onClick={() => addWatch(r.symbol, tab, r.name)}
                        className="p-1.5 rounded bg-[#1E222D] hover:bg-[#2A2E39] text-slate-400 hover:text-[#FFB703]"
                        title="Add to watchlist"
                      ><Star size={12} /></button>
                      <Link
                        to={`/trade/${r.symbol}?type=${tab}`}
                        data-testid={`trade-symbol-btn-${r.symbol}`}
                        className="text-[10px] font-semibold px-2 py-1 rounded bg-[#2962FF] hover:bg-[#1E53E5] text-white"
                      >TRADE</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

const StatPanel = ({ title, items, color }) => (
  <div className="bg-[#131722] border border-[#2A2E39] rounded">
    <div className="px-4 py-2 border-b border-[#2A2E39] text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</div>
    <div className="grid grid-cols-3 divide-x divide-[#1E222D]">
      {items.map((it) => (
        <Link to={`/trade/${it.symbol}?type=${it.asset_type}`} key={it.symbol} className="px-3 py-2 hover:bg-[#1E222D]">
          <div className="text-sm font-semibold text-slate-100">{it.symbol}</div>
          <div className={`font-mono text-xs ${color}`}>{fmtPct(it.change_percent || 0)}</div>
        </Link>
      ))}
    </div>
  </div>
);

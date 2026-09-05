import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { fmtMoney, fmtPct, trendClass } from "@/lib/format";
import { Trophy, Crown, Medal } from "lucide-react";

const RankBadge = ({ rank }) => {
  const colors = { 1: "text-[#FFB703]", 2: "text-slate-300", 3: "text-[#CD7F32]" };
  return rank <= 3
    ? <Medal size={16} className={colors[rank]} />
    : <span className="font-mono text-slate-500 text-xs">#{rank}</span>;
};

export default function Leaderboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => api.get("/leaderboard").then(({ data }) => setData(data)).catch(() => setData({ items: [], me: null }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const items = data?.items || [];
  const me = data?.me;

  return (
    <Layout>
      <div className="p-4 lg:p-8 max-w-[1000px] mx-auto space-y-6" data-testid="leaderboard-page">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs text-[#2962FF] uppercase tracking-[0.2em] font-semibold">Global ranking</div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-1 flex items-center gap-3">
              <Trophy className="text-[#FFB703]" size={28} /> Leaderboard
            </h1>
            <p className="text-slate-400 text-sm mt-2">Ranked by return on starting capital. Refreshes every 30s.</p>
          </div>
          {me && (
            <div className="bg-[#131722] border border-[#2962FF]/50 rounded px-4 py-3 text-sm" data-testid="leaderboard-me">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Your rank</div>
              <div className="font-mono text-xl font-bold">#{me.rank} <span className="text-slate-500 text-sm">/ {data.total}</span></div>
              <div className={`font-mono text-xs ${trendClass(me.roi_pct)}`}>{fmtPct(me.roi_pct)} · {fmtMoney(me.equity)}</div>
            </div>
          )}
        </div>

        <div className="bg-[#131722] border border-[#2A2E39] rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1E222D] text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium w-16">Rank</th>
                  <th className="text-left px-4 py-2.5 font-medium">Trader</th>
                  <th className="text-right px-4 py-2.5 font-medium">Return</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">Equity</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden sm:table-cell">Positions</th>
                </tr>
              </thead>
              <tbody>
                {!data ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#1E222D]"><td colSpan={5} className="px-4 py-3"><div className="h-5 rounded bg-[#1E222D]/60 animate-pulse" /></td></tr>
                )) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No traders yet.</td></tr>
                ) : items.map((r) => (
                  <tr key={r.user_id} data-testid={`leaderboard-row-${r.rank}`}
                      className={`border-t border-[#1E222D] ${r.is_me ? "bg-[#2962FF]/10" : "hover:bg-[#1E222D]/60"}`}>
                    <td className="px-4 py-2.5"><RankBadge rank={r.rank} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {r.picture ? <img src={r.picture} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full" /> :
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2962FF] to-[#8A2BE2] flex items-center justify-center text-[11px] font-bold">{r.name[0]?.toUpperCase()}</div>}
                        <span className="font-semibold text-slate-100 truncate max-w-[160px] sm:max-w-none">{r.name}{r.is_me && <span className="text-[10px] text-[#2962FF] ml-2">YOU</span>}</span>
                        {r.pro && <Crown size={12} className="text-[#FFB703]" />}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${trendClass(r.roi_pct)}`}>{fmtPct(r.roi_pct)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300 hidden sm:table-cell">{fmtMoney(r.equity)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400 hidden sm:table-cell">{r.positions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

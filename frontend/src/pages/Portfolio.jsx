import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { fmtMoney, fmtNumber, fmtPct, trendClass } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#2962FF", "#089981", "#FFB703", "#8A2BE2", "#F23645", "#00BCD4"];

export default function Portfolio() {
  const [p, setP] = useState(null);

  const load = async () => {
    try { const { data } = await api.get("/portfolio"); setP(data); } catch {}
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const positions = p?.positions || [];
  const equity = p?.equity ?? 0;
  const cash = p?.cash_balance ?? 0;

  const alloc = [
    { name: "Cash", value: cash },
    ...positions.map((pos) => ({ name: pos.symbol, value: pos.market_value })),
  ].filter((a) => a.value > 0);

  return (
    <Layout>
      <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
        <h1 className="font-display text-2xl font-bold">Portfolio</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#131722] border border-[#2A2E39] rounded p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Total Equity</div>
            <div className="font-mono text-4xl font-bold mt-1" data-testid="portfolio-equity">{fmtMoney(equity)}</div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <MiniStat label="Starting" value={fmtMoney(p?.starting_balance ?? 0)} />
              <MiniStat label="Total P/L" value={fmtMoney(p?.total_pl ?? 0)} accent={trendClass(p?.total_pl ?? 0)} />
              <MiniStat label="ROI" value={fmtPct(p?.total_pl_pct ?? 0)} accent={trendClass(p?.total_pl_pct ?? 0)} />
            </div>
          </div>
          <div className="bg-[#131722] border border-[#2A2E39] rounded p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Allocation</div>
            <div style={{ height: 200 }}>
              {alloc.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">No allocation</div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={alloc} innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                      {alloc.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#1E222D", border: "1px solid #2A2E39" }}
                      formatter={(v) => fmtMoney(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#131722] border border-[#2A2E39] rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2A2E39] text-sm font-semibold">Holdings</div>
          <table className="w-full text-xs">
            <thead className="bg-[#1E222D] text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Asset</th>
                <th className="text-right px-4 py-2 font-medium">Allocation</th>
                <th className="text-right px-4 py-2 font-medium">Qty</th>
                <th className="text-right px-4 py-2 font-medium">Avg</th>
                <th className="text-right px-4 py-2 font-medium">Current</th>
                <th className="text-right px-4 py-2 font-medium">Market Value</th>
                <th className="text-right px-4 py-2 font-medium">Unrealized P/L</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-500">No holdings yet</td></tr>
              ) : positions.map((pos) => {
                const allocPct = equity > 0 ? (pos.market_value / equity) * 100 : 0;
                return (
                  <tr key={pos.id} className="border-t border-[#1E222D] hover:bg-[#1E222D]/60">
                    <td className="px-4 py-2.5 font-semibold text-slate-100">{pos.symbol}
                      <div className="text-[10px] text-slate-500 uppercase">{pos.asset_type}</div>
                    </td>
                    <td className="text-right font-mono">{allocPct.toFixed(2)}%</td>
                    <td className="text-right font-mono">{fmtNumber(pos.quantity, pos.quantity < 1 ? 4 : 2)}</td>
                    <td className="text-right font-mono">{fmtMoney(pos.avg_price)}</td>
                    <td className="text-right font-mono">{fmtMoney(pos.current_price)}</td>
                    <td className="text-right font-mono">{fmtMoney(pos.market_value)}</td>
                    <td className={`text-right font-mono ${trendClass(pos.unrealized_pl)}`}>
                      {fmtMoney(pos.unrealized_pl)}
                      <div className="text-[10px]">{fmtPct(pos.unrealized_pl_pct)}</div>
                    </td>
                    <td className="text-right">
                      <Link to={`/trade/${pos.symbol}?type=${pos.asset_type}`}
                            className="text-[10px] font-semibold px-2 py-1 rounded bg-[#2962FF] hover:bg-[#1E53E5] text-white">
                        TRADE
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

const MiniStat = ({ label, value, accent = "text-slate-100" }) => (
  <div className="bg-[#0B0E14] border border-[#2A2E39] rounded p-3">
    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
    <div className={`font-mono text-lg font-semibold mt-1 ${accent}`}>{value}</div>
  </div>
);

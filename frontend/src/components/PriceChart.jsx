import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { fmtNumber, trendClass, fmtPct } from "@/lib/format";

const TF = [
  { key: "1D", range: "1d", interval: "5m" },
  { key: "1W", range: "5d", interval: "30m" },
  { key: "1M", range: "1mo", interval: "1d" },
  { key: "1Y", range: "1y", interval: "1d" },
  { key: "5Y", range: "5y", interval: "1wk" },
];

const CustomTip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-[#1E222D] border border-[#2A2E39] shadow-xl px-3 py-2 rounded font-mono text-xs">
      <div className="text-slate-400 mb-1">{new Date(p.t * 1000).toLocaleString()}</div>
      <div className="text-slate-100">O: {fmtNumber(p.o)} · H: {fmtNumber(p.h)}</div>
      <div className="text-slate-100">L: {fmtNumber(p.l)} · C: {fmtNumber(p.c)}</div>
    </div>
  );
};

export default function PriceChart({ symbol, assetType = "stock", height = 380 }) {
  const [range, setRange] = useState(TF[0]);
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/market/chart/${encodeURIComponent(symbol)}`, {
      params: { range: range.range, interval: range.interval, asset_type: assetType },
    }).then(({ data }) => {
      if (!alive) return;
      setMeta(data.meta || null);
      setData(data.candles || []);
    }).catch(() => setData([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [symbol, range, assetType]);

  const isUp = useMemo(() => {
    if (data.length < 2) return true;
    return data[data.length - 1].c >= data[0].c;
  }, [data]);
  const color = isUp ? "#089981" : "#F23645";

  const change = useMemo(() => {
    if (data.length < 2) return { abs: 0, pct: 0 };
    const first = data[0].c, last = data[data.length - 1].c;
    return { abs: last - first, pct: ((last - first) / first) * 100 };
  }, [data]);

  return (
    <div className="bg-[#131722] border border-[#2A2E39] rounded" data-testid={`chart-${symbol}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2E39]">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Price Chart</div>
          <div className={`text-xs font-mono mt-0.5 ${trendClass(change.pct)}`}>
            {change.abs >= 0 ? "+" : ""}{fmtNumber(change.abs)} ({fmtPct(change.pct)})
          </div>
        </div>
        <div className="flex items-center gap-1 bg-[#0B0E14] border border-[#2A2E39] rounded p-0.5">
          {TF.map((t) => (
            <button
              key={t.key}
              data-testid={`timeframe-${t.key.toLowerCase()}-btn`}
              onClick={() => setRange(t)}
              className={`text-xs px-2 py-1 rounded transition font-medium ${
                range.key === t.key ? "bg-[#2962FF] text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >{t.key}</button>
          ))}
        </div>
      </div>
      <div style={{ height }} className="p-2">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading chart…</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E222D" vertical={false} />
              <XAxis
                dataKey="t"
                tick={{ fill: "#787B86", fontSize: 10, fontFamily: "JetBrains Mono" }}
                axisLine={{ stroke: "#2A2E39" }} tickLine={false}
                tickFormatter={(t) => {
                  const d = new Date(t * 1000);
                  return range.key === "1D"
                    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : d.toLocaleDateString([], { month: "short", day: "numeric" });
                }}
                minTickGap={40}
              />
              <YAxis
                orientation="right" domain={["auto", "auto"]}
                tick={{ fill: "#787B86", fontSize: 10, fontFamily: "JetBrains Mono" }}
                axisLine={{ stroke: "#2A2E39" }} tickLine={false} width={65}
                tickFormatter={(v) => fmtNumber(v, v < 1 ? 4 : 2)}
              />
              <Tooltip content={<CustomTip />} />
              <Area
                type="monotone" dataKey="c" stroke={color} strokeWidth={1.75}
                fill={`url(#grad-${symbol})`} isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {meta && (
        <div className="grid grid-cols-4 border-t border-[#2A2E39] text-xs">
          {[
            ["Prev Close", meta.chartPreviousClose],
            ["Day High", meta.regularMarketDayHigh],
            ["Day Low", meta.regularMarketDayLow],
            ["Volume", meta.regularMarketVolume],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2 border-r last:border-r-0 border-[#2A2E39]">
              <div className="text-slate-500 uppercase tracking-wider">{k}</div>
              <div className="font-mono text-slate-200 mt-0.5">{fmtNumber(v)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

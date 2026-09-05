import React, { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { CandlestickChart, AreaChart as AreaIcon } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNumber, trendClass, fmtPct, fmtCompact } from "@/lib/format";

const UP = "#089981", DOWN = "#F23645";

// Bar range [l,h] maps to y..y+height; derive body from that scale
const Candle = ({ x, y, width, height, payload }) => {
  const { o, c, h, l } = payload;
  if ([o, c, h, l].some((v) => v === null || v === undefined)) return null;
  const span = h - l || 1e-9;
  const px = height / span;
  const color = c >= o ? UP : DOWN;
  const top = y + (h - Math.max(o, c)) * px;
  const bodyH = Math.max(1, Math.abs(o - c) * px);
  const cx = x + width / 2;
  const bw = Math.max(1.5, width * 0.65);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bw / 2} y={top} width={bw} height={bodyH} fill={color} />
    </g>
  );
};

const VolBar = ({ x, y, width, height, payload }) => {
  if (!height || height <= 0) return null;
  const color = payload.c >= payload.o ? UP : DOWN;
  const bw = Math.max(1.5, width * 0.65);
  return <rect x={x + width / 2 - bw / 2} y={y} width={bw} height={height} fill={color} opacity={0.35} />;
};

const TF = [
  { key: "1D", range: "1d", interval: "5m" },
  { key: "1W", range: "5d", interval: "30m" },
  { key: "1M", range: "1mo", interval: "1d" },
  { key: "1Y", range: "1y", interval: "1d" },
  { key: "5Y", range: "5y", interval: "1wk" },
];

const axisTick = { fill: "#787B86", fontSize: 10, fontFamily: "JetBrains Mono" };
const fmtTime = (t, rangeKey) => {
  const d = new Date(t * 1000);
  return rangeKey === "1D"
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const OhlcReadout = ({ p }) => {
  if (!p) return null;
  const up = p.c >= p.o;
  const cls = up ? "text-[#089981]" : "text-[#F23645]";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px]" data-testid="ohlc-readout">
      <span className="text-slate-500">{new Date(p.t * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      {[["O", p.o], ["H", p.h], ["L", p.l], ["C", p.c]].map(([k, v]) => (
        <span key={k} className="text-slate-500">{k} <span className={cls}>{fmtNumber(v, v < 1 ? 4 : 2)}</span></span>
      ))}
      <span className="text-slate-500">Vol <span className="text-slate-300">{fmtCompact(p.v)}</span></span>
    </div>
  );
};

export default function PriceChart({ symbol, assetType = "stock", height = 380 }) {
  const [range, setRange] = useState(TF[0]);
  const [mode, setMode] = useState(() => localStorage.getItem("apex_chart_mode") || "candle");
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState(null);

  const setChartMode = (m) => { setMode(m); localStorage.setItem("apex_chart_mode", m); };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/market/chart/${encodeURIComponent(symbol)}`, {
      params: { range: range.range, interval: range.interval, asset_type: assetType },
    }).then(({ data }) => {
      if (!alive) return;
      setMeta(data.meta || null);
      setData((data.candles || []).filter((c) => c.c !== null && c.c !== undefined));
    }).catch(() => setData([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [symbol, range, assetType]);

  const isUp = useMemo(() => data.length < 2 || data[data.length - 1].c >= data[0].c, [data]);
  const color = isUp ? UP : DOWN;
  const change = useMemo(() => {
    if (data.length < 2) return { abs: 0, pct: 0 };
    const first = data[0].c, last = data[data.length - 1].c;
    return { abs: last - first, pct: ((last - first) / first) * 100 };
  }, [data]);
  const maxVol = useMemo(() => Math.max(1, ...data.map((d) => d.v || 0)), [data]);
  const readout = hover || data[data.length - 1];

  const onMove = (s) => setHover(s?.activePayload?.[0]?.payload || null);
  const xAxis = (
    <XAxis dataKey="t" tick={axisTick} axisLine={{ stroke: "#2A2E39" }} tickLine={false}
           tickFormatter={(t) => fmtTime(t, range.key)} minTickGap={40} />
  );
  const yAxis = (
    <YAxis yAxisId="price" orientation="right" domain={["auto", "auto"]} tick={axisTick}
           axisLine={{ stroke: "#2A2E39" }} tickLine={false} width={65}
           tickFormatter={(v) => fmtNumber(v, v < 1 ? 4 : 2)} />
  );

  return (
    <div className="bg-[#131722] border border-[#2A2E39] rounded" data-testid={`chart-${symbol}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#2A2E39]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Price Chart</span>
            <span className={`text-xs font-mono ${trendClass(change.pct)}`}>
              {change.abs >= 0 ? "+" : ""}{fmtNumber(change.abs)} ({fmtPct(change.pct)})
            </span>
          </div>
          <div className="mt-0.5"><OhlcReadout p={readout} /></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-[#0B0E14] border border-[#2A2E39] rounded p-0.5">
            <button data-testid="chart-mode-candle-btn" title="Candlesticks" onClick={() => setChartMode("candle")}
              className={`p-1 rounded transition ${mode === "candle" ? "bg-[#2962FF] text-white" : "text-slate-400 hover:text-slate-200"}`}>
              <CandlestickChart size={14} />
            </button>
            <button data-testid="chart-mode-area-btn" title="Area" onClick={() => setChartMode("area")}
              className={`p-1 rounded transition ${mode === "area" ? "bg-[#2962FF] text-white" : "text-slate-400 hover:text-slate-200"}`}>
              <AreaIcon size={14} />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-[#0B0E14] border border-[#2A2E39] rounded p-0.5">
            {TF.map((t) => (
              <button key={t.key} data-testid={`timeframe-${t.key.toLowerCase()}-btn`} onClick={() => setRange(t)}
                className={`text-xs px-2 py-1 rounded transition font-medium ${range.key === t.key ? "bg-[#2962FF] text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {t.key}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ height }} className="p-2" data-testid={`chart-mode-${mode}`} onMouseLeave={() => setHover(null)}>
        {loading ? (
          <div className="h-full w-full rounded bg-[#1E222D]/60 animate-pulse" />
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">No data available</div>
        ) : mode === "candle" ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onMouseMove={onMove}>
              <CartesianGrid stroke="#1E222D" vertical={false} />
              {xAxis}
              {yAxis}
              <YAxis yAxisId="vol" orientation="left" domain={[0, maxVol * 4]} hide />
              <Tooltip content={() => null} cursor={{ stroke: "#787B86", strokeDasharray: "3 3" }} />
              <Bar yAxisId="vol" dataKey="v" shape={<VolBar />} isAnimationActive={false} maxBarSize={14} />
              <Bar yAxisId="price" dataKey={(d) => [d.l, d.h]} shape={<Candle />} isAnimationActive={false} maxBarSize={14} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} onMouseMove={onMove}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E222D" vertical={false} />
              {xAxis}
              {yAxis}
              <Tooltip content={() => null} cursor={{ stroke: "#787B86", strokeDasharray: "3 3" }} />
              <Area yAxisId="price" type="monotone" dataKey="c" stroke={color} strokeWidth={1.75}
                    fill={`url(#grad-${symbol})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-[#2A2E39] text-xs">
          {[
            ["Prev Close", fmtNumber(meta.chartPreviousClose)],
            ["Day High", fmtNumber(meta.regularMarketDayHigh)],
            ["Day Low", fmtNumber(meta.regularMarketDayLow)],
            ["Volume", fmtCompact(meta.regularMarketVolume)],
          ].map(([k, v]) => (
            <div key={k} className="px-3 py-2 border-r border-b sm:border-b-0 last:border-r-0 border-[#2A2E39]">
              <div className="text-slate-500 uppercase tracking-wider">{k}</div>
              <div className="font-mono text-slate-200 mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

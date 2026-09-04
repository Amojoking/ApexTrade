import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtPct, trendClass } from "@/lib/format";

export default function TickerTape() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/market/ticker");
        if (alive) setItems(data.items || []);
      } catch {}
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!items.length) return <div className="h-9 bg-[#131722] border-b border-[#2A2E39]" />;

  const row = (i, keyPrefix) =>
    items.map((it, idx) => (
      <div key={`${keyPrefix}-${idx}`} className="flex items-center gap-2 px-4 border-r border-[#2A2E39] h-9">
        <span className="text-xs font-semibold text-slate-200">{it.symbol}</span>
        <span className="font-mono text-xs text-slate-100">
          {it.price !== null && it.price !== undefined ? it.price.toFixed(2) : "—"}
        </span>
        <span className={`font-mono text-xs ${trendClass(it.change_percent || 0)}`}>
          {fmtPct(it.change_percent || 0)}
        </span>
      </div>
    ));

  return (
    <div
      className="h-9 bg-[#131722] border-b border-[#2A2E39] overflow-hidden relative"
      data-testid="top-ticker-tape"
    >
      <div className="ticker-track flex whitespace-nowrap absolute top-0 left-0">
        {row(0, "a")}
        {row(1, "b")}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import PriceChart from "@/components/PriceChart";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtMoney, fmtNumber, fmtPct, trendClass, fmtCompact } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Star } from "lucide-react";

export default function Trade() {
  const { symbol } = useParams();
  const [params] = useSearchParams();
  const assetType = params.get("type") || "stock";
  const { user, refresh } = useAuth();

  const [quote, setQuote] = useState(null);
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [qty, setQty] = useState(1);
  const [limit, setLimit] = useState("");
  const [pos, setPos] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadQuote = async () => {
    try {
      const { data } = await api.get(`/market/quote`, {
        params: { symbols: symbol, asset_type: assetType },
      });
      setQuote((data.quotes || [])[0] || null);
    } catch {}
  };
  const loadPortfolio = async () => {
    try {
      const { data } = await api.get("/portfolio");
      const p = (data.positions || []).find((x) => x.symbol === (assetType === "crypto" && !symbol.includes("-") ? `${symbol}-USD` : symbol));
      setPos(p || null);
    } catch {}
  };

  useEffect(() => {
    loadQuote(); loadPortfolio();
    const t = setInterval(loadQuote, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [symbol]);

  const price = quote?.regularMarketPrice ?? 0;
  const total = useMemo(() => {
    const p = orderType === "limit" && Number(limit) > 0 ? Number(limit) : price;
    return Number(qty || 0) * p;
  }, [qty, limit, price, orderType]);
  const cash = user?.cash_balance ?? 0;
  const change = quote?.regularMarketChange ?? 0;
  const changePct = quote?.regularMarketChangePercent ?? 0;

  const quickPct = (pct) => {
    if (side === "buy") {
      const budget = cash * pct;
      const p = orderType === "limit" && Number(limit) > 0 ? Number(limit) : price;
      if (p > 0) setQty(Number((budget / p).toFixed(assetType === "crypto" ? 6 : 2)));
    } else if (pos) {
      setQty(Number((pos.quantity * pct).toFixed(assetType === "crypto" ? 6 : 2)));
    }
  };

  const submit = async () => {
    if (!qty || Number(qty) <= 0) { toast.error("Enter a quantity"); return; }
    setSubmitting(true);
    try {
      await api.post("/orders", {
        symbol, asset_type: assetType, side, order_type: orderType,
        quantity: Number(qty),
        limit_price: orderType === "limit" ? Number(limit) : null,
      });
      toast.success(`${side.toUpperCase()} ${qty} ${symbol} executed`);
      await Promise.all([loadPortfolio(), refresh()]);
    } catch (err) {
      const d = err?.response?.data?.detail || "Order failed";
      toast.error(typeof d === "string" ? d : "Order failed");
    } finally { setSubmitting(false); }
  };

  const addWatch = async () => {
    try {
      await api.post("/watchlist", { symbol, asset_type: assetType, name: quote?.shortName });
      toast.success("Added to watchlist");
    } catch {}
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
        {/* Symbol header */}
        <div className="bg-[#131722] border border-[#2A2E39] rounded px-4 py-3 flex flex-wrap items-center gap-4">
          <Link to="/markets" className="text-slate-500 hover:text-slate-200"><ArrowLeft size={18} /></Link>
          <div>
            <div className="flex items-center gap-2">
              <div className="font-display text-2xl font-extrabold" data-testid="trade-symbol">{symbol}</div>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1E222D] text-slate-400">{assetType}</span>
            </div>
            <div className="text-xs text-slate-500 max-w-md truncate">{quote?.shortName || quote?.longName}</div>
          </div>
          <div className="ml-auto flex items-center gap-6">
            <div>
              <div className="font-mono text-3xl font-bold text-slate-100" data-testid="trade-current-price">{fmtNumber(price, price < 1 ? 4 : 2)}</div>
              <div className={`font-mono text-xs ${trendClass(change)}`}>
                {change >= 0 ? "+" : ""}{fmtNumber(change)} ({fmtPct(changePct)})
              </div>
            </div>
            <button onClick={addWatch} data-testid="watchlist-add-btn"
                    className="p-2 rounded bg-[#1E222D] border border-[#2A2E39] text-slate-400 hover:text-[#FFB703]">
              <Star size={14} />
            </button>
          </div>
        </div>

        {/* Meta stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <MetaStat label="Prev Close" value={fmtNumber(quote?.regularMarketPreviousClose)} />
          <MetaStat label="Open" value={fmtNumber(quote?.regularMarketOpen)} />
          <MetaStat label="Day High" value={fmtNumber(quote?.regularMarketDayHigh)} />
          <MetaStat label="Day Low" value={fmtNumber(quote?.regularMarketDayLow)} />
          <MetaStat label="Volume" value={fmtCompact(quote?.regularMarketVolume)} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="xl:col-span-3">
            <PriceChart symbol={symbol} assetType={assetType} height={460} />
          </div>

          {/* Order Panel */}
          <div className="bg-[#131722] border border-[#2A2E39] rounded p-4 space-y-3 h-fit">
            <div className="flex bg-[#0B0E14] border border-[#2A2E39] rounded p-0.5">
              <button
                data-testid="buy-tab-btn"
                onClick={() => setSide("buy")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded ${
                  side === "buy" ? "bg-[#089981] text-white" : "text-slate-400"
                }`}
              >BUY</button>
              <button
                data-testid="sell-tab-btn"
                onClick={() => setSide("sell")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded ${
                  side === "sell" ? "bg-[#F23645] text-white" : "text-slate-400"
                }`}
              >SELL</button>
            </div>

            <div className="flex bg-[#0B0E14] border border-[#2A2E39] rounded text-xs">
              <button data-testid="order-type-market-tab"
                      onClick={() => setOrderType("market")}
                      className={`flex-1 py-1.5 ${orderType === "market" ? "text-[#2962FF] border-b-2 border-[#2962FF]" : "text-slate-400"}`}>MARKET</button>
              <button data-testid="order-type-limit-tab"
                      onClick={() => setOrderType("limit")}
                      className={`flex-1 py-1.5 ${orderType === "limit" ? "text-[#2962FF] border-b-2 border-[#2962FF]" : "text-slate-400"}`}>LIMIT</button>
            </div>

            {orderType === "limit" && (
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Limit Price</label>
                <input
                  data-testid="order-limit-input"
                  type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-[#2A2E39] rounded px-3 py-2 font-mono text-sm outline-none focus:border-[#2962FF]"
                  placeholder={String(price)}
                />
              </div>
            )}

            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider">Quantity</label>
              <input
                data-testid="order-amount-input"
                type="number" step={assetType === "crypto" ? "0.0001" : "0.01"}
                value={qty} onChange={(e) => setQty(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#2A2E39] rounded px-3 py-2 font-mono text-sm outline-none focus:border-[#2962FF]"
              />
              <div className="flex gap-1 mt-2">
                {[0.25, 0.5, 0.75, 1].map((p) => (
                  <button key={p} onClick={() => quickPct(p)}
                          data-testid={`quick-pct-${p * 100}`}
                          className="flex-1 text-[10px] py-1 rounded bg-[#1E222D] hover:bg-[#2A2E39] text-slate-300">
                    {p * 100}%
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#0B0E14] border border-[#2A2E39] rounded p-3 space-y-1 text-xs">
              <Row label="Est. Price" value={fmtMoney(orderType === "limit" && Number(limit) > 0 ? Number(limit) : price)} />
              <Row label="Total" value={fmtMoney(total)} bold />
              <Row label="Cash Available" value={fmtMoney(cash)} />
              {pos && <Row label="Position Qty" value={fmtNumber(pos.quantity, pos.quantity < 1 ? 4 : 2)} />}
            </div>

            <button
              data-testid="submit-order-button"
              onClick={submit} disabled={submitting}
              className={`w-full py-2.5 rounded font-bold text-sm text-white transition ${
                side === "buy" ? "bg-[#089981] hover:bg-[#067a67]" : "bg-[#F23645] hover:bg-[#d92e3e]"
              } disabled:opacity-60`}
            >
              {submitting ? "Submitting…" : `${side.toUpperCase()} ${symbol}`}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

const MetaStat = ({ label, value }) => (
  <div className="bg-[#131722] border border-[#2A2E39] rounded px-3 py-2">
    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
    <div className="font-mono text-sm text-slate-100 mt-0.5">{value}</div>
  </div>
);

const Row = ({ label, value, bold }) => (
  <div className="flex justify-between">
    <span className="text-slate-500">{label}</span>
    <span className={`font-mono ${bold ? "text-slate-100 font-semibold" : "text-slate-300"}`}>{value}</span>
  </div>
);

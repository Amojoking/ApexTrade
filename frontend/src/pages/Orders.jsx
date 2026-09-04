import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { toast } from "sonner";

const TABS = [
  { key: "all", label: "All" },
  { key: "filled", label: "Filled" },
  { key: "open", label: "Open" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("all");

  const load = async () => {
    try {
      const params = tab === "all" ? {} : { status: tab };
      const { data } = await api.get("/orders", { params });
      setOrders(data || []);
    } catch {}
  };
  useEffect(() => { load(); }, [tab]);

  const cancel = async (oid) => {
    try {
      await api.delete(`/orders/${oid}`);
      toast.success("Order cancelled");
      load();
    } catch { toast.error("Cancel failed"); }
  };

  return (
    <Layout>
      <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
        <h1 className="font-display text-2xl font-bold">Orders & History</h1>

        <div className="flex gap-1 bg-[#131722] border border-[#2A2E39] rounded p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              data-testid={`orders-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                tab === t.key ? "bg-[#2962FF] text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="bg-[#131722] border border-[#2A2E39] rounded overflow-hidden" data-testid="orders-table">
          <table className="w-full text-xs">
            <thead className="bg-[#1E222D] text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Symbol</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Side</th>
                <th className="text-right px-4 py-2 font-medium">Qty</th>
                <th className="text-right px-4 py-2 font-medium">Exec Price</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-500">No orders</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="border-t border-[#1E222D] hover:bg-[#1E222D]/60">
                  <td className="px-4 py-2.5 font-mono text-slate-400">
                    {new Date(o.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-100">{o.symbol}
                    <div className="text-[10px] text-slate-500 uppercase">{o.asset_type}</div>
                  </td>
                  <td className="px-4 py-2.5 uppercase text-slate-400">{o.order_type}</td>
                  <td className={`px-4 py-2.5 font-semibold uppercase ${o.side === "buy" ? "text-[#089981]" : "text-[#F23645]"}`}>{o.side}</td>
                  <td className="text-right font-mono">{fmtNumber(o.quantity, o.quantity < 1 ? 4 : 2)}</td>
                  <td className="text-right font-mono">{o.exec_price ? fmtMoney(o.exec_price) : "—"}</td>
                  <td className="text-right font-mono">{o.total ? fmtMoney(o.total) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-2 py-1 rounded font-semibold uppercase ${
                      o.status === "filled" ? "bg-[#089981]/15 text-[#089981]" :
                      o.status === "open" ? "bg-[#FFB703]/15 text-[#FFB703]" :
                      "bg-slate-700/40 text-slate-400"
                    }`}>{o.status}</span>
                  </td>
                  <td className="text-right">
                    {o.status === "open" && (
                      <button onClick={() => cancel(o.id)}
                              data-testid={`cancel-order-${o.id}`}
                              className="text-[10px] font-semibold px-2 py-1 rounded bg-[#F23645]/15 text-[#F23645] hover:bg-[#F23645]/25">
                        CANCEL
                      </button>
                    )}
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

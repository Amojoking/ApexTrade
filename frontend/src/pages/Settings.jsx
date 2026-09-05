import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { Crown, RefreshCw, User, Wallet, CreditCard, ExternalLink } from "lucide-react";

const Section = ({ title, icon: Icon, children, testid }) => (
  <section className="bg-[#131722] border border-[#2A2E39] rounded" data-testid={testid}>
    <div className="px-5 py-3 border-b border-[#2A2E39] flex items-center gap-2 text-sm font-semibold text-slate-200">
      <Icon size={15} className="text-[#2962FF]" /> {title}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const inputCls = "w-full bg-[#0B0E14] border border-[#2A2E39] rounded px-3 py-2 text-sm outline-none focus:border-[#2962FF]";
const btnCls = "text-xs font-semibold px-4 py-2 rounded bg-[#2962FF] hover:bg-[#1E53E5] text-white disabled:opacity-50 transition";

export default function SettingsPage() {
  const { user, setUser, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [startBal, setStartBal] = useState(user?.starting_balance || 100000);
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState("");
  const ent = billing?.entitlements || user?.entitlements || {};

  const loadBilling = () => api.get("/payments/billing").then(({ data }) => setBilling(data)).catch(() => {});
  useEffect(() => { loadBilling(); }, []);

  const saveName = async (e) => {
    e.preventDefault();
    setBusy("name");
    try {
      const { data } = await api.patch("/auth/profile", { name });
      setUser(data); toast.success("Profile updated");
    } catch { toast.error("Could not update profile"); } finally { setBusy(""); }
  };

  const resetBalance = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Reset portfolio? All positions and orders will be cleared and cash set to ${fmtMoney(Number(startBal))}.`)) return;
    setBusy("reset");
    try {
      await api.post("/portfolio/reset", { new_balance: Number(startBal) });
      toast.success(`Starting balance set to ${fmtMoney(Number(startBal))}`);
      await refresh(); loadBilling();
    } catch (err) { if (!err.handled) toast.error("Reset failed"); } finally { setBusy(""); }
  };

  const syncBilling = async () => {
    setBusy("sync");
    try {
      await api.post("/payments/sync");
      await refresh(); await loadBilling();
      toast.success("Billing status refreshed");
    } catch (err) { toast.error(err?.response?.data?.detail || "Sync failed"); } finally { setBusy(""); }
  };

  return (
    <Layout>
      <div className="p-4 lg:p-8 max-w-[900px] mx-auto space-y-5" data-testid="settings-page">
        <div>
          <div className="text-xs text-[#2962FF] uppercase tracking-[0.2em] font-semibold">Account</div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">Settings</h1>
        </div>

        <Section title="Profile" icon={User} testid="settings-profile">
          <form onSubmit={saveName} className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Display name</label>
              <input data-testid="settings-name-input" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
              <div className="text-xs text-slate-500 mt-1.5">{user?.email} · shown on the leaderboard</div>
            </div>
            <button type="submit" data-testid="settings-save-name-btn" className={btnCls} disabled={busy === "name" || !name.trim()}>Save</button>
          </form>
        </Section>

        <Section title="Paper cash" icon={Wallet} testid="settings-balance">
          <form onSubmit={resetBalance} className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500">Starting balance (USD)</label>
              <input data-testid="settings-start-balance-input" type="number" min={1000} step={1000} className={`${inputCls} font-mono`} value={startBal} onChange={(e) => setStartBal(e.target.value)} />
              <div className="text-xs text-slate-500 mt-1.5">
                Resets your portfolio. {ent.resets_max != null ? `${Math.max(0, ent.resets_max - (ent.resets_used || 0))} of ${ent.resets_max} free resets left.` : "Unlimited resets on your plan."}
              </div>
            </div>
            <button type="submit" data-testid="settings-reset-btn" className="text-xs font-semibold px-4 py-2 rounded bg-[#F23645] hover:bg-[#d92e3e] text-white disabled:opacity-50" disabled={busy === "reset"}>Reset portfolio</button>
          </form>
        </Section>

        <Section title="Plan & billing" icon={CreditCard} testid="settings-billing">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-lg font-bold" data-testid="settings-plan-name">
                {ent.limits_removed ? <><Crown size={16} className="text-[#FFB703]" /> Lifetime</> :
                 ent.is_pro ? <><Crown size={16} className="text-[#FFB703]" /> Pro</> : "Free plan"}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {ent.limits_removed ? "All limits removed forever." :
                 ent.is_pro ? `${ent.cancel_at_period_end ? "Cancels" : "Renews"} ${new Date(ent.pro_until).toLocaleDateString()}${ent.subscription_status ? ` · ${ent.subscription_status}` : ""}` :
                 "5 watchlist symbols · 3 portfolio resets"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={syncBilling} data-testid="settings-sync-billing-btn" disabled={busy === "sync"}
                className="text-xs font-semibold px-3 py-2 rounded bg-[#1E222D] border border-[#2A2E39] hover:border-slate-500 text-slate-200 flex items-center gap-2 disabled:opacity-50">
                <RefreshCw size={12} className={busy === "sync" ? "animate-spin" : ""} /> Refresh status
              </button>
              {!ent.limits_removed && <Link to="/pricing" data-testid="settings-upgrade-link" className={btnCls}>{ent.is_pro ? "Change plan" : "Upgrade"}</Link>}
            </div>
          </div>
          {ent.is_pro && !ent.limits_removed && (
            <p className="text-xs text-slate-500 mt-4">
              To cancel or update your card, use the "Manage subscription" link in your Stripe receipt email, then hit Refresh status here.
            </p>
          )}
          <div className="mt-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Payment history</div>
            {!billing ? <div className="h-8 rounded bg-[#1E222D]/60 animate-pulse" /> :
             billing.history.length === 0 ? <div className="text-xs text-slate-500">No payments yet.</div> : (
              <div className="divide-y divide-[#1E222D] border border-[#2A2E39] rounded" data-testid="settings-payment-history">
                {billing.history.map((h) => (
                  <div key={h.session_id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">{h.lookup_key?.replace("_", " ")}</div>
                      <div className="text-slate-500">{new Date(h.created_at).toLocaleString()}{h.live === false && " · test"}</div>
                    </div>
                    <div className="font-mono">{fmtMoney(h.amount)} <span className="text-[#089981] ml-2 uppercase text-[10px]">{h.payment_status}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-600 mt-4 flex items-center gap-1">Payments secured by Stripe <ExternalLink size={10} /></div>
        </Section>
      </div>
    </Layout>
  );
}

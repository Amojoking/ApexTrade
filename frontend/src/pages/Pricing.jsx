import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Check, Crown, Infinity as InfinityIcon, Zap, Bitcoin, CreditCard } from "lucide-react";

const FEATURES = {
  pro: ["Unlimited watchlist symbols", "Unlimited portfolio resets", "Priority market data refresh", "Pro badge on your profile"],
  unlimited: ["Everything in Pro, forever", "One payment, no renewals", "Unlimited watchlist & resets", "Lifetime badge"],
};

export default function Pricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  const ent = user?.entitlements || {};

  useEffect(() => {
    api.get("/payments/plans").then(({ data }) => setPlans(data.plans || [])).catch(() => {});
  }, []);

  const checkout = async (lookup_key) => {
    setBusy(lookup_key);
    try {
      const { data } = await api.post("/payments/checkout", { lookup_key, origin_url: window.location.origin });
      window.location.href = data.checkout_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not start checkout");
      setBusy(null);
    }
  };

  const byKey = Object.fromEntries(plans.map((p) => [p.lookup_key, p]));
  const monthly = byKey.pro_monthly, yearly = byKey.pro_yearly, lifetime = byKey.unlimited_lifetime;

  return (
    <Layout>
      <div className="p-4 lg:p-8 max-w-[1200px] mx-auto space-y-8" data-testid="pricing-page">
        <div className="max-w-2xl">
          <div className="text-xs text-[#2962FF] uppercase tracking-[0.2em] font-semibold">Upgrade</div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight mt-2">Trade without limits.</h1>
          <p className="text-slate-400 mt-3 text-sm md:text-base">
            Free accounts get {ent.watchlist_max ?? 5} watchlist slots and {ent.resets_max ?? 3} portfolio resets.
            Go Pro or grab the lifetime pass to remove every cap.
          </p>
          <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><CreditCard size={14} /> Cards</span>
            <span className="flex items-center gap-1.5"><Bitcoin size={14} /> Crypto (USDC) where available</span>
            <span>Secured by Stripe</span>
          </div>
        </div>

        {(ent.is_pro || ent.limits_removed) && (
          <div className="bg-[#131722] border border-[#089981]/40 rounded px-4 py-3 text-sm flex items-center gap-3" data-testid="current-plan-banner">
            <Crown size={16} className="text-[#FFB703]" />
            <span className="text-slate-200">
              {ent.limits_removed ? "You own the Lifetime pass — all limits removed." : `Pro active until ${new Date(ent.pro_until).toLocaleDateString()}.`}
            </span>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <PlanCard
            testid="plan-pro-monthly" icon={Zap} title="Pro Monthly" price={monthly?.amount} suffix="/mo"
            features={FEATURES.pro} busy={busy === "pro_monthly"} disabled={!monthly || ent.limits_removed}
            onClick={() => checkout("pro_monthly")} cta={ent.is_pro ? "Extend Pro" : "Start Pro"}
          />
          <PlanCard
            testid="plan-pro-yearly" icon={Crown} title="Pro Yearly" price={yearly?.amount} suffix="/yr" highlight
            badge="Save 34%" features={FEATURES.pro} busy={busy === "pro_yearly"} disabled={!yearly || ent.limits_removed}
            onClick={() => checkout("pro_yearly")} cta={ent.is_pro ? "Extend Pro" : "Start Pro Yearly"}
          />
          <PlanCard
            testid="plan-unlimited-lifetime" icon={InfinityIcon} title="Unlimited Lifetime" price={lifetime?.amount} suffix=" once"
            features={FEATURES.unlimited} busy={busy === "unlimited_lifetime"} disabled={!lifetime || ent.limits_removed}
            onClick={() => checkout("unlimited_lifetime")} cta={ent.limits_removed ? "Owned" : "Remove Limits Forever"}
          />
        </div>
        <p className="text-xs text-slate-600">Prices in USD, exclusive of tax — applicable VAT/sales tax is added at checkout. Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC.</p>
      </div>
    </Layout>
  );
}

const PlanCard = ({ testid, icon: Icon, title, price, suffix, features, highlight, badge, busy, disabled, onClick, cta }) => (
  <div
    data-testid={testid}
    className={`relative bg-[#131722] border rounded p-6 flex flex-col transition hover:-translate-y-0.5 ${
      highlight ? "border-[#2962FF] glow-blue" : "border-[#2A2E39]"
    }`}
  >
    {badge && (
      <span className="absolute -top-2.5 right-4 text-[10px] uppercase tracking-wider bg-[#2962FF] text-white px-2 py-0.5 rounded">{badge}</span>
    )}
    <div className="flex items-center gap-2 text-slate-300">
      <Icon size={16} className={highlight ? "text-[#2962FF]" : "text-slate-400"} />
      <span className="text-sm font-semibold">{title}</span>
    </div>
    <div className="mt-4 font-mono">
      <span className="text-4xl font-bold text-slate-100" data-testid={`${testid}-price`}>
        {price !== undefined ? `$${price}` : "—"}
      </span>
      <span className="text-slate-500 text-sm">{suffix}</span>
    </div>
    <ul className="mt-5 space-y-2 flex-1">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
          <Check size={14} className="text-[#089981] mt-0.5 shrink-0" /> {f}
        </li>
      ))}
    </ul>
    <button
      data-testid={`${testid}-checkout-btn`}
      onClick={onClick} disabled={disabled || busy}
      className={`mt-6 w-full py-2.5 rounded font-semibold text-sm transition disabled:opacity-50 ${
        highlight ? "bg-[#2962FF] hover:bg-[#1E53E5] text-white" : "bg-[#1E222D] hover:bg-[#2A2E39] border border-[#2A2E39] text-slate-100"
      }`}
    >
      {busy ? "Redirecting to Stripe…" : cta}
    </button>
  </div>
);

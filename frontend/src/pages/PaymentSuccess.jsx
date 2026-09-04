import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

const MAX_POLLS = 8;

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { refresh } = useAuth();
  const [state, setState] = useState("checking");
  const [plan, setPlan] = useState(null);
  const polls = useRef(0);

  useEffect(() => {
    if (!sessionId) { setState("error"); return; }
    let timer;
    const poll = async () => {
      polls.current += 1;
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        setPlan(data.lookup_key);
        if (data.payment_status === "paid") { setState("paid"); await refresh(); return; }
        if (["expired", "failed"].includes(data.status)) { setState("failed"); return; }
      } catch { /* keep polling */ }
      if (polls.current >= MAX_POLLS) { setState("timeout"); return; }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [sessionId]);

  const view = {
    checking: { icon: Clock, color: "text-[#2962FF]", title: "Confirming your payment…", body: "This usually takes a couple of seconds." },
    paid: { icon: CheckCircle2, color: "text-[#089981]", title: "You're upgraded!", body: plan === "unlimited_lifetime" ? "Lifetime pass active — every limit is gone." : "Pro is active on your account. Enjoy unlimited watchlists and resets." },
    failed: { icon: XCircle, color: "text-[#F23645]", title: "Payment didn't go through", body: "No charge was made. You can try again anytime." },
    timeout: { icon: Clock, color: "text-[#FFB703]", title: "Still processing", body: "Your payment is being confirmed. Check back in a minute — your upgrade will apply automatically." },
    error: { icon: XCircle, color: "text-[#F23645]", title: "Missing session", body: "We couldn't find a checkout session to verify." },
  }[state];

  return (
    <Layout>
      <div className="p-6 lg:p-12 max-w-xl mx-auto" data-testid="payment-success-page" data-state={state}>
        <div className="bg-[#131722] border border-[#2A2E39] rounded p-8 text-center space-y-4">
          <view.icon size={44} className={`mx-auto ${view.color} ${state === "checking" ? "animate-pulse" : ""}`} />
          <h1 className="font-display text-2xl font-bold" data-testid="payment-status-title">{view.title}</h1>
          <p className="text-sm text-slate-400">{view.body}</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/" data-testid="payment-go-dashboard" className="bg-[#2962FF] hover:bg-[#1E53E5] text-white text-sm font-semibold px-4 py-2 rounded">Go to Dashboard</Link>
            {state !== "paid" && <Link to="/pricing" className="bg-[#1E222D] border border-[#2A2E39] text-slate-200 text-sm font-semibold px-4 py-2 rounded">Back to Plans</Link>}
          </div>
        </div>
      </div>
    </Layout>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { XCircle } from "lucide-react";

export default function PaymentCancel() {
  return (
    <Layout>
      <div className="p-6 lg:p-12 max-w-xl mx-auto" data-testid="payment-cancel-page">
        <div className="bg-[#131722] border border-[#2A2E39] rounded p-8 text-center space-y-4">
          <XCircle size={44} className="mx-auto text-slate-500" />
          <h1 className="font-display text-2xl font-bold">Checkout cancelled</h1>
          <p className="text-sm text-slate-400">No charge was made. Your free account is unchanged.</p>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/pricing" data-testid="cancel-back-to-plans" className="bg-[#2962FF] hover:bg-[#1E53E5] text-white text-sm font-semibold px-4 py-2 rounded">Back to Plans</Link>
            <Link to="/" className="bg-[#1E222D] border border-[#2A2E39] text-slate-200 text-sm font-semibold px-4 py-2 rounded">Dashboard</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}

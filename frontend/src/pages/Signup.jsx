import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { TrendingUp, ArrowRight } from "lucide-react";
import { GoogleButton } from "@/components/GoogleButton";

export default function Signup() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: "", email: "", password: "", starting_balance: 100000,
  });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({
        ...form,
        email: form.email.trim().toLowerCase(),
        starting_balance: Number(form.starting_balance) || 100000,
      });
      toast.success("Account created — welcome!");
      nav("/");
    } catch (err) {
      const detail = err?.response?.data?.detail || "Signup failed";
      toast.error(typeof detail === "string" ? detail : "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0B0E14]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#131722] border-r border-[#2A2E39] relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-[#2962FF] flex items-center justify-center glow-blue">
            <TrendingUp className="text-white" size={22} />
          </div>
          <span className="font-display text-2xl font-extrabold tracking-tight">
            APEX<span className="text-[#2962FF]">TRADE</span> PRO
          </span>
        </div>
        <div className="relative z-10">
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight">
            Start with any<br />balance you want.
          </h1>
          <p className="text-slate-400 mt-4 max-w-md">
            Custom starting cash. Real-time prices from Yahoo Finance & CoinGecko-grade feeds. Full order book, positions, and P/L tracking.
          </p>
        </div>
        <div className="relative z-10 text-xs text-slate-600">Paper trading only. Not investment advice.</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <h2 className="font-display text-3xl font-bold tracking-tight">Create your paper account</h2>
          <p className="text-slate-400 mt-2 text-sm">You can adjust starting balance later.</p>
          <form onSubmit={submit} className="space-y-4 mt-8" data-testid="signup-form">
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Full Name</label>
              <input
                data-testid="signup-name-input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded px-3 py-2.5 text-sm outline-none focus:border-[#2962FF]"
                placeholder="Jane Trader"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email</label>
              <input
                data-testid="signup-email-input"
                type="email" required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded px-3 py-2.5 text-sm outline-none focus:border-[#2962FF]"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Password</label>
              <input
                data-testid="signup-password-input"
                type="password" required minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded px-3 py-2.5 text-sm outline-none focus:border-[#2962FF]"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Starting Paper Balance (USD)</label>
              <input
                data-testid="signup-balance-input"
                type="number" min="100" step="100"
                value={form.starting_balance}
                onChange={(e) => setForm({ ...form, starting_balance: e.target.value })}
                className="mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded px-3 py-2.5 text-sm font-mono outline-none focus:border-[#2962FF]"
              />
              <p className="text-xs text-slate-500 mt-1">Default $100,000 · adjust anytime</p>
            </div>
            <button
              type="submit" disabled={loading}
              data-testid="signup-submit-btn"
              className="w-full bg-[#2962FF] hover:bg-[#1E53E5] text-white font-semibold py-2.5 rounded transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? "Creating..." : (<>Create account <ArrowRight size={16} /></>)}
            </button>
          </form>
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#2A2E39]" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[#2A2E39]" />
          </div>
          <GoogleButton label="Sign up with Google" />
          <p className="text-center text-sm text-slate-400 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-[#2962FF] hover:underline" data-testid="link-login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

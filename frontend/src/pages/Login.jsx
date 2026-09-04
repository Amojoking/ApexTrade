import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { TrendingUp, ArrowRight } from "lucide-react";
import { GoogleButton } from "@/components/GoogleButton";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back to ApexTrade Pro");
      nav("/");
    } catch (err) {
      const detail = err?.response?.data?.detail || "Login failed";
      toast.error(typeof detail === "string" ? detail : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const demo = async () => {
    setEmail("admin@apextrade.com");
    setPassword("admin123");
    setLoading(true);
    try {
      await login("admin@apextrade.com", "admin123");
      toast.success("Signed in as demo");
      nav("/");
    } catch {
      toast.error("Demo login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#0B0E14]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#131722] border-r border-[#2A2E39] relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[#2962FF] flex items-center justify-center glow-blue">
              <TrendingUp className="text-white" size={22} />
            </div>
            <span className="font-display text-2xl font-extrabold tracking-tight">
              APEX<span className="text-[#2962FF]">TRADE</span> PRO
            </span>
          </div>
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.05]">
            Master the markets.<br />
            <span className="text-[#2962FF]">Zero risk.</span>
          </h1>
          <p className="text-slate-400 text-base max-w-md">
            Trade stocks, crypto, and ETFs with live market data and a $100,000 paper portfolio.
            Real prices, real charts, real strategy — no real money on the line.
          </p>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {[
              { k: "$100K", v: "Starting Cash" },
              { k: "3,000+", v: "Symbols" },
              { k: "24/7", v: "Live Data" },
            ].map((s) => (
              <div key={s.v} className="bg-[#1E222D] border border-[#2A2E39] p-3 rounded">
                <div className="font-mono text-lg font-bold text-slate-100">{s.k}</div>
                <div className="text-xs text-slate-500 uppercase tracking-wider mt-1">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-slate-600">© ApexTrade Pro — Simulated trading environment</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold tracking-tight">Sign in</h2>
            <p className="text-slate-400 mt-2 text-sm">Access your paper trading terminal</p>
          </div>
          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email</label>
              <input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded px-3 py-2.5 text-sm outline-none focus:border-[#2962FF] transition"
                placeholder="you@apextrade.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Password</label>
              <input
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-[#131722] border border-[#2A2E39] rounded px-3 py-2.5 text-sm outline-none focus:border-[#2962FF] transition"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-btn"
              className="w-full bg-[#2962FF] hover:bg-[#1E53E5] text-white font-semibold py-2.5 rounded transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? "Signing in..." : (<>Sign in <ArrowRight size={16} /></>)}
            </button>
          </form>
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#2A2E39]" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-[#2A2E39]" />
          </div>
          <div className="space-y-3">
            <GoogleButton />
            <button
              onClick={demo}
              data-testid="demo-login-btn"
              className="w-full bg-[#131722] hover:bg-[#1E222D] border border-[#2A2E39] text-slate-200 font-semibold py-2.5 rounded transition"
            >
              Try Demo Account
            </button>
          </div>
          <p className="text-center text-sm text-slate-400 mt-6">
            New to ApexTrade?{" "}
            <Link to="/signup" className="text-[#2962FF] hover:underline" data-testid="link-signup">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

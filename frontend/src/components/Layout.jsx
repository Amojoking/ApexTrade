import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import TickerTape from "@/components/TickerTape";
import { LayoutDashboard, Store, Briefcase, ClipboardList, LogOut, TrendingUp, Crown, Trophy, Settings, Menu, X } from "lucide-react";
import { fmtMoney } from "@/lib/format";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-link-dashboard", end: true },
  { to: "/markets", label: "Markets", icon: Store, testid: "nav-link-markets" },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase, testid: "nav-link-portfolio" },
  { to: "/orders", label: "Orders", icon: ClipboardList, testid: "nav-link-orders" },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy, testid: "nav-link-leaderboard" },
];

const navClass = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
    isActive ? "bg-[#1E222D] text-white" : "text-slate-400 hover:text-slate-200 hover:bg-[#1E222D]"
  }`;

export const Brand = ({ onClick }) => (
  <div className="flex items-center gap-2 cursor-pointer select-none" onClick={onClick} data-testid="brand-logo">
    <div className="w-8 h-8 rounded-md bg-[#2962FF] flex items-center justify-center glow-blue">
      <TrendingUp size={18} className="text-white" />
    </div>
    <span className="font-display font-extrabold tracking-tight text-lg">
      APEX<span className="text-[#2962FF]">TRADE</span>
    </span>
  </div>
);

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ent = user?.entitlements;

  const PlanPill = ({ className = "" }) => ent?.unlimited ? (
    <NavLink to="/pricing" data-testid="pro-badge" onClick={() => setOpen(false)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#FFB703]/40 bg-[#FFB703]/10 text-[#FFB703] text-xs font-bold uppercase tracking-wider ${className}`}>
      <Crown size={12} /> {ent.limits_removed ? "Lifetime" : "Pro"}
    </NavLink>
  ) : (
    <NavLink to="/pricing" data-testid="upgrade-nav-btn" onClick={() => setOpen(false)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition ${className}`}>
      <Crown size={13} /> Upgrade
    </NavLink>
  );

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200">
      <TickerTape />
      <header className="bg-[#131722] border-b border-[#2A2E39] sticky top-0 z-40">
        <div className="flex items-center h-14 px-3 sm:px-4 gap-1">
          <button className="lg:hidden p-2 -ml-1 mr-1 text-slate-300 hover:bg-[#1E222D] rounded" data-testid="mobile-menu-btn"
                  onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="pr-4 lg:pr-6"><Brand onClick={() => navigate("/")} /></div>
          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid} className={navClass}>
                <n.icon size={16} /><span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <PlanPill className="hidden sm:flex" />
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 bg-[#1E222D] rounded border border-[#2A2E39]">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Cash</span>
              <span className="font-mono text-sm font-semibold text-slate-100" data-testid="portfolio-cash-balance-nav">
                {fmtMoney(user?.cash_balance ?? 0)}
              </span>
            </div>
            <NavLink to="/settings" data-testid="user-account-menu" title="Settings"
              className={({ isActive }) => `flex items-center gap-2 px-2 py-1 border rounded transition ${isActive ? "border-[#2962FF]" : "border-[#2A2E39] hover:border-slate-500"}`}>
              {user?.picture ? (
                <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2962FF] to-[#8A2BE2] flex items-center justify-center text-xs font-bold">
                  {(user?.name || user?.email || "?")[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs text-slate-300 hidden md:inline max-w-[140px] truncate">{user?.name || user?.email}</span>
              <Settings size={14} className="text-slate-500 hidden md:inline" />
            </NavLink>
            <button onClick={async () => { await logout(); navigate("/login"); }} data-testid="logout-btn"
              className="p-2 rounded hover:bg-[#1E222D] text-slate-400 hover:text-slate-200" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {open && (
          <div className="lg:hidden border-t border-[#2A2E39] bg-[#131722] px-3 py-3 space-y-1" data-testid="mobile-nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} data-testid={`mobile-${n.testid}`}
                className={({ isActive }) => `${navClass({ isActive })} w-full`}>
                <n.icon size={16} /><span>{n.label}</span>
              </NavLink>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-[#2A2E39] mt-2">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Cash <span className="font-mono text-slate-100 ml-2">{fmtMoney(user?.cash_balance ?? 0)}</span></div>
              <PlanPill />
            </div>
          </div>
        )}
      </header>
      <main className="min-h-[calc(100vh-100px)]">{children}</main>
    </div>
  );
}

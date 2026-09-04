import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import TickerTape from "@/components/TickerTape";
import { LayoutDashboard, Store, Briefcase, ClipboardList, LogOut, TrendingUp, Crown } from "lucide-react";
import { fmtMoney } from "@/lib/format";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-link-dashboard", end: true },
  { to: "/markets", label: "Markets", icon: Store, testid: "nav-link-markets" },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase, testid: "nav-link-portfolio" },
  { to: "/orders", label: "Orders", icon: ClipboardList, testid: "nav-link-orders" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200">
      <TickerTape />
      <header className="bg-[#131722] border-b border-[#2A2E39] sticky top-0 z-40">
        <div className="flex items-center h-14 px-4 gap-1">
          <div
            className="flex items-center gap-2 pr-6 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-8 h-8 rounded-md bg-[#2962FF] flex items-center justify-center glow-blue">
              <TrendingUp size={18} className="text-white" />
            </div>
            <span className="font-display font-extrabold tracking-tight text-lg">
              APEX<span className="text-[#2962FF]">TRADE</span>
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={n.testid}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#1E222D] text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#1E222D]"
                  }`
                }
              >
                <n.icon size={16} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user?.entitlements?.unlimited ? (
              <NavLink to="/pricing" data-testid="pro-badge"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#FFB703]/40 bg-[#FFB703]/10 text-[#FFB703] text-xs font-bold uppercase tracking-wider">
                <Crown size={12} /> {user.entitlements.limits_removed ? "Lifetime" : "Pro"}
              </NavLink>
            ) : (
              <NavLink to="/pricing" data-testid="upgrade-nav-btn"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition">
                <Crown size={13} /> Upgrade
              </NavLink>
            )}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-[#1E222D] rounded border border-[#2A2E39]">
              <span className="text-xs text-slate-500 uppercase tracking-wider">Cash</span>
              <span
                className="font-mono text-sm font-semibold text-slate-100"
                data-testid="portfolio-cash-balance-nav"
              >
                {fmtMoney(user?.cash_balance ?? 0)}
              </span>
            </div>
            <div
              className="flex items-center gap-2 px-2 py-1 border border-[#2A2E39] rounded"
              data-testid="user-account-menu"
            >
              {user?.picture ? (
                <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2962FF] to-[#8A2BE2] flex items-center justify-center text-xs font-bold">
                  {(user?.name || user?.email || "?")[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-xs text-slate-300 hidden md:inline">{user?.name || user?.email}</span>
            </div>
            <button
              onClick={async () => { await logout(); navigate("/login"); }}
              data-testid="logout-btn"
              className="p-2 rounded hover:bg-[#1E222D] text-slate-400 hover:text-slate-200"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="min-h-[calc(100vh-100px)]">{children}</main>
    </div>
  );
}

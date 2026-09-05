import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import AuthCallback from "@/pages/AuthCallback";
import Dashboard from "@/pages/Dashboard";
import Markets from "@/pages/Markets";
import Trade from "@/pages/Trade";
import Portfolio from "@/pages/Portfolio";
import Orders from "@/pages/Orders";
import Pricing from "@/pages/Pricing";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import Landing from "@/pages/Landing";
import Leaderboard from "@/pages/Leaderboard";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/NotFound";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] text-slate-500 text-sm">Loading terminal…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AuthOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#0B0E14]" />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading || user === null) return <div className="min-h-screen bg-[#0B0E14]" />;
  return user ? <Dashboard /> : <Landing />;
}

function AppRouter() {
  const location = useLocation();
  // Must read useLocation().hash (reactive) — detect OAuth callback before any protected route
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<AuthOnly><Login /></AuthOnly>} />
      <Route path="/signup" element={<AuthOnly><Signup /></AuthOnly>} />
      <Route path="/" element={<Home />} />
      <Route path="/leaderboard" element={<Protected><Leaderboard /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="/markets" element={<Protected><Markets /></Protected>} />
      <Route path="/trade/:symbol" element={<Protected><Trade /></Protected>} />
      <Route path="/portfolio" element={<Protected><Portfolio /></Protected>} />
      <Route path="/orders" element={<Protected><Orders /></Protected>} />
      <Route path="/pricing" element={<Protected><Pricing /></Protected>} />
      <Route path="/payment/success" element={<Protected><PaymentSuccess /></Protected>} />
      <Route path="/payment/cancel" element={<Protected><PaymentCancel /></Protected>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster theme="dark" position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

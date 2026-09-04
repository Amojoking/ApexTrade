import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Markets from "@/pages/Markets";
import Trade from "@/pages/Trade";
import Portfolio from "@/pages/Portfolio";
import Orders from "@/pages/Orders";

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

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthOnly><Login /></AuthOnly>} />
            <Route path="/signup" element={<AuthOnly><Signup /></AuthOnly>} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/markets" element={<Protected><Markets /></Protected>} />
            <Route path="/trade/:symbol" element={<Protected><Trade /></Protected>} />
            <Route path="/portfolio" element={<Protected><Portfolio /></Protected>} />
            <Route path="/orders" element={<Protected><Orders /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster theme="dark" position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

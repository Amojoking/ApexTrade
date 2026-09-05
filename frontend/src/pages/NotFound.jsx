import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/components/Layout";

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 grid-bg flex items-center justify-center p-6" data-testid="not-found-page">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-8"><Brand /></div>
        <div className="font-mono text-[#F23645] text-sm tracking-widest">ERR 404 · SYMBOL NOT FOUND</div>
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">This page got delisted.</h1>
        <p className="text-slate-400 mt-3 text-sm">The route you're looking for doesn't trade here.</p>
        <Link to={user ? "/" : "/login"} data-testid="not-found-home-btn"
          className="inline-block mt-8 bg-[#2962FF] hover:bg-[#1E53E5] text-white font-semibold px-5 py-2.5 rounded">
          {user ? "Back to Dashboard" : "Go to Login"}
        </Link>
      </div>
    </div>
  );
}

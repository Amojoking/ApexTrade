import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

// Handles {origin}/#session_id=... returned by Emergent Google Auth
export default function AuthCallback() {
  const hasProcessed = useRef(false);
  const { setUser } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");
    const finish = (path) => {
      window.history.replaceState(null, "", window.location.pathname);
      nav(path, { replace: true });
    };
    if (!sessionId) return finish("/login");
    api.post("/auth/google/session", { session_id: sessionId })
      .then(({ data }) => {
        if (data.token) localStorage.setItem("apex_token", data.token);
        setUser(data.user);
        toast.success(`Signed in as ${data.user.name || data.user.email}`);
        finish("/");
      })
      .catch(() => {
        setUser(false);
        toast.error("Google sign-in failed. Please try again.");
        finish("/login");
      });
  }, [nav, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B0E14] text-slate-500 text-sm" data-testid="auth-callback">
      Signing you in…
    </div>
  );
}

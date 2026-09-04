import axios from "axios";
import { toast } from "sonner";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Attach bearer token if present (fallback to cookies)
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("apex_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Free-tier limit hit → prompt upgrade once, centrally
api.interceptors.response.use(undefined, (err) => {
  if (err?.response?.status === 402) {
    err.handled = true;
    toast.error(err.response.data?.detail || "Upgrade required", {
      duration: 8000,
      action: { label: "Upgrade", onClick: () => { window.location.href = "/pricing"; } },
    });
  }
  return Promise.reject(err);
});

import axios from "axios";

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

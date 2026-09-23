import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api, { apiError } from "@/lib/api";

const AuthContext = createContext(null);
const UNAVAILABLE_MESSAGE = "Innos can't reach its backend. Start MongoDB and the API, then try again.";
const isUnavailable = (error) => !error.response || error.response.status >= 500;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out, object = user
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");
  const manualAuth = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (authError) {
      if (manualAuth.current) return; // don't override a fresh login
      if (isUnavailable(authError)) setServerError(UNAVAILABLE_MESSAGE);
      try {
        const { data } = await api.post("/auth/refresh");
        setServerError("");
        setUser(data);
      } catch (refreshError) {
        if (isUnavailable(refreshError)) setServerError(UNAVAILABLE_MESSAGE);
        setUser(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setServerError("");
      manualAuth.current = true;
      setUser(data);
      return true;
    } catch (e) {
      setError(isUnavailable(e) ? UNAVAILABLE_MESSAGE : apiError(e.response.data?.detail));
      return false;
    }
  };

  const register = async (details) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", details);
      setServerError("");
      manualAuth.current = true;
      setUser(data);
      return true;
    } catch (e) {
      setError(isUnavailable(e) ? UNAVAILABLE_MESSAGE : apiError(e.response.data?.detail));
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    manualAuth.current = false;
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, error, setError, serverError, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

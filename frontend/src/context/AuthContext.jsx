import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api, { apiError, setToken, getToken } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out, object = user
  const [error, setError] = useState("");
  const manualAuth = useRef(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      if (manualAuth.current) return; // don't override a fresh login
      setToken(null);
      setUser(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      manualAuth.current = true;
      setToken(data.access_token);
      setUser(data);
      return true;
    } catch (e) {
      setError(apiError(e.response?.data?.detail) || e.message);
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    manualAuth.current = false;
    setToken(null);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, error, setError, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

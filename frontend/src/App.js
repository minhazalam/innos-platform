import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/nav";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Reservations from "@/pages/Reservations";
import Calendar from "@/pages/Calendar";
import Rooms from "@/pages/Rooms";
import Guests from "@/pages/Guests";
import Payments from "@/pages/Payments";
import Staff from "@/pages/Staff";
import SettingsPage from "@/pages/Settings";
import StaffMobile from "@/pages/StaffMobile";
import Shell from "@/pages/Shell";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading HotelOS…</p>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <Loading />;
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ path, element }) {
  const { user } = useAuth();
  if (!canAccess(user.role, path)) return <Navigate to="/" replace />;
  return element;
}

function AppRoutes() {
  const { user } = useAuth();
  if (user === null) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            {["housekeeping", "maintenance"].includes(user.role) ? (
              <StaffMobile />
            ) : (
              <Shell>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/reservations" element={<RoleRoute path="/reservations" element={<Reservations />} />} />
                  <Route path="/calendar" element={<RoleRoute path="/calendar" element={<Calendar />} />} />
                  <Route path="/rooms" element={<RoleRoute path="/rooms" element={<Rooms />} />} />
                  <Route path="/guests" element={<RoleRoute path="/guests" element={<Guests />} />} />
                  <Route path="/payments" element={<RoleRoute path="/payments" element={<Payments />} />} />
                  <Route path="/staff" element={<RoleRoute path="/staff" element={<Staff />} />} />
                  <Route path="/settings" element={<RoleRoute path="/settings" element={<SettingsPage />} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
            )}
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

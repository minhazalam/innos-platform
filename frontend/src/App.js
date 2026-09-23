import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { canAccess } from "@/lib/nav";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AccountsDashboard from "@/pages/AccountsDashboard";
import Reservations from "@/pages/Reservations";
import Calendar from "@/pages/Calendar";
import Rooms from "@/pages/Rooms";
import Guests from "@/pages/Guests";
import Payments from "@/pages/Payments";
import Staff from "@/pages/Staff";
import SettingsPage from "@/pages/Settings";
import StaffMobile from "@/pages/StaffMobile";
import Operations from "@/pages/Operations";
import GuestRequests from "@/pages/GuestRequests";
import Maintenance from "@/pages/Maintenance";
import PublicBooking from "@/pages/PublicBooking";
import BookingWebsite from "@/pages/BookingWebsite";
import Analytics from "@/pages/Analytics";
import Audit from "@/pages/Audit";
import AIManager from "@/pages/AIManager";
import Reconciliation from "@/pages/Reconciliation";
import Shell from "@/pages/Shell";
import SetupWizard from "@/pages/SetupWizard";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading Innos…</p>
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

  // Auth starts as null while the session is being checked. Return before
  // evaluating role-specific routes so a cold or offline start never reads
  // `role` from null.
  if (user === null) return <Loading />;
  if (user === false) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/book/:slug" element={<PublicBooking />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user === null ? <Loading /> : user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/book/:slug" element={<PublicBooking />} />
      <Route
        path="/*"
        element={
          <Protected>
            {user && ["housekeeping", "maintenance"].includes(user.role) ? (
              <StaffMobile />
            ) : (
              <Shell>
                <Routes>
                  <Route path="/setup" element={user.role === "owner" ? <SetupWizard /> : <Navigate to="/" replace />} />
                  <Route path="/" element={user.role === "accounts" ? <AccountsDashboard /> : <Dashboard />} />
                  <Route path="/reservations" element={<RoleRoute path="/reservations" element={<Reservations />} />} />
                  <Route path="/calendar" element={<RoleRoute path="/calendar" element={<Calendar />} />} />
                  <Route path="/rooms" element={<RoleRoute path="/rooms" element={<Rooms />} />} />
                  <Route path="/guests" element={<RoleRoute path="/guests" element={<Guests />} />} />
                  <Route path="/housekeeping" element={<RoleRoute path="/housekeeping" element={<Operations initialTab="housekeeping" />} />} />
                  <Route path="/guest-requests" element={<RoleRoute path="/guest-requests" element={<GuestRequests />} />} />
                  <Route path="/maintenance" element={<RoleRoute path="/maintenance" element={user.role === "front_desk" ? <Maintenance /> : <Operations initialTab="maintenance" />} />} />
                  <Route path="/booking-website" element={<RoleRoute path="/booking-website" element={<BookingWebsite />} />} />
                  <Route path="/analytics" element={<RoleRoute path="/analytics" element={<Analytics />} />} />
                  <Route path="/audit" element={<RoleRoute path="/audit" element={<Audit />} />} />
                  <Route path="/ai-manager" element={<RoleRoute path="/ai-manager" element={<AIManager />} />} />
                  <Route path="/payments" element={<RoleRoute path="/payments" element={<Payments />} />} />
                  <Route path="/reconciliation" element={<RoleRoute path="/reconciliation" element={<Reconciliation />} />} />
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

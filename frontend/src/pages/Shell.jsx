import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import Layout from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";

export default function Shell({ children }) {
  const location = useLocation();
  const { user } = useAuth();
  const { data: property } = useQuery({
    queryKey: ["property"],
    queryFn: async () => (await api.get("/setup/property")).data,
  });
  if (user?.role === "owner" && property && !property.setup_completed && location.pathname !== "/setup") return <Navigate to="/setup" replace />;
  if (property?.setup_completed && location.pathname === "/setup") return <Navigate to="/" replace />;
  return <Layout hotelName={property?.name}>{children}</Layout>;
}

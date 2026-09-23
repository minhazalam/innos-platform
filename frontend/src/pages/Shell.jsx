import React from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import Layout from "@/components/Layout";

export default function Shell({ children }) {
  const { data: property } = useQuery({
    queryKey: ["property"],
    queryFn: async () => (await api.get("/setup/property")).data,
  });
  return <Layout hotelName={property?.name}>{children}</Layout>;
}

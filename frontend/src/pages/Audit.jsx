import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import api from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Audit() {
  const [query, setQuery] = useState("");
  const { data = [], isLoading } = useQuery({ queryKey: ["audit", query], queryFn: async () => (await api.get("/audit-logs", { params: { limit: 200, ...(query ? { action: query } : {}) } })).data });
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Review important changes made in this property." />
      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by action code" /></div>
      {isLoading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading audit history…</div> : data.length === 0 ? <EmptyState icon={ClipboardList} title="No audit entries" subtitle="Important actions will be recorded here." /> : <div className="space-y-2">{data.map((item) => (
        <Card key={item.id} className="flex flex-col gap-2 rounded-xl border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="font-medium">{(item.action || "action").replaceAll("_", " ")}</div><div className="mt-1 text-sm text-muted-foreground">{item.details || "No details"}</div><div className="mt-1 text-xs text-muted-foreground">{item.user_name || "System"} · {(item.user_role || "system").replaceAll("_", " ")}</div></div>
          <time className="shrink-0 text-xs text-muted-foreground">{item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}</time>
        </Card>
      ))}</div>}
    </div>
  );
}

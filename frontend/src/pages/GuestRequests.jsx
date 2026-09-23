import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus, Clock3, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = {
  extra_towels: "Extra towels", extra_bed: "Extra bed", room_cleaning: "Room cleaning",
  food: "Food", taxi: "Taxi", early_checkin: "Early check-in", late_checkout: "Late checkout",
  maintenance: "Maintenance", wifi: "Wi-Fi", other: "Other",
};

export default function GuestRequests() {
  const qc = useQueryClient();
  const [room, setRoom] = useState("");
  const [category, setCategory] = useState("extra_towels");
  const [description, setDescription] = useState("");
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["guest-requests"], queryFn: async () => (await api.get("/guest-requests")).data });
  const { data: rooms = [] } = useQuery({ queryKey: ["rooms"], queryFn: async () => (await api.get("/rooms")).data });
  const create = useMutation({
    mutationFn: (body) => api.post("/guest-requests", body),
    onSuccess: () => { toast.success("Guest request created"); qc.invalidateQueries({ queryKey: ["guest-requests"] }); setDescription(""); setRoom(""); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
  const update = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/guest-requests/${id}`, { status }),
    onSuccess: () => { toast.success("Request updated"); qc.invalidateQueries({ queryKey: ["guest-requests"] }); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Guest Requests" subtitle="Capture a guest need and track it through completion." />
      <Card className="rounded-2xl border-border p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="font-semibold">New request</h2></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room">
            <option value="">Room (optional)</option>{rooms.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            {Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <Textarea className="sm:col-span-2" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add the details staff need to resolve it" />
          <Button className="sm:col-span-2 sm:justify-self-end" disabled={create.isPending} onClick={() => create.mutate({ category, room_id: room || null, description })}>Create request</Button>
        </div>
      </Card>
      {isLoading ? <div className="py-12 text-center text-sm text-muted-foreground">Loading requests…</div> : requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No requests yet" subtitle="New guest needs will appear here." />
      ) : <div className="space-y-3">{requests.map((item) => (
        <Card key={item.id} className="flex flex-col gap-4 rounded-2xl border-border p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 flex-1"><div className="font-semibold">{CATEGORIES[item.category] || item.category}{item.room_number ? ` · Room ${item.room_number}` : ""}</div><p className="mt-1 text-sm text-muted-foreground">{item.description || "No additional details"}</p></div>
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${item.status === "completed" ? "bg-emerald-100 text-emerald-800" : item.status === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{(item.status || "created").replaceAll("_", " ")}</span>
          {item.status !== "completed" && <Button size="sm" variant={item.status === "in_progress" ? "default" : "outline"} onClick={() => update.mutate({ id: item.id, status: item.status === "in_progress" ? "completed" : "in_progress" })}>{item.status === "in_progress" ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Complete</> : <><Clock3 className="mr-2 h-4 w-4" /> Start</>}</Button>}
        </Card>
      ))}</div>}
    </div>
  );
}

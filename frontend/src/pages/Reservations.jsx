import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import api from "@/lib/api";
import { inr, fmtDate, SOURCE_LABELS } from "@/lib/format";
import { PageHeader, ResStatusBadge, EmptyState } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import NewReservationDialog from "@/components/NewReservationDialog";
import ReservationDialog from "@/components/ReservationDialog";

const FILTERS = [
  { key: "", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "checked_in", label: "In-house" },
  { key: "checked_out", label: "Departed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function Reservations() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["reservations", status],
    queryFn: async () => (await api.get(`/reservations${status ? `?status=${status}` : ""}`)).data,
  });

  const filtered = data.filter((r) =>
    !q || r.guest_name?.toLowerCase().includes(q.toLowerCase()) ||
    r.room_number?.toLowerCase().includes(q.toLowerCase()) ||
    r.guest_phone?.includes(q));

  return (
    <div className="space-y-6">
      <PageHeader title="Reservations" subtitle="Manage bookings across your property">
        <NewReservationDialog />
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={status === f.key ? "default" : "outline"}
              onClick={() => setStatus(f.key)} data-testid={`filter-${f.key || "all"}`} className="rounded-full">
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input data-testid="reservation-search" placeholder="Search guest, room, phone" value={q}
            onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No reservations" subtitle="Create your first booking to get started." />
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => (
            <Card key={r.id} onClick={() => setOpenId(r.id)} data-testid={`reservation-row-${r.id}`}
              className="flex cursor-pointer flex-col gap-3 rounded-2xl border-border p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span className="font-display text-sm font-bold leading-none">{r.room_number}</span>
                  <span className="text-[10px] uppercase">Room</span>
                </div>
                <div>
                  <div className="font-medium">{r.guest_name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(r.check_in)} → {fmtDate(r.check_out)} · {r.nights}n · {SOURCE_LABELS[r.source]}</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="text-right">
                  <div className="font-display font-semibold">{inr(r.total_amount)}</div>
                  {r.balance > 0 ? <div className="text-xs text-rose-600">{inr(r.balance)} due</div> : <div className="text-xs text-emerald-600">Paid</div>}
                </div>
                <ResStatusBadge status={r.status} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {openId && <ReservationDialog id={openId} open={!!openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

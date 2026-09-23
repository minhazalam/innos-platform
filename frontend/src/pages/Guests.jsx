import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Search, Plus, Phone, Mail, Loader2 } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader, EmptyState, ResStatusBadge } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

function AddGuestDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", preferences: "", notes: "" });
  const create = useMutation({
    mutationFn: async (b) => (await api.post("/guests", b)).data,
    onSuccess: () => { toast.success("Guest added"); qc.invalidateQueries({ queryKey: ["guests"] }); setOpen(false); setF({ name: "", phone: "", email: "", address: "", preferences: "", notes: "" }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="add-guest-btn"><Plus className="mr-2 h-4 w-4" /> Add Guest</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Guest</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Name *</Label><Input data-testid="guest-name-input" value={f.name} onChange={set("name")} /></div>
            <div className="space-y-1.5"><Label>Phone *</Label><Input data-testid="guest-phone-input" value={f.phone} onChange={set("phone")} /></div>
          </div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={f.email} onChange={set("email")} /></div>
          <div className="space-y-1.5"><Label>Preferences</Label><Textarea rows={2} value={f.preferences} onChange={set("preferences")} /></div>
        </div>
        <DialogFooter>
          <Button data-testid="guest-save-btn" onClick={() => f.name && f.phone && create.mutate(f)} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GuestDetail({ id, open, onClose }) {
  const { data: g, isLoading } = useQuery({
    queryKey: ["guest", id], queryFn: async () => (await api.get(`/guests/${id}`)).data, enabled: !!id && open,
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto hotelos-scroll sm:max-w-lg" data-testid="guest-detail-dialog">
        {isLoading || !g ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
          <>
            <DialogHeader><DialogTitle className="font-display text-xl">{g.name}</DialogTitle></DialogHeader>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {g.phone}</span>
              {g.email && <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> {g.email}</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Card className="rounded-xl p-3 text-center"><div className="font-display text-2xl font-bold">{g.total_bookings}</div><div className="text-xs text-muted-foreground">Bookings</div></Card>
              <Card className="rounded-xl p-3 text-center"><div className="font-display text-2xl font-bold text-emerald-600">{inr(g.total_spend)}</div><div className="text-xs text-muted-foreground">Total Spend</div></Card>
              <Card className="rounded-xl p-3 text-center"><div className="font-display text-2xl font-bold">{g.stays.filter((s) => s.status === "checked_in").length}</div><div className="text-xs text-muted-foreground">In-house</div></Card>
            </div>
            {g.preferences && <div className="rounded-lg bg-muted/50 p-3 text-sm"><span className="font-medium">Preferences: </span>{g.preferences}</div>}
            <div>
              <div className="mb-2 text-sm font-semibold">Stay History</div>
              <div className="space-y-2">
                {g.stays.length === 0 ? <p className="text-sm text-muted-foreground">No stays yet.</p> : g.stays.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <div><div className="font-medium">Room {s.room_number}</div><div className="text-xs text-muted-foreground">{fmtDate(s.check_in)} → {fmtDate(s.check_out)}</div></div>
                    <div className="flex items-center gap-3"><span>{inr(s.total_amount)}</span><ResStatusBadge status={s.status} /></div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Guests() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["guests", q], queryFn: async () => (await api.get(`/guests${q ? `?search=${encodeURIComponent(q)}` : ""}`)).data,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Guests" subtitle="Your guest directory and history"><AddGuestDialog /></PageHeader>

      <div className="relative sm:w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input data-testid="guest-search" placeholder="Search by name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : data.length === 0 ? (
        <EmptyState icon={Users} title="No guests found" subtitle="Add a guest or create a reservation." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((g) => (
            <Card key={g.id} onClick={() => setOpenId(g.id)} data-testid={`guest-card-${g.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border-border p-4 transition-colors hover:bg-muted/40">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 font-display font-semibold text-primary">
                {g.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{g.name}</div>
                <div className="truncate text-xs text-muted-foreground">{g.phone}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {openId && <GuestDetail id={openId} open={!!openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BedDouble, Plus, Loader2 } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inr, ROOM_STATUS } from "@/lib/format";
import { PageHeader, RoomStatusBadge } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUSES = ["available", "occupied", "dirty", "cleaning", "maintenance", "out_of_order"];

function AddRoomDialog({ types }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [typeId, setTypeId] = useState("");
  const [floor, setFloor] = useState("");
  const create = useMutation({
    mutationFn: async (b) => (await api.post("/rooms", b)).data,
    onSuccess: () => { toast.success("Room added"); qc.invalidateQueries({ queryKey: ["rooms"] }); setOpen(false); setNumber(""); setFloor(""); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" data-testid="add-room-btn"><Plus className="mr-2 h-4 w-4" /> Add Room</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Room</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Room Number</Label><Input data-testid="room-number-input" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Room Type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger data-testid="room-type-select"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {inr(t.base_price)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Floor</Label><Input value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button data-testid="room-save-btn" onClick={() => number && typeId && create.mutate({ number, room_type_id: typeId, floor })} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTypeDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cap, setCap] = useState("2");
  const create = useMutation({
    mutationFn: async (b) => (await api.post("/rooms/types", b)).data,
    onSuccess: () => { toast.success("Room type added"); qc.invalidateQueries({ queryKey: ["room-types"] }); setOpen(false); setName(""); setPrice(""); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" data-testid="add-type-btn"><Plus className="mr-2 h-4 w-4" /> Room Type</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Room Type</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input data-testid="type-name-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Base Price (₹)</Label><Input data-testid="type-price-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Capacity</Label><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="type-save-btn" onClick={() => name && price && create.mutate({ name, base_price: parseFloat(price), capacity: parseInt(cap) })} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Rooms() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [searchParams] = useSearchParams();
  const focusedRoomId = searchParams.get("room");
  const canManage = ["owner", "manager"].includes(user.role);

  const { data: rooms = [], isLoading } = useQuery({ queryKey: ["rooms"], queryFn: async () => (await api.get("/rooms")).data });
  const { data: types = [] } = useQuery({ queryKey: ["room-types"], queryFn: async () => (await api.get("/rooms/types")).data });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }) => (await api.patch(`/rooms/${id}/status`, { status })).data,
    onSuccess: () => { toast.success("Room status updated"); qc.invalidateQueries({ queryKey: ["rooms"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });

  const counts = STATUSES.reduce((a, s) => ({ ...a, [s]: rooms.filter((r) => r.status === s).length }), {});
  const shown = rooms.filter((room) => (!filter || room.status === filter) && (!focusedRoomId || room.id === focusedRoomId));

  return (
    <div className="space-y-6">
      <PageHeader title="Rooms" subtitle={`${rooms.length} rooms across your property`}>
        {canManage && <><AddTypeDialog /><AddRoomDialog types={types} /></>}
      </PageHeader>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={filter === "" ? "default" : "outline"} onClick={() => setFilter("")} className="rounded-full" data-testid="room-filter-all">All ({rooms.length})</Button>
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)} className="rounded-full" data-testid={`room-filter-${s}`}>
            {ROOM_STATUS[s].label} ({counts[s]})
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {shown.map((room) => (
            <Card key={room.id} data-testid={`room-card-${room.number}`}
              className="flex flex-col gap-3 rounded-2xl border-border p-4 transition-transform duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-2xl font-bold">{room.number}</div>
                  <div className="text-xs text-muted-foreground">{room.room_type_name}</div>
                </div>
                <span className={`h-3 w-3 rounded-full ${ROOM_STATUS[room.status]?.dot}`} />
              </div>
              <div className="text-xs text-muted-foreground">{inr(room.base_price)}/night</div>
              <RoomStatusBadge status={room.status} />
              {canManage && <Select value={room.status} onValueChange={(v) => setStatus.mutate({ id: room.id, status: v })}>
                <SelectTrigger className="h-8 text-xs" data-testid={`room-status-${room.number}`}><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{ROOM_STATUS[s].label}</SelectItem>)}</SelectContent>
              </Select>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

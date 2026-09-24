import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { inr, todayISO, addDaysISO, SOURCE_LABELS } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function NewReservationDialog({ trigger, presetRoomId }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [guestMode, setGuestMode] = useState("new");
  const [guestId, setGuestId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState(presetRoomId || "");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 1));
  const [numGuests, setNumGuests] = useState("2");
  const [source, setSource] = useState("walk_in");
  const [special, setSpecial] = useState("");

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms"], queryFn: async () => (await api.get("/rooms")).data, enabled: open,
  });
  const { data: guests = [] } = useQuery({
    queryKey: ["guests"], queryFn: async () => (await api.get("/guests")).data, enabled: open,
  });

  const bookableRooms = rooms.filter((r) => !["maintenance", "out_of_order"].includes(r.status));
  const selectedRoom = bookableRooms.find((r) => r.id === roomId);
  const nights = useMemo(() => {
    const d = (new Date(checkOut) - new Date(checkIn)) / 86400000;
    return d > 0 ? d : 0;
  }, [checkIn, checkOut]);
  const total = selectedRoom ? selectedRoom.base_price * (nights || 1) : 0;

  const reset = () => {
    setGuestMode("new"); setGuestId(""); setName(""); setPhone(""); setEmail("");
    setRoomId(presetRoomId || ""); setCheckIn(todayISO()); setCheckOut(addDaysISO(todayISO(), 1));
    setNumGuests("2"); setSource("walk_in"); setSpecial("");
  };

  const create = useMutation({
    mutationFn: async (body) => (await api.post("/reservations", body)).data,
    onSuccess: () => {
      toast.success("Reservation created");
      qc.invalidateQueries({ queryKey: ["reservations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["guests"] });
      setOpen(false); reset();
    },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });

  const submit = () => {
    if (!bookableRooms.some((room) => room.id === roomId)) return toast.error("Select a room that is available for reservations");
    const body = {
      room_id: roomId, check_in: checkIn, check_out: checkOut,
      num_guests: parseInt(numGuests) || 1, source, special_requests: special,
    };
    if (guestMode === "existing") {
      if (!guestId) return toast.error("Select a guest");
      body.guest_id = guestId;
    } else {
      if (!name || !phone) return toast.error("Guest name and phone are required");
      body.guest_name = name; body.guest_phone = phone; body.guest_email = email;
    }
    create.mutate(body);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-testid="new-reservation-btn"><Plus className="mr-2 h-4 w-4" /> New Reservation</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto innos-scroll sm:max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-xl">New Reservation</DialogTitle></DialogHeader>

        <div className="space-y-4">
          {/* Guest */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant={guestMode === "new" ? "default" : "outline"} onClick={() => setGuestMode("new")} data-testid="guest-new-tab">New Guest</Button>
              <Button size="sm" variant={guestMode === "existing" ? "default" : "outline"} onClick={() => setGuestMode("existing")} data-testid="guest-existing-tab">Existing Guest</Button>
            </div>
            {guestMode === "new" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Name *</Label><Input data-testid="res-guest-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Phone *</Label><Input data-testid="res-guest-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div className="col-span-2 space-y-1.5"><Label>Email</Label><Input data-testid="res-guest-email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              </div>
            ) : (
              <Select value={guestId} onValueChange={setGuestId}>
                <SelectTrigger data-testid="res-guest-select"><SelectValue placeholder="Select guest" /></SelectTrigger>
                <SelectContent>
                  {guests.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} — {g.phone}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Room + dates */}
          <div className="space-y-1.5">
            <Label>Room *</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger data-testid="res-room-select"><SelectValue placeholder="Select room" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {bookableRooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    Room {r.number} · {r.room_type_name} · {inr(r.base_price)}/night
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Rooms in maintenance or marked out of order can’t be reserved.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Check-in</Label><Input data-testid="res-checkin" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Check-out</Label><Input data-testid="res-checkout" type="date" value={checkOut} min={addDaysISO(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Guests</Label><Input data-testid="res-num-guests" type="number" min="1" value={numGuests} onChange={(e) => setNumGuests(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger data-testid="res-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5"><Label>Special requests</Label><Textarea data-testid="res-special" value={special} onChange={(e) => setSpecial(e.target.value)} rows={2} /></div>

          {selectedRoom && nights > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3">
              <span className="text-sm text-muted-foreground">{nights} night(s) × {inr(selectedRoom.base_price)}</span>
              <span className="font-display text-xl font-bold text-primary">{inr(total)}</span>
            </div>
          )}

          <Button data-testid="res-submit" className="w-full" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Reservation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

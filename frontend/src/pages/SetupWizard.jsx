import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronLeft, ChevronRight, CreditCard, DoorOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const steps = [
  { id: "hotel", label: "Hotel", icon: Building2 },
  { id: "rooms", label: "Rooms", icon: DoorOpen },
  { id: "policies", label: "Policies & payment", icon: CreditCard },
];

export default function SetupWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [hotel, setHotel] = useState({});
  const [roomType, setRoomType] = useState({ name: "Standard", base_price: "", capacity: "2", amenities: "Wi-Fi, Room heater" });
  const [roomNumbers, setRoomNumbers] = useState("101, 102, 103");
  const [policies, setPolicies] = useState({ cancellation: "", checkin: "", checkout: "", extra_guest: "", child: "" });
  const [payment, setPayment] = useState({ upi_id: "", upi_name: "", methods: ["upi", "cash", "card", "bank_transfer"], tax_percent: 12 });
  const { data: property, isLoading } = useQuery({ queryKey: ["property"], queryFn: async () => (await api.get("/setup/property")).data });
  const { data: existingRooms = [] } = useQuery({ queryKey: ["rooms"], queryFn: async () => (await api.get("/rooms")).data, enabled: !!property });
  const { data: existingTypes = [] } = useQuery({ queryKey: ["room-types"], queryFn: async () => (await api.get("/rooms/types")).data, enabled: !!property });
  useEffect(() => {
    if (property) {
      setHotel({ name: property.name || "", address: property.address || "", city: property.city || "", state: property.state || "", phone: property.phone || "", email: property.email || "", checkin_time: property.checkin_time || "14:00", checkout_time: property.checkout_time || "11:00", description: property.description || "" });
      setPolicies(property.policies || policies);
      setPayment(property.payment_settings || payment);
    }
  // Initial values are loaded once when the property request completes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property]);

  const saveHotel = useMutation({
    mutationFn: () => api.put("/setup/property", hotel),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["property"] }); setStep(1); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
  const saveRooms = useMutation({
    mutationFn: async () => {
      const numbers = roomNumbers.split(",").map((item) => item.trim()).filter(Boolean);
      if (!numbers.length) throw new Error("Enter at least one room number");
      const createdType = await api.post("/rooms/types", {
        name: roomType.name, base_price: Number(roomType.base_price), capacity: Number(roomType.capacity),
        amenities: roomType.amenities.split(",").map((item) => item.trim()).filter(Boolean),
      });
      for (const number of numbers) await api.post("/rooms", { number, room_type_id: createdType.data.id, floor: "" });
      return numbers.length;
    },
    onSuccess: (count) => { qc.invalidateQueries({ queryKey: ["rooms"] }); qc.invalidateQueries({ queryKey: ["room-types"] }); toast.success(`${count} room(s) added`); setRoomType({ name: "", base_price: "", capacity: "2", amenities: "" }); setRoomNumbers(""); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail || error.message)),
  });
  const finish = useMutation({
    mutationFn: async () => {
      await api.put("/setup/policies", policies);
      await api.put("/setup/payment-settings", { ...payment, tax_percent: Number(payment.tax_percent) });
      return (await api.post("/setup/complete")).data;
    },
    onSuccess: () => { toast.success("Hotel setup complete"); qc.invalidateQueries({ queryKey: ["property"] }); navigate("/"); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });

  if (user.role !== "owner") return <Navigate to="/" replace />;
  if (isLoading || !property) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (property.setup_completed) return <Navigate to="/" replace />;
  const setHotelField = (key) => (event) => setHotel((current) => ({ ...current, [key]: event.target.value }));
  const setPolicy = (key) => (event) => setPolicies((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Set up your hotel" subtitle="A few details will get your property ready for daily operations." />
      <div className="grid grid-cols-3 gap-2">{steps.map((item, index) => { const Icon = item.icon; const active = index === step; const done = index < step; return <div key={item.id} className={`flex items-center gap-2 rounded-xl px-3 py-3 text-xs sm:text-sm ${active ? "bg-primary text-primary-foreground" : done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/20">{done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span className="font-medium">{item.label}</span></div>; })}</div>

      {step === 0 && <Card className="space-y-5 rounded-2xl border-border p-5 sm:p-7">
        <div><h2 className="font-display text-xl font-semibold">Hotel details</h2><p className="mt-1 text-sm text-muted-foreground">Set the basics guests and staff need.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[["name", "Hotel name"], ["phone", "Phone"], ["email", "Email"], ["city", "City"], ["state", "State"], ["address", "Address"]].map(([key, label]) => <div key={key} className={`space-y-1.5 ${key === "address" ? "sm:col-span-2" : ""}`}><Label>{label}</Label><Input value={hotel[key] || ""} onChange={setHotelField(key)} /></div>)}
          <div className="space-y-1.5"><Label>Check-in time</Label><Input type="time" value={hotel.checkin_time || "14:00"} onChange={setHotelField("checkin_time")} /></div>
          <div className="space-y-1.5"><Label>Check-out time</Label><Input type="time" value={hotel.checkout_time || "11:00"} onChange={setHotelField("checkout_time")} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={hotel.description || ""} onChange={setHotelField("description")} /></div>
        </div>
        <Button className="w-full sm:w-auto" disabled={saveHotel.isPending || !hotel.name?.trim()} onClick={() => saveHotel.mutate()}>{saveHotel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ChevronRight className="ml-2 h-4 w-4" /></>}</Button>
      </Card>}

      {step === 1 && <Card className="space-y-5 rounded-2xl border-border p-5 sm:p-7">
        <div><h2 className="font-display text-xl font-semibold">Room types and rooms</h2><p className="mt-1 text-sm text-muted-foreground">Add a room type, then enter its room numbers separated by commas.</p></div>
      {(existingTypes.length > 0 || existingRooms.length > 0) && <div className="rounded-xl bg-primary/5 p-3 text-sm text-primary">{existingTypes.length} room type(s) and {existingRooms.length} room(s) in this property.</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Room type name</Label><Input value={roomType.name} onChange={(e) => setRoomType({ ...roomType, name: e.target.value })} placeholder="Deluxe" /></div>
          <div className="space-y-1.5"><Label>Base price per night (₹)</Label><Input type="number" min="0" value={roomType.base_price} onChange={(e) => setRoomType({ ...roomType, base_price: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Guest capacity</Label><Input type="number" min="1" max="20" value={roomType.capacity} onChange={(e) => setRoomType({ ...roomType, capacity: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Amenities, comma separated</Label><Input value={roomType.amenities} onChange={(e) => setRoomType({ ...roomType, amenities: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Room numbers, comma separated</Label><Input value={roomNumbers} onChange={(e) => setRoomNumbers(e.target.value)} placeholder="101, 102, 103" /></div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="ghost" onClick={() => setStep(0)}><ChevronLeft className="mr-2 h-4 w-4" />Hotel details</Button><div className="flex gap-2"><Button variant="outline" disabled={!existingRooms.length} onClick={() => setStep(2)}>Continue with existing rooms</Button><Button disabled={!roomType.name || !roomType.base_price || !roomNumbers || saveRooms.isPending} onClick={() => saveRooms.mutate()}>{saveRooms.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add type and rooms"}</Button></div></div>
      </Card>}

      {step === 2 && <Card className="space-y-5 rounded-2xl border-border p-5 sm:p-7">
        <div><h2 className="font-display text-xl font-semibold">Policies and payment</h2><p className="mt-1 text-sm text-muted-foreground">You can change these settings later.</p></div>
        <div className="space-y-4">{[["cancellation", "Cancellation policy"], ["checkin", "Check-in policy"], ["checkout", "Check-out policy"], ["extra_guest", "Extra guest policy"], ["child", "Child policy"]].map(([key, label]) => <div key={key} className="space-y-1.5"><Label>{label}</Label><Textarea rows={2} value={policies[key] || ""} onChange={setPolicy(key)} /></div>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>UPI ID (optional)</Label><Input value={payment.upi_id || ""} onChange={(e) => setPayment({ ...payment, upi_id: e.target.value })} placeholder="hotel@bank" /></div><div className="space-y-1.5"><Label>UPI payee name</Label><Input value={payment.upi_name || ""} onChange={(e) => setPayment({ ...payment, upi_name: e.target.value })} /></div><div className="space-y-1.5"><Label>Tax / GST (%)</Label><Input type="number" min="0" max="100" value={payment.tax_percent ?? 12} onChange={(e) => setPayment({ ...payment, tax_percent: e.target.value })} /></div></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="mr-2 h-4 w-4" />Rooms</Button><Button disabled={finish.isPending || !existingRooms.length} onClick={() => finish.mutate()}>{finish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Finish setup <Check className="ml-2 h-4 w-4" /></>}</Button></div>
      </Card>}
    </div>
  );
}

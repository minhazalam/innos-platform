import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ArrowRight, BedDouble, Check, Clock3, MapPin, Phone, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const isoDate = (date) => date.toISOString().slice(0, 10);
const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return isoDate(date); };
const dayAfter = () => { const date = new Date(); date.setDate(date.getDate() + 2); return isoDate(date); };

export default function PublicBooking() {
  const { slug } = useParams();
  const [checkIn, setCheckIn] = useState(tomorrow());
  const [checkOut, setCheckOut] = useState(dayAfter());
  const [guests, setGuests] = useState(2);
  const [selectedType, setSelectedType] = useState("");
  const [guest, setGuest] = useState({ name: "", phone: "", email: "", requests: "" });
  const [confirmation, setConfirmation] = useState(null);
  const { data: hotel, isLoading, error } = useQuery({ queryKey: ["public-hotel", slug], queryFn: async () => (await api.get(`/public/${slug}`)).data });
  const availabilityKey = useMemo(() => ["public-availability", slug, checkIn, checkOut, guests], [slug, checkIn, checkOut, guests]);
  const { data: availability = [], isFetching: checking } = useQuery({
    queryKey: availabilityKey,
    queryFn: async () => (await api.get(`/public/${slug}/availability`, { params: { check_in: checkIn, check_out: checkOut, guests } })).data,
    enabled: !!hotel && checkOut > checkIn,
  });
  const book = useMutation({
    mutationFn: (body) => api.post(`/public/${slug}/bookings`, body),
    onSuccess: ({ data }) => setConfirmation(data),
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  const setGuestField = (key) => (e) => setGuest((current) => ({ ...current, [key]: e.target.value }));

  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading hotel…</div>;
  if (error || !hotel) return <div className="flex min-h-screen items-center justify-center px-5 text-center text-sm text-muted-foreground">This booking page is not available.</div>;
  const hero = hotel.room_types.find((room) => room.photo)?.photo;

  return (
    <div className="min-h-screen bg-[#f8f7f4] text-[#1a1f2b]">
      <header className="flex items-center justify-between border-b border-black/5 bg-white px-5 py-4 sm:px-10">
        <div className="font-display text-lg font-bold tracking-tight">{hotel.name}</div>
        <a href="#rooms" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Book a room</a>
      </header>
      <main>
        <section className="relative isolate flex min-h-[390px] items-end overflow-hidden bg-slate-900 px-5 py-12 text-white sm:min-h-[480px] sm:px-10 lg:px-16">
          {hero && <img src={hero} alt="Hotel room" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-60" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-4 flex items-center gap-2 text-sm text-white/80"><MapPin className="h-4 w-4" />{[hotel.city, hotel.state].filter(Boolean).join(", ")}</div>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">{hotel.headline || `Stay at ${hotel.name}`}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">{hotel.description}</p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:px-10 lg:grid-cols-[0.8fr_1.2fr] lg:py-12">
          <Card className="h-fit rounded-2xl border-black/5 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="font-display text-xl font-semibold">Find your stay</h2>
            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5 text-sm font-medium">Check-in<Input type="date" value={checkIn} min={tomorrow()} onChange={(e) => setCheckIn(e.target.value)} /></label>
              <label className="block space-y-1.5 text-sm font-medium">Check-out<Input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} /></label>
              <label className="block space-y-1.5 text-sm font-medium">Guests<Input type="number" min="1" max="12" value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)} /></label>
              {checking && <p className="text-xs text-muted-foreground">Checking available rooms…</p>}
            </div>
            <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Check-in {hotel.checkin_time} · Check-out {hotel.checkout_time}</div>
              {hotel.phone && <a href={`tel:${hotel.phone}`} className="flex items-center gap-2 hover:text-foreground"><Phone className="h-4 w-4" />{hotel.phone}</a>}
            </div>
          </Card>

          <div id="rooms" className="space-y-4">
            <div><h2 className="font-display text-2xl font-semibold">Rooms for your dates</h2><p className="mt-1 text-sm text-muted-foreground">Prices include {hotel.tax_percent}% tax. Payment is due directly to the hotel.</p></div>
            {availability.length === 0 && !checking ? <Card className="rounded-2xl border-dashed bg-white p-8 text-center text-sm text-muted-foreground">No room types fit this guest count or date range.</Card> : availability.map((room) => {
              const type = hotel.room_types.find((item) => item.id === room.room_type_id);
              const active = selectedType === room.room_type_id;
              return <Card key={room.room_type_id} className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${active ? "border-primary ring-1 ring-primary" : "border-black/5"}`}>
                <div className="grid sm:grid-cols-[180px_1fr]">
                  {type?.photo ? <img src={type.photo} alt={room.room_type} className="h-44 w-full object-cover sm:h-full" /> : <div className="flex h-36 items-center justify-center bg-primary/5 text-primary sm:h-full"><BedDouble className="h-9 w-9" /></div>}
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold">{room.room_type}</h3><div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Up to {type?.capacity || guests} guests · {room.available_rooms} available</div></div><div className="text-right"><div className="font-display text-lg font-bold">{inr(room.total)}</div><div className="text-xs text-muted-foreground">{inr(room.room_charge)} + {inr(room.tax)} tax · stay total</div></div></div>
                    {type?.description && <p className="mt-3 text-sm text-muted-foreground">{type.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">{(type?.amenities || []).slice(0, 5).map((amenity) => <span key={amenity} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"><Wifi className="h-3 w-3" />{amenity}</span>)}</div>
                    <Button className="mt-4" variant={active ? "default" : "outline"} disabled={!room.available_rooms} onClick={() => setSelectedType(room.room_type_id)}>{active ? <><Check className="mr-2 h-4 w-4" /> Selected</> : room.available_rooms ? "Select room" : "Sold out"}</Button>
                  </div>
                </div>
              </Card>;
            })}

            {selectedType && <Card className="rounded-2xl border-primary/20 bg-white p-5 sm:p-6">
              <h3 className="font-display text-xl font-semibold">Your details</h3>
              <p className="mt-1 text-sm text-muted-foreground">Your reservation is confirmed now; the hotel will collect payment directly.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Input value={guest.name} onChange={setGuestField("name")} placeholder="Full name" autoComplete="name" />
                <Input value={guest.phone} onChange={setGuestField("phone")} placeholder="Phone number" autoComplete="tel" />
                <Input className="sm:col-span-2" type="email" value={guest.email} onChange={setGuestField("email")} placeholder="Email (optional)" autoComplete="email" />
                <Textarea className="sm:col-span-2" rows={2} value={guest.requests} onChange={setGuestField("requests")} placeholder="Special requests (optional)" />
              </div>
              <Button className="mt-4 w-full sm:w-auto" disabled={!guest.name.trim() || guest.phone.trim().length < 7 || book.isPending} onClick={() => book.mutate({ room_type_id: selectedType, check_in: checkIn, check_out: checkOut, num_guests: guests, guest_name: guest.name, guest_phone: guest.phone, guest_email: guest.email || null, special_requests: guest.requests })}>Confirm reservation <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Card>}
          </div>
        </section>
      </main>

      {confirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-6 w-6" /></div>
          <h2 className="font-display text-2xl font-semibold">Reservation confirmed</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{confirmation.message}</p>
          <div className="mt-5 space-y-2 rounded-xl bg-muted/60 p-4 text-sm"><div className="flex justify-between"><span>Booking ID</span><strong>{confirmation.booking_id}</strong></div><div className="flex justify-between"><span>{confirmation.room_type} · Room {confirmation.room_number}</span><strong>{inr(confirmation.total_amount)}</strong></div><div className="flex justify-between"><span>Dates</span><strong>{confirmation.check_in} – {confirmation.check_out}</strong></div><div className="flex justify-between"><span>Payment</span><strong>Due at hotel</strong></div></div>
          <Button className="mt-5 w-full" onClick={() => { setConfirmation(null); setSelectedType(""); setGuest({ name: "", phone: "", email: "", requests: "" }); }}>Done</Button>
        </Card>
      </div>}
    </div>
  );
}

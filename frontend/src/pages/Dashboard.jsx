import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  TrendingUp, IndianRupee, LogIn, LogOut, BedDouble, AlertCircle,
  Sparkles, Wrench, Wallet, Sun,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import ReservationDialog from "@/components/ReservationDialog";

function StatCard({ icon: Icon, label, value, sub, accent, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    >
      <Card className="group flex items-start justify-between rounded-2xl border-border p-5 transition-transform duration-200 hover:-translate-y-0.5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </Card>
    </motion.div>
  );
}

function OpsList({ title, icon: Icon, items, render, empty }) {
  return (
    <Card className="rounded-2xl border-border p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2">{items.map(render)}</div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [openRes, setOpenRes] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"], queryFn: async () => (await api.get("/dashboard/summary")).data,
  });

  const canRevenue = ["owner", "manager"].includes(user.role);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  if (isLoading || !data) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const briefing = `Occupancy today is ${data.occupancy_pct}% with ${data.occupied_rooms} of ${data.total_rooms} rooms occupied. You have ${data.arrivals_count} arrival(s) and ${data.departures_count} departure(s). ${data.rooms_need_cleaning.length} room(s) awaiting housekeeping${canRevenue ? `. Today's revenue is ${inr(data.today_revenue)} with ${data.pending_payments_count} pending payment(s) worth ${inr(data.pending_amount)}` : ""}.`;

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting}, ${user.name.split(" ")[0]}`} subtitle={fmtDate(new Date().toISOString())} />

      {/* AI-style morning briefing */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="flex items-start gap-4 rounded-2xl border-primary/20 bg-primary/5 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sun className="h-5 w-5" />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Today's Briefing</div>
            <p className="text-sm leading-relaxed text-foreground/90" data-testid="dashboard-briefing">{briefing}</p>
          </div>
        </Card>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard delay={0.02} icon={TrendingUp} label="Occupancy" value={`${data.occupancy_pct}%`} sub={`${data.occupied_rooms}/${data.total_rooms} rooms`} accent="bg-primary/10 text-primary" />
        {canRevenue && <StatCard delay={0.04} icon={IndianRupee} label="Revenue Today" value={inr(data.today_revenue)} accent="bg-emerald-100 text-emerald-700" />}
        <StatCard delay={0.06} icon={LogIn} label="Arrivals" value={data.arrivals_count} sub="today" accent="bg-blue-100 text-blue-700" />
        <StatCard delay={0.08} icon={LogOut} label="Departures" value={data.departures_count} sub="today" accent="bg-amber-100 text-amber-700" />
        <StatCard delay={0.1} icon={BedDouble} label="Available" value={data.available_rooms} sub="rooms" accent="bg-teal-100 text-teal-700" />
        {canRevenue
          ? <StatCard delay={0.12} icon={Wallet} label="Pending" value={inr(data.pending_amount)} sub={`${data.pending_payments_count} payments`} accent="bg-rose-100 text-rose-700" />
          : <StatCard delay={0.12} icon={AlertCircle} label="To Clean" value={data.rooms_need_cleaning.length} sub="rooms" accent="bg-purple-100 text-purple-700" />}
      </div>

      {/* Today's operations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <OpsList title="Arrivals" icon={LogIn} items={data.arrivals} empty="No arrivals today"
          render={(r) => (
            <button key={r.id} onClick={() => setOpenRes(r.id)} data-testid={`arrival-${r.id}`}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted">
              <div><div className="text-sm font-medium">{r.guest_name}</div><div className="text-xs text-muted-foreground">Room {r.room_number}</div></div>
              {canRevenue && r.balance > 0 && <span className="text-xs font-medium text-rose-600">{inr(r.balance)} due</span>}
            </button>
          )} />
        <OpsList title="Departures" icon={LogOut} items={data.departures} empty="No departures today"
          render={(r) => (
            <button key={r.id} onClick={() => setOpenRes(r.id)} data-testid={`departure-${r.id}`}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted">
              <div><div className="text-sm font-medium">{r.guest_name}</div><div className="text-xs text-muted-foreground">Room {r.room_number}</div></div>
              {canRevenue && r.balance > 0 && <span className="text-xs font-medium text-rose-600">{inr(r.balance)} due</span>}
            </button>
          )} />
        <OpsList title="Housekeeping" icon={Sparkles} items={data.rooms_need_cleaning} empty="All rooms clean"
          render={(r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="text-sm font-medium">Room {r.number}</div>
              <span className="text-xs capitalize text-muted-foreground">{r.status}</span>
            </div>
          )} />
      </div>

      {openRes && <ReservationDialog id={openRes} open={!!openRes} onClose={() => setOpenRes(null)} canPay={canRevenue || user.role === "front_desk"} />}
    </div>
  );
}

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarDays, IndianRupee, Percent, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import api from "@/lib/api";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function Metric({ icon: Icon, label, value, hint }) {
  return <Card className="rounded-2xl border-border p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-3 font-display text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{hint}</div></Card>;
}

export default function Analytics() {
  const [period, setPeriod] = useState("week");
  const { data, isLoading } = useQuery({ queryKey: ["analytics", period], queryFn: async () => (await api.get("/analytics/summary", { params: { period } })).data });
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="A clear view of occupancy, collected revenue and booking mix." />
      <div className="flex flex-wrap gap-2">{[["today", "Today"], ["week", "7 days"], ["month", "30 days"]].map(([key, label]) => <Button key={key} size="sm" variant={period === key ? "default" : "outline"} className="rounded-full" onClick={() => setPeriod(key)}>{label}</Button>)}</div>
      {isLoading || !data ? <div className="py-20 text-center text-sm text-muted-foreground">Loading analytics…</div> : <>
        <p className="text-sm text-muted-foreground">{fmtDate(data.start)} – {fmtDate(data.end)}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Percent} label="Occupancy" value={`${data.occupancy_pct}%`} hint={`${data.room_nights} of ${data.available_room_nights} room nights`} />
          <Metric icon={IndianRupee} label="Collected revenue" value={inr(data.collected_revenue)} hint="Payments recorded in this period" />
          <Metric icon={Activity} label="ADR" value={inr(data.adr)} hint="Room revenue per sold room night" />
          <Metric icon={TrendingUp} label="RevPAR" value={inr(data.revpar)} hint="Room revenue per available room night" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card className="rounded-2xl border-border p-4 sm:p-6">
            <div className="mb-4"><h2 className="font-display text-lg font-semibold">Daily collected revenue</h2><p className="text-sm text-muted-foreground">Based on payment records entered in Innos.</p></div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={(value) => value >= 1000 ? `₹${Math.round(value / 1000)}k` : `₹${value}`} tickLine={false} axisLine={false} fontSize={11} width={48} />
                <Tooltip formatter={(value) => [inr(value), "Collected"]} labelFormatter={(value) => value} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#revenueFill)" />
              </AreaChart></ResponsiveContainer>
            </div>
          </Card>
          <Card className="rounded-2xl border-border p-4 sm:p-6">
            <div className="mb-4"><h2 className="font-display text-lg font-semibold">Booking sources</h2><p className="text-sm text-muted-foreground">{data.booking_count} stays overlap this period.</p></div>
            {data.booking_sources.length ? <div className="space-y-4">{data.booking_sources.map(({ source, count }) => <div key={source}><div className="mb-1 flex justify-between text-sm"><span className="capitalize">{source.replaceAll("_", " ")}</span><strong>{count}</strong></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(4, count / data.booking_count * 100)}%` }} /></div></div>)}</div> : <div className="py-12 text-center text-sm text-muted-foreground">No bookings in this period.</div>}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm"><span className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" /> Cancellations</span><strong>{data.cancellation_count}</strong></div>
          </Card>
        </div>
      </>}
    </div>
  );
}

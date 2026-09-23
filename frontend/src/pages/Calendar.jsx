import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { todayISO, addDaysISO, RES_STATUS } from "@/lib/format";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ReservationDialog from "@/components/ReservationDialog";

const DAYS = 14;

const barColor = {
  confirmed: "bg-blue-500",
  checked_in: "bg-emerald-500",
  checked_out: "bg-slate-400",
};

export default function Calendar() {
  const [start, setStart] = useState(todayISO());
  const [openId, setOpenId] = useState(null);

  const end = addDaysISO(start, DAYS);
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDaysISO(start, i)), [start]);

  const { data: rooms = [] } = useQuery({ queryKey: ["rooms"], queryFn: async () => (await api.get("/rooms")).data });
  const { data: reservations = [] } = useQuery({
    queryKey: ["calendar", start],
    queryFn: async () => (await api.get(`/reservations/calendar?start=${start}&end=${end}`)).data,
  });

  const byRoom = useMemo(() => {
    const m = {};
    reservations.forEach((r) => { (m[r.room_id] ||= []).push(r); });
    return m;
  }, [reservations]);

  const covers = (r, day) => day >= r.check_in && day < r.check_out;

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle="Room availability at a glance">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" data-testid="cal-prev" onClick={() => setStart(addDaysISO(start, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" data-testid="cal-today" onClick={() => setStart(todayISO())}>Today</Button>
          <Button variant="outline" size="icon" data-testid="cal-next" onClick={() => setStart(addDaysISO(start, 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </PageHeader>

      <Card className="overflow-hidden rounded-2xl border-border p-0">
        <div className="overflow-x-auto innos-scroll">
          <div className="min-w-[900px]">
            {/* Header */}
            <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `120px repeat(${DAYS}, 1fr)` }}>
              <div className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room</div>
              {dates.map((d) => {
                const dt = new Date(d + "T00:00:00");
                const isToday = d === todayISO();
                return (
                  <div key={d} className={`border-l border-border px-1 py-2 text-center ${isToday ? "bg-primary/10" : ""}`}>
                    <div className="text-[10px] uppercase text-muted-foreground">{dt.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                    <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{dt.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {rooms.map((room) => (
              <div key={room.id} className="grid border-b border-border last:border-0" style={{ gridTemplateColumns: `120px repeat(${DAYS}, 1fr)` }}>
                <div className="sticky left-0 z-10 flex items-center gap-2 bg-card px-3 py-2">
                  <span className="font-display text-sm font-semibold">{room.number}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{room.room_type_name}</span>
                </div>
                {dates.map((d) => {
                  const res = (byRoom[room.id] || []).find((r) => covers(r, d));
                  const isStart = res && res.check_in === d;
                  return (
                    <div key={d} className="relative border-l border-border p-1" style={{ minHeight: 40 }}>
                      {res && (
                        <button
                          onClick={() => setOpenId(res.id)}
                          data-testid={`cal-res-${res.id}`}
                          title={`${res.guest_name} · ${res.check_in} → ${res.check_out}`}
                          className={`h-7 w-full rounded ${barColor[res.status] || "bg-blue-500"} px-1.5 text-left text-[10px] font-medium text-white transition-opacity hover:opacity-90`}
                        >
                          {isStart && <span className="truncate">{res.guest_name}</span>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries({ confirmed: "Confirmed", checked_in: "In-house", checked_out: "Departed" }).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${barColor[k]}`} /> {v}</div>
        ))}
      </div>

      {openId && <ReservationDialog id={openId} open={!!openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

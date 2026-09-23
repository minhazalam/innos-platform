import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sparkles, Wrench, LogOut, Building2, BedDouble } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function StaffMobile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isHousekeeping = user.role === "housekeeping";

  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get("/dashboard/summary")).data });
  const rooms = isHousekeeping ? data?.rooms_need_cleaning || [] : data?.maintenance_rooms || [];

  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/80 px-4 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {isHousekeeping ? <Sparkles className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </div>
          <div>
            <div className="font-display text-base font-bold leading-tight">{isHousekeeping ? "My Tasks" : "My Issues"}</div>
            <div className="text-xs text-muted-foreground">{user.name} · {ROLE_LABELS[user.role]}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-btn"><LogOut className="h-5 w-5" /></Button>
      </header>

      <main className="space-y-4 p-4">
        <Card className="rounded-2xl border-primary/20 bg-primary/5 p-5">
          <div className="mb-1 flex items-center gap-2 text-primary"><Building2 className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wider">Overview</span></div>
          <p className="text-sm">
            {isHousekeeping
              ? `${rooms.length} room(s) need attention today.`
              : `${rooms.length} room(s) flagged for maintenance.`}
          </p>
        </Card>

        <div className="space-y-3">
          {rooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              All clear — nothing pending right now.
            </div>
          ) : rooms.map((r) => (
            <Card key={r.id} data-testid={`task-room-${r.number}`} className="flex items-center gap-4 rounded-2xl border-border p-5">
              <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BedDouble className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-display text-xl font-bold">Room {r.number}</div>
                <div className="text-sm capitalize text-muted-foreground">
                  {isHousekeeping ? `${r.status} · needs cleaning` : `${r.status.replace("_", " ")}`}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <p className="pt-4 text-center text-xs text-muted-foreground">
          Full task actions arrive with the Housekeeping & Maintenance modules.
        </p>
      </main>
    </div>
  );
}

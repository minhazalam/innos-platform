import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BedDouble, CheckCircle2, ClipboardList, Clock3, LogOut, Plus, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = { extra_towels: "Extra towels", room_cleaning: "Room cleaning", food: "Food", taxi: "Taxi", early_checkin: "Early check-in", late_checkout: "Late checkout", maintenance: "Maintenance", wifi: "Wi-Fi", other: "Other" };

function useStaffAction(fn, success, refresh) {
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(success); refresh(); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
}

function StateBadge({ state }) {
  const tone = ["completed", "resolved"].includes(state) ? "bg-emerald-100 text-emerald-800" : state === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${tone}`}>{(state || "pending").replaceAll("_", " ")}</span>;
}

export default function StaffMobile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isHousekeeping = user.role === "housekeeping";
  const [issueRoom, setIssueRoom] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [requestRoom, setRequestRoom] = useState("");
  const [requestCategory, setRequestCategory] = useState("other");
  const [requestDescription, setRequestDescription] = useState("");
  const refresh = () => ["staff-housekeeping", "staff-maintenance", "staff-requests", "dashboard", "rooms"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  const { data: tasks = [] } = useQuery({ queryKey: ["staff-housekeeping"], queryFn: async () => (await api.get("/housekeeping")).data, enabled: isHousekeeping });
  const { data: issues = [] } = useQuery({ queryKey: ["staff-maintenance"], queryFn: async () => (await api.get("/maintenance")).data, enabled: !isHousekeeping });
  const { data: requests = [] } = useQuery({ queryKey: ["staff-requests"], queryFn: async () => (await api.get("/guest-requests")).data });
  const workItems = isHousekeeping ? tasks : issues;
  const activeRooms = useMemo(() => {
    const map = new Map();
    workItems.forEach((item) => { if (item.room_id && item.room_number) map.set(item.room_id, { id: item.room_id, number: item.room_number }); });
    return Array.from(map.values());
  }, [workItems]);
  const taskAction = useStaffAction(({ id, body }) => api.patch(`/housekeeping/${id}`, body), "Task updated", refresh);
  const issueAction = useStaffAction(({ id, body }) => api.patch(`/maintenance/${id}`, body), "Issue updated", refresh);
  const reportIssue = useStaffAction((body) => api.post("/maintenance", body), "Issue reported to maintenance", refresh);
  const createRequest = useStaffAction((body) => api.post("/guest-requests", body), "Guest request created", refresh);
  const requestAction = useStaffAction(({ id, body }) => api.patch(`/guest-requests/${id}`, body), "Request updated", refresh);

  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card/90 px-4 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">{isHousekeeping ? <Sparkles className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}</div>
          <div><div className="font-display text-base font-bold leading-tight">{isHousekeeping ? "My Tasks" : "My Issues"}</div><div className="text-xs text-muted-foreground">{user.name} · {ROLE_LABELS[user.role]}</div></div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout-btn" aria-label="Sign out"><LogOut className="h-5 w-5" /></Button>
      </header>

      <main className="mx-auto max-w-xl space-y-5 p-4">
        <Card className="rounded-2xl border-primary/20 bg-primary/5 p-5">
          <div className="mb-1 flex items-center gap-2 text-primary"><BedDouble className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wider">Today</span></div>
          <p className="text-sm">{isHousekeeping ? `${tasks.filter((t) => t.status !== "completed").length} assigned room task(s) need attention.` : `${issues.filter((i) => i.status !== "resolved").length} assigned maintenance issue(s) need attention.`}</p>
        </Card>

        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold">{isHousekeeping ? "Assigned rooms" : "Assigned issues"}</h2>
          {workItems.length === 0 ? <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">Nothing assigned right now.</div> : workItems.map((item) => (
            <Card key={item.id} className="space-y-4 rounded-2xl border-border p-4" data-testid={`staff-item-${item.id}`}>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{isHousekeeping ? <BedDouble className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1"><div className="font-display text-lg font-bold">{isHousekeeping ? `Room ${item.room_number}` : `${item.title}${item.room_number ? ` · Room ${item.room_number}` : ""}`}</div><div className="mt-1 text-sm text-muted-foreground">{isHousekeeping ? (item.task_type || item.type || "Cleaning").replaceAll("_", " ") : item.description || "No additional details"}</div><div className="mt-2 flex items-center gap-2"><StateBadge state={item.status} /><span className="text-xs text-muted-foreground">{(item.priority || "normal").toUpperCase()} priority</span></div></div>
              </div>
              {isHousekeeping ? <div className="grid grid-cols-2 gap-2">
                {item.status === "pending" && <Button className="h-12" variant="outline" onClick={() => taskAction.mutate({ id: item.id, body: { status: "in_progress" } })}><Clock3 className="mr-2 h-4 w-4" /> Start cleaning</Button>}
                {item.status === "in_progress" && <Button className="col-span-2 h-12" onClick={() => taskAction.mutate({ id: item.id, body: { status: "completed" } })}><CheckCircle2 className="mr-2 h-4 w-4" /> Complete cleaning</Button>}
                {item.status === "pending" && <Button className="h-12" variant="secondary" onClick={() => { setIssueRoom(item.room_number); setIssueTitle(""); setIssueDescription(""); document.getElementById("issue-form")?.scrollIntoView({ behavior: "smooth" }); }}><Wrench className="mr-2 h-4 w-4" /> Report issue</Button>}
              </div> : item.status !== "resolved" && <Button className="h-12 w-full" variant={item.status === "in_progress" ? "default" : "outline"} onClick={() => issueAction.mutate({ id: item.id, body: { status: item.status === "in_progress" ? "resolved" : "in_progress" } })}>{item.status === "in_progress" ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Mark resolved</> : <><Clock3 className="mr-2 h-4 w-4" /> Start work</>}</Button>}
            </Card>
          ))}
        </section>

        <Card id="issue-form" className="space-y-3 rounded-2xl border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-primary" /> Report a maintenance issue</div>
          <Input inputMode="numeric" value={issueRoom} onChange={(e) => setIssueRoom(e.target.value)} placeholder="Room number (optional)" />
          <Input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Issue title" />
          <Textarea rows={2} value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="Describe the issue" />
          <Button className="h-11 w-full" disabled={!issueTitle.trim() || reportIssue.isPending} onClick={() => { reportIssue.mutate({ room_number: issueRoom || null, title: issueTitle, description: issueDescription }); setIssueRoom(""); setIssueTitle(""); setIssueDescription(""); }}><Plus className="mr-2 h-4 w-4" /> Send to maintenance</Button>
        </Card>

        <Card className="space-y-3 rounded-2xl border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4 text-primary" /> Create a guest request</div>
          <select className="h-11 rounded-lg border border-input bg-background px-3 text-sm" value={requestRoom} onChange={(e) => setRequestRoom(e.target.value)} aria-label="Guest request room"><option value="">Room (optional)</option>{activeRooms.map((room) => <option key={room.id} value={room.id}>{room.number}</option>)}</select>
          <select className="h-11 rounded-lg border border-input bg-background px-3 text-sm" value={requestCategory} onChange={(e) => setRequestCategory(e.target.value)} aria-label="Guest request type">{Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <Textarea rows={2} value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} placeholder="What does the guest need?" />
          <Button className="h-11 w-full" disabled={createRequest.isPending} onClick={() => { createRequest.mutate({ category: requestCategory, room_id: requestRoom || null, description: requestDescription }); setRequestDescription(""); }}>Create request</Button>
        </Card>

        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold">Guest requests assigned to me</h2>
          {requests.length === 0 ? <p className="px-1 text-sm text-muted-foreground">No assigned requests.</p> : requests.map((item) => (
            <Card key={item.id} className="flex items-center gap-3 rounded-2xl border-border p-4">
              <div className="min-w-0 flex-1"><div className="font-medium">{CATEGORIES[item.category] || item.category}{item.room_number ? ` · Room ${item.room_number}` : ""}</div><div className="mt-1 text-sm text-muted-foreground">{item.description || "No additional details"}</div><div className="mt-2"><StateBadge state={item.status} /></div></div>
              {item.status !== "completed" && <Button size="sm" onClick={() => requestAction.mutate({ id: item.id, body: { status: item.status === "in_progress" ? "completed" : "in_progress" } })}>{item.status === "in_progress" ? "Complete" : "Start"}</Button>}
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}

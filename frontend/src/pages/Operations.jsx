import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BedDouble, ClipboardList, Plus, Wrench, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const fieldClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";
const PRIORITY = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
const REQUEST_CATEGORY = {
  extra_towels: "Extra towels", extra_bed: "Extra bed", room_cleaning: "Room cleaning",
  food: "Food", taxi: "Taxi", early_checkin: "Early check-in", late_checkout: "Late checkout",
  maintenance: "Maintenance", wifi: "Wi-Fi", other: "Other",
};

function Status({ value }) {
  const color = value === "completed" || value === "resolved" ? "bg-emerald-100 text-emerald-800" : value === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{(value || "pending").replaceAll("_", " ")}</span>;
}

function Panel({ children }) {
  return <Card className="rounded-2xl border-border p-4 sm:p-5">{children}</Card>;
}

function useOperationMutation(fn, success, invalidate) {
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(success); invalidate(); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
}

export default function Operations({ initialTab = "housekeeping" }) {
  const qc = useQueryClient();
  const [taskRoom, setTaskRoom] = useState("");
  const [issueRoom, setIssueRoom] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [requestRoom, setRequestRoom] = useState("");
  const [requestCategory, setRequestCategory] = useState("other");
  const [requestDescription, setRequestDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");

  const invalidate = () => {
    ["housekeeping", "maintenance", "guest-requests", "rooms", "dashboard"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  };
  const { data: tasks = [] } = useQuery({ queryKey: ["housekeeping"], queryFn: async () => (await api.get("/housekeeping")).data });
  const { data: issues = [] } = useQuery({ queryKey: ["maintenance"], queryFn: async () => (await api.get("/maintenance")).data });
  const { data: requests = [] } = useQuery({ queryKey: ["guest-requests"], queryFn: async () => (await api.get("/guest-requests")).data });
  const { data: rooms = [] } = useQuery({ queryKey: ["rooms"], queryFn: async () => (await api.get("/rooms")).data });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: async () => (await api.get("/staff")).data });
  const housekeepingStaff = staff.filter((member) => member.role === "housekeeping" && member.active !== false);
  const maintenanceStaff = staff.filter((member) => member.role === "maintenance" && member.active !== false);
  const operationalStaff = staff.filter((member) => ["front_desk", "housekeeping", "maintenance"].includes(member.role) && member.active !== false);

  const createTask = useOperationMutation((body) => api.post("/housekeeping", body), "Housekeeping task created", invalidate);
  const updateTask = useOperationMutation(({ id, body }) => api.patch(`/housekeeping/${id}`, body), "Housekeeping task updated", invalidate);
  const assignTask = useOperationMutation(({ id, staffId }) => api.patch(`/housekeeping/${id}/assignment`, { assigned_to: staffId || null }), "Task assignment updated", invalidate);
  const createIssue = useOperationMutation((body) => api.post("/maintenance", body), "Maintenance issue reported", invalidate);
  const updateIssue = useOperationMutation(({ id, body }) => api.patch(`/maintenance/${id}`, body), "Maintenance issue updated", invalidate);
  const assignIssue = useOperationMutation(({ id, staffId }) => api.patch(`/maintenance/${id}/assignment`, { assigned_to: staffId || null }), "Issue assignment updated", invalidate);
  const createRequest = useOperationMutation((body) => api.post("/guest-requests", body), "Guest request created", invalidate);
  const updateRequest = useOperationMutation(({ id, body }) => api.patch(`/guest-requests/${id}`, body), "Guest request updated", invalidate);
  const assignRequest = useOperationMutation(({ id, staffId }) => api.patch(`/guest-requests/${id}/assignment`, { assigned_to: staffId || null }), "Request assignment updated", invalidate);

  const roomOptions = (selected, onChange, label = "Choose room") => (
    <select className={fieldClass} value={selected} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.number} · {room.room_type_name}</option>)}
    </select>
  );
  const assignSelect = (item, members, onAssign) => (
    <select className="h-9 max-w-44 rounded-lg border border-input bg-background px-2 text-xs" value={item.assigned_to || ""} onChange={(e) => onAssign({ id: item.id, staffId: e.target.value })} aria-label="Assign staff">
      <option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Daily Operations" subtitle="Coordinate room readiness, guest requests and maintenance." />
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-muted p-1 sm:w-fit">
          <TabsTrigger value="housekeeping" className="gap-2 rounded-lg"><BedDouble className="h-4 w-4" /> Housekeeping</TabsTrigger>
          <TabsTrigger value="requests" className="gap-2 rounded-lg"><ClipboardList className="h-4 w-4" /> Guest requests</TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2 rounded-lg"><Wrench className="h-4 w-4" /> Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="housekeeping" className="space-y-4">
          <Panel>
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="font-semibold">Create cleaning task</h2></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              {roomOptions(taskRoom, setTaskRoom)}
              <select className={fieldClass} value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)} aria-label="Priority"><option value="urgent">Urgent priority</option><option value="high">High priority</option><option value="normal">Normal priority</option><option value="low">Low priority</option></select>
              <Button disabled={!taskRoom || createTask.isPending} onClick={() => {
                createTask.mutate({ room_id: taskRoom, priority: taskPriority, task_type: "room_cleaning" }); setTaskRoom("");
              }}>Add task</Button>
            </div>
          </Panel>
          {tasks.length === 0 ? <EmptyState icon={BedDouble} title="No housekeeping tasks" subtitle="Checkout tasks and new cleaning requests will appear here." /> : tasks.map((task) => (
            <Panel key={task.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BedDouble className="h-5 w-5" /></div>
                  <div className="min-w-0"><div className="font-semibold">Room {task.room_number}</div><div className="text-sm text-muted-foreground">{(task.task_type || task.type || "cleaning").replaceAll("_", " ")} · {PRIORITY[task.priority] || "Normal"} priority</div></div>
                </div>
                <Status value={task.status} />
                {assignSelect(task, housekeepingStaff, assignTask.mutate)}
                {task.status === "pending" && <Button size="sm" variant="outline" onClick={() => updateTask.mutate({ id: task.id, body: { status: "in_progress" } })}><Clock3 className="mr-2 h-4 w-4" /> Start</Button>}
                {task.status === "in_progress" && <Button size="sm" onClick={() => updateTask.mutate({ id: task.id, body: { status: "completed" } })}><CheckCircle2 className="mr-2 h-4 w-4" /> Complete</Button>}
              </div>
            </Panel>
          ))}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Panel>
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="font-semibold">Create guest request</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {roomOptions(requestRoom, setRequestRoom, "Room (optional)")}
              <select className={fieldClass} value={requestCategory} onChange={(e) => setRequestCategory(e.target.value)} aria-label="Request category">{Object.entries(REQUEST_CATEGORY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <Textarea className="sm:col-span-2" value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} placeholder="What does the guest need?" rows={2} />
              <Button className="sm:col-span-2 sm:justify-self-end" disabled={createRequest.isPending} onClick={() => { createRequest.mutate({ category: requestCategory, room_id: requestRoom || null, description: requestDescription }); setRequestRoom(""); setRequestDescription(""); }}>Create request</Button>
            </div>
          </Panel>
          {requests.length === 0 ? <EmptyState icon={ClipboardList} title="No guest requests" subtitle="New guest needs will show up here." /> : requests.map((item) => (
            <Panel key={item.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1"><div className="font-semibold">{REQUEST_CATEGORY[item.category] || item.category}{item.room_number ? ` · Room ${item.room_number}` : ""}</div><p className="mt-1 text-sm text-muted-foreground">{item.description || "No additional details"}</p><div className="mt-2 text-xs text-muted-foreground">{PRIORITY[item.priority] || "Normal"} priority</div></div>
                <Status value={item.status} />{assignSelect(item, operationalStaff, assignRequest.mutate)}
                {item.status !== "completed" && <Button size="sm" variant={item.status === "in_progress" ? "default" : "outline"} onClick={() => updateRequest.mutate({ id: item.id, body: { status: item.status === "in_progress" ? "completed" : "in_progress" } })}>{item.status === "in_progress" ? "Complete" : "Start"}</Button>}
              </div>
            </Panel>
          ))}
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Panel>
            <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><h2 className="font-semibold">Report maintenance issue</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {roomOptions(issueRoom, setIssueRoom, "Room (optional)")}
              <Input value={issueTitle} onChange={(e) => setIssueTitle(e.target.value)} placeholder="Issue title" />
              <Textarea className="sm:col-span-2" value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} placeholder="Describe what needs attention" rows={2} />
              <Button className="sm:col-span-2 sm:justify-self-end" disabled={!issueTitle.trim() || createIssue.isPending} onClick={() => { createIssue.mutate({ room_id: issueRoom || null, title: issueTitle, description: issueDescription }); setIssueRoom(""); setIssueTitle(""); setIssueDescription(""); }}>Report issue</Button>
            </div>
          </Panel>
          {issues.length === 0 ? <EmptyState icon={Wrench} title="No maintenance issues" subtitle="New issues reported by staff will appear here." /> : issues.map((issue) => (
            <Panel key={issue.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3"><AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-600" /><div><div className="font-semibold">{issue.title}{issue.room_number ? ` · Room ${issue.room_number}` : ""}</div><p className="mt-1 text-sm text-muted-foreground">{issue.description || "No additional details"}</p><div className="mt-2 text-xs text-muted-foreground">{PRIORITY[issue.priority] || "Normal"} priority</div></div></div>
                <Status value={issue.status} />{assignSelect(issue, maintenanceStaff, assignIssue.mutate)}
                {issue.status !== "resolved" && <Button size="sm" variant={issue.status === "in_progress" ? "default" : "outline"} onClick={() => updateIssue.mutate({ id: issue.id, body: { status: issue.status === "in_progress" ? "resolved" : "in_progress" } })}>{issue.status === "in_progress" ? "Resolve" : "Start"}</Button>}
              </div>
            </Panel>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

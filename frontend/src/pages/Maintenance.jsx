import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Maintenance() {
  const qc = useQueryClient();
  const [roomNumber, setRoomNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { data: issues = [] } = useQuery({ queryKey: ["maintenance"], queryFn: async () => (await api.get("/maintenance")).data });
  const create = useMutation({
    mutationFn: (body) => api.post("/maintenance", body),
    onSuccess: () => { toast.success("Issue reported"); qc.invalidateQueries({ queryKey: ["maintenance"] }); setTitle(""); setDescription(""); setRoomNumber(""); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance Issues" subtitle="Report room or property issues for the team to resolve." />
      <Card className="space-y-3 rounded-2xl border-border p-4 sm:p-5">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-primary" /> Report an issue</div>
        <Input inputMode="numeric" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Room number (optional)" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Issue title" />
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what needs attention" />
        <Button className="w-full sm:w-auto" disabled={!title.trim() || create.isPending} onClick={() => create.mutate({ room_number: roomNumber || null, title, description })}><Wrench className="mr-2 h-4 w-4" /> Send report</Button>
      </Card>
      {issues.length === 0 ? <EmptyState icon={Wrench} title="No issues reported" subtitle="Issues you report will be listed here." /> : <div className="space-y-3">{issues.map((issue) => (
        <Card key={issue.id} className="flex items-start gap-3 rounded-2xl border-border p-4 sm:p-5">
          <AlertTriangle className="mt-1 h-4 w-4 text-amber-600" />
          <div className="min-w-0 flex-1"><div className="font-semibold">{issue.title}{issue.room_number ? ` · Room ${issue.room_number}` : ""}</div><p className="mt-1 text-sm text-muted-foreground">{issue.description || "No additional details"}</p></div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{(issue.status || "open").replaceAll("_", " ")}</span>
        </Card>
      ))}</div>}
    </div>
  );
}

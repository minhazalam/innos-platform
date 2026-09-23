import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog, Plus, Loader2 } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS } from "@/lib/format";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const roleBadge = {
  owner: "bg-primary/10 text-primary",
  manager: "bg-blue-100 text-blue-800",
  front_desk: "bg-teal-100 text-teal-800",
  housekeeping: "bg-purple-100 text-purple-800",
  maintenance: "bg-amber-100 text-amber-800",
};

function AddStaffDialog({ isOwner }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "front_desk", phone: "" });
  const roles = isOwner ? ["manager", "front_desk", "housekeeping", "maintenance"] : ["front_desk", "housekeeping", "maintenance"];
  const create = useMutation({
    mutationFn: async (b) => (await api.post("/staff", b)).data,
    onSuccess: () => { toast.success("Staff member added"); qc.invalidateQueries({ queryKey: ["staff"] }); setOpen(false); setF({ name: "", email: "", password: "", role: "front_desk", phone: "" }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button data-testid="add-staff-btn"><Plus className="mr-2 h-4 w-4" /> Add Staff</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input data-testid="staff-name-input" value={f.name} onChange={set("name")} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input data-testid="staff-email-input" type="email" value={f.email} onChange={set("email")} /></div>
          <div className="space-y-1.5"><Label>Password</Label><Input data-testid="staff-password-input" type="text" value={f.password} onChange={set("password")} /></div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
              <SelectTrigger data-testid="staff-role-select"><SelectValue /></SelectTrigger>
              <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="staff-save-btn" onClick={() => f.name && f.email && f.password && create.mutate(f)} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Staff() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user.role === "owner";
  const { data = [], isLoading } = useQuery({ queryKey: ["staff"], queryFn: async () => (await api.get("/staff")).data });

  const toggle = useMutation({
    mutationFn: async ({ id, active }) => (await api.put(`/staff/${id}`, { active })).data,
    onSuccess: () => { toast.success("Staff updated"); qc.invalidateQueries({ queryKey: ["staff"] }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" subtitle="Manage your team and their access"><AddStaffDialog isOwner={isOwner} /></PageHeader>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <Card key={s.id} data-testid={`staff-card-${s.id}`} className="flex items-center gap-3 rounded-2xl border-border p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary font-display font-semibold text-secondary-foreground">
                {s.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-medium">{s.name}</span></div>
                <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${roleBadge[s.role]}`}>{ROLE_LABELS[s.role]}</span>
              </div>
              {s.role !== "owner" && (
                <Switch checked={s.active !== false} data-testid={`staff-toggle-${s.id}`}
                  onCheckedChange={(v) => toggle.mutate({ id: s.id, active: v })} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

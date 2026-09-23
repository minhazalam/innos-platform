import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function BookingWebsite() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["booking-website"], queryFn: async () => (await api.get("/setup/booking-website")).data });
  const [form, setForm] = useState({ slug: "", enabled: true, headline: "", public_description: "" });
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useMutation({
    mutationFn: () => api.put("/setup/booking-website", form),
    onSuccess: ({ data: result }) => { setForm(result); toast.success("Booking website settings saved"); qc.invalidateQueries({ queryKey: ["booking-website"] }); },
    onError: (error) => toast.error(apiError(error.response?.data?.detail)),
  });
  const url = `${window.location.origin}/book/${form.slug}`;
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  return (
    <div className="space-y-6">
      <PageHeader title="Booking Website" subtitle="Share a simple direct booking page with your guests." />
      <Card className="max-w-3xl space-y-6 rounded-2xl border-border p-5 sm:p-7">
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Globe2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="font-medium">Public booking page</div><div className="break-all text-sm text-muted-foreground">{url}</div></div><Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} aria-label="Enable booking website" /></div>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Booking URL name</Label><div className="flex items-center gap-2"><span className="text-sm text-muted-foreground">/book/</span><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="hotel-name" /></div><p className="text-xs text-muted-foreground">Use lowercase letters, numbers, and hyphens. This public URL must be unique.</p></div>
          <div className="space-y-1.5"><Label>Headline</Label><Input value={form.headline || ""} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Public description</Label><Textarea rows={4} value={form.public_description || ""} onChange={(e) => setForm({ ...form, public_description: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={save.isPending || !form.slug.trim()} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save website</Button>
          <Button variant="outline" disabled={!form.enabled || !form.slug} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Preview</Button>
          <Button variant="ghost" disabled={!form.slug} onClick={async () => { await navigator.clipboard.writeText(url); toast.success("Booking link copied"); }}><Copy className="mr-2 h-4 w-4" />Copy link</Button>
        </div>
      </Card>
      <p className="max-w-3xl text-sm text-muted-foreground">Bookings are confirmed with payment due directly to the hotel. No card gateway is currently connected, so the public page does not represent a payment as collected.</p>
    </div>
  );
}

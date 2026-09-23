import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Building2, ScrollText, QrCode } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function Section({ children }) {
  return <Card className="space-y-4 rounded-2xl border-border p-6">{children}</Card>;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isOwner = user.role === "owner";
  const { data: prop, isLoading } = useQuery({ queryKey: ["property"], queryFn: async () => (await api.get("/setup/property")).data });

  const [hotel, setHotel] = useState({});
  const [policies, setPolicies] = useState({});
  const [pay, setPay] = useState({});

  useEffect(() => {
    if (prop) {
      setHotel({ name: prop.name || "", address: prop.address || "", city: prop.city || "", state: prop.state || "", phone: prop.phone || "", email: prop.email || "", checkin_time: prop.checkin_time || "14:00", checkout_time: prop.checkout_time || "11:00", description: prop.description || "" });
      setPolicies(prop.policies || {});
      setPay(prop.payment_settings || {});
    }
  }, [prop]);

  const saveHotel = useMutation({
    mutationFn: async () => (await api.put("/setup/property", hotel)).data,
    onSuccess: () => { toast.success("Hotel details saved"); qc.invalidateQueries({ queryKey: ["property"] }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  const savePolicies = useMutation({
    mutationFn: async () => (await api.put("/setup/policies", policies)).data,
    onSuccess: () => { toast.success("Policies saved"); qc.invalidateQueries({ queryKey: ["property"] }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });
  const savePay = useMutation({
    mutationFn: async () => (await api.put("/setup/payment-settings", pay)).data,
    onSuccess: () => { toast.success("Payment settings saved"); qc.invalidateQueries({ queryKey: ["property"] }); },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });

  if (isLoading || !prop) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const setH = (k) => (e) => setHotel({ ...hotel, [k]: e.target.value });
  const setP = (k) => (e) => setPolicies({ ...policies, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Configure your property" />
      <Tabs defaultValue="hotel">
        <TabsList>
          <TabsTrigger value="hotel" data-testid="tab-hotel"><Building2 className="mr-2 h-4 w-4" />Hotel</TabsTrigger>
          <TabsTrigger value="policies" data-testid="tab-policies"><ScrollText className="mr-2 h-4 w-4" />Policies</TabsTrigger>
          {isOwner && <TabsTrigger value="payment" data-testid="tab-payment"><QrCode className="mr-2 h-4 w-4" />Payment</TabsTrigger>}
        </TabsList>

        <TabsContent value="hotel" className="mt-4">
          <Section>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Hotel Name</Label><Input data-testid="hotel-name" value={hotel.name || ""} onChange={setH("name")} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={hotel.phone || ""} onChange={setH("phone")} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={hotel.email || ""} onChange={setH("email")} /></div>
              <div className="space-y-1.5"><Label>City</Label><Input value={hotel.city || ""} onChange={setH("city")} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input value={hotel.address || ""} onChange={setH("address")} /></div>
              <div className="space-y-1.5"><Label>Check-in Time</Label><Input type="time" value={hotel.checkin_time || ""} onChange={setH("checkin_time")} /></div>
              <div className="space-y-1.5"><Label>Check-out Time</Label><Input type="time" value={hotel.checkout_time || ""} onChange={setH("checkout_time")} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={hotel.description || ""} onChange={setH("description")} /></div>
            </div>
            <Button data-testid="save-hotel-btn" onClick={() => saveHotel.mutate()} disabled={saveHotel.isPending}>
              {saveHotel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </Section>
        </TabsContent>

        <TabsContent value="policies" className="mt-4">
          <Section>
            {[["cancellation", "Cancellation Policy"], ["checkin", "Check-in Policy"], ["checkout", "Check-out Policy"], ["extra_guest", "Extra Guest Policy"], ["child", "Child Policy"]].map(([k, label]) => (
              <div key={k} className="space-y-1.5"><Label>{label}</Label><Textarea rows={2} value={policies[k] || ""} onChange={setP(k)} /></div>
            ))}
            <Button data-testid="save-policies-btn" onClick={() => savePolicies.mutate()} disabled={savePolicies.isPending}>
              {savePolicies.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Policies"}
            </Button>
          </Section>
        </TabsContent>

        {isOwner && (
          <TabsContent value="payment" className="mt-4">
            <Section>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>UPI ID</Label><Input data-testid="upi-id-input" value={pay.upi_id || ""} onChange={(e) => setPay({ ...pay, upi_id: e.target.value })} placeholder="hotel@okhdfcbank" /></div>
                <div className="space-y-1.5"><Label>UPI Payee Name</Label><Input value={pay.upi_name || ""} onChange={(e) => setPay({ ...pay, upi_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Tax / GST (%)</Label><Input type="number" value={pay.tax_percent ?? 12} onChange={(e) => setPay({ ...pay, tax_percent: parseFloat(e.target.value) })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">The UPI ID is used to generate payment QR codes for guests at checkout.</p>
              <Button data-testid="save-payment-btn" onClick={() => savePay.mutate()} disabled={savePay.isPending}>
                {savePay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Payment Settings"}
              </Button>
            </Section>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, ArrowDownLeft } from "lucide-react";
import api from "@/lib/api";
import { inr, fmtDate, fmtTime } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Shared";
import { Card } from "@/components/ui/card";

const methodStyle = {
  upi: "bg-purple-100 text-purple-800",
  cash: "bg-emerald-100 text-emerald-800",
  card: "bg-blue-100 text-blue-800",
  bank_transfer: "bg-amber-100 text-amber-800",
  online: "bg-teal-100 text-teal-800",
};

export default function Payments() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({ queryKey: ["payments"], queryFn: async () => (await api.get("/payments")).data });
  const canViewTotal = ["owner", "manager", "accounts"].includes(user.role);
  const total = data.reduce((a, p) => a + (p.status === "completed" ? Math.max(0, (p.amount || 0) - (p.refunded_amount || 0)) : 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle={user.role === "accounts" ? "Property payment ledger. Guest identity is hidden for this role." : canViewTotal ? "Recorded transactions and refunds" : "Payment activity for active reservations"} />

      {canViewTotal && <Card className="flex items-center justify-between rounded-2xl border-primary/20 bg-primary/5 p-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Collected</div>
          <div className="mt-1 font-display text-3xl font-bold text-primary">{inr(total)}</div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><CreditCard className="h-6 w-6" /></div>
      </Card>}

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : data.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments yet" subtitle="Record payments from a reservation." />
      ) : (
        <div className="grid gap-2">
          {data.map((p) => (
            <Card key={p.id} data-testid={`payment-row-${p.id}`} className="flex items-center justify-between rounded-xl border-border p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${p.status === "refunded" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}><ArrowDownLeft className="h-5 w-5" /></div>
                <div>
                  <div className="font-medium">{p.guest_name}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(p.created_at)} · {fmtTime(p.created_at)} · by {p.recorded_by}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.status === "refunded" && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">Refund</span>}
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${methodStyle[p.method] || "bg-muted"}`}>{p.method.replace("_", " ").toUpperCase()}</span>
                <span className={`font-display text-lg font-bold ${p.status === "refunded" ? "text-rose-600" : ""}`}>{p.status === "refunded" ? `−${inr(p.amount)}` : inr(p.amount)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

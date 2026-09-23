import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, CircleAlert, FileSpreadsheet, IndianRupee, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { inr, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";

function SummaryCard({ icon: Icon, label, value, hint }) {
  return <Card className="rounded-2xl border-border p-5"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-primary" /></div><div className="mt-3 font-display text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{hint}</div></Card>;
}

export default function AccountsDashboard() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get("/dashboard/summary")).data });
  return <div className="space-y-6">
    <PageHeader title="Finance Overview" subtitle={fmtDate(new Date().toISOString())} />
    {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      : isError ? <Card className="p-5 text-sm text-destructive">Finance summary could not be loaded.</Card>
        : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryCard icon={IndianRupee} label="Collected today" value={inr(data.today_revenue)} hint="Recorded completed payments" />
            <SummaryCard icon={ArrowDownLeft} label="Net collected to date" value={inr(data.period_revenue)} hint="Completed payments less recorded refunds" />
            <SummaryCard icon={CircleAlert} label="Outstanding balances" value={inr(data.pending_amount)} hint={`${data.pending_payments_count} active reservations`} />
          </div>
          <Card className="rounded-2xl border-border p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /><h2 className="font-display text-lg font-semibold">Recent reconciliations</h2></div>
            {data.recent_reconciliations.length ? <div className="divide-y divide-border">{data.recent_reconciliations.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><div className="font-medium">{fmtDate(run.created_at)} · {run.created_by}</div><div className="text-xs text-muted-foreground">{run.row_count} statement rows</div></div><div><span className="font-medium text-emerald-700">{run.matched_count} matched</span><span className="mx-2 text-muted-foreground">·</span><span className="font-medium text-amber-700">{run.unmatched_count} unmatched</span></div></div>)}</div> : <p className="py-5 text-sm text-muted-foreground">No statement imports yet. Open Reconciliation to import a statement.</p>}
          </Card>
        </>}
  </div>;
}

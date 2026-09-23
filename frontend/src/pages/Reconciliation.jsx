import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/Shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLE = "reference,amount,date,method\nUPI-REF-123,1250.00,2026-09-24,upi";

function parseStatement(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Paste statement rows first");
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("reference") || first.includes("amount");
  const content = hasHeader ? lines.slice(1) : lines;
  const rows = content.map((line, index) => {
    const values = line.split(/[\t,;]/).map((value) => value.trim().replace(/^"|"$/g, ""));
    const [reference, rawAmount, date = "", method = ""] = values;
    const amount = Number(rawAmount);
    if (!reference || !Number.isFinite(amount) || amount <= 0) throw new Error(`Check statement row ${index + (hasHeader ? 2 : 1)}: reference and positive amount are required`);
    return { reference, amount, date, method };
  });
  if (!rows.length) throw new Error("No statement rows found below the header");
  return rows;
}

export default function Reconciliation() {
  const [statement, setStatement] = useState("");
  const [latestRun, setLatestRun] = useState(null);
  const qc = useQueryClient();
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["reconciliations"],
    queryFn: async () => (await api.get("/payments/reconciliations")).data,
  });
  const reconcile = useMutation({
    mutationFn: async (rows) => (await api.post("/payments/reconciliations", { rows })).data,
    onSuccess: (data) => {
      setLatestRun(data);
      setStatement("");
      qc.invalidateQueries({ queryKey: ["reconciliations"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(`Matched ${data.matched_count} of ${data.row_count} rows`);
    },
    onError: (error) => toast.error(apiError(error.response?.data?.detail || error.message)),
  });

  const submit = () => {
    try { reconcile.mutate(parseStatement(statement)); }
    catch (error) { toast.error(error.message); }
  };
  const shownRun = latestRun || runs[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Settlement reconciliation" subtitle="Match bank or UPI statement rows to recorded Innos payments." />
      <Card className="space-y-4 rounded-2xl border-border p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><FileSpreadsheet className="h-5 w-5" /></div>
          <div><h2 className="font-display text-lg font-semibold">Import statement rows</h2><p className="mt-1 text-sm text-muted-foreground">Paste comma, semicolon, or tab-separated rows. Use reference, amount, date, method columns. Header is optional.</p></div>
        </div>
        <Textarea rows={7} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder={EXAMPLE} className="font-mono text-xs" />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">Rows match completed Innos payments by exact reference and amount. Reconciliation records the match; it does not move money or verify a provider settlement.</p>
          <Button disabled={!statement.trim() || reconcile.isPending} onClick={submit}>{reconcile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Reconcile rows</Button>
        </div>
      </Card>

      {shownRun && <Card className="space-y-4 rounded-2xl border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-display text-lg font-semibold">Latest import</h2><p className="mt-1 text-xs text-muted-foreground">{new Date(shownRun.created_at).toLocaleString()} · {shownRun.created_by}</p></div>
          <div className="flex gap-2 text-xs"><span className="rounded-full bg-emerald-100 px-3 py-1.5 font-medium text-emerald-800">{shownRun.matched_count} matched</span><span className="rounded-full bg-amber-100 px-3 py-1.5 font-medium text-amber-800">{shownRun.unmatched_count} unmatched</span></div>
        </div>
        <div className="divide-y divide-border rounded-xl border border-border">
          {(shownRun.rows || []).map((row, index) => <div key={`${row.reference}-${index}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
            <div className="min-w-0"><div className="truncate font-medium">{row.reference}</div><div className="mt-0.5 text-xs text-muted-foreground">{row.date || "No date"}{row.method ? ` · ${row.method}` : ""}</div></div>
            <div className="flex items-center gap-3"><span className="font-medium">₹{Number(row.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span><span className={`inline-flex items-center gap-1 text-xs font-medium ${row.status === "matched" ? "text-emerald-700" : "text-amber-700"}`}>{row.status === "matched" && <CheckCircle2 className="h-3.5 w-3.5" />}{row.status}</span></div>
          </div>)}
        </div>
      </Card>}

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Recent imports</h2>
        {isLoading ? <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : runs.length === 0 ? <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No settlement statements have been reconciled.</p> : runs.slice(0, 10).map((run) => <Card key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-border p-4"><div><div className="font-medium">{new Date(run.created_at).toLocaleString()}</div><div className="text-xs text-muted-foreground">{run.created_by} · {run.row_count} rows</div></div><div className="text-sm"><span className="font-medium text-emerald-700">{run.matched_count} matched</span><span className="mx-2 text-muted-foreground">·</span><span className="font-medium text-amber-700">{run.unmatched_count} unmatched</span></div></Card>)}
      </div>
    </div>
  );
}

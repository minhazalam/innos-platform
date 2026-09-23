import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LogIn, LogOut, Wallet, QrCode, FileDown, Ban, Loader2, User, BedDouble,
  CalendarRange, Users2, StickyNote,
} from "lucide-react";
import api, { apiError } from "@/lib/api";
import { inr, fmtDate, SOURCE_LABELS } from "@/lib/format";
import { ResStatusBadge } from "@/components/Shared";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

export default function ReservationDialog({ id, open, onClose, canPay = true, canInvoice = true }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState("view"); // view | pay | qr
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [qr, setQr] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ["reservation", id],
    queryFn: async () => (await api.get(`/reservations/${id}`)).data,
    enabled: !!id && open,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reservation", id] });
    qc.invalidateQueries({ queryKey: ["reservations"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };

  const action = useMutation({
    mutationFn: async (kind) => (await api.post(`/reservations/${id}/${kind}`)).data,
    onSuccess: (_d, kind) => {
      toast.success(`${kind === "checkin" ? "Checked in" : kind === "checkout" ? "Checked out" : "Cancelled"} successfully`);
      refresh();
    },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });

  const pay = useMutation({
    mutationFn: async (body) => (await api.post("/payments", body)).data,
    onSuccess: () => {
      toast.success("Payment recorded");
      setMode("view"); setAmount(""); setReference(""); setQr(null);
      refresh();
    },
    onError: (e) => toast.error(apiError(e.response?.data?.detail)),
  });

  const genQr = async () => {
    const amt = parseFloat(amount || res.balance);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    try {
      const { data } = await api.post("/payments/upi-qr", { reservation_id: id, amount: amt });
      setQr(data);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const downloadInvoice = async () => {
    setInvoiceLoading(true);
    try {
      const resp = await api.get(`/payments/invoice/${id}`, { responseType: "blob" });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url; a.download = `invoice-${id.slice(-6)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Could not generate invoice");
    } finally {
      setInvoiceLoading(false);
    }
  };

  const close = () => { setMode("view"); setQr(null); setAmount(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto hotelos-scroll sm:max-w-lg" data-testid="reservation-dialog">
        {isLoading || !res ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="font-display text-xl">Reservation</DialogTitle>
                <ResStatusBadge status={res.status} />
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <Detail icon={User} label="Guest" value={res.guest_name} />
              <Detail icon={BedDouble} label="Room" value={res.room_number} />
              <Detail icon={CalendarRange} label="Check-in" value={fmtDate(res.check_in)} />
              <Detail icon={CalendarRange} label="Check-out" value={fmtDate(res.check_out)} />
              <Detail icon={Users2} label="Guests" value={res.num_guests} />
              <Detail icon={StickyNote} label="Source" value={SOURCE_LABELS[res.source] || res.source} />
            </div>

            {res.special_requests && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">Special requests: </span>{res.special_requests}
              </div>
            )}

            {/* Financials */}
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-border p-4">
              <div><div className="text-xs text-muted-foreground">Total</div><div className="font-display text-lg font-bold">{inr(res.total_amount)}</div></div>
              <div><div className="text-xs text-muted-foreground">Paid</div><div className="font-display text-lg font-bold text-emerald-600">{inr(res.paid_amount)}</div></div>
              <div><div className="text-xs text-muted-foreground">Balance</div><div className={`font-display text-lg font-bold ${res.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{inr(res.balance)}</div></div>
            </div>

            {/* Payment mode */}
            {mode === "pay" && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="font-medium">Record Payment</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Amount (₹)</Label>
                    <Input data-testid="pay-amount" type="number" value={amount}
                      onChange={(e) => setAmount(e.target.value)} placeholder={String(res.balance)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger data-testid="pay-method"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["cash", "upi", "card", "bank_transfer", "online"].map((m) => (
                          <SelectItem key={m} value={m}>{m.replace("_", " ").toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Input placeholder="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setMode("view")} className="flex-1">Cancel</Button>
                  <Button data-testid="pay-submit" className="flex-1" disabled={pay.isPending}
                    onClick={() => pay.mutate({ reservation_id: id, amount: parseFloat(amount || res.balance), method, reference })}>
                    {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
                  </Button>
                </div>
              </div>
            )}

            {mode === "qr" && (
              <div className="space-y-3 rounded-xl border border-border p-4 text-center">
                <div className="font-medium">UPI Payment</div>
                {!qr ? (
                  <>
                    <div className="space-y-1.5 text-left">
                      <Label>Amount (₹)</Label>
                      <Input data-testid="qr-amount" type="number" value={amount}
                        onChange={(e) => setAmount(e.target.value)} placeholder={String(res.balance)} />
                    </div>
                    <Button data-testid="qr-generate" onClick={genQr} className="w-full">Generate UPI QR</Button>
                    <Button variant="ghost" onClick={() => setMode("view")} className="w-full">Back</Button>
                  </>
                ) : (
                  <>
                    <img src={qr.qr_data_url} alt="UPI QR" className="mx-auto h-52 w-52 rounded-lg border border-border" data-testid="qr-image" />
                    <div className="text-sm">Pay <span className="font-bold">{inr(qr.amount)}</span> to</div>
                    <div className="font-mono text-xs text-muted-foreground">{qr.upi_id}</div>
                    <p className="text-xs text-muted-foreground">Scan with Google Pay, PhonePe, Paytm or any UPI app.</p>
                    <Button data-testid="qr-mark-paid" className="w-full" disabled={pay.isPending}
                      onClick={() => pay.mutate({ reservation_id: id, amount: qr.amount, method: "upi", reference: "UPI QR" })}>
                      {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark as Received"}
                    </Button>
                    <Button variant="ghost" onClick={() => { setQr(null); setMode("view"); }} className="w-full">Close</Button>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            {mode === "view" && (
              <div className="grid grid-cols-2 gap-2">
                {res.status === "confirmed" && (
                  <Button data-testid="checkin-btn" onClick={() => action.mutate("checkin")} disabled={action.isPending} className="col-span-2">
                    <LogIn className="mr-2 h-4 w-4" /> Check In
                  </Button>
                )}
                {res.status === "checked_in" && (
                  <Button data-testid="checkout-btn" onClick={() => action.mutate("checkout")} disabled={action.isPending} className="col-span-2">
                    <LogOut className="mr-2 h-4 w-4" /> Check Out
                  </Button>
                )}
                {canPay && res.balance > 0 && ["confirmed", "checked_in"].includes(res.status) && (
                  <>
                    <Button variant="outline" data-testid="record-payment-btn" onClick={() => { setAmount(String(res.balance)); setMode("pay"); }}>
                      <Wallet className="mr-2 h-4 w-4" /> Payment
                    </Button>
                    <Button variant="outline" data-testid="upi-qr-btn" onClick={() => { setAmount(String(res.balance)); setMode("qr"); }}>
                      <QrCode className="mr-2 h-4 w-4" /> UPI QR
                    </Button>
                  </>
                )}
                {canInvoice && (
                  <Button variant="outline" data-testid="invoice-btn" onClick={downloadInvoice} disabled={invoiceLoading}>
                    {invoiceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Invoice
                  </Button>
                )}
                {res.status === "confirmed" && (
                  <Button variant="ghost" data-testid="cancel-res-btn" className="text-rose-600 hover:text-rose-700"
                    onClick={() => action.mutate("cancel")} disabled={action.isPending}>
                    <Ban className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

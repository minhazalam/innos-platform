import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LogIn, LogOut, Wallet, QrCode, FileDown, Ban, Loader2, User, BedDouble,
  CalendarRange, Users2, StickyNote, RotateCcw,
  MessageCircle, Mail,
} from "lucide-react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
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
  const { user } = useAuth();
  const qc = useQueryClient();
  const [mode, setMode] = useState("view"); // view | pay | qr | refund
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [qr, setQr] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
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

  const refund = useMutation({
    mutationFn: async (body) => (await api.post("/payments/refund", body)).data,
    onSuccess: () => { toast.success("Refund recorded"); setMode("view"); setRefundTarget(null); setRefundAmount(""); setRefundReason(""); refresh(); },
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

  const messageBody = res ? `Hello ${res.guest_name}, your hotel stay is ${res.status.replace("_", " ")} for ${fmtDate(res.check_in)} to ${fmtDate(res.check_out)}${res.room_number ? ` in room ${res.room_number}` : ""}.${res.balance > 0 ? ` Balance due: ${inr(res.balance)}.` : ""} Please contact us if you need assistance.` : "";
  const waNumber = String(res?.guest_phone || "").replace(/\D/g, "");
  const normalizedWaNumber = waNumber.length === 10 ? `91${waNumber}` : waNumber;
  const whatsappHref = `https://wa.me/${normalizedWaNumber}?text=${encodeURIComponent(messageBody)}`;
  const emailHref = `mailto:${encodeURIComponent(res?.guest_email || "")}?subject=${encodeURIComponent("Your hotel reservation")}\u0026body=${encodeURIComponent(messageBody)}`;

  const close = () => { setMode("view"); setQr(null); setAmount(""); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto innos-scroll sm:max-w-lg" data-testid="reservation-dialog">
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

            <div className="flex flex-wrap gap-2">
              {normalizedWaNumber.length >= 11 && <Button size="sm" variant="outline" asChild><a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Draft WhatsApp</a></Button>}
              {res.guest_email && <Button size="sm" variant="outline" asChild><a href={emailHref}><Mail className="mr-2 h-4 w-4" />Draft email</a></Button>}
            </div>
              <p className="text-xs text-muted-foreground">Message drafts open in your selected app. Innos does not send or track delivery.</p>

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

            {res.payments?.length > 0 && <div className="space-y-2 rounded-xl border border-border p-4">
              <div className="text-sm font-medium">Payment history</div>
              {res.payments.map((payment) => {
                const refundable = Math.max((payment.amount || 0) - (payment.refunded_amount || 0), 0);
                return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-sm">
                  <div><span className="font-medium">{inr(payment.amount)}</span><span className="ml-2 text-xs text-muted-foreground">{(payment.method || "").replace("_", " ").toUpperCase()} · {fmtDate(payment.created_at)}</span><span className="ml-2 text-xs capitalize text-muted-foreground">{payment.status}</span></div>
                  {user.role === "owner" && payment.status === "completed" && refundable > 0 && <Button size="sm" variant="ghost" onClick={() => { setRefundTarget(payment); setRefundAmount(String(refundable)); setRefundReason(""); setMode("refund"); }}><RotateCcw className="mr-2 h-3.5 w-3.5" /> Refund</Button>}
                </div>;
              })}
            </div>}

            {mode === "refund" && refundTarget && <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="font-medium">Issue refund</div>
              <p className="text-xs text-muted-foreground">This records a refund for reconciliation; money is not transferred by Innos.</p>
              <div className="space-y-1.5"><Label>Amount (₹), up to {inr(refundTarget.amount - (refundTarget.refunded_amount || 0))}</Label><Input type="number" min="0.01" max={refundTarget.amount - (refundTarget.refunded_amount || 0)} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} /></div>
              <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason / reference (optional)" />
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => { setMode("view"); setRefundTarget(null); }}>Cancel</Button><Button className="flex-1" disabled={refund.isPending || !Number(refundAmount)} onClick={() => refund.mutate({ payment_id: refundTarget.id, amount: Number(refundAmount), reason: refundReason })}>{refund.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record refund"}</Button></div>
            </div>}

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

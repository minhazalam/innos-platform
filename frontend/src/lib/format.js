export const inr = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const inr2 = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateShort = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

export const fmtTime = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDaysISO = (iso, days) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const ROOM_STATUS = {
  available: { label: "Available", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" },
  occupied: { label: "Occupied", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  dirty: { label: "Dirty", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800" },
  cleaning: { label: "Cleaning", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-800" },
  maintenance: { label: "Maintenance", dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800" },
  out_of_order: { label: "Out of Order", dot: "bg-slate-500", badge: "bg-slate-200 text-slate-800" },
};

export const RES_STATUS = {
  confirmed: { label: "Confirmed", badge: "bg-blue-100 text-blue-800" },
  checked_in: { label: "Checked In", badge: "bg-emerald-100 text-emerald-800" },
  checked_out: { label: "Checked Out", badge: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Cancelled", badge: "bg-rose-100 text-rose-800" },
  no_show: { label: "No Show", badge: "bg-amber-100 text-amber-800" },
};

export const SOURCE_LABELS = {
  direct: "Direct Website",
  walk_in: "Walk-in",
  phone: "Phone",
  whatsapp: "WhatsApp",
  ota: "OTA / Manual",
  other: "Other",
};

export const ROLE_LABELS = {
  owner: "Owner",
  manager: "Manager",
  front_desk: "Front Desk",
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  accounts: "Accounts",
};

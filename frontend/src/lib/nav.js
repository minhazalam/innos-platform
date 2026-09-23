import {
  LayoutDashboard, CalendarDays, BedDouble, Users, CreditCard,
  Settings, UserCog, ClipboardList, Wrench, Sparkles,
} from "lucide-react";

// Navigation per role. path, label, icon, testid.
export const NAV = {
  owner: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/reservations", label: "Reservations", icon: ClipboardList },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/rooms", label: "Rooms", icon: BedDouble },
    { to: "/guests", label: "Guests", icon: Users },
    { to: "/housekeeping", label: "Housekeeping", icon: Sparkles },
    { to: "/guest-requests", label: "Guest Requests", icon: ClipboardList },
    { to: "/maintenance", label: "Maintenance", icon: Wrench },
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/reconciliation", label: "Reconciliation", icon: CreditCard },
    { to: "/analytics", label: "Analytics", icon: CalendarDays },
    { to: "/ai-manager", label: "AI Manager", icon: Sparkles },
    { to: "/booking-website", label: "Booking Website", icon: BedDouble },
    { to: "/staff", label: "Staff", icon: UserCog },
    { to: "/audit", label: "Audit Log", icon: ClipboardList },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  manager: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/reservations", label: "Reservations", icon: ClipboardList },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/rooms", label: "Rooms", icon: BedDouble },
    { to: "/guests", label: "Guests", icon: Users },
    { to: "/housekeeping", label: "Housekeeping", icon: Sparkles },
    { to: "/guest-requests", label: "Guest Requests", icon: ClipboardList },
    { to: "/maintenance", label: "Maintenance", icon: Wrench },
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/reconciliation", label: "Reconciliation", icon: CreditCard },
    { to: "/analytics", label: "Analytics", icon: CalendarDays },
    { to: "/ai-manager", label: "AI Manager", icon: Sparkles },
    { to: "/booking-website", label: "Booking Website", icon: BedDouble },
    { to: "/staff", label: "Staff", icon: UserCog },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  accounts: [
    { to: "/", label: "Finance Overview", icon: LayoutDashboard },
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/reconciliation", label: "Reconciliation", icon: ClipboardList },
    { to: "/analytics", label: "Analytics", icon: CalendarDays },
  ],
  front_desk: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/reservations", label: "Reservations", icon: ClipboardList },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/rooms", label: "Rooms", icon: BedDouble },
    { to: "/guests", label: "Guests", icon: Users },
    { to: "/guest-requests", label: "Guest Requests", icon: ClipboardList },
    { to: "/maintenance", label: "Report Issue", icon: Wrench },
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/ai-manager", label: "AI Assistant", icon: Sparkles },
  ],
  housekeeping: [{ to: "/", label: "My Tasks", icon: Sparkles }],
  maintenance: [{ to: "/", label: "My Issues", icon: Wrench }],
};

export const canAccess = (role, path) =>
  (NAV[role] || []).some((n) => n.to === path);

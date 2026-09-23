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
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/staff", label: "Staff", icon: UserCog },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  manager: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/reservations", label: "Reservations", icon: ClipboardList },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/rooms", label: "Rooms", icon: BedDouble },
    { to: "/guests", label: "Guests", icon: Users },
    { to: "/payments", label: "Payments", icon: CreditCard },
    { to: "/staff", label: "Staff", icon: UserCog },
    { to: "/settings", label: "Settings", icon: Settings },
  ],
  front_desk: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/reservations", label: "Reservations", icon: ClipboardList },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/rooms", label: "Rooms", icon: BedDouble },
    { to: "/guests", label: "Guests", icon: Users },
    { to: "/payments", label: "Payments", icon: CreditCard },
  ],
  housekeeping: [{ to: "/", label: "My Tasks", icon: Sparkles }],
  maintenance: [{ to: "/", label: "My Issues", icon: Wrench }],
};

export const canAccess = (role, path) =>
  (NAV[role] || []).some((n) => n.to === path);

import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Menu, LogOut, Building2, ChevronDown, Bell, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { NAV } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

function NavItems({ items, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive
                  ? "bg-primary/10 text-primary border-l-2 border-primary pl-[10px]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Brand({ hotelName }) {
  return (
    <div className="flex items-center gap-3 px-6 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Building2 className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-base font-bold tracking-tight text-foreground">Innos</div>
        <div className="max-w-[150px] truncate text-xs text-muted-foreground">{hotelName || "Hotel"}</div>
      </div>
    </div>
  );
}

export default function Layout({ children, hotelName }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const qc = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"], queryFn: async () => (await api.get("/notifications")).data,
    refetchInterval: 30000,
  });
  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["global-search", searchTerm],
    queryFn: async () => (await api.get("/search", { params: { q: searchTerm } })).data,
    enabled: searchOpen && searchTerm.trim().length >= 2,
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const items = NAV[user.role] || [];

  const initials = (user.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <Brand hotelName={hotelName} />
        <div className="flex-1 overflow-y-auto innos-scroll py-2">
          <NavItems items={items} />
        </div>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/70 px-4 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" data-testid="mobile-menu-btn">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <Brand hotelName={hotelName} />
                <NavItems items={items} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="font-display text-lg font-semibold tracking-tight lg:hidden">Innos</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" className="hidden h-9 gap-2 text-muted-foreground sm:flex" onClick={() => setSearchOpen(true)} aria-label="Search hotel data">
              <Search className="h-4 w-4" /><span className="text-sm">Search</span><kbd className="ml-6 rounded border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setSearchOpen(true)} aria-label="Search"><Search className="h-5 w-5" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label={`Notifications${notifications.filter((n) => !n.read).length ? `, ${notifications.filter((n) => !n.read).length} unread` : ""}`} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-muted">
                  <Bell className="h-4 w-4" />
                  {notifications.some((n) => !n.read) && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-card" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? <div className="px-3 py-5 text-center text-sm text-muted-foreground">You’re all caught up.</div> : notifications.slice(0, 8).map((item) => (
                  <DropdownMenuItem key={item.id} className="items-start gap-2 whitespace-normal py-3" onSelect={() => { if (!item.read) markRead.mutate(item.id); navigate(item.link || "/"); }}>
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read ? "bg-muted" : "bg-primary"}`} />
                    <span><span className="block text-sm font-medium">{item.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{item.message}</span></span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button data-testid="user-menu-btn" className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1.5 text-sm transition-colors hover:bg-muted">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initials}
                </div>
                <span className="hidden font-medium sm:inline">{user.name}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">{ROLE_LABELS[user.role]}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="logout-btn" className="text-rose-600">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchTerm(""); }}>
          <DialogContent className="top-[20%] max-w-xl translate-y-0 p-0" aria-describedby={undefined}>
            <DialogHeader className="sr-only"><DialogTitle>Search hotel records</DialogTitle></DialogHeader>
            <div className="flex items-center gap-3 border-b border-border px-4"><Search className="h-4 w-4 text-muted-foreground" /><Input autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search guests, bookings, rooms, tasks…" className="h-14 border-0 shadow-none focus-visible:ring-0" /></div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {searchTerm.trim().length < 2 ? <p className="px-3 py-5 text-sm text-muted-foreground">Type at least two characters to search property records.</p> : searching ? <p className="px-3 py-5 text-sm text-muted-foreground">Searching…</p> : searchResults.length === 0 ? <p className="px-3 py-5 text-sm text-muted-foreground">No matching records.</p> : searchResults.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { setSearchOpen(false); setSearchTerm(""); navigate(result.href); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-muted"><span className="min-w-0"><span className="block truncate text-sm font-medium">{result.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.detail}</span></span><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{result.type}</span></button>)}
            </div>
          </DialogContent>
        </Dialog>

        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex-1 overflow-y-auto innos-scroll p-4 lg:p-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}

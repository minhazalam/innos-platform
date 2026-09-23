import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Building2, Mountain, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HERO = "https://images.unsplash.com/photo-1670915198844-51975abf6955?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600";

export default function Login() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email.trim(), password);
    setLoading(false);
    if (ok) navigate("/");
  };

  const quick = (em, pw) => { setEmail(em); setPassword(pw); };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left visual */}
      <div className="relative hidden overflow-hidden lg:block">
        <img src={HERO} alt="Mountain hotel" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1f2b] via-[#1a1f2b]/40 to-transparent" />
        <div className="absolute bottom-0 left-0 p-12 text-white">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-white/80">
            <Mountain className="h-4 w-4" /> Dharamshala, Himachal Pradesh
          </div>
          <h2 className="font-display text-4xl font-bold leading-tight">
            Run your hotel,<br />the simple way.
          </h2>
          <p className="mt-3 max-w-md text-white/80">
            Bookings, rooms, guests, housekeeping and payments — beautifully in one place.
          </p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-xl font-bold tracking-tight">HotelOS</div>
              <div className="text-xs text-muted-foreground">Hotel Operating System</div>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your property.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@hotel.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="login-password" type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && (
              <div data-testid="login-error" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Button type="submit" data-testid="login-submit" disabled={loading}
              className="w-full rounded-lg py-6 text-base font-semibold">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign in"}
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demo accounts</p>
            <div className="grid grid-cols-1 gap-1.5 text-sm">
              {[
                ["Owner", "minhazalam.work@gmail.com", "Owner@123"],
                ["Manager", "manager@dharamshalaheights.in", "Manager@123"],
                ["Front Desk", "frontdesk@dharamshalaheights.in", "Frontdesk@123"],
                ["Housekeeping", "housekeeping@dharamshalaheights.in", "House@123"],
                ["Maintenance", "maintenance@dharamshalaheights.in", "Maint@123"],
              ].map(([role, em, pw]) => (
                <button key={em} type="button" onClick={() => quick(em, pw)}
                  data-testid={`demo-${role.toLowerCase().replace(/\s+/g, "-")}`}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-left transition-colors hover:bg-background">
                  <span className="font-medium">{role}</span>
                  <span className="truncate pl-2 text-xs text-muted-foreground">{em}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

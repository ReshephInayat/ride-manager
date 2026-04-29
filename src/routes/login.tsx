import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Car, ShieldCheck, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import loginHero from "@/assets/login-hero.jpg";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left visual panel */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src={loginHero}
          alt="Luxury limousine and SUV at airport terminal"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Strong dark overlay for text readability */}
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur grid place-items-center ring-1 ring-white/20">
              <Car className="h-6 w-6 text-white" />
            </span>
            <div>
              <div className="font-semibold text-xl text-white leading-tight">Puget Sound Limo</div>
              <div className="text-xs text-white/70">Ground Transportation Manager</div>
            </div>
          </div>

          <div>
            <h1 className="text-5xl font-bold leading-[1.1] text-white">
              Manage every ride.<br />
              <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                Bill every trip.
              </span>
            </h1>
            <p className="mt-5 text-white/90 text-lg max-w-md">
              Upload schedules, track rides, and generate clean invoices for the airline — all in one place.
            </p>

            <div className="mt-8 grid gap-3 max-w-sm">
              <Feature icon={<Sparkles className="h-4 w-4" />} text="Auto-extract rides from PDFs" />
              <Feature icon={<ShieldCheck className="h-4 w-4" />} text="No duplicate imports — ever" />
              <Feature icon={<FileText className="h-4 w-4" />} text="One-click branded invoices" />
            </div>
          </div>

          <div className="text-xs text-white/60">© {new Date().getFullYear()} Puget Sound Limo</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/40 relative">
        {/* Mobile mini hero */}
        <div className="lg:hidden absolute top-0 left-0 right-0 h-40 overflow-hidden">
          <img src={loginHero} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/70" />
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <div className="flex items-center gap-2 font-semibold">
              <Car className="h-5 w-5" /> Puget Sound Limo
            </div>
          </div>
        </div>

        <Card className="w-full max-w-md p-8 shadow-xl border-border/60 mt-44 lg:mt-0">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Sign in to manage your rides and invoices.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={busy}>
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6">
            Authorized account access only.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-white/95">
      <span className="h-8 w-8 rounded-lg bg-white/10 backdrop-blur grid place-items-center ring-1 ring-white/15">
        {icon}
      </span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, Sparkles, FileText } from "lucide-react";
import { toast } from "react-hot-toast";
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
      {/* Left visual panel — hidden on mobile */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src={loginHero}
          alt="Luxury limousine and SUV at airport terminal"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-background/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#080810]/90 via-[#080810]/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-foreground">
          <div className="text-2xl font-bold tracking-tight">Puget Sound Limo</div>

          <div>
            <h1 className="text-5xl font-bold leading-[1.1]">
              Manage every ride.
              <br />
              <span className="text-[#F5A623]">Bill every trip.</span>
            </h1>
            <p className="mt-5 text-foreground/80 text-lg max-w-md">
              Upload schedules, track rides, and generate clean invoices for the airline — all in one place.
            </p>

            <div className="mt-8 grid gap-3 max-w-sm">
              <FeatureRow icon={<Sparkles className="h-4 w-4" />} text="Auto-extract rides from PDFs" />
              <FeatureRow icon={<ShieldCheck className="h-4 w-4" />} text="No duplicate imports — ever" />
              <FeatureRow icon={<FileText className="h-4 w-4" />} text="One-click branded invoices" />
            </div>
          </div>

          <div className="text-xs text-muted-foreground/60">© {new Date().getFullYear()} Puget Sound Limo</div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-5 sm:p-8 relative min-h-screen lg:min-h-0">
        {/* Mobile logo */}
        <div className="lg:hidden absolute top-0 left-0 right-0 flex items-center justify-center py-10">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground tracking-tight">Puget Sound Limo</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#F5A623] font-medium mt-1">Ride Manager</div>
          </div>
        </div>

        <div className="w-full max-w-md bg-card border border-border rounded-[20px] p-8 sm:p-12 mt-24 lg:mt-0">
          <div className="mb-8">
            <h2 className="text-[28px] font-semibold text-foreground">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Sign in to manage your rides and invoices.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full input-luxury px-4 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full input-luxury px-4 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full btn-primary-gradient text-sm flex items-center justify-center disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-xs text-muted-foreground/60 text-center mt-8">
            Authorized account access only.
          </p>
          <div className="mt-4 flex items-center justify-between text-xs">
            <Link to="/" className="text-muted-foreground hover:text-[#F5A623] transition-colors">
              ← Back to home
            </Link>
            <Link to="/driver" className="text-muted-foreground hover:text-[#F5A623] transition-colors">
              I'm a driver →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-foreground/90">
      <span className="h-8 w-8 rounded-lg bg-[#6C63FF]/20 grid place-items-center text-[#6C63FF] shrink-0">
        {icon}
      </span>
      <span className="text-sm">{text}</span>
    </div>
  );
}

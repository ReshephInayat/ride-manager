import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  ShieldCheck,
  Car,
  ArrowRight,
  Sparkles,
  Plane,
  Clock,
  MessageSquare,
  CheckCircle2,
} from "lucide-react";
import landingHero from "@/assets/landing-hero.jpg";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Puget Sound Limo — Ride manager & driver portal" },
      {
        name: "description",
        content:
          "Sign in to manage rides, dispatch drivers, and send branded invoices. Drivers can view their schedule, get SMS alerts, and update ride status in real time.",
      },
    ],
  }),
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Background hero — hidden on mobile */}
      <div className="absolute inset-0 -z-0 hidden sm:block">
        <img
          src={landingHero}
          alt="Luxury chauffeur and limousine at airport terminal"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-background/65" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="px-5 sm:px-8 py-5 sm:py-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div>
              <div className="text-lg font-bold tracking-tight text-foreground">
                Puget Sound Limo
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#F5A623] font-medium">
                Ride Manager
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-2 text-xs text-foreground/70 px-3 py-1.5 glass-pill">
                <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
                Live dispatch
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Hero */}
        <main className="flex-1 px-5 sm:px-8 pb-12">
          <div className="max-w-6xl mx-auto">
            <div className="pt-8 sm:pt-14 lg:pt-20 max-w-3xl page-enter">
              {/* Feature badge */}
              <span className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 glass-pill mb-6">
                <Sparkles className="h-3.5 w-3.5 text-[#F5A623]" />
                <span className="text-foreground/80">Two systems. One dispatch.</span>
              </span>

              <h1 className="text-4xl sm:text-[56px] lg:text-[64px] font-bold leading-[1.08] tracking-tight">
                <span className="text-foreground">Premium rides,</span>
                <br />
                <span className="text-[#F5A623]">
                  effortlessly managed.
                </span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-[520px]">
                Dispatch chauffeurs, track every pickup, and bill the airline —
                all from one beautiful console. Drivers get their schedule and
                SMS alerts on the go.
              </p>
            </div>

            {/* Sign-in cards */}
            <div className="mt-10 sm:mt-14 grid gap-5 sm:gap-6 sm:grid-cols-2 max-w-[900px]">
              <Link
                to="/login"
                className="group block rounded-[20px] bg-card border border-border p-7 sm:p-8 luxury-card-hover transition-all"
              >
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#F5A623] to-[#E8820C] grid place-items-center text-foreground shadow-lg transition-transform group-hover:scale-110">
                  <ShieldCheck className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-foreground">Admin login</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Manage rides, drivers, routes and invoices for both workspaces.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#F5A623]">
                  Sign in as admin
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>

              <Link
                to="/driver"
                className="group block rounded-[20px] bg-muted border border-border p-7 sm:p-8 luxury-card-hover transition-all"
              >
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#6C63FF] to-[#9B59B6] grid place-items-center text-foreground shadow-lg transition-transform group-hover:scale-110">
                  <Car className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-foreground">Driver login</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  View today's rides, get SMS alerts and update ride status.
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#6C63FF]">
                  Sign in as driver
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </div>

            {/* Feature strip */}
            <div className="mt-12 sm:mt-16 grid gap-4 sm:grid-cols-3 max-w-[900px]">
              <FeaturePill icon={<Plane className="h-4 w-4" />} text="Auto-extract rides from PDFs" />
              <FeaturePill icon={<MessageSquare className="h-4 w-4" />} text="SMS to drivers 1hr before pickup" />
              <FeaturePill icon={<Clock className="h-4 w-4" />} text="Real-time status updates" />
            </div>
          </div>
        </main>

        <footer className="px-5 sm:px-8 py-6 text-center text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} Puget Sound Limo
        </footer>
      </div>
    </div>
  );
}

function FeaturePill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-foreground/80 px-4 py-3 rounded-xl bg-muted/50 border border-border backdrop-blur-sm">
      <span className="h-8 w-8 rounded-lg bg-white/[0.06] grid place-items-center text-[#F5A623] shrink-0">
        {icon}
      </span>
      <span>{text}</span>
      <CheckCircle2 className="h-4 w-4 ml-auto text-[#10B981]/80 shrink-0" />
    </div>
  );
}

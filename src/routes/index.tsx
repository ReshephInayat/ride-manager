import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      {/* Background hero image with overlay */}
      <div className="absolute inset-0 -z-0">
        <img
          src={landingHero}
          alt="Luxury chauffeur and limousine at airport terminal"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-950/85 to-slate-950/70" />
        {/* soft animated glow */}
        <div className="absolute -top-32 -left-32 w-[40rem] h-[40rem] rounded-full bg-amber-500/10 blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-32 -right-32 w-[40rem] h-[40rem] rounded-full bg-sky-500/10 blur-3xl animate-pulse"
          style={{ animationDelay: "1.5s" }}
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="px-4 sm:px-8 py-5 sm:py-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between animate-fade-in">
            <div>
              <div className="text-base sm:text-lg font-bold tracking-tight">
                Puget Sound Limo
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                Ride manager
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/70 px-3 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live dispatch
            </span>
          </div>
        </header>

        {/* Hero */}
        <main className="flex-1 px-4 sm:px-8 pb-12">
          <div className="max-w-6xl mx-auto">
            <div className="pt-6 sm:pt-12 lg:pt-16 max-w-3xl animate-fade-in">
              <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 ring-1 ring-white/10 mb-5">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                Two systems. One dispatch.
              </span>
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight">
                Premium rides,
                <br />
                <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                  effortlessly managed.
                </span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-white/75 max-w-xl">
                Dispatch chauffeurs, track every pickup, and bill the airline —
                all from one beautiful console. Drivers get their schedule and
                SMS alerts on the go.
              </p>
            </div>

            {/* Sign-in cards */}
            <div className="mt-10 sm:mt-14 grid gap-5 sm:gap-6 sm:grid-cols-2 max-w-4xl">
              <RoleCard
                to="/login"
                accent="from-amber-400 to-orange-500"
                icon={<ShieldCheck className="h-6 w-6" />}
                title="Admin login"
                description="Manage rides, drivers, routes and invoices for both workspaces."
                cta="Sign in as admin"
              />
              <RoleCard
                to="/driver"
                accent="from-sky-400 to-indigo-500"
                icon={<Car className="h-6 w-6" />}
                title="Driver login"
                description="View today's rides, get SMS alerts and update ride status."
                cta="Sign in as driver"
                outlined
              />
            </div>

            {/* Feature strip */}
            <div className="mt-12 sm:mt-16 grid gap-4 sm:grid-cols-3 max-w-4xl">
              <Feature
                icon={<Plane className="h-4 w-4" />}
                text="Auto-extract rides from PDFs"
              />
              <Feature
                icon={<MessageSquare className="h-4 w-4" />}
                text="SMS to drivers, 1 hr before pickup"
              />
              <Feature
                icon={<Clock className="h-4 w-4" />}
                text="Real-time status updates"
              />
            </div>
          </div>
        </main>

        <footer className="px-4 sm:px-8 py-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Puget Sound Limo
        </footer>
      </div>
    </div>
  );
}

function RoleCard({
  to,
  icon,
  title,
  description,
  cta,
  accent,
  outlined,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  accent: string;
  outlined?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group relative block rounded-2xl p-px overflow-hidden hover-scale animate-fade-in focus:outline-none focus:ring-2 focus:ring-white/40"
    >
      {/* Animated gradient ring */}
      <span
        className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-60 group-hover:opacity-100 transition-opacity`}
      />
      <span className="relative flex flex-col items-start rounded-[15px] bg-slate-950/80 backdrop-blur-xl p-7 sm:p-8 h-full ring-1 ring-white/10">
        <span
          className={`h-12 w-12 rounded-xl bg-gradient-to-br ${accent} grid place-items-center text-slate-950 shadow-lg shadow-black/40 transition-transform group-hover:scale-110`}
        >
          {icon}
        </span>
        <h2 className="mt-5 text-2xl sm:text-3xl font-bold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-white/65">{description}</p>
        <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
          {cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
        {outlined ? null : (
          <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
            Recommended
          </span>
        )}
      </span>
    </Link>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/80 px-4 py-3 rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur">
      <span className="h-8 w-8 rounded-lg bg-white/10 grid place-items-center ring-1 ring-white/15 text-amber-300">
        {icon}
      </span>
      <span>{text}</span>
      <CheckCircle2 className="h-4 w-4 ml-auto text-emerald-400/80" />
    </div>
  );
}

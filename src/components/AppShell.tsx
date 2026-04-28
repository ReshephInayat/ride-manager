import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Car, FileText, LayoutDashboard, Settings, LogOut } from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Rides", icon: LayoutDashboard },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/routes", label: "Routes & Pricing", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
            <span className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Car className="h-4 w-4" />
            </span>
            <span>Puget Sound Limos</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => {
              const active = loc.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-muted-foreground">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
        <nav className="md:hidden flex border-t overflow-x-auto">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            const I = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs ${
                  active ? "text-foreground border-b-2 border-accent" : "text-muted-foreground"
                }`}
              >
                <I className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

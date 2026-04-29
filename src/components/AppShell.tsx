import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useSystem, SYSTEM_LABELS, type WorkspaceSystem } from "@/lib/system";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { Logo } from "@/components/Logo";
import { ChatAssistant } from "@/components/ChatAssistant";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  LayoutDashboard,
  Settings,
  LogOut,
  Users,
  CalendarDays,
  Sun,
  Moon,
  Building2,
} from "lucide-react";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "Rides", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/drivers", label: "Drivers", icon: Users },
  { to: "/routes", label: "Routes", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { system, setSystem, label } = useSystem();
  const loc = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-lg min-w-0">
            <Logo />
            <span className="hidden sm:inline truncate">{label}</span>
          </Link>
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/60 border">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={system} onValueChange={(v) => setSystem(v as WorkspaceSystem)}>
              <SelectTrigger className="h-8 w-56 border-0 bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api">{SYSTEM_LABELS.api}</SelectItem>
                <SelectItem value="llc">{SYSTEM_LABELS.llc}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
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
        {/* Mobile/tablet workspace switcher */}
        <div className="lg:hidden border-t px-6 py-2 flex items-center gap-2 bg-secondary/30">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={system} onValueChange={(v) => setSystem(v as WorkspaceSystem)}>
            <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="api">{SYSTEM_LABELS.api}</SelectItem>
              <SelectItem value="llc">{SYSTEM_LABELS.llc}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <nav className="md:hidden flex border-t overflow-x-auto">
          {nav.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            const I = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs whitespace-nowrap ${
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
      <ChatAssistant />
    </div>
  );
}

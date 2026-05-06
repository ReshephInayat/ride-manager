import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useSystem, SYSTEM_LABELS, type WorkspaceSystem } from "@/lib/system";
import { NotificationBell } from "@/components/NotificationBell";
import { ChatAssistant } from "@/components/ChatAssistant";
import { useState, type ReactNode } from "react";
import {
  FileText,
  LayoutDashboard,
  Users,
  CalendarDays,
  Sun,
  Moon,
  LogOut,
  Settings,
  ScrollText,
  Building2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  MapPin,
} from "lucide-react";

const mainNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Main" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, group: "Main" },
];
const mgmtNav = [
  { to: "/drivers", label: "Drivers", icon: Users, group: "Management" },
  { to: "/routes", label: "Routes", icon: MapPin, group: "Management" },
];
const billingNav = [{ to: "/invoices", label: "Invoices", icon: FileText, group: "Billing" }];
const systemNav = [{ to: "/logs", label: "Logs", icon: ScrollText, group: "System" }];

const allNav = [...mainNav, ...mgmtNav, ...billingNav, ...systemNav];

// Bottom tab bar items (mobile)
const bottomTabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/drivers", label: "Drivers", icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { system, setSystem } = useSystem();
  const loc = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (to: string) =>
    loc.pathname === to ||
    loc.pathname.startsWith(to + "/") ||
    (to === "/dashboard" && loc.pathname.startsWith("/rides"));

  return (
    <div className="min-h-screen flex bg-[#080810]">
      {/* ─── SIDEBAR (Desktop/Tablet) ─── */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-screen bg-[#08080F] border-r border-white/[0.07] z-40 transition-all duration-200 ${collapsed ? "w-16" : "w-60"}`}
      >
        {/* Logo */}
        <div className={`px-4 py-5 border-b border-white/[0.07] ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6C63FF] to-[#9B59B6] grid place-items-center text-white text-xs font-bold">
              PS
            </div>
          ) : (
            <Link to="/dashboard" className="block">
              <div className="text-base font-bold text-white tracking-tight">Puget Sound Limo</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#F5A623] font-medium">Ride Manager</div>
            </Link>
          )}
        </div>

        {/* Workspace switcher */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.04]">
              <Building2 className="h-3.5 w-3.5 text-[#7A7A9A] shrink-0" />
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value as WorkspaceSystem)}
                className="flex-1 text-xs bg-transparent text-[#E2E2F0] border-none outline-none cursor-pointer appearance-none"
              >
                <option value="api">{SYSTEM_LABELS.api}</option>
                <option value="llc">{SYSTEM_LABELS.llc}</option>
              </select>
            </div>
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {[
            { label: "Main", items: mainNav },
            { label: "Management", items: mgmtNav },
            { label: "Billing", items: billingNav },
            { label: "System", items: systemNav },
          ].map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-[#4A4A6A] font-medium">
                  {group.label}
                </div>
              )}
              {group.items.map((n) => {
                const active = isActive(n.to);
                const I = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    title={collapsed ? n.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative ${
                      active
                        ? "bg-[#6C63FF]/15 text-[#6C63FF]"
                        : "text-[#7A7A9A] hover:text-[#E2E2F0] hover:bg-white/[0.04]"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#6C63FF]" />
                    )}
                    <I className={`h-[18px] w-[18px] shrink-0 ${collapsed ? "" : ""}`} />
                    {!collapsed && <span>{n.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-white/[0.07] px-2 py-3 space-y-1">
          <button
            onClick={toggle}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[#7A7A9A] hover:text-[#E2E2F0] hover:bg-white/[0.04] w-full transition-colors ${collapsed ? "justify-center px-0" : ""}`}
          >
            {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>
          <div className={`flex items-center gap-3 px-3 py-2 ${collapsed ? "justify-center px-0" : ""}`}>
            <NotificationBell />
            {!collapsed && <span>Notifications</span>}
          </div>
          {!collapsed && user && (
            <div className="px-3 py-2 flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-[#6C63FF]/20 grid place-items-center text-[#6C63FF] text-xs font-bold shrink-0">
                {(user.email ?? "U")[0].toUpperCase()}
              </div>
              <span className="text-xs text-[#7A7A9A] truncate">{user.email}</span>
            </div>
          )}
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[#7A7A9A] hover:text-[#EF4444] hover:bg-[#EF4444]/10 w-full transition-colors ${collapsed ? "justify-center px-0" : ""}`}
          >
            <LogOut className="h-[18px] w-[18px]" />
            {!collapsed && <span>Sign out</span>}
          </button>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-2 text-[#4A4A6A] hover:text-[#7A7A9A] transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${collapsed ? "md:ml-16" : "md:ml-60"}`}
      >
        {/* Mobile workspace switcher header */}
        <div className="md:hidden border-b border-white/[0.07] bg-[#10101C] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#7A7A9A]" />
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value as WorkspaceSystem)}
              className="text-sm bg-transparent text-[#E2E2F0] border-none outline-none cursor-pointer appearance-none"
            >
              <option value="api">{SYSTEM_LABELS.api}</option>
              <option value="llc">{SYSTEM_LABELS.llc}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
              className="p-2 rounded-lg text-[#7A7A9A] hover:text-[#EF4444] transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6 page-enter">{children}</main>
      </div>

      {/* ─── BOTTOM TAB BAR (Mobile) ─── */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 bg-[#08080F] border-t border-white/[0.07] z-50"
        style={{ height: 60 }}
      >
        <div className="flex items-center justify-around h-full px-2">
          {bottomTabs.map((tab) => {
            const active = isActive(tab.to);
            const I = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 relative ${
                  active ? "text-[#6C63FF]" : "text-[#7A7A9A]"
                }`}
              >
                <I className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {active && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-[#F5A623]" />
                )}
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 ${moreOpen ? "text-[#6C63FF]" : "text-[#7A7A9A]"}`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </div>

      {/* ─── MORE DRAWER (Mobile) ─── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 backdrop-luxury" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#10101C] border-t border-white/[0.07] rounded-t-2xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-[#7A7A9A]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              {[
                ...mgmtNav.filter((n) => n.to !== "/drivers"),
                ...billingNav.filter((n) => n.to !== "/invoices"),
                ...systemNav,
              ].map((n) => {
                const I = n.icon;
                const active = isActive(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors ${
                      active ? "bg-[#6C63FF]/15 text-[#6C63FF]" : "text-[#E2E2F0] hover:bg-white/[0.05]"
                    }`}
                  >
                    <I className="h-5 w-5" />
                    <span>{n.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={toggle}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-[#E2E2F0] hover:bg-white/[0.05] w-full transition-colors"
              >
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatAssistant />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AppNotification } from "@/lib/rides";
import { useSystem } from "@/lib/system";
import { playNotificationSound } from "@/lib/sound";

export function NotificationBell() {
  const { system } = useSystem();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("system", system)
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data as AppNotification[]) ?? [];

    if (primedRef.current) {
      const newOnes = list.filter((n) => !knownIdsRef.current.has(n.id));
      if (newOnes.length > 0) playNotificationSound();
    }
    knownIdsRef.current = new Set(list.map((n) => n.id));
    primedRef.current = true;
    setItems(list);
  };

  useEffect(() => {
    setItems([]);
    knownIdsRef.current = new Set();
    primedRef.current = false;
    load();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
        .channel(`notif-bell-${system}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `system=eq.${system}` },
          () => load(),
        )
        .subscribe();
    } catch (e) {
      console.warn("Realtime subscription failed:", e);
    }
    const t = setInterval(load, 60_000);
    return () => { if (ch) supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  const unread = items.filter((i) => !i.read).length;

  const clearAll = async () => {
    const ids = items.map((i) => i.id);
    if (!ids.length) return;
    await supabase.from("notifications").delete().in("id", ids);
    load();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base">Notifications</SheetTitle>
          {items.length > 0 && (
            <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={clearAll}>
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12 px-4">No notifications</div>
          ) : (
            items.map((n) => {
              const body = (
                <div className={`px-4 py-3 border-b text-sm ${!n.read ? "bg-primary/5" : ""}`}>
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5 break-words">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              );
              return n.ride_id ? (
                <Link
                  key={n.id}
                  to="/rides/$id"
                  params={{ id: n.ride_id }}
                  className="block hover:bg-secondary/50"
                  onClick={() => setOpen(false)}
                >{body}</Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { AppNotification } from "@/lib/rides";

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as AppNotification[]) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    const t = setInterval(load, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const unread = items.filter((i) => !i.read).length;

  const markAllRead = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    load();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          {unread > 0 && (
            <button className="text-xs text-primary hover:underline flex items-center gap-1" onClick={markAllRead}>
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">No notifications</div>
          ) : (
            items.map((n) => {
              const body = (
                <div className={`px-3 py-2 border-b text-sm ${!n.read ? "bg-primary/5" : ""}`}>
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              );
              return n.ride_id ? (
                <Link key={n.id} to="/rides/$id" params={{ id: n.ride_id }} className="block hover:bg-secondary/50">{body}</Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

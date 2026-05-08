import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AppNotification } from "@/lib/rides";
import { playNotificationSound } from "@/lib/sound";

interface Props {
  driverId: string;
  pin: string;
}

export function DriverNotificationBell({ driverId, pin }: Props) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const load = async () => {
    const { data, error } = await supabase.rpc("driver_notifications", {
      _driver_id: driverId,
      _pin: pin,
    });
    if (error) return;
    const list = ((data as AppNotification[]) ?? []);

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
    const ch = supabase
      .channel(`driver-notif-${driverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `driver_id=eq.${driverId}` },
        () => load(),
      )
      .subscribe();
    const t = setInterval(load, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, pin]);

  const unread = items.filter((i) => !i.read).length;

  const clearAll = async () => {
    await supabase.rpc("driver_delete_notifications", {
      _driver_id: driverId,
      _pin: pin,
    });
    load();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-foreground text-[10px] font-bold grid place-items-center px-1">
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
            items.map((n) => (
              <div key={n.id} className={`px-4 py-3 border-b text-sm ${!n.read ? "bg-primary/5" : ""}`}>
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground mt-0.5 break-words">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

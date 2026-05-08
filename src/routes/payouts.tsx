import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Plus, Users, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { useSystem } from "@/lib/system";
import { PageLoader } from "@/components/Spinner";

export const Route = createFileRoute("/payouts")({ component: PayoutsPage });

function PayoutsPage() {
  return (<RequireAuth><AppShell><PayoutsInner /></AppShell></RequireAuth>);
}

function PayoutsInner() {
  const { system } = useSystem();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ driver_id: "", amount: "", period_start: "", period_end: "", notes: "" });

  const load = async () => {
    setLoading(true);
    const [{ data: dData }, { data: rData }, { data: pData }] = await Promise.all([
      supabase.from("drivers").select("*").eq("system", system).eq("active", true).order("name"),
      supabase.from("rides").select("id, driver_id, ride_date, amount, status").eq("system", system),
      supabase.from("driver_payouts").select("*").eq("system", system).order("created_at", { ascending: false }),
    ]);
    setDrivers(dData ?? []);
    setRides(rData ?? []);
    setPayouts(pData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [system]);

  const driverStats = useMemo(() => {
    const map: Record<string, { name: string; rideCount: number; totalAmount: number; completedCount: number }> = {};
    for (const d of drivers) {
      map[d.id] = { name: d.name, rideCount: 0, totalAmount: 0, completedCount: 0 };
    }
    for (const r of rides) {
      if (r.driver_id && map[r.driver_id]) {
        map[r.driver_id].rideCount++;
        map[r.driver_id].totalAmount += Number(r.amount || 0);
        if (r.status === "completed") map[r.driver_id].completedCount++;
      }
    }
    return map;
  }, [drivers, rides]);

  const totalPaid = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);

  const addPayout = async () => {
    if (!form.driver_id || !form.amount) { toast.error("Driver and amount are required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("driver_payouts").insert({
      user_id: user.id, system, driver_id: form.driver_id,
      amount: parseFloat(form.amount) || 0,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      notes: form.notes || null,
      paid_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Payout recorded");
    setDialogOpen(false);
    setForm({ driver_id: "", amount: "", period_start: "", period_end: "", notes: "" });
    load();
  };

  const deletePayout = async (id: string) => {
    if (!confirm("Delete this payout?")) return;
    const { error } = await supabase.from("driver_payouts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  };

  if (loading) return <PageLoader />;

  const driverName = (id: string) => drivers.find((d) => d.id === id)?.name ?? "Unknown";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Driver Payouts</h1>
          <p className="text-sm text-muted-foreground">Ride counts, payouts & history</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-[#6C63FF] hover:bg-[#5A52D5]">
          <Plus className="w-4 h-4" /> Record Payout
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="luxury-card p-3 text-center">
          <Users className="w-5 h-5 mx-auto text-blue-400 mb-1" />
          <div className="text-lg font-bold text-foreground">{drivers.length}</div>
          <div className="text-[10px] text-muted-foreground/70">Active Drivers</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
          <div className="text-lg font-bold text-foreground">{rides.length}</div>
          <div className="text-[10px] text-muted-foreground/70">Total Rides</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <DollarSign className="w-5 h-5 mx-auto text-amber-400 mb-1" />
          <div className="text-lg font-bold text-foreground">${totalPaid.toFixed(0)}</div>
          <div className="text-[10px] text-muted-foreground/70">Total Paid Out</div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">Driver Overview</TabsTrigger>
          <TabsTrigger value="history" className="text-xs data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-border">
                <TableHead className="text-muted-foreground">Driver</TableHead>
                <TableHead className="text-muted-foreground">Total Rides</TableHead>
                <TableHead className="text-muted-foreground">Completed</TableHead>
                <TableHead className="text-muted-foreground">Total Ride Value</TableHead>
                <TableHead className="text-muted-foreground">Total Paid</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {Object.entries(driverStats).map(([did, s]) => {
                  const driverPaid = payouts.filter((p) => p.driver_id === did).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  return (
                    <TableRow key={did} className="border-border">
                      <TableCell className="text-sm font-medium text-foreground">{s.name}</TableCell>
                      <TableCell className="text-sm text-foreground/80">{s.rideCount}</TableCell>
                      <TableCell className="text-sm text-emerald-400">{s.completedCount}</TableCell>
                      <TableCell className="text-sm text-foreground/80">${s.totalAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-sm font-medium text-amber-400">${driverPaid.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history">
          {payouts.length === 0 ? <p className="text-muted-foreground/50 text-sm text-center py-8">No payouts yet</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Driver</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Period</TableHead>
                  <TableHead className="text-muted-foreground">Paid At</TableHead>
                  <TableHead className="text-muted-foreground">Notes</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id} className="border-border">
                      <TableCell className="text-xs font-medium text-foreground">{driverName(p.driver_id)}</TableCell>
                      <TableCell className="text-xs font-medium text-emerald-400">${Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.period_start && p.period_end ? `${p.period_start} – ${p.period_end}` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground/70 max-w-[150px] truncate">{p.notes || "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => deletePayout(p.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="luxury-card border-border text-foreground max-w-md">
          <DialogHeader><DialogTitle>Record Payout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-muted-foreground">Driver *</Label>
              <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                <SelectTrigger className="input-luxury"><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>{drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-muted-foreground">Amount ($) *</Label><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input-luxury" type="number" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Period Start</Label><Input value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="input-luxury" type="date" /></div>
              <div><Label className="text-xs text-muted-foreground">Period End</Label><Input value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="input-luxury" type="date" /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-luxury" /></div>
          </div>
          <DialogFooter><Button onClick={addPayout} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Record Payout</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

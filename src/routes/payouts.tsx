import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getPayoutsData } from "@/server/rides.functions";

export const Route = createFileRoute("/payouts")({ component: PayoutsPage });

function PayoutsPage() {
  return (<RequireAuth><AppShell><PayoutsInner /></AppShell></RequireAuth>);
}

function PayoutsInner() {
  const { system } = useSystem();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverStats, setDriverStats] = useState<Record<string, { rideCount: number; totalAmount: number; completedCount: number }>>({});
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ driver_id: "", amount: "", period_start: "", period_end: "", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPayoutsData({ data: { system: system as "api" | "llc" } });
      setDrivers(result.drivers);
      setPayouts(result.payouts);
      setDriverStats(result.driverStats);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }, [system]);

  useEffect(() => { load(); }, [load]);

  const totalPaid = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalRides = Object.values(driverStats).reduce((s, d) => s + d.rideCount, 0);

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

  const driverName = (id: string) => drivers.find((d: any) => d.id === id)?.name ?? "Unknown";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Driver Payouts</h1>
          <p className="text-sm text-white/50">Ride counts, payouts & history</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-[#6C63FF] hover:bg-[#5A52D5]">
          <Plus className="w-4 h-4" /> Record Payout
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="luxury-card p-3 text-center">
          <Users className="w-5 h-5 mx-auto text-blue-400 mb-1" />
          <div className="text-lg font-bold text-white">{drivers.length}</div>
          <div className="text-[10px] text-white/40">Active Drivers</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
          <div className="text-lg font-bold text-white">{totalRides}</div>
          <div className="text-[10px] text-white/40">Total Rides</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <DollarSign className="w-5 h-5 mx-auto text-amber-400 mb-1" />
          <div className="text-lg font-bold text-white">${totalPaid.toFixed(0)}</div>
          <div className="text-[10px] text-white/40">Total Paid Out</div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Driver Overview</TabsTrigger>
          <TabsTrigger value="history" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Payout History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="border-white/10">
                <TableHead className="text-white/50">Driver</TableHead>
                <TableHead className="text-white/50">Total Rides</TableHead>
                <TableHead className="text-white/50">Completed</TableHead>
                <TableHead className="text-white/50">Total Ride Value</TableHead>
                <TableHead className="text-white/50">Total Paid</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {drivers.map((d: any) => {
                  const stats = driverStats[d.id] || { rideCount: 0, totalAmount: 0, completedCount: 0 };
                  const driverPaid = payouts.filter((p) => p.driver_id === d.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                  return (
                    <TableRow key={d.id} className="border-white/5">
                      <TableCell className="text-sm font-medium text-white">{d.name}</TableCell>
                      <TableCell className="text-sm text-white/70">{stats.rideCount}</TableCell>
                      <TableCell className="text-sm text-emerald-400">{stats.completedCount}</TableCell>
                      <TableCell className="text-sm text-white/70">${stats.totalAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-sm font-medium text-amber-400">${driverPaid.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history">
          {payouts.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No payouts yet</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-white/10">
                  <TableHead className="text-white/50">Driver</TableHead>
                  <TableHead className="text-white/50">Amount</TableHead>
                  <TableHead className="text-white/50">Period</TableHead>
                  <TableHead className="text-white/50">Paid At</TableHead>
                  <TableHead className="text-white/50">Notes</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={p.id} className="border-white/5">
                      <TableCell className="text-xs font-medium text-white">{driverName(p.driver_id)}</TableCell>
                      <TableCell className="text-xs font-medium text-emerald-400">${Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-white/60">{p.period_start && p.period_end ? `${p.period_start} – ${p.period_end}` : "—"}</TableCell>
                      <TableCell className="text-xs text-white/60">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs text-white/40 max-w-[150px] truncate">{p.notes || "—"}</TableCell>
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
        <DialogContent className="luxury-card border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Record Payout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-white/60">Driver *</Label>
              <Select value={form.driver_id} onValueChange={(v) => setForm({ ...form, driver_id: v })}>
                <SelectTrigger className="input-luxury"><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>{drivers.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-white/60">Amount ($) *</Label><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input-luxury" type="number" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Period Start</Label><Input value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="input-luxury" type="date" /></div>
              <div><Label className="text-xs text-white/60">Period End</Label><Input value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="input-luxury" type="date" /></div>
            </div>
            <div><Label className="text-xs text-white/60">Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-luxury" /></div>
          </div>
          <DialogFooter><Button onClick={addPayout} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Record Payout</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

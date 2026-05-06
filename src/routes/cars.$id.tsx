import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wrench, Fuel, CreditCard, Shield, Plus, Trash2, Gauge } from "lucide-react";
import { toast } from "react-hot-toast";
import { useSystem } from "@/lib/system";
import { PageLoader } from "@/components/Spinner";

export const Route = createFileRoute("/cars/$id")({ component: CarDetailPage });

function CarDetailPage() {
  return (<RequireAuth><AppShell><CarDetailInner /></AppShell></RequireAuth>);
}

function CarDetailInner() {
  const { id } = Route.useParams();
  const { system } = useSystem();
  const [car, setCar] = useState<any>(null);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [fuel, setFuel] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [insurance, setInsurance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("maintenance");

  // Dialog states
  const [mDialog, setMDialog] = useState(false);
  const [fDialog, setFDialog] = useState(false);
  const [iDialog, setIDialog] = useState(false);
  const [insDialog, setInsDialog] = useState(false);

  // Forms
  const [mForm, setMForm] = useState({ type: "general", description: "", mileage_at_service: "", cost: "", service_date: new Date().toISOString().slice(0, 10), next_service_mileage: "" });
  const [fForm, setFForm] = useState({ gallons: "", cost: "", mileage_at_fill: "", fuel_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [iForm, setIForm] = useState({ amount: "", due_date: "", notes: "" });
  const [insForm, setInsForm] = useState({ provider: "", policy_number: "", premium: "", start_date: "", end_date: "", notes: "" });

  // Mileage update
  const [mileageInput, setMileageInput] = useState("");
  const [statusInput, setStatusInput] = useState("active");

  const load = async () => {
    setLoading(true);
    const [{ data: carData }, { data: mData }, { data: fData }, { data: instData }, { data: insData }] = await Promise.all([
      supabase.from("cars").select("*").eq("id", id).single(),
      supabase.from("car_maintenance").select("*").eq("car_id", id).order("service_date", { ascending: false }),
      supabase.from("fuel_expenses").select("*").eq("car_id", id).order("fuel_date", { ascending: false }),
      supabase.from("car_installments").select("*").eq("car_id", id).order("due_date", { ascending: false }),
      supabase.from("car_insurance").select("*").eq("car_id", id).order("start_date", { ascending: false }),
    ]);
    setCar(carData);
    setMaintenance(mData ?? []);
    setFuel(fData ?? []);
    setInstallments(instData ?? []);
    setInsurance(insData ?? []);
    if (carData) {
      setMileageInput(String(carData.current_mileage));
      setStatusInput(carData.status);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const updateCar = async () => {
    const { error } = await supabase.from("cars").update({
      current_mileage: parseInt(mileageInput) || 0,
      status: statusInput as "active" | "inactive" | "in_service",
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Car updated"); load(); }
  };

  const addMaintenance = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("car_maintenance").insert({
      user_id: user.id, system, car_id: id,
      type: mForm.type, description: mForm.description || null,
      mileage_at_service: parseInt(mForm.mileage_at_service) || null,
      cost: parseFloat(mForm.cost) || 0,
      service_date: mForm.service_date,
      next_service_mileage: parseInt(mForm.next_service_mileage) || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Maintenance record added");
    setMDialog(false);
    setMForm({ type: "general", description: "", mileage_at_service: "", cost: "", service_date: new Date().toISOString().slice(0, 10), next_service_mileage: "" });
    load();
  };

  const addFuel = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("fuel_expenses").insert({
      user_id: user.id, system, car_id: id,
      gallons: parseFloat(fForm.gallons) || null,
      cost: parseFloat(fForm.cost) || 0,
      mileage_at_fill: parseInt(fForm.mileage_at_fill) || null,
      fuel_date: fForm.fuel_date,
      notes: fForm.notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Fuel expense added");
    setFDialog(false);
    setFForm({ gallons: "", cost: "", mileage_at_fill: "", fuel_date: new Date().toISOString().slice(0, 10), notes: "" });
    load();
  };

  const addInstallment = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("car_installments").insert({
      user_id: user.id, system, car_id: id,
      amount: parseFloat(iForm.amount) || 0,
      due_date: iForm.due_date,
      notes: iForm.notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Installment added");
    setIDialog(false);
    setIForm({ amount: "", due_date: "", notes: "" });
    load();
  };

  const addInsurance = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("car_insurance").insert({
      user_id: user.id, system, car_id: id,
      provider: insForm.provider,
      policy_number: insForm.policy_number || null,
      premium: parseFloat(insForm.premium) || 0,
      start_date: insForm.start_date,
      end_date: insForm.end_date || null,
      notes: insForm.notes || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Insurance record added");
    setInsDialog(false);
    setInsForm({ provider: "", policy_number: "", premium: "", start_date: "", end_date: "", notes: "" });
    load();
  };

  const deleteRecord = async (table: string, recordId: string) => {
    if (!confirm("Delete this record?")) return;
    const { error } = await supabase.from(table).delete().eq("id", recordId);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  };

  const toggleInstallmentPaid = async (inst: any) => {
    const { error } = await supabase.from("car_installments").update({
      paid: !inst.paid,
      paid_date: !inst.paid ? new Date().toISOString().slice(0, 10) : null,
    }).eq("id", inst.id);
    if (error) toast.error(error.message);
    else load();
  };

  if (loading) return <PageLoader />;
  if (!car) return <div className="p-6 text-white/50">Car not found</div>;

  const totalMaintCost = maintenance.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
  const totalFuelCost = fuel.reduce((s: number, f: any) => s + Number(f.cost || 0), 0);
  const totalInstallments = installments.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const paidInstallments = installments.filter((i: any) => i.paid).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const totalPremiums = insurance.reduce((s: number, i: any) => s + Number(i.premium || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <Link to="/cars" className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white mb-2">
        <ArrowLeft className="w-4 h-4" /> Back to Cars
      </Link>

      {/* Car header */}
      <Card className="luxury-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">{car.name}</h1>
            <p className="text-sm text-white/50">{[car.year, car.make, car.model].filter(Boolean).join(" ") || "—"}</p>
            {car.license_plate && <p className="text-xs text-white/40 mt-1">Plate: {car.license_plate}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Input value={mileageInput} onChange={(e) => setMileageInput(e.target.value)} className="input-luxury w-28" type="number" />
              <span className="text-xs text-white/40">mi</span>
            </div>
            <Select value={statusInput} onValueChange={setStatusInput}>
              <SelectTrigger className="input-luxury w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="in_service">In Service</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={updateCar} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Save</Button>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="luxury-card p-3 text-center">
          <Wrench className="w-5 h-5 mx-auto text-amber-400 mb-1" />
          <div className="text-lg font-bold text-white">${totalMaintCost.toFixed(0)}</div>
          <div className="text-[10px] text-white/40">Maintenance ({maintenance.length})</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <Fuel className="w-5 h-5 mx-auto text-blue-400 mb-1" />
          <div className="text-lg font-bold text-white">${totalFuelCost.toFixed(0)}</div>
          <div className="text-[10px] text-white/40">Fuel ({fuel.length})</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <CreditCard className="w-5 h-5 mx-auto text-purple-400 mb-1" />
          <div className="text-lg font-bold text-white">${paidInstallments.toFixed(0)} / ${totalInstallments.toFixed(0)}</div>
          <div className="text-[10px] text-white/40">Installments</div>
        </Card>
        <Card className="luxury-card p-3 text-center">
          <Shield className="w-5 h-5 mx-auto text-emerald-400 mb-1" />
          <div className="text-lg font-bold text-white">${totalPremiums.toFixed(0)}</div>
          <div className="text-[10px] text-white/40">Insurance ({insurance.length})</div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="maintenance" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Maintenance</TabsTrigger>
          <TabsTrigger value="fuel" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Fuel</TabsTrigger>
          <TabsTrigger value="installments" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Installments</TabsTrigger>
          <TabsTrigger value="insurance" className="text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">Insurance</TabsTrigger>
        </TabsList>

        {/* MAINTENANCE */}
        <TabsContent value="maintenance">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setMDialog(true)} className="gap-1 bg-[#6C63FF] hover:bg-[#5A52D5]"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </div>
          {maintenance.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No maintenance records</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-white/10">
                  <TableHead className="text-white/50">Date</TableHead>
                  <TableHead className="text-white/50">Type</TableHead>
                  <TableHead className="text-white/50">Description</TableHead>
                  <TableHead className="text-white/50">Mileage</TableHead>
                  <TableHead className="text-white/50">Cost</TableHead>
                  <TableHead className="text-white/50">Next</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {maintenance.map((m: any) => (
                    <TableRow key={m.id} className="border-white/5">
                      <TableCell className="text-xs text-white/70">{m.service_date}</TableCell>
                      <TableCell><Badge className="text-[10px] bg-white/10 text-white/70">{m.type.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-xs text-white/60 max-w-[200px] truncate">{m.description || "—"}</TableCell>
                      <TableCell className="text-xs text-white/60">{m.mileage_at_service?.toLocaleString() || "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-white">${Number(m.cost).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-white/40">{m.next_service_mileage?.toLocaleString() || "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => deleteRecord("car_maintenance", m.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* FUEL */}
        <TabsContent value="fuel">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setFDialog(true)} className="gap-1 bg-[#6C63FF] hover:bg-[#5A52D5]"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </div>
          {fuel.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No fuel records</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-white/10">
                  <TableHead className="text-white/50">Date</TableHead>
                  <TableHead className="text-white/50">Gallons</TableHead>
                  <TableHead className="text-white/50">Cost</TableHead>
                  <TableHead className="text-white/50">Mileage</TableHead>
                  <TableHead className="text-white/50">Notes</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {fuel.map((f: any) => (
                    <TableRow key={f.id} className="border-white/5">
                      <TableCell className="text-xs text-white/70">{f.fuel_date}</TableCell>
                      <TableCell className="text-xs text-white/60">{f.gallons ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-white">${Number(f.cost).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-white/60">{f.mileage_at_fill?.toLocaleString() || "—"}</TableCell>
                      <TableCell className="text-xs text-white/40 max-w-[150px] truncate">{f.notes || "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => deleteRecord("fuel_expenses", f.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* INSTALLMENTS */}
        <TabsContent value="installments">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setIDialog(true)} className="gap-1 bg-[#6C63FF] hover:bg-[#5A52D5]"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </div>
          {installments.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No installments</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-white/10">
                  <TableHead className="text-white/50">Due Date</TableHead>
                  <TableHead className="text-white/50">Amount</TableHead>
                  <TableHead className="text-white/50">Status</TableHead>
                  <TableHead className="text-white/50">Paid Date</TableHead>
                  <TableHead className="text-white/50">Notes</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {installments.map((i: any) => (
                    <TableRow key={i.id} className="border-white/5">
                      <TableCell className="text-xs text-white/70">{i.due_date}</TableCell>
                      <TableCell className="text-xs font-medium text-white">${Number(i.amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => toggleInstallmentPaid(i)} className={i.paid ? "text-emerald-400" : "text-amber-400"}>
                          {i.paid ? "✓ Paid" : "Pending"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs text-white/40">{i.paid_date || "—"}</TableCell>
                      <TableCell className="text-xs text-white/40 max-w-[150px] truncate">{i.notes || "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => deleteRecord("car_installments", i.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* INSURANCE */}
        <TabsContent value="insurance">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setInsDialog(true)} className="gap-1 bg-[#6C63FF] hover:bg-[#5A52D5]"><Plus className="w-3.5 h-3.5" /> Add</Button>
          </div>
          {insurance.length === 0 ? <p className="text-white/30 text-sm text-center py-8">No insurance records</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-white/10">
                  <TableHead className="text-white/50">Provider</TableHead>
                  <TableHead className="text-white/50">Policy #</TableHead>
                  <TableHead className="text-white/50">Premium</TableHead>
                  <TableHead className="text-white/50">Start</TableHead>
                  <TableHead className="text-white/50">End</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {insurance.map((i: any) => (
                    <TableRow key={i.id} className="border-white/5">
                      <TableCell className="text-xs font-medium text-white">{i.provider}</TableCell>
                      <TableCell className="text-xs text-white/60">{i.policy_number || "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-white">${Number(i.premium).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-white/70">{i.start_date}</TableCell>
                      <TableCell className="text-xs text-white/70">{i.end_date || "—"}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => deleteRecord("car_insurance", i.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIALOGS */}
      <Dialog open={mDialog} onOpenChange={setMDialog}>
        <DialogContent className="luxury-card border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Add Maintenance Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-white/60">Type</Label>
              <Select value={mForm.type} onValueChange={(v) => setMForm({ ...mForm, type: v })}>
                <SelectTrigger className="input-luxury"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oil_change">Oil Change</SelectItem>
                  <SelectItem value="tire">Tire</SelectItem>
                  <SelectItem value="brake">Brake</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="scheduled_service">Scheduled Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs text-white/60">Description</Label><Input value={mForm.description} onChange={(e) => setMForm({ ...mForm, description: e.target.value })} className="input-luxury" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Service Date</Label><Input value={mForm.service_date} onChange={(e) => setMForm({ ...mForm, service_date: e.target.value })} className="input-luxury" type="date" /></div>
              <div><Label className="text-xs text-white/60">Cost ($)</Label><Input value={mForm.cost} onChange={(e) => setMForm({ ...mForm, cost: e.target.value })} className="input-luxury" type="number" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Mileage at Service</Label><Input value={mForm.mileage_at_service} onChange={(e) => setMForm({ ...mForm, mileage_at_service: e.target.value })} className="input-luxury" type="number" /></div>
              <div><Label className="text-xs text-white/60">Next Service Mileage</Label><Input value={mForm.next_service_mileage} onChange={(e) => setMForm({ ...mForm, next_service_mileage: e.target.value })} className="input-luxury" type="number" /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={addMaintenance} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fDialog} onOpenChange={setFDialog}>
        <DialogContent className="luxury-card border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Add Fuel Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Fuel Date</Label><Input value={fForm.fuel_date} onChange={(e) => setFForm({ ...fForm, fuel_date: e.target.value })} className="input-luxury" type="date" /></div>
              <div><Label className="text-xs text-white/60">Cost ($)</Label><Input value={fForm.cost} onChange={(e) => setFForm({ ...fForm, cost: e.target.value })} className="input-luxury" type="number" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Gallons</Label><Input value={fForm.gallons} onChange={(e) => setFForm({ ...fForm, gallons: e.target.value })} className="input-luxury" type="number" step="0.01" /></div>
              <div><Label className="text-xs text-white/60">Mileage</Label><Input value={fForm.mileage_at_fill} onChange={(e) => setFForm({ ...fForm, mileage_at_fill: e.target.value })} className="input-luxury" type="number" /></div>
            </div>
            <div><Label className="text-xs text-white/60">Notes</Label><Input value={fForm.notes} onChange={(e) => setFForm({ ...fForm, notes: e.target.value })} className="input-luxury" /></div>
          </div>
          <DialogFooter><Button onClick={addFuel} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={iDialog} onOpenChange={setIDialog}>
        <DialogContent className="luxury-card border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Add Installment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Amount ($)</Label><Input value={iForm.amount} onChange={(e) => setIForm({ ...iForm, amount: e.target.value })} className="input-luxury" type="number" /></div>
              <div><Label className="text-xs text-white/60">Due Date</Label><Input value={iForm.due_date} onChange={(e) => setIForm({ ...iForm, due_date: e.target.value })} className="input-luxury" type="date" /></div>
            </div>
            <div><Label className="text-xs text-white/60">Notes</Label><Input value={iForm.notes} onChange={(e) => setIForm({ ...iForm, notes: e.target.value })} className="input-luxury" /></div>
          </div>
          <DialogFooter><Button onClick={addInstallment} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={insDialog} onOpenChange={setInsDialog}>
        <DialogContent className="luxury-card border-white/10 text-white max-w-md">
          <DialogHeader><DialogTitle>Add Insurance Record</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-white/60">Provider *</Label><Input value={insForm.provider} onChange={(e) => setInsForm({ ...insForm, provider: e.target.value })} className="input-luxury" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Policy #</Label><Input value={insForm.policy_number} onChange={(e) => setInsForm({ ...insForm, policy_number: e.target.value })} className="input-luxury" /></div>
              <div><Label className="text-xs text-white/60">Premium ($)</Label><Input value={insForm.premium} onChange={(e) => setInsForm({ ...insForm, premium: e.target.value })} className="input-luxury" type="number" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-white/60">Start Date</Label><Input value={insForm.start_date} onChange={(e) => setInsForm({ ...insForm, start_date: e.target.value })} className="input-luxury" type="date" /></div>
              <div><Label className="text-xs text-white/60">End Date</Label><Input value={insForm.end_date} onChange={(e) => setInsForm({ ...insForm, end_date: e.target.value })} className="input-luxury" type="date" /></div>
            </div>
            <div><Label className="text-xs text-white/60">Notes</Label><Input value={insForm.notes} onChange={(e) => setInsForm({ ...insForm, notes: e.target.value })} className="input-luxury" /></div>
          </div>
          <DialogFooter><Button onClick={addInsurance} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

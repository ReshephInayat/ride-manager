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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Car, Gauge, Wrench, Trash2, Eye } from "lucide-react";
import { toast } from "react-hot-toast";
import { useSystem } from "@/lib/system";
import { PageLoader } from "@/components/Spinner";

export const Route = createFileRoute("/cars/")({ component: CarsPage });

interface CarRow {
  id: string;
  user_id: string;
  system: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  license_plate: string | null;
  vin: string | null;
  color: string | null;
  current_mileage: number;
  status: "active" | "inactive" | "in_service";
  created_at: string;
}

function CarsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CarsInner />
      </AppShell>
    </RequireAuth>
  );
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  inactive: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  in_service: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

function CarsInner() {
  const { system } = useSystem();
  const [cars, setCars] = useState<CarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", make: "", model: "", year: "", license_plate: "", vin: "", color: "", current_mileage: "0" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cars").select("*").eq("system", system).order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setCars((data as CarRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [system]);

  const addCar = async () => {
    if (!form.name.trim()) { toast.error("Car name is required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("cars").insert({
      user_id: user.id,
      system,
      name: form.name.trim(),
      make: form.make || null,
      model: form.model || null,
      year: form.year ? parseInt(form.year) : null,
      license_plate: form.license_plate || null,
      vin: form.vin || null,
      color: form.color || null,
      current_mileage: parseInt(form.current_mileage) || 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Car added");
    setDialogOpen(false);
    setForm({ name: "", make: "", model: "", year: "", license_plate: "", vin: "", color: "", current_mileage: "0" });
    load();
  };

  const deleteCar = async (id: string) => {
    if (!confirm("Delete this car and all related records?")) return;
    const { error } = await supabase.from("cars").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Car deleted"); load(); }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Fleet Management</h1>
          <p className="text-sm text-muted-foreground">Manage your vehicles</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-[#6C63FF] hover:bg-[#5A52D5]">
          <Plus className="w-4 h-4" /> Add Car
        </Button>
      </div>

      {cars.length === 0 ? (
        <Card className="luxury-card p-12 text-center">
          <Car className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground/70">No cars yet. Add your first vehicle.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => {
            const needsService = car.current_mileage > 0 && car.current_mileage % 5000 >= 4500;
            return (
              <Card key={car.id} className="luxury-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{car.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {[car.year, car.make, car.model].filter(Boolean).join(" ") || "—"}
                    </p>
                  </div>
                  <Badge className={`text-[10px] ${statusColors[car.status]}`}>
                    {car.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> {car.current_mileage.toLocaleString()} mi</span>
                  {car.license_plate && <span>{car.license_plate}</span>}
                </div>
                {needsService && (
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs bg-amber-500/10 rounded px-2 py-1">
                    <Wrench className="w-3.5 h-3.5" /> Service recommended soon
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Link to="/cars/$id" params={{ id: car.id }} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1 text-xs border-border text-foreground/80 hover:text-foreground">
                      <Eye className="w-3.5 h-3.5" /> Details
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => deleteCar(car.id)} className="text-red-400 border-border hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="luxury-card border-border text-foreground max-w-md">
          <DialogHeader><DialogTitle>Add Car</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs text-muted-foreground">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-luxury" placeholder="e.g. Town Car #1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Make</Label><Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className="input-luxury" placeholder="Lincoln" /></div>
              <div><Label className="text-xs text-muted-foreground">Model</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-luxury" placeholder="Town Car" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">Year</Label><Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="input-luxury" placeholder="2024" type="number" /></div>
              <div><Label className="text-xs text-muted-foreground">Color</Label><Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="input-luxury" placeholder="Black" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-muted-foreground">License Plate</Label><Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} className="input-luxury" /></div>
              <div><Label className="text-xs text-muted-foreground">Mileage</Label><Input value={form.current_mileage} onChange={(e) => setForm({ ...form, current_mileage: e.target.value })} className="input-luxury" type="number" /></div>
            </div>
            <div><Label className="text-xs text-muted-foreground">VIN</Label><Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="input-luxury" /></div>
          </div>
          <DialogFooter>
            <Button onClick={addCar} className="bg-[#6C63FF] hover:bg-[#5A52D5]">Add Car</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

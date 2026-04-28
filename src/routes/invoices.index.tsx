import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices/")({ component: InvoicesPage });

interface Invoice {
  id: string;
  invoice_number: string;
  bill_to: string;
  period_start: string | null;
  period_end: string | null;
  total: number;
  notes: string | null;
  created_at: string;
}

function InvoicesPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Inner />
      </AppShell>
    </RequireAuth>
  );
}

function Inner() {
  const [list, setList] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setList((data as Invoice[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const del = async (id: string) => {
    if (!confirm("Delete invoice?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setList((l) => l.filter((i) => i.id !== id));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <p className="text-muted-foreground mt-1">
          Generated from completed rides. Create new ones from the Rides page.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No invoices yet.
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((i) => (
            <Card key={i.id} className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-md bg-secondary grid place-items-center">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{i.invoice_number}</div>
                <div className="text-sm text-muted-foreground">
                  {i.bill_to} • {i.period_start} → {i.period_end}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">${Number(i.total).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(i.created_at).toLocaleDateString()}
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/invoices/$id" params={{ id: i.id }}>Open</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => del(i.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

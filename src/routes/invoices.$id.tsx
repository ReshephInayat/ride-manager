import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices/$id")({ component: InvoiceDetail });

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
interface Item {
  id: string;
  description: string;
  amount: number;
}

function InvoiceDetail() {
  return (
    <RequireAuth>
      <AppShell>
        <Inner />
      </AppShell>
    </RequireAuth>
  );
}

function Inner() {
  const { id } = Route.useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id),
      ]);
      if (a.error) toast.error(a.error.message);
      if (b.error) toast.error(b.error.message);
      setInv((a.data as Invoice) ?? null);
      setItems((b.data as Item[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!inv) return <p>Invoice not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Button asChild variant="ghost"><Link to="/invoices"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print / Save PDF</Button>
      </div>

      <Card className="p-8 max-w-3xl mx-auto print:shadow-none print:border-0">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">INVOICE</h1>
            <div className="text-muted-foreground mt-1">{inv.invoice_number}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">Puget Sound Limos</div>
            <div className="text-sm text-muted-foreground">Ground Transportation</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Bill To</div>
            <div className="font-semibold">{inv.bill_to}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Period</div>
            <div className="font-semibold">{inv.period_start} → {inv.period_end}</div>
            <div className="text-xs text-muted-foreground mt-2">Issued {new Date(inv.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2 w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right">${Number(it.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 text-right font-semibold">Total</td>
              <td className="pt-4 text-right text-xl font-bold">${Number(inv.total).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        {inv.notes && (
          <div className="mt-8 text-sm text-muted-foreground">
            <div className="text-xs uppercase mb-1">Notes</div>
            {inv.notes}
          </div>
        )}
      </Card>
    </div>
  );
}

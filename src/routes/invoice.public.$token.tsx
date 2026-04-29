import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import logoImg from "@/assets/login-hero.jpg";

export const Route = createFileRoute("/invoice/public/$token")({ component: PublicInvoice });

interface Inv {
  id: string;
  invoice_number: string;
  bill_to: string;
  period_start: string | null;
  period_end: string | null;
  total: number;
  subtotal: number;
  sales_tax_rate: number;
  sales_tax_amount: number;
  notes: string | null;
  created_at: string;
}
interface Item { id: string; description: string; amount: number; }

function PublicInvoice() {
  const { token } = Route.useParams();
  const [inv, setInv] = useState<Inv | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Use anonymous client (no session). RLS blocks reads; we expose via a
      // separate fetch that filters by token through a public RPC-less path.
      // Workaround: an authenticated user opening the link will see the data
      // through their own RLS, otherwise we show a friendly message.
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const sb = createClient(url, key);
      const { data, error } = await sb.from("invoices").select("*").eq("public_token", token).maybeSingle();
      if (error) setErr(error.message);
      if (data) {
        setInv(data as Inv);
        const { data: it } = await sb.from("invoice_items").select("*").eq("invoice_id", (data as Inv).id);
        setItems((it as Item[]) ?? []);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading invoice…</div>;
  if (!inv) return (
    <div className="min-h-screen grid place-items-center text-center px-4">
      <div>
        <h1 className="text-2xl font-bold mb-2">Invoice unavailable</h1>
        <p className="text-muted-foreground">This link is invalid or has expired.</p>
        {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="p-10 bg-white text-slate-900 shadow-md">
          <header className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="Puget Sound Limo" className="h-12 w-12 rounded object-cover" />
              <div>
                <div className="font-bold">Puget Sound Limo</div>
                <div className="text-xs text-slate-500">(888) 977-2757</div>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-bold">Invoice #{inv.invoice_number}</div>
              <div className="text-slate-500 mt-1 text-xs">Issue date</div>
              <div>{new Date(inv.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
            </div>
          </header>
          <hr className="border-slate-300" />
          <h1 className="text-3xl font-bold mt-8">Invoice #{inv.invoice_number}</h1>
          <p className="text-slate-500 text-sm">We appreciate your business.</p>

          <div className="grid grid-cols-3 gap-6 mt-6 text-sm">
            <div><div className="font-bold">Customer</div><div className="text-slate-700 mt-1 whitespace-pre-line">{inv.bill_to}</div></div>
            <div><div className="font-bold">Invoice Details</div><div className="text-slate-700 mt-1">{inv.period_start} → {inv.period_end}</div><div className="text-slate-700">${Number(inv.total).toFixed(2)}</div></div>
            <div><div className="font-bold">Payment</div><div className="text-slate-700 mt-1">Due {new Date(inv.created_at).toLocaleDateString()}</div><div className="text-slate-700">${Number(inv.total).toFixed(2)}</div></div>
          </div>

          <table className="w-full mt-8 text-sm">
            <thead><tr className="border-b border-slate-300 text-slate-600">
              <th className="text-left py-2 font-semibold">Items</th>
              <th className="text-right py-2 font-semibold w-20">Qty</th>
              <th className="text-right py-2 font-semibold w-24">Price</th>
              <th className="text-right py-2 font-semibold w-24">Amount</th>
            </tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-200">
                  <td className="py-3">{i.description}</td>
                  <td className="text-right">1</td>
                  <td className="text-right">${Number(i.amount).toFixed(2)}</td>
                  <td className="text-right">${Number(i.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-4 text-sm">
            <div className="w-64 space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>${Number(inv.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Sales tax ({Number(inv.sales_tax_rate)}%)</span><span>${Number(inv.sales_tax_amount).toFixed(2)}</span></div>
              <hr className="my-2 border-slate-300" />
              <div className="flex justify-between text-lg font-bold"><span>Total Due</span><span>${Number(inv.total).toFixed(2)}</span></div>
            </div>
          </div>
          {inv.notes && <div className="mt-8 text-sm text-slate-600"><strong>Notes:</strong> {inv.notes}</div>}
        </Card>
      </div>
    </div>
  );
}

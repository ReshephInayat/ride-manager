import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, Save, Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable copies
  const [billTo, setBillTo] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<Item[]>([]);

  const reload = async () => {
    const [a, b] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("description"),
    ]);
    if (a.error) toast.error(a.error.message);
    if (b.error) toast.error(b.error.message);
    setInv((a.data as Invoice) ?? null);
    setItems((b.data as Item[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, [id]);

  const startEdit = () => {
    if (!inv) return;
    setBillTo(inv.bill_to);
    setPeriodStart(inv.period_start ?? "");
    setPeriodEnd(inv.period_end ?? "");
    setNotes(inv.notes ?? "");
    setDraftItems(items.map((i) => ({ ...i })));
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const updateDraftItem = (idx: number, patch: Partial<Item>) => {
    setDraftItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addDraftItem = () => {
    setDraftItems((arr) => [...arr, { id: `new-${Date.now()}-${Math.random()}`, description: "", amount: 0 }]);
  };

  const removeDraftItem = (idx: number) => {
    setDraftItems((arr) => arr.filter((_, i) => i !== idx));
  };

  const draftTotal = draftItems.reduce((s, i) => s + Number(i.amount || 0), 0);

  const save = async () => {
    if (!inv) return;
    setSaving(true);
    try {
      const total = draftTotal;
      const { error: e1 } = await supabase
        .from("invoices")
        .update({
          bill_to: billTo,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          notes: notes || null,
          total,
        })
        .eq("id", inv.id);
      if (e1) throw e1;

      // Sync items: delete removed, update existing, insert new
      const existingIds = new Set(items.map((i) => i.id));
      const draftExistingIds = new Set(draftItems.filter((d) => !d.id.startsWith("new-")).map((d) => d.id));
      const toDelete = items.filter((i) => !draftExistingIds.has(i.id)).map((i) => i.id);
      if (toDelete.length) {
        const { error } = await supabase.from("invoice_items").delete().in("id", toDelete);
        if (error) throw error;
      }
      const toUpdate = draftItems.filter((d) => existingIds.has(d.id));
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("invoice_items")
          .update({ description: u.description, amount: Number(u.amount) || 0 })
          .eq("id", u.id);
        if (error) throw error;
      }
      const toInsert = draftItems
        .filter((d) => d.id.startsWith("new-"))
        .map((d) => ({ invoice_id: inv.id, description: d.description, amount: Number(d.amount) || 0 }));
      if (toInsert.length) {
        const { error } = await supabase.from("invoice_items").insert(toInsert);
        if (error) throw error;
      }

      toast.success("Invoice saved");
      setEditing(false);
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = () => {
    if (!inv) return;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text("INVOICE", 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(inv.invoice_number, 14, 27);

    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.text("Puget Sound Limo", 196, 20, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text("Ground Transportation", 196, 26, { align: "right" });

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text("BILL TO", 14, 45);
    doc.setFontSize(12);
    doc.text(inv.bill_to, 14, 52);

    doc.setFontSize(10);
    doc.text("PERIOD", 120, 45);
    doc.setFontSize(11);
    doc.text(`${inv.period_start ?? "-"} → ${inv.period_end ?? "-"}`, 120, 52);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Issued ${new Date(inv.created_at).toLocaleDateString()}`, 120, 58);

    autoTable(doc, {
      startY: 70,
      head: [["Description", "Amount"]],
      body: items.map((i) => [i.description, `$${Number(i.amount).toFixed(2)}`]),
      foot: [["Total", `$${Number(inv.total).toFixed(2)}`]],
      headStyles: { fillColor: [30, 41, 59] },
      footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", cellWidth: 40 } },
    });

    if (inv.notes) {
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("Notes", 14, finalY + 12);
      doc.setTextColor(0);
      doc.setFontSize(10);
      doc.text(inv.notes, 14, finalY + 18, { maxWidth: 180 });
    }

    doc.save(`${inv.invoice_number}.pdf`);
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!inv) return <p>Invoice not found.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Button asChild variant="ghost"><Link to="/invoices"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={startEdit}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button onClick={downloadPdf}>
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-8 max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">INVOICE</h1>
            <div className="text-muted-foreground mt-1">{inv.invoice_number}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">Puget Sound Limo</div>
            <div className="text-sm text-muted-foreground">Ground Transportation</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Bill To</div>
            {editing ? (
              <Input value={billTo} onChange={(e) => setBillTo(e.target.value)} />
            ) : (
              <div className="font-semibold">{inv.bill_to}</div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Period</div>
            {editing ? (
              <div className="flex gap-2">
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            ) : (
              <>
                <div className="font-semibold">{inv.period_start} → {inv.period_end}</div>
                <div className="text-xs text-muted-foreground mt-2">Issued {new Date(inv.created_at).toLocaleDateString()}</div>
              </>
            )}
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2 w-32">Amount</th>
              {editing && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {(editing ? draftItems : items).map((it, idx) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">
                  {editing ? (
                    <Input
                      value={it.description}
                      onChange={(e) => updateDraftItem(idx, { description: e.target.value })}
                      placeholder="Description"
                    />
                  ) : (
                    it.description
                  )}
                </td>
                <td className="py-2 text-right">
                  {editing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={it.amount}
                      onChange={(e) => updateDraftItem(idx, { amount: Number(e.target.value) })}
                      className="text-right"
                    />
                  ) : (
                    `$${Number(it.amount).toFixed(2)}`
                  )}
                </td>
                {editing && (
                  <td>
                    <button
                      onClick={() => removeDraftItem(idx)}
                      className="h-8 w-8 grid place-items-center rounded text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 text-right font-semibold">Total</td>
              <td className="pt-4 text-right text-xl font-bold">
                ${(editing ? draftTotal : Number(inv.total)).toFixed(2)}
              </td>
              {editing && <td></td>}
            </tr>
          </tfoot>
        </table>

        {editing && (
          <Button variant="outline" size="sm" onClick={addDraftItem} className="mt-4">
            <Plus className="h-4 w-4 mr-1" /> Add line item
          </Button>
        )}

        <div className="mt-8">
          <Label className="text-xs uppercase text-muted-foreground">Notes</Label>
          {editing ? (
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
          ) : (
            inv.notes && <div className="text-sm text-muted-foreground mt-1">{inv.notes}</div>
          )}
        </div>
      </Card>
    </div>
  );
}

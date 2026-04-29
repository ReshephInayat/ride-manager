import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, Save, Plus, Trash2, Pencil, X, Link as LinkIcon } from "lucide-react";
import { toast } from "react-hot-toast";
import { PageLoader } from "@/components/Spinner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";


export const Route = createFileRoute("/invoices/$id")({ component: InvoiceDetail });

interface Invoice {
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
  public_token: string | null;
}
interface Item { id: string; description: string; amount: number; }

const TAX_RATE = 9.9;

// If a line description was generated as "... — Total rides: N × $P", pull
// out the ride count so we can show it as the line Quantity. Falls back to 1.
function extractQuantity(desc: string): number {
  const m = desc.match(/Total rides:\s*(\d+)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return 1;
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
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

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

  useEffect(() => { reload(); }, [id]);

  const publicUrl = useMemo(() => {
    if (!inv?.public_token) return "";
    return `${window.location.origin}/invoice/public/${inv.public_token}`;
  }, [inv]);

  useEffect(() => {
    if (!publicUrl) return;
    QRCode.toDataURL(publicUrl, { width: 240, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [publicUrl]);

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
  const updateDraftItem = (idx: number, patch: Partial<Item>) =>
    setDraftItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addDraftItem = () =>
    setDraftItems((arr) => [...arr, { id: `new-${Date.now()}-${Math.random()}`, description: "", amount: 0 }]);
  const removeDraftItem = (idx: number) =>
    setDraftItems((arr) => arr.filter((_, i) => i !== idx));

  const draftSubtotal = draftItems.reduce((s, i) => s + Number(i.amount || 0), 0);
  const draftTax = +(draftSubtotal * TAX_RATE / 100).toFixed(2);
  const draftTotal = +(draftSubtotal + draftTax).toFixed(2);

  const save = async () => {
    if (!inv) return;
    setSaving(true);
    try {
      const subtotal = draftSubtotal;
      const sales_tax_amount = draftTax;
      const total = draftTotal;
      const { error: e1 } = await supabase
        .from("invoices")
        .update({
          bill_to: billTo,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          notes: notes || null,
          subtotal,
          sales_tax_rate: TAX_RATE,
          sales_tax_amount,
          total,
        })
        .eq("id", inv.id);
      if (e1) throw e1;

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

  const downloadPdf = async () => {
    if (!inv) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 48;

    // Header brand (text only — logo intentionally removed)
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Puget Sound Limo", margin, 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("(888) 977-2757", margin, 70);

    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Invoice #${inv.invoice_number}`, pageW - margin, 56, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Issue date", pageW - margin, 70, { align: "right" });
    doc.setTextColor(0);
    doc.text(new Date(inv.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), pageW - margin, 82, { align: "right" });

    // Divider
    doc.setDrawColor(220);
    doc.line(margin, 105, pageW - margin, 105);

    // Title
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(`Invoice #${inv.invoice_number}`, margin, 140);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110);
    doc.text("We appreciate your business.", margin, 156);

    // 3 column block
    const yBlock = 190;
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Customer", margin, yBlock);
    doc.text("Invoice Details", margin + 180, yBlock);
    doc.text("Payment", margin + 360, yBlock);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    const billLines = doc.splitTextToSize(inv.bill_to, 160);
    doc.text(billLines, margin, yBlock + 14);
    doc.text(`${inv.period_start ?? "-"} → ${inv.period_end ?? "-"}`, margin + 180, yBlock + 14);
    doc.text(`$${Number(inv.total).toFixed(2)}`, margin + 180, yBlock + 28);
    doc.text(`Due ${new Date(inv.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`, margin + 360, yBlock + 14);
    doc.text(`$${Number(inv.total).toFixed(2)}`, margin + 360, yBlock + 28);

    autoTable(doc, {
      startY: yBlock + 60,
      head: [["Items", "Quantity", "Price", "Amount"]],
      body: items.map((i) => {
        const qty = extractQuantity(i.description);
        const unit = qty > 0 ? Number(i.amount) / qty : Number(i.amount);
        return [i.description, String(qty), `$${unit.toFixed(2)}`, `$${Number(i.amount).toFixed(2)}`];
      }),
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [255, 255, 255], textColor: 90, fontStyle: "bold", lineWidth: { bottom: 0.5 }, lineColor: [200, 200, 200] },
      columnStyles: { 1: { halign: "right", cellWidth: 60 }, 2: { halign: "right", cellWidth: 70 }, 3: { halign: "right", cellWidth: 80 } },
      margin: { left: margin, right: margin },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300;
    let y = finalY + 16;
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text("Subtotal", pageW - margin - 80, y, { align: "right" });
    doc.setTextColor(0);
    doc.text(`$${Number(inv.subtotal).toFixed(2)}`, pageW - margin, y, { align: "right" });
    y += 14;
    doc.setTextColor(80);
    doc.text(`Sales tax (${Number(inv.sales_tax_rate)}%)`, pageW - margin - 80, y, { align: "right" });
    doc.setTextColor(0);
    doc.text(`$${Number(inv.sales_tax_amount).toFixed(2)}`, pageW - margin, y, { align: "right" });
    y += 8;
    doc.setDrawColor(200);
    doc.line(pageW - margin - 200, y, pageW - margin, y);
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Total Due", pageW - margin - 80, y, { align: "right" });
    doc.text(`$${Number(inv.total).toFixed(2)}`, pageW - margin, y, { align: "right" });

    // QR + view-online footer
    if (qrDataUrl && publicUrl) {
      const qrY = doc.internal.pageSize.getHeight() - 130;
      doc.addImage(qrDataUrl, "PNG", margin, qrY, 80, 80);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text("View online", margin + 92, qrY + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(`To view your invoice, go to ${publicUrl}`, margin + 92, qrY + 28, { maxWidth: 380 });
      doc.text("Or scan the QR code with your phone camera.", margin + 92, qrY + 42);
      doc.text("Page 1 of 1", pageW - margin, qrY + 14, { align: "right" });
    }

    if (inv.notes) {
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text("Notes", margin, finalY + 110, { maxWidth: pageW - margin * 2 });
      doc.setTextColor(0);
      doc.text(inv.notes, margin, finalY + 124, { maxWidth: pageW - margin * 2 });
    }

    doc.save(`${inv.invoice_number}.pdf`);
  };

  const copyPublicLink = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Public link copied");
  };

  if (loading) return <PageLoader label="Loading invoice…" />;
  if (!inv) return <p>Invoice not found.</p>;

  const issueDate = new Date(inv.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <Button asChild variant="ghost"><Link to="/invoices"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
        <div className="flex gap-2 flex-wrap">
          {!editing ? (
            <>
              <Button variant="outline" onClick={copyPublicLink}><LinkIcon className="h-4 w-4 mr-1" /> Copy public link</Button>
              <Button variant="outline" onClick={startEdit}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              <Button onClick={downloadPdf}><Download className="h-4 w-4 mr-1" /> Download PDF</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={cancelEdit}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save"}</Button>
            </>
          )}
        </div>
      </div>

      {/* On-screen rendition matching the reference invoice */}
      <Card className="p-10 max-w-3xl mx-auto bg-white text-slate-900 dark:bg-white dark:text-slate-900">
        <header className="flex items-start justify-between mb-6">
          <div>
            <div className="font-bold text-lg">Puget Sound Limo</div>
            <div className="text-xs text-slate-500">(888) 977-2757</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold">Invoice #{inv.invoice_number}</div>
            <div className="text-slate-500 mt-1 text-xs">Issue date</div>
            <div>{issueDate}</div>
          </div>
        </header>
        <hr className="border-slate-300" />
        <h1 className="text-3xl font-bold mt-6">Invoice #{inv.invoice_number}</h1>
        <p className="text-slate-500 text-sm">We appreciate your business.</p>

        <div className="grid grid-cols-3 gap-6 mt-6 text-sm">
          <div>
            <div className="font-bold">Customer</div>
            {editing ? (
              <Textarea rows={3} value={billTo} onChange={(e) => setBillTo(e.target.value)} className="mt-1 bg-white text-slate-900" />
            ) : (
              <div className="text-slate-700 mt-1 whitespace-pre-line">{inv.bill_to}</div>
            )}
          </div>
          <div>
            <div className="font-bold">Invoice Details</div>
            {editing ? (
              <div className="space-y-1 mt-1">
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-white text-slate-900" />
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-white text-slate-900" />
              </div>
            ) : (
              <>
                <div className="text-slate-700 mt-1">{inv.period_start} → {inv.period_end}</div>
                <div className="text-slate-700">${Number(inv.total).toFixed(2)}</div>
              </>
            )}
          </div>
          <div>
            <div className="font-bold">Payment</div>
            <div className="text-slate-700 mt-1">Due {issueDate}</div>
            <div className="text-slate-700">${(editing ? draftTotal : Number(inv.total)).toFixed(2)}</div>
          </div>
        </div>

        <table className="w-full mt-8 text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th className="text-left py-2 font-semibold">Items</th>
              <th className="text-right py-2 font-semibold w-20">Quantity</th>
              <th className="text-right py-2 font-semibold w-24">Price</th>
              <th className="text-right py-2 font-semibold w-24">Amount</th>
              {editing && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {(editing ? draftItems : items).map((it, idx) => (
              <tr key={it.id} className="border-b border-slate-200">
                <td className="py-3">
                  {editing ? (
                    <Input
                      value={it.description}
                      onChange={(e) => updateDraftItem(idx, { description: e.target.value })}
                      className="bg-white text-slate-900"
                    />
                  ) : it.description}
                </td>
                <td className="text-right">{extractQuantity(it.description)}</td>
                <td className="text-right">
                  {editing ? (
                    <Input type="number" step="0.01" value={it.amount} onChange={(e) => updateDraftItem(idx, { amount: Number(e.target.value) })} className="text-right bg-white text-slate-900 w-24 ml-auto" />
                  ) : `$${(() => { const q = extractQuantity(it.description); return (q > 0 ? Number(it.amount) / q : Number(it.amount)).toFixed(2); })()}`}
                </td>
                <td className="text-right">${Number(it.amount).toFixed(2)}</td>
                {editing && (
                  <td>
                    <button onClick={() => removeDraftItem(idx)} className="h-8 w-8 grid place-items-center rounded text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editing && (
          <Button variant="outline" size="sm" onClick={addDraftItem} className="mt-3">
            <Plus className="h-4 w-4 mr-1" /> Add line item
          </Button>
        )}

        <div className="flex justify-end mt-4 text-sm">
          <div className="w-64 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span>${(editing ? draftSubtotal : Number(inv.subtotal)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Sales tax ({Number(inv.sales_tax_rate || TAX_RATE)}%)</span>
              <span>${(editing ? draftTax : Number(inv.sales_tax_amount)).toFixed(2)}</span>
            </div>
            <hr className="my-2 border-slate-300" />
            <div className="flex justify-between text-lg font-bold">
              <span>Total Due</span>
              <span>${(editing ? draftTotal : Number(inv.total)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Label className="text-xs uppercase text-slate-500">Notes</Label>
          {editing ? (
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 bg-white text-slate-900" />
          ) : (
            inv.notes && <div className="text-sm text-slate-600 mt-1">{inv.notes}</div>
          )}
        </div>

        {/* QR footer */}
        {qrDataUrl && publicUrl && (
          <div className="mt-12 pt-6 border-t border-slate-200 flex items-start gap-4">
            <img src={qrDataUrl} alt="Invoice QR" className="h-24 w-24" />
            <div className="text-xs text-slate-600 flex-1">
              <div className="font-bold text-slate-900 text-sm">View online</div>
              <div className="mt-1">To view this invoice, scan the QR or visit:</div>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-primary underline break-all">{publicUrl}</a>
            </div>
            <div className="text-xs text-slate-500">Page 1 of 1</div>
          </div>
        )}
      </Card>
    </div>
  );
}

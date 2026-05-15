import { useEffect, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Batch = {
  id: string;
  client_name: string | null;
  product_name: string;
  batch_date: string;
  lot_code: string;
  target_batch_size_lbs: number;
  status: "Scheduled" | "In Progress" | "Complete" | "On Hold";
  notes: string | null;
};
type BatchIng = {
  id: string;
  batch_id: string;
  ingredient_name: string;
  type: "JIT" | "Tolling";
  lot_code_used: string | null;
  qty_planned_lbs: number;
  qty_actual_lbs: number;
  variance_lbs: number;
  deducted: boolean;
};

const cardStyle = {
  background: "linear-gradient(135deg, rgba(245,241,230,0.04) 0%, rgba(200,155,60,0.06) 100%)",
  borderColor: "rgba(200,155,60,0.2)",
};

const statusColors: Record<string, string> = {
  Scheduled: "bg-blue-500/20 text-blue-300",
  "In Progress": "bg-amber-500/20 text-amber-300",
  Complete: "bg-green-500/20 text-green-300",
  "On Hold": "bg-gray-500/20 text-gray-300",
};

async function generateLotCode(date: string) {
  const yyyymmdd = date.replace(/-/g, "");
  const { count } = await supabase.from("production_batches").select("id", { count: "exact", head: true }).gte("batch_date", date).lte("batch_date", date);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `AB-${yyyymmdd}-${seq}`;
}

export default function BatchTracker() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [ingByBatch, setIngByBatch] = useState<Record<string, BatchIng[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editBatch, setEditBatch] = useState<Partial<Batch> | null>(null);
  const [editIng, setEditIng] = useState<{ batch_id: string; row: Partial<BatchIng> } | null>(null);

  const load = async () => {
    const { data, error } = await supabase.from("production_batches").select("*").order("batch_date", { ascending: false });
    if (error) return toast.error(error.message);
    setBatches((data ?? []) as Batch[]);
    const ids = (data ?? []).map((b: any) => b.id);
    if (ids.length) {
      const { data: ings } = await supabase.from("production_batch_ingredients").select("*").in("batch_id", ids);
      const grouped: Record<string, BatchIng[]> = {};
      (ings ?? []).forEach((i: any) => { (grouped[i.batch_id] ||= []).push(i); });
      setIngByBatch(grouped);
    } else setIngByBatch({});
  };
  useEffect(() => {
    load();
    // Pre-fill from Scout Bot copy
    const draft = sessionStorage.getItem("scoutBotDraftBatch");
    if (draft) {
      const d = JSON.parse(draft);
      sessionStorage.removeItem("scoutBotDraftBatch");
      setEditBatch(d);
    }
  }, []);

  const openNew = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const lot = await generateLotCode(today);
    setEditBatch({ batch_date: today, lot_code: lot, status: "Scheduled", target_batch_size_lbs: 100 });
  };

  const saveBatch = async () => {
    if (!editBatch?.product_name || !editBatch?.lot_code) return toast.error("Product and lot code required");
    if (!editBatch.target_batch_size_lbs || editBatch.target_batch_size_lbs > 110) return toast.error("Batch size must be 0–110 lbs");
    const payload = {
      client_name: editBatch.client_name || null,
      product_name: editBatch.product_name,
      batch_date: editBatch.batch_date || new Date().toISOString().slice(0, 10),
      lot_code: editBatch.lot_code,
      target_batch_size_lbs: Number(editBatch.target_batch_size_lbs),
      status: editBatch.status || "Scheduled",
      notes: editBatch.notes || null,
    };
    let batchId = editBatch.id;
    if (batchId) {
      const { error } = await supabase.from("production_batches").update(payload).eq("id", batchId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("production_batches").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      batchId = data.id;
      // Insert pre-filled ingredients (from Scout Bot)
      const draftIngs = (editBatch as any)._ingredients as Partial<BatchIng>[] | undefined;
      if (draftIngs?.length) {
        await supabase.from("production_batch_ingredients").insert(
          draftIngs.map(i => ({
            batch_id: batchId,
            ingredient_name: i.ingredient_name!,
            type: i.type || "JIT",
            qty_planned_lbs: Number(i.qty_planned_lbs) || 0,
            qty_actual_lbs: 0,
          }))
        );
      }
    }
    toast.success("Saved"); setEditBatch(null); load();
  };

  const delBatch = async (id: string) => {
    if (!confirm("Delete this batch and all its ingredients?")) return;
    const { error } = await supabase.from("production_batches").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const completeBatch = async (id: string) => {
    if (!confirm("Mark Complete and deduct actual quantities from inventory?")) return;
    const { error } = await supabase.rpc("complete_batch", { _batch_id: id });
    if (error) return toast.error(error.message);
    toast.success("Batch completed and inventory deducted"); load();
  };

  const saveIng = async () => {
    if (!editIng) return;
    const r = editIng.row;
    if (!r.ingredient_name) return toast.error("Ingredient name required");
    const payload = {
      batch_id: editIng.batch_id,
      ingredient_name: r.ingredient_name,
      type: r.type || "JIT",
      lot_code_used: r.lot_code_used || null,
      qty_planned_lbs: Number(r.qty_planned_lbs) || 0,
      qty_actual_lbs: Number(r.qty_actual_lbs) || 0,
    };
    const { error } = r.id
      ? await supabase.from("production_batch_ingredients").update(payload).eq("id", r.id)
      : await supabase.from("production_batch_ingredients").insert(payload);
    if (error) return toast.error(error.message);
    setEditIng(null); load();
  };
  const delIng = async (id: string) => {
    if (!confirm("Delete this ingredient row?")) return;
    const { error } = await supabase.from("production_batch_ingredients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const variancePct = (planned: number, actual: number) => {
    if (!planned) return 0;
    return ((actual - planned) / planned) * 100;
  };
  const varianceColor = (pct: number) => {
    const abs = Math.abs(pct);
    if (abs <= 2) return "text-green-400";
    if (abs <= 5) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#F5F1E6" }}>Production Batch Tracker</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(245,241,230,0.6)" }}>Track lot codes and ingredient usage per batch.</p>
        </div>
        <Button onClick={openNew} className="bg-[#C89B3C] hover:bg-[#B8892C]"><Plus className="w-4 h-4 mr-1" />New Batch</Button>
      </div>

      <Card className="p-4 border" style={cardStyle}>
        <Table>
          <TableHeader>
            <TableRow><TableHead></TableHead><TableHead>Lot Code</TableHead><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Product</TableHead><TableHead>Size (lbs)</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {batches.map(b => (
              <Fragment key={b.id}>
                <TableRow>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(e => ({ ...e, [b.id]: !e[b.id] }))}>
                      {expanded[b.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{b.lot_code}</TableCell>
                  <TableCell>{b.batch_date}</TableCell>
                  <TableCell>{b.client_name ?? "—"}</TableCell>
                  <TableCell className="font-medium">{b.product_name}</TableCell>
                  <TableCell>{b.target_batch_size_lbs}</TableCell>
                  <TableCell><Badge className={statusColors[b.status]}>{b.status}</Badge></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {b.status !== "Complete" && (
                      <Button size="sm" variant="ghost" title="Complete & deduct" onClick={() => completeBatch(b.id)}>
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditBatch(b)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => delBatch(b.id)}><Trash2 className="w-3 h-3" /></Button>
                  </TableCell>
                </TableRow>
                {expanded[b.id] && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-black/20 p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-sm" style={{ color: "#F5F1E6" }}>Ingredients</h4>
                        <Button size="sm" onClick={() => setEditIng({ batch_id: b.id, row: { type: "JIT" } })} className="bg-[#C89B3C] hover:bg-[#B8892C]">
                          <Plus className="w-3 h-3 mr-1" />Add
                        </Button>
                      </div>
                      <Table>
                        <TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead>Type</TableHead><TableHead>Lot</TableHead><TableHead>Planned</TableHead><TableHead>Actual</TableHead><TableHead>Variance</TableHead><TableHead></TableHead></TableRow></TableHeader>
                        <TableBody>
                          {(ingByBatch[b.id] ?? []).map(i => {
                            const pct = variancePct(Number(i.qty_planned_lbs), Number(i.qty_actual_lbs));
                            return (
                              <TableRow key={i.id}>
                                <TableCell>{i.ingredient_name}</TableCell>
                                <TableCell><Badge variant="outline">{i.type}</Badge></TableCell>
                                <TableCell className="font-mono text-xs">{i.lot_code_used ?? "—"}</TableCell>
                                <TableCell>{Number(i.qty_planned_lbs).toFixed(2)}</TableCell>
                                <TableCell>{Number(i.qty_actual_lbs).toFixed(2)}</TableCell>
                                <TableCell className={varianceColor(pct)}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="ghost" onClick={() => setEditIng({ batch_id: b.id, row: i })}><Pencil className="w-3 h-3" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => delIng(i.id)}><Trash2 className="w-3 h-3" /></Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {!(ingByBatch[b.id]?.length) && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-3">No ingredients yet.</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
            {batches.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No batches yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      {/* Batch dialog */}
      <Dialog open={!!editBatch} onOpenChange={(o) => !o && setEditBatch(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editBatch?.id ? "Edit Batch" : "New Batch"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Lot Code *</Label><Input value={editBatch?.lot_code ?? ""} onChange={e => setEditBatch({ ...editBatch!, lot_code: e.target.value })} /></div>
              <div><Label>Date</Label><Input type="date" value={editBatch?.batch_date ?? ""} onChange={e => setEditBatch({ ...editBatch!, batch_date: e.target.value })} /></div>
            </div>
            <div><Label>Client</Label><Input value={editBatch?.client_name ?? ""} onChange={e => setEditBatch({ ...editBatch!, client_name: e.target.value })} /></div>
            <div><Label>Product *</Label><Input value={editBatch?.product_name ?? ""} onChange={e => setEditBatch({ ...editBatch!, product_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Target Batch Size (lbs, max 110)</Label><Input type="number" step="0.01" max={110} value={editBatch?.target_batch_size_lbs ?? ""} onChange={e => setEditBatch({ ...editBatch!, target_batch_size_lbs: Number(e.target.value) })} /></div>
              <div>
                <Label>Status</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3" value={editBatch?.status ?? "Scheduled"} onChange={e => setEditBatch({ ...editBatch!, status: e.target.value as Batch["status"] })}>
                  <option>Scheduled</option><option>In Progress</option><option>Complete</option><option>On Hold</option>
                </select>
              </div>
            </div>
            <div><Label>Notes</Label><Input value={editBatch?.notes ?? ""} onChange={e => setEditBatch({ ...editBatch!, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditBatch(null)}>Cancel</Button><Button onClick={saveBatch} className="bg-[#C89B3C] hover:bg-[#B8892C]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ingredient dialog */}
      <Dialog open={!!editIng} onOpenChange={(o) => !o && setEditIng(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editIng?.row?.id ? "Edit" : "Add"} Ingredient</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ingredient *</Label><Input value={editIng?.row?.ingredient_name ?? ""} onChange={e => setEditIng({ ...editIng!, row: { ...editIng!.row, ingredient_name: e.target.value } })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3" value={editIng?.row?.type ?? "JIT"} onChange={e => setEditIng({ ...editIng!, row: { ...editIng!.row, type: e.target.value as "JIT" | "Tolling" } })}>
                  <option>JIT</option><option>Tolling</option>
                </select>
              </div>
              <div><Label>Lot Code Used</Label><Input value={editIng?.row?.lot_code_used ?? ""} onChange={e => setEditIng({ ...editIng!, row: { ...editIng!.row, lot_code_used: e.target.value } })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Qty Planned (lbs)</Label><Input type="number" step="0.01" value={editIng?.row?.qty_planned_lbs ?? ""} onChange={e => setEditIng({ ...editIng!, row: { ...editIng!.row, qty_planned_lbs: Number(e.target.value) } })} /></div>
              <div><Label>Qty Actual (lbs)</Label><Input type="number" step="0.01" value={editIng?.row?.qty_actual_lbs ?? ""} onChange={e => setEditIng({ ...editIng!, row: { ...editIng!.row, qty_actual_lbs: Number(e.target.value) } })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditIng(null)}>Cancel</Button><Button onClick={saveIng} className="bg-[#C89B3C] hover:bg-[#B8892C]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

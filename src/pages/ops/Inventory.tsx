import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type JIT = {
  id: string;
  ingredient_name: string;
  unit: string;
  cases_on_hand: number;
  lbs_per_case: number;
  total_lbs: number;
  reorder_point: number | null;
  supplier: string | null;
};
type Tolling = {
  id: string;
  client_name: string | null;
  ingredient_name: string;
  unit: string;
  qty_on_hand: number;
  lot_code: string | null;
  received_date: string | null;
  expiry_date: string | null;
  notes: string | null;
};

const cardStyle = {
  background: "linear-gradient(135deg, rgba(245,241,230,0.04) 0%, rgba(200,155,60,0.06) 100%)",
  borderColor: "rgba(200,155,60,0.2)",
};

export default function Inventory() {
  const [jit, setJit] = useState<JIT[]>([]);
  const [tolling, setTolling] = useState<Tolling[]>([]);
  const [editJit, setEditJit] = useState<Partial<JIT> | null>(null);
  const [editTolling, setEditTolling] = useState<Partial<Tolling> | null>(null);

  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from("inventory_jit").select("*").order("ingredient_name"),
      supabase.from("inventory_tolling").select("*").order("ingredient_name"),
    ]);
    if (a.error) toast.error(a.error.message); else setJit((a.data ?? []) as JIT[]);
    if (b.error) toast.error(b.error.message); else setTolling((b.data ?? []) as Tolling[]);
  };
  useEffect(() => { load(); }, []);

  const saveJit = async () => {
    if (!editJit?.ingredient_name) return toast.error("Ingredient name required");
    const payload = {
      ingredient_name: editJit.ingredient_name,
      unit: editJit.unit || "lbs",
      cases_on_hand: Number(editJit.cases_on_hand) || 0,
      lbs_per_case: Number(editJit.lbs_per_case) || 0,
      reorder_point: Number(editJit.reorder_point) || 0,
      supplier: editJit.supplier || null,
    };
    const { error } = editJit.id
      ? await supabase.from("inventory_jit").update(payload).eq("id", editJit.id)
      : await supabase.from("inventory_jit").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setEditJit(null); load();
  };
  const delJit = async (id: string) => {
    if (!confirm("Delete this row?")) return;
    const { error } = await supabase.from("inventory_jit").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  const saveTolling = async () => {
    if (!editTolling?.ingredient_name) return toast.error("Ingredient name required");
    const payload = {
      client_name: editTolling.client_name || null,
      ingredient_name: editTolling.ingredient_name,
      unit: editTolling.unit || "lbs",
      qty_on_hand: Number(editTolling.qty_on_hand) || 0,
      lot_code: editTolling.lot_code || null,
      received_date: editTolling.received_date || null,
      expiry_date: editTolling.expiry_date || null,
      notes: editTolling.notes || null,
    };
    const { error } = editTolling.id
      ? await supabase.from("inventory_tolling").update(payload).eq("id", editTolling.id)
      : await supabase.from("inventory_tolling").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved"); setEditTolling(null); load();
  };
  const delTolling = async (id: string) => {
    if (!confirm("Delete this row?")) return;
    const { error } = await supabase.from("inventory_tolling").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: "#F5F1E6" }}>Inventory</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(245,241,230,0.6)" }}>Track JIT and tolling materials.</p>
      </div>

      <Tabs defaultValue="jit">
        <TabsList style={{ background: "rgba(245,241,230,0.06)" }}>
          <TabsTrigger value="jit">JIT Inventory</TabsTrigger>
          <TabsTrigger value="tolling">Tolling Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="jit">
          <Card className="p-4 border" style={cardStyle}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold" style={{ color: "#F5F1E6" }}>JIT (Just-In-Time)</h2>
              <Button onClick={() => setEditJit({})} className="bg-[#C89B3C] hover:bg-[#B8892C]"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Ingredient</TableHead><TableHead>Cases</TableHead><TableHead>Lbs/Case</TableHead><TableHead>Total Lbs</TableHead><TableHead>Reorder Pt</TableHead><TableHead>Supplier</TableHead><TableHead></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {jit.map(r => {
                  const low = r.reorder_point != null && r.total_lbs <= Number(r.reorder_point);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {low && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        {r.ingredient_name}
                      </TableCell>
                      <TableCell>{r.cases_on_hand}</TableCell>
                      <TableCell>{r.lbs_per_case}</TableCell>
                      <TableCell className={low ? "text-red-400" : ""}>{Number(r.total_lbs).toFixed(2)}</TableCell>
                      <TableCell>{r.reorder_point ?? "—"}</TableCell>
                      <TableCell>{r.supplier ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditJit(r)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => delJit(r.id)}><Trash2 className="w-3 h-3" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {jit.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No JIT inventory yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="tolling">
          <Card className="p-4 border" style={cardStyle}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold" style={{ color: "#F5F1E6" }}>Tolling (Client-Owned)</h2>
              <Button onClick={() => setEditTolling({})} className="bg-[#C89B3C] hover:bg-[#B8892C]"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Client</TableHead><TableHead>Ingredient</TableHead><TableHead>Lot</TableHead><TableHead>Qty (lbs)</TableHead><TableHead>Received</TableHead><TableHead>Expires</TableHead><TableHead></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {tolling.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.client_name ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.ingredient_name}</TableCell>
                    <TableCell>{r.lot_code ?? "—"}</TableCell>
                    <TableCell>{r.qty_on_hand}</TableCell>
                    <TableCell>{r.received_date ?? "—"}</TableCell>
                    <TableCell>{r.expiry_date ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditTolling(r)}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => delTolling(r.id)}><Trash2 className="w-3 h-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {tolling.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No tolling inventory yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* JIT Dialog */}
      <Dialog open={!!editJit} onOpenChange={(o) => !o && setEditJit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editJit?.id ? "Edit" : "Add"} JIT Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Ingredient *</Label><Input value={editJit?.ingredient_name ?? ""} onChange={e => setEditJit({ ...editJit!, ingredient_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Cases on Hand</Label><Input type="number" step="0.01" value={editJit?.cases_on_hand ?? ""} onChange={e => setEditJit({ ...editJit!, cases_on_hand: Number(e.target.value) })} /></div>
              <div><Label>Lbs per Case</Label><Input type="number" step="0.01" value={editJit?.lbs_per_case ?? ""} onChange={e => setEditJit({ ...editJit!, lbs_per_case: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Reorder Point (lbs)</Label><Input type="number" step="0.01" value={editJit?.reorder_point ?? ""} onChange={e => setEditJit({ ...editJit!, reorder_point: Number(e.target.value) })} /></div>
              <div><Label>Supplier</Label><Input value={editJit?.supplier ?? ""} onChange={e => setEditJit({ ...editJit!, supplier: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditJit(null)}>Cancel</Button><Button onClick={saveJit} className="bg-[#C89B3C] hover:bg-[#B8892C]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tolling Dialog */}
      <Dialog open={!!editTolling} onOpenChange={(o) => !o && setEditTolling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editTolling?.id ? "Edit" : "Add"} Tolling Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Client</Label><Input value={editTolling?.client_name ?? ""} onChange={e => setEditTolling({ ...editTolling!, client_name: e.target.value })} /></div>
            <div><Label>Ingredient *</Label><Input value={editTolling?.ingredient_name ?? ""} onChange={e => setEditTolling({ ...editTolling!, ingredient_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Qty on Hand (lbs)</Label><Input type="number" step="0.01" value={editTolling?.qty_on_hand ?? ""} onChange={e => setEditTolling({ ...editTolling!, qty_on_hand: Number(e.target.value) })} /></div>
              <div><Label>Lot Code</Label><Input value={editTolling?.lot_code ?? ""} onChange={e => setEditTolling({ ...editTolling!, lot_code: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Received</Label><Input type="date" value={editTolling?.received_date ?? ""} onChange={e => setEditTolling({ ...editTolling!, received_date: e.target.value })} /></div>
              <div><Label>Expires</Label><Input type="date" value={editTolling?.expiry_date ?? ""} onChange={e => setEditTolling({ ...editTolling!, expiry_date: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={editTolling?.notes ?? ""} onChange={e => setEditTolling({ ...editTolling!, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditTolling(null)}>Cancel</Button><Button onClick={saveTolling} className="bg-[#C89B3C] hover:bg-[#B8892C]">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

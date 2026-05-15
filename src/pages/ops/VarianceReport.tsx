import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const cardStyle = {
  background: "linear-gradient(135deg, rgba(245,241,230,0.04) 0%, rgba(200,155,60,0.06) 100%)",
  borderColor: "rgba(200,155,60,0.2)",
};

type Row = {
  batch_id: string;
  lot_code: string;
  product_name: string;
  batch_date: string;
  ingredient_name: string;
  qty_planned_lbs: number;
  qty_actual_lbs: number;
  variance_lbs: number;
};

export default function VarianceReport() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data: batches, error } = await supabase
      .from("production_batches")
      .select("id,lot_code,product_name,batch_date")
      .gte("batch_date", from).lte("batch_date", to)
      .order("batch_date", { ascending: false });
    if (error) return toast.error(error.message);
    const ids = (batches ?? []).map(b => b.id);
    if (!ids.length) { setRows([]); return; }
    const { data: ings } = await supabase.from("production_batch_ingredients").select("*").in("batch_id", ids);
    const map = new Map((batches ?? []).map(b => [b.id, b]));
    setRows((ings ?? []).map((i: any) => {
      const b: any = map.get(i.batch_id);
      return {
        batch_id: i.batch_id,
        lot_code: b?.lot_code ?? "",
        product_name: b?.product_name ?? "",
        batch_date: b?.batch_date ?? "",
        ingredient_name: i.ingredient_name,
        qty_planned_lbs: Number(i.qty_planned_lbs),
        qty_actual_lbs: Number(i.qty_actual_lbs),
        variance_lbs: Number(i.variance_lbs),
      };
    }));
  };
  useEffect(() => { load(); }, [from, to]);

  const summary = useMemo(() => {
    const totalPlanned = rows.reduce((s, r) => s + r.qty_planned_lbs, 0);
    const totalActual = rows.reduce((s, r) => s + r.qty_actual_lbs, 0);
    const greenPct = rows.filter(r => Math.abs(pct(r)) <= 2).length;
    const redPct = rows.filter(r => Math.abs(pct(r)) > 5).length;
    return { totalPlanned, totalActual, totalVar: totalActual - totalPlanned, count: rows.length, greenPct, redPct };
  }, [rows]);

  function pct(r: Row) {
    if (!r.qty_planned_lbs) return 0;
    return ((r.qty_actual_lbs - r.qty_planned_lbs) / r.qty_planned_lbs) * 100;
  }
  function color(p: number) {
    const a = Math.abs(p);
    if (a <= 2) return "text-green-400";
    if (a <= 5) return "text-amber-400";
    return "text-red-400";
  }

  // Group by batch
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    rows.forEach(r => { const a = m.get(r.batch_id) ?? []; a.push(r); m.set(r.batch_id, a); });
    return Array.from(m.entries());
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: "#F5F1E6" }}>Variance Report</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(245,241,230,0.6)" }}>Actual vs planned ingredient usage per batch.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4 border" style={cardStyle}>
          <p className="text-xs uppercase" style={{ color: "rgba(245,241,230,0.5)" }}>Rows</p>
          <p className="text-2xl font-bold" style={{ color: "#F5F1E6" }}>{summary.count}</p>
        </Card>
        <Card className="p-4 border" style={cardStyle}>
          <p className="text-xs uppercase" style={{ color: "rgba(245,241,230,0.5)" }}>Total Planned (lbs)</p>
          <p className="text-2xl font-bold" style={{ color: "#F5F1E6" }}>{summary.totalPlanned.toFixed(2)}</p>
        </Card>
        <Card className="p-4 border" style={cardStyle}>
          <p className="text-xs uppercase" style={{ color: "rgba(245,241,230,0.5)" }}>Total Actual (lbs)</p>
          <p className="text-2xl font-bold" style={{ color: "#F5F1E6" }}>{summary.totalActual.toFixed(2)}</p>
        </Card>
        <Card className="p-4 border" style={cardStyle}>
          <p className="text-xs uppercase" style={{ color: "rgba(245,241,230,0.5)" }}>Net Variance</p>
          <p className={`text-2xl font-bold ${summary.totalVar >= 0 ? "text-green-400" : "text-red-400"}`}>{summary.totalVar.toFixed(2)}</p>
        </Card>
      </div>

      <Card className="p-4 border" style={cardStyle}>
        <div className="flex gap-3 items-end mb-4">
          <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="text-sm ml-auto" style={{ color: "rgba(245,241,230,0.7)" }}>
            <span className="text-green-400">●</span> ≤2% &nbsp; <span className="text-amber-400">●</span> 2–5% &nbsp; <span className="text-red-400">●</span> &gt;5%
          </div>
        </div>

        {grouped.length === 0 && <p className="text-center text-muted-foreground py-6">No batch data in this range.</p>}

        {grouped.map(([batchId, items]) => (
          <div key={batchId} className="mb-6">
            <div className="flex justify-between items-center mb-2 pb-1 border-b" style={{ borderColor: "rgba(200,155,60,0.2)" }}>
              <div>
                <span className="font-semibold" style={{ color: "#F5F1E6" }}>{items[0].product_name}</span>
                <span className="ml-3 font-mono text-xs" style={{ color: "rgba(245,241,230,0.5)" }}>{items[0].lot_code}</span>
              </div>
              <span className="text-xs" style={{ color: "rgba(245,241,230,0.5)" }}>{items[0].batch_date}</span>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Ingredient</TableHead><TableHead>Planned (lbs)</TableHead><TableHead>Actual (lbs)</TableHead><TableHead>Δ lbs</TableHead><TableHead>Δ %</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((r, i) => {
                  const p = pct(r);
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.ingredient_name}</TableCell>
                      <TableCell>{r.qty_planned_lbs.toFixed(2)}</TableCell>
                      <TableCell>{r.qty_actual_lbs.toFixed(2)}</TableCell>
                      <TableCell className={color(p)}>{r.variance_lbs >= 0 ? "+" : ""}{r.variance_lbs.toFixed(2)}</TableCell>
                      <TableCell className={color(p) + " font-semibold"}>{p >= 0 ? "+" : ""}{p.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </Card>
    </div>
  );
}

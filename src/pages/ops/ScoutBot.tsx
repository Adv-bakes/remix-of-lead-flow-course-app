import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bot, Calculator, Send } from "lucide-react";
import { toast } from "sonner";

const cardStyle = {
  background: "linear-gradient(135deg, rgba(245,241,230,0.04) 0%, rgba(200,155,60,0.06) 100%)",
  borderColor: "rgba(200,155,60,0.2)",
};

type ProductOpt = { id: string; product_name: string };
type FormulaRow = { ingredient_name: string | null; percentage_formula: number | null; percentage: number | null };

export default function ScoutBot() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [productName, setProductName] = useState<string>("");
  const [cases, setCases] = useState<number>(1);
  const [lbsPerCase, setLbsPerCase] = useState<number>(10);
  const [formula, setFormula] = useState<FormulaRow[]>([]);
  const [jit, setJit] = useState<{ ingredient_name: string; total_lbs: number }[]>([]);
  const [tolling, setTolling] = useState<{ ingredient_name: string; qty_on_hand: number }[]>([]);

  useEffect(() => {
    (async () => {
      const [p, j, t] = await Promise.all([
        supabase.from("products").select("id,product_name").order("product_name"),
        supabase.from("inventory_jit").select("ingredient_name,total_lbs"),
        supabase.from("inventory_tolling").select("ingredient_name,qty_on_hand"),
      ]);
      setProducts((p.data ?? []) as ProductOpt[]);
      setJit((j.data ?? []) as any);
      setTolling((t.data ?? []) as any);
    })();
  }, []);

  const loadFormula = async (pid: string) => {
    setProductId(pid);
    const prod = products.find(p => p.id === pid);
    setProductName(prod?.product_name ?? "");
    if (!pid) { setFormula([]); return; }
    const { data, error } = await supabase.from("formulas").select("ingredient_name,percentage_formula,percentage").eq("product_id", pid);
    if (error) return toast.error(error.message);
    setFormula((data ?? []) as FormulaRow[]);
  };

  const totalLbs = useMemo(() => Number((cases * lbsPerCase).toFixed(2)), [cases, lbsPerCase]);

  const pullList = useMemo(() => {
    return formula.map(f => {
      const pct = Number(f.percentage_formula ?? f.percentage ?? 0);
      const need = Number(((pct / 100) * totalLbs).toFixed(2));
      const name = (f.ingredient_name ?? "").trim();
      const jitMatch = jit.find(x => x.ingredient_name?.toLowerCase() === name.toLowerCase());
      const tollMatch = tolling.find(x => x.ingredient_name?.toLowerCase() === name.toLowerCase());
      const available = Number((jitMatch?.total_lbs ?? 0)) + Number((tollMatch?.qty_on_hand ?? 0));
      const source = jitMatch ? "JIT" : tollMatch ? "Tolling" : "—";
      const shortfall = Number((available - need).toFixed(2));
      return { name, need, available, source, shortfall };
    });
  }, [formula, totalLbs, jit, tolling]);

  const copyToBatch = () => {
    if (!productName) return toast.error("Pick a product first");
    if (totalLbs > 110) return toast.error("Total lbs exceeds 110 — adjust cases or lbs per case");
    if (!pullList.length) return toast.error("No formula ingredients found for this product");
    const today = new Date().toISOString().slice(0, 10);
    const draft = {
      product_name: productName,
      batch_date: today,
      target_batch_size_lbs: totalLbs,
      status: "Scheduled",
      _ingredients: pullList.map(p => ({
        ingredient_name: p.name,
        type: p.source === "Tolling" ? "Tolling" : "JIT",
        qty_planned_lbs: p.need,
      })),
    };
    sessionStorage.setItem("scoutBotDraftBatch", JSON.stringify(draft));
    toast.success("Draft prepared. Open Batch Tracker to review.");
    navigate("/team/ops/batches");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="w-8 h-8" style={{ color: "#C89B3C" }} />
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#F5F1E6" }}>Scout Bot Calculator</h1>
          <p className="text-sm" style={{ color: "rgba(245,241,230,0.6)" }}>Compute the ingredient pull list for a production run.</p>
        </div>
      </div>

      <Card className="p-5 border" style={cardStyle}>
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Product</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={productId} onChange={e => loadFormula(e.target.value)}>
              <option value="">— Select —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
            </select>
          </div>
          <div><Label>Cases to produce</Label><Input type="number" min={1} value={cases} onChange={e => setCases(Number(e.target.value))} /></div>
          <div><Label>Lbs per case</Label><Input type="number" step="0.01" value={lbsPerCase} onChange={e => setLbsPerCase(Number(e.target.value))} /></div>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Calculator className="w-5 h-5" style={{ color: "#C89B3C" }} />
          <span style={{ color: "#F5F1E6" }}>Total batch: <strong>{totalLbs} lbs</strong> {totalLbs > 110 && <span className="text-red-400 ml-2">(exceeds 110 lb max)</span>}</span>
          <div className="flex-1" />
          <Button onClick={copyToBatch} className="bg-[#C89B3C] hover:bg-[#B8892C]"><Send className="w-4 h-4 mr-1" />Copy to Batch</Button>
        </div>
      </Card>

      <Card className="p-4 border" style={cardStyle}>
        <h2 className="font-semibold mb-3" style={{ color: "#F5F1E6" }}>Ingredient Pull List</h2>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Ingredient</TableHead><TableHead>Source</TableHead><TableHead>Need (lbs)</TableHead><TableHead>Available (lbs)</TableHead><TableHead>Shortfall</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {pullList.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.name || "—"}</TableCell>
                <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                <TableCell>{r.need}</TableCell>
                <TableCell>{r.available.toFixed(2)}</TableCell>
                <TableCell className={r.shortfall < 0 ? "text-red-400 font-semibold" : "text-green-400"}>{r.shortfall.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {pullList.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Pick a product with a formula to see the pull list.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

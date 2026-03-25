import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ClipboardList, ShoppingCart, Factory, BarChart3, ArrowLeft,
  ChevronRight, Plus, Package
} from "lucide-react";
import logo from "@/assets/logo.png";

interface Product {
  id: string;
  product_name: string;
  unit_size_oz: number | null;
  yield_units: number | null;
}

interface OrderIntake {
  id: string;
  product_id: string;
  number_of_cases: number;
  status: string;
  created_at: string;
  product_name?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100 border-amber-300" },
  sourcing: { label: "Sourcing", color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  mixing: { label: "In Production", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  complete: { label: "Complete", color: "text-emerald-700", bg: "bg-emerald-100 border-emerald-300" },
};

const STAGES = [
  { key: "intake", title: "Order Intake", subtitle: "QuickBooks-ready manual entry", icon: ClipboardList, statusKey: "pending", active: true },
  { key: "sourcing", title: "Sourcing", subtitle: "Total lbs needed across active orders", icon: ShoppingCart, statusKey: "sourcing", active: false },
  { key: "production", title: "Production Orders", subtitle: "Batch sheet generation", icon: Factory, statusKey: "mixing", active: false },
  { key: "reports", title: "Production Reports", subtitle: "Final yield & quality sign-offs", icon: BarChart3, statusKey: "complete", active: false },
];

const OperationsHub = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderIntake[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [numberOfCases, setNumberOfCases] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [productsRes, ordersRes] = await Promise.all([
      supabase.from("products").select("id, product_name, unit_size_oz, yield_units").eq("user_id", user.id),
      supabase.from("production_intake").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);

    if (productsRes.data) setProducts(productsRes.data);
    if (ordersRes.data) {
      const enriched = ordersRes.data.map((o: any) => ({
        ...o,
        product_name: productsRes.data?.find((p: Product) => p.id === o.product_id)?.product_name ?? "Unknown",
      }));
      setOrders(enriched);
    }
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !numberOfCases) {
      toast.error("Please select a product and enter number of cases.");
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("You must be logged in."); setSubmitting(false); return; }

    const { error } = await supabase.from("production_intake").insert({
      user_id: user.id,
      product_id: selectedProductId,
      number_of_cases: parseInt(numberOfCases),
    } as any);
    setSubmitting(false);
    if (error) {
      toast.error("Failed to save order intake.");
      console.error(error);
    } else {
      toast.success("Order intake saved!");
      setSelectedProductId("");
      setNumberOfCases("");
      setShowForm(false);
      fetchData();
    }
  };

  const getOrdersByStage = (statusKey: string) =>
    orders.filter((o) => o.status === statusKey);

  const StatusBadge = ({ status }: { status: string }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.bg} ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ backgroundImage: "url(/bakery-workspace-bg.jpg)", backgroundSize: "cover", backgroundPosition: "center" }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(44, 24, 16, 0.78)" }} />

      <header
        className="relative z-10 border-b backdrop-blur-sm"
        style={{ backgroundColor: "rgba(44, 24, 16, 0.3)", borderColor: "rgba(255,255,255,0.1)" }}
      >
        <div className="container flex h-16 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/team/admin")} className="text-[#F5F1E6] hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={logo} alt="Adventure Bakery" className="w-10 h-10" />
          <span className="font-semibold text-lg" style={{ color: "#F5F1E6" }}>Operations Hub</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 container py-10 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "#F5F1E6" }}>Production Timeline</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(245,241,230,0.6)" }}>
              Track orders from intake through final reporting
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Order
          </Button>
        </div>

        {/* New Order Form */}
        {showForm && (
          <Card className="mb-8 bg-card/95 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-lg">New Order Intake</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger><SelectValue placeholder="Select a product…" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.product_name}</SelectItem>
                      ))}
                      {products.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No products found.</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Number of Cases</Label>
                  <Input type="number" min="1" placeholder="e.g. 50" value={numberOfCases} onChange={(e) => setNumberOfCases(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                    {submitting ? "Saving…" : "Submit Order"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Production Pipeline — 4 Stages */}
        <div className="space-y-6">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const stageOrders = getOrdersByStage(stage.statusKey);
            const isActive = stage.active;

            return (
              <Card key={stage.key} className="bg-card/90 backdrop-blur-md overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/15 text-accent font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div className="p-2 rounded-lg bg-accent/10">
                        <Icon className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{stage.title}</CardTitle>
                        <p className="text-xs text-muted-foreground">{stage.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <Badge variant="default">Active – Under Development</Badge>
                      ) : (
                        <Badge variant="secondary">Coming Soon</Badge>
                      )}
                      {stageOrders.length > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {stageOrders.length} order{stageOrders.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <Separator />

                <CardContent className="pt-4">
                  {!isActive && stageOrders.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">This stage is not yet available.</p>
                  )}

                  {stageOrders.length > 0 ? (
                    <div className="space-y-2">
                      {stageOrders.map((order) => {
                        const product = products.find((p) => p.id === order.product_id);
                        return (
                          <div
                            key={order.id}
                            className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <Package className="w-4 h-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">{order.product_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {order.number_of_cases} cases
                                  {product?.unit_size_oz && ` · ${product.unit_size_oz} oz/unit`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <StatusBadge status={order.status} />
                              <span className="text-xs text-muted-foreground">
                                {new Date(order.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : isActive ? (
                    <p className="text-sm text-muted-foreground py-2">No orders at this stage. Click "New Order" to begin.</p>
                  ) : null}
                </CardContent>

                {/* Stage connector arrow */}
                {idx < STAGES.length - 1 && (
                  <div className="flex justify-center -mb-3 relative z-10">
                    <ChevronRight className="w-5 h-5 text-accent/40 rotate-90" />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default OperationsHub;

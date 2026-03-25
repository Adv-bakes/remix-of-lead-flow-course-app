import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, FlaskConical, FileText } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import WeightConversionModal from "@/components/WeightConversionModal";

interface Formula {
  id: string;
  ingredient_name: string | null;
  volume_amount: string | null;
  volume_unit: string | null;
  weight_g: number | null;
  percentage_formula: number | null;
}

interface Ingredient {
  id: string;
  ingredient_name: string;
}

interface WeightConversion {
  ingredient_name: string;
  unit: string;
  grams_per_unit: number;
}

interface Concept {
  id: number;
  product_name: string;
  pss_file_path: string | null;
  pss_file_name: string | null;
}

interface FormulasProps {
  conceptId?: number;
}

const Formulas = ({ conceptId }: FormulasProps = {}) => {
  const [concept, setConcept] = useState<Concept | null>(null);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [pendingConversion, setPendingConversion] = useState<{
    formulaId: number;
    ingredientName: string;
    unit: string;
    volumeAmount: number;
  } | null>(null);

  useEffect(() => {
    if (conceptId) {
      loadConcept();
      loadIngredients();
    }
    loadFormulas();
  }, [conceptId]);

  const loadConcept = async () => {
    if (!conceptId) return;

    const { data, error } = await supabase
      .from("concepts")
      .select("id, product_name, pss_file_path, pss_file_name")
      .eq("id", conceptId)
      .maybeSingle();

    if (!error && data) {
      setConcept(data);
    }
  };

  const loadIngredients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !conceptId) return;

    const { data, error } = await supabase
      .from("ingredients")
      .select("id, ingredient_name")
      .eq("user_id", user.id)
      .order("ingredient_name");

    if (!error && data) {
      setIngredients(data);
    }
  };

  const loadFormulas = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from("formulas")
      .select("id, ingredient_name, volume_amount, volume_unit, weight_g, percentage_formula")
      .eq("user_id", user.id)
      .order("id");

    if (conceptId) {
      query = query.eq("concept_id", conceptId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Failed to load formulas");
      console.error(error);
    } else {
      setFormulas(data || []);
      calculatePercentages(data || []);
    }
    setIsLoading(false);
  };

  const calculatePercentages = (formulaList: Formula[]) => {
    const totalWeight = formulaList.reduce((sum, f) => sum + (f.weight_g || 0), 0);
    if (totalWeight === 0) return;

    formulaList.forEach(async (formula) => {
      if (formula.weight_g) {
        const percentage = (formula.weight_g / totalWeight) * 100;
        if (Math.abs((formula.percentage_formula || 0) - percentage) > 0.01) {
          await supabase
            .from("formulas")
            .update({ percentage_formula: percentage })
            .eq("id", formula.id);
        }
      }
    });
  };

  const handleAddRow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !conceptId) return;

    const { data, error } = await supabase
      .from("formulas")
      .insert({
        user_id: user.id,
        concept_id: conceptId,
        ingredient_name: null,
        volume_amount: null,
        volume_unit: null,
        weight_g: null,
        percentage_formula: null,
        percentage: 0,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Failed to add row");
      console.error(error);
    } else {
      setFormulas([...formulas, data as unknown as Formula]);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this row?")) return;

    const { error } = await supabase
      .from("formulas")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Deleted successfully");
      loadFormulas();
    }
  };

  const handleIngredientChange = async (formulaId: string, ingredientName: string) => {
    const { error } = await supabase
      .from("formulas")
      .update({ ingredient_name: ingredientName })
      .eq("id", formulaId);

    if (error) {
      toast.error("Failed to update ingredient");
    } else {
      loadFormulas();
    }
  };

  const handleVolumeChange = async (formulaId: string, volumeAmount: number | null, volumeUnit: string | null) => {
    const formula = formulas.find(f => f.id === formulaId);
    if (!formula || !volumeAmount || !volumeUnit || !formula.ingredient_name) {
      await supabase
        .from("formulas")
        .update({ volume_amount: volumeAmount, volume_unit: volumeUnit })
        .eq("id", formulaId);
      loadFormulas();
      return;
    }

    // Check for existing conversion
    const { data: conversion } = await supabase
      .from("weight_conversions")
      .select("grams_per_unit")
      .eq("ingredient_name", formula.ingredient_name)
      .eq("unit", volumeUnit)
      .maybeSingle();

    if (conversion) {
      const weightG = volumeAmount * conversion.grams_per_unit;
      await supabase
        .from("formulas")
        .update({ volume_amount: volumeAmount, volume_unit: volumeUnit, weight_g: weightG })
        .eq("id", formulaId);
      loadFormulas();
    } else {
      // Need conversion - show modal
      setPendingConversion({
        formulaId,
        ingredientName: formula.ingredient_name,
        unit: volumeUnit,
        volumeAmount
      });
      setConversionModalOpen(true);
    }
  };

  const handleWeightChange = async (formulaId: string, weightG: number | null) => {
    const { error } = await supabase
      .from("formulas")
      .update({ weight_g: weightG })
      .eq("id", formulaId);

    if (error) {
      toast.error("Failed to update weight");
    } else {
      loadFormulas();
    }
  };

  const handleSaveConversion = async (gramsPerUnit: number) => {
    if (!pendingConversion) return;

    // Save to weight_conversions table
    const { error: conversionError } = await supabase
      .from("weight_conversions")
      .insert({
        ingredient_name: pendingConversion.ingredientName,
        unit: pendingConversion.unit,
        grams_per_unit: gramsPerUnit
      });

    if (conversionError) {
      toast.error("Failed to save conversion");
      return;
    }

    // Update formula with calculated weight
    const weightG = pendingConversion.volumeAmount * gramsPerUnit;
    await supabase
      .from("formulas")
      .update({
        volume_amount: pendingConversion.volumeAmount,
        volume_unit: pendingConversion.unit,
        weight_g: weightG
      })
      .eq("id", pendingConversion.formulaId);

    toast.success("Conversion saved");
    setPendingConversion(null);
    loadFormulas();
  };

  return (
    <div className="space-y-6">
      {conceptId && concept && (
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{concept.product_name}</h2>
              <p className="text-sm text-muted-foreground">Formula Builder</p>
            </div>
            {concept.pss_file_path && (
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                Import from PSS
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Formula Calculator</h1>
          <p className="text-muted-foreground mt-2">
            Build and calculate your recipe formula with automatic percentage calculations
          </p>
        </div>
        <Button onClick={handleAddRow}>
          <Plus className="w-4 h-4 mr-2" />
          Add Ingredient Row
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : formulas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FlaskConical className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No ingredients yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Start building your recipe by adding ingredient rows
            </p>
            <Button onClick={handleAddRow}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Ingredient
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recipe Formula</CardTitle>
            <CardDescription>
              {formulas.length} ingredients • Total: {formulas.reduce((sum, f) => sum + (f.weight_g || 0), 0).toFixed(1)}g
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Ingredient</TableHead>
                  <TableHead className="w-[30%]">Volume (optional)</TableHead>
                  <TableHead className="w-[20%]">Weight (g)</TableHead>
                  <TableHead className="w-[20%] text-right">% of Formula</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formulas.map((formula) => (
                  <TableRow key={formula.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={formula.ingredient_name || ""}
                          onValueChange={(value) => handleIngredientChange(formula.id, value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select ingredient" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map((ing) => (
                              <SelectItem key={ing.id} value={ing.ingredient_name}>
                                {ing.ingredient_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(formula.id)}
                          title="Delete row"
                          className="flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          className="w-24"
                          value={formula.volume_amount || ""}
                          onChange={(e) => {
                            const amount = e.target.value ? parseFloat(e.target.value) : null;
                            handleVolumeChange(formula.id, amount, formula.volume_unit || "cup");
                          }}
                        />
                        <Select
                          value={formula.volume_unit || "cup"}
                          onValueChange={(unit) => handleVolumeChange(formula.id, formula.volume_amount, unit)}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cup">cup</SelectItem>
                            <SelectItem value="tbsp">tbsp</SelectItem>
                            <SelectItem value="tsp">tsp</SelectItem>
                            <SelectItem value="fl oz">fl oz</SelectItem>
                            <SelectItem value="pint">pint</SelectItem>
                            <SelectItem value="quart">quart</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="Grams"
                        value={formula.weight_g || ""}
                        onChange={(e) => {
                          const weight = e.target.value ? parseFloat(e.target.value) : null;
                          handleWeightChange(formula.id, weight);
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formula.percentage_formula ? `${formula.percentage_formula.toFixed(1)}%` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Total Formula Weight
              </div>
              <div className="text-xl font-bold">
                {formulas.reduce((sum, f) => sum + (f.weight_g || 0), 0).toFixed(1)}g
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <WeightConversionModal
        open={conversionModalOpen}
        onOpenChange={setConversionModalOpen}
        ingredientName={pendingConversion?.ingredientName || ""}
        unit={pendingConversion?.unit || ""}
        onSave={handleSaveConversion}
      />
    </div>
  );
};

export default Formulas;

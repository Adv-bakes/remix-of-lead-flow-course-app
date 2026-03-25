import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import IngredientSpecDialog from "./IngredientSpecDialog";
import { IngredientDialog } from "./IngredientDialog";
import { Sparkles, Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Formula {
  id: string;
  product_id: string | null;
  ingredient_name: string | null;
  ingredient_category: string | null;
  weight_g: number | null;
  percentage_formula: number | null;
  notes: string | null;
}

interface FormulaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: Formula | null;
  conceptId?: number;
}

interface Ingredient {
  id: string;
  ingredient_name: string;
  function_in_formula: string | null;
}

const FormulaDialog = ({ open, onOpenChange, editingItem, conceptId }: FormulaDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showSpecDialog, setShowSpecDialog] = useState(false);
  const [pendingIngredient, setPendingIngredient] = useState("");
  const [showIngredientDialog, setShowIngredientDialog] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [formData, setFormData] = useState({
    ingredient_name: "",
    ingredient_category: "",
    weight_g: "",
    percentage_formula: "",
    notes: "",
    volume_amount: "",
    volume_unit: "",
  });

  useEffect(() => {
    if (open) {
      loadIngredients();
    }
    if (editingItem) {
      setFormData({
        ingredient_name: editingItem.ingredient_name || "",
        ingredient_category: editingItem.ingredient_category || "",
        weight_g: editingItem.weight_g?.toString() || "",
        percentage_formula: editingItem.percentage_formula?.toString() || "",
        notes: editingItem.notes || "",
        volume_amount: "",
        volume_unit: "",
      });
    } else {
      setFormData({
        ingredient_name: "",
        ingredient_category: "",
        weight_g: "",
        percentage_formula: "",
        notes: "",
        volume_amount: "",
        volume_unit: "",
      });
      setSelectedIngredientId(null);
      setSearchQuery("");
    }
  }, [editingItem, open]);

  const loadIngredients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("ingredients")
      .select("id, ingredient_name, function_in_formula")
      .eq("user_id", user.id)
      .order("ingredient_name");

    if (error) {
      console.error("Failed to load ingredients:", error);
    } else {
      setIngredients(data || []);
    }
  };

  const handleIngredientSelect = async (ingredientId: string) => {
    const ingredient = ingredients.find(i => i.id === ingredientId);
    if (!ingredient) return;

    setSelectedIngredientId(ingredientId);
    setSearchQuery(ingredient.ingredient_name);
    setFormData({
      ...formData,
      ingredient_name: ingredient.ingredient_name,
    });
    setComboboxOpen(false);
  };

  const handleVolumeChange = async (amount: string, unit: string) => {
    setFormData({
      ...formData,
      volume_amount: amount,
      volume_unit: unit,
    });

    // Convert volume to grams if both fields are filled
    if (amount && unit && formData.ingredient_name) {
      const ingredientBaseName = formData.ingredient_name.toLowerCase().split(',')[0].trim();
      
      const { data, error } = await supabase
        .from("weight_conversions")
        .select("grams_per_unit")
        .ilike("ingredient_name", `%${ingredientBaseName}%`)
        .eq("unit", unit)
        .maybeSingle();

      if (data && !error) {
        const weightInGrams = parseFloat(amount) * parseFloat(data.grams_per_unit.toString());
        setFormData(prev => ({
          ...prev,
          weight_g: weightInGrams.toFixed(2),
        }));
      } else {
        // Generic conversion if no specific ingredient found
        const genericConversion = await supabase
          .from("weight_conversions")
          .select("grams_per_unit")
          .eq("ingredient_name", "water")
          .eq("unit", unit)
          .maybeSingle();

        if (genericConversion.data) {
          const weightInGrams = parseFloat(amount) * parseFloat(genericConversion.data.grams_per_unit.toString());
          setFormData(prev => ({
            ...prev,
            weight_g: weightInGrams.toFixed(2),
          }));
          toast.info("Using generic conversion. Add specific density for accurate results.");
        }
      }
    }
  };

  const handleAddNewIngredient = () => {
    setShowIngredientDialog(true);
    setComboboxOpen(false);
  };

  const handleIngredientDialogClose = () => {
    setShowIngredientDialog(false);
    loadIngredients();
  };

  const checkForGenericIngredient = (ingredientName: string) => {
    const genericKeywords = [
      "flour", "sugar", "salt", "oil", "cocoa", "protein", "fiber",
      "wheat", "sweetener", "fat", "shortening", "chocolate", "whey"
    ];
    
    const normalized = ingredientName.toLowerCase().trim();
    return genericKeywords.some(keyword => normalized.includes(keyword) && normalized.length < 25);
  };

  const handleIngredientNameChange = (value: string) => {
    setFormData({ ...formData, ingredient_name: value });
  };

  const handleIngredientNameBlur = () => {
    if (formData.ingredient_name && !editingItem && checkForGenericIngredient(formData.ingredient_name)) {
      setPendingIngredient(formData.ingredient_name);
      setShowSpecDialog(true);
    }
  };

  const handleSpecComplete = (formattedName: string) => {
    setFormData({ ...formData, ingredient_name: formattedName });
    setPendingIngredient("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in");
      setIsLoading(false);
      return;
    }

    const dataToSave = {
      product_id: null,
      ingredient_name: formData.ingredient_name || null,
      ingredient_category: formData.ingredient_category || null,
      weight_g: formData.weight_g ? parseFloat(formData.weight_g) : null,
      percentage_formula: formData.percentage_formula ? parseFloat(formData.percentage_formula) : null,
      notes: formData.notes || null,
      user_id: user.id,
      concept_id: conceptId || null,
    };

    if (editingItem) {
      const { error } = await supabase
        .from("formulas")
        .update(dataToSave)
        .eq("id", editingItem.id);

      if (error) {
        toast.error("Failed to update");
        console.error(error);
      } else {
        toast.success("Updated successfully");
        onOpenChange(true);
      }
    } else {
      const { error } = await supabase
        .from("formulas")
        .insert([dataToSave as any]);

      if (error) {
        toast.error("Failed to create");
        console.error(error);
      } else {
        toast.success("Created successfully");
        onOpenChange(true);
      }
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit" : "Add"} Formula</DialogTitle>
          <DialogDescription>
            {editingItem ? "Update the details below" : "Fill in the ingredient details"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ingredient_name" className="flex items-center gap-2">
              Ingredient Name *
              <Sparkles className="h-3 w-3 text-primary" />
            </Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="w-full justify-between"
                >
                  {searchQuery || "Select ingredient..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Search ingredients..." 
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="p-2 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No ingredient found</p>
                        <Button 
                          size="sm" 
                          onClick={handleAddNewIngredient}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Ingredient
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {ingredients
                        .filter(ing => 
                          ing.ingredient_name.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((ingredient) => (
                          <CommandItem
                            key={ingredient.id}
                            value={ingredient.ingredient_name}
                            onSelect={() => handleIngredientSelect(ingredient.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedIngredientId === ingredient.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{ingredient.ingredient_name}</span>
                              {ingredient.function_in_formula && (
                                <span className="text-xs text-muted-foreground">
                                  {ingredient.function_in_formula}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              💡 Select from your ingredient library or add a new one
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ingredient_category">Category</Label>
            <Input
              id="ingredient_category"
              value={formData.ingredient_category}
              onChange={(e) => setFormData({ ...formData, ingredient_category: e.target.value })}
              placeholder="e.g., flour, sugar, dairy"
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume_amount">Volume Amount</Label>
                <Input
                  id="volume_amount"
                  type="number"
                  step="0.01"
                  value={formData.volume_amount}
                  onChange={(e) => handleVolumeChange(e.target.value, formData.volume_unit)}
                  placeholder="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="volume_unit">Volume Unit</Label>
                <Select
                  value={formData.volume_unit}
                  onValueChange={(value) => handleVolumeChange(formData.volume_amount, value)}
                >
                  <SelectTrigger id="volume_unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cup">Cup</SelectItem>
                    <SelectItem value="tbsp">Tablespoon</SelectItem>
                    <SelectItem value="tsp">Teaspoon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight_g">Weight (g) *</Label>
                <Input
                  id="weight_g"
                  type="number"
                  step="0.01"
                  value={formData.weight_g}
                  onChange={(e) => setFormData({ ...formData, weight_g: e.target.value })}
                  placeholder="500"
                  className={formData.volume_amount ? "bg-muted" : ""}
                />
                {formData.volume_amount && formData.volume_unit && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {formData.volume_amount} {formData.volume_unit}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="percentage_formula">Percentage (%)</Label>
                <Input
                  id="percentage_formula"
                  type="number"
                  step="0.01"
                  value={formData.percentage_formula}
                  onChange={(e) => setFormData({ ...formData, percentage_formula: e.target.value })}
                  placeholder="45.5"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Add any additional notes..."
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>

      {!editingItem && (
        <>
          <IngredientSpecDialog
            open={showSpecDialog}
            onOpenChange={setShowSpecDialog}
            baseIngredient={pendingIngredient}
            onSpecComplete={handleSpecComplete}
            conceptId={conceptId}
          />
          <IngredientDialog
            open={showIngredientDialog}
            onClose={handleIngredientDialogClose}
          />
        </>
      )}
    </Dialog>
  );
};

export default FormulaDialog;

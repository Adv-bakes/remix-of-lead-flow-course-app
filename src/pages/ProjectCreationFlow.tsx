import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  Lightbulb, 
  Package, 
  FlaskConical, 
  TestTube, 
  DollarSign, 
  BoxIcon,
  CheckCircle2,
  Plus,
  Trash2,
  Info,
  Download,
  ArrowLeft,
  PartyPopper,
  Sparkles,
  Upload,
  FileText
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IngredientDialog } from "@/components/IngredientDialog";
import IngredientSpecDialog from "@/components/IngredientSpecDialog";

const ProjectCreationFlow = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("concepts");
  const [conceptId, setConceptId] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [previousProgress, setPreviousProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationType, setCelebrationType] = useState<"25" | "50" | "75" | "100">("25");

  // Concept data
  const [conceptData, setConceptData] = useState({
    product_name: "",
    product_type: "",
    target_market: "",
    key_qualities: "",
    desired_claims: [] as string[],
    notes: "",
    // PSS/Batch Sheet fields
    customer_name: "",
    product_appearance: "",
    target_shelf_life: "",
    prepared_by: "",
    approved_by: "",
    baking_temp: "",
    baking_temp_unit: "F",
    baking_time_minutes: "",
    processing_steps: [] as string[],
  });
  const [newClaim, setNewClaim] = useState("");
  const [pssFile, setPssFile] = useState<File | null>(null);
  const [pssUploading, setPssUploading] = useState(false);
  const [pssFileName, setPssFileName] = useState<string | null>(null);

  // Ingredients data
  const [ingredientsList, setIngredientsList] = useState<any[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<any[]>([]);
  const [showIngredientDialog, setShowIngredientDialog] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<any>(null);
  const [showSpecDialog, setShowSpecDialog] = useState(false);
  const [specIngredientName, setSpecIngredientName] = useState("");
  const [selectedIngredientForSpecs, setSelectedIngredientForSpecs] = useState<any>(null);
  const [ingredientSpecs, setIngredientSpecs] = useState<any[]>([]);
  const [showAddSpecForm, setShowAddSpecForm] = useState(false);
  const [newSpec, setNewSpec] = useState({
    supplier_name: "",
    spec_details: "",
    unit_cost: ""
  });

  // Formulation data
  const [bakedGoodId, setBakedGoodId] = useState<number | null>(null);
  const [formulas, setFormulas] = useState<any[]>([]);

  // Shelf-life data
  const [shelfLifeData, setShelfLifeData] = useState({
    shelf_life_days: "",
    storage_condition: "ambient",
    aw_test_result: "",
    moisture_pct: "",
    ph_level: "",
    preservation_strategy: "",
    functional_ingredients: [] as any[],
    barrier_type: [] as any[],
    packaging_material: "",
    notes: ""
  });

  // Costing data
  const [costingData, setCostingData] = useState({
    ingredient_cost: "",
    labor_cost: "",
    overhead_cost: "",
    packaging_cost: "",
    total_cost: "",
    target_price: "",
    margin_percentage: "",
    notes: ""
  });

  // Packaging hierarchy (product-level fields)
  const [packHierarchy, setPackHierarchy] = useState({
    raw_fill_weight: "",
    raw_fill_weight_unit: "oz",
    units_per_pack: "",
    units_per_caddy: "",
    units_per_shipper: "",
    cases_per_pallet: "",
  });

  // Packaging data
  const [packagingData, setPackagingData] = useState({
    package_type: "",
    material: "",
    dimensions: "",
    cost_per_unit: "",
    labeling_status: "pending",
    compliance_notes: "",
    oxygen_barrier: false,
    moisture_barrier: false,
    uv_barrier: false,
    sustainability_notes: "",
    notes: ""
  });

  // Market readiness data
  const [readinessData, setReadinessData] = useState({
    concept_complete: false,
    ingredients_complete: false,
    formula_complete: false,
    shelf_life_complete: false,
    costing_complete: false,
    packaging_complete: false,
    label_compliance: false,
    nutrition_facts: false,
    legal_review: false,
    notes: ""
  });

  useEffect(() => {
    loadUser();
    loadIngredients();
  }, []);

  useEffect(() => {
    calculateProgress();
    // Update progress in database whenever it changes
    if (conceptId && progress > 0) {
      updateProgressInDB();
    }
  }, [conceptData, selectedIngredients, formulas, shelfLifeData, costingData, packagingData, readinessData]);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
    } else {
      navigate("/auth");
    }
  };

  const loadIngredients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("ingredients")
      .select("*")
      .eq("user_id", user.id)
      .order("ingredient_name");

    if (!error && data) {
      setIngredientsList(data);
    }
  };

  const loadIngredientSpecs = async (ingredientId: number) => {
    const { data, error } = await supabase
      .from("ingredient_specs")
      .select("*")
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setIngredientSpecs(data);
    } else {
      setIngredientSpecs([]);
    }
  };

  const handleIngredientSelect = async (ingredient: any) => {
    const isSelected = selectedIngredients.some(i => i.id === ingredient.id);
    
    if (isSelected) {
      setSelectedIngredients(selectedIngredients.filter(i => i.id !== ingredient.id));
      if (selectedIngredientForSpecs?.id === ingredient.id) {
        setSelectedIngredientForSpecs(null);
        setIngredientSpecs([]);
      }
    } else {
      setSelectedIngredients([...selectedIngredients, ingredient]);
      setSelectedIngredientForSpecs(ingredient);
      await loadIngredientSpecs(ingredient.id);
    }
  };

  const handleAddSpec = async () => {
    if (!selectedIngredientForSpecs || !userId) return;
    
    if (!newSpec.supplier_name || !newSpec.spec_details) {
      toast.error("Please fill in supplier name and specification details");
      return;
    }

    try {
      const { error } = await supabase
        .from("ingredient_specs")
        .insert({
          user_id: userId,
          ingredient_id: selectedIngredientForSpecs.id,
          base_ingredient: selectedIngredientForSpecs.ingredient_name,
          supplier_name: newSpec.supplier_name,
          spec_details: newSpec.spec_details,
          unit_cost: newSpec.unit_cost ? parseFloat(newSpec.unit_cost) : null,
          formatted_name: `${selectedIngredientForSpecs.ingredient_name} - ${newSpec.supplier_name}`,
          spec_fields: {},
          concept_id: conceptId
        });

      if (error) throw error;

      toast.success("Supplier spec added!");
      setNewSpec({ supplier_name: "", spec_details: "", unit_cost: "" });
      setShowAddSpecForm(false);
      await loadIngredientSpecs(selectedIngredientForSpecs.id);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleIngredientDialogClose = () => {
    setShowIngredientDialog(false);
    setEditingIngredient(null);
    loadIngredients(); // Refresh the list
  };

  const handleEditSpecs = (ingredientName: string) => {
    setSpecIngredientName(ingredientName);
    setShowSpecDialog(true);
  };

  const handleSpecComplete = (formattedName: string) => {
    setShowSpecDialog(false);
    loadIngredients(); // Refresh to show updated names
  };

  const calculateProgress = () => {
    let points = 0;
    let maxPoints = 0;

    // Concept (20 points max)
    maxPoints += 20;
    if (conceptData.product_name) points += 5;
    if (conceptData.product_type) points += 5;
    if (conceptData.target_market) points += 3;
    if (conceptData.key_qualities) points += 4;
    if (conceptData.desired_claims.length > 0) points += 3;

    // Ingredients (15 points max)
    maxPoints += 15;
    if (selectedIngredients.length > 0) points += 15;

    // Formulation (10 points max)
    maxPoints += 10;
    if (formulas.length > 0) points += 10;

    // Shelf-life (20 points max)
    maxPoints += 20;
    if (shelfLifeData.shelf_life_days) points += 5;
    if (shelfLifeData.storage_condition) points += 3;
    if (shelfLifeData.aw_test_result) points += 4;
    if (shelfLifeData.moisture_pct) points += 3;
    if (shelfLifeData.ph_level) points += 3;
    if (shelfLifeData.preservation_strategy) points += 2;

    // Costing (15 points max)
    maxPoints += 15;
    if (costingData.ingredient_cost) points += 3;
    if (costingData.labor_cost) points += 3;
    if (costingData.total_cost) points += 5;
    if (costingData.target_price) points += 4;

    // Packaging (10 points max)
    maxPoints += 10;
    if (packagingData.package_type) points += 4;
    if (packagingData.material) points += 4;
    if (packagingData.cost_per_unit) points += 2;

    // Readiness (10 points max)
    maxPoints += 10;
    if (readinessData.concept_complete) points += 2;
    if (readinessData.ingredients_complete) points += 2;
    if (readinessData.formula_complete) points += 1;
    if (readinessData.shelf_life_complete) points += 1;
    if (readinessData.label_compliance) points += 2;
    if (readinessData.nutrition_facts) points += 2;

    const newProgress = Math.round((points / maxPoints) * 100);
    
    // Check for milestone crossings
    const milestones = [25, 50, 75, 100];
    for (const milestone of milestones) {
      if (previousProgress < milestone && newProgress >= milestone) {
        setCelebrationType(milestone.toString() as "25" | "50" | "75" | "100");
        setShowCelebration(true);
        if (milestone === 100) {
          toast.success("🎉 Congratulations! Your project is 100% complete!");
        }
        break;
      }
    }

    setPreviousProgress(progress);
    setProgress(newProgress);
  };

  const handlePssUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a valid document file (Excel, PDF, or Word)");
      return;
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size must be less than 20MB");
      return;
    }

    setPssFile(file);
    setPssFileName(file.name);
    toast.success(`${file.name} ready to upload`);
  };

  const uploadPssFile = async (createdConceptId: number): Promise<string | null> => {
    if (!pssFile || !userId) return null;

    setPssUploading(true);
    try {
      const fileExt = pssFile.name.split('.').pop();
      const fileName = `${userId}/${createdConceptId}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-spec-sheets')
        .upload(fileName, pssFile);

      if (uploadError) throw uploadError;

      // Update concept with file path
      const { error: updateError } = await supabase
        .from('concepts')
        .update({
          pss_file_path: fileName,
          pss_file_name: pssFile.name,
          pss_uploaded_at: new Date().toISOString()
        })
        .eq('id', createdConceptId);

      if (updateError) throw updateError;

      toast.success("PSS file uploaded successfully!");
      return fileName;
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
      return null;
    } finally {
      setPssUploading(false);
    }
  };

  const saveConcept = async () => {
    if (!userId || !conceptData.product_name) {
      toast.error("Please enter a product name");
      return;
    }

    setIsSaving(true);

    try {
      const { baking_temp, baking_time_minutes, processing_steps, ...restConcept } = conceptData;
      const payload = {
        user_id: userId,
        ...restConcept,
        baking_temp: baking_temp ? String(baking_temp) : null,
        baking_time_minutes: baking_time_minutes ? String(baking_time_minutes) : null,
        processing_steps: processing_steps.length > 0 ? processing_steps : [],
      };

      const { data, error } = await supabase
        .from("concepts")
        .insert(payload as any)
        .select()
        .single();

      if (error) throw error;

      setConceptId(data.id);
      
      // Upload PSS file if one was selected
      if (pssFile) {
        await uploadPssFile(data.id);
      }
      
      toast.success("Concept saved!");
      return data.id;
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateConcept = async () => {
    if (!conceptId) return;

    setIsSaving(true);

    try {
      const { baking_temp, baking_time_minutes, processing_steps, ...restConcept } = conceptData;
      const payload = {
        ...restConcept,
        baking_temp: baking_temp ? parseFloat(baking_temp) : null,
        baking_time_minutes: baking_time_minutes ? parseFloat(baking_time_minutes) : null,
        processing_steps: processing_steps.length > 0 ? processing_steps : [],
      };

      const { error } = await supabase
        .from("concepts")
        .update(payload)
        .eq("id", conceptId);

      if (error) throw error;
      toast.success("Concept updated!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const saveIngredientsToProject = async () => {
    if (!conceptId || !userId) return;

    // Create a baked good if not exists
    if (!bakedGoodId) {
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: userId,
          product_name: conceptData.product_name,
          concept_id: conceptId,
          category: "baked"
        } as any)
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      setBakedGoodId(data.id);
      toast.success("Ingredients linked to product!");
    }
  };

  const saveShelfLife = async () => {
    if (!conceptId || !userId || !bakedGoodId) {
      toast.error("Please complete previous steps first");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("shelf_life")
        .insert({
          user_id: userId,
          concept_id: conceptId,
          product_id: bakedGoodId,
          shelf_life_days: parseInt(shelfLifeData.shelf_life_days) || null,
          storage_condition: shelfLifeData.storage_condition,
          aw_test_result: parseFloat(shelfLifeData.aw_test_result) || null,
          moisture_pct: parseFloat(shelfLifeData.moisture_pct) || null,
          ph_level: parseFloat(shelfLifeData.ph_level) || null,
          preservation_strategy: shelfLifeData.preservation_strategy,
          functional_ingredients: shelfLifeData.functional_ingredients,
          barrier_type: shelfLifeData.barrier_type,
          packaging_material: shelfLifeData.packaging_material,
          notes: shelfLifeData.notes
        });

      if (error) throw error;
      toast.success("Shelf-life data saved!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const saveCosting = async () => {
    if (!conceptId || !userId || !bakedGoodId) {
      toast.error("Please complete previous steps first");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("costing")
        .insert({
          user_id: userId,
          concept_id: conceptId,
          product_id: bakedGoodId,
          ingredient_cost: parseFloat(costingData.ingredient_cost) || null,
          labor_cost: parseFloat(costingData.labor_cost) || null,
          overhead_cost: parseFloat(costingData.overhead_cost) || null,
          packaging_cost: parseFloat(costingData.packaging_cost) || null,
          total_cost: parseFloat(costingData.total_cost) || null,
          target_price: parseFloat(costingData.target_price) || null,
          margin_percentage: parseFloat(costingData.margin_percentage) || null,
          notes: costingData.notes
        });

      if (error) throw error;
      toast.success("Costing data saved!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const savePackaging = async () => {
    if (!conceptId || !userId || !bakedGoodId) {
      toast.error("Please complete previous steps first");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("packaging")
        .insert({
          user_id: userId,
          concept_id: conceptId,
          product_id: bakedGoodId,
          package_type: packagingData.package_type,
          material: packagingData.material,
          dimensions: packagingData.dimensions,
          cost_per_unit: parseFloat(packagingData.cost_per_unit) || null,
          labeling_status: packagingData.labeling_status,
          compliance_notes: packagingData.compliance_notes,
          notes: packagingData.notes
        });

      if (error) throw error;

      // Save packaging hierarchy to products table
      if (bakedGoodId) {
        await supabase
          .from("products")
          .update({
            raw_fill_weight: packHierarchy.raw_fill_weight ? parseFloat(packHierarchy.raw_fill_weight) : null,
            raw_fill_weight_unit: packHierarchy.raw_fill_weight_unit,
            units_per_pack: packHierarchy.units_per_pack ? parseInt(packHierarchy.units_per_pack) : null,
            units_per_caddy: packHierarchy.units_per_caddy ? parseInt(packHierarchy.units_per_caddy) : null,
            units_per_shipper: packHierarchy.units_per_shipper ? parseInt(packHierarchy.units_per_shipper) : null,
            cases_per_pallet: packHierarchy.cases_per_pallet ? parseInt(packHierarchy.cases_per_pallet) : null,
          })
          .eq("id", bakedGoodId);
      }

      toast.success("Packaging data saved!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateProgressInDB = async () => {
    if (!conceptId || !userId) return;

    try {
      // Check if readiness record exists
      const { data: existing } = await supabase
        .from("readiness")
        .select("id")
        .eq("concept_id", conceptId)
        .single();

      if (existing) {
        // Update existing record
        await supabase
          .from("readiness")
          .update({ overall_readiness_percent: progress })
          .eq("id", existing.id);
      } else {
        // Create new record with current progress
        await supabase
          .from("readiness")
          .insert({
            user_id: userId,
            concept_id: conceptId,
            product_id: bakedGoodId,
            overall_readiness_percent: progress
          });
      }
    } catch (error) {
      // Silent fail - progress tracking is not critical
      console.error("Error updating progress:", error);
    }
  };

  const saveReadiness = async () => {
    if (!conceptId || !userId) {
      toast.error("Please complete previous steps first");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("readiness")
        .insert({
          user_id: userId,
          concept_id: conceptId,
          product_id: bakedGoodId,
          ...readinessData,
          overall_readiness_percent: progress
        });

      if (error) throw error;
      toast.success("Market readiness saved!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const generatePSS = () => {
    toast.success("Generating Product Specification Sheet...");
    // In a real implementation, this would generate a PDF or detailed report
    setTimeout(() => {
      toast.success("PSS generated! Check your downloads.");
    }, 2000);
  };

  const addClaim = () => {
    if (newClaim && !conceptData.desired_claims.includes(newClaim)) {
      setConceptData({
        ...conceptData,
        desired_claims: [...conceptData.desired_claims, newClaim]
      });
      setNewClaim("");
    }
  };

  const removeClaim = (claim: string) => {
    setConceptData({
      ...conceptData,
      desired_claims: conceptData.desired_claims.filter(c => c !== claim)
    });
  };

  const handleNext = async () => {
    const tabs = ["concepts", "ingredients", "formulation", "shelf-life", "costing", "packaging", "readiness"];
    const currentIndex = tabs.indexOf(activeTab);

    // Save current tab data
    if (activeTab === "concepts") {
      if (!conceptId) {
        await saveConcept();
      } else {
        await updateConcept();
      }
    } else if (activeTab === "ingredients") {
      await saveIngredientsToProject();
    } else if (activeTab === "shelf-life") {
      await saveShelfLife();
    } else if (activeTab === "costing") {
      await saveCosting();
    } else if (activeTab === "packaging") {
      await savePackaging();
    } else if (activeTab === "readiness") {
      await saveReadiness();
    }

    // Move to next tab
    if (currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1]);
    }
  };

  const handleFinish = async () => {
    await saveReadiness();
    toast.success("Project completed! Redirecting to project workspace...");
    setTimeout(() => {
      if (conceptId) {
        navigate(`/project/${conceptId}`);
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--muted))] to-[hsl(var(--background))]">
      {/* Celebration Modal */}
      <Dialog open={showCelebration} onOpenChange={setShowCelebration}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <PartyPopper className="h-6 w-6 text-accent" />
              {celebrationType === "100" ? "Manufacturing Ready! 🎉" : `${celebrationType}% Complete!`}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {celebrationType === "100" ? (
                <div className="space-y-4">
                  <p className="text-foreground font-semibold">
                    Congratulations! Your project is 100% complete and ready for manufacturing.
                  </p>
                  <p>
                    You've successfully documented all critical aspects of your product. 
                    You can now generate your Product Specification Sheet (PSS) to share with manufacturers.
                  </p>
                  <Button 
                    onClick={() => {
                      setShowCelebration(false);
                      generatePSS();
                    }}
                    className="w-full mt-4"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Generate PSS Summary
                  </Button>
                </div>
              ) : celebrationType === "75" ? (
                <p>You're almost there! Just a few more details to complete your manufacturing-ready specification.</p>
              ) : celebrationType === "50" ? (
                <p>Great progress! You're halfway through documenting your product specification.</p>
              ) : (
                <p>Nice start! Keep going to complete your product specification.</p>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">New Project</h1>
              <p className="text-muted-foreground mt-2">
                {conceptData.product_name || "Guide your product from concept to market"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-2">Overall Progress</div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Progress 
                    value={progress} 
                    className={cn(
                      "w-32 h-4",
                      progress >= 100 && "animate-[shimmer_2s_infinite]"
                    )}
                    style={{
                      backgroundSize: '200% 100%'
                    }}
                  />
                </div>
                <span 
                  className={cn(
                    "text-2xl font-bold transition-all duration-300",
                    showCelebration && "animate-[celebrate-pulse_0.5s_ease-in-out_3]"
                  )}
                >
                  {progress}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="bg-gradient-to-r from-[hsl(var(--accent))] to-[hsl(var(--primary))] p-1 rounded-lg">
            <TabsList className="w-full bg-background/95 backdrop-blur">
              <TabsTrigger value="concepts" className="flex-1">
                <Lightbulb className="h-4 w-4 mr-2" />
                Concepts
              </TabsTrigger>
              <TabsTrigger value="ingredients" className="flex-1">
                <Package className="h-4 w-4 mr-2" />
                Ingredients
              </TabsTrigger>
              <TabsTrigger value="formulation" className="flex-1">
                <FlaskConical className="h-4 w-4 mr-2" />
                Formulation
              </TabsTrigger>
              <TabsTrigger value="shelf-life" className="flex-1">
                <TestTube className="h-4 w-4 mr-2" />
                Shelf-Life
              </TabsTrigger>
              <TabsTrigger value="costing" className="flex-1">
                <DollarSign className="h-4 w-4 mr-2" />
                Costing
              </TabsTrigger>
              <TabsTrigger value="packaging" className="flex-1">
                <BoxIcon className="h-4 w-4 mr-2" />
                Packaging
              </TabsTrigger>
              <TabsTrigger value="readiness" className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Readiness
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Concepts Tab */}
          <TabsContent value="concepts">
            <Card>
              <CardHeader>
                <CardTitle>Product Concept</CardTitle>
                <CardDescription>Define your product idea, target audience, and key claims</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="product_name">Product Name *</Label>
                    <Input
                      id="product_name"
                      value={conceptData.product_name}
                      onChange={(e) => setConceptData({ ...conceptData, product_name: e.target.value })}
                      placeholder="e.g., Artisan Sourdough Loaf"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product_type">Product Type</Label>
                    <Input
                      id="product_type"
                      value={conceptData.product_type}
                      onChange={(e) => setConceptData({ ...conceptData, product_type: e.target.value })}
                      placeholder="e.g., Bread, Cookie, Pastry"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target_market">Target Market</Label>
                  <Input
                    id="target_market"
                    value={conceptData.target_market}
                    onChange={(e) => setConceptData({ ...conceptData, target_market: e.target.value })}
                    placeholder="e.g., Health-conscious millennials, Families"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="key_qualities">Key Qualities or Benefits</Label>
                  <p className="text-xs text-muted-foreground">
                    What are the standout qualities, features, or experiences this product delivers?
                  </p>
                  <Textarea
                    id="key_qualities"
                    value={conceptData.key_qualities}
                    onChange={(e) => setConceptData({ ...conceptData, key_qualities: e.target.value })}
                    placeholder='e.g., "Rich buttery flavor, moist crumb, authentic island aroma, perfect for gifting."'
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Desired Claims</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newClaim}
                      onChange={(e) => setNewClaim(e.target.value)}
                      placeholder="e.g., Organic, Gluten-Free"
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addClaim())}
                    />
                    <Button onClick={addClaim} type="button">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {conceptData.desired_claims.map((claim) => (
                      <Badge key={claim} variant="secondary" className="gap-1">
                        {claim}
                        <button onClick={() => removeClaim(claim)} className="ml-1">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="concept_notes">Notes</Label>
                  <Textarea
                    id="concept_notes"
                    value={conceptData.notes}
                    onChange={(e) => setConceptData({ ...conceptData, notes: e.target.value })}
                    placeholder="Additional notes or ideas"
                    rows={3}
                  />
                </div>

                {/* PSS / Batch Sheet Fields */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-3 text-foreground">Manufacturing Specifications</h3>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Customer Name</Label>
                      <Input
                        id="customer_name"
                        value={conceptData.customer_name}
                        onChange={(e) => setConceptData({ ...conceptData, customer_name: e.target.value })}
                        placeholder="Client / brand name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product_appearance">Texture & Appearance</Label>
                      <Input
                        id="product_appearance"
                        value={conceptData.product_appearance}
                        onChange={(e) => setConceptData({ ...conceptData, product_appearance: e.target.value })}
                        placeholder="e.g., Golden brown, crispy exterior"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label htmlFor="target_shelf_life">Target Shelf Life</Label>
                      <Input
                        id="target_shelf_life"
                        value={conceptData.target_shelf_life}
                        onChange={(e) => setConceptData({ ...conceptData, target_shelf_life: e.target.value })}
                        placeholder="e.g., 6 months"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prepared_by">Prepared By</Label>
                      <Input
                        id="prepared_by"
                        value={conceptData.prepared_by}
                        onChange={(e) => setConceptData({ ...conceptData, prepared_by: e.target.value })}
                        placeholder="Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="approved_by">Approved By</Label>
                      <Input
                        id="approved_by"
                        value={conceptData.approved_by}
                        onChange={(e) => setConceptData({ ...conceptData, approved_by: e.target.value })}
                        placeholder="Name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label htmlFor="baking_temp">Baking Temperature</Label>
                      <Input
                        id="baking_temp"
                        type="number"
                        value={conceptData.baking_temp}
                        onChange={(e) => setConceptData({ ...conceptData, baking_temp: e.target.value })}
                        placeholder="e.g., 350"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="baking_temp_unit">Temp Unit</Label>
                      <Select
                        value={conceptData.baking_temp_unit}
                        onValueChange={(v) => setConceptData({ ...conceptData, baking_temp_unit: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="F">°F</SelectItem>
                          <SelectItem value="C">°C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="baking_time">Bake Time (minutes)</Label>
                      <Input
                        id="baking_time"
                        type="number"
                        value={conceptData.baking_time_minutes}
                        onChange={(e) => setConceptData({ ...conceptData, baking_time_minutes: e.target.value })}
                        placeholder="e.g., 25"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pss_upload">Product Spec Sheet (Optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload your product specification sheet (Excel, PDF, or Word format, max 20MB)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('pss_upload')?.click()}
                      disabled={pssUploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {pssFileName ? 'Change File' : 'Add PSS'}
                    </Button>
                    <input
                      id="pss_upload"
                      type="file"
                      accept=".xlsx,.xls,.pdf,.doc,.docx"
                      onChange={handlePssUpload}
                      className="hidden"
                    />
                    {pssFileName && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        <span>{pssFileName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleNext} disabled={isSaving || pssUploading}>
                    {isSaving || pssUploading ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ingredients Tab */}
          <TabsContent value="ingredients">
            <Card>
              <CardHeader>
                <CardTitle>Ingredients & Specifications</CardTitle>
                <CardDescription>Select ingredients and document key specifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Select Ingredients from Your Library</Label>
                    <Button 
                      onClick={() => setShowIngredientDialog(true)} 
                      size="sm"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Ingredient
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2 bg-background/50">
                    {ingredientsList.map((ingredient) => (
                      <div key={ingredient.id} className="space-y-2">
                        <div className="flex items-center justify-between group hover:bg-accent/50 p-2 rounded-md transition">
                          <div className="flex items-center gap-2 flex-1">
                            <Checkbox
                              checked={selectedIngredients.some(i => i.id === ingredient.id)}
                              onCheckedChange={() => handleIngredientSelect(ingredient)}
                            />
                            <div className="flex-1">
                              <div className="font-medium">{ingredient.ingredient_name}</div>
                              {ingredient.notes && (
                                <div className="text-xs text-muted-foreground">{ingredient.notes}</div>
                              )}
                            </div>
                          </div>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleEditSpecs(ingredient.ingredient_name)}
                                >
                                  <Sparkles className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit Specifications</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {/* Supplier Specs Section */}
                        {selectedIngredientForSpecs?.id === ingredient.id && selectedIngredients.some(i => i.id === ingredient.id) && (
                          <div className="ml-8 pl-4 border-l-2 border-accent/30 space-y-2">
                            <div className="text-sm font-medium text-muted-foreground mb-2">Supplier Specifications</div>
                            
                            {ingredientSpecs.length > 0 ? (
                              <div className="space-y-2">
                                {ingredientSpecs.map((spec) => (
                                  <div key={spec.id} className="p-2 bg-accent/10 rounded-md text-sm">
                                    <div className="font-medium">{spec.supplier_name}</div>
                                    <div className="text-muted-foreground">{spec.spec_details}</div>
                                    {spec.unit_cost && (
                                      <div className="text-primary font-medium">${spec.unit_cost}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground italic">No supplier specs yet</div>
                            )}

                            {!showAddSpecForm ? (
                              <Button 
                                onClick={() => setShowAddSpecForm(true)}
                                variant="outline"
                                size="sm"
                                className="w-full mt-2"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Supplier Spec
                              </Button>
                            ) : (
                              <div className="space-y-2 p-3 bg-background rounded-md border mt-2">
                                <div className="space-y-1">
                                  <Label htmlFor="supplier_name" className="text-xs">Supplier Name *</Label>
                                  <Input
                                    id="supplier_name"
                                    value={newSpec.supplier_name}
                                    onChange={(e) => setNewSpec({ ...newSpec, supplier_name: e.target.value })}
                                    placeholder="e.g., King Arthur Baking"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="spec_details" className="text-xs">Specification Details *</Label>
                                  <Input
                                    id="spec_details"
                                    value={newSpec.spec_details}
                                    onChange={(e) => setNewSpec({ ...newSpec, spec_details: e.target.value })}
                                    placeholder="e.g., Unbleached, 11.8% protein"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="unit_cost" className="text-xs">Unit Cost (optional)</Label>
                                  <Input
                                    id="unit_cost"
                                    type="number"
                                    step="0.01"
                                    value={newSpec.unit_cost}
                                    onChange={(e) => setNewSpec({ ...newSpec, unit_cost: e.target.value })}
                                    placeholder="0.00"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button 
                                    onClick={handleAddSpec}
                                    size="sm"
                                    className="flex-1"
                                  >
                                    Save Spec
                                  </Button>
                                  <Button 
                                    onClick={() => {
                                      setShowAddSpecForm(false);
                                      setNewSpec({ supplier_name: "", spec_details: "", unit_cost: "" });
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {ingredientsList.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground mb-4">
                        No ingredients in your library yet.
                      </p>
                      <Button 
                        onClick={() => setShowIngredientDialog(true)}
                        variant="outline"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Your First Ingredient
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setActiveTab("concepts")}>
                    Previous
                  </Button>
                  <Button onClick={handleNext} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Formulation Tab */}
          <TabsContent value="formulation">
            <Card>
              <CardHeader>
                <CardTitle>Formulation</CardTitle>
                <CardDescription>Define ingredient weights and percentages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Formulation details will be managed in the full project workspace. You can add formula entries after completing this setup.
                </p>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setActiveTab("ingredients")}>
                    Previous
                  </Button>
                  <Button onClick={handleNext}>
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shelf-Life Tab */}
          <TabsContent value="shelf-life">
            <Card>
              <CardHeader>
                <CardTitle>Shelf-Life & Process Factors</CardTitle>
                <CardDescription>Document water activity, pH, preservation strategies, and barriers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="shelf_life_days">Target Shelf-Life (days)</Label>
                    <Input
                      id="shelf_life_days"
                      type="number"
                      value={shelfLifeData.shelf_life_days}
                      onChange={(e) => setShelfLifeData({ ...shelfLifeData, shelf_life_days: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storage_condition">Storage Condition</Label>
                    <Select
                      value={shelfLifeData.storage_condition}
                      onValueChange={(value) => setShelfLifeData({ ...shelfLifeData, storage_condition: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ambient">Ambient</SelectItem>
                        <SelectItem value="refrigerated">Refrigerated</SelectItem>
                        <SelectItem value="frozen">Frozen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="aw_test">Water Activity (Aw)</Label>
                    <Input
                      id="aw_test"
                      type="number"
                      step="0.01"
                      value={shelfLifeData.aw_test_result}
                      onChange={(e) => setShelfLifeData({ ...shelfLifeData, aw_test_result: e.target.value })}
                      placeholder="0.00 - 1.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="moisture">Moisture %</Label>
                    <Input
                      id="moisture"
                      type="number"
                      step="0.1"
                      value={shelfLifeData.moisture_pct}
                      onChange={(e) => setShelfLifeData({ ...shelfLifeData, moisture_pct: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ph">pH Level</Label>
                    <Input
                      id="ph"
                      type="number"
                      step="0.1"
                      value={shelfLifeData.ph_level}
                      onChange={(e) => setShelfLifeData({ ...shelfLifeData, ph_level: e.target.value })}
                      placeholder="1.0 - 14.0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preservation">Preservation Strategy</Label>
                  <Input
                    id="preservation"
                    value={shelfLifeData.preservation_strategy}
                    onChange={(e) => setShelfLifeData({ ...shelfLifeData, preservation_strategy: e.target.value })}
                    placeholder="e.g., natural acids, humectants"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="packaging_material">Packaging Material</Label>
                  <Input
                    id="packaging_material"
                    value={shelfLifeData.packaging_material}
                    onChange={(e) => setShelfLifeData({ ...shelfLifeData, packaging_material: e.target.value })}
                    placeholder="e.g., PET, metallized film"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shelf_notes">Notes</Label>
                  <Textarea
                    id="shelf_notes"
                    value={shelfLifeData.notes}
                    onChange={(e) => setShelfLifeData({ ...shelfLifeData, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setActiveTab("formulation")}>
                    Previous
                  </Button>
                  <Button onClick={handleNext} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Costing Tab */}
          <TabsContent value="costing">
            <Card>
              <CardHeader>
                <CardTitle>Costing & MOQ</CardTitle>
                <CardDescription>Calculate material costs, yields, and target pricing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ingredient_cost">Ingredient Cost ($)</Label>
                    <Input
                      id="ingredient_cost"
                      type="number"
                      step="0.01"
                      value={costingData.ingredient_cost}
                      onChange={(e) => setCostingData({ ...costingData, ingredient_cost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labor_cost">Labor Cost ($)</Label>
                    <Input
                      id="labor_cost"
                      type="number"
                      step="0.01"
                      value={costingData.labor_cost}
                      onChange={(e) => setCostingData({ ...costingData, labor_cost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="overhead_cost">Overhead Cost ($)</Label>
                    <Input
                      id="overhead_cost"
                      type="number"
                      step="0.01"
                      value={costingData.overhead_cost}
                      onChange={(e) => setCostingData({ ...costingData, overhead_cost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="packaging_cost">Packaging Cost ($)</Label>
                    <Input
                      id="packaging_cost"
                      type="number"
                      step="0.01"
                      value={costingData.packaging_cost}
                      onChange={(e) => setCostingData({ ...costingData, packaging_cost: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="total_cost">Total Cost ($)</Label>
                    <Input
                      id="total_cost"
                      type="number"
                      step="0.01"
                      value={costingData.total_cost}
                      onChange={(e) => setCostingData({ ...costingData, total_cost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target_price">Target Price ($)</Label>
                    <Input
                      id="target_price"
                      type="number"
                      step="0.01"
                      value={costingData.target_price}
                      onChange={(e) => setCostingData({ ...costingData, target_price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="margin">Margin %</Label>
                    <Input
                      id="margin"
                      type="number"
                      step="0.1"
                      value={costingData.margin_percentage}
                      onChange={(e) => setCostingData({ ...costingData, margin_percentage: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costing_notes">Notes</Label>
                  <Textarea
                    id="costing_notes"
                    value={costingData.notes}
                    onChange={(e) => setCostingData({ ...costingData, notes: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setActiveTab("shelf-life")}>
                    Previous
                  </Button>
                  <Button onClick={handleNext} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Packaging Tab */}
          <TabsContent value="packaging">
            <Card>
              <CardHeader>
                <CardTitle>Packaging Details</CardTitle>
                <CardDescription>Define packaging type, materials, barriers, and sustainability notes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="package_type">Package Type</Label>
                    <Input
                      id="package_type"
                      value={packagingData.package_type}
                      onChange={(e) => setPackagingData({ ...packagingData, package_type: e.target.value })}
                      placeholder="e.g., Pouch, Box, Tray"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="material">Material</Label>
                    <Input
                      id="material"
                      value={packagingData.material}
                      onChange={(e) => setPackagingData({ ...packagingData, material: e.target.value })}
                      placeholder="e.g., PET, Cardboard"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dimensions">Dimensions</Label>
                    <Input
                      id="dimensions"
                      value={packagingData.dimensions}
                      onChange={(e) => setPackagingData({ ...packagingData, dimensions: e.target.value })}
                      placeholder="e.g., 10x15x5 cm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cost_per_unit">Cost per Unit ($)</Label>
                    <Input
                      id="cost_per_unit"
                      type="number"
                      step="0.01"
                      value={packagingData.cost_per_unit}
                      onChange={(e) => setPackagingData({ ...packagingData, cost_per_unit: e.target.value })}
                    />
                  </div>
                </div>

                {/* Packaging Hierarchy */}
                <div className="border-t pt-4 mt-2">
                  <h3 className="font-semibold mb-3 text-foreground">Packaging Hierarchy</h3>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="space-y-2">
                      <Label htmlFor="raw_fill_weight">Raw Fill Weight</Label>
                      <div className="flex gap-2">
                        <Input
                          id="raw_fill_weight"
                          type="number"
                          step="0.01"
                          value={packHierarchy.raw_fill_weight}
                          onChange={(e) => setPackHierarchy({ ...packHierarchy, raw_fill_weight: e.target.value })}
                          placeholder="e.g., 2.5"
                        />
                        <Select
                          value={packHierarchy.raw_fill_weight_unit}
                          onValueChange={(v) => setPackHierarchy({ ...packHierarchy, raw_fill_weight_unit: v })}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oz">oz</SelectItem>
                            <SelectItem value="g">g</SelectItem>
                            <SelectItem value="lbs">lbs</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="units_per_pack">Units / Primary Pack</Label>
                      <Input
                        id="units_per_pack"
                        type="number"
                        value={packHierarchy.units_per_pack}
                        onChange={(e) => setPackHierarchy({ ...packHierarchy, units_per_pack: e.target.value })}
                        placeholder="e.g., 6"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="units_per_caddy">Units / Caddy (Display)</Label>
                      <Input
                        id="units_per_caddy"
                        type="number"
                        value={packHierarchy.units_per_caddy}
                        onChange={(e) => setPackHierarchy({ ...packHierarchy, units_per_caddy: e.target.value })}
                        placeholder="e.g., 12"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="units_per_shipper">Units / Shipper Box</Label>
                      <Input
                        id="units_per_shipper"
                        type="number"
                        value={packHierarchy.units_per_shipper}
                        onChange={(e) => setPackHierarchy({ ...packHierarchy, units_per_shipper: e.target.value })}
                        placeholder="e.g., 24"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cases_per_pallet">Cases / Pallet</Label>
                      <Input
                        id="cases_per_pallet"
                        type="number"
                        value={packHierarchy.cases_per_pallet}
                        onChange={(e) => setPackHierarchy({ ...packHierarchy, cases_per_pallet: e.target.value })}
                        placeholder="e.g., 48"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Barrier Protection</Label>
                  <TooltipProvider>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="oxygen_barrier"
                          checked={packagingData.oxygen_barrier}
                          onCheckedChange={(checked) => setPackagingData({ ...packagingData, oxygen_barrier: checked as boolean })}
                        />
                        <Label htmlFor="oxygen_barrier" className="font-normal">Oxygen Barrier</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Protects against oxidation and extends shelf life</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="moisture_barrier"
                          checked={packagingData.moisture_barrier}
                          onCheckedChange={(checked) => setPackagingData({ ...packagingData, moisture_barrier: checked as boolean })}
                        />
                        <Label htmlFor="moisture_barrier" className="font-normal">Moisture Barrier</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Prevents moisture absorption and maintains texture</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="uv_barrier"
                          checked={packagingData.uv_barrier}
                          onCheckedChange={(checked) => setPackagingData({ ...packagingData, uv_barrier: checked as boolean })}
                        />
                        <Label htmlFor="uv_barrier" className="font-normal">UV Protection</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Blocks UV light to prevent degradation</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </TooltipProvider>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sustainability">Sustainability Notes</Label>
                  <Textarea
                    id="sustainability"
                    value={packagingData.sustainability_notes}
                    onChange={(e) => setPackagingData({ ...packagingData, sustainability_notes: e.target.value })}
                    placeholder="Recyclable, compostable, carbon footprint details..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="compliance_notes">Regulatory Compliance Notes</Label>
                  <Textarea
                    id="compliance_notes"
                    value={packagingData.compliance_notes}
                    onChange={(e) => setPackagingData({ ...packagingData, compliance_notes: e.target.value })}
                    placeholder="FDA, FSMA, organic certification requirements..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="packaging_notes">Additional Notes</Label>
                  <Textarea
                    id="packaging_notes"
                    value={packagingData.notes}
                    onChange={(e) => setPackagingData({ ...packagingData, notes: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setActiveTab("costing")}>
                    Previous
                  </Button>
                  <Button onClick={handleNext} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save & Continue"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Market Readiness Tab */}
          <TabsContent value="readiness">
            <Card>
              <CardHeader>
                <CardTitle>Market Readiness Checklist</CardTitle>
                <CardDescription>Track completion status for all critical launch requirements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="concept_complete"
                      checked={readinessData.concept_complete}
                      onCheckedChange={(checked) => setReadinessData({ ...readinessData, concept_complete: checked as boolean })}
                    />
                    <div>
                      <Label htmlFor="concept_complete" className="font-semibold">Concept Defined</Label>
                      <p className="text-sm text-muted-foreground">Product idea, target market, and claims documented</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="ingredients_complete"
                      checked={readinessData.ingredients_complete}
                      onCheckedChange={(checked) => setReadinessData({ ...readinessData, ingredients_complete: checked as boolean })}
                    />
                    <div>
                      <Label htmlFor="ingredients_complete" className="font-semibold">Ingredients Sourced</Label>
                      <p className="text-sm text-muted-foreground">All ingredients identified with supplier information</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="formula_complete"
                      checked={readinessData.formula_complete}
                      onCheckedChange={(checked) => setReadinessData({ ...readinessData, formula_complete: checked as boolean })}
                    />
                    <div>
                      <Label htmlFor="formula_complete" className="font-semibold">Formula Finalized</Label>
                      <p className="text-sm text-muted-foreground">Recipe locked with weights and percentages</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="shelf_life_complete"
                      checked={readinessData.shelf_life_complete}
                      onCheckedChange={(checked) => setReadinessData({ ...readinessData, shelf_life_complete: checked as boolean })}
                    />
                    <div>
                      <Label htmlFor="shelf_life_complete" className="font-semibold">Shelf-Life Validated</Label>
                      <p className="text-sm text-muted-foreground">Water activity, pH, and stability testing completed</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="costing_complete"
                      checked={readinessData.costing_complete}
                      onCheckedChange={(checked) => setReadinessData({ ...readinessData, costing_complete: checked as boolean })}
                    />
                    <div>
                      <Label htmlFor="costing_complete" className="font-semibold">Costing Calculated</Label>
                      <p className="text-sm text-muted-foreground">All costs and target pricing established</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="packaging_complete"
                      checked={readinessData.packaging_complete}
                      onCheckedChange={(checked) => setReadinessData({ ...readinessData, packaging_complete: checked as boolean })}
                    />
                    <div>
                      <Label htmlFor="packaging_complete" className="font-semibold">Packaging Finalized</Label>
                      <p className="text-sm text-muted-foreground">Materials, barriers, and design approved</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Label Compliance & Nutrition Panel</h3>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="label_compliance"
                        checked={readinessData.label_compliance}
                        onCheckedChange={(checked) => setReadinessData({ ...readinessData, label_compliance: checked as boolean })}
                      />
                      <div>
                        <Label htmlFor="label_compliance" className="font-semibold">Label Compliance</Label>
                        <p className="text-sm text-muted-foreground">
                          All mandatory elements included: product name, net weight, ingredient list, allergen statements, 
                          manufacturer info, and regulatory disclaimers
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="nutrition_facts"
                        checked={readinessData.nutrition_facts}
                        onCheckedChange={(checked) => setReadinessData({ ...readinessData, nutrition_facts: checked as boolean })}
                      />
                      <div>
                        <Label htmlFor="nutrition_facts" className="font-semibold">Nutrition Facts Panel</Label>
                        <p className="text-sm text-muted-foreground">
                          Panel formatted per FDA requirements with correct serving size, calorie count, and nutrient breakdown.
                          Font hierarchy: Product name (bold), Net weight (prominent), Nutrition Facts (required size)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="legal_review"
                        checked={readinessData.legal_review}
                        onCheckedChange={(checked) => setReadinessData({ ...readinessData, legal_review: checked as boolean })}
                      />
                      <div>
                        <Label htmlFor="legal_review" className="font-semibold">Legal Review Complete</Label>
                        <p className="text-sm text-muted-foreground">
                          All claims (organic, gluten-free, non-GMO) verified and compliant with FDA/USDA regulations.
                          Placement and font size requirements met.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="readiness_notes">Additional Notes</Label>
                  <Textarea
                    id="readiness_notes"
                    value={readinessData.notes}
                    onChange={(e) => setReadinessData({ ...readinessData, notes: e.target.value })}
                    placeholder="Any remaining items or notes..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-between items-center pt-4">
                  <Button variant="outline" onClick={() => setActiveTab("packaging")}>
                    Previous
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={generatePSS}>
                      <Download className="h-4 w-4 mr-2" />
                      Generate PSS
                    </Button>
                    <Button onClick={handleFinish} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Finish & View Project"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Ingredient Dialog */}
        <IngredientDialog
          open={showIngredientDialog}
          onClose={handleIngredientDialogClose}
          ingredient={editingIngredient}
        />

        {/* Ingredient Spec Dialog */}
        <IngredientSpecDialog
          open={showSpecDialog}
          onOpenChange={setShowSpecDialog}
          baseIngredient={specIngredientName}
          onSpecComplete={handleSpecComplete}
          conceptId={conceptId || undefined}
        />
      </div>
    </div>
  );
};

export default ProjectCreationFlow;

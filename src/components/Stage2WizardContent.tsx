import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowRight, CheckCircle, Eye, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";

type CompanyStage = "startup" | "new" | "emerging" | "established";

interface WizardData {
  projectType: string;
  customerName: string;
  productName: string;
  developmentApproach: string;
  finishedForm: string[];
  isNutraceutical: boolean;
  flavorType: string;
  intendedApplication: string[];
  additionalRequirements: string[];
  packagingReadiness: string;
  primaryPackagingVessel: string;
  primaryPackagingOther: string;
  weightPerUnit: string;
  weightPerUnitUnit: string;
  unitDimensionL: string;
  unitDimensionW: string;
  unitDimensionH: string;
  unitDimensionUnit: string;
  unitsPerPrimaryPack: string;
  netWeightPerPrimaryPack: string;
  netWeightPerPrimaryPackUnit: string;
  secondaryPackaging: string;
  secondaryPackagingOther: string;
  unitsPerVessel: string;
  artworkReadiness: string;
  labelResponsibility: string;
  masterCartonRequirements: string;
  palletsRequired: string;
  shippingTBD: boolean;
  targetDate: string;
  priceTargetPerUnit: string;
  annualVolume: string;
  orderQuantity: string;
  orderFrequency: string;
  warehousingNeeds: string[];
  technicalContactName: string;
  technicalContactEmail: string;
  technicalContactPhone: string;
  sameAsInitialContact: boolean;
  additionalProjectInfo: string;
}

const initialData: WizardData = {
  projectType: "",
  customerName: "",
  productName: "",
  developmentApproach: "",
  finishedForm: [],
  isNutraceutical: false,
  flavorType: "",
  intendedApplication: [],
  additionalRequirements: [],
  packagingReadiness: "",
  primaryPackagingVessel: "",
  primaryPackagingOther: "",
  weightPerUnit: "",
  weightPerUnitUnit: "oz",
  unitDimensionL: "",
  unitDimensionW: "",
  unitDimensionH: "",
  unitDimensionUnit: "in",
  unitsPerPrimaryPack: "",
  netWeightPerPrimaryPack: "",
  netWeightPerPrimaryPackUnit: "oz",
  secondaryPackaging: "",
  secondaryPackagingOther: "",
  unitsPerVessel: "",
  artworkReadiness: "",
  labelResponsibility: "",
  masterCartonRequirements: "",
  palletsRequired: "",
  shippingTBD: false,
  targetDate: "",
  priceTargetPerUnit: "",
  annualVolume: "",
  orderQuantity: "",
  orderFrequency: "",
  warehousingNeeds: [],
  technicalContactName: "",
  technicalContactEmail: "",
  technicalContactPhone: "",
  sameAsInitialContact: false,
  additionalProjectInfo: "",
};

const STEPS = [
  { id: 1, title: "Project Type", section: "Project Basics" },
  { id: 2, title: "Customer & Product Name", section: "Project Basics" },
  { id: 3, title: "Development Approach", section: "Project Basics" },
  { id: 4, title: "Finished Form", section: "Product Type / Status" },
  { id: 5, title: "Nutraceutical", section: "Product Type / Status" },
  { id: 6, title: "Flavor Type", section: "Product Type / Status" },
  { id: 7, title: "Intended Application", section: "Product Type / Status" },
  { id: 8, title: "Additional Requirements", section: "Claims / Certifications" },
  { id: 9, title: "Packaging Readiness", section: "Packaging" },
  { id: 10, title: "Primary Packaging (Food-Contact)", section: "Packaging" },
  { id: 11, title: "Secondary Packaging", section: "Packaging" },
  { id: 12, title: "Artwork & Labels", section: "Packaging" },
  { id: 13, title: "Shipping", section: "Packaging" },
  { id: 14, title: "Target Date & Pricing", section: "Volumes / Timing / Ops" },
  { id: 15, title: "Volume & Frequency", section: "Volumes / Timing / Ops" },
  { id: 16, title: "Warehousing", section: "Volumes / Timing / Ops" },
  { id: 17, title: "Technical Contact", section: "Contact" },
  { id: 18, title: "Review & Submit", section: "Review" },
];

const TOTAL_STEPS = STEPS.length;

const PreviewField = ({ label, value, step, onEdit }: { label: string; value: string; step: number; onEdit: (step: number) => void }) => (
  <div className="flex items-center justify-between py-1 group">
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="shrink-0" style={{ color: '#8B7355' }}>{label}:</span>
      <span className="truncate">{value || '—'}</span>
    </div>
    <button
      onClick={() => onEdit(step)}
      className="shrink-0 ml-2 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity p-1 rounded hover:bg-accent/10"
      title={`Edit ${label}`}
    >
      <Pencil className="w-3 h-3" style={{ color: '#C89B3C' }} />
    </button>
  </div>
);

interface Stage2WizardContentProps {
  companyStage: CompanyStage;
  isStartup: boolean;
}

const Stage2WizardContent = ({ companyStage, isStartup }: Stage2WizardContentProps) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardData>(initialData);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingFromPreview, setEditingFromPreview] = useState(false);
  const goToEditStep = (step: number) => {
    setShowPreviewModal(false);
    setEditingFromPreview(true);
    setCurrentStep(step);
  };

  const progressPercent = (currentStep / TOTAL_STEPS) * 100;

  // Validation functions
  const validateContactName = (name: string): string | null => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return "Name must be at least 2 characters";
    if (/^\d+$/.test(trimmed)) return "Name cannot be only numbers";
    if (!/[a-zA-Z]/.test(trimmed)) return "Name must contain letters";
    return null;
  };

  const validateEmail = (email: string): string | null => {
    const trimmed = email.trim();
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      return "Email must contain @ and .";
    }
    if (trimmed.indexOf("@") > trimmed.lastIndexOf(".")) {
      return "Invalid email format";
    }
    return null;
  };

  const validatePhone = (phone: string): string | null => {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length !== 10) return "Phone must be exactly 10 digits";
    return null;
  };

  const validateAdditionalRequirements = (): string | null => {
    if (formData.additionalRequirements.length === 0) {
      return "Please select at least one option or 'None of the above'";
    }
    return null;
  };

  const isStepValid = (): boolean => {
    switch (currentStep) {
      case 1:
        return formData.projectType.trim().length > 0;
      case 2:
        return formData.customerName.trim().length > 0 && formData.productName.trim().length > 0;
      case 3:
        return formData.developmentApproach.trim().length > 0;
      case 4:
        return formData.finishedForm.length > 0;
      case 5:
        // isNutraceutical is a boolean, always has a value (default false = "No")
        return true;
      case 6:
        return formData.flavorType.trim().length > 0;
      case 7:
        return formData.intendedApplication.length > 0;
      case 8:
        return formData.additionalRequirements.length > 0;
      case 9:
        return formData.packagingReadiness.trim().length > 0;
      case 10: {
        // Primary Packaging (Food-Contact) screen
        const primaryValid = formData.primaryPackagingVessel.trim().length > 0 && 
          (formData.primaryPackagingVessel !== "Other (text)" || formData.primaryPackagingOther.trim().length > 0);
        // If "Not determined yet" is selected, skip numeric field validation
        if (formData.primaryPackagingVessel === "Not determined yet") {
          return true;
        }
        const weightValid = formData.weightPerUnit.trim().length > 0;
        const dimensionsValid = formData.unitDimensionL.trim().length > 0 && 
          formData.unitDimensionW.trim().length > 0 && 
          formData.unitDimensionH.trim().length > 0;
        const unitsPerPackValid = formData.unitsPerPrimaryPack.trim().length > 0;
        const netWeightValid = formData.netWeightPerPrimaryPack.trim().length > 0;
        return primaryValid && weightValid && dimensionsValid && unitsPerPackValid && netWeightValid;
      }
      case 11: {
        // Secondary Packaging screen
        const secondaryValid = formData.secondaryPackaging.trim().length > 0 && 
          (formData.secondaryPackaging !== "Other (text)" || formData.secondaryPackagingOther.trim().length > 0);
        // If "Not determined yet" or "None" is selected, skip units per vessel validation
        if (formData.secondaryPackaging === "Not determined yet" || formData.secondaryPackaging === "None") {
          return secondaryValid;
        }
        return secondaryValid && formData.unitsPerVessel.trim().length > 0;
      }
      case 12:
        return formData.artworkReadiness.trim().length > 0 && formData.labelResponsibility.trim().length > 0;
      case 13:
        return formData.masterCartonRequirements.trim().length > 0 && formData.palletsRequired.trim().length > 0;
      case 14:
        return formData.targetDate.trim().length > 0 && formData.priceTargetPerUnit.trim().length > 0;
      case 15:
        return formData.annualVolume.trim().length > 0 && formData.orderQuantity.trim().length > 0 && formData.orderFrequency.trim().length > 0;
      case 16:
        return formData.warehousingNeeds.length > 0;
      case 17: {
        if (formData.sameAsInitialContact) return true;
        const nameError = validateContactName(formData.technicalContactName);
        const emailError = validateEmail(formData.technicalContactEmail);
        const phoneError = validatePhone(formData.technicalContactPhone);
        return !nameError && !emailError && !phoneError;
      }
      default:
        return true;
    }
  };

  const getStepValidationErrors = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    
    switch (currentStep) {
      case 1:
        if (!formData.projectType.trim()) errors.projectType = "Please select a project type";
        break;
      case 2:
        if (!formData.customerName.trim()) errors.customerName = "Customer name is required";
        if (!formData.productName.trim()) errors.productName = "Product name is required";
        break;
      case 3:
        if (!formData.developmentApproach.trim()) errors.developmentApproach = "Please select a development approach";
        break;
      case 4:
        if (formData.finishedForm.length === 0) errors.finishedForm = "Please select at least one option";
        break;
      case 6:
        if (!formData.flavorType.trim()) errors.flavorType = "Please select a flavor type";
        break;
      case 7:
        if (formData.intendedApplication.length === 0) errors.intendedApplication = "Please select at least one option";
        break;
      case 8:
        const reqError = validateAdditionalRequirements();
        if (reqError) errors.additionalRequirements = reqError;
        break;
      case 9:
        if (!formData.packagingReadiness.trim()) errors.packagingReadiness = "Please select a packaging readiness status";
        break;
      case 10:
        // Primary Packaging (Food-Contact) screen
        if (!formData.primaryPackagingVessel.trim()) errors.primaryPackagingVessel = "Primary packaging type is required";
        if (formData.primaryPackagingVessel === "Other (text)" && !formData.primaryPackagingOther.trim()) errors.primaryPackagingOther = "Please specify primary packaging";
        // Skip numeric field validation if "Not determined yet" is selected
        if (formData.primaryPackagingVessel !== "Not determined yet") {
          if (!formData.weightPerUnit.trim()) errors.weightPerUnit = "Weight per unit is required";
          else if (parseFloat(formData.weightPerUnit) < 0) errors.weightPerUnit = "Value cannot be negative";
          if (!formData.unitDimensionL.trim()) errors.unitDimensionL = "Length is required";
          else if (parseFloat(formData.unitDimensionL) < 0) errors.unitDimensionL = "Value cannot be negative";
          if (!formData.unitDimensionW.trim()) errors.unitDimensionW = "Width is required";
          else if (parseFloat(formData.unitDimensionW) < 0) errors.unitDimensionW = "Value cannot be negative";
          if (!formData.unitDimensionH.trim()) errors.unitDimensionH = "Height is required";
          else if (parseFloat(formData.unitDimensionH) < 0) errors.unitDimensionH = "Value cannot be negative";
          if (!formData.unitsPerPrimaryPack.trim()) errors.unitsPerPrimaryPack = "Units per primary pack is required";
          else if (parseFloat(formData.unitsPerPrimaryPack) < 0) errors.unitsPerPrimaryPack = "Value cannot be negative";
          if (!formData.netWeightPerPrimaryPack.trim()) errors.netWeightPerPrimaryPack = "Net weight per primary pack is required";
        }
        break;
      case 11:
        // Secondary Packaging screen
        if (!formData.secondaryPackaging.trim()) errors.secondaryPackaging = "Secondary packaging is required";
        if (formData.secondaryPackaging === "Other (text)" && !formData.secondaryPackagingOther.trim()) errors.secondaryPackagingOther = "Please specify secondary packaging";
        // Skip units per vessel validation if "Not determined yet" or "None" is selected
        if (formData.secondaryPackaging !== "Not determined yet" && formData.secondaryPackaging !== "None") {
          if (!formData.unitsPerVessel.trim()) errors.unitsPerVessel = "Units per vessel is required";
        }
        break;
      case 12:
        if (!formData.artworkReadiness.trim()) errors.artworkReadiness = "Please select artwork readiness status";
        if (!formData.labelResponsibility.trim()) errors.labelResponsibility = "Please select who is responsible for labels";
        break;
      case 13:
        // Skip validation if TBD is selected
        if (!formData.shippingTBD) {
          if (!formData.masterCartonRequirements.trim()) errors.masterCartonRequirements = "Master carton / shipper case requirements is required";
          if (!formData.palletsRequired.trim()) errors.palletsRequired = "Pallets required is required";
        }
        break;
      case 14:
        if (!formData.targetDate.trim()) errors.targetDate = "Target launch date is required";
        else if (formData.targetDate < new Date().toISOString().split('T')[0]) errors.targetDate = "Target date cannot be in the past";
        if (!formData.priceTargetPerUnit.trim()) errors.priceTargetPerUnit = "Price target is required";
        break;
      case 15:
        if (!formData.annualVolume.trim()) errors.annualVolume = "Annual volume is required";
        if (!formData.orderQuantity.trim()) errors.orderQuantity = "Order quantity is required";
        if (!formData.orderFrequency.trim()) errors.orderFrequency = "Order frequency is required";
        break;
      case 16:
        if (formData.warehousingNeeds.length === 0) errors.warehousingNeeds = "Please select at least one option";
        break;
      case 17:
        if (!formData.sameAsInitialContact) {
          const nameError = validateContactName(formData.technicalContactName);
          const emailError = validateEmail(formData.technicalContactEmail);
          const phoneError = validatePhone(formData.technicalContactPhone);
          if (nameError) errors.technicalContactName = nameError;
          if (emailError) errors.technicalContactEmail = emailError;
          if (phoneError) errors.technicalContactPhone = phoneError;
        }
        break;
    }
    
    return errors;
  };

  // Load lead data from localStorage and auto-populate fields
  useEffect(() => {
    const savedId = localStorage.getItem("stage2SubmissionId");
    const savedLeadData = localStorage.getItem("prfLeadData");
    
    if (savedId) {
      loadDraft(savedId);
    } else {
      createNewSubmission();
    }
    
    // Auto-populate customerName from lead data if it's empty
    if (savedLeadData && !formData.customerName) {
      try {
        const leadData = JSON.parse(savedLeadData);
        if (leadData.companyName) {
          setFormData(prev => ({ ...prev, customerName: leadData.companyName }));
        }
      } catch (e) {
        console.error("Error parsing lead data:", e);
      }
    }
  }, []);

  // Auto-recalculate net weight per primary pack
  useEffect(() => {
    const weight = parseFloat(formData.weightPerUnit);
    const units = parseFloat(formData.unitsPerPrimaryPack);
    if (!isNaN(weight) && !isNaN(units) && weight > 0 && units > 0) {
      const calculated = (weight * units).toString();
      if (formData.netWeightPerPrimaryPack !== calculated || formData.netWeightPerPrimaryPackUnit !== formData.weightPerUnitUnit) {
        setFormData(prev => ({
          ...prev,
          netWeightPerPrimaryPack: calculated,
          netWeightPerPrimaryPackUnit: prev.weightPerUnitUnit,
        }));
      }
    }
  }, [formData.weightPerUnit, formData.unitsPerPrimaryPack, formData.weightPerUnitUnit]);

  const createNewSubmission = async () => {
    const { data, error } = await supabase
      .from("stage2_prf_submissions")
      .insert([{
        company_stage: companyStage,
        status: "draft" as const,
        data_json: JSON.parse(JSON.stringify(initialData)),
      }])
      .select()
      .single();

    if (error) {
      console.error("Error creating submission:", error);
      return;
    }

    if (data) {
      setSubmissionId(data.id);
      localStorage.setItem("stage2SubmissionId", data.id);
    }
  };

  const loadDraft = async (id: string) => {
    const { data, error } = await supabase
      .from("stage2_prf_submissions")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      localStorage.removeItem("stage2SubmissionId");
      createNewSubmission();
      return;
    }

    if (data.status === "submitted") {
      localStorage.removeItem("stage2SubmissionId");
      createNewSubmission();
      return;
    }

    setSubmissionId(data.id);
    if (data.data_json && typeof data.data_json === "object") {
      setFormData({ ...initialData, ...(data.data_json as Record<string, any>) });
    }
  };

  const autoSave = async (updatedData: WizardData) => {
    if (!submissionId) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from("stage2_prf_submissions")
      .update({ data_json: JSON.parse(JSON.stringify(updatedData)) })
      .eq("id", submissionId);

    if (error) {
      console.error("Auto-save error:", error);
    }
    setIsSaving(false);
  };

  const updateFormData = (updates: Partial<WizardData>) => {
    const newData = { ...formData, ...updates };
    setFormData(newData);
    autoSave(newData);
  };

  const handleCheckboxChange = (field: keyof WizardData, value: string, checked: boolean) => {
    const currentValues = formData[field] as string[];
    let newValues: string[];
    
    if (checked) {
      newValues = [...currentValues, value];
    } else {
      newValues = currentValues.filter(v => v !== value);
    }
    
    updateFormData({ [field]: newValues });
    
    // Clear validation error when user makes a selection
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNext = () => {
    const errors = getStepValidationErrors();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    if (editingFromPreview) {
      setEditingFromPreview(false);
      setCurrentStep(TOTAL_STEPS);
      setShowPreviewModal(true);
      return;
    }
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!submissionId) return;

    const { error } = await supabase
      .from("stage2_prf_submissions")
      .update({ 
        status: "submitted",
        submitted_at: new Date().toISOString(),
        data_json: JSON.parse(JSON.stringify(formData))
      })
      .eq("id", submissionId);

    if (error) {
      toast({
        title: "Submission failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Insert into prf_submissions with explicit columns
    const { error: prfError } = await supabase
      .from("prf_submissions" as any)
      .insert([{
        company_stage: companyStage,
        founder_name: formData.technicalContactName || null,
        company_name: formData.customerName || null,
        email: formData.technicalContactEmail || null,
        phone: formData.technicalContactPhone || null,
        project_type: formData.projectType || null,
        product_name: formData.productName || null,
        development_approach: formData.developmentApproach || null,
        finished_form: formData.finishedForm,
        is_nutraceutical: formData.isNutraceutical,
        flavor_type: formData.flavorType || null,
        intended_application: formData.intendedApplication,
        additional_requirements: formData.additionalRequirements,
        packaging_readiness: formData.packagingReadiness || null,
        primary_packaging_vessel: formData.primaryPackagingVessel || null,
        primary_packaging_other: formData.primaryPackagingOther || null,
        weight_per_unit: formData.weightPerUnit || null,
        weight_per_unit_unit: formData.weightPerUnitUnit || null,
        unit_dimension_l: formData.unitDimensionL || null,
        unit_dimension_w: formData.unitDimensionW || null,
        unit_dimension_h: formData.unitDimensionH || null,
        unit_dimension_unit: formData.unitDimensionUnit || null,
        units_per_primary_pack: formData.unitsPerPrimaryPack || null,
        net_weight_per_primary_pack: formData.netWeightPerPrimaryPack || null,
        net_weight_per_primary_pack_unit: formData.netWeightPerPrimaryPackUnit || null,
        secondary_packaging: formData.secondaryPackaging || null,
        secondary_packaging_other: formData.secondaryPackagingOther || null,
        units_per_vessel: formData.unitsPerVessel || null,
        artwork_readiness: formData.artworkReadiness || null,
        label_responsibility: formData.labelResponsibility || null,
        master_carton_requirements: formData.masterCartonRequirements || null,
        pallets_required: formData.palletsRequired || null,
        shipping_tbd: formData.shippingTBD,
        target_date: formData.targetDate || null,
        price_target_per_unit: formData.priceTargetPerUnit || null,
        annual_volume: formData.annualVolume || null,
        order_quantity: formData.orderQuantity || null,
        order_frequency: formData.orderFrequency || null,
        warehousing_needs: formData.warehousingNeeds,
        additional_project_info: formData.additionalProjectInfo || null,
        stage2_submission_id: submissionId,
      }]);

    if (prfError) {
      console.error("PRF submissions insert error:", prfError);
      // Don't block — the stage2 submission already succeeded
    }

    // Send confirmation email to INITIAL contact (non-blocking)
    const initialLeadData = localStorage.getItem("prfLeadData");
    let initialEmail = "";
    let initialName = "";
    if (initialLeadData) {
      try {
        const parsed = JSON.parse(initialLeadData);
        initialEmail = parsed.email || "";
        initialName = parsed.fullName || "";
      } catch (e) { /* ignore */ }
    }
    const emailRecipient = initialEmail || formData.technicalContactEmail;
    if (emailRecipient) {
      supabase.functions.invoke("send-prf-confirmation", {
        body: {
          recipientEmail: emailRecipient,
          founderName: initialName || formData.technicalContactName || null,
          companyName: formData.customerName || null,
          productName: formData.productName || null,
          projectType: formData.projectType || null,
        },
      }).catch((emailErr) => {
        console.error("PRF confirmation email error:", emailErr);
      });
    }

    localStorage.removeItem("stage2SubmissionId");
    setIsSubmitted(true);
    toast({
      title: "PRF Submitted Successfully",
      description: "Our team will review and follow up with you.",
    });
  };

  if (isSubmitted) {
    return (
      <div
        className="min-h-screen flex flex-col relative"
        style={{
          backgroundImage: 'url(/bakery-workspace-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(44, 24, 16, 0.7)' }} />

        <header className="relative z-10 px-6 py-4 border-b border-white/10 backdrop-blur-sm" style={{ backgroundColor: 'rgba(44, 24, 16, 0.3)' }}>
          <div className="max-w-2xl mx-auto flex items-center justify-center">
            <img src={logo} alt="Logo" className="h-10" />
          </div>
        </header>

        <main className="relative z-10 flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-lg">
            <CardContent className="pt-8 pb-8">
              <div className="text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-semibold" style={{ color: '#2C1810' }}>
                  Thank You!
                </h2>
                <p className="text-sm" style={{ color: '#8B7355' }}>
                  Thank you — we'll review your project and follow up with you shortly.
                </p>
                <Button
                  onClick={() => navigate("/")}
                  className="mt-4 bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white"
                >
                  Return to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const renderStep = () => {
    const currentStepInfo = STEPS[currentStep - 1];

    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                What type of project is this? <span className="text-red-500">*</span>
              </h2>
            </div>
            <RadioGroup
              value={formData.projectType}
              onValueChange={(value) => {
                updateFormData({ projectType: value });
                if (validationErrors.projectType) {
                  setValidationErrors(prev => ({ ...prev, projectType: '' }));
                }
              }}
              className="space-y-3"
            >
              {["New Project", "Project Change / Revision"].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.projectType === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.projectType === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => {
                    updateFormData({ projectType: option });
                    if (validationErrors.projectType) {
                      setValidationErrors(prev => ({ ...prev, projectType: '' }));
                    }
                  }}
                >
                  <RadioGroupItem value={option} id={option} />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {validationErrors.projectType && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.projectType}</p>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Customer & Product Information
              </h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="customerName" style={{ color: '#2C1810' }}>
                  Customer Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => {
                    updateFormData({ customerName: e.target.value });
                    if (validationErrors.customerName) {
                      setValidationErrors(prev => ({ ...prev, customerName: '' }));
                    }
                  }}
                  placeholder="Your company name"
                  className={`mt-1 ${validationErrors.customerName ? 'border-red-500' : ''}`}
                />
                {validationErrors.customerName && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.customerName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="productName" style={{ color: '#2C1810' }}>
                  Product Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="productName"
                  value={formData.productName}
                  onChange={(e) => {
                    updateFormData({ productName: e.target.value });
                    if (validationErrors.productName) {
                      setValidationErrors(prev => ({ ...prev, productName: '' }));
                    }
                  }}
                  placeholder="Name of the product"
                  className={`mt-1 ${validationErrors.productName ? 'border-red-500' : ''}`}
                />
                {validationErrors.productName && (
                  <p className="text-red-500 text-sm mt-1">{validationErrors.productName}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Development Approach <span className="text-red-500">*</span>
              </h2>
              {isStartup && (
                <p className="text-sm" style={{ color: '#8B7355' }}>
                  This helps us understand your starting point.
                </p>
              )}
            </div>
            <RadioGroup
              value={formData.developmentApproach}
              onValueChange={(value) => {
                updateFormData({ developmentApproach: value });
                if (validationErrors.developmentApproach) {
                  setValidationErrors(prev => ({ ...prev, developmentApproach: '' }));
                }
              }}
              className="space-y-3"
            >
              {[
                "Match Existing Product",
                "Match & Improve Existing Product",
                "Develop from Scratch"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.developmentApproach === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.developmentApproach === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => {
                    updateFormData({ developmentApproach: option });
                    if (validationErrors.developmentApproach) {
                      setValidationErrors(prev => ({ ...prev, developmentApproach: '' }));
                    }
                  }}
                >
                  <RadioGroupItem value={option} id={option} />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {validationErrors.developmentApproach && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.developmentApproach}</p>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Finished Form <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Select all that apply
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Baked / Ready to Eat",
                "Frozen (Par-baked, Raw, etc.)",
                "Bulk Pack",
                "Retail Pack",
                "Foodservice Pack"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.finishedForm.includes(option) ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.finishedForm.includes(option) ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => handleCheckboxChange("finishedForm", option, !formData.finishedForm.includes(option))}
                >
                  <Checkbox
                    id={option}
                    checked={formData.finishedForm.includes(option)}
                    onCheckedChange={(checked) => handleCheckboxChange("finishedForm", option, checked as boolean)}
                  />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {validationErrors.finishedForm && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.finishedForm}</p>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Is this product a nutraceutical?
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Products with added vitamins, supplements, or functional health claims
              </p>
            </div>
            <RadioGroup
              value={formData.isNutraceutical ? "yes" : "no"}
              onValueChange={(value) => updateFormData({ isNutraceutical: value === "yes" })}
              className="space-y-3"
            >
              {[
                { value: "no", label: "No" },
                { value: "yes", label: "Yes" }
              ].map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: (formData.isNutraceutical ? "yes" : "no") === option.value ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: (formData.isNutraceutical ? "yes" : "no") === option.value ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => updateFormData({ isNutraceutical: option.value === "yes" })}
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label htmlFor={option.value} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Flavor Type <span className="text-red-500">*</span>
              </h2>
            </div>
            <RadioGroup
              value={formData.flavorType}
              onValueChange={(value) => {
                updateFormData({ flavorType: value });
                if (validationErrors.flavorType) {
                  setValidationErrors(prev => ({ ...prev, flavorType: '' }));
                }
              }}
              className="space-y-3"
            >
              {[
                "Natural",
                "Artificial",
                "Natural + Artificial"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.flavorType === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.flavorType === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => {
                    updateFormData({ flavorType: option });
                    if (validationErrors.flavorType) {
                      setValidationErrors(prev => ({ ...prev, flavorType: '' }));
                    }
                  }}
                >
                  <RadioGroupItem value={option} id={option} />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {validationErrors.flavorType && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.flavorType}</p>
            )}
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Intended Application <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Select all that apply
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Retail",
                "Foodservice",
                "Other"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.intendedApplication.includes(option) ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.intendedApplication.includes(option) ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => handleCheckboxChange("intendedApplication", option, !formData.intendedApplication.includes(option))}
                >
                  <Checkbox
                    id={option}
                    checked={formData.intendedApplication.includes(option)}
                    onCheckedChange={(checked) => handleCheckboxChange("intendedApplication", option, checked as boolean)}
                  />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {validationErrors.intendedApplication && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.intendedApplication}</p>
            )}
          </div>
        );

      case 8:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Additional Requirements <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Select all certifications or restrictions that apply, or select "None of the above"
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Kosher",
                "Allergen Restrictions",
                "Organic",
                "Gluten Free",
                "Non-GMO",
                "Export Requirements",
                "None of the above"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.additionalRequirements.includes(option) ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.additionalRequirements.includes(option) ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => handleCheckboxChange("additionalRequirements", option, !formData.additionalRequirements.includes(option))}
                >
                  <Checkbox
                    id={option}
                    checked={formData.additionalRequirements.includes(option)}
                    onCheckedChange={(checked) => handleCheckboxChange("additionalRequirements", option, checked as boolean)}
                  />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {validationErrors.additionalRequirements && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.additionalRequirements}</p>
            )}
          </div>
        );

      case 9:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Packaging Readiness <span className="text-red-500">*</span>
              </h2>
              {isStartup && (
                <p className="text-sm" style={{ color: '#8B7355' }}>
                  It's okay if you're still figuring this out!
                </p>
              )}
            </div>
            <RadioGroup
              value={formData.packagingReadiness}
              onValueChange={(value) => {
                updateFormData({ packagingReadiness: value });
                if (validationErrors.packagingReadiness) {
                  setValidationErrors(prev => ({ ...prev, packagingReadiness: '' }));
                }
              }}
              className="space-y-3"
            >
              {[
                "Ready / Packaging Secured",
                "In Process",
                "Need Assistance"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.packagingReadiness === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.packagingReadiness === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => {
                    updateFormData({ packagingReadiness: option });
                    if (validationErrors.packagingReadiness) {
                      setValidationErrors(prev => ({ ...prev, packagingReadiness: '' }));
                    }
                  }}
                >
                  <RadioGroupItem value={option} id={option} />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {validationErrors.packagingReadiness && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.packagingReadiness}</p>
            )}
          </div>
        );

      case 10:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Primary Packaging (Food-Contact) <span className="text-red-500">*</span>
              </h2>
            </div>
            <div className="space-y-6">
              {/* 1) Primary packaging type */}
              <div>
                <Label className="mb-3 block" style={{ color: '#2C1810' }}>
                  Primary Packaging Type <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={formData.primaryPackagingVessel}
                  onValueChange={(value) => {
                    updateFormData({ primaryPackagingVessel: value, primaryPackagingOther: value !== "Other (text)" ? "" : formData.primaryPackagingOther });
                    if (validationErrors.primaryPackagingVessel) {
                      setValidationErrors(prev => ({ ...prev, primaryPackagingVessel: '' }));
                    }
                  }}
                  className="space-y-3"
                >
                  {[
                    "Flow wrap",
                    "Pouch (non-resealable)",
                    "Resealable pouch",
                    "Bag-in-box",
                    "Clamshell",
                    "Tray + shrink",
                    "Other (text)",
                    "Not determined yet"
                  ].map((option) => (
                    <div
                      key={option}
                      className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                      style={{
                        borderColor: formData.primaryPackagingVessel === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                        backgroundColor: formData.primaryPackagingVessel === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                      }}
                      onClick={() => {
                        updateFormData({ primaryPackagingVessel: option, primaryPackagingOther: option !== "Other (text)" ? "" : formData.primaryPackagingOther });
                        if (validationErrors.primaryPackagingVessel) {
                          setValidationErrors(prev => ({ ...prev, primaryPackagingVessel: '' }));
                        }
                      }}
                    >
                      <RadioGroupItem value={option} id={`primary-${option}`} />
                      <Label htmlFor={`primary-${option}`} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {formData.primaryPackagingVessel === "Other (text)" && (
                  <Input
                    id="primaryPackagingOther"
                    value={formData.primaryPackagingOther}
                    onChange={(e) => {
                      updateFormData({ primaryPackagingOther: e.target.value });
                      if (validationErrors.primaryPackagingOther) {
                        setValidationErrors(prev => ({ ...prev, primaryPackagingOther: '' }));
                      }
                    }}
                    placeholder="Please specify primary packaging type"
                    className={`mt-3 ${validationErrors.primaryPackagingOther ? 'border-red-500' : ''}`}
                  />
                )}
                {validationErrors.primaryPackagingVessel && (
                  <p className="text-sm text-red-500 mt-2">{validationErrors.primaryPackagingVessel}</p>
                )}
                {validationErrors.primaryPackagingOther && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.primaryPackagingOther}</p>
                )}
              </div>

              {/* Show numeric fields only if NOT "Not determined yet" */}
              {formData.primaryPackagingVessel !== "Not determined yet" && (
                <>
                  {/* 2) Weight per individual unit */}
                  <div>
                    <Label className="mb-2 block" style={{ color: '#2C1810' }}>
                      Weight Per Individual Unit <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="weightPerUnit"
                        type="number"
                        min="0"
                        value={formData.weightPerUnit}
                        onChange={(e) => {
                          const w = e.target.value;
                          const unitsNum = parseFloat(formData.unitsPerPrimaryPack);
                          const weightNum = parseFloat(w);
                          const updates: Partial<WizardData> = { weightPerUnit: w };
                          if (!isNaN(weightNum) && !isNaN(unitsNum) && weightNum > 0 && unitsNum > 0) {
                            updates.netWeightPerPrimaryPack = (weightNum * unitsNum).toString();
                            updates.netWeightPerPrimaryPackUnit = formData.weightPerUnitUnit;
                          } else {
                            updates.netWeightPerPrimaryPack = '';
                          }
                          updateFormData(updates);
                          if (validationErrors.weightPerUnit) {
                            setValidationErrors(prev => ({ ...prev, weightPerUnit: '', netWeightPerPrimaryPack: '' }));
                          }
                        }}
                        placeholder="e.g., 4"
                        className={`flex-1 ${validationErrors.weightPerUnit ? 'border-red-500' : ''}`}
                      />
                      <Select
                        value={formData.weightPerUnitUnit}
                        onValueChange={(value) => {
                          const updates: Partial<WizardData> = { weightPerUnitUnit: value, netWeightPerPrimaryPackUnit: value };
                          updateFormData(updates);
                        }}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="oz">oz</SelectItem>
                          <SelectItem value="g">g</SelectItem>
                          <SelectItem value="lb">lb</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {validationErrors.weightPerUnit && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.weightPerUnit}</p>
                    )}
                  </div>

                  {/* 3) Unit dimensions (L × W × H) */}
                  <div>
                    <Label className="mb-2 block" style={{ color: '#2C1810' }}>
                      Unit Dimensions (L × W × H) <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="unitDimensionL"
                        type="number"
                        min="0"
                        value={formData.unitDimensionL}
                        onChange={(e) => {
                          updateFormData({ unitDimensionL: e.target.value });
                          if (validationErrors.unitDimensionL) {
                            setValidationErrors(prev => ({ ...prev, unitDimensionL: '' }));
                          }
                        }}
                        placeholder="L"
                        className={`flex-1 ${validationErrors.unitDimensionL ? 'border-red-500' : ''}`}
                      />
                      <span style={{ color: '#8B7355' }}>×</span>
                      <Input
                        id="unitDimensionW"
                        type="number"
                        min="0"
                        value={formData.unitDimensionW}
                        onChange={(e) => {
                          updateFormData({ unitDimensionW: e.target.value });
                          if (validationErrors.unitDimensionW) {
                            setValidationErrors(prev => ({ ...prev, unitDimensionW: '' }));
                          }
                        }}
                        placeholder="W"
                        className={`flex-1 ${validationErrors.unitDimensionW ? 'border-red-500' : ''}`}
                      />
                      <span style={{ color: '#8B7355' }}>×</span>
                      <Input
                        id="unitDimensionH"
                        type="number"
                        min="0"
                        value={formData.unitDimensionH}
                        onChange={(e) => {
                          updateFormData({ unitDimensionH: e.target.value });
                          if (validationErrors.unitDimensionH) {
                            setValidationErrors(prev => ({ ...prev, unitDimensionH: '' }));
                          }
                        }}
                        placeholder="H"
                        className={`flex-1 ${validationErrors.unitDimensionH ? 'border-red-500' : ''}`}
                      />
                      <Select
                        value={formData.unitDimensionUnit}
                        onValueChange={(value) => updateFormData({ unitDimensionUnit: value })}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">in</SelectItem>
                          <SelectItem value="cm">cm</SelectItem>
                          <SelectItem value="mm">mm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(validationErrors.unitDimensionL || validationErrors.unitDimensionW || validationErrors.unitDimensionH) && (
                      <p className="text-sm text-red-500 mt-1">All dimensions are required</p>
                    )}
                  </div>

                  {/* 4) Units per primary pack */}
                  <div>
                    <Label htmlFor="unitsPerPrimaryPack" style={{ color: '#2C1810' }}>
                      Units Per Primary Pack <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="unitsPerPrimaryPack"
                      type="number"
                        min="0"
                      value={formData.unitsPerPrimaryPack}
                      onChange={(e) => {
                        const units = e.target.value;
                        const weight = parseFloat(formData.weightPerUnit);
                        const unitsNum = parseFloat(units);
                        const updates: Partial<WizardData> = { unitsPerPrimaryPack: units };
                        if (!isNaN(weight) && !isNaN(unitsNum) && weight > 0 && unitsNum > 0) {
                          updates.netWeightPerPrimaryPack = (weight * unitsNum).toString();
                          updates.netWeightPerPrimaryPackUnit = formData.weightPerUnitUnit;
                        } else {
                          updates.netWeightPerPrimaryPack = '';
                        }
                        updateFormData(updates);
                        if (validationErrors.unitsPerPrimaryPack) {
                          setValidationErrors(prev => ({ ...prev, unitsPerPrimaryPack: '', netWeightPerPrimaryPack: '' }));
                        }
                      }}
                      placeholder="e.g., 6, 12, 24"
                      className={`mt-1 ${validationErrors.unitsPerPrimaryPack ? 'border-red-500' : ''}`}
                    />
                    {validationErrors.unitsPerPrimaryPack && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.unitsPerPrimaryPack}</p>
                    )}
                  </div>

                  {/* 5) Net weight per primary pack */}
                  <div>
                    <Label className="mb-2 block" style={{ color: '#2C1810' }}>
                      Net Weight Per Primary Pack <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="netWeightPerPrimaryPack"
                        type="number"
                        min="0"
                        value={formData.netWeightPerPrimaryPack}
                        readOnly
                        placeholder="Auto-calculated"
                        className={`flex-1 bg-muted ${validationErrors.netWeightPerPrimaryPack ? 'border-red-500' : ''}`}
                      />
                      <Select
                        value={formData.netWeightPerPrimaryPackUnit}
                        onValueChange={(value) => updateFormData({ netWeightPerPrimaryPackUnit: value })}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="oz">oz</SelectItem>
                          <SelectItem value="g">g</SelectItem>
                          <SelectItem value="lb">lb</SelectItem>
                          <SelectItem value="kg">kg</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {validationErrors.netWeightPerPrimaryPack && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.netWeightPerPrimaryPack}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case 11:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Secondary Packaging <span className="text-red-500">*</span>
              </h2>
            </div>
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block" style={{ color: '#2C1810' }}>
                  Secondary Packaging (Retail Aggregation) <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={formData.secondaryPackaging}
                  onValueChange={(value) => {
                    updateFormData({ secondaryPackaging: value, secondaryPackagingOther: value !== "Other (text)" ? "" : formData.secondaryPackagingOther });
                    if (validationErrors.secondaryPackaging) {
                      setValidationErrors(prev => ({ ...prev, secondaryPackaging: '' }));
                    }
                  }}
                  className="space-y-3"
                >
                  {[
                    "None",
                    "Retail display case",
                    "Multi-unit tray (non food-contact)",
                    "Other (text)",
                    "Not determined yet"
                  ].map((option) => (
                    <div
                      key={option}
                      className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                      style={{
                        borderColor: formData.secondaryPackaging === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                        backgroundColor: formData.secondaryPackaging === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                      }}
                      onClick={() => {
                        updateFormData({ secondaryPackaging: option, secondaryPackagingOther: option !== "Other (text)" ? "" : formData.secondaryPackagingOther });
                        if (validationErrors.secondaryPackaging) {
                          setValidationErrors(prev => ({ ...prev, secondaryPackaging: '' }));
                        }
                      }}
                    >
                      <RadioGroupItem value={option} id={`secondary-${option}`} />
                      <Label htmlFor={`secondary-${option}`} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {formData.secondaryPackaging === "Other (text)" && (
                  <Input
                    id="secondaryPackagingOther"
                    value={formData.secondaryPackagingOther}
                    onChange={(e) => {
                      updateFormData({ secondaryPackagingOther: e.target.value });
                      if (validationErrors.secondaryPackagingOther) {
                        setValidationErrors(prev => ({ ...prev, secondaryPackagingOther: '' }));
                      }
                    }}
                    placeholder="Please specify secondary packaging type"
                    className={`mt-3 ${validationErrors.secondaryPackagingOther ? 'border-red-500' : ''}`}
                  />
                )}
                {validationErrors.secondaryPackaging && (
                  <p className="text-sm text-red-500 mt-2">{validationErrors.secondaryPackaging}</p>
                )}
                {validationErrors.secondaryPackagingOther && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.secondaryPackagingOther}</p>
                )}
              </div>

              {/* Show units per vessel only if not "Not determined yet" or "None" */}
              {formData.secondaryPackaging !== "Not determined yet" && formData.secondaryPackaging !== "None" && (
                <div>
                  <Label htmlFor="unitsPerVessel" style={{ color: '#2C1810' }}>
                    Units Per Vessel <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="unitsPerVessel"
                    value={formData.unitsPerVessel}
                    onChange={(e) => {
                      updateFormData({ unitsPerVessel: e.target.value });
                      if (validationErrors.unitsPerVessel) {
                        setValidationErrors(prev => ({ ...prev, unitsPerVessel: '' }));
                      }
                    }}
                    placeholder="e.g., 6, 12, 24, or N/A"
                    className={`mt-1 ${validationErrors.unitsPerVessel ? 'border-red-500' : ''}`}
                  />
                  {validationErrors.unitsPerVessel && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.unitsPerVessel}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 12:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Artwork & Labels <span className="text-red-500">*</span>
              </h2>
            </div>
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block" style={{ color: '#2C1810' }}>
                  Artwork Readiness <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={formData.artworkReadiness}
                  onValueChange={(value) => {
                    updateFormData({ artworkReadiness: value });
                    if (validationErrors.artworkReadiness) {
                      setValidationErrors(prev => ({ ...prev, artworkReadiness: '' }));
                    }
                  }}
                  className="space-y-3"
                >
                  {["Ready", "In Process", "Need Assistance"].map((option) => (
                    <div
                      key={option}
                      className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                      style={{
                        borderColor: formData.artworkReadiness === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                        backgroundColor: formData.artworkReadiness === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                      }}
                      onClick={() => {
                        updateFormData({ artworkReadiness: option });
                        if (validationErrors.artworkReadiness) {
                          setValidationErrors(prev => ({ ...prev, artworkReadiness: '' }));
                        }
                      }}
                    >
                      <RadioGroupItem value={option} id={`artwork-${option}`} />
                      <Label htmlFor={`artwork-${option}`} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {validationErrors.artworkReadiness && (
                  <p className="text-sm text-red-500 mt-2">{validationErrors.artworkReadiness}</p>
                )}
              </div>
              <div>
                <Label className="mb-3 block" style={{ color: '#2C1810' }}>
                  Who is responsible for labels? <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={formData.labelResponsibility}
                  onValueChange={(value) => {
                    updateFormData({ labelResponsibility: value });
                    if (validationErrors.labelResponsibility) {
                      setValidationErrors(prev => ({ ...prev, labelResponsibility: '' }));
                    }
                  }}
                  className="space-y-3"
                >
                  {["Customer Provided", "Manufacturer Provided", "TBD"].map((option) => (
                    <div
                      key={option}
                      className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                      style={{
                        borderColor: formData.labelResponsibility === option ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                        backgroundColor: formData.labelResponsibility === option ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                      }}
                      onClick={() => {
                        updateFormData({ labelResponsibility: option });
                        if (validationErrors.labelResponsibility) {
                          setValidationErrors(prev => ({ ...prev, labelResponsibility: '' }));
                        }
                      }}
                    >
                      <RadioGroupItem value={option} id={`label-${option}`} />
                      <Label htmlFor={`label-${option}`} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {validationErrors.labelResponsibility && (
                  <p className="text-sm text-red-500 mt-2">{validationErrors.labelResponsibility}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 13:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Shipping Requirements <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Enter details or select TBD if not yet determined
              </p>
            </div>
            <div className="space-y-4">
              {/* TBD Checkbox */}
              <div
                className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                style={{
                  borderColor: formData.shippingTBD ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                  backgroundColor: formData.shippingTBD ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                }}
                onClick={() => {
                  updateFormData({ 
                    shippingTBD: !formData.shippingTBD,
                    masterCartonRequirements: !formData.shippingTBD ? "" : formData.masterCartonRequirements,
                    palletsRequired: !formData.shippingTBD ? "" : formData.palletsRequired
                  });
                  setValidationErrors(prev => ({ ...prev, masterCartonRequirements: '', palletsRequired: '' }));
                }}
              >
                <Checkbox
                  id="shippingTBD"
                  checked={formData.shippingTBD}
                  onCheckedChange={(checked) => {
                    updateFormData({ 
                      shippingTBD: checked as boolean,
                      masterCartonRequirements: checked ? "" : formData.masterCartonRequirements,
                      palletsRequired: checked ? "" : formData.palletsRequired
                    });
                    setValidationErrors(prev => ({ ...prev, masterCartonRequirements: '', palletsRequired: '' }));
                  }}
                />
                <Label htmlFor="shippingTBD" className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                  TBD – Not determined yet
                </Label>
              </div>

              {/* Show input fields only if TBD is not checked */}
              {!formData.shippingTBD && (
                <>
                  <div>
                    <Label htmlFor="masterCartonRequirements" style={{ color: '#2C1810' }}>
                      Master Carton / Shipper Case Requirements <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="masterCartonRequirements"
                      value={formData.masterCartonRequirements}
                      onChange={(e) => {
                        updateFormData({ masterCartonRequirements: e.target.value });
                        if (validationErrors.masterCartonRequirements) {
                          setValidationErrors(prev => ({ ...prev, masterCartonRequirements: '' }));
                        }
                      }}
                      placeholder="e.g., Units per case, case dimensions, or N/A"
                      className={`mt-1 ${validationErrors.masterCartonRequirements ? 'border-red-500' : ''}`}
                    />
                    {validationErrors.masterCartonRequirements && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.masterCartonRequirements}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="palletsRequired" style={{ color: '#2C1810' }}>
                      Pallets Required <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="palletsRequired"
                      value={formData.palletsRequired}
                      onChange={(e) => {
                        updateFormData({ palletsRequired: e.target.value });
                        if (validationErrors.palletsRequired) {
                          setValidationErrors(prev => ({ ...prev, palletsRequired: '' }));
                        }
                      }}
                      placeholder="e.g., Standard 48x40, Euro pallet, or N/A"
                      className={`mt-1 ${validationErrors.palletsRequired ? 'border-red-500' : ''}`}
                    />
                    {validationErrors.palletsRequired && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.palletsRequired}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case 14:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Target Date & Pricing <span className="text-red-500">*</span>
              </h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="targetDate" style={{ color: '#2C1810' }}>
                  Target Launch Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="targetDate"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={formData.targetDate}
                  onChange={(e) => {
                    updateFormData({ targetDate: e.target.value });
                    if (validationErrors.targetDate) {
                      setValidationErrors(prev => ({ ...prev, targetDate: '' }));
                    }
                  }}
                  className={`mt-1 ${validationErrors.targetDate ? 'border-red-500' : ''}`}
                />
                {validationErrors.targetDate && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.targetDate}</p>
                )}
              </div>
              <div>
                <Label htmlFor="priceTargetPerUnit" style={{ color: '#2C1810' }}>
                  Target X-Factory Cost per Sellable Unit <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="priceTargetPerUnit"
                  value={formData.priceTargetPerUnit}
                  onChange={(e) => {
                    updateFormData({ priceTargetPerUnit: e.target.value });
                    if (validationErrors.priceTargetPerUnit) {
                      setValidationErrors(prev => ({ ...prev, priceTargetPerUnit: '' }));
                    }
                  }}
                  placeholder="e.g., $2.50 or N/A"
                  className={`mt-1 ${validationErrors.priceTargetPerUnit ? 'border-red-500' : ''}`}
                />
                {validationErrors.priceTargetPerUnit && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.priceTargetPerUnit}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 15:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Volume & Frequency <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Enter "N/A" if not yet determined
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="annualVolume" style={{ color: '#2C1810' }}>
                  Estimated Annual Volume <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="annualVolume"
                  value={formData.annualVolume}
                  onChange={(e) => {
                    updateFormData({ annualVolume: e.target.value });
                    if (validationErrors.annualVolume) {
                      setValidationErrors(prev => ({ ...prev, annualVolume: '' }));
                    }
                  }}
                  placeholder="e.g., 50,000 units or N/A"
                  className={`mt-1 ${validationErrors.annualVolume ? 'border-red-500' : ''}`}
                />
                {validationErrors.annualVolume && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.annualVolume}</p>
                )}
              </div>
              <div>
                <Label htmlFor="orderQuantity" style={{ color: '#2C1810' }}>
                  Order Quantity <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="orderQuantity"
                  value={formData.orderQuantity}
                  onChange={(e) => {
                    updateFormData({ orderQuantity: e.target.value });
                    if (validationErrors.orderQuantity) {
                      setValidationErrors(prev => ({ ...prev, orderQuantity: '' }));
                    }
                  }}
                  placeholder="e.g., 5,000 units per order or N/A"
                  className={`mt-1 ${validationErrors.orderQuantity ? 'border-red-500' : ''}`}
                />
                {validationErrors.orderQuantity && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.orderQuantity}</p>
                )}
              </div>
              <div>
                <Label htmlFor="orderFrequency" style={{ color: '#2C1810' }}>
                  Order Frequency <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="orderFrequency"
                  value={formData.orderFrequency}
                  onChange={(e) => {
                    updateFormData({ orderFrequency: e.target.value });
                    if (validationErrors.orderFrequency) {
                      setValidationErrors(prev => ({ ...prev, orderFrequency: '' }));
                    }
                  }}
                  placeholder="e.g., Monthly, Quarterly, or N/A"
                  className={`mt-1 ${validationErrors.orderFrequency ? 'border-red-500' : ''}`}
                />
                {validationErrors.orderFrequency && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.orderFrequency}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 16:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Warehousing Needs <span className="text-red-500">*</span>
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Select all that apply, or "No Warehousing Needed"
              </p>
            </div>
            <div className="space-y-3">
              {[
                "Dry Storage",
                "Cold Storage (Refrigerated)",
                "Freezer Storage",
                "No Warehousing Needed"
              ].map((option) => (
                <div
                  key={option}
                  className="flex items-center space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-[#C89B3C]/50"
                  style={{
                    borderColor: formData.warehousingNeeds.includes(option) ? '#C89B3C' : 'rgba(200, 155, 60, 0.2)',
                    backgroundColor: formData.warehousingNeeds.includes(option) ? 'rgba(200, 155, 60, 0.08)' : 'transparent',
                  }}
                  onClick={() => handleCheckboxChange("warehousingNeeds", option, !formData.warehousingNeeds.includes(option))}
                >
                  <Checkbox
                    id={option}
                    checked={formData.warehousingNeeds.includes(option)}
                    onCheckedChange={(checked) => handleCheckboxChange("warehousingNeeds", option, checked as boolean)}
                  />
                  <Label htmlFor={option} className="flex-1 cursor-pointer font-medium" style={{ color: '#2C1810' }}>
                    {option}
                  </Label>
                </div>
              ))}
            </div>
            {validationErrors.warehousingNeeds && (
              <p className="text-sm text-red-500 mt-2">{validationErrors.warehousingNeeds}</p>
            )}
          </div>
        );

      case 17:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Technical / R&D Contact
              </h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sameAsInitialContact"
                  checked={formData.sameAsInitialContact}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    if (isChecked) {
                      const savedLeadData = localStorage.getItem("prfLeadData");
                      if (savedLeadData) {
                        try {
                          const lead = JSON.parse(savedLeadData);
                          updateFormData({
                            sameAsInitialContact: true,
                            technicalContactName: lead.fullName || "",
                            technicalContactEmail: lead.email || "",
                            technicalContactPhone: (lead.phone || "").replace(/\D/g, '').slice(0, 10),
                          });
                        } catch (e) {
                          updateFormData({ sameAsInitialContact: true });
                        }
                      } else {
                        updateFormData({ sameAsInitialContact: true });
                      }
                    } else {
                      updateFormData({
                        sameAsInitialContact: false,
                        technicalContactName: "",
                        technicalContactEmail: "",
                        technicalContactPhone: "",
                      });
                    }
                    setValidationErrors(prev => ({ ...prev, technicalContactName: '', technicalContactEmail: '', technicalContactPhone: '' }));
                  }}
                />
                <Label htmlFor="sameAsInitialContact" style={{ color: '#2C1810' }} className="cursor-pointer">
                  Same as initial contact info
                </Label>
              </div>

              <div>
                <Label htmlFor="technicalContactName" style={{ color: '#2C1810' }}>
                  Contact Name {!formData.sameAsInitialContact && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="technicalContactName"
                  value={formData.technicalContactName}
                  readOnly={formData.sameAsInitialContact}
                  onChange={(e) => {
                    if (!formData.sameAsInitialContact) {
                      updateFormData({ technicalContactName: e.target.value });
                      if (validationErrors.technicalContactName) {
                        setValidationErrors(prev => ({ ...prev, technicalContactName: '' }));
                      }
                    }
                  }}
                  placeholder="Full name"
                  className={`mt-1 ${formData.sameAsInitialContact ? 'bg-muted' : ''} ${validationErrors.technicalContactName ? 'border-red-500' : ''}`}
                />
                {validationErrors.technicalContactName && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.technicalContactName}</p>
                )}
              </div>
              <div>
                <Label htmlFor="technicalContactEmail" style={{ color: '#2C1810' }}>
                  Email {!formData.sameAsInitialContact && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="technicalContactEmail"
                  type="email"
                  value={formData.technicalContactEmail}
                  readOnly={formData.sameAsInitialContact}
                  onChange={(e) => {
                    if (!formData.sameAsInitialContact) {
                      updateFormData({ technicalContactEmail: e.target.value });
                      if (validationErrors.technicalContactEmail) {
                        setValidationErrors(prev => ({ ...prev, technicalContactEmail: '' }));
                      }
                    }
                  }}
                  placeholder="email@company.com"
                  className={`mt-1 ${formData.sameAsInitialContact ? 'bg-muted' : ''} ${validationErrors.technicalContactEmail ? 'border-red-500' : ''}`}
                />
                {validationErrors.technicalContactEmail && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.technicalContactEmail}</p>
                )}
              </div>
              <div>
                <Label htmlFor="technicalContactPhone" style={{ color: '#2C1810' }}>
                  Phone {!formData.sameAsInitialContact && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id="technicalContactPhone"
                  type="tel"
                  value={formData.technicalContactPhone}
                  readOnly={formData.sameAsInitialContact}
                  onChange={(e) => {
                    if (!formData.sameAsInitialContact) {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
                      updateFormData({ technicalContactPhone: digitsOnly });
                      if (validationErrors.technicalContactPhone) {
                        setValidationErrors(prev => ({ ...prev, technicalContactPhone: '' }));
                      }
                    }
                  }}
                  placeholder="5551234567"
                  maxLength={10}
                  className={`mt-1 ${formData.sameAsInitialContact ? 'bg-muted' : ''} ${validationErrors.technicalContactPhone ? 'border-red-500' : ''}`}
                />
                {validationErrors.technicalContactPhone && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.technicalContactPhone}</p>
                )}
              </div>
            </div>
          </div>
        );

      case 18:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#C89B3C' }}>{currentStepInfo.section}</p>
              <h2 className="text-xl font-semibold mb-2" style={{ color: '#2C1810' }}>
                Review & Submit
              </h2>
              <p className="text-sm" style={{ color: '#8B7355' }}>
                Review your submission and add any additional notes before submitting.
              </p>
            </div>
            
            <div className="space-y-4 text-sm" style={{ color: '#2C1810' }}>
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(200, 155, 60, 0.08)' }}>
                <h3 className="font-semibold mb-2">Project Summary</h3>
                <div className="grid grid-cols-2 gap-2">
                  <span style={{ color: '#8B7355' }}>Customer:</span>
                  <span>{formData.customerName || '—'}</span>
                  <span style={{ color: '#8B7355' }}>Product:</span>
                  <span>{formData.productName || '—'}</span>
                  <span style={{ color: '#8B7355' }}>Contact:</span>
                  <span>{formData.technicalContactName || '—'}</span>
                  <span style={{ color: '#8B7355' }}>Email:</span>
                  <span>{formData.technicalContactEmail || '—'}</span>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="additionalProjectInfo" style={{ color: '#2C1810' }}>Additional Notes (Optional)</Label>
              <Textarea
                id="additionalProjectInfo"
                value={formData.additionalProjectInfo}
                onChange={(e) => updateFormData({ additionalProjectInfo: e.target.value })}
                placeholder="Share any additional details, special requirements, or questions..."
                className="min-h-[100px] mt-1"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundImage: 'url(/bakery-workspace-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(44, 24, 16, 0.7)' }} />

      <header className="relative z-10 px-6 py-4 border-b border-white/10 backdrop-blur-sm" style={{ backgroundColor: 'rgba(44, 24, 16, 0.3)' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <img src={logo} alt="Logo" className="h-10" />
          {isSaving && (
            <span className="text-xs" style={{ color: 'rgba(245, 241, 230, 0.7)' }}>Saving...</span>
          )}
        </div>
      </header>

      <div className="relative z-10 px-6 py-4" style={{ backgroundColor: 'rgba(44, 24, 16, 0.3)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: 'rgba(245, 241, 230, 0.7)' }}>
              Step {currentStep} of {TOTAL_STEPS}
            </span>
            <span className="text-xs font-medium" style={{ color: '#C89B3C' }}>
              {Math.round(progressPercent)}% Complete
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 pb-8">
            {renderStep()}

            <div className="flex justify-between mt-8 pt-6 border-t" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
              <Button
                variant="outline"
                onClick={() => {
                  if (editingFromPreview) {
                    setEditingFromPreview(false);
                    setCurrentStep(TOTAL_STEPS);
                    setShowPreviewModal(true);
                  } else {
                    handleBack();
                  }
                }}
                disabled={currentStep === 1 && !editingFromPreview}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {editingFromPreview ? 'Cancel Edit' : 'Back'}
              </Button>

              {currentStep === TOTAL_STEPS ? (
                <Button
                  onClick={() => setShowPreviewModal(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white"
                >
                  <Eye className="w-4 h-4" />
                  Preview Submission
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="flex items-center gap-2 bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white"
                >
                  {editingFromPreview ? 'Save & Return to Preview' : 'Next'}
                  {editingFromPreview ? <CheckCircle className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle style={{ color: '#2C1810' }}>Review Your Submission</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] px-6 pb-6">
            <div className="space-y-4 text-sm" style={{ color: '#2C1810' }}>

              {/* Project Basics */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Project Basics</h3>
                <div className="space-y-1">
                  <PreviewField label="Project Type" value={formData.projectType} step={1} onEdit={goToEditStep} />
                  <PreviewField label="Customer" value={formData.customerName} step={2} onEdit={goToEditStep} />
                  <PreviewField label="Product" value={formData.productName} step={2} onEdit={goToEditStep} />
                  <PreviewField label="Development Approach" value={formData.developmentApproach} step={3} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Product Type / Status */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Product Type / Status</h3>
                <div className="space-y-1">
                  <PreviewField label="Finished Form" value={formData.finishedForm.length > 0 ? formData.finishedForm.join(', ') : ''} step={4} onEdit={goToEditStep} />
                  <PreviewField label="Nutraceutical" value={formData.isNutraceutical ? 'Yes' : 'No'} step={5} onEdit={goToEditStep} />
                  <PreviewField label="Flavor Type" value={formData.flavorType} step={6} onEdit={goToEditStep} />
                  <PreviewField label="Intended Application" value={formData.intendedApplication.length > 0 ? formData.intendedApplication.join(', ') : ''} step={7} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Claims / Certifications */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Claims / Certifications</h3>
                <div className="space-y-1">
                  <PreviewField label="Requirements" value={formData.additionalRequirements.length > 0 ? formData.additionalRequirements.join(', ') : ''} step={8} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Packaging */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Packaging</h3>
                <div className="space-y-1">
                  <PreviewField label="Readiness" value={formData.packagingReadiness} step={9} onEdit={goToEditStep} />
                  <PreviewField label="Primary Packaging" value={formData.primaryPackagingVessel === 'Other (text)' ? formData.primaryPackagingOther : formData.primaryPackagingVessel} step={10} onEdit={goToEditStep} />
                  <PreviewField label="Weight/Unit" value={formData.weightPerUnit ? `${formData.weightPerUnit} ${formData.weightPerUnitUnit}` : ''} step={10} onEdit={goToEditStep} />
                  <PreviewField label="Dimensions" value={formData.unitDimensionL ? `${formData.unitDimensionL} × ${formData.unitDimensionW} × ${formData.unitDimensionH} ${formData.unitDimensionUnit}` : ''} step={10} onEdit={goToEditStep} />
                  <PreviewField label="Units/Pack" value={formData.unitsPerPrimaryPack} step={10} onEdit={goToEditStep} />
                  <PreviewField label="Net Weight/Pack" value={formData.netWeightPerPrimaryPack ? `${formData.netWeightPerPrimaryPack} ${formData.netWeightPerPrimaryPackUnit}` : ''} step={10} onEdit={goToEditStep} />
                  <PreviewField label="Secondary Packaging" value={formData.secondaryPackaging === 'Other (text)' ? formData.secondaryPackagingOther : formData.secondaryPackaging} step={11} onEdit={goToEditStep} />
                  <PreviewField label="Artwork Readiness" value={formData.artworkReadiness} step={12} onEdit={goToEditStep} />
                  <PreviewField label="Label Responsibility" value={formData.labelResponsibility} step={12} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Shipping */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Shipping</h3>
                <div className="space-y-1">
                  <PreviewField label="Master Carton" value={formData.masterCartonRequirements} step={13} onEdit={goToEditStep} />
                  <PreviewField label="Pallets Required" value={formData.palletsRequired} step={13} onEdit={goToEditStep} />
                  <PreviewField label="Shipping TBD" value={formData.shippingTBD ? 'Yes' : 'No'} step={13} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Volumes / Timing / Ops */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Volumes / Timing / Ops</h3>
                <div className="space-y-1">
                  <PreviewField label="Target Launch Date" value={formData.targetDate} step={14} onEdit={goToEditStep} />
                  <PreviewField label="Price Target/Unit" value={formData.priceTargetPerUnit} step={14} onEdit={goToEditStep} />
                  <PreviewField label="Annual Volume" value={formData.annualVolume} step={15} onEdit={goToEditStep} />
                  <PreviewField label="Order Quantity" value={formData.orderQuantity} step={15} onEdit={goToEditStep} />
                  <PreviewField label="Order Frequency" value={formData.orderFrequency} step={15} onEdit={goToEditStep} />
                  <PreviewField label="Warehousing" value={formData.warehousingNeeds.length > 0 ? formData.warehousingNeeds.join(', ') : ''} step={16} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Contact */}
              <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                <h3 className="font-semibold mb-2">Technical / R&D Contact</h3>
                <div className="space-y-1">
                  <PreviewField label="Same as Initial" value={formData.sameAsInitialContact ? 'Yes' : 'No'} step={17} onEdit={goToEditStep} />
                  <PreviewField label="Name" value={formData.technicalContactName} step={17} onEdit={goToEditStep} />
                  <PreviewField label="Email" value={formData.technicalContactEmail} step={17} onEdit={goToEditStep} />
                  <PreviewField label="Phone" value={formData.technicalContactPhone} step={17} onEdit={goToEditStep} />
                </div>
              </div>

              {/* Additional Notes */}
              {formData.additionalProjectInfo && (
                <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(200, 155, 60, 0.2)' }}>
                  <h3 className="font-semibold mb-2">Additional Notes</h3>
                  <div className="space-y-1">
                    <PreviewField label="Notes" value={formData.additionalProjectInfo} step={18} onEdit={goToEditStep} />
                  </div>
                </div>
              )}

            </div>

            <div className="pt-6 pb-2 flex justify-end">
              <Button
                onClick={() => { setShowPreviewModal(false); handleSubmit(); }}
                className="flex items-center gap-2 bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white"
              >
                Submit PRF
                <CheckCircle className="w-4 h-4" />
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Stage2WizardContent;

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Building2, Upload, FileText, CheckCircle2, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo.png";

export default function AddClientFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"profile" | "method" | "done">("profile");
  const [isCreating, setIsCreating] = useState(false);
  const [newClientId, setNewClientId] = useState<string | null>(null);

  const [profileData, setProfileData] = useState({
    email: "",
    business_name: "",
    product_type: "",
    target_market: "",
    location: "",
    phone: "",
    website: "",
    bio: "",
  });

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>("pss");
  const [ndaFile, setNdaFile] = useState<File | null>(null);
  const [ndaUploading, setNdaUploading] = useState(false);
  const [ndaUploaded, setNdaUploaded] = useState(false);

  // Parsing state
  const [parsing, setParsing] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);

  const updateField = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateClient = async () => {
    if (!profileData.email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!profileData.business_name.trim()) {
      toast.error("Business name is required");
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-client-account", {
        body: profileData,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setNewClientId(data.user_id);
      toast.success("Client account created!");
      setStep("method");
    } catch (err: any) {
      toast.error(err.message || "Failed to create client account");
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowedTypes.includes(f.type)) {
      toast.error("Please upload a PDF or Excel file");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB");
      return;
    }
    setFile(f);
  };

  const handleUploadFile = async () => {
    if (!file || !newClientId) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${newClientId}/client-upload_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("product-spec-sheets")
        .upload(path, file);

      if (uploadErr) throw uploadErr;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("client_documents").insert({
        user_id: newClientId,
        uploaded_by: user?.id,
        document_type: (docType || "").toLowerCase(),
        file_path: path,
        file_name: file.name,
      });

      toast.success("File uploaded and attached to client record!");

      // If batch_sheet or pss and it's an Excel file, trigger parsing
      const isExcel = ext === "xlsx" || ext === "xls";
      const isParseable = docType === "batch_sheet" || docType === "pss";

      if (isExcel && isParseable) {
        setPendingFilePath(path);
        await triggerParsing(path);
      } else {
        setStep("done");
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const triggerParsing = async (filePath: string) => {
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-batch-sheet", {
        body: { file_path: filePath, user_id: newClientId, action: "check" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setParseResult(data);

      if (data.existing_concept_id) {
        setShowDuplicateDialog(true);
      } else {
        await executeParsing(filePath, "create");
      }
    } catch (err: any) {
      toast.error("Parsing failed: " + (err.message || "Unknown error"));
      setStep("done");
    } finally {
      setParsing(false);
    }
  };

  const executeParsing = async (filePath: string, action: string) => {
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-batch-sheet", {
        body: { file_path: filePath, user_id: newClientId, action },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        action === "new_version"
          ? "New version created from batch sheet!"
          : action === "update"
          ? "Product updated from batch sheet!"
          : "Product created from batch sheet!"
      );
    } catch (err: any) {
      toast.error("Failed to process: " + (err.message || "Unknown error"));
    } finally {
      setParsing(false);
      setShowDuplicateDialog(false);
      setParseResult(null);
      setPendingFilePath(null);
      setStep("done");
    }
  };

  const handleNdaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF file for the NDA");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB");
      return;
    }
    setNdaFile(f);
  };

  const handleUploadNda = async () => {
    if (!ndaFile || !newClientId) return;

    setNdaUploading(true);
    try {
      const path = `${newClientId}/nda/signed_nda_${Date.now()}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from("product-spec-sheets")
        .upload(path, ndaFile);

      if (uploadErr) throw uploadErr;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("client_documents").insert({
        user_id: newClientId,
        uploaded_by: user?.id,
        document_type: "nda",
        file_path: path,
        file_name: ndaFile.name,
      });

      setNdaUploaded(true);
      toast.success("NDA uploaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "NDA upload failed");
    } finally {
      setNdaUploading(false);
    }
  };

  const handleManualEntry = () => {
    if (newClientId) {
      navigate(`/admin/client/${newClientId}`);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundImage: "url(/bakery-workspace-bg.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(44, 24, 16, 0.75)" }} />

      {/* Duplicate Detection Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Product Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              A product named <strong>"{parseResult?.existing_product_name}"</strong>
              {parseResult?.existing_version && ` (v${parseResult.existing_version})`} already exists
              for this client. How would you like to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={parsing}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={parsing}
              onClick={() => pendingFilePath && executeParsing(pendingFilePath, "update")}
            >
              {parsing ? "Processing…" : "Update Current"}
            </Button>
            <Button
              disabled={parsing}
              onClick={() => pendingFilePath && executeParsing(pendingFilePath, "new_version")}
            >
              {parsing ? "Processing…" : "New Version"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header
        className="relative z-10 border-b backdrop-blur-sm"
        style={{
          backgroundColor: "rgba(44, 24, 16, 0.3)",
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <div className="container flex h-16 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            style={{ color: "rgba(245, 241, 230, 0.7)" }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <img src={logo} alt="Adventure Bakery" className="w-8 h-8" />
          <span className="font-semibold text-lg" style={{ color: "#F5F1E6" }}>
            Add New Client
          </span>
        </div>
      </header>

      <main className="relative z-10 flex-1 container py-12 max-w-2xl">
        {step === "profile" && (
          <Card className="bg-card/95 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-accent" />
                Client Profile
              </CardTitle>
              <CardDescription>
                Create a new client account. They'll get Brand Portal access automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="client@company.com"
                    value={profileData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business_name">Business Name *</Label>
                  <Input
                    id="business_name"
                    placeholder="Sunrise Bakery"
                    value={profileData.business_name}
                    onChange={(e) => updateField("business_name", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="product_type">Product Type</Label>
                  <Input
                    id="product_type"
                    placeholder="e.g., Cookies, Bread"
                    value={profileData.product_type}
                    onChange={(e) => updateField("product_type", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_market">Target Market</Label>
                  <Input
                    id="target_market"
                    placeholder="e.g., Retail, Wholesale"
                    value={profileData.target_market}
                    onChange={(e) => updateField("target_market", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="City, State"
                    value={profileData.location}
                    onChange={(e) => updateField("location", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="(555) 123-4567"
                    value={profileData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://..."
                  value={profileData.website}
                  onChange={(e) => updateField("website", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Notes / Bio</Label>
                <Textarea
                  id="bio"
                  placeholder="Brief description of the client..."
                  value={profileData.bio}
                  onChange={(e) => updateField("bio", e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleCreateClient}
                disabled={isCreating}
                className="w-full bg-gradient-to-r from-[hsl(43,52%,50%)] to-[hsl(43,52%,58%)] text-primary-foreground"
              >
                {isCreating ? "Creating Account…" : "Create Client Account"}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "method" && (
          <div className="space-y-6">
            {/* NDA Upload Card */}
            <Card className="bg-card/95 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-accent" />
                  Signed NDA
                </CardTitle>
                <CardDescription>
                  Upload the signed mutual NDA for <strong>{profileData.business_name}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ndaUploaded ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    NDA uploaded successfully
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handleNdaUpload}
                      className="text-sm max-w-xs"
                    />
                    {ndaFile && (
                      <Button
                        size="sm"
                        onClick={handleUploadNda}
                        disabled={ndaUploading}
                        variant="outline"
                      >
                        {ndaUploading ? "Uploading…" : "Upload NDA"}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Product Info Method Card */}
            <Card className="bg-card/95 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Client Account Created
                </CardTitle>
                <CardDescription>
                  Choose how to add product information for <strong>{profileData.business_name}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {/* Manual Entry */}
                <Card
                  className="cursor-pointer hover:shadow-md transition-shadow border-2 border-transparent hover:border-accent/40"
                  onClick={handleManualEntry}
                >
                  <CardContent className="pt-6 text-center space-y-3">
                    <FileText className="h-10 w-10 mx-auto text-accent" />
                    <h3 className="font-semibold">Manual Entry</h3>
                    <p className="text-sm text-muted-foreground">
                      Go to the client's profile and add products, concepts, and specs step by step.
                    </p>
                    <Button variant="outline" size="sm" className="mt-2">
                      Open Client File →
                    </Button>
                  </CardContent>
                </Card>

                {/* File Upload */}
                <Card className="border-2 border-transparent">
                  <CardContent className="pt-6 text-center space-y-3">
                    <Upload className="h-10 w-10 mx-auto text-accent" />
                    <h3 className="font-semibold">Upload PSS / Batch Sheet</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload a product spec sheet, batch sheet, or formula document.
                    </p>
                    <div className="space-y-2 text-left">
                      <Label className="text-xs">Document Type</Label>
                      <Select value={docType} onValueChange={setDocType}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pss">Product Spec Sheet (PSS)</SelectItem>
                          <SelectItem value="batch_sheet">Batch Sheet</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="file"
                        accept=".pdf,.xlsx,.xls"
                        onChange={handleFileChange}
                        className="text-sm"
                      />
                      {file && (
                        <Button
                          size="sm"
                          onClick={handleUploadFile}
                          disabled={uploading || parsing}
                          className="w-full bg-gradient-to-r from-[hsl(43,52%,50%)] to-[hsl(43,52%,58%)] text-primary-foreground"
                        >
                          {uploading ? "Uploading…" : parsing ? "Parsing…" : `Upload ${file.name}`}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "done" && (
          <Card className="bg-card/95 backdrop-blur-md">
            <CardContent className="pt-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <h2 className="text-xl font-bold">All Set!</h2>
              <p className="text-muted-foreground">
                Client account for <strong>{profileData.business_name}</strong> is ready and their file has been uploaded.
              </p>
              <div className="flex gap-3 justify-center pt-4">
                <Button variant="outline" onClick={() => navigate("/team/dashboard")}>
                  Back to Dashboard
                </Button>
                <Button onClick={() => navigate(`/team/client/${newClientId}`)}>
                  View Client File
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

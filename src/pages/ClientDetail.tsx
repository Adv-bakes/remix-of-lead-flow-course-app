import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Building2, Package, Cookie, ShieldCheck, ShieldX, FileText, Upload, Plus, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  id: string;
  business_name: string | null;
  product_type: string | null;
  location: string | null;
  phone: string | null;
  website: string | null;
  bio: string | null;
  target_market: string | null;
  access_granted: boolean;
}

interface ClientDocument {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
  notes: string | null;
}

interface ParseResult {
  parsed: any;
  existing_concept_id: number | null;
  existing_product_name: string | null;
  existing_version: string | null;
}

export default function ClientDetail() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [batchSheetsByPss, setBatchSheetsByPss] = useState<Record<string, { id: string; version: number }>>({});
  const [generatingForPss, setGeneratingForPss] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocType, setUploadDocType] = useState("other");
  const [uploading, setUploading] = useState(false);

  // Parsing state
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (userId) loadClientData();
  }, [userId]);

  const loadClientData = async () => {
    const [profileRes, conceptsRes, productsRes, docsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId!).single(),
      supabase.from("concepts").select("id, product_name, product_type, created_at").eq("user_id", userId!),
      supabase.from("products").select("id, product_name, category").eq("user_id", userId!),
      supabase.from("client_documents").select("*").eq("user_id", userId!).order("uploaded_at", { ascending: false }),
    ]);

    if (profileRes.data) setProfile(profileRes.data as Profile);
    if (conceptsRes.data) setConcepts(conceptsRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (docsRes.data) {
      const docs = docsRes.data as unknown as ClientDocument[];
      setDocuments(docs);
      const pssIds = docs.filter((d) => d.document_type === "pss").map((d) => d.id);
      if (pssIds.length) {
        const { data: sheets } = await (supabase as any)
          .from("batch_sheets")
          .select("id, version, pss_document_id")
          .in("pss_document_id", pssIds)
          .is("superseded_at", null);
        const map: Record<string, { id: string; version: number }> = {};
        (sheets || []).forEach((s: any) => { map[s.pss_document_id] = { id: s.id, version: s.version }; });
        setBatchSheetsByPss(map);
      }
    }
    setLoading(false);
  };

  const createBatchSheet = async (pssId: string) => {
    setGeneratingForPss(pssId);
    const { data, error } = await (supabase as any).functions.invoke("generate-batch-sheet-from-pss", {
      body: { pss_document_id: pssId },
    });
    setGeneratingForPss(null);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success(`Batch sheet v${data.batch_sheet.version} created`);
    setBatchSheetsByPss((prev) => ({ ...prev, [pssId]: { id: data.batch_sheet.id, version: data.batch_sheet.version } }));
  };

  const toggleAccess = async () => {
    if (!profile) return;
    setToggling(true);
    const { error } = await supabase
      .from("profiles")
      .update({ access_granted: !profile.access_granted })
      .eq("id", profile.id);

    if (error) {
      toast.error("Failed to update access");
    } else {
      setProfile({ ...profile, access_granted: !profile.access_granted });
      toast.success(profile.access_granted ? "Access revoked" : "Access granted");
    }
    setToggling(false);
  };

  const handleDocUpload = async () => {
    if (!uploadFile || !userId) return;
    setUploading(true);
    try {
      const ext = uploadFile.name.split(".").pop();
      const path = `${userId}/${uploadDocType}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("product-spec-sheets")
        .upload(path, uploadFile);
      if (uploadErr) throw uploadErr;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("client_documents").insert({
        user_id: userId,
        uploaded_by: user?.id,
        document_type: (uploadDocType || "").toLowerCase(),
        file_path: path,
        file_name: uploadFile.name,
      });

      toast.success("Document uploaded!");

      // If batch_sheet or pss and it's an Excel file, trigger parsing
      const isExcel = ext === "xlsx" || ext === "xls";
      const isParseable = uploadDocType === "batch_sheet" || uploadDocType === "pss";

      if (isExcel && isParseable) {
        setPendingFilePath(path);
        await triggerParsing(path);
      }

      setUploadFile(null);
      loadClientData();
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
        body: { file_path: filePath, user_id: userId, action: "check" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setParseResult(data);

      if (data.existing_concept_id) {
        // Duplicate found — show dialog
        setShowDuplicateDialog(true);
      } else {
        // No duplicate — auto-create
        await executeParsing(filePath, "create");
      }
    } catch (err: any) {
      toast.error("Parsing failed: " + (err.message || "Unknown error"));
    } finally {
      setParsing(false);
    }
  };

  const executeParsing = async (filePath: string, action: string) => {
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-batch-sheet", {
        body: { file_path: filePath, user_id: userId, action },
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

      loadClientData();
    } catch (err: any) {
      toast.error("Failed to process: " + (err.message || "Unknown error"));
    } finally {
      setParsing(false);
      setShowDuplicateDialog(false);
      setParseResult(null);
      setPendingFilePath(null);
    }
  };

  const ndaDoc = documents.find((d) => d.document_type === "nda");

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-12 text-muted-foreground">Client not found.</div>;
  }

  return (
    <div className="space-y-6">
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

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/team/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-7 w-7 text-accent" />
            {profile.business_name || "Unnamed Client"}
          </h1>
        </div>
        <Badge variant={ndaDoc ? "default" : "secondary"} className="gap-1">
          <ShieldCheck className="h-3 w-3" />
          NDA: {ndaDoc ? "Signed" : "Not Signed"}
        </Badge>
        <Button
          variant={profile.access_granted ? "destructive" : "default"}
          onClick={toggleAccess}
          disabled={toggling}
          size="sm"
        >
          {profile.access_granted ? (
            <><ShieldX className="h-4 w-4 mr-1" /> Revoke Access</>
          ) : (
            <><ShieldCheck className="h-4 w-4 mr-1" /> Grant Access</>
          )}
        </Button>
      </div>

      {/* Parsing indicator */}
      {parsing && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/10 border border-accent/30">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent" />
          <span className="text-sm text-accent font-medium">Parsing batch sheet…</span>
        </div>
      )}

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Product Type</span>
              <p className="font-medium text-foreground">{profile.product_type || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Location</span>
              <p className="font-medium text-foreground">{profile.location || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Target Market</span>
              <p className="font-medium text-foreground">{profile.target_market || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p className="font-medium text-foreground">{profile.phone || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Website</span>
              <p className="font-medium text-foreground">{profile.website || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Access</span>
              <Badge variant={profile.access_granted ? "default" : "secondary"}>
                {profile.access_granted ? "Active" : "Pending"}
              </Badge>
            </div>
          </div>
          {profile.bio && (
            <div className="mt-4">
              <span className="text-muted-foreground text-sm">About</span>
              <p className="text-foreground text-sm mt-1">{profile.bio}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" />
            Documents ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const isPss = doc.document_type === "pss";
                const sheet = isPss ? batchSheetsByPss[doc.id] : undefined;
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.document_type.toUpperCase()} · {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {isPss && (
                      sheet ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/team/operations/batch-sheets/${sheet.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />Open batch sheet v{sheet.version}
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => createBatchSheet(doc.id)}
                          disabled={generatingForPss === doc.id}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                          {generatingForPss === doc.id ? "Creating…" : "Create batch sheet"}
                        </Button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <h4 className="text-sm font-medium">Upload Document</h4>
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={uploadDocType} onValueChange={setUploadDocType}>
                  <SelectTrigger className="w-[160px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nda">NDA</SelectItem>
                    <SelectItem value="pss">PSS</SelectItem>
                    <SelectItem value="batch_sheet">Batch Sheet</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="file"
                accept=".pdf,.xlsx,.xls"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="text-sm max-w-xs"
              />
              {uploadFile && (
                <Button size="sm" onClick={handleDocUpload} disabled={uploading || parsing}>
                  <Upload className="h-4 w-4 mr-1" />
                  {uploading ? "Uploading…" : parsing ? "Parsing…" : "Upload"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Concepts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            Concepts ({concepts.length})
          </CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/project/new?clientId=${userId}`}>
              <Plus className="h-4 w-4 mr-1" /> Add Product
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {concepts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No concepts yet.</p>
          ) : (
            <div className="space-y-2">
              {concepts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-foreground">{c.product_name}</p>
                    <p className="text-xs text-muted-foreground">{c.product_type || "No type"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cookie className="h-5 w-5 text-accent" />
            Products ({products.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-muted-foreground text-sm">No products yet.</p>
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-foreground">{p.product_name}</p>
                    <p className="text-xs text-muted-foreground">{p.category || "No category"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

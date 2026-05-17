import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Download } from "lucide-react";
import { fetchActiveTemplates, downloadTemplate, type ActiveTemplate } from "@/lib/templates";

interface AddDealDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (prfId: string) => void;
}

export const AddDealDialog = ({ open, onOpenChange, onCreated }: AddDealDialogProps) => {
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [product, setProduct] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCompany(""); setContact(""); setEmail(""); setProduct(""); setFile(null);
  };

  const submit = async () => {
    if (!email.trim()) { toast.error("Email is required"); return; }
    if (!file) { toast.error("Please attach the PRF file"); return; }

    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert PRF submission first to get id
      const { data: prf, error: prfErr } = await (supabase as any)
        .from("prf_submissions")
        .insert({
          email: email.trim().toLowerCase(),
          company_name: company.trim() || null,
          customer_name: contact.trim() || null,
          product_name: product.trim() || null,
          company_stage: "Established",
          status: "new",
          sales_stage: "Lead In",
          sales_stage_updated_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          owner_user_id: user?.id ?? null,
        })
        .select("id")
        .single();
      if (prfErr) throw prfErr;

      // Upload file
      const ext = file.name.split(".").pop() || "bin";
      const path = `${prf.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("prf-uploads").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;

      // Save attachment reference on the PRF
      await (supabase as any)
        .from("prf_submissions")
        .update({
          data_json: { prf_file: { path, name: file.name, size: file.size, type: file.type, uploaded_at: new Date().toISOString() } },
        })
        .eq("id", prf.id);

      toast.success("Deal created");
      reset();
      onOpenChange(false);
      onCreated?.(prf.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to create deal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add deal</DialogTitle>
          <DialogDescription>
            Upload the client's PRF and capture basic contact info. The deal will land in <strong>Lead In</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ad-company">Company</Label>
              <Input id="ad-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Foods" />
            </div>
            <div>
              <Label htmlFor="ad-contact">Contact name</Label>
              <Input id="ad-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Jane Doe" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ad-email">Email *</Label>
              <Input id="ad-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" />
            </div>
            <div>
              <Label htmlFor="ad-product">Product name</Label>
              <Input id="ad-product" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Sourdough crackers" />
            </div>
          </div>

          <div>
            <Label>PRF file *</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 w-full border border-dashed rounded-md p-4 flex items-center gap-3 hover:bg-muted/40 text-left"
            >
              {file ? <FileText className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
              <div className="text-sm">
                {file ? (
                  <>
                    <div className="font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · click to replace</div>
                  </>
                ) : (
                  <>
                    <div className="font-medium">Click to upload PRF</div>
                    <div className="text-xs text-muted-foreground">PDF, Word, Excel, image — max 20 MB</div>
                  </>
                )}
              </div>
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create deal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddDealDialog;

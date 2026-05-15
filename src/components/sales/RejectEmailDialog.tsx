import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mic, MicOff, Sparkles, Send, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  prfId: string;
  to: string;
  contactName?: string | null;
  companyName?: string | null;
  productName?: string | null;
}

export const RejectEmailDialog = ({
  open, onClose, onConfirmed, prfId, to, contactName, companyName, productName,
}: Props) => {
  const [dictation, setDictation] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!open) {
      setDictation(""); setSubject(""); setBody(""); setListening(false);
      try { recognitionRef.current?.stop(); } catch {}
    }
  }, [open]);

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice not supported in this browser. Type your note instead.");
      return;
    }
    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalText = dictation;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      setDictation((finalText + interim).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  };

  const polish = async () => {
    if (!dictation.trim()) {
      toast.error("Add a note first — what's the reason?");
      return;
    }
    setDrafting(true);
    const { data, error } = await supabase.functions.invoke("draft-rejection-email", {
      body: { dictation, contactName, companyName, productName },
    });
    setDrafting(false);
    if (error || data?.error) {
      toast.error(error?.message || data?.error || "Couldn't draft email");
      return;
    }
    setSubject(data.subject || "");
    setBody(data.body || "");
  };

  const sendAndArchive = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-rejection-email", {
      body: { to, subject, body, contactName },
    });
    if (error || data?.error) {
      setSending(false);
      toast.error(error?.message || data?.error || "Email failed");
      return;
    }

    // Mark PRF rejected
    await supabase.from("prf_submissions").update({ status: "rejected" }).eq("id", prfId);
    // Archive lead
    await supabase
      .from("sales_leads" as any)
      .update({
        stage: "Archived",
        stage_updated_at: new Date().toISOString(),
        archived_at: new Date().toISOString(),
        archived_reason: dictation.slice(0, 500),
      })
      .eq("email", to.toLowerCase());

    setSending(false);
    toast.success("Sent. Lead archived.");
    onConfirmed();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 team-portal" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[640px] tp-surface border border-[hsl(var(--tp-hairline))] rounded-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--tp-hairline))]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))]">Reject & email</p>
            <h2 className="font-display text-lg text-[hsl(var(--tp-text))]">
              To: {contactName || to}
            </h2>
          </div>
          <button onClick={onClose} className="tp-btn"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
                Your note (talk-to-text or type)
              </label>
              <button onClick={toggleMic} className={`tp-btn ${listening ? "tp-btn-primary" : ""}`}>
                {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                {listening ? "Stop" : "Dictate"}
              </button>
            </div>
            <textarea
              value={dictation}
              onChange={(e) => setDictation(e.target.value)}
              placeholder="e.g. Their volumes are too low for our minimums right now, but they seem like a good fit later…"
              rows={3}
              className="tp-input w-full resize-none"
            />
            <button
              onClick={polish}
              disabled={drafting || !dictation.trim()}
              className="tp-btn tp-btn-primary mt-2 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" /> {drafting ? "Drafting…" : "Polish with AI"}
            </button>
          </div>

          {(subject || body) && (
            <>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="tp-input w-full mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">Email body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="tp-input w-full mt-1 resize-none font-mono text-[13px]"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[hsl(var(--tp-hairline))]">
          <button onClick={onClose} className="tp-btn">Cancel</button>
          <button
            onClick={sendAndArchive}
            disabled={sending || !subject.trim() || !body.trim()}
            className="tp-btn tp-btn-primary disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send & archive"}
          </button>
        </div>
      </div>
    </div>
  );
};

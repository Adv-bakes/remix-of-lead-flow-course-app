// Drafts a polished rejection email from a salesperson's dictated note using Lovable AI Gateway.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { dictation, contactName, companyName, productName } = await req.json();
    if (!dictation || typeof dictation !== "string") {
      return new Response(JSON.stringify({ error: "Missing dictation" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You are an experienced bakery sales lead writing a kind, professional decline email to a prospective client.
Rules:
- Warm, respectful, concise (90-160 words).
- Acknowledge their submission and thank them for considering us.
- Convey the decline clearly but gently, weaving in the salesperson's reason naturally — never quote it verbatim or bullet it.
- Encourage them to reach out in the future if circumstances change.
- Sign off with "Warm regards,\\nThe Adventure Bakery Team".
- Output ONLY a JSON object: { "subject": "...", "body": "..." }. No markdown, no commentary.
- Body is plain text with line breaks. Greet by first name if provided, otherwise "Hello".`;

    const user = `Recipient: ${contactName || "(unknown)"}
Company: ${companyName || "(unknown)"}
Product: ${productName || "(their submitted product)"}
Salesperson's reason (raw, may be informal): ${dictation}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway: ${resp.status} ${text}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: { subject?: string; body?: string } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { subject: "", body: raw }; }

    return new Response(JSON.stringify({
      subject: parsed.subject || "Update on your Adventure Bakery submission",
      body: parsed.body || "",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

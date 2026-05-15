// Sends the salesperson-approved rejection email via Resend.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, subject, body, contactName } = await req.json();
    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing to/subject/body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fafaf7;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #efece4;">
<tr><td style="padding-bottom:20px;border-bottom:1px solid #efece4;">
<span style="font-size:18px;font-weight:700;color:#1a1a1a;letter-spacing:-0.3px;">Adventure Bakery</span>
</td></tr>
<tr><td style="padding-top:24px;font-size:15px;line-height:1.65;color:#333;white-space:pre-wrap;">${escape(body)}</td></tr>
</table>
<p style="margin-top:16px;font-size:11px;color:#999;">Adventure Bakery · Custom baked goods manufacturing</p>
</td></tr></table></body></html>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Adventure Bakery <hello@notify.adventurebakery.info>",
        to: [to],
        subject,
        html,
        text: body,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: `Resend: ${resp.status} ${text}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify({ ok: true, id: data?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

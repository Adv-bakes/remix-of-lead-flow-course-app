import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_EMAIL = "Gabriela@AdventureBakes.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: list } = await admin.auth.admin.listUsers();
    let user = list?.users?.find((u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase());

    const tempPassword = crypto.randomUUID() + "Aa1!";

    if (!user) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: TARGET_EMAIL,
        password: tempPassword,
        email_confirm: true,
      });
      if (error) throw error;
      user = created.user;
    }

    await admin.from("profiles").upsert({ id: user!.id, email: TARGET_EMAIL, access_granted: true }, { onConflict: "id" });

    // Remove any non-admin roles, ensure admin role exists
    await admin.from("user_roles").delete().eq("user_id", user!.id);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: user!.id, role: "admin" });
    if (roleErr) throw roleErr;

    // Send password reset so she can set her own password
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(TARGET_EMAIL, {
      redirectTo: `${new URL(req.url).origin.replace("functions.", "")}/team`,
    });

    return new Response(
      JSON.stringify({ success: true, user_id: user!.id, reset_email_sent: !resetErr, reset_error: resetErr?.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("bootstrap-admin error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

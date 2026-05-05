import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, EyeOff, Shield } from "lucide-react";
import logo from "@/assets/logo.png";

const TeamAuth = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const redirectByRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const role = data?.role || "user";
    if (role === "admin") navigate("/team/dashboard");
    else if (role === "staff") navigate("/team/operations-hub");
    else {
      toast.error("You don't have access to the Team Portal. Please use the Brand Portal login.");
      await supabase.auth.signOut();
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) redirectByRole(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) redirectByRole(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message.includes("Invalid login credentials") ? "Invalid email or password." : error.message);
        return;
      }
      if (data?.user) toast.success("Welcome back!");
    } catch { toast.error("An unexpected error occurred."); } finally { setIsLoading(false); }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) toast.error(error.message);
      else { toast.success("Password reset email sent!"); setShowResetModal(false); setResetEmail(""); }
    } catch { toast.error("An unexpected error occurred"); } finally { setIsLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(180deg, hsl(20 29% 12%) 0%, hsl(20 29% 18%) 100%)' }}>
      <div className="w-full max-w-md space-y-6">
        <Card className="w-full border-0" style={{ background: 'linear-gradient(135deg, rgba(245, 241, 230, 0.98) 0%, rgba(255, 253, 250, 0.98) 100%)', boxShadow: '0 8px 32px rgba(200, 155, 60, 0.15)' }}>
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex items-center gap-3">
              <img src={logo} alt="Adventure Bakery Logo" className="w-16 h-16" />
              <Shield className="w-8 h-8" style={{ color: '#C89B3C' }} />
            </div>
            <CardTitle className="text-2xl" style={{ color: '#2C1810' }}>AB Team Portal</CardTitle>
            <CardDescription className="text-base" style={{ color: '#8B7355' }}>Internal access — authorized personnel only</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-email">Email</Label>
                <Input id="team-email" type="email" placeholder="you@adventurebakery.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-password">Password</Label>
                <div className="relative">
                  <Input id="team-password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
              <div className="text-center mt-3">
                <button type="button" onClick={() => setShowResetModal(true)} className="text-sm hover:underline" style={{ color: '#C89B3C' }}>Forgot Password?</button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="border-0" style={{ background: 'linear-gradient(135deg, rgba(245, 241, 230, 0.98) 0%, rgba(255, 253, 250, 0.98) 100%)', boxShadow: '0 8px 32px rgba(200, 155, 60, 0.15)' }}>
          <DialogHeader>
            <DialogTitle style={{ color: '#2C1810' }}>Reset Password</DialogTitle>
            <DialogDescription style={{ color: '#8B7355' }}>Enter your email and we'll send you a reset link.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" placeholder="you@adventurebakery.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required /></div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowResetModal(false)} style={{ borderColor: '#C89B3C', color: '#C89B3C' }}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white" disabled={isLoading}>{isLoading ? "Sending..." : "Send Reset Link"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamAuth;

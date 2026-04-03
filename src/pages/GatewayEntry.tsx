import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/logo.png";
import ChoiceScreen from "@/components/ChoiceScreen";

// Validation schema
const leadSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100, "Name must be less than 100 characters"),
  companyName: z.string().trim().min(1, "Company name is required").max(100, "Company name must be less than 100 characters"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().min(1, "Phone number is required").max(20, "Phone must be less than 20 characters"),
});

const GatewayEntry = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showChoiceScreen, setShowChoiceScreen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    companyName: "",
    email: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const formatPhone = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === "phone") {
      value = formatPhone(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate form data
      const result = leadSchema.safeParse(formData);
      
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        toast.error("Please fix the validation errors before submitting.");
        setIsLoading(false);
        return;
      }

      // TODO: Save lead record to database
      // For now, we'll just show a success message and proceed
      console.log("Lead captured:", formData);
      
      // Persist lead data to localStorage so Stage 2 wizard can access it
      localStorage.setItem("prfLeadData", JSON.stringify(formData));
      
      toast.success("Information saved! Let's find the right path for you.");
      setShowChoiceScreen(true);
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (showChoiceScreen) {
    return <ChoiceScreen leadData={formData} />;
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background: 'linear-gradient(135deg, #2C1810 0%, #4A3728 50%, #2C1810 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <Card 
          className="border-0"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 241, 230, 0.98) 0%, rgba(255, 253, 250, 0.98) 100%)',
            boxShadow: '0 8px 32px rgba(200, 155, 60, 0.25)'
          }}
        >
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto">
              <img src={logo} alt="Adventure Bakery Logo" className="w-20 h-20 mx-auto" />
            </div>
            <CardTitle className="text-2xl" style={{ color: '#2C1810' }}>
              Welcome to Adventure Bakery
            </CardTitle>
            <CardDescription className="text-base" style={{ color: '#8B7355' }}>
              Ready to scale your food product? Let's get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Jane Smith"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  className={errors.fullName ? "border-destructive" : ""}
                  required
                />
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Sweet Treats LLC"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  className={errors.companyName ? "border-destructive" : ""}
                  required
                />
                {errors.companyName && (
                  <p className="text-sm text-destructive">{errors.companyName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane@sweetreats.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className={errors.email ? "border-destructive" : ""}
                  required
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className={errors.phone ? "border-destructive" : ""}
                  required
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">{errors.phone}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-[#C89B3C] to-[#D4A855] hover:from-[#B8892C] hover:to-[#C89B3C] text-white mt-6" 
                disabled={isLoading}
              >
                {isLoading ? "Saving..." : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm font-medium mt-6" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
          Built for food entrepreneurs ready to scale beyond the kitchen.
        </p>
      </div>
    </div>
  );
};

export default GatewayEntry;

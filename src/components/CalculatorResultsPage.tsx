'use client'

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, DollarSign, FileText, Phone, Calendar, AlertCircle, Star, Shield, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface EstimateLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  project_type_name: string;
  square_footage: number | null;
  space_height: number | null;
  total_material_cost: number | null;
  total_labor_cost: number | null;
  combined_total: number | null;
  estimate_range_min: number | null;
  estimate_range_max: number | null;
  project_timeline: string | null;
  requires_manual_estimate: boolean;
}

export default function ResultsPage() {
  const params = useParams();
  const leadId = params.leadId as string;
  const router = useRouter();
  const [lead, setLead] = useState<EstimateLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [ctaType, setCtaType] = useState<"assessment" | "phone" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!leadId) {
      router.push("/project-calculator");
      return;
    }
    loadLead();
  }, [leadId]);

  const loadLead = async () => {
    try {
      setLoading(true);

      // First, check sessionStorage for cached lead data (avoids RLS issues)
      const cachedData = sessionStorage.getItem(`estimate_lead_${leadId}`);
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        setLead(parsedData);
        // Clean up sessionStorage after use
        sessionStorage.removeItem(`estimate_lead_${leadId}`);
        setLoading(false);
        return;
      }

      // Fallback to database fetch if not in sessionStorage
      const { data, error } = await supabase
        .from("estimate_leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({
          title: "Estimate Not Found",
          description: "This estimate could not be found. Please submit a new request.",
          variant: "destructive",
        });
        router.push("/project-calculator");
        return;
      }

      setLead(data);
    } catch (error: any) {
      console.error("Error loading lead:", error);
      toast({
        title: "Error",
        description: "Failed to load estimate details.",
        variant: "destructive",
      });
      router.push("/project-calculator");
    } finally {
      setLoading(false);
    }
  };

  const handleCTAClick = (type: "assessment" | "phone") => {
    setCtaType(type);
    setTimelineModalOpen(true);
  };

  const handleTimelineSelect = async (timeline: string) => {
    if (!leadId) return;

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.functions.invoke('request-calculator-assessment', {
        body: {
          lead_id: leadId,
          assessment_type: ctaType === "assessment" ? "in-person" : "phone",
          project_timeline: timeline,
        },
      });

      if (error) throw error;

      const ctaText = ctaType === "assessment" ? "in-person assessment" : "phone consultation";
      toast({
        title: "Request Submitted!",
        description: `We'll contact you within 24 hours to schedule your ${ctaText}.`,
      });
      
      setTimelineModalOpen(false);
    } catch (error: any) {
      console.error("Error requesting assessment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit request. Please try again or call us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "$0";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your estimate...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <Button
            variant="ghost"
            onClick={() => router.push("/project-calculator")}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Calculator
          </Button>

          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-8 h-8" />
                <h1 className="text-3xl font-bold">Your Estimate is Ready!</h1>
              </div>
              <p className="text-muted-foreground">
                Hi {lead.first_name}, here's your {lead.project_type_name} estimate
              </p>
            </div>

            {/* Main Estimate Card */}
            {!lead.requires_manual_estimate && lead.estimate_range_min && lead.estimate_range_max ? (
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Estimated Project Cost
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-4xl font-bold text-primary">
                      {formatCurrency(lead.estimate_range_min)} - {formatCurrency(lead.estimate_range_max)}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Based on {lead.square_footage} sq ft project
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                    <AlertCircle className="w-5 h-5" />
                    Manual Estimate Required
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    Your {lead.project_type_name} project requires a detailed in-person assessment. 
                    We'll review your plans and contact you within 48 hours with a comprehensive quote.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Cost Breakdown */}
            {!lead.requires_manual_estimate && lead.combined_total && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Cost Breakdown
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Breakdown based on your project scope</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Materials</span>
                    <span className="font-semibold">{Math.round((lead.total_material_cost / lead.combined_total) * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Labor</span>
                    <span className="font-semibold">{Math.round((lead.total_labor_cost / lead.combined_total) * 100)}%</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Why Choose Us */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-primary" />
                  Why Choose Us
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Licensed & Insured</p>
                    <p className="text-sm text-muted-foreground">Fully licensed contractors with comprehensive insurance</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">20+ Years Experience</p>
                    <p className="text-sm text-muted-foreground">Serving Northern NJ with quality workmanship</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Transparent Pricing</p>
                    <p className="text-sm text-muted-foreground">No hidden fees or surprise costs</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* What Could Affect Pricing */}
            <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                  <AlertCircle className="w-5 h-5" />
                  What Could Affect Pricing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                  <p>Existing plumbing or electrical issues that need repair</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                  <p>Structural modifications or load-bearing wall adjustments</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                  <p>Material availability and lead times</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
                  <p>Permit fees and local building code compliance</p>
                </div>
              </CardContent>
            </Card>

            {/* Non-Negotiables */}
            <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
                  <Shield className="w-5 h-5" />
                  Our Non-Negotiables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                  <p><strong>Quality Materials:</strong> We only use premium, long-lasting materials</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                  <p><strong>Building Codes:</strong> 100% compliance with local regulations</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
                  <p><strong>Clean Worksite:</strong> Daily cleanup and debris removal</p>
                </div>
              </CardContent>
            </Card>

            {/* Legal Disclaimer */}
            <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground">
              <p className="font-semibold mb-2">Important Notice:</p>
              <p>
                This estimate is provided for informational purposes only and does not constitute a binding contract. 
                Final pricing may vary based on site conditions and specific requirements. All work is subject to a 
                detailed written proposal and signed contract.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button
                size="lg"
                className="flex-1"
                onClick={() => handleCTAClick("assessment")}
              >
                <Calendar className="w-5 h-5 mr-2" />
                Request In-Person Assessment
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                onClick={() => handleCTAClick("phone")}
              >
                <Phone className="w-5 h-5 mr-2" />
                Request Phone Consultation
              </Button>
            </div>
          </div>

          {/* Timeline Selection Modal */}
          <Dialog open={timelineModalOpen} onOpenChange={setTimelineModalOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>When would you like to start?</DialogTitle>
                <DialogDescription>
                  Select your preferred timeline to help us schedule your {ctaType === "assessment" ? "in-person assessment" : "phone consultation"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleTimelineSelect("24-48 hours")}
                  disabled={isSubmitting}
                >
                  <div className="text-left">
                    <p className="font-semibold">As Soon As Possible</p>
                    <p className="text-sm text-muted-foreground">Within 24-48 hours</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleTimelineSelect("1-2 weeks")}
                  disabled={isSubmitting}
                >
                  <div className="text-left">
                    <p className="font-semibold">Within 1-2 Weeks</p>
                    <p className="text-sm text-muted-foreground">Flexible scheduling</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleTimelineSelect("2-4 weeks")}
                  disabled={isSubmitting}
                >
                  <div className="text-left">
                    <p className="font-semibold">Within 2-4 Weeks</p>
                    <p className="text-sm text-muted-foreground">Planning ahead</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handleTimelineSelect("1-3 months")}
                  disabled={isSubmitting}
                >
                  <div className="text-left">
                    <p className="font-semibold">Within 1-3 Months</p>
                    <p className="text-sm text-muted-foreground">Future planning</p>
                  </div>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
  );
}

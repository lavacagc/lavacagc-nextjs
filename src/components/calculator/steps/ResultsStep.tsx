import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, DollarSign, FileText, Download, Phone, Calendar, AlertCircle, Star, Shield } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DimensionsData } from "./DimensionsStep";
import { QualityLevelData } from "./QualityLevelStep";
import { MaterialOptionsData } from "./MaterialOptionsStep";
import { AdditionalFeaturesData } from "./AdditionalFeaturesStep";

interface ResultsStepProps {
  onBack: () => void;
  leadId?: string;
  dimensions?: DimensionsData;
  qualityLevel?: QualityLevelData;
  materialOptions?: MaterialOptionsData;
  additionalFeatures?: AdditionalFeaturesData;
}

export const ResultsStep = ({
  onBack,
  leadId,
  dimensions,
  qualityLevel,
  materialOptions,
  additionalFeatures,
}: ResultsStepProps) => {
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [, setSelectedTimeline] = useState<string | null>(null);
  const [ctaType, setCtaType] = useState<"assessment" | "phone" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Calculate base cost based on dimensions and quality level
  const calculateBaseCost = () => {
    if (!dimensions || !qualityLevel) return 0;
    
    const sqft = dimensions.length * dimensions.width;
    let costPerSqft = 150; // Base cost
    
    if (qualityLevel.qualityLevel === "mid-range") {
      costPerSqft = 250;
    } else if (qualityLevel.qualityLevel === "premium") {
      costPerSqft = 400;
    }
    
    return sqft * costPerSqft;
  };

  // Calculate material options cost
  const calculateMaterialsCost = () => {
    if (!materialOptions) return 0;
    
    const costs: Record<string, number> = {
      "luxury-vanity": 2500,
      "custom-tile": 3000,
      "heated-floor": 2000,
      "rainfall-shower": 1500,
      "dual-sink": 1800,
      "soaking-tub": 3500,
      "led-mirror": 800,
      "bluetooth-fan": 400,
    };
    
    return materialOptions.selectedOptions.reduce((total, option) => {
      return total + (costs[option] || 0);
    }, 0);
  };

  // Calculate additional features cost
  const calculateFeaturesCost = () => {
    if (!additionalFeatures) return 0;
    
    const costs: Record<string, number> = {
      "custom-cabinetry": 2000,
      "premium-hardware": 800,
      "mirror-upgrade": 1200,
      "glass-enclosure": 2500,
    };
    
    return additionalFeatures.additionalFeatures.reduce((total, feature) => {
      return total + (costs[feature] || 0);
    }, 0);
  };

  const baseCost = calculateBaseCost();
  const materialsCost = calculateMaterialsCost();
  const featuresCost = calculateFeaturesCost();
  const subtotal = baseCost + materialsCost + featuresCost;
  const taxRate = 0.07; // 7% tax
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  // Calculate range (±15%)
  const lowEstimate = Math.round(total * 0.85);
  const highEstimate = Math.round(total * 1.15);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleCTAClick = (type: "assessment" | "phone") => {
    setCtaType(type);
    setTimelineModalOpen(true);
  };

  const handleTimelineSelect = async (timeline: string) => {
    if (!leadId) {
      toast({
        title: "Error",
        description: "Lead information is missing. Please try submitting the form again.",
        variant: "destructive",
      });
      return;
    }

    setSelectedTimeline(timeline);
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
    } catch (error: unknown) {
      console.error("Error requesting assessment:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit request. Please try again or call us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Your Estimate is Ready!</h2>
        </div>
        <p className="text-muted-foreground">
          Here&apos;s a detailed breakdown of your bathroom remodeling project
        </p>
      </div>

      {/* Main Estimate Card */}
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
              {formatCurrency(lowEstimate)} - {formatCurrency(highEstimate)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Based on your selections and project details
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base Renovation Cost</span>
            <span className="font-semibold">{formatCurrency(baseCost)}</span>
          </div>
          
          {materialsCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Material Options</span>
              <span className="font-semibold">{formatCurrency(materialsCost)}</span>
            </div>
          )}
          
          {featuresCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Additional Features</span>
              <span className="font-semibold">{formatCurrency(featuresCost)}</span>
            </div>
          )}
          
          <Separator />
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">{formatCurrency(subtotal)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax (7%)</span>
            <span className="font-semibold">{formatCurrency(tax)}</span>
          </div>
          
          <Separator className="my-2" />
          
          <div className="flex justify-between text-lg">
            <span className="font-bold">Total Estimate</span>
            <span className="font-bold text-primary">{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Project Summary */}
      {dimensions && qualityLevel && (
        <Card>
          <CardHeader>
            <CardTitle>Project Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dimensions:</span>
              <span>{dimensions.length}&apos; × {dimensions.width}&apos;</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Square Footage:</span>
              <span>{dimensions.length * dimensions.width} sq ft</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quality Level:</span>
              <span className="capitalize">{qualityLevel.qualityLevel.replace("-", " ")}</span>
            </div>
            {materialOptions && materialOptions.selectedOptions.length > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Material Options:</span>
                <span>{materialOptions.selectedOptions.length} selected</span>
              </div>
            )}
            {additionalFeatures && additionalFeatures.additionalFeatures.length > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Additional Features:</span>
                <span>{additionalFeatures.additionalFeatures.length} selected</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Why Choose Us Section */}
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
              <p className="text-sm text-muted-foreground">Fully licensed contractors with comprehensive insurance coverage</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">20+ Years Experience</p>
              <p className="text-sm text-muted-foreground">Serving Northern NJ with exceptional craftsmanship</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Transparent Pricing</p>
              <p className="text-sm text-muted-foreground">No hidden fees or surprise costs</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Quality Guarantee</p>
              <p className="text-sm text-muted-foreground">5-year warranty on all workmanship</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What Could Affect Pricing Section */}
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
            <p>Asbestos or mold remediation requirements</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
            <p>Permit fees and local building code compliance</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
            <p>Accessibility modifications or ADA compliance</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 mt-1">•</span>
            <p>Disposal costs for old fixtures and materials</p>
          </div>
        </CardContent>
      </Card>

      {/* Non-Negotiables Section */}
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
            <p><strong>Licensed Professionals:</strong> All work performed by certified tradespeople</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
            <p><strong>Building Codes:</strong> 100% compliance with local regulations</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
            <p><strong>Clean Worksite:</strong> Daily cleanup and debris removal</p>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-1 flex-shrink-0" />
            <p><strong>Clear Communication:</strong> Regular updates throughout your project</p>
          </div>
        </CardContent>
      </Card>

      {/* Legal Disclaimer */}
      <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground">
        <p className="font-semibold mb-2">Important Notice:</p>
        <p>
          This estimate is provided for informational purposes only and does not constitute a binding contract or quote. 
          Final pricing may vary based on site conditions, material availability, and specific project requirements discovered 
          during the in-person assessment. All work is subject to a detailed written proposal and signed contract. Prices are 
          valid for 30 days from the estimate date.
        </p>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <Button
          type="button"
          size="lg"
          className="flex-1"
          onClick={() => handleCTAClick("assessment")}
        >
          <Calendar className="w-5 h-5 mr-2" />
          Request In-Person Assessment
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="flex-1"
          onClick={() => handleCTAClick("phone")}
        >
          <Phone className="w-5 h-5 mr-2" />
          Request Phone Consultation
        </Button>
      </div>

      {/* Additional Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="flex-1"
        >
          Back to Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="flex-1"
        >
          <Download className="w-4 h-4 mr-2" />
          Download PDF Estimate
        </Button>
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
                <p className="font-semibold">1-3 Months</p>
                <p className="text-sm text-muted-foreground">Future planning</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              onClick={() => handleTimelineSelect("just researching")}
            >
              <div className="text-left">
                <p className="font-semibold">Just Researching</p>
                <p className="text-sm text-muted-foreground">Exploring options</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

'use client'

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/Breadcrumb";
import CanonicalUrl from "@/components/CanonicalUrl";
import { ProgressBar } from "@/components/calculator/ProgressBar";
import { ProjectTypeSelectionStep, ProjectTypeData } from "@/components/calculator/steps/ProjectTypeSelectionStep";
import { DimensionsStep, DimensionsData } from "@/components/calculator/steps/DimensionsStep";
import { QualityLevelStep, QualityLevelData } from "@/components/calculator/steps/QualityLevelStep";
import { MaterialOptionsStep, MaterialOptionsData } from "@/components/calculator/steps/MaterialOptionsStep";
import { AdditionalFeaturesStep, AdditionalFeaturesData } from "@/components/calculator/steps/AdditionalFeaturesStep";
import { ContactInfoStep, ContactInfoData } from "@/components/calculator/steps/ContactInfoStep";
import { ProjectOverviewStep, ProjectOverviewData } from "@/components/calculator/steps/ProjectOverviewStep";
import { PDFUploadStep, PDFUploadData } from "@/components/calculator/steps/PDFUploadStep";
import { ConfirmationStep } from "@/components/calculator/steps/ConfirmationStep";
import { trackCalculatorStep } from "@/services/analyticsManager";

export default function UnifiedCalculator() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stepEntryTime = useRef<number>(Date.now());

  // Form data state
  const [projectTypeData, setProjectTypeData] = useState<ProjectTypeData | null>(null);
  const [dimensionsData, setDimensionsData] = useState<DimensionsData | null>(null);
  const [qualityData, setQualityData] = useState<QualityLevelData | null>(null);
  const [materialOptionsData, setMaterialOptionsData] = useState<MaterialOptionsData | null>(null);
  const [additionalFeaturesData, setAdditionalFeaturesData] = useState<AdditionalFeaturesData | null>(null);
  const [projectOverviewData, setProjectOverviewData] = useState<ProjectOverviewData | null>(null);
  const [pdfUploadData, setPdfUploadData] = useState<PDFUploadData | null>(null);

  // Calculate total steps based on project type
  const getTotalSteps = () => {
    if (!projectTypeData) return 6;
    if (projectTypeData.requiresPDFUpload) return 4; // Type -> Overview -> Upload -> Contact -> Confirmation
    return 6; // Type -> Dimensions -> Quality -> Materials -> Features -> Contact
  };

  // Get step name for analytics
  const getStepName = (step: number): string => {
    if (!projectTypeData) {
      if (step === 1) return "Project Type Selection";
      return `Step ${step}`;
    }

    if (projectTypeData.requiresPDFUpload) {
      const pdfSteps = ["Project Type Selection", "Project Overview", "PDF Upload", "Contact Information", "Confirmation"];
      return pdfSteps[step - 1] || `Step ${step}`;
    }

    const standardSteps = ["Project Type Selection", "Dimensions", "Quality Level", "Material Options", "Additional Features", "Contact Information"];
    return standardSteps[step - 1] || `Step ${step}`;
  };

  // Track calculator step changes
  useEffect(() => {
    const stepName = getStepName(currentStep);

    // Track entry to new step
    trackCalculatorStep(currentStep, stepName, 'enter');
    stepEntryTime.current = Date.now();

    // Track exit from previous step when component unmounts or step changes
    return () => {
      const timeSpent = Math.round((Date.now() - stepEntryTime.current) / 1000);
      if (timeSpent >= 1) { // Only track if user spent at least 1 second
        trackCalculatorStep(currentStep, stepName, 'exit', timeSpent);
      }
    };
  }, [currentStep, projectTypeData]);

  const handleProjectTypeNext = (data: ProjectTypeData) => {
    setProjectTypeData(data);
    setCurrentStep(2);
  };

  const handleDimensionsNext = (data: DimensionsData) => {
    setDimensionsData(data);
    setCurrentStep(3);
  };

  const handleQualityNext = (data: QualityLevelData) => {
    setQualityData(data);
    setCurrentStep(4);
  };

  const handleMaterialOptionsNext = (data: MaterialOptionsData) => {
    setMaterialOptionsData(data);
    setCurrentStep(5);
  };

  const handleAdditionalFeaturesNext = (data: AdditionalFeaturesData) => {
    setAdditionalFeaturesData(data);
    setCurrentStep(6);
  };

  const handleContactInfoNext = async (data: ContactInfoData) => {
    if (!projectTypeData) return;

    setIsSubmitting(true);

    try {
      if (projectTypeData.requiresPDFUpload) {
        // Handle home addition submission
        const { data: response, error } = await supabase.functions.invoke("submit-home-addition", {
          body: {
            project_description: projectOverviewData?.projectDescription || "",
            project_location: projectOverviewData?.projectLocation || "",
            uploaded_plans: pdfUploadData?.uploadedPDFs || [],
            lead_data: {
              first_name: data.firstName,
              last_name: data.lastName,
              email: data.email,
              phone: data.phone,
              street_address: data.streetAddress,
              city: data.city,
              state: data.state,
              zip_code: data.zipCode,
              lead_source: data.leadSource,
              best_contact_time: data.bestTimeToContact,
              marketing_consent: false,
            },
          },
        });

        if (error) throw error;

        // Track calculator completion
        trackCalculatorStep(getTotalSteps() + 1, "Confirmation", 'complete');
        setCurrentStep(getTotalSteps() + 1); // Show confirmation
      } else {
        // Handle standard calculator submission
        const { data: response, error } = await supabase.functions.invoke("calculate-estimate", {
          body: {
            project_type: projectTypeData.projectType,
            square_footage: dimensionsData?.squareFootage,
            space_height: dimensionsData?.ceilingHeight,
            space_length: dimensionsData?.length,
            space_width: dimensionsData?.width,
            selected_options: materialOptionsData?.selectedOptions || [],
            lead_data: {
              first_name: data.firstName,
              last_name: data.lastName,
              email: data.email,
              phone: data.phone,
              street_address: data.streetAddress,
              city: data.city,
              state: data.state,
              zip_code: data.zipCode,
              lead_source: data.leadSource,
              best_contact_time: data.bestTimeToContact,
              marketing_consent: false,
            },
          },
        });

        if (error) throw error;

        // Store only non-sensitive lead data in sessionStorage to avoid RLS fetch issues
        // Exclude PII like email, phone, full address for security
        if (response.lead_data) {
          const safeLeadData = {
            id: response.lead_data.id,
            first_name: response.lead_data.first_name,
            project_type_name: response.lead_data.project_type_name,
            square_footage: response.lead_data.square_footage,
            estimate_range_min: response.lead_data.estimate_range_min,
            estimate_range_max: response.lead_data.estimate_range_max,
            total_material_cost: response.lead_data.total_material_cost,
            total_labor_cost: response.lead_data.total_labor_cost,
            combined_total: response.lead_data.combined_total,
            requires_manual_estimate: response.lead_data.requires_manual_estimate,
            selected_options: response.lead_data.selected_options,
            created_at: response.lead_data.created_at,
          };
          sessionStorage.setItem(`estimate_lead_${response.lead_id}`, JSON.stringify(safeLeadData));
        }

        // Track calculator completion
        trackCalculatorStep(getTotalSteps(), "Contact Information", 'complete');
        router.push(`/project-calculator/result/${response.lead_id}`);
      }
    } catch (error) {
      console.error("Error submitting calculator:", error);
      toast({
        title: "Error",
        description: "Failed to submit your estimate request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProjectOverviewNext = (data: ProjectOverviewData) => {
    setProjectOverviewData(data);
    setCurrentStep(3);
  };

  const handlePDFUploadNext = (data: PDFUploadData) => {
    setPdfUploadData(data);
    setCurrentStep(4);
  };

  const getProjectTypeForMaterials = (): "bathroom" | "kitchen" | "living-space" => {
    if (projectTypeData?.projectType === "bathroom") return "bathroom";
    if (projectTypeData?.projectType === "kitchen") return "kitchen";
    return "living-space";
  };

  if (isSubmitting) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Processing your request...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <CanonicalUrl />

      <Header />
      <div className="min-h-screen bg-background">
        {/* Breadcrumb Navigation */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section with Local Context */}
        {currentStep === 1 && (
          <section className="relative py-16 md:py-20 overflow-hidden">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent-sunset/5"></div>
            
            {/* Decorative blurred circles */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-20 left-10 w-32 h-32 bg-primary rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-20 right-10 w-40 h-40 bg-accent-sunset rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
              <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-accent-tangerine rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="container mx-auto px-4 relative">
              <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
                <div className="space-y-4">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                    Free Home Renovation
                    <span className="block text-transparent bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-clip-text animate-fade-in">
                      Cost Calculator
                    </span>
                  </h1>
                  <p className="text-xl md:text-2xl text-text-secondary max-w-2xl mx-auto">
                    Get Instant, Accurate Estimates for Your Northern New Jersey Home Project
                  </p>
                </div>

                {/* Service areas badges */}
                <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                  {['Montclair', 'Short Hills', 'Millburn', 'Morristown', 'Livingston', 'West Orange'].map((area) => (
                    <span key={area} className="inline-flex items-center px-3 py-1.5 rounded-full bg-card border border-primary/20 text-sm text-foreground shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300">
                      <span className="w-2 h-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                      {area}
                    </span>
                  ))}
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-sm text-primary font-medium">
                    +6 More Areas
                  </span>
                </div>

                <div className="max-w-2xl mx-auto">
                  <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                    Choose your project type below to get started with your personalized cost estimate. 
                    Our calculator considers local Northern NJ material costs, labor rates, and project complexity.
                  </p>
                </div>

                {/* Trust indicators */}
                <div className="flex flex-wrap justify-center gap-6 md:gap-8 pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-2xl">⚡</span>
                    </div>
                    <span className="text-sm font-medium">2-Min Estimate</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-2xl">💯</span>
                    </div>
                    <span className="text-sm font-medium">100% Free</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-2xl">🏆</span>
                    </div>
                    <span className="text-sm font-medium">NJ Licensed</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Main Calculator Section */}
        <div className="container mx-auto px-4 py-12 md:py-16">
          {/* Progress Bar */}
          {currentStep > 1 && currentStep <= getTotalSteps() && (
            <div className="max-w-[700px] mx-auto mb-10 animate-fade-in">
              <ProgressBar currentStep={currentStep} totalSteps={getTotalSteps()} />
            </div>
          )}

          {/* Steps Container with Card Styling */}
          <div className="max-w-[700px] mx-auto">
            {/* Step 1: Project Type Selection */}
            {currentStep === 1 && (
              <ProjectTypeSelectionStep
                onNext={handleProjectTypeNext}
                initialData={projectTypeData || undefined}
              />
            )}

            {/* Wrap other steps in card for visual consistency */}
            {currentStep > 1 && (
              <div className="bg-card border border-border rounded-2xl shadow-card p-6 md:p-8 animate-fade-in">
                {/* Standard Calculator Flow */}
                {projectTypeData && !projectTypeData.requiresPDFUpload && (
                  <>
                    {currentStep === 2 && (
                      <DimensionsStep
                        onNext={handleDimensionsNext}
                        onBack={() => setCurrentStep(1)}
                        initialData={dimensionsData || undefined}
                      />
                    )}

                    {currentStep === 3 && (
                      <QualityLevelStep
                        onNext={handleQualityNext}
                        onBack={() => setCurrentStep(2)}
                        initialData={qualityData || undefined}
                      />
                    )}

                    {currentStep === 4 && (
                      <MaterialOptionsStep
                        onNext={handleMaterialOptionsNext}
                        onBack={() => setCurrentStep(3)}
                        initialData={materialOptionsData || undefined}
                        projectType={getProjectTypeForMaterials()}
                      />
                    )}

                    {currentStep === 5 && (
                      <AdditionalFeaturesStep
                        onNext={handleAdditionalFeaturesNext}
                        onBack={() => setCurrentStep(4)}
                        initialData={additionalFeaturesData || undefined}
                      />
                    )}

                    {currentStep === 6 && (
                      <ContactInfoStep
                        onNext={handleContactInfoNext}
                        onBack={() => setCurrentStep(5)}
                      />
                    )}
                  </>
                )}

                {/* Home Addition Flow */}
                {projectTypeData && projectTypeData.requiresPDFUpload && (
                  <>
                    {currentStep === 2 && (
                      <ProjectOverviewStep
                        onNext={handleProjectOverviewNext}
                        onBack={() => setCurrentStep(1)}
                        initialData={projectOverviewData || undefined}
                      />
                    )}

                    {currentStep === 3 && (
                      <PDFUploadStep
                        onNext={handlePDFUploadNext}
                        onBack={() => setCurrentStep(2)}
                        initialData={pdfUploadData || undefined}
                      />
                    )}

                    {currentStep === 4 && (
                      <ContactInfoStep
                        onNext={handleContactInfoNext}
                        onBack={() => setCurrentStep(3)}
                      />
                    )}

                    {currentStep === 5 && <ConfirmationStep onBack={() => setCurrentStep(4)} />}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

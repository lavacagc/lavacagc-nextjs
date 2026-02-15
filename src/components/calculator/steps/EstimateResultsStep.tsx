import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, Download, RotateCcw } from "lucide-react";

interface UpgradeOption {
  id: string;
  name: string;
  description?: string;
  percentageIncrease: number;
}

interface EstimateResultsStepProps {
  projectTypeName: string;
  squareFootage: number;
  basePrice: number;
  selectedUpgrades: string[];
  upgradeOptions: UpgradeOption[];
  onStartOver: () => void;
  onGetQuote: () => void;
}

export const EstimateResultsStep = ({
  projectTypeName,
  squareFootage,
  basePrice,
  selectedUpgrades,
  upgradeOptions,
  onStartOver,
  onGetQuote,
}: EstimateResultsStepProps) => {
  // Calculate costs
  const baseCost = squareFootage * basePrice;
  
  let upgradeCost = 0;
  const selectedUpgradeDetails = upgradeOptions.filter((u) =>
    selectedUpgrades.includes(u.id)
  );
  
  selectedUpgradeDetails.forEach((upgrade) => {
    upgradeCost += baseCost * (upgrade.percentageIncrease / 100);
  });

  const totalCost = baseCost + upgradeCost;
  const minEstimate = totalCost * 0.85;
  const maxEstimate = totalCost * 1.15;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-8 animate-fade-in">
      {/* Left: Summary */}
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Your Project Summary
          </h2>
          <p className="text-muted-foreground">
            Based on your selections, here&apos;s what we estimated
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-medium text-foreground">Project Type</span>
              <span className="text-muted-foreground">{projectTypeName}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-medium text-foreground">Square Footage</span>
              <span className="text-muted-foreground">{squareFootage} sq ft</span>
            </div>
            {selectedUpgradeDetails.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <span className="font-medium text-foreground block">Selected Upgrades</span>
                  {selectedUpgradeDetails.map((upgrade) => (
                    <div key={upgrade.id} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{upgrade.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <h3 className="text-xl font-bold text-foreground">Why Choose Us?</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              "Licensed & Insured",
              "10+ Years Experience",
              "Quality Guarantee",
              "Free Consultation",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          onClick={onStartOver}
          size="lg"
          className="w-full sm:w-auto"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Start Over
        </Button>
      </div>

      {/* Right: Estimate Panel (Sticky) */}
      <div className="lg:sticky lg:top-6 h-fit">
        <Card className="overflow-hidden">
          {/* Gradient Header */}
          <div className="bg-gradient-to-r from-primary to-accent-sunset p-6 text-center">
            <p className="text-primary-foreground/90 text-sm font-medium mb-2">
              Estimated Cost Range
            </p>
            <p className="text-3xl font-bold text-primary-foreground">
              {formatCurrency(minEstimate)} - {formatCurrency(maxEstimate)}
            </p>
          </div>

          {/* Breakdown */}
          <div className="p-6 space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Base Cost</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(baseCost)}
                </span>
              </div>
              
              {upgradeCost > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Upgrades</span>
                  <span className="font-semibold text-foreground">
                    +{formatCurrency(upgradeCost)}
                  </span>
                </div>
              )}
              
              <Separator />
              
              <div className="flex justify-between items-center">
                <span className="font-medium text-foreground">Estimated Total</span>
                <span className="text-xl font-bold text-primary">
                  {formatCurrency(totalCost)}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Button
                onClick={onGetQuote}
                size="lg"
                className="w-full h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300"
              >
                Get Detailed Quote
              </Button>
              
              <Button
                variant="outline"
                size="lg"
                className="w-full h-12"
              >
                <Download className="w-4 h-4 mr-2" />
                Save Estimate
              </Button>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This is an estimate based on typical projects. Final costs may vary based on
                specific requirements, materials chosen, and site conditions. Valid for 30 days.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

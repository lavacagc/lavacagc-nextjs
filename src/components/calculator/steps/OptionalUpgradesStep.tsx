import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  percentageIncrease: number;
}

export interface OptionalUpgradesData {
  selectedUpgrades: string[];
}

interface OptionalUpgradesStepProps {
  onNext: (data: OptionalUpgradesData) => void;
  onBack: () => void;
  initialData?: OptionalUpgradesData;
  projectType: string;
}

const upgradeOptions: Record<string, UpgradeOption[]> = {
  bathroom: [
    {
      id: "premium_materials",
      name: "Premium Materials",
      description: "High-end tiles, fixtures, and finishes",
      percentageIncrease: 20,
    },
    {
      id: "custom_fixtures",
      name: "Custom Fixtures",
      description: "Designer faucets, lighting, and hardware",
      percentageIncrease: 15,
    },
    {
      id: "smart_home",
      name: "Smart Home Integration",
      description: "Smart mirrors, heated floors, automated lighting",
      percentageIncrease: 10,
    },
  ],
  kitchen: [
    {
      id: "premium_appliances",
      name: "Premium Appliances",
      description: "High-end brands like Wolf, Sub-Zero, or Miele",
      percentageIncrease: 25,
    },
    {
      id: "custom_cabinetry",
      name: "Custom Cabinetry",
      description: "Handcrafted, made-to-measure cabinets",
      percentageIncrease: 20,
    },
    {
      id: "smart_kitchen",
      name: "Smart Kitchen Features",
      description: "Smart appliances, automated lighting, and controls",
      percentageIncrease: 10,
    },
  ],
  living_space: [
    {
      id: "premium_flooring",
      name: "Premium Flooring",
      description: "Hardwood, luxury vinyl, or designer tiles",
      percentageIncrease: 15,
    },
    {
      id: "custom_built_ins",
      name: "Custom Built-ins",
      description: "Shelving, entertainment centers, and storage",
      percentageIncrease: 20,
    },
    {
      id: "smart_living",
      name: "Smart Living Features",
      description: "Automated blinds, lighting, and climate control",
      percentageIncrease: 10,
    },
  ],
};

export const OptionalUpgradesStep = ({
  onNext,
  onBack,
  initialData,
  projectType,
}: OptionalUpgradesStepProps) => {
  const [selectedUpgrades, setSelectedUpgrades] = useState<string[]>(
    initialData?.selectedUpgrades || []
  );

  const upgrades = upgradeOptions[projectType] || [];

  const handleToggleUpgrade = (upgradeId: string) => {
    setSelectedUpgrades((prev) =>
      prev.includes(upgradeId)
        ? prev.filter((id) => id !== upgradeId)
        : [...prev, upgradeId]
    );
  };

  const handleContinue = () => {
    onNext({ selectedUpgrades });
  };

  const handleSkip = () => {
    onNext({ selectedUpgrades: [] });
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold text-foreground">
          Customize Your Project
        </h2>
        <p className="text-lg text-muted-foreground">
          Select any upgrades you'd like to include (optional)
        </p>
      </div>

      <div className="space-y-3">
        {upgrades.map((upgrade) => (
          <Card
            key={upgrade.id}
            onClick={() => handleToggleUpgrade(upgrade.id)}
            className={cn(
              "p-3 cursor-pointer transition-all duration-200",
              "border-2 hover:shadow-md",
              selectedUpgrades.includes(upgrade.id)
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30"
            )}
          >
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedUpgrades.includes(upgrade.id)}
                onCheckedChange={() => handleToggleUpgrade(upgrade.id)}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    {upgrade.name}
                  </h3>
                  <span className="text-base font-bold text-primary whitespace-nowrap">
                    +{upgrade.percentageIncrease}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {upgrade.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {selectedUpgrades.length === 0 && (
        <div className="text-center p-4 bg-muted/30 rounded-lg">
          <p className="text-sm text-muted-foreground">
            No upgrades selected. You can skip this step or select options above.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="min-w-[140px] h-12"
        >
          Back
        </Button>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            size="lg"
            className="min-w-[140px] h-12"
          >
            Skip
          </Button>
          <Button
            onClick={handleContinue}
            size="lg"
            className="min-w-[200px] h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300"
          >
            See My Estimate
          </Button>
        </div>
      </div>
    </div>
  );
};

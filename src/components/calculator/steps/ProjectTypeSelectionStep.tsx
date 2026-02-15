import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface ProjectTypeData {
  projectType: string;
  projectTypeName: string;
  basePrice: number | null;
  minSqFt?: number;
  maxSqFt?: number;
  requiresPDFUpload: boolean;
}

interface ProjectTypeSelectionStepProps {
  onNext: (data: ProjectTypeData) => void;
  initialData?: ProjectTypeData;
}

const projectTypes = [
  {
    id: "bathroom",
    emoji: "🛁",
    name: "Bathroom Remodeling",
    price: "$250/sq ft",
    basePrice: 250,
    minSqFt: 25,
    maxSqFt: 300,
    requiresPDFUpload: false,
  },
  {
    id: "kitchen",
    emoji: "🍳",
    name: "Kitchen Remodeling",
    price: "$300/sq ft",
    basePrice: 300,
    minSqFt: 80,
    maxSqFt: 500,
    requiresPDFUpload: false,
  },
  {
    id: "living_space",
    emoji: "🛋️",
    name: "Living Space Remodeling",
    price: "$200/sq ft",
    basePrice: 200,
    minSqFt: 100,
    maxSqFt: 1000,
    requiresPDFUpload: false,
  },
  {
    id: "home_addition",
    emoji: "➕",
    name: "Home Addition / New Construction",
    price: "Custom estimate",
    basePrice: null,
    requiresPDFUpload: true,
  },
];

export const ProjectTypeSelectionStep = ({
  onNext,
  initialData,
}: ProjectTypeSelectionStepProps) => {
  const [selectedType, setSelectedType] = React.useState<string | null>(
    initialData?.projectType || null
  );

  const handleSelect = (type: typeof projectTypes[0]) => {
    setSelectedType(type.id);
  };

  const handleContinue = () => {
    const selected = projectTypes.find((t) => t.id === selectedType);
    if (selected) {
      onNext({
        projectType: selected.id,
        projectTypeName: selected.name,
        basePrice: selected.basePrice,
        minSqFt: selected.minSqFt,
        maxSqFt: selected.maxSqFt,
        requiresPDFUpload: selected.requiresPDFUpload,
      });
    }
  };

  return (
    <div className="space-y-10 animate-fade-in w-full">
      <div className="text-center space-y-4 px-4">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
          What type of project are you planning?
        </h2>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Select the area you&apos;d like to renovate and we&apos;ll calculate your estimate
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 px-4">
        {projectTypes.map((type) => (
          <Card
            key={type.id}
            onClick={() => handleSelect(type)}
            className={cn(
              "relative cursor-pointer transition-all duration-300 p-6 group",
              "hover:shadow-elegant hover:-translate-y-2 hover:scale-105",
              "border-2 rounded-xl",
              selectedType === type.id
                ? "border-primary bg-gradient-to-br from-primary/10 to-primary/5 shadow-card"
                : "border-border hover:border-primary/50 bg-card"
            )}
            role="radio"
            aria-checked={selectedType === type.id}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleSelect(type);
              }
            }}
          >
            {selectedType === type.id && (
              <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent-sunset flex items-center justify-center shadow-button animate-scale-in">
                <Check className="w-5 h-5 text-white" strokeWidth={3} />
              </div>
            )}

            <div className="space-y-4 text-center">
              <div className="text-5xl md:text-6xl transform transition-transform duration-300 group-hover:scale-110">
                {type.emoji}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm md:text-base font-bold text-foreground leading-tight">
                  {type.name}
                </h3>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-center pt-4 px-4">
        <Button
          onClick={handleContinue}
          disabled={!selectedType}
          size="lg"
          className={cn(
            "min-w-[240px] w-full sm:w-auto h-14 text-lg font-semibold rounded-xl",
            "bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine",
            "hover:shadow-button hover:scale-105 transition-all duration-300",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          )}
        >
          Continue to Details →
        </Button>
      </div>
    </div>
  );
};

// Add React import at the top
import React from "react";

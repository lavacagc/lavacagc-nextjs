import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export interface QualityLevelData {
  qualityLevel: "budget" | "mid-range" | "premium";
}

interface QualityLevelStepProps {
  onNext: (data: QualityLevelData) => void;
  onBack: () => void;
  initialData?: QualityLevelData;
}

const qualityLevels = [
  {
    id: "budget" as const,
    title: "Budget",
    description: "Quality materials, standard finishes",
  },
  {
    id: "mid-range" as const,
    title: "Mid-Range",
    description: "Premium materials, designer finishes",
  },
  {
    id: "premium" as const,
    title: "Premium",
    description: "Luxury materials, custom finishes",
  },
];

export const QualityLevelStep = ({ onNext, onBack, initialData }: QualityLevelStepProps) => {
  const [selectedLevel, setSelectedLevel] = useState<QualityLevelData["qualityLevel"] | null>(
    initialData?.qualityLevel || null
  );

  const handleSubmit = () => {
    if (selectedLevel) {
      onNext({ qualityLevel: selectedLevel });
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold text-foreground">Select Your Quality Level</h2>
        <p className="text-lg text-muted-foreground">
          Choose the quality tier that best fits your project goals and budget
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {qualityLevels.map((level) => (
          <Card
            key={level.id}
            className={cn(
              "relative cursor-pointer transition-all duration-200 hover:shadow-lg",
              "border-2 p-6",
              selectedLevel === level.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            )}
            onClick={() => setSelectedLevel(level.id)}
            role="radio"
            aria-checked={selectedLevel === level.id}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSelectedLevel(level.id);
              }
            }}
          >
            {selectedLevel === level.id && (
              <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
            <div className="space-y-3">
              <h3 className="text-xl font-bold">{level.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {level.description}
              </p>
            </div>
          </Card>
        ))}
      </div>

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
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedLevel}
          size="lg"
          className="min-w-[200px] h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300"
        >
          Next
        </Button>
      </div>
    </div>
  );
};

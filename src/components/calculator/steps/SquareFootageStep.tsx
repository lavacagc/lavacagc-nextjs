import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SquareFootageData {
  squareFootage: number;
}

interface SquareFootageStepProps {
  onNext: (data: SquareFootageData) => void;
  onBack: () => void;
  initialData?: SquareFootageData;
  projectTypeName: string;
  minSqFt: number;
  maxSqFt: number;
}

export const SquareFootageStep = ({
  onNext,
  onBack,
  initialData,
  projectTypeName,
  minSqFt,
  maxSqFt,
}: SquareFootageStepProps) => {
  const [squareFootage, setSquareFootage] = useState<string>(
    initialData?.squareFootage?.toString() || ""
  );
  const [error, setError] = useState<string>("");

  const handleInputChange = (value: string) => {
    setSquareFootage(value);
    setError("");

    const num = parseFloat(value);
    if (value && (isNaN(num) || num < minSqFt || num > maxSqFt)) {
      setError(`Please enter a value between ${minSqFt} and ${maxSqFt} sq ft`);
    }
  };

  const handleContinue = () => {
    const num = parseFloat(squareFootage);
    if (!isNaN(num) && num >= minSqFt && num <= maxSqFt) {
      onNext({ squareFootage: num });
    }
  };

  const isValid = () => {
    const num = parseFloat(squareFootage);
    return !isNaN(num) && num >= minSqFt && num <= maxSqFt;
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl mx-auto">
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold text-foreground">
          How large is your {projectTypeName.toLowerCase()}?
        </h2>
        <p className="text-lg text-muted-foreground">
          Enter the square footage for an accurate estimate
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="squareFootage" className="text-base">
            Square Footage
          </Label>
          <div className="relative">
            <Input
              id="squareFootage"
              type="number"
              value={squareFootage}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Enter square footage"
              className={cn(
                "text-2xl h-16 pr-20 text-center font-semibold",
                "border-2 focus:border-primary focus:ring-4 focus:ring-primary/20",
                error && "border-destructive"
              )}
              min={minSqFt}
              max={maxSqFt}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground">
              sq ft
            </span>
          </div>
          {error && (
            <p className="text-sm text-destructive animate-fade-in">{error}</p>
          )}
        </div>

        <div className="text-center p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            Typical range: <span className="font-semibold text-foreground">{minSqFt} - {maxSqFt} sq ft</span>
          </p>
        </div>
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
          onClick={handleContinue}
          disabled={!isValid()}
          size="lg"
          className="min-w-[200px] h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300"
        >
          Calculate Estimate
        </Button>
      </div>
    </div>
  );
};

import { cn } from "@/lib/utils";

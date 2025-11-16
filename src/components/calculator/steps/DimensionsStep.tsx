import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DimensionsStepProps {
  onNext: (data: DimensionsData) => void;
  onBack?: () => void;
  initialData?: DimensionsData;
}

export interface DimensionsData {
  squareFootage: number;
  ceilingHeight: number;
  inputMethod: "direct" | "calculated";
  length?: number;
  width?: number;
}

export const DimensionsStep = ({ onNext, onBack, initialData }: DimensionsStepProps) => {
  const [inputMethod, setInputMethod] = useState<"direct" | "calculated">("direct");
  const [squareFootage, setSquareFootage] = useState<string>(initialData?.squareFootage?.toString() || "");
  const [length, setLength] = useState<string>(initialData?.length?.toString() || "");
  const [width, setWidth] = useState<string>(initialData?.width?.toString() || "");
  const [ceilingHeight, setCeilingHeight] = useState<string>(initialData?.ceilingHeight?.toString() || "8");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-calculate square footage when using length × width
  useEffect(() => {
    if (inputMethod === "calculated" && length && width) {
      const calculated = parseFloat(length) * parseFloat(width);
      if (!isNaN(calculated)) {
        setSquareFootage(calculated.toFixed(2));
      }
    }
  }, [length, width, inputMethod]);

  const validateField = (name: string, value: string): string => {
    const numValue = parseFloat(value);
    
    if (!value || isNaN(numValue)) {
      return "This field is required";
    }

    switch (name) {
      case "squareFootage":
        if (numValue < 1 || numValue > 1000) {
          return "Square footage must be between 1 and 1000";
        }
        break;
      case "length":
      case "width":
        if (numValue < 1 || numValue > 100) {
          return "Dimension must be between 1 and 100 feet";
        }
        break;
      case "ceilingHeight":
        if (numValue < 7 || numValue > 20) {
          return "Ceiling height must be between 7 and 20 feet";
        }
        break;
    }
    
    return "";
  };

  const handleInputChange = (name: string, value: string) => {
    // Allow empty or valid decimal numbers
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      switch (name) {
        case "squareFootage":
          setSquareFootage(value);
          break;
        case "length":
          setLength(value);
          break;
        case "width":
          setWidth(value);
          break;
        case "ceilingHeight":
          setCeilingHeight(value);
          break;
      }

      // Real-time validation
      if (value) {
        const error = validateField(name, value);
        setErrors(prev => ({ ...prev, [name]: error }));
      } else {
        setErrors(prev => ({ ...prev, [name]: "" }));
      }
    }
  };

  const handleNext = () => {
    const newErrors: Record<string, string> = {};

    // Validate based on input method
    if (inputMethod === "direct") {
      const sqftError = validateField("squareFootage", squareFootage);
      if (sqftError) newErrors.squareFootage = sqftError;
    } else {
      const lengthError = validateField("length", length);
      const widthError = validateField("width", width);
      if (lengthError) newErrors.length = lengthError;
      if (widthError) newErrors.width = widthError;
    }

    const heightError = validateField("ceilingHeight", ceilingHeight);
    if (heightError) newErrors.ceilingHeight = heightError;

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      onNext({
        squareFootage: parseFloat(squareFootage),
        ceilingHeight: parseFloat(ceilingHeight),
        inputMethod,
        ...(inputMethod === "calculated" && {
          length: parseFloat(length),
          width: parseFloat(width),
        }),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Project Dimensions</h2>
        <p className="text-muted-foreground">
          Tell us about the size of your space
        </p>
      </div>

      {/* Input Method Toggle */}
      <div className="flex gap-2 p-1 bg-muted rounded-lg">
        <Button
          type="button"
          variant={inputMethod === "direct" ? "default" : "ghost"}
          className="flex-1"
          onClick={() => setInputMethod("direct")}
        >
          Enter Square Footage
        </Button>
        <Button
          type="button"
          variant={inputMethod === "calculated" ? "default" : "ghost"}
          className="flex-1"
          onClick={() => setInputMethod("calculated")}
        >
          Calculate from Dimensions
        </Button>
      </div>

      {/* Direct Square Footage Input */}
      {inputMethod === "direct" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="squareFootage">Square Footage</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Enter the total square footage of the area you want to remodel (1-1000 sq ft)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="squareFootage"
            type="text"
            inputMode="decimal"
            placeholder="e.g., 120"
            value={squareFootage}
            onChange={(e) => handleInputChange("squareFootage", e.target.value)}
            className={errors.squareFootage ? "border-destructive" : ""}
            aria-invalid={!!errors.squareFootage}
            aria-describedby={errors.squareFootage ? "squareFootage-error" : undefined}
          />
          {errors.squareFootage && (
            <p id="squareFootage-error" className="text-sm text-destructive">
              {errors.squareFootage}
            </p>
          )}
        </div>
      )}

      {/* Length × Width Calculator */}
      {inputMethod === "calculated" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="length">Length (ft)</Label>
                <Input
                  id="length"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 10"
                  value={length}
                  onChange={(e) => handleInputChange("length", e.target.value)}
                  className={errors.length ? "border-destructive" : ""}
                  aria-invalid={!!errors.length}
                  aria-describedby={errors.length ? "length-error" : undefined}
                />
                {errors.length && (
                  <p id="length-error" className="text-sm text-destructive">
                    {errors.length}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="width">Width (ft)</Label>
                <Input
                  id="width"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g., 12"
                  value={width}
                  onChange={(e) => handleInputChange("width", e.target.value)}
                  className={errors.width ? "border-destructive" : ""}
                  aria-invalid={!!errors.width}
                  aria-describedby={errors.width ? "width-error" : undefined}
                />
                {errors.width && (
                  <p id="width-error" className="text-sm text-destructive">
                    {errors.width}
                  </p>
                )}
              </div>
            </div>

            {squareFootage && !errors.length && !errors.width && (
              <div className="p-4 bg-primary/10 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Calculated Square Footage</p>
                <p className="text-2xl font-bold text-primary">{squareFootage} sq ft</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ceiling Height */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="ceilingHeight">Ceiling Height (ft)</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">Standard ceiling height is 8 feet. Measure from floor to ceiling (7-20 ft)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="ceilingHeight"
          type="text"
          inputMode="decimal"
          placeholder="e.g., 8"
          value={ceilingHeight}
          onChange={(e) => handleInputChange("ceilingHeight", e.target.value)}
          className={errors.ceilingHeight ? "border-destructive" : ""}
          aria-invalid={!!errors.ceilingHeight}
          aria-describedby={errors.ceilingHeight ? "ceilingHeight-error" : undefined}
        />
        {errors.ceilingHeight && (
          <p id="ceilingHeight-error" className="text-sm text-destructive">
            {errors.ceilingHeight}
          </p>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-6">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            size="lg"
            className="min-w-[140px] h-12"
          >
            Back
          </Button>
        )}
        <Button
          onClick={handleNext}
          size="lg"
          className={cn(
            "min-w-[200px] h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300",
            !onBack && "mx-auto"
          )}
        >
          Continue
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

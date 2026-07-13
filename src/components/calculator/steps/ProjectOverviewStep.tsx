import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ProjectOverviewData {
  projectDescription: string;
  projectLocation: string;
}

interface ProjectOverviewStepProps {
  onNext: (data: ProjectOverviewData) => void;
  onBack: () => void;
  initialData?: ProjectOverviewData;
}

const MAX_CHARS = 500;
// The submit-home-addition backend requires at least 50 characters - enforce
// it here too so a visitor never types a short description, submits, and gets
// a generic server rejection at the very last step.
const MIN_CHARS = 50;

// Must match the submit-home-addition backend enum exactly. The old list
// ("Addition to existing home" / "Detached structure" / "Other") had ZERO
// overlap with it, so every home-addition submission was rejected server-side
// (verified live 2026-07-13). Exported so tests can assert the sync.
export const PROJECT_LOCATIONS = [
  "Front Addition",
  "Rear Addition",
  "Side Addition",
  "Second Story Addition"
];

export const ProjectOverviewStep = ({
  onNext,
  onBack,
  initialData,
}: ProjectOverviewStepProps) => {
  const [projectDescription, setProjectDescription] = useState(
    initialData?.projectDescription || ""
  );
  const [projectLocation, setProjectLocation] = useState(
    initialData?.projectLocation || ""
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!projectDescription.trim()) {
      newErrors.projectDescription = "Project description is required";
    } else if (projectDescription.trim().length < MIN_CHARS) {
      newErrors.projectDescription = `Please add a bit more detail (at least ${MIN_CHARS} characters)`;
    }

    if (!projectLocation) {
      newErrors.projectLocation = "Project location is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onNext({
        projectDescription: projectDescription.trim(),
        projectLocation,
      });
    }
  };

  const isValid = projectDescription.trim().length >= MIN_CHARS && projectLocation.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Tell Us About Your Home Addition Project</h2>
        <p className="text-muted-foreground">
          The more details you provide, the better we can estimate
        </p>
      </div>

      <div className="space-y-4">
        {/* Project Description */}
        <div className="space-y-2">
          <Label htmlFor="description">
            Project Description <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="description"
            value={projectDescription}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length <= MAX_CHARS) {
                setProjectDescription(value);
                if (errors.projectDescription) {
                  setErrors(prev => ({ ...prev, projectDescription: "" }));
                }
              }
            }}
            placeholder="Describe your project (e.g., 2-story addition, 3 bedrooms, 2 bathrooms, kitchen on first floor...)"
            className="min-h-[120px] resize-none"
            maxLength={MAX_CHARS}
          />
          <div className="flex justify-between items-center text-xs">
            <span className={errors.projectDescription ? "text-destructive" : "text-muted-foreground"}>
              {errors.projectDescription || ""}
            </span>
            <span className="text-muted-foreground">
              {projectDescription.length} / {MAX_CHARS} characters
            </span>
          </div>
        </div>

        {/* Project Location */}
        <div className="space-y-2">
          <Label htmlFor="location">
            Project Location <span className="text-destructive">*</span>
          </Label>
          <Select
            value={projectLocation}
            onValueChange={(value) => {
              setProjectLocation(value);
              if (errors.projectLocation) {
                setErrors(prev => ({ ...prev, projectLocation: "" }));
              }
            }}
          >
            <SelectTrigger id="location" className={errors.projectLocation ? "border-destructive" : ""}>
              <SelectValue placeholder="Select project location type" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_LOCATIONS.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.projectLocation && (
            <p className="text-xs text-destructive">{errors.projectLocation}</p>
          )}
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="min-w-[120px]"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid}
          className="min-w-[120px]"
        >
          Next
        </Button>
      </div>
    </div>
  );
};

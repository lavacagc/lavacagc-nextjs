import { useState, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface AdditionalFeaturesData {
  additionalFeatures: string[];
  uploadedImage?: File;
}

interface AdditionalFeaturesStepProps {
  onNext: (data: AdditionalFeaturesData) => void;
  onBack: () => void;
  initialData?: AdditionalFeaturesData;
}

interface FeatureOption {
  id: string;
  label: string;
  description: string;
}

const features: FeatureOption[] = [
  {
    id: "custom-cabinetry",
    label: "Custom Cabinetry",
    description: "Built-in storage solutions tailored to your space",
  },
  {
    id: "premium-hardware",
    label: "Premium Hardware & Accessories",
    description: "Designer towel bars, hooks, and bathroom accessories",
  },
  {
    id: "mirror-upgrade",
    label: "Custom Mirror or Medicine Cabinet",
    description: "Frameless mirrors or mirrored medicine cabinets",
  },
  {
    id: "glass-enclosure",
    label: "Frameless Glass Shower Enclosure",
    description: "Modern glass shower doors and panels",
  },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/heic"];

export const AdditionalFeaturesStep = ({
  onNext,
  onBack,
  initialData,
}: AdditionalFeaturesStepProps) => {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    initialData?.additionalFeatures || []
  );
  const [uploadedFile, setUploadedFile] = useState<File | undefined>(
    initialData?.uploadedImage
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleToggleFeature = (featureId: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(featureId)
        ? prev.filter((id) => id !== featureId)
        : [...prev, featureId]
    );
  };

  const validateFile = (file: File): boolean => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or HEIC image.",
        variant: "destructive",
      });
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 10MB.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const processFile = (file: File) => {
    if (!validateFile(file)) return;

    // Simulate upload progress
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 50);

    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    toast({
      title: "Image uploaded successfully",
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setUploadedFile(undefined);
    setPreviewUrl(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    onNext({
      additionalFeatures: selectedFeatures,
      uploadedImage: uploadedFile,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Additional Features & Photos</h2>
        <p className="text-muted-foreground">
          Select any extra features and upload a photo of your current space (optional)
        </p>
      </div>

      {/* Additional Features */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Additional Features</h3>
        <div className="space-y-3">
          {features.map((feature) => (
            <div
              key={feature.id}
              className={cn(
                "flex items-center space-x-3 p-3 rounded-lg border transition-all",
                selectedFeatures.includes(feature.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <Checkbox
                id={feature.id}
                checked={selectedFeatures.includes(feature.id)}
                onCheckedChange={() => handleToggleFeature(feature.id)}
              />
              <div className="flex-1 space-y-0.5">
                <Label
                  htmlFor={feature.id}
                  className="font-semibold cursor-pointer"
                >
                  {feature.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Image Upload */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold border-b pb-2">Upload Photo (Optional)</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Help us understand your space better by uploading a photo of your current bathroom
          </p>
        </div>

        {!uploadedFile ? (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border hover:border-primary/50 hover:bg-accent/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            aria-label="Upload image area"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic"
              onChange={handleFileChange}
              className="hidden"
              aria-label="File input"
            />
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">
              Drag and drop your image here
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse your files
            </p>
            <p className="text-xs text-muted-foreground">
              Supports: JPG, PNG, HEIC • Max size: 10MB
            </p>
          </div>
        ) : (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-start gap-4">
              <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Uploaded project inspiration photo preview"
                    className="w-full h-full object-cover"
                    width={128}
                    height={128}
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{uploadedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                    aria-label="Remove uploaded image"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                {uploadProgress < 100 && (
                  <div className="space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}
                {uploadProgress === 100 && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    ✓ Upload complete
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
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
          size="lg"
          className="min-w-[200px] h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300"
        >
          Next
        </Button>
      </div>
    </div>
  );
};

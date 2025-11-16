import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface PDFFile {
  file: File;
  label: string;
  id: string;
  pageCount?: number;
}

export interface PDFUploadData {
  uploadedPDFs: PDFFile[];
  projectDescription?: string;
}

interface PDFUploadStepProps {
  onNext: (data: PDFUploadData) => void;
  onBack: () => void;
  initialData?: PDFUploadData;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_FILES = 10;
const ALLOWED_TYPE = "application/pdf";

const PDF_LABELS = [
  "Floor Plans",
  "Elevations",
  "Site Plan",
  "Foundation Plans",
  "Electrical Plans",
  "Plumbing Plans",
  "HVAC Plans",
  "Structural Plans",
  "Other",
  "Custom"
];

export const PDFUploadStep = ({
  onNext,
  onBack,
  initialData,
}: PDFUploadStepProps) => {
  const [uploadedFiles, setUploadedFiles] = useState<PDFFile[]>(
    initialData?.uploadedPDFs || []
  );
  const [projectDescription, setProjectDescription] = useState(
    initialData?.projectDescription || ""
  );
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): boolean => {
    if (file.type !== ALLOWED_TYPE) {
      toast({
        title: "Invalid file type",
        description: "Please upload PDF files only.",
        variant: "destructive",
      });
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Please upload PDFs smaller than 20MB.",
        variant: "destructive",
      });
      return false;
    }

    if (uploadedFiles.length >= MAX_FILES) {
      toast({
        title: "Maximum files reached",
        description: `You can upload up to ${MAX_FILES} files.`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const processFile = async (file: File) => {
    if (!validateFile(file)) return;

    const fileId = `${Date.now()}-${Math.random()}`;
    
    // Simulate upload progress
    setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        const currentProgress = prev[fileId] || 0;
        if (currentProgress >= 100) {
          clearInterval(interval);
          return prev;
        }
        return { ...prev, [fileId]: currentProgress + 10 };
      });
    }, 50);

    // Try to get page count (mock for now - real implementation would use PDF.js)
    const pageCount = Math.floor(Math.random() * 5) + 1; // Mock: 1-5 pages

    setUploadedFiles(prev => [...prev, {
      file,
      label: "Other",
      id: fileId,
      pageCount,
    }]);

    toast({
      title: "PDF uploaded successfully",
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${pageCount} page${pageCount > 1 ? 's' : ''})`,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(processFile);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

    const files = Array.from(e.dataTransfer.files);
    files.forEach(processFile);
  };

  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
    setUploadProgress(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleLabelChange = (id: string, label: string) => {
    setUploadedFiles(prev => prev.map(f => 
      f.id === id ? { ...f, label } : f
    ));
  };

  const handleSubmit = () => {
    if (uploadedFiles.length === 0) {
      toast({
        title: "Files required",
        description: "Please upload at least one PDF file to continue.",
        variant: "destructive",
      });
      return;
    }

    onNext({
      uploadedPDFs: uploadedFiles,
      projectDescription,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Upload Your Project Plans</h2>
        <p className="text-muted-foreground">
          Upload architectural plans, elevations, and other relevant documents (PDF format)
        </p>
      </div>

      {/* Project Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Project Description (Optional)</Label>
        <textarea
          id="description"
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
          placeholder="Briefly describe your home addition or new construction project..."
          className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          {projectDescription.length}/500 characters
        </p>
      </div>

      {/* Upload Area */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label>PDF Files</Label>
            <span className="text-sm text-muted-foreground">
              ({uploadedFiles.length} of {MAX_FILES} uploaded)
            </span>
          </div>
          {uploadedFiles.length > 0 && uploadedFiles.length < MAX_FILES && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add More
            </Button>
          )}
        </div>

        {uploadedFiles.length === 0 ? (
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
            aria-label="Upload PDF area"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
              multiple
              aria-label="PDF file input"
            />
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold mb-2">
              Drag and drop your PDFs here
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              or click to browse your files
            </p>
            <p className="text-xs text-muted-foreground">
              PDF only • Max {MAX_FILE_SIZE / 1024 / 1024}MB per file • Up to {MAX_FILES} files
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {uploadedFiles.map((pdfFile) => (
              <div
                key={pdfFile.id}
                className="border rounded-lg p-4 space-y-3 bg-card"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10 flex-shrink-0">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{pdfFile.file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(pdfFile.file.size / 1024 / 1024).toFixed(2)} MB
                          {pdfFile.pageCount && ` • ${pdfFile.pageCount} page${pdfFile.pageCount > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFile(pdfFile.id)}
                        aria-label="Remove uploaded PDF"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`label-${pdfFile.id}`} className="text-xs">
                        Document Type
                      </Label>
                      <Select
                        value={pdfFile.label}
                        onValueChange={(value) => handleLabelChange(pdfFile.id, value)}
                      >
                        <SelectTrigger id={`label-${pdfFile.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PDF_LABELS.map((label) => (
                            <SelectItem key={label} value={label}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {uploadProgress[pdfFile.id] !== undefined && uploadProgress[pdfFile.id] < 100 && (
                      <div className="space-y-1">
                        <Progress value={uploadProgress[pdfFile.id]} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          Uploading... {uploadProgress[pdfFile.id]}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
          disabled={uploadedFiles.length === 0}
          className="min-w-[120px]"
        >
          Next
        </Button>
      </div>
    </div>
  );
};

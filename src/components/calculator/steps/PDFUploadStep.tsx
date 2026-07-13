import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Server-side upload metadata returned by the upload-calculator-pdfs edge fn.
// The raw browser File never leaves this step - it used to be passed along
// and JSON.stringify'd to {}, so plans silently never reached the server.
export interface PDFFile {
  id: string;
  filename: string;
  label: string;
  filePath: string;
  fileSize: number;
  pageCount: number;
  uploadedAt: string;
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

    // Real upload to the calculator-pdfs bucket via the
    // upload-calculator-pdfs edge fn (multipart field names file_N/label_N).
    // The fn returns the metadata shape submit-home-addition requires.
    const tempId = `${Date.now()}-${Math.random()}`;
    setUploadProgress(prev => ({ ...prev, [tempId]: 0 }));
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        const current = prev[tempId] ?? 0;
        // Creep toward 90% while the upload is in flight; jump to 100 on response.
        return current >= 90 ? prev : { ...prev, [tempId]: current + 10 };
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append("file_0", file, file.name);
      formData.append("label_0", "Other");
      const { data, error } = await supabase.functions.invoke("upload-calculator-pdfs", {
        body: formData,
      });
      if (error || !data?.uploaded_files?.[0]) {
        throw new Error(error?.message || "Upload failed");
      }
      const meta = data.uploaded_files[0] as {
        id: string;
        filename: string;
        label: string;
        file_path: string;
        file_size: number;
        page_count: number;
        uploaded_at: string;
      };

      setUploadedFiles(prev => [...prev, {
        id: meta.id,
        filename: meta.filename,
        label: "Other",
        filePath: meta.file_path,
        fileSize: meta.file_size,
        pageCount: meta.page_count,
        uploadedAt: meta.uploaded_at,
      }]);

      toast({
        title: "PDF uploaded successfully",
        description: `${meta.filename} (${(meta.file_size / 1024 / 1024).toFixed(2)}MB, ${meta.page_count} page${meta.page_count > 1 ? 's' : ''})`,
      });
    } catch (err) {
      console.error("PDF upload failed:", err);
      toast({
        title: "Upload failed",
        description: `${file.name} could not be uploaded. Please try again.`,
        variant: "destructive",
      });
    } finally {
      clearInterval(interval);
      setUploadProgress(prev => {
        const rest = { ...prev };
        delete rest[tempId];
        return rest;
      });
    }
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
      const rest = { ...prev };
      delete rest[id];
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

        {uploadedFiles.length === 0 && Object.keys(uploadProgress).length === 0 ? (
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
                        <p className="font-semibold truncate">{pdfFile.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          {(pdfFile.fileSize / 1024 / 1024).toFixed(2)} MB
                          {pdfFile.pageCount > 0 && ` • ${pdfFile.pageCount} page${pdfFile.pageCount > 1 ? 's' : ''}`}
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

                  </div>
                </div>
              </div>
            ))}
            {/* In-flight uploads (files appear in the list once the server confirms) */}
            {Object.entries(uploadProgress).map(([tempId, progress]) => (
              <div key={tempId} className="border rounded-lg p-4 space-y-1 bg-card">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground">Uploading... {progress}%</p>
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

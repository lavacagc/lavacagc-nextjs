import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Phone, Calendar, Mail, FileText, Clock } from "lucide-react";
import { ContactInfoData } from "./ContactInfoStep";
import { PDFUploadData } from "./PDFUploadStep";

interface ConfirmationStepProps {
  onBack: () => void;
  contactInfo?: ContactInfoData;
  pdfUpload?: PDFUploadData;
}

export const ConfirmationStep = ({
  onBack,
  contactInfo,
  pdfUpload,
}: ConfirmationStepProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-8 h-8" />
          <h2 className="text-2xl font-bold">Request Submitted Successfully!</h2>
        </div>
        <p className="text-muted-foreground">
          Thank you for submitting your home addition project details
        </p>
      </div>

      {/* What Happens Next */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            What Happens Next
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              1
            </div>
            <div>
              <p className="font-semibold">Plan Review (24-48 hours)</p>
              <p className="text-sm text-muted-foreground">
                Our team will carefully review your uploaded plans and project details
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              2
            </div>
            <div>
              <p className="font-semibold">We'll call you to discuss the project</p>
              <p className="text-sm text-muted-foreground">
                Initial consultation call within 48 hours to understand your vision
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              3
            </div>
            <div>
              <p className="font-semibold">Schedule an in-person site visit</p>
              <p className="text-sm text-muted-foreground">
                On-site assessment to evaluate property conditions and measurements
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              4
            </div>
            <div>
              <p className="font-semibold">Receive your detailed, accurate quote</p>
              <p className="text-sm text-muted-foreground">
                Comprehensive proposal with pricing breakdown and project timeline
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Your Uploaded Documents */}
      {pdfUpload && pdfUpload.uploadedPDFs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Your Uploaded Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pdfUpload.uploadedPDFs.map((pdf) => (
              <div key={pdf.id} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="font-medium">{pdf.label}</span>
                <span className="text-muted-foreground">
                  ({pdf.file.name}
                  {pdf.pageCount && ` - ${pdf.pageCount} page${pdf.pageCount > 1 ? 's' : ''}`})
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Submission Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {contactInfo && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact:</span>
                <span className="font-medium">
                  {contactInfo.firstName} {contactInfo.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{contactInfo.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium">{contactInfo.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location:</span>
                <span className="font-medium text-right">
                  {contactInfo.streetAddress}, {contactInfo.city}, {contactInfo.state} {contactInfo.zipCode}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Typical Timeline */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
            <Calendar className="w-5 h-5" />
            Typical Home Addition Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
            <p><strong>Planning & Permits:</strong> 4-8 weeks for approvals</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
            <p><strong>Foundation Work:</strong> 2-4 weeks depending on size</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
            <p><strong>Framing & Structure:</strong> 3-6 weeks for construction</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
            <p><strong>Interior Finish:</strong> 4-8 weeks for completion</p>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 italic">
            *Timeline varies based on project complexity, weather, and permit processing
          </p>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Need Immediate Assistance?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <a href="tel:+19735551234" className="text-primary hover:underline">
              (973) 555-1234
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <a href="mailto:info@lavacagc.com" className="text-primary hover:underline">
              info@lavacagc.com
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            Office Hours: Monday - Friday, 8:00 AM - 6:00 PM EST
          </p>
        </CardContent>
      </Card>

      {/* Legal Disclaimer */}
      <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground">
        <p className="font-semibold mb-2">Important Notice:</p>
        <p>
          This submission is a request for estimate only and does not constitute a binding contract. 
          Pricing and timeline will be provided after our team reviews your plans and conducts an 
          in-person site assessment. All work is subject to a detailed written proposal and signed contract.
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
        >
          Back to Edit
        </Button>
        <Button
          type="button"
          onClick={() => window.location.href = "/"}
        >
          Return to Home
        </Button>
      </div>
    </div>
  );
};

'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Shield,
  Database,
  Trash2,
  Download,
  Eye,
  Edit3,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

type RequestType = 'access' | 'deletion' | 'correction' | 'portability' | 'restriction';

interface DataRequest {
  requestType: RequestType;
  name: string;
  email: string;
  phone: string;
  details: string;
  verification: boolean;
}

export default function DataRightsPage() {
  const [formData, setFormData] = useState<DataRequest>({
    requestType: 'access',
    name: '',
    email: '',
    phone: '',
    details: '',
    verification: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const requestTypes = {
    access: {
      title: 'Right to Access',
      description: 'Request a copy of all personal data we hold about you',
      icon: Eye,
    },
    deletion: {
      title: 'Right to Deletion',
      description: 'Request permanent deletion of your personal data',
      icon: Trash2,
    },
    correction: {
      title: 'Right to Correction',
      description: 'Request correction of inaccurate personal data',
      icon: Edit3,
    },
    portability: {
      title: 'Right to Data Portability',
      description: 'Receive your data in a machine-readable format',
      icon: Download,
    },
    restriction: {
      title: 'Right to Restrict Processing',
      description: 'Limit how we use your personal data',
      icon: AlertTriangle,
    },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.verification) {
      toast({
        title: 'Verification Required',
        description: 'Please confirm your identity verification.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();

      const { error } = await supabase.from('data_rights_requests').insert({
        request_type: formData.requestType,
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        details: formData.details || null,
        ip_address: ipData.ip,
        user_agent: navigator.userAgent,
        status: 'pending',
      });

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: 'Request Submitted',
        description: 'Your data rights request has been received. We will respond within 30 days.',
      });
    } catch (error) {
      console.error('Error submitting request:', error);
      toast({
        title: 'Submission Failed',
        description: 'Please try again or contact alex@lavacagc.com directly.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <CardTitle>Request Received</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Thank you for submitting your data rights request. We have received your{' '}
                <strong>{requestTypes[formData.requestType].title}</strong> request.
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-semibold mb-2">What happens next:</p>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li>We will verify your identity within 10 business days</li>
                  <li>We may contact you for additional verification</li>
                  <li>Your request will be processed within 30 days (GDPR) or 45 days (CCPA)</li>
                  <li>You will receive confirmation via email when complete</li>
                </ul>
              </div>
              <Button onClick={() => (window.location.href = '/')} className="w-full">
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Your Data Rights', href: '/data-rights' },
          ]}
        />

        <div className="max-w-6xl mx-auto mt-8">
          <div className="text-center mb-12">
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Your Data Rights</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              We respect your privacy rights under GDPR, CCPA, and other privacy regulations.
              Submit a request below to exercise your rights.
            </p>
          </div>

          {/* Data Retention Policy Section */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-primary" />
                <CardTitle>Our Data Retention Policy</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                We retain your personal data only for as long as necessary to fulfill the purposes
                for which it was collected:
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold">Contact Inquiries</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Retained for <strong>3 years</strong> after last contact to provide follow-up
                    service and handle warranty claims.
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold">Project Records</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Retained for <strong>7 years</strong> after project completion for warranty and
                    legal compliance.
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold">Warranty Claims</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Retained for <strong>10 years</strong> to fulfill warranty obligations and legal
                    requirements.
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-primary" />
                    <h4 className="font-semibold">Marketing & Analytics</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Cookie data expires per your consent settings. Marketing consent retained for{' '}
                    <strong>1 year</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm">
                  <strong>Automatic Deletion:</strong> We regularly review and delete data that is no
                  longer needed. You can request earlier deletion at any time using the form below.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Rights Overview */}
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {Object.entries(requestTypes).map(([key, value]) => {
              const Icon = value.icon;
              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    formData.requestType === key ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() =>
                    setFormData({ ...formData, requestType: key as RequestType })
                  }
                >
                  <CardContent className="p-4 text-center">
                    <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <h4 className="font-semibold text-sm">{value.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{value.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Request Form */}
          <Card>
            <CardHeader>
              <CardTitle>Submit Your Data Rights Request</CardTitle>
              <CardDescription>
                Complete the form below and we will process your request within 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="requestType">Type of Request *</Label>
                  <Select
                    value={formData.requestType}
                    onValueChange={(value) =>
                      setFormData({ ...formData, requestType: value as RequestType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(requestTypes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Full Legal Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Your full legal name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="phone">Phone Number (Optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(201) 212-4917"
                  />
                </div>

                <div>
                  <Label htmlFor="details">Additional Details</Label>
                  <Textarea
                    id="details"
                    value={formData.details}
                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                    placeholder="Provide any additional information that will help us process your request (e.g., specific data you want corrected, reason for deletion, etc.)"
                    rows={4}
                  />
                </div>

                <div className="flex items-start space-x-3 bg-muted p-4 rounded-lg">
                  <Checkbox
                    id="verification"
                    checked={formData.verification}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, verification: checked as boolean })
                    }
                  />
                  <div>
                    <Label htmlFor="verification" className="font-normal cursor-pointer">
                      I certify that I am the individual whose personal data is the subject of this
                      request, or I am authorized to make this request on their behalf. I understand
                      that La Vaca GC may request additional verification. *
                    </Label>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold mb-2">Processing Timeline</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Identity verification: 10 business days</li>
                    <li>Request fulfillment: 30 days (GDPR) / 45 days (CCPA)</li>
                    <li>Complex requests may require an extension (we'll notify you)</li>
                  </ul>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || !formData.verification}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Data Rights Request'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Contact Our Privacy Team</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                For questions about your data rights or to submit a request via other means:
              </p>
              <div className="space-y-2">
                <p>
                  <strong>Email:</strong>{' '}
                  <a href="mailto:alex@lavacagc.com" className="text-primary hover:underline">
                    alex@lavacagc.com
                  </a>
                </p>
                <p>
                  <strong>Phone:</strong>{' '}
                  <a href="tel:+12012124917" className="text-primary hover:underline">
                    (201) 212-4917
                  </a>
                </p>
                <p>
                  <strong>Mail:</strong> La Vaca General Contractors, LLC, Attn: Privacy Officer,
                  New Jersey
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

interface FeedbackRequest {
  id: string;
  lead_email: string;
  lead_name: string;
  follow_up_type: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  created_at: string;
}

// Email templates are now generated server-side in /api/feedback/create

export default function FeedbackPage() {
  const [formData, setFormData] = useState({
    customerName: '',
    email: '',
    phone: '',
    projectType: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedbackRequests, setFeedbackRequests] = useState<FeedbackRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeedbackRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback/list');
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setFeedbackRequests(result.data || []);
    } catch (error) {
      console.error('Error fetching feedback requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load feedback requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedbackRequests();
  }, [fetchFeedbackRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customerName || !formData.email) {
      toast({
        title: 'Error',
        description: 'Customer name and email are required',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/feedback/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: formData.customerName,
          email: formData.email,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create feedback sequence');

      toast({
        title: 'Success',
        description: 'Feedback request sequence created successfully',
      });

      // Reset form
      setFormData({
        customerName: '',
        email: '',
        phone: '',
        projectType: '',
        notes: '',
      });

      fetchFeedbackRequests();
    } catch (error) {
      console.error('Error creating feedback request:', error);
      toast({
        title: 'Error',
        description: 'Failed to create feedback request',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkResponded = async (email: string) => {
    try {
      const res = await fetch('/api/feedback/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_responded', email }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast({
        title: 'Success',
        description: 'Marked as responded and cancelled remaining feedback emails',
      });
      fetchFeedbackRequests();
    } catch (error) {
      console.error('Error marking responded:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-600',
      responded: 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  const getFollowUpTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      feedback_day0: 'Day 0',
      feedback_day3: 'Day 3',
      feedback_day7: 'Day 7',
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      {/* Form Card */}
      <Card>
        <CardHeader>
          <CardTitle>Request Feedback & Reviews</CardTitle>
          <CardDescription>
            Manually add customers to the feedback/review request sequence
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="John Smith"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (Optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectType">Project Type</Label>
                <Input
                  id="projectType"
                  value={formData.projectType}
                  onChange={(e) => setFormData({ ...formData, projectType: e.target.value })}
                  placeholder="Kitchen Remodel, Bathroom, etc."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes about this customer or project..."
                rows={3}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-medium mb-2">Feedback Sequence:</p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• <strong>Day 0:</strong> Initial feedback request with Google review link</li>
                <li>• <strong>Day 3:</strong> Gentle reminder if no response</li>
                <li>• <strong>Day 7:</strong> Final polite follow-up</li>
              </ul>
            </div>

            <Button type="submit" disabled={submitting} className="w-full md:w-auto">
              {submitting ? 'Sending...' : 'Send Feedback Request'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Feedback Requests</CardTitle>
          <CardDescription>
            All feedback and review requests sent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Scheduled</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackRequests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No feedback requests yet
                        </td>
                      </tr>
                    ) : (
                      feedbackRequests.map(req => (
                        <tr key={req.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{req.lead_name}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{req.lead_email}</td>
                          <td className="px-4 py-3">
                            <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium">
                              {getFollowUpTypeLabel(req.follow_up_type)}
                            </span>
                          </td>
                          <td className="px-4 py-3">{statusBadge(req.status)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {new Date(req.scheduled_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            {(req.status === 'pending' || req.status === 'sent') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleMarkResponded(req.lead_email)}
                              >
                                Mark Responded
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

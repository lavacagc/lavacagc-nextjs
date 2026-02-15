import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAnalyticsConfig } from '@/hooks/useAnalyticsConfig';
import { Loader2, Plus, Trash2, Edit2, Save } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const AnalyticsSettings = () => {
  const { config, customEvents, isLoading, updateConfig, createEvent, updateEvent, deleteEvent } = useAnalyticsConfig();
  const [editingEvent, setEditingEvent] = useState<{ id: string; event_name: string; event_category: string; event_action: string; event_label: string | null; description: string | null; active: boolean | null } | null>(null);
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    event_name: '',
    event_category: '',
    event_action: '',
    event_label: '',
    description: '',
    active: true,
  });

  const handleConfigUpdate = (field: string, value: unknown) => {
    updateConfig({ [field]: value });
  };

  const handleEventSubmit = () => {
    const eventData = {
      ...eventForm,
      event_value: null,
      parameters: {},
    };

    if (editingEvent) {
      updateEvent({ ...eventData, id: editingEvent.id });
    } else {
      createEvent(eventData);
    }
    setIsEventDialogOpen(false);
    setEditingEvent(null);
    setEventForm({
      event_name: '',
      event_category: '',
      event_action: '',
      event_label: '',
      description: '',
      active: true,
    });
  };

  const handleEditEvent = (event: { id: string; event_name: string; event_category: string; event_action: string; event_label: string | null; description: string | null; active: boolean | null }) => {
    setEditingEvent(event);
    setEventForm({
      event_name: String(event.event_name ?? ''),
      event_category: String(event.event_category ?? ''),
      event_action: String(event.event_action ?? ''),
      event_label: String(event.event_label ?? ''),
      description: String(event.description ?? ''),
      active: Boolean(event.active),
    });
    setIsEventDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Analytics Settings</h2>
        <p className="text-muted-foreground">
          Configure Google Analytics tracking and custom events
        </p>
      </div>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList>
          <TabsTrigger value="basic">Basic Setup</TabsTrigger>
          <TabsTrigger value="events">Custom Events</TabsTrigger>
          <TabsTrigger value="privacy">Privacy Settings</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Google Analytics Configuration</CardTitle>
              <CardDescription>
                Enter your Google Analytics 4 (GA4) Measurement ID to enable tracking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ga4_id">GA4 Measurement ID</Label>
                <Input
                  id="ga4_id"
                  placeholder="G-XXXXXXXXXX"
                  value={config?.ga4_measurement_id || ''}
                  onChange={(e) => handleConfigUpdate('ga4_measurement_id', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Find this in Google Analytics under Admin → Data Streams
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gtm_id">Google Tag Manager ID (Optional)</Label>
                <Input
                  id="gtm_id"
                  placeholder="GTM-XXXXXXX"
                  value={config?.gtm_container_id || ''}
                  onChange={(e) => handleConfigUpdate('gtm_container_id', e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Enable Tracking</Label>
                  <p className="text-sm text-muted-foreground">
                    Turn Google Analytics tracking on or off
                  </p>
                </div>
                <Switch
                  checked={config?.tracking_enabled || false}
                  onCheckedChange={(checked) => handleConfigUpdate('tracking_enabled', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Custom Events</CardTitle>
                  <CardDescription>
                    Manage custom event tracking for forms, buttons, and user interactions
                  </CardDescription>
                </div>
                <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => {
                      setEditingEvent(null);
                      setEventForm({
                        event_name: '',
                        event_category: '',
                        event_action: '',
                        event_label: '',
                        description: '',
                        active: true,
                      });
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Event
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingEvent ? 'Edit Event' : 'Create New Event'}
                      </DialogTitle>
                      <DialogDescription>
                        Configure a custom event for Google Analytics tracking
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="event_name">Event Name</Label>
                        <Input
                          id="event_name"
                          value={eventForm.event_name}
                          onChange={(e) => setEventForm({ ...eventForm, event_name: e.target.value })}
                          placeholder="e.g., button_click"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="event_category">Category</Label>
                        <Input
                          id="event_category"
                          value={eventForm.event_category}
                          onChange={(e) => setEventForm({ ...eventForm, event_category: e.target.value })}
                          placeholder="e.g., engagement"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="event_action">Action</Label>
                        <Input
                          id="event_action"
                          value={eventForm.event_action}
                          onChange={(e) => setEventForm({ ...eventForm, event_action: e.target.value })}
                          placeholder="e.g., click"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="event_label">Label (Optional)</Label>
                        <Input
                          id="event_label"
                          value={eventForm.event_label}
                          onChange={(e) => setEventForm({ ...eventForm, event_label: e.target.value })}
                          placeholder="e.g., cta_button"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={eventForm.description}
                          onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                          placeholder="Brief description of what this event tracks"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label>Active</Label>
                        <Switch
                          checked={eventForm.active}
                          onCheckedChange={(checked) => setEventForm({ ...eventForm, active: checked })}
                        />
                      </div>
                      <Button onClick={handleEventSubmit} className="w-full">
                        <Save className="mr-2 h-4 w-4" />
                        {editingEvent ? 'Update Event' : 'Create Event'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.event_name}</TableCell>
                      <TableCell>{event.event_category}</TableCell>
                      <TableCell>{event.event_action}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                          event.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {event.active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditEvent(event)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteEvent(event.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Consent</CardTitle>
              <CardDescription>
                Configure privacy settings and consent management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Consent Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable Google Consent Mode for GDPR compliance
                  </p>
                </div>
                <Switch
                  checked={config?.consent_mode_enabled || false}
                  onCheckedChange={(checked) => handleConfigUpdate('consent_mode_enabled', checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>IP Anonymization</Label>
                  <p className="text-sm text-muted-foreground">
                    Anonymize visitor IP addresses
                  </p>
                </div>
                <Switch
                  checked={config?.ip_anonymization || false}
                  onCheckedChange={(checked) => handleConfigUpdate('ip_anonymization', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Configure enhanced tracking features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Enhanced E-commerce</Label>
                  <p className="text-sm text-muted-foreground">
                    Track detailed conversion and lead values
                  </p>
                </div>
                <Switch
                  checked={config?.enhanced_ecommerce || false}
                  onCheckedChange={(checked) => handleConfigUpdate('enhanced_ecommerce', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsSettings;

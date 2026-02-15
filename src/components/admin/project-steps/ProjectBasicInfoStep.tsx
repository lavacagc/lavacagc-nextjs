import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, MapPin, DollarSign, Sparkles, Check, ChevronsUpDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getAllLocations } from '@/data/locationData';
import { ProjectFormData } from '../ProjectUploadSystem';
import { cn } from '@/lib/utils';

interface ProjectBasicInfoStepProps {
  formData: ProjectFormData;
  updateFormData: (updates: Partial<ProjectFormData>) => void;
}

const serviceTypes = [
  'Kitchen Remodeling',
  'Bathroom Renovation', 
  'Basement Finishing',
  'Home Additions',
  'Whole Home Remodel',
  'Custom Living Space'
];

const budgetRanges = [
  '$5,000 - $15,000',
  '$15,000 - $25,000',
  '$25,000 - $50,000',
  '$50,000 - $75,000', 
  '$75,000 - $100,000',
  '$100,000+'
];

export function ProjectBasicInfoStep({ formData, updateFormData }: ProjectBasicInfoStepProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_locations] = useState(getAllLocations());
  const [serviceAreas, setServiceAreas] = useState<Array<{id: string, name: string}>>([]);
  const [locationOpen, setLocationOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);

  // Fetch service areas from database
  useEffect(() => {
    const fetchServiceAreas = async () => {
      const { data, error } = await supabase
        .from('service_areas')
        .select('id, name')
        .eq('active', true)
        .order('name');
      
      if (!error && data) {
        setServiceAreas(data);
      }
    };
    
    fetchServiceAreas();
  }, []);
  
  const generateProjectTitle = async () => {
    if (!formData.service_types.length || !formData.location) {
      return;
    }

    setIsGeneratingTitle(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-project-assistant', {
        body: {
          action: 'generate_title',
          data: {
            service_types: formData.service_types,
            location: formData.location,
            client_name: formData.client_first_name
          }
        }
      });

      if (error) throw error;
      
      if (data.title) {
        updateFormData({ title: data.title });
      }
    } catch (error) {
      console.error('Error generating title:', error);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleServiceTypeChange = (serviceType: string, checked: boolean) => {
    const currentServices = formData.service_types || [];
    if (checked) {
      updateFormData({ service_types: [...currentServices, serviceType] });
    } else {
      updateFormData({ service_types: currentServices.filter(s => s !== serviceType) });
    }
  };

  // Auto-generate title when service types or location change
  useEffect(() => {
    if (formData.service_types.length > 0 && formData.location && !formData.title) {
      const timer = setTimeout(() => {
        generateProjectTitle();
      }, 1000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on service_types/location changes, generateProjectTitle is stable
  }, [formData.service_types, formData.location]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Name */}
        <div className="space-y-2">
          <Label htmlFor="title">Project Name</Label>
          <div className="flex gap-2">
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => updateFormData({ title: e.target.value })}
              placeholder="e.g., Modern Kitchen Transformation"
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={generateProjectTitle}
              disabled={isGeneratingTitle || !formData.service_types.length || !formData.location}
            >
              <Sparkles className="w-4 h-4" />
              {isGeneratingTitle ? 'Generating...' : 'AI Suggest'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Auto-suggests based on service type and location
          </p>
        </div>

        {/* Client First Name */}
        <div className="space-y-2">
          <Label htmlFor="client-name">Client First Name</Label>
          <Input
            id="client-name"
            value={formData.client_first_name}
            onChange={(e) => updateFormData({ client_first_name: e.target.value })}
            placeholder="e.g., Sarah"
          />
          <p className="text-sm text-muted-foreground">
            For testimonials (first name only for privacy)
          </p>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label>Location</Label>
        <Popover open={locationOpen} onOpenChange={setLocationOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={locationOpen}
              className="w-full justify-between"
            >
              {formData.location ? (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {formData.location}
                </div>
              ) : (
                "Select or type location..."
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 bg-background border z-50">
            <Command>
              <CommandInput 
                placeholder="Search locations or type new location..." 
                value={formData.location}
                onValueChange={(value) => updateFormData({ location: value })}
              />
              <CommandList>
                <CommandEmpty>
                  {formData.location ? (
                    <div className="p-2">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setLocationOpen(false);
                        }}
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        Use &quot;{formData.location}&quot;
                      </Button>
                    </div>
                  ) : (
                    "Type to add custom location"
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {serviceAreas.map((area) => (
                    <CommandItem
                      key={area.id}
                      value={area.name}
                      onSelect={(value) => {
                        updateFormData({ location: value });
                        setLocationOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          formData.location === area.name ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <MapPin className="mr-2 h-4 w-4" />
                      {area.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className="text-sm text-muted-foreground">
          Select from service areas or type a custom location
        </p>
      </div>

      {/* Service Types */}
      <div className="space-y-3">
        <Label>Service Types (Select all that apply)</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {serviceTypes.map((service) => (
            <Card key={service} className="p-3">
              <div className="flex items-center space-x-3">
                <AdminCheckbox
                  id={service}
                  checked={formData.service_types?.includes(service) || false}
                  onCheckedChange={(checked) => handleServiceTypeChange(service, checked as boolean)}
                />
                <Label htmlFor={service} className="text-sm font-medium">
                  {service}
                </Label>
              </div>
            </Card>
          ))}
        </div>
        {formData.service_types?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {formData.service_types.map((service) => (
              <Badge key={service} variant="secondary">
                {service}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Date Completed */}
        <div className="space-y-2">
          <Label htmlFor="date-completed">Date Completed</Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !formData.date_completed && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formData.date_completed ? (
                  format(new Date(formData.date_completed), "MMMM yyyy")
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-background border z-50" align="start">
              <Calendar
                mode="single"
                selected={formData.date_completed ? new Date(formData.date_completed) : undefined}
                onSelect={(date) => {
                  if (date) {
                    updateFormData({ date_completed: format(date, "yyyy-MM-dd") });
                    setDateOpen(false);
                  }
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Budget Range */}
        <div className="space-y-2">
          <Label>Budget Range</Label>
          <Select 
            value={formData.budget_range} 
            onValueChange={(value) => updateFormData({ budget_range: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select budget range" />
            </SelectTrigger>
            <SelectContent>
              {budgetRanges.map((range) => (
                <SelectItem key={range} value={range}>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {range}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Preview Card */}
      {(formData.title || formData.location || formData.service_types?.length > 0) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <h4 className="font-semibold mb-2">Project Preview</h4>
            <div className="space-y-2">
              {formData.title && <p><strong>Title:</strong> {formData.title}</p>}
              {formData.location && <p><strong>Location:</strong> {formData.location}</p>}
              {formData.service_types?.length > 0 && (
                <p><strong>Services:</strong> {formData.service_types.join(', ')}</p>
              )}
              {formData.budget_range && <p><strong>Budget:</strong> {formData.budget_range}</p>}
              {formData.date_completed && (
                <p><strong>Completed:</strong> {format(new Date(formData.date_completed), "MMMM yyyy")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
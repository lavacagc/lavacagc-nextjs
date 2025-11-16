import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Save, MapPin } from 'lucide-react';

interface ServiceArea {
  id: string;
  name: string;
  zip_code?: string;
  description?: string;
  has_page: boolean;
  sort_order: number;
  active: boolean;
}

export function ServiceAreasEditor() {
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
  const [editingArea, setEditingArea] = useState<ServiceArea | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadServiceAreas();
  }, []);

  const loadServiceAreas = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_areas')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setServiceAreas(data || []);
    } catch (error) {
      console.error('Error loading service areas:', error);
      toast({
        title: "Error",
        description: "Failed to load service areas",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingArea?.name) {
      toast({
        title: "Validation Error",
        description: "Area name is required",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const areaData = {
        name: editingArea.name,
        zip_code: editingArea.zip_code || null,
        description: editingArea.description || null,
        has_page: editingArea.has_page,
        sort_order: editingArea.sort_order,
        active: editingArea.active
      };

      if (editingArea.id && editingArea.id !== 'new') {
        const { error } = await supabase
          .from('service_areas')
          .update(areaData)
          .eq('id', editingArea.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('service_areas')
          .insert(areaData);
        if (error) throw error;
      }

      setEditingArea(null);
      loadServiceAreas();
      toast({
        title: "Success",
        description: "Service area saved successfully"
      });
    } catch (error) {
      console.error('Error saving service area:', error);
      toast({
        title: "Error",
        description: "Failed to save service area",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('service_areas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      loadServiceAreas();
      toast({
        title: "Success",
        description: "Service area deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting service area:', error);
      toast({
        title: "Error",
        description: "Failed to delete service area",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Service Areas Management</h3>
        <Button onClick={() => setEditingArea({
          id: 'new',
          name: '',
          zip_code: '',
          description: '',
          has_page: false,
          sort_order: serviceAreas.length + 1,
          active: true
        })}>
          <Plus className="w-4 h-4 mr-2" />
          Add Service Area
        </Button>
      </div>

      {editingArea && (
        <Card>
          <CardHeader>
            <CardTitle>{editingArea.id === 'new' ? 'Add New Service Area' : 'Edit Service Area'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Area Name</Label>
                <Input
                  id="name"
                  value={editingArea.name}
                  onChange={(e) => setEditingArea({...editingArea, name: e.target.value})}
                  placeholder="e.g., Short Hills"
                />
              </div>
              <div>
                <Label htmlFor="zip">Zip Code (Optional)</Label>
                <Input
                  id="zip"
                  value={editingArea.zip_code || ''}
                  onChange={(e) => setEditingArea({...editingArea, zip_code: e.target.value})}
                  placeholder="e.g., 07078"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editingArea.description || ''}
                onChange={(e) => setEditingArea({...editingArea, description: e.target.value})}
                placeholder="Brief description of services in this area"
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="has_page"
                checked={editingArea.has_page}
                onCheckedChange={(checked) => setEditingArea({...editingArea, has_page: checked})}
              />
              <Label htmlFor="has_page">Has dedicated page</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingArea(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                Save Area
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {serviceAreas.map((area) => (
          <Card key={area.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4" />
                    <h4 className="font-semibold">{area.name}</h4>
                    {area.zip_code && (
                      <Badge variant="outline" className="text-xs">
                        {area.zip_code}
                      </Badge>
                    )}
                    <Badge variant={area.active ? "default" : "secondary"}>
                      {area.active ? "Active" : "Inactive"}
                    </Badge>
                    {area.has_page && (
                      <Badge variant="outline" className="text-xs">
                        Has Page
                      </Badge>
                    )}
                  </div>
                  {area.description && (
                    <p className="text-sm text-muted-foreground">{area.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingArea(area)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDelete(area.id, area.name)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
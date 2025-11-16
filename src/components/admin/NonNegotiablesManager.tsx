import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, GripVertical, Shield } from 'lucide-react';

interface NonNegotiable {
  id: string;
  description: string;
  project_type_id: string | null;
  applies_to_all: boolean;
  display_order: number;
  active: boolean;
}

interface ProjectType {
  id: string;
  display_name: string;
}

export function NonNegotiablesManager() {
  const [nonNegotiables, setNonNegotiables] = useState<NonNegotiable[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<NonNegotiable | null>(null);
  const [formData, setFormData] = useState<Partial<NonNegotiable>>({
    applies_to_all: false,
    active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [nonNegResponse, projectTypesResponse] = await Promise.all([
        supabase
          .from('non_negotiables')
          .select('*')
          .order('display_order'),
        supabase
          .from('calculator_project_types')
          .select('id, display_name')
          .eq('active', true)
      ]);

      if (nonNegResponse.error) throw nonNegResponse.error;
      if (projectTypesResponse.error) throw projectTypesResponse.error;

      setNonNegotiables(nonNegResponse.data || []);
      setProjectTypes(projectTypesResponse.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load non-negotiables",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      if (!formData.description) {
        toast({
          title: "Validation Error",
          description: "Description is required",
          variant: "destructive"
        });
        return;
      }

      if (editing?.id) {
        const { error } = await supabase
          .from('non_negotiables')
          .update(formData)
          .eq('id', editing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('non_negotiables')
          .insert(formData as any);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Non-negotiable ${editing ? 'updated' : 'created'}`
      });

      setShowDialog(false);
      setEditing(null);
      setFormData({ applies_to_all: false, active: true });
      loadData();
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: "Error",
        description: "Failed to save non-negotiable",
        variant: "destructive"
      });
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this non-negotiable?')) return;

    try {
      const { error } = await supabase
        .from('non_negotiables')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Non-negotiable deleted"
      });

      loadData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: "Error",
        description: "Failed to delete non-negotiable",
        variant: "destructive"
      });
    }
  };

  const openEdit = (item: NonNegotiable) => {
    setEditing(item);
    setFormData(item);
    setShowDialog(true);
  };

  const openNew = () => {
    setEditing(null);
    setFormData({ applies_to_all: false, active: true });
    setShowDialog(true);
  };

  const getProjectTypeName = (projectTypeId: string | null, appliesAll: boolean) => {
    if (appliesAll) return 'All Projects';
    if (!projectTypeId) return 'Unknown';
    const pt = projectTypes.find(p => p.id === projectTypeId);
    return pt?.display_name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Non-Negotiables Management
              </CardTitle>
              <CardDescription>
                Manage non-negotiable items that apply to all or specific project types
              </CardDescription>
            </div>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" />
              Add Non-Negotiable
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nonNegotiables.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell>
                    <p className="whitespace-pre-wrap">{item.description}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.applies_to_all ? "default" : "secondary"}>
                      {getProjectTypeName(item.project_type_id, item.applies_to_all)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {nonNegotiables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No non-negotiables yet. Add your first non-negotiable item.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Non-Negotiable' : 'New Non-Negotiable'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Building code compliance and permits"
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.applies_to_all || false}
                onCheckedChange={(checked) => setFormData({ 
                  ...formData, 
                  applies_to_all: checked,
                  project_type_id: checked ? null : formData.project_type_id
                })}
              />
              <Label>Applies to All Projects</Label>
            </div>

            {!formData.applies_to_all && (
              <div>
                <Label>Project Type</Label>
                <Select
                  value={formData.project_type_id || ''}
                  onValueChange={(value) => setFormData({ ...formData, project_type_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectTypes.map(pt => (
                      <SelectItem key={pt.id} value={pt.id}>{pt.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.active !== false}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

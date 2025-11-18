import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MarkdownEditor } from './MarkdownEditor';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Save, Star, Building, Upload, X } from 'lucide-react';
import { convertHeicToJpeg } from '@/utils/heicConverter';

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  featured: boolean;
  sort_order: number;
  active: boolean;
  client_first_name?: string;
  date_completed?: string;
  budget_range?: string;
  challenge?: string;
  solution?: string;
  featured_image_id?: string;
}

interface ProjectImage {
  url: string;
  caption?: string;
}

const projectTypes = [
  'Kitchen Remodeling',
  'Bathroom Renovation', 
  'Basement Finishing',
  'Home Additions',
  'Whole Home Remodel',
  'Custom Living Space'
];

export function ProjectsEditor() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectImages, setProjectImages] = useState<ProjectImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (editingProject && editingProject.id !== 'new') {
      if (editingProject.featured_image_id) {
        setProjectImages([{ url: editingProject.featured_image_id, caption: 'Main project image' }]);
      } else {
        setProjectImages([]);
      }
    } else {
      setProjectImages([]);
    }
  }, [editingProject]);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!editingProject?.id || editingProject.id === 'new') {
      toast({
        title: "Error",
        description: "Please save the project first before uploading images",
        variant: "destructive"
      });
      return;
    }

    // Convert HEIC to JPEG if needed
    try {
      file = await convertHeicToJpeg(file);
    } catch (error) {
      console.error('Error converting HEIC:', error);
      toast({
        title: "Conversion Error",
        description: `Failed to convert ${file.name}. Please try a different format.`,
        variant: "destructive"
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${editingProject.id}_${Date.now()}.${fileExt}`;
      const filePath = `projects/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('project-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('project-images')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('projects')
        .update({ featured_image_id: publicUrl })
        .eq('id', editingProject.id);

      if (updateError) throw updateError;

      setEditingProject({...editingProject, featured_image_id: publicUrl});
      setProjectImages([{ url: publicUrl, caption: 'Main project image' }]);
      
      toast({
        title: "Success",
        description: "Image uploaded successfully"
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error",
        description: "Failed to upload image",
        variant: "destructive"
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!editingProject?.id) return;

    try {
      const { error } = await supabase
        .from('projects')
        .update({ featured_image_id: null })
        .eq('id', editingProject.id);

      if (error) throw error;
      
      setEditingProject({...editingProject, featured_image_id: undefined});
      setProjectImages([]);
      toast({
        title: "Success",
        description: "Image deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting image:', error);
      toast({
        title: "Error",
        description: "Failed to delete image",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!editingProject?.title || !editingProject?.location || !editingProject?.service_types?.length) {
      toast({
        title: "Validation Error",
        description: "Title, location, and service types are required",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const projectData = {
        title: editingProject.title,
        location: editingProject.location,
        service_types: editingProject.service_types,
        featured: editingProject.featured,
        sort_order: editingProject.sort_order,
        active: editingProject.active,
        client_first_name: editingProject.client_first_name,
        date_completed: editingProject.date_completed,
        budget_range: editingProject.budget_range,
        challenge: editingProject.challenge,
        solution: editingProject.solution,
        featured_image_id: editingProject.featured_image_id
      };

      if (editingProject.id && editingProject.id !== 'new') {
        const { error } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', editingProject.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('projects')
          .insert(projectData);
        if (error) throw error;
      }

      setEditingProject(null);
      loadProjects();
      toast({
        title: "Success",
        description: "Project saved successfully"
      });
    } catch (error) {
      console.error('Error saving project:', error);
      toast({
        title: "Error",
        description: "Failed to save project",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      loadProjects();
      toast({
        title: "Success",
        description: "Project deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({
        title: "Error",
        description: "Failed to delete project",
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
        <h3 className="text-lg font-semibold">Projects Management</h3>
        <Button onClick={() => setEditingProject({
          id: 'new',
          title: '',
          location: '',
          service_types: [projectTypes[0]],
          featured: false,
          sort_order: projects.length + 1,
          active: true,
          client_first_name: '',
          date_completed: '',
          budget_range: '',
          challenge: '',
          solution: '',
          featured_image_id: ''
        })}>
          <Plus className="w-4 h-4 mr-2" />
          Add Project
        </Button>
      </div>

      {editingProject && (
        <Card>
          <CardHeader>
            <CardTitle>{editingProject.id === 'new' ? 'Add New Project' : 'Edit Project'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Project Title</Label>
                <Input
                  id="title"
                  value={editingProject.title}
                  onChange={(e) => setEditingProject({...editingProject, title: e.target.value})}
                  placeholder="e.g., Modern Kitchen Transformation"
                />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={editingProject.location}
                  onChange={(e) => setEditingProject({...editingProject, location: e.target.value})}
                  placeholder="e.g., Short Hills, NJ"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="service_types">Service Types</Label>
                <Select 
                  value={editingProject.service_types?.[0] || projectTypes[0]} 
                  onValueChange={(value) => setEditingProject({...editingProject, service_types: [value]})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="budget_range">Budget Range</Label>
                <Input
                  id="budget_range"
                  value={editingProject.budget_range || ''}
                  onChange={(e) => setEditingProject({...editingProject, budget_range: e.target.value})}
                  placeholder="e.g., $50,000 - $75,000"
                />
              </div>
            </div>

            <div>
              <MarkdownEditor
                label="Project Challenge"
                value={editingProject.challenge || ''}
                onChange={(challenge) => setEditingProject({...editingProject, challenge})}
                placeholder="Describe the main challenges of this project using Markdown..."
                rows={6}
              />
            </div>

            <div>
              <MarkdownEditor
                label="Solution Provided"
                value={editingProject.solution || ''}
                onChange={(solution) => setEditingProject({...editingProject, solution})}
                placeholder="How did you solve the challenges using Markdown..."
                rows={6}
              />
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="featured"
                  checked={editingProject.featured}
                  onCheckedChange={(checked) => setEditingProject({...editingProject, featured: checked})}
                />
                <Label htmlFor="featured">Featured project</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={editingProject.active}
                  onCheckedChange={(checked) => setEditingProject({...editingProject, active: checked})}
                />
                <Label htmlFor="active">Active</Label>
              </div>
            </div>

            {editingProject.featured && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Label htmlFor="sort_order" className="text-sm font-medium mb-2 block">
                  Display Order (Homepage)
                </Label>
                <Input
                  id="sort_order"
                  type="number"
                  min="0"
                  value={editingProject.sort_order || 0}
                  onChange={(e) => setEditingProject({...editingProject, sort_order: parseInt(e.target.value) || 0})}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lower numbers appear first on homepage (0, 1, 2, etc.)
                </p>
              </div>
            )}

            {/* Project Images Section */}
            {editingProject.id !== 'new' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Project Image</Label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isUploadingImage}
                    />
                    <Button variant="outline" disabled={isUploadingImage}>
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploadingImage ? 'Uploading...' : 'Upload Image'}
                    </Button>
                  </div>
                </div>
                
                {projectImages.length > 0 && (
                  <div className="grid grid-cols-1 gap-4">
                    {projectImages.map((image, index) => (
                      <Card key={index} className="relative">
                        <CardContent className="p-2">
                          <div className="aspect-video relative bg-muted rounded overflow-hidden mb-2">
                            {/* Blurred background */}
                            <div
                              className="absolute inset-0 scale-110 blur-md opacity-30"
                              style={{
                                backgroundImage: `url(${image.url})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                filter: 'blur(20px)',
                              }}
                            />
                            
                            {/* Main centered image */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <img
                                src={image.url}
                                alt={image.caption || 'Project image'}
                                className="max-w-full max-h-full object-contain"
                                style={{ zIndex: 1 }}
                              />
                            </div>
                            
                            <Button
                              variant="destructive"
                              size="sm"
                              className="absolute top-2 right-2 z-10"
                              onClick={handleDeleteImage}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                          <Input
                            placeholder="Image caption..."
                            value={image.caption || ''}
                            onChange={(e) => {
                              const updatedImages = [...projectImages];
                              updatedImages[index] = { ...image, caption: e.target.value };
                              setProjectImages(updatedImages);
                            }}
                            className="text-sm"
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingProject(null)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                Save Project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Building className="w-4 h-4" />
                    <h4 className="font-semibold">{project.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {project.service_types?.[0] || 'No service type'}
                    </Badge>
                    <Badge variant={project.active ? "default" : "secondary"}>
                      {project.active ? "Active" : "Inactive"}
                    </Badge>
                    {project.featured && (
                      <Badge variant="default" className="bg-yellow-500">
                        <Star className="w-3 h-3 mr-1" />
                        Featured
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">📍 {project.location}</p>
                  <p className="text-sm text-muted-foreground">{project.challenge || 'No description'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingProject(project)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleDelete(project.id, project.title)}
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
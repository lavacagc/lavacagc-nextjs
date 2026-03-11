import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Grid, Loader2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import { ProjectBasicInfoStep } from './project-steps/ProjectBasicInfoStep';
import { ProjectPhotosStep } from './project-steps/ProjectPhotosStep';
import { ProjectDetailsStep } from './project-steps/ProjectDetailsStep';
import { ProjectSEOStep } from './project-steps/ProjectSEOStep';
import { PortfolioManager } from './PortfolioManager';

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  date_completed: string;
  budget_range: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  client_first_name: string;
  testimonial_rating: number;
  featured_image_id?: string;
  challenge: string;
  solution: string;
  materials_used: string[];
  special_features: string[];
  duration: string;
  testimonial_text: string;
  seo_title: string;
  meta_description: string;
  url_slug: string;
  focus_keyword: string;
  project_images?: Array<{
    id: string;
    image_category: string;
    image_url: string;
    is_featured: boolean;
  }>;
}

export interface ProjectFormData {
  // Basic Info
  title: string;
  client_first_name: string;
  location: string;
  service_types: string[];
  date_completed: string;
  budget_range: string;
  
  // Photos
  images: Array<{
    file?: File;
    url?: string;
    media_type?: 'image' | 'video';
    category: 'before' | 'during' | 'after';
    alt_text: string;
    is_featured: boolean;
    sort_order: number;
    room?: string;
  }>;
  
  // Details
  challenge: string;
  solution: string;
  materials_used: string[];
  special_features: string[];
  duration: string;
  testimonial_text: string;
  testimonial_rating: number;
  
  // SEO
  seo_title: string;
  meta_description: string;
  url_slug: string;
  focus_keyword: string;
}

const initialFormData: ProjectFormData = {
  title: '',
  client_first_name: '',
  location: '',
  service_types: [],
  date_completed: '',
  budget_range: '',
  images: [],
  challenge: '',
  solution: '',
  materials_used: [],
  special_features: [],
  duration: '',
  testimonial_text: '',
  testimonial_rating: 5,
  seo_title: '',
  meta_description: '',
  url_slug: '',
  focus_keyword: ''
};

const steps = [
  { id: 1, title: 'Photos', description: 'Upload images (auto-generates content)' },
  { id: 2, title: 'Basic Info', description: 'Project details and location' },
  { id: 3, title: 'Details', description: 'Project story and testimonials' },
  { id: 4, title: 'SEO', description: 'Search optimization' }
];

interface ProjectUploadSystemProps {
  mode: 'upload' | 'manage' | 'edit';
  onModeChange: (mode: 'upload' | 'manage' | 'edit', project?: Project) => void;
  editProject?: Project;
}

export function ProjectUploadSystem({ mode, onModeChange, editProject }: ProjectUploadSystemProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ProjectFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load project data when editing
  useEffect(() => {
    if (mode === 'edit' && editProject) {
      populateFormFromProject(editProject);
    } else if (mode === 'upload') {
      setFormData(initialFormData);
      setCurrentStep(1);
    }
  }, [mode, editProject]);

  const populateFormFromProject = async (project: Project) => {
    // Fetch project images
    let projectImages: Array<{ url?: string; media_type?: 'image' | 'video'; category: 'before' | 'during' | 'after'; alt_text: string; is_featured: boolean; sort_order: number }> = [];
    try {
      const { data: images } = await supabase
        .from('project_images')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order');
      
      projectImages = (images || []).map(img => ({
        url: img.image_url,
        media_type: (img.media_type || 'image') as 'image' | 'video',
        category: (img.image_category || 'after') as 'before' | 'during' | 'after',
        alt_text: img.alt_text || '',
        is_featured: img.is_featured,
        sort_order: img.sort_order
      }));
    } catch (error) {
      console.error('Error loading project images:', error);
    }

    setFormData({
      title: project.title,
      client_first_name: project.client_first_name || '',
      location: project.location,
      service_types: project.service_types,
      date_completed: project.date_completed || '',
      budget_range: project.budget_range || '',
      images: projectImages,
      challenge: project.challenge || '',
      solution: project.solution || '',
      materials_used: project.materials_used || [],
      special_features: project.special_features || [],
      duration: project.duration || '',
      testimonial_rating: project.testimonial_rating || 0,
      testimonial_text: project.testimonial_text || '',
      seo_title: project.seo_title || '',
      meta_description: project.meta_description || '',
      url_slug: project.url_slug || '',
      focus_keyword: project.focus_keyword || ''
    });
  };

  const updateFormData = (updates: Partial<ProjectFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Discard draft and clean up temporary images
  const discardDraft = async () => {
    setIsLoading(true);
    try {
      // Get all draft image URLs
      const draftImageUrls = formData.images
        .map(img => img.url)
        .filter(url => url.includes('/drafts/'));

      // Extract file paths from URLs and delete from storage
      if (draftImageUrls.length > 0) {
        const filePaths = draftImageUrls.map(url => {
          const match = url.match(/\/project-images\/(.+)$/);
          return match ? match[1] : null;
        }).filter(Boolean) as string[];

        if (filePaths.length > 0) {
          await supabase.storage
            .from('project-images')
            .remove(filePaths);
        }
      }

      // Reset form
      setFormData(initialFormData);
      setCurrentStep(1);
      
      toast({
        title: "Draft Discarded",
        description: "All temporary images have been deleted",
      });

      onModeChange('manage');
    } catch (error) {
      console.error('Error discarding draft:', error);
      toast({
        title: "Error",
        description: "Failed to discard draft",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate project content from images using Gemini API
  const generateProjectContent = async () => {
    const beforeImgs = formData.images.filter(img => img.category === 'before');
    const afterImgs = formData.images.filter(img => img.category === 'after');

    if (beforeImgs.length === 0 && afterImgs.length === 0) {
      toast({
        title: "No Images",
        description: "Please upload some images first",
        variant: "destructive",
      });
      return;
    }

    if (beforeImgs.length === 0 || afterImgs.length === 0) {
      toast({
        title: "Missing Images",
        description: "Upload at least one before AND one after photo for best AI analysis",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Compress images client-side to stay under Vercel's 4.5MB payload limit
      const compressImage = (file: File, maxDim = 1200, quality = 0.7): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
              if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
              else { width = Math.round((width * maxDim) / height); height = maxDim; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas failed')); return; }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = URL.createObjectURL(file);
        });
      };

      const beforeBase64 = await Promise.all(
        beforeImgs.slice(0, 3).map(async (img) => {
          if (img.file) return compressImage(img.file);
          return img.url || '';
        })
      );

      const afterBase64 = await Promise.all(
        afterImgs.slice(0, 3).map(async (img) => {
          if (img.file) return compressImage(img.file);
          return img.url || '';
        })
      );

      const rooms = [...new Set(formData.images.map(img => img.room).filter(Boolean))];

      const response = await fetch('/api/admin/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeImages: beforeBase64.filter(Boolean),
          afterImages: afterBase64.filter(Boolean),
          location: formData.location || 'New Jersey',
          serviceTypes: formData.service_types.length > 0 ? formData.service_types : ['renovation'],
          rooms,
          mode: 'compare',
        }),
      });

      if (!response.ok) throw new Error('Analysis failed');

      const data = await response.json();

      if (data.content) {
        updateFormData({
          title: data.content.title || '',
          challenge: data.content.challenge || '',
          solution: data.content.solution || '',
          special_features: data.content.specialFeatures || [],
          materials_used: data.content.materialsUsed || [],
          seo_title: data.content.seoTitle || '',
          meta_description: data.content.metaDescription || ''
        });
        
        toast({
          title: "Content Generated!",
          description: "Review and modify as needed.",
        });
      }
    } catch (error) {
      console.error('Error generating content:', error);
      toast({
        title: "Error",
        description: "Failed to generate content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = async () => {
    // Only auto-generate content for NEW projects without existing content
    // Skip if: 1) editing existing project, 2) content already exists
    const hasExistingContent = formData.challenge || formData.solution || formData.title;
    const shouldGenerate = mode === 'upload' && 
                          currentStep === 1 && 
                          formData.images.length > 0 && 
                          !hasExistingContent;
    
    if (shouldGenerate) {
      await generateProjectContent();
    }
    
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _generateSlug = async (title: string, location: string) => {
    try {
      const { data, error } = await supabase.rpc('generate_project_slug', {
        project_title: title,
        project_location: location
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error generating slug:', error);
      // Fallback slug generation
      return `${title}-${location}`.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.location || formData.service_types.length === 0) {
      toast({
        title: "Validation Error",
        description: "Title, location, and at least one service type are required",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      // Generate URL slug if not provided (only for new projects)
      let slug = formData.url_slug;
      if (!slug && mode !== 'edit') {
        slug = formData.title.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '') + '-' + formData.location.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
        updateFormData({ url_slug: slug });
      } else if (mode === 'edit' && editProject) {
        // For editing, keep the existing slug and don't update it
        slug = editProject.url_slug;
      }

      const baseProjectData = {
        title: formData.title,
        client_first_name: formData.client_first_name,
        location: formData.location,
        service_types: formData.service_types,
        date_completed: formData.date_completed ? new Date(formData.date_completed).toISOString().split('T')[0] : null,
        budget_range: formData.budget_range,
        challenge: formData.challenge,
        solution: formData.solution,
        materials_used: formData.materials_used,
        special_features: formData.special_features,
        duration: formData.duration,
        testimonial_text: formData.testimonial_text,
        testimonial_rating: formData.testimonial_rating,
        seo_title: formData.seo_title,
        meta_description: formData.meta_description,
        focus_keyword: formData.focus_keyword
      };

      // Only include url_slug for new projects, not edits to avoid constraint violations
      const projectData = mode === 'edit' ? baseProjectData : { ...baseProjectData, url_slug: slug };

      let project;
      
      if (mode === 'edit' && editProject) {
        // FIRST: Clear featured_image_id to avoid foreign key constraint violation
        await supabase
          .from('projects')
          .update({ featured_image_id: null })
          .eq('id', editProject.id);

        // SECOND: Delete existing images now that foreign key is cleared
        await supabase
          .from('project_images')
          .delete()
          .eq('project_id', editProject.id);

        // THIRD: Update project data
        const { data, error: projectError } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', editProject.id)
          .select()
          .single();

        if (projectError) throw projectError;
        project = data;
      } else {
        // Insert new project
        const { data, error: projectError } = await supabase
          .from('projects')
          .insert({
            ...projectData,
            featured: false,
            active: true,
            sort_order: 0
          })
          .select()
          .single();

        if (projectError) throw projectError;
        project = data;
      }

      // Handle image uploads and move from draft to permanent storage
      if (formData.images.length > 0) {
        const uploadPromises = formData.images.map(async (image, index) => {
          // Skip existing images that don't have a file (already uploaded permanently)
          if (image.url && !image.file && !image.url.includes('/drafts/')) {
            // Re-insert existing image record for edit mode
            return supabase
              .from('project_images')
              .insert({
                project_id: project.id,
                image_url: image.url,
                media_type: image.media_type || 'image',
                image_category: image.category,
                alt_text: image.alt_text,
                is_featured: image.is_featured,
                sort_order: image.sort_order || index
              });
          }
          
          if (image.file) {
            const fileExt = image.file.name.split('.').pop();
            const fileName = `${project.id}_${index}.${fileExt}`;
            const filePath = `projects/${fileName}`;

            // Upload to permanent location
            const { error: uploadError } = await supabase.storage
              .from('project-images')
              .upload(filePath, image.file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('project-images')
              .getPublicUrl(filePath);

            // Delete draft version if it exists
            if (image.url.includes('/drafts/')) {
              const draftPath = image.url.match(/\/project-images\/(.+)$/)?.[1];
              if (draftPath) {
                await supabase.storage
                  .from('project-images')
                  .remove([draftPath]);
              }
            }

            // Insert image record
            return supabase
              .from('project_images')
              .insert({
                project_id: project.id,
                image_url: publicUrl,
                media_type: image.media_type || 'image',
                image_category: image.category,
                alt_text: image.alt_text,
                is_featured: image.is_featured,
                sort_order: image.sort_order || index
              });
          }
          return null;
        });

        await Promise.all(uploadPromises.filter(Boolean));
      }

      // Update featured_image_id if there's a featured image
      const featuredImage = formData.images.find(img => img.is_featured);
      if (featuredImage) {
        // Find the featured image record we just inserted
        const { data: imageRecord } = await supabase
          .from('project_images')
          .select('id')
          .eq('project_id', project.id)
          .eq('is_featured', true)
          .single();

        if (imageRecord) {
          await supabase
            .from('projects')
            .update({ featured_image_id: imageRecord.id })
            .eq('id', project.id);
        }
      }

      toast({
        title: "Success",
        description: mode === 'edit' ? "Project updated successfully!" : "Project saved successfully!"
      });

      // Reset form and go to manage mode
      setFormData(initialFormData);
      setCurrentStep(1);
      onModeChange('manage', undefined);
    } catch (error) {
      console.error('Error saving project:', error);
      toast({
        title: "Error",
        description: "Failed to save project. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const progress = (currentStep / steps.length) * 100;

  if (mode === 'manage') {
    return (
      <PortfolioManager 
        onNewProject={() => onModeChange('upload')}
        onEditProject={(project) => {
          onModeChange('edit', project as Project);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {mode === 'edit' ? 'Edit Project' : 'Add New Project'}
          </h2>
          <p className="text-muted-foreground">
            {mode === 'edit' 
              ? 'Update your portfolio project details'
              : 'Follow the steps to add a new portfolio project'
            }
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => onModeChange('manage')}
        >
          <Grid className="w-4 h-4 mr-2" />
          Manage Portfolio
        </Button>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Step {currentStep} of {steps.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
            
            {/* Step indicators */}
            <div className="flex justify-between">
              {steps.map((step) => (
                <div 
                  key={step.id}
                  className={`flex flex-col items-center space-y-2 ${
                    step.id === currentStep ? 'text-primary' : 
                    step.id < currentStep ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step.id === currentStep ? 'bg-primary text-primary-foreground' :
                    step.id < currentStep ? 'bg-green-600 text-white' : 'bg-muted'
                  }`}>
                    {step.id}
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-sm">{step.title}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep - 1].title}</CardTitle>
        </CardHeader>
        <CardContent>
            {currentStep === 1 && (
              <ProjectPhotosStep
                formData={formData}
                updateFormData={updateFormData}
              />
            )}
            {currentStep === 2 && (
              <ProjectBasicInfoStep
                formData={formData}
                updateFormData={updateFormData}
              />
            )}
          {currentStep === 3 && (
            <ProjectDetailsStep 
              formData={formData}
              updateFormData={updateFormData}
            />
          )}
          {currentStep === 4 && (
            <ProjectSEOStep 
              formData={formData}
              updateFormData={updateFormData}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handlePrevious}
            disabled={currentStep === 1 || isGenerating || isSaving}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          {mode === 'upload' && (
            <Button
              variant="outline"
              onClick={discardDraft}
              disabled={isLoading || formData.images.length === 0}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Discard Draft
            </Button>
          )}
        </div>
        
        <div className="flex gap-2">
          {currentStep === steps.length ? (
             <Button 
               onClick={handleSave}
               disabled={isSaving || isGenerating}
               className="bg-green-600 hover:bg-green-700"
             >
               {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
               {isSaving 
                 ? (mode === 'edit' ? 'Updating...' : 'Saving...') 
                 : (mode === 'edit' ? 'Update Project' : 'Save Project')
               }
             </Button>
          ) : (
            <Button onClick={handleNext} disabled={isGenerating || isSaving}>
              {isGenerating && currentStep === 1 && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isGenerating && currentStep === 1 ? 'Generating Content...' : 'Next'}
              {!isGenerating && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
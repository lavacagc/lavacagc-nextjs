import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { Upload, Image, Star, Trash2, Edit, Sparkles, RotateCw, Crop, Sun } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ProjectFormData } from '../ProjectUploadSystem';
import { convertHeicToJpeg } from '@/utils/heicConverter';

interface ProjectPhotosStepProps {
  formData: ProjectFormData;
  updateFormData: (updates: Partial<ProjectFormData>) => void;
}

export function ProjectPhotosStep({ formData, updateFormData }: ProjectPhotosStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const analyzeImage = async (file: File) => {
    console.log('Starting image analysis for:', file.name);
    try {
      // Simple categorization based on filename or default to 'after'
      const filename = file.name.toLowerCase();
      let category: 'before' | 'during' | 'after' = 'after'; // default
      
      if (filename.includes('before')) category = 'before';
      else if (filename.includes('during') || filename.includes('progress')) category = 'during';
      
      console.log('Image category determined:', category);
      
      // Upload to temporary storage to get URL for AI analysis
      const fileExt = file.name.split('.').pop();
      const tempFileName = `temp-analysis-${Date.now()}.${fileExt}`;
      
      console.log('Uploading temp file:', tempFileName);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-images')
        .upload(tempFileName, file);

      if (uploadError) {
        console.error('Error uploading for analysis:', uploadError);
        return {
          category,
          alt_text: `${category === 'before' ? 'Before' : category === 'after' ? 'After' : 'During'} photo of ${formData.service_types.join(' and ')} project in ${formData.location}`
        };
      }

      const { data: { publicUrl } } = supabase.storage
        .from('project-images')
        .getPublicUrl(tempFileName);

      console.log('Calling AI vision analysis with URL:', publicUrl);
      // Call AI vision analysis
      const { data: aiData, error: aiError } = await supabase.functions.invoke('analyze-project-images', {
        body: {
          imageUrl: publicUrl,
          type: category === 'after' ? 'solution' : 'challenge',
          serviceTypes: formData.service_types,
          location: formData.location
        }
      });

      console.log('AI response:', { aiData, aiError });

      // Delete temporary file
      await supabase.storage
        .from('project-images')
        .remove([tempFileName]);

      if (aiError || !aiData?.analysis) {
        console.error('Error from AI analysis:', aiError);
        return {
          category,
          alt_text: `${category === 'before' ? 'Before' : category === 'after' ? 'After' : 'During'} photo showing ${formData.service_types.join(' and ')} work in ${formData.location}`
        };
      }

      // Use the full AI analysis as alt text (it should be concise now)
      const fullAnalysis = aiData.analysis;
      console.log('Generated alt text:', fullAnalysis);

      return {
        category,
        alt_text: fullAnalysis
      };
    } catch (error) {
      console.error('Error analyzing image:', error);
      const filename = file.name.toLowerCase();
      let category: 'before' | 'during' | 'after' = 'after';
      if (filename.includes('before')) category = 'before';
      else if (filename.includes('during') || filename.includes('progress')) category = 'during';
      
      return {
        category,
        alt_text: `${category === 'before' ? 'Before' : category === 'after' ? 'After' : 'During'} photo of ${formData.service_types.join(' and ')} project`
      };
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;

    setIsAnalyzing(true);
    const newImages = [];

    for (let i = 0; i < files.length; i++) {
      let file = files[i];
      
      // Check file type by MIME type or extension
      const isVideo = file.type.startsWith('video/') || 
        /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || 
        /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(file.name);
      
      // Convert HEIC to JPEG if needed (only for images)
      if (isImage && !isVideo) {
        try {
          file = await convertHeicToJpeg(file);
        } catch (error) {
          console.error('Error converting HEIC:', error);
          toast({
            title: "HEIC Conversion Not Supported",
            description: error instanceof Error ? error.message : "Please convert HEIC files to JPG using your device's Photos app before uploading.",
            variant: "destructive"
          });
          continue;
        }
      }
      
      // Validate file type
      if (!isImage && !isVideo) {
        toast({
          title: "Invalid File",
          description: `${file.name} is not an image or video file. Detected type: ${file.type}`,
          variant: "destructive"
        });
        continue;
      }

      // Analyze media with AI (only for images)
      const analysis = isImage ? await analyzeImage(file) : null;
      
      const mediaData = {
        file,
        url: URL.createObjectURL(file),
        media_type: (isVideo ? 'video' : 'image') as 'image' | 'video',
        category: (analysis?.category || 'after') as 'before' | 'during' | 'after',
        alt_text: analysis?.alt_text || `Project ${isVideo ? 'video' : 'image'} ${formData.images.length + newImages.length + 1}`,
        is_featured: formData.images.length === 0 && newImages.length === 0, // First media is featured by default
        sort_order: formData.images.length + newImages.length
      };

      newImages.push(mediaData);
    }

    updateFormData({ 
      images: [...formData.images, ...newImages] 
    });
    
    setIsAnalyzing(false);
    
    if (newImages.length > 0) {
      const imageCount = newImages.filter(m => m.media_type === 'image').length;
      const videoCount = newImages.filter(m => m.media_type === 'video').length;
      
      let description = '';
      if (imageCount > 0 && videoCount > 0) {
        description = `${imageCount} image${imageCount > 1 ? 's' : ''} and ${videoCount} video${videoCount > 1 ? 's' : ''} uploaded`;
      } else if (imageCount > 0) {
        description = `${imageCount} image${imageCount > 1 ? 's' : ''} uploaded and analyzed`;
      } else {
        description = `${videoCount} video${videoCount > 1 ? 's' : ''} uploaded`;
      }
      
      toast({
        title: "Success",
        description
      });
    } else if (files.length > 0) {
      toast({
        title: "No Files Uploaded",
        description: "Please check that you're uploading valid image or video files",
        variant: "destructive"
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  }, [formData.images]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const updateImage = (index: number, updates: Partial<typeof formData.images[0]>) => {
    const updatedImages = [...formData.images];
    updatedImages[index] = { ...updatedImages[index], ...updates };
    updateFormData({ images: updatedImages });
  };

  const removeImage = (index: number) => {
    const updatedImages = formData.images.filter((_, i) => i !== index);
    // Reorder sort_order
    updatedImages.forEach((img, i) => img.sort_order = i);
    updateFormData({ images: updatedImages });
  };

  const setFeaturedImage = (index: number) => {
    const updatedImages = formData.images.map((img, i) => ({
      ...img,
      is_featured: i === index
    }));
    updateFormData({ images: updatedImages });
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    const updatedImages = [...formData.images];
    const [removed] = updatedImages.splice(fromIndex, 1);
    updatedImages.splice(toIndex, 0, removed);
    
    // Update sort_order
    updatedImages.forEach((img, i) => img.sort_order = i);
    updateFormData({ images: updatedImages });
  };

  const generateAltText = async (index: number) => {
    const image = formData.images[index];
    if (!image) return;

    // Only generate alt text for images, not videos
    if (image.media_type === 'video') {
      toast({
        title: "Info",
        description: "Alt text generation is only available for images",
        variant: "default"
      });
      return;
    }

    try {
      setIsAnalyzing(true);
      
      // Get the image URL - could be a blob URL or a public URL
      let imageUrl = image.url;
      
      // If it's a blob URL, we need to upload temporarily for analysis
      if (imageUrl.startsWith('blob:')) {
        const tempFileName = `temp-reanalysis-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('project-images')
          .upload(tempFileName, image.file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('project-images')
          .getPublicUrl(tempFileName);
        
        imageUrl = publicUrl;

        // Call AI vision analysis with the new URL
        const { data, error } = await supabase.functions.invoke('analyze-project-images', {
          body: {
            imageUrl,
            type: image.category === 'after' ? 'solution' : 'challenge',
            serviceTypes: formData.service_types || [],
            location: formData.location
          }
        });

        // Clean up temp file
        await supabase.storage
          .from('project-images')
          .remove([tempFileName]);

        if (error) throw error;
        
        if (data?.analysis) {
          updateImage(index, { alt_text: data.analysis });
          toast({
            title: "Success",
            description: "Alt text regenerated successfully"
          });
        }
      } else {
        // Use existing public URL
        const { data, error } = await supabase.functions.invoke('analyze-project-images', {
          body: {
            imageUrl,
            type: image.category === 'after' ? 'solution' : 'challenge',
            serviceTypes: formData.service_types || [],
            location: formData.location
          }
        });

        if (error) throw error;
        
        if (data?.analysis) {
          updateImage(index, { alt_text: data.analysis });
          toast({
            title: "Success",
            description: "Alt text regenerated successfully"
          });
        }
      }
    } catch (error) {
      console.error('Error generating alt text:', error);
      toast({
        title: "Error",
        description: "Failed to regenerate alt text",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'before': return 'bg-red-100 text-red-800';
      case 'during': return 'bg-yellow-100 text-yellow-800';
      case 'after': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card 
        className={`border-2 border-dashed transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <CardContent className="p-8 text-center">
          <div className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold mb-2">
                {isDragging ? 'Drop media here' : 'Drag & drop images/videos or click to upload'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                AI will automatically categorize images (Before/During/After) and generate alt text
              </p>
              <input
                type="file"
                multiple
                accept="image/*,video/*,video/mp4,video/quicktime,video/x-msvideo,video/webm,.heic,.heif,.mp4,.mov,.avi,.webm"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="image-upload"
              />
              <Button variant="outline" asChild>
                <label htmlFor="image-upload" className="cursor-pointer">
                  <Image className="w-4 h-4 mr-2" />
                  Choose Media
                </label>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAnalyzing && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span>Analyzing images with AI...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Gallery */}
      {formData.images.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
            <h3 className="font-semibold">Uploaded Media ({formData.images.length})</h3>
            <div className="text-sm text-muted-foreground">
              Drag to reorder • First item with star is featured
            </div>
          </div>

          <div className="space-y-4">
            {formData.images.map((image, index) => (
              <Card key={index} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Media Preview */}
                    <div className="relative flex-shrink-0">
                      <div className="w-32 h-24 bg-muted rounded overflow-hidden">
                        {image.media_type === 'video' ? (
                          <video
                            src={image.url}
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <img
                            src={image.url}
                            alt={image.alt_text}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      {image.is_featured && (
                        <Star className="absolute -top-2 -right-2 w-6 h-6 text-yellow-500 fill-current" />
                      )}
                    </div>

                    {/* Image Details */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {image.media_type === 'video' ? 'Video' : 'Image'}
                        </Badge>
                        <Badge className={getCategoryBadgeColor(image.category)}>
                          {image.category.charAt(0).toUpperCase() + image.category.slice(1)}
                        </Badge>
                        {image.is_featured && (
                          <Badge variant="outline">Featured</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Select 
                            value={image.category} 
                            onValueChange={(value: 'before' | 'during' | 'after') => 
                              updateImage(index, { category: value })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="before">Before</SelectItem>
                              <SelectItem value="during">During</SelectItem>
                              <SelectItem value="after">After</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <AdminCheckbox
                                id={`featured-${index}`}
                                checked={image.is_featured}
                                onCheckedChange={(checked) => 
                                  checked && setFeaturedImage(index)
                                }
                              />
                              <Label htmlFor={`featured-${index}`} className="text-xs">
                                Featured
                              </Label>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs">Alt Text (SEO Optimized)</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generateAltText(index)}
                            className="h-6 px-2 text-xs"
                            disabled={isAnalyzing || image.media_type === 'video'}
                          >
                            <RotateCw className={`w-3 h-3 mr-1 ${isAnalyzing ? 'animate-spin' : ''}`} />
                            {isAnalyzing ? 'Analyzing...' : 'Regenerate'}
                          </Button>
                        </div>
                        <Input
                          value={image.alt_text}
                          onChange={(e) => updateImage(index, { alt_text: e.target.value })}
                          placeholder="SEO-optimized description of what's visible in the image"
                          className="h-8 text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {image.alt_text.length} chars {image.alt_text.length > 150 ? '(consider shortening for SEO)' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeImage(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      
                      {/* Move buttons */}
                      {index > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveImage(index, index - 1)}
                        >
                          ↑
                        </Button>
                      )}
                      {index < formData.images.length - 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveImage(index, index + 1)}
                        >
                          ↓
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Media Tips</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Upload high-quality images (minimum 1200px wide recommended)</li>
            <li>• Videos will auto-play muted on project pages</li>
            <li>• Include before, during, and after shots when possible</li>
            <li>• AI will automatically compress images for web optimization</li>
            <li>• Featured media will be used for thumbnails and previews</li>
            <li>• Alt text helps with SEO and accessibility</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
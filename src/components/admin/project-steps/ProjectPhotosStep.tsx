'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { 
  Upload, Image as ImageIcon, Star, Trash2, RotateCw, 
  Sparkles, ArrowLeftRight, ChevronDown, ChevronUp,
  Camera, Home
} from 'lucide-react';
import NextImage from 'next/image';
import { toast } from '@/hooks/use-toast';
import { ProjectFormData } from '../ProjectUploadSystem';
import { convertHeicToJpeg } from '@/utils/heicConverter';

interface ProjectPhotosStepProps {
  formData: ProjectFormData;
  updateFormData: (updates: Partial<ProjectFormData>) => void;
}

const ROOM_OPTIONS = [
  'Kitchen', 'Bathroom', 'Master Bathroom', 'Bedroom', 'Master Bedroom',
  'Living Room', 'Dining Room', 'Basement', 'Attic', 'Garage',
  'Laundry Room', 'Hallway', 'Staircase', 'Exterior', 'Patio/Deck',
  'Office', 'Closet', 'Mudroom', 'Whole House', 'Other'
];

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

// Compress image to max dimensions and JPEG quality to stay under Vercel's 4.5MB payload limit
async function compressImageForAPI(file: File, maxDim = 1200, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export function ProjectPhotosStep({ formData, updateFormData }: ProjectPhotosStepProps) {
  const [isDraggingBefore, setIsDraggingBefore] = useState(false);
  const [isDraggingAfter, setIsDraggingAfter] = useState(false);
  const [isDraggingDuring, setIsDraggingDuring] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [showDuring, setShowDuring] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);
  const duringInputRef = useRef<HTMLInputElement>(null);

  const beforeImages = formData.images.filter(img => img.category === 'before');
  const afterImages = formData.images.filter(img => img.category === 'after');
  const duringImages = formData.images.filter(img => img.category === 'during');

  const processFiles = async (
    files: FileList | null, 
    category: 'before' | 'during' | 'after'
  ) => {
    if (!files) return;

    const newImages = [];
    for (let i = 0; i < files.length; i++) {
      let file = files[i];

      const isVideo = file.type.startsWith('video/') || 
        /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || 
        /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(file.name);

      if (isImage && !isVideo) {
        try {
          file = await convertHeicToJpeg(file);
        } catch (error) {
          console.error('HEIC conversion error:', error);
          toast({
            title: "HEIC Conversion Not Supported",
            description: "Please convert HEIC files to JPG before uploading.",
            variant: "destructive"
          });
          continue;
        }
      }

      if (!isImage && !isVideo) {
        toast({
          title: "Invalid File",
          description: `${file.name} is not an image or video file.`,
          variant: "destructive"
        });
        continue;
      }

      newImages.push({
        file,
        url: URL.createObjectURL(file),
        media_type: (isVideo ? 'video' : 'image') as 'image' | 'video',
        category,
        alt_text: `${category === 'before' ? 'Before' : category === 'after' ? 'After' : 'During'} - ${formData.service_types.join(' & ') || 'renovation'} in ${formData.location || 'NJ'}`,
        is_featured: category === 'after' && formData.images.length === 0 && newImages.length === 0,
        sort_order: formData.images.length + newImages.length,
        room: undefined as string | undefined,
      });
    }

    if (newImages.length > 0) {
      updateFormData({ images: [...formData.images, ...newImages] });

      // Auto-categorize with AI if we have the API
      if (newImages.some(img => img.media_type === 'image')) {
        await smartCategorize(newImages, formData.images.length);
      }

      toast({
        title: "Uploaded",
        description: `${newImages.length} file${newImages.length > 1 ? 's' : ''} added to ${category}`,
      });
    }
  };

  // Use Gemini to verify/correct category assignment
  const smartCategorize = async (
    newImages: Array<typeof formData.images[0]>,
    startIndex: number
  ) => {
    setIsCategorizing(true);
    try {
      for (let i = 0; i < newImages.length; i++) {
        const img = newImages[i];
        if (img.media_type !== 'image' || !img.file) continue;

        const base64 = await compressImageForAPI(img.file);
        const response = await fetch('/api/admin/analyze-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            beforeImages: [base64],
            afterImages: [],
            location: formData.location || 'New Jersey',
            serviceTypes: formData.service_types.length > 0 ? formData.service_types : ['renovation'],
            mode: 'categorize',
          }),
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (data.analysis) {
          const analysis = data.analysis;
          const actualIndex = startIndex + i;

          // Only re-categorize if AI is confident and disagrees
          const updates: Partial<typeof formData.images[0]> = {
            alt_text: analysis.altText || img.alt_text,
          };

          if (analysis.room) {
            updates.room = analysis.room.charAt(0).toUpperCase() + analysis.room.slice(1);
          }

          // If AI disagrees with user's zone choice AND is highly confident, suggest but don't force
          if (analysis.category !== img.category && analysis.confidence > 0.85) {
            updates.category = analysis.category;
            toast({
              title: "AI Reclassified",
              description: `Image moved from "${img.category}" to "${analysis.category}" (${Math.round(analysis.confidence * 100)}% confident)`,
            });
          }

          // Update the image in formData
          const updatedImages = [...formData.images];
          if (updatedImages[actualIndex]) {
            updatedImages[actualIndex] = { ...updatedImages[actualIndex], ...updates };
            updateFormData({ images: updatedImages });
          }
        }
      }
    } catch (error) {
      console.error('Smart categorize error:', error);
    } finally {
      setIsCategorizing(false);
    }
  };

  // Full before/after comparison analysis
  const analyzeTransformation = async () => {
    if (beforeImages.length === 0 || afterImages.length === 0) {
      toast({
        title: "Need Both",
        description: "Upload at least one before AND one after photo to analyze the transformation.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      // Convert images to compressed base64 (max 1200px, 70% JPEG)
      const beforeBase64 = await Promise.all(
        beforeImages.slice(0, 3).map(async (img) => {
          if (img.file) return compressImageForAPI(img.file);
          // For existing URLs, fetch and compress
          const resp = await fetch(img.url || '');
          const blob = await resp.blob();
          return compressImageForAPI(new File([blob], 'image.jpg'));
        })
      );

      const afterBase64 = await Promise.all(
        afterImages.slice(0, 3).map(async (img) => {
          if (img.file) return compressImageForAPI(img.file);
          const resp = await fetch(img.url || '');
          const blob = await resp.blob();
          return compressImageForAPI(new File([blob], 'image.jpg'));
        })
      );

      const rooms = [...new Set(formData.images.map(img => img.room).filter(Boolean))];

      const response = await fetch('/api/admin/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeImages: beforeBase64,
          afterImages: afterBase64,
          location: formData.location || 'New Jersey',
          serviceTypes: formData.service_types.length > 0 ? formData.service_types : ['renovation'],
          rooms,
          mode: 'compare',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      
      if (data.content) {
        const content = data.content;
        
        // Update form data with AI-generated content
        updateFormData({
          title: content.title || formData.title,
          challenge: content.challenge || formData.challenge,
          solution: content.solution || formData.solution,
          materials_used: content.materialsUsed?.length > 0 ? content.materialsUsed : formData.materials_used,
          special_features: content.specialFeatures?.length > 0 ? content.specialFeatures : formData.special_features,
          seo_title: content.seoTitle || formData.seo_title,
          meta_description: content.metaDescription || formData.meta_description,
        });

        // Update alt texts
        if (content.altTexts) {
          const updatedImages = [...formData.images];
          let beforeIdx = 0;
          let afterIdx = 0;
          
          for (const img of updatedImages) {
            if (img.category === 'before' && content.altTexts.before?.[beforeIdx]) {
              img.alt_text = content.altTexts.before[beforeIdx];
              beforeIdx++;
            } else if (img.category === 'after' && content.altTexts.after?.[afterIdx]) {
              img.alt_text = content.altTexts.after[afterIdx];
              afterIdx++;
            }
          }
          updateFormData({ images: updatedImages });
        }

        toast({
          title: "Analysis Complete! 🎯",
          description: "Title, challenge, solution, materials, features, and SEO content all generated. Review in the next steps.",
        });
      }
    } catch (error) {
      console.error('Transformation analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze images",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateImage = (index: number, updates: Partial<typeof formData.images[0]>) => {
    const updatedImages = [...formData.images];
    const globalIndex = formData.images.indexOf(
      formData.images.filter(img => true)[index]
    );
    if (globalIndex >= 0) {
      updatedImages[globalIndex] = { ...updatedImages[globalIndex], ...updates };
      updateFormData({ images: updatedImages });
    }
  };

  const updateImageByGlobalIndex = (globalIndex: number, updates: Partial<typeof formData.images[0]>) => {
    const updatedImages = [...formData.images];
    updatedImages[globalIndex] = { ...updatedImages[globalIndex], ...updates };
    updateFormData({ images: updatedImages });
  };

  const removeImageByGlobalIndex = (globalIndex: number) => {
    const updatedImages = formData.images.filter((_, i) => i !== globalIndex);
    updatedImages.forEach((img, i) => img.sort_order = i);
    updateFormData({ images: updatedImages });
  };

  const setFeaturedImage = (globalIndex: number) => {
    const updatedImages = formData.images.map((img, i) => ({
      ...img,
      is_featured: i === globalIndex,
    }));
    updateFormData({ images: updatedImages });
  };

  const createDropHandlers = (
    category: 'before' | 'during' | 'after',
    setDragging: (v: boolean) => void
  ) => ({
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      processFiles(e.dataTransfer.files, category);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
    },
  });

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'before': return 'bg-red-100 text-red-800 border-red-200';
      case 'during': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'after': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const renderUploadZone = (
    category: 'before' | 'during' | 'after',
    isDragging: boolean,
    setDragging: (v: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
    images: typeof formData.images,
    config: { icon: string; color: string; borderColor: string; bgColor: string; title: string; description: string }
  ) => {
    const handlers = createDropHandlers(category, setDragging);
    const globalIndices = formData.images
      .map((img, i) => img.category === category ? i : -1)
      .filter(i => i >= 0);

    return (
      <div className="space-y-3">
        {/* Drop Zone */}
        <div
          {...handlers}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
            isDragging 
              ? `${config.borderColor} ${config.bgColor}` 
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onClick={() => inputRef.current?.click()}
        >
          <div className="space-y-2">
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${config.bgColor}`}>
              <Camera className={`w-6 h-6 ${config.color}`} />
            </div>
            <div>
              <p className="font-medium text-sm">{config.title}</p>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*,.heic,.heif,.mp4,.mov"
            onChange={(e) => { processFiles(e.target.files, category); e.target.value = ''; }}
            className="hidden"
          />
        </div>

        {/* Image Thumbnails */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {images.map((image, localIdx) => {
              const globalIdx = globalIndices[localIdx];
              return (
                <div key={globalIdx} className="relative group">
                  <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                    {image.media_type === 'video' ? (
                      <video src={image.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <NextImage
                        src={image.url || ''}
                        alt={image.alt_text || ''}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>

                  {/* Overlay controls */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFeaturedImage(globalIdx)}
                      className="h-7 w-7 p-0 bg-white/90 hover:bg-white text-yellow-600"
                      title="Set as featured"
                    >
                      <Star className={`w-3.5 h-3.5 ${image.is_featured ? 'fill-current' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeImageByGlobalIndex(globalIdx)}
                      className="h-7 w-7 p-0 bg-white/90 hover:bg-white text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Badges */}
                  <div className="absolute top-1 left-1 flex gap-1">
                    {image.is_featured && (
                      <Badge className="bg-yellow-500 text-white text-[10px] px-1 py-0">
                        <Star className="w-2.5 h-2.5 fill-current" />
                      </Badge>
                    )}
                    {image.room && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">
                        {image.room}
                      </Badge>
                    )}
                  </div>

                  {/* Room selector (below thumbnail) */}
                  <Select
                    value={image.room || ''}
                    onValueChange={(value) => updateImageByGlobalIndex(globalIdx, { room: value })}
                  >
                    <SelectTrigger className="h-6 text-[10px] mt-1 border-0 bg-muted/50">
                      <SelectValue placeholder="Tag room..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_OPTIONS.map(room => (
                        <SelectItem key={room} value={room} className="text-xs">{room}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Before / After Split Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* BEFORE Zone */}
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              Before Photos
              {beforeImages.length > 0 && (
                <Badge variant="secondary" className="text-xs">{beforeImages.length}</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Upload photos showing the space before renovation
            </p>
          </CardHeader>
          <CardContent>
            {renderUploadZone('before', isDraggingBefore, setIsDraggingBefore, beforeInputRef, beforeImages, {
              icon: '🔴',
              color: 'text-red-600',
              borderColor: 'border-red-400',
              bgColor: 'bg-red-50',
              title: 'Drop BEFORE photos here',
              description: 'Old, damaged, outdated spaces',
            })}
          </CardContent>
        </Card>

        {/* AFTER Zone */}
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              After Photos
              {afterImages.length > 0 && (
                <Badge variant="secondary" className="text-xs">{afterImages.length}</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Upload photos showing the completed renovation
            </p>
          </CardHeader>
          <CardContent>
            {renderUploadZone('after', isDraggingAfter, setIsDraggingAfter, afterInputRef, afterImages, {
              icon: '🟢',
              color: 'text-green-600',
              borderColor: 'border-green-400',
              bgColor: 'bg-green-50',
              title: 'Drop AFTER photos here',
              description: 'Completed, beautiful results',
            })}
          </CardContent>
        </Card>
      </div>

      {/* During Section (Collapsible) */}
      <Button
        variant="ghost"
        onClick={() => setShowDuring(!showDuring)}
        className="w-full justify-between text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          Progress Photos (Optional)
          {duringImages.length > 0 && (
            <Badge variant="secondary" className="text-xs">{duringImages.length}</Badge>
          )}
        </span>
        {showDuring ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {showDuring && (
        <Card className="border-yellow-200">
          <CardContent className="pt-4">
            {renderUploadZone('during', isDraggingDuring, setIsDraggingDuring, duringInputRef, duringImages, {
              icon: '🟡',
              color: 'text-yellow-600',
              borderColor: 'border-yellow-400',
              bgColor: 'bg-yellow-50',
              title: 'Drop PROGRESS photos here',
              description: 'Mid-renovation, demolition, framing',
            })}
          </CardContent>
        </Card>
      )}

      {/* AI Status */}
      {isCategorizing && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-blue-700">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
              AI is verifying photo categories and generating alt text...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side-by-Side Comparison + Analyze Button */}
      {beforeImages.length > 0 && afterImages.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-r from-red-50/50 via-white to-green-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-primary" />
                Before → After Comparison
              </CardTitle>
              <Button
                onClick={() => setShowComparison(!showComparison)}
                variant="ghost"
                size="sm"
              >
                {showComparison ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
          
          {showComparison && (
            <CardContent className="space-y-4">
              {/* Side by side preview */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-red-600 mb-2 text-center">BEFORE</p>
                  <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden relative">
                    {beforeImages[0]?.media_type === 'video' ? (
                      <video src={beforeImages[0]?.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <NextImage
                        src={beforeImages[0]?.url || ''}
                        alt="Before"
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-green-600 mb-2 text-center">AFTER</p>
                  <div className="aspect-[4/3] bg-muted rounded-lg overflow-hidden relative">
                    {afterImages[0]?.media_type === 'video' ? (
                      <video src={afterImages[0]?.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <NextImage
                        src={afterImages[0]?.url || ''}
                        alt="After"
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Multiple comparison pairs */}
              {Math.min(beforeImages.length, afterImages.length) > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: Math.min(beforeImages.length, afterImages.length, 3) }).map((_, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <>
                          <div className="aspect-square bg-muted rounded overflow-hidden relative">
                            <NextImage src={beforeImages[i]?.url || ''} alt="" fill className="object-cover" />
                            <Badge className="absolute bottom-0.5 left-0.5 bg-red-500 text-[8px] px-1 py-0">B</Badge>
                          </div>
                          <div className="aspect-square bg-muted rounded overflow-hidden relative">
                            <NextImage src={afterImages[i]?.url || ''} alt="" fill className="object-cover" />
                            <Badge className="absolute bottom-0.5 left-0.5 bg-green-500 text-[8px] px-1 py-0">A</Badge>
                          </div>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </CardContent>
          )}

          {/* Analyze Transformation Button */}
          <CardContent className="pt-0 pb-4">
            <Button
              onClick={analyzeTransformation}
              disabled={isAnalyzing}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Analyzing Transformation with AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  🤖 Analyze Transformation
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              AI compares before & after photos to auto-generate title, description, materials, features, and SEO content
            </p>
          </CardContent>
        </Card>
      )}

      {/* Detailed Image List (collapsed by default, for editing alt text) */}
      {formData.images.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              All Media Details ({formData.images.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {formData.images.map((image, index) => (
              <div key={index} className="flex gap-3 items-start border-b border-muted pb-3 last:border-0">
                {/* Thumbnail */}
                <div className="relative w-16 h-12 flex-shrink-0 bg-muted rounded overflow-hidden">
                  {image.media_type === 'video' ? (
                    <video src={image.url} className="w-full h-full object-cover" muted />
                  ) : (
                    <NextImage src={image.url || ''} alt="" fill className="object-cover" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 ${getCategoryBadgeColor(image.category)}`}>
                      {image.category}
                    </Badge>
                    {image.room && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <Home className="w-2.5 h-2.5 mr-0.5" />
                        {image.room}
                      </Badge>
                    )}
                    {image.is_featured && (
                      <Badge className="bg-yellow-500 text-white text-[10px] px-1.5 py-0">
                        <Star className="w-2.5 h-2.5 mr-0.5 fill-current" />Featured
                      </Badge>
                    )}
                  </div>
                  <Input
                    value={image.alt_text}
                    onChange={(e) => updateImageByGlobalIndex(index, { alt_text: e.target.value })}
                    placeholder="Alt text for SEO..."
                    className="h-7 text-xs"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <Select
                    value={image.category}
                    onValueChange={(value: 'before' | 'during' | 'after') =>
                      updateImageByGlobalIndex(index, { category: value })
                    }
                  >
                    <SelectTrigger className="h-7 w-20 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Before</SelectItem>
                      <SelectItem value="during">During</SelectItem>
                      <SelectItem value="after">After</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeImageByGlobalIndex(index)}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tips */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h4 className="font-semibold text-blue-900 mb-2">📸 Photo Tips</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Upload before photos on the <span className="text-red-600 font-medium">left</span>, after photos on the <span className="text-green-600 font-medium">right</span></li>
            <li>• AI will verify categories and auto-detect the room type</li>
            <li>• Tag rooms for multi-room projects (Kitchen, Bathroom, etc.)</li>
            <li>• Click <span className="font-medium">🤖 Analyze Transformation</span> to auto-generate all project content</li>
            <li>• The ⭐ star sets which image appears as the thumbnail</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

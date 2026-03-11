import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Sparkles, Plus, X, Clock, Award, Upload, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ProjectFormData } from '../ProjectUploadSystem';
import { convertHeicToJpeg } from '@/utils/heicConverter';

interface ProjectDetailsStepProps {
  formData: ProjectFormData;
  updateFormData: (updates: Partial<ProjectFormData>) => void;
}

const durationOptions = [
  '1 week',
  '2 weeks', 
  '3 weeks',
  '1 month',
  '6 weeks',
  '2 months',
  '3 months',
  '4+ months'
];

const commonMaterials = [
  'Quartz Countertops',
  'Granite Countertops',
  'Marble Countertops',
  'Custom Cabinets',
  'Hardwood Flooring',
  'Luxury Vinyl Plank',
  'Porcelain Tile',
  'Subway Tile',
  'Natural Stone',
  'Stainless Steel Appliances',
  'Smart Home Technology',
  'LED Lighting',
  'Recessed Lighting',
  'Crown Molding',
  'Wainscoting'
];

const commonFeatures = [
  'Kitchen Island',
  'Walk-in Pantry',
  'Double Vanity',
  'Walk-in Shower',
  'Freestanding Tub',
  'Heated Floors',
  'Built-in Storage',
  'Custom Lighting',
  'Smart Home Integration',
  'Energy Efficient Windows',
  'Skylights',
  'Custom Millwork',
  'Wine Storage',
  'Coffee Station',
  'Mudroom'
];

const solutionTemplates = [
  'Complete renovation with modern design and improved functionality',
  'Reconfigured layout to maximize space and improve flow',
  'High-end finishes and custom details throughout', 
  'Added storage solutions and organizational systems',
  'Upgraded all systems (plumbing, electrical, HVAC)',
  'Created open-concept living with improved lighting',
  'Custom built-ins and millwork for unique storage needs',
  'Luxury spa-like retreat with premium materials'
];

export function ProjectDetailsStep({ formData, updateFormData }: ProjectDetailsStepProps) {
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [newMaterial, setNewMaterial] = useState('');
  const [newFeature, setNewFeature] = useState('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [googleReviews, setGoogleReviews] = useState<Array<{ id: string; reviewer_name: string; comment: string; star_rating: number }>>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loadingReviews, setLoadingReviews] = useState(false);

  useEffect(() => {
    fetchGoogleReviews();
  }, []);

  const fetchGoogleReviews = async () => {
    setLoadingReviews(true);
    try {
      const { data, error } = await supabase
        .from('google_reviews')
        .select('*')
        .order('star_rating', { ascending: false })
        .limit(20);

      if (error) throw error;
      setGoogleReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoadingReviews(false);
    }
  };

  const generateProjectContent = async (type: 'challenge' | 'solution') => {
    setIsGeneratingContent(true);
    try {
      const relevantImages = type === 'challenge' 
        ? formData.images.filter(img => img.category === 'before')
        : formData.images.filter(img => img.category === 'after');

      if (relevantImages.length === 0) {
        toast({
          title: "No Images",
          description: `Upload ${type === 'challenge' ? 'before' : 'after'} photos first, or write manually.`,
          variant: "destructive"
        });
        setIsGeneratingContent(false);
        return;
      }

      // Convert to base64
      const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });
      };

      const imageBase64 = await Promise.all(
        relevantImages.slice(0, 2).map(async (img) => {
          if (img.file) return fileToBase64(img.file);
          return img.url || '';
        })
      );

      const response = await fetch('/api/admin/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeImages: type === 'challenge' ? imageBase64.filter(Boolean) : [],
          afterImages: type === 'solution' ? imageBase64.filter(Boolean) : [],
          location: formData.location || 'New Jersey',
          serviceTypes: formData.service_types.length > 0 ? formData.service_types : ['renovation'],
          mode: 'full',
        }),
      });

      if (!response.ok) throw new Error('Analysis failed');

      const data = await response.json();
      
      if (data.content) {
        const content = data.content[type] || data.content;
        if (typeof content === 'string') {
          updateFormData({ [type]: content });
        } else if (content.challenge && type === 'challenge') {
          updateFormData({ challenge: content.challenge });
        } else if (content.solution && type === 'solution') {
          updateFormData({ solution: content.solution });
        }
        
        toast({
          title: "Success",
          description: `${type.charAt(0).toUpperCase() + type.slice(1)} generated successfully`
        });
      }
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      toast({
        title: "Error",
        description: `Failed to generate ${type}`,
        variant: "destructive"
      });
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const addMaterial = (material: string) => {
    if (material && !formData.materials_used.includes(material)) {
      updateFormData({ 
        materials_used: [...formData.materials_used, material] 
      });
    }
  };

  const removeMaterial = (material: string) => {
    updateFormData({ 
      materials_used: formData.materials_used.filter(m => m !== material) 
    });
  };

  const addFeature = (feature: string) => {
    if (feature && !formData.special_features.includes(feature)) {
      updateFormData({ 
        special_features: [...formData.special_features, feature] 
      });
    }
  };

  const removeFeature = (feature: string) => {
    updateFormData({ 
      special_features: formData.special_features.filter(f => f !== feature) 
    });
  };

  const handleCustomMaterial = () => {
    if (newMaterial.trim()) {
      addMaterial(newMaterial.trim());
      setNewMaterial('');
    }
  };

  const handleCustomFeature = () => {
    if (newFeature.trim()) {
      addFeature(newFeature.trim());
      setNewFeature('');
    }
  };

  const handleImageUpload = async (file: File, type: 'challenge' | 'solution') => {
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

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzingImage(true);
    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
      });

      // Analyze with Gemini via our API route
      const response = await fetch('/api/admin/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeImages: type === 'challenge' ? [base64] : [],
          afterImages: type === 'solution' ? [base64] : [],
          location: formData.location || 'New Jersey',
          serviceTypes: formData.service_types.length > 0 ? formData.service_types : ['renovation'],
          mode: 'full',
        }),
      });

      if (!response.ok) throw new Error('Analysis failed');

      const data = await response.json();
      
      if (data.content) {
        const fieldKey = type === 'challenge' ? 'challenge' : 'solution';
        const content = data.content[fieldKey];
        if (content) {
          updateFormData({ [fieldKey]: content });
        }
      }
      
      toast({
        title: "Success",
        description: `AI analysis complete! Content generated from ${type === 'challenge' ? 'before' : 'after'} photo.`
      });
    } catch (error) {
      console.error(`Error analyzing ${type} image:`, error);
      toast({
        title: "Error",
        description: `Failed to analyze image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const selectReview = (review: { comment: string; star_rating: number; reviewer_name: string }) => {
    updateFormData({
      testimonial_text: review.comment,
      testimonial_rating: review.star_rating,
      client_first_name: review.reviewer_name
    });
    toast({
      title: "Review selected",
      description: "Testimonial updated with Google review"
    });
  };

  return (
    <div className="space-y-6">
      {/* Project Challenge */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Project Challenge</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateProjectContent('challenge')}
                disabled={isGeneratingContent || isAnalyzingImage}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI Generate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('challenge-image-upload')?.click()}
                disabled={isAnalyzingImage}
              >
                {isAnalyzingImage ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Upload Before Photo
              </Button>
              <input
                id="challenge-image-upload"
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'challenge');
                }}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe the challenges OR upload a &quot;before&quot; photo for AI analysis
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.challenge}
            onChange={(e) => updateFormData({ challenge: e.target.value })}
            placeholder="e.g., The existing kitchen was cramped with outdated appliances and poor lighting..."
            rows={6}
            className="font-sans leading-relaxed"
          />
        </CardContent>
      </Card>

      {/* Project Solution */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Solution Provided</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateProjectContent('solution')}
                disabled={isGeneratingContent || isAnalyzingImage}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                AI Generate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('solution-image-upload')?.click()}
                disabled={isAnalyzingImage}
              >
                {isAnalyzingImage ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Upload After Photo
              </Button>
              <input
                id="solution-image-upload"
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'solution');
                }}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe your solution OR upload an &quot;after&quot; photo for AI analysis
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={formData.solution}
            onChange={(e) => updateFormData({ solution: e.target.value })}
            placeholder="e.g., We reconfigured the layout to create an open-concept design..."
            rows={6}
            className="font-sans leading-relaxed"
          />
          
          {/* Quick Templates */}
          <div>
            <Label className="text-sm font-medium">Quick Templates:</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {solutionTemplates.map((template, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => updateFormData({ solution: template })}
                  className="text-xs h-auto py-1 px-2"
                >
                  {template}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Materials Used */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Materials Used</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select materials used in this project
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected Materials */}
          {formData.materials_used.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.materials_used.map((material) => (
                <Badge key={material} className="flex items-center gap-1">
                  {material}
                  <X 
                    className="w-3 h-3 cursor-pointer hover:text-red-500" 
                    onClick={() => removeMaterial(material)}
                  />
                </Badge>
              ))}
            </div>
          )}

          {/* Common Materials */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {commonMaterials.map((material) => (
              <Button
                key={material}
                variant={formData.materials_used.includes(material) ? "default" : "outline"}
                size="sm"
                onClick={() => 
                  formData.materials_used.includes(material) 
                    ? removeMaterial(material)
                    : addMaterial(material)
                }
                className="justify-start text-xs h-auto py-2"
              >
                {material}
              </Button>
            ))}
          </div>

          {/* Custom Material */}
          <div className="flex gap-2">
            <Input
              value={newMaterial}
              onChange={(e) => setNewMaterial(e.target.value)}
              placeholder="Add custom material..."
              onKeyPress={(e) => e.key === 'Enter' && handleCustomMaterial()}
            />
            <Button onClick={handleCustomMaterial} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Special Features */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Special Features</CardTitle>
          <p className="text-sm text-muted-foreground">
            Highlight unique features and upgrades
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selected Features */}
          {formData.special_features.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.special_features.map((feature) => (
                <Badge key={feature} className="flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  {feature}
                  <X 
                    className="w-3 h-3 cursor-pointer hover:text-red-500" 
                    onClick={() => removeFeature(feature)}
                  />
                </Badge>
              ))}
            </div>
          )}

          {/* Common Features */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {commonFeatures.map((feature) => (
              <Button
                key={feature}
                variant={formData.special_features.includes(feature) ? "default" : "outline"}
                size="sm"
                onClick={() => 
                  formData.special_features.includes(feature) 
                    ? removeFeature(feature)
                    : addFeature(feature)
                }
                className="justify-start text-xs h-auto py-2"
              >
                {feature}
              </Button>
            ))}
          </div>

          {/* Custom Feature */}
          <div className="flex gap-2">
            <Input
              value={newFeature}
              onChange={(e) => setNewFeature(e.target.value)}
              placeholder="Add custom feature..."
              onKeyPress={(e) => e.key === 'Enter' && handleCustomFeature()}
            />
            <Button onClick={handleCustomFeature} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Duration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Project Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select 
              value={formData.duration} 
              onValueChange={(value) => updateFormData({ duration: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map((duration) => (
                  <SelectItem key={duration} value={duration}>
                    {duration}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Testimonial Rating */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Client Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Star
                  key={rating}
                  className={`w-6 h-6 cursor-pointer ${
                    rating <= formData.testimonial_rating 
                      ? 'text-yellow-500 fill-current' 
                      : 'text-gray-300'
                  }`}
                  onClick={() => updateFormData({ testimonial_rating: rating })}
                />
              ))}
              <span className="ml-2 text-sm text-muted-foreground">
                {formData.testimonial_rating}/5 stars
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Testimonial */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Client Testimonial</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a Google review or write custom testimonial (Optional - leave empty to hide on frontend)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Reviews Selector */}
          {googleReviews.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select from Google Reviews:</Label>
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-2">
                {googleReviews.map((review) => (
                  <Card 
                    key={review.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => selectReview(review)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{review.reviewer_name}</span>
                            <div className="flex">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3 h-3 ${
                                    i < review.star_rating
                                      ? 'text-yellow-400 fill-yellow-400'
                                      : 'text-muted'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            &quot;{review.comment}&quot;
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0">
                          Select
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Manual Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Or write custom testimonial:</Label>
            <Textarea
              value={formData.testimonial_text}
              onChange={(e) => updateFormData({ testimonial_text: e.target.value })}
              placeholder={`"${formData.client_first_name ? formData.client_first_name + ' and their family' : 'The client'} was thrilled with the results..."`}
              rows={3}
            />
          </div>

          {formData.testimonial_text && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => updateFormData({ 
                testimonial_text: '', 
                testimonial_rating: 0,
                client_first_name: ''
              })}
            >
              Clear Testimonial
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
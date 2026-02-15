import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Search, Link, Target, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ProjectFormData } from '../ProjectUploadSystem';

interface ProjectSEOStepProps {
  formData: ProjectFormData;
  updateFormData: (updates: Partial<ProjectFormData>) => void;
}

interface SEOAnalysis {
  score: number;
  issues: string[];
  suggestions: string[];
}

interface EnhancedMessage {
  original: string;
  enhanced: string;
  location: string;
  icon: string;
}

export function ProjectSEOStep({ formData, updateFormData }: ProjectSEOStepProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [seoAnalysis, setSeoAnalysis] = useState<SEOAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Auto-generate SEO fields when basic info changes
  useEffect(() => {
    if (formData.title && formData.location && formData.service_types.length > 0 && !formData.seo_title) {
      generateSEOTitle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generateSEOTitle is stable, only trigger on data changes
  }, [formData.title, formData.location, formData.service_types]);

  useEffect(() => {
    if (formData.seo_title && !formData.meta_description) {
      generateMetaDescription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generateMetaDescription is stable, only trigger on seo_title change
  }, [formData.seo_title]);

  useEffect(() => {
    if (formData.title && formData.location && !formData.url_slug) {
      generateSlug();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generateSlug is stable, only trigger on title/location change
  }, [formData.title, formData.location]);

  const generateSEOTitle = async () => {
    try {
      const primaryService = formData.service_types[0];
      // Generate concise title within 50-60 character limit
      const baseTitle = `${primaryService} in ${formData.location}`;
      
      // Only add project descriptor if it fits within limit
      let title = baseTitle;
      if (baseTitle.length < 45 && formData.title) {
        const shortTitle = formData.title.substring(0, 20);
        title = `${shortTitle} - ${baseTitle}`;
      }
      
      // Ensure we're under 60 characters
      if (title.length > 60) {
        title = baseTitle;
      }
      
      updateFormData({ seo_title: title });
    } catch (error) {
      console.error('Error generating SEO title:', error);
    }
  };

  const generateMetaDescription = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-project-assistant', {
        body: {
          action: 'generate_meta_description',
          data: {
            title: formData.title,
            location: formData.location,
            service_types: formData.service_types,
            challenge: formData.challenge,
            solution: formData.solution,
            materials_used: formData.materials_used,
            special_features: formData.special_features
          }
        }
      });

      if (error) throw error;
      
      if (data.meta_description) {
        updateFormData({ meta_description: data.meta_description });
      }
    } catch (error) {
      console.error('Error generating meta description:', error);
      toast({
        title: "Error",
        description: "Failed to generate meta description",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateSlug = () => {
    const slug = `${formData.title}-${formData.location}`
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    updateFormData({ url_slug: slug });
  };

  const generateFocusKeyword = () => {
    if (formData.service_types.length > 0 && formData.location) {
      const primaryService = formData.service_types[0].toLowerCase();
      const keyword = `${primaryService} ${formData.location.toLowerCase()}`;
      updateFormData({ focus_keyword: keyword });
    }
  };

  const analyzeSEO = async () => {
    setIsAnalyzing(true);
    try {
      const content = `
        ${formData.title}
        ${formData.challenge}
        ${formData.solution}
        ${formData.materials_used.join(' ')}
        ${formData.special_features.join(' ')}
      `;

      const { data, error } = await supabase.functions.invoke('seo-analyzer', {
        body: {
          title: formData.seo_title,
          content: content,
          meta_description: formData.meta_description,
          focus_keyword: formData.focus_keyword,
          content_type: 'project',
          url_slug: formData.url_slug
        }
      });

      if (error) throw error;
      
      if (data.analysis) {
        setSeoAnalysis({
          score: data.analysis.score,
          issues: data.analysis.issues || [],
          suggestions: data.analysis.suggestions || []
        });
      }
    } catch (error) {
      console.error('Error analyzing SEO:', error);
      toast({
        title: "Error",
        description: "Failed to analyze SEO",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getSEOScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSEOScoreBadge = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const enhanceMessage = (message: string, _type: 'issue' | 'suggestion'): EnhancedMessage => {
    const lower = message.toLowerCase();
    
    // Content length issues
    if (lower.includes('content too short') || lower.includes('add more content')) {
      return {
        original: message,
        enhanced: 'Your project description needs more detail. Add at least 300 words total across all sections.',
        location: '📍 Go to "Project Details" step → Expand "Project Challenge" and "Project Solution" sections → Add detailed descriptions',
        icon: 'FileText'
      };
    }
    
    // Title issues
    if (lower.includes('title too long')) {
      return {
        original: message,
        enhanced: `Your SEO title is ${formData.seo_title.length} characters. Reduce it to under 60 characters for optimal search display.`,
        location: '📍 Edit the "SEO Title" field above → Remove unnecessary words or shorten the description',
        icon: 'ArrowUp'
      };
    }
    
    if (lower.includes('title') && lower.includes('descriptive')) {
      return {
        original: message,
        enhanced: 'Your title is too short. Make it more descriptive (aim for 30-60 characters).',
        location: '📍 Edit the "SEO Title" field above → Add more specific details about the project',
        icon: 'ArrowUp'
      };
    }
    
    // Keyword issues
    if (lower.includes('focus keyword not in title')) {
      return {
        original: message,
        enhanced: `Your focus keyword "${formData.focus_keyword}" is missing from the SEO title. This is crucial for search rankings.`,
        location: '📍 Edit the "SEO Title" field above → Rewrite to naturally include your focus keyword',
        icon: 'Target'
      };
    }
    
    if (lower.includes('keyword') && (lower.includes('more frequently') || lower.includes('density'))) {
      return {
        original: message,
        enhanced: 'Use your focus keyword more naturally throughout your content (aim for 0.5-3% density).',
        location: '📍 Go to "Project Details" step → Add your focus keyword naturally in Challenge and Solution sections',
        icon: 'Target'
      };
    }
    
    if (lower.includes('keyword stuffing') || lower.includes('keyword density too high')) {
      return {
        original: message,
        enhanced: 'You\'re overusing your focus keyword. Reduce usage to avoid search penalties.',
        location: '📍 Go to "Project Details" step → Rewrite Challenge and Solution to use keyword more sparingly',
        icon: 'Target'
      };
    }
    
    // H1 tag issues
    if (lower.includes('missing h1') || lower.includes('h1 tag')) {
      return {
        original: message,
        enhanced: 'H1 tags are automatically generated from your project title on the live page.',
        location: '📍 No action needed - The project title becomes the H1 heading automatically when published',
        icon: 'Heading1'
      };
    }
    
    // H2 headings
    if (lower.includes('h2 heading')) {
      return {
        original: message,
        enhanced: 'Break up long content with subheadings for better readability and SEO.',
        location: '📍 Go to "Project Details" step → Use the rich text editor to add H2 headings in your Challenge and Solution sections',
        icon: 'Heading1'
      };
    }
    
    // Meta description
    if (lower.includes('meta description')) {
      return {
        original: message,
        enhanced: 'Optimize your meta description to 150-160 characters with a clear call-to-action.',
        location: '📍 Edit the "Meta Description" field above → Use the AI Generate button for optimization',
        icon: 'AlignLeft'
      };
    }
    
    // Default fallback
    return {
      original: message,
      enhanced: message,
      location: '📍 Review the SEO fields on this page and Project Details step',
      icon: 'AlertCircle'
    };
  };

  return (
    <div className="space-y-6">
      {/* SEO Analysis Card */}
      {seoAnalysis && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                SEO Analysis
              </CardTitle>
              <Badge className={getSEOScoreBadge(seoAnalysis.score)}>
                Score: {seoAnalysis.score}/100
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {seoAnalysis.issues.length > 0 && (
              <Alert className="border-red-300 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription>
                  <div className="space-y-3">
                    <strong className="text-red-900 text-base">Issues to fix:</strong>
                    <div className="space-y-4">
                      {seoAnalysis.issues.map((issue, index) => {
                        const enhanced = enhanceMessage(issue, 'issue');
                        return (
                          <div key={index} className="bg-white p-3 rounded-md border border-red-200">
                            <div className="flex items-start gap-2 mb-2">
                              <div className="text-red-600 font-medium">{enhanced.enhanced}</div>
                            </div>
                            <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded border-l-2 border-red-400 mt-2">
                              {enhanced.location}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            {seoAnalysis.suggestions.length > 0 && (
              <Alert className="border-green-300 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <div className="space-y-3">
                    <strong className="text-green-900 text-base">Suggestions:</strong>
                    <div className="space-y-4">
                      {seoAnalysis.suggestions.map((suggestion, index) => {
                        const enhanced = enhanceMessage(suggestion, 'suggestion');
                        return (
                          <div key={index} className="bg-white p-3 rounded-md border border-green-200">
                            <div className="flex items-start gap-2 mb-2">
                              <div className="text-green-700 font-medium">{enhanced.enhanced}</div>
                            </div>
                            <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded border-l-2 border-green-400 mt-2">
                              {enhanced.location}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* SEO Title */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">SEO Title</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={generateSEOTitle}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Auto-Generate
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Optimal length: 50-60 characters • Current: {formData.seo_title.length}
          </p>
        </CardHeader>
        <CardContent>
          <Input
            value={formData.seo_title}
            onChange={(e) => updateFormData({ seo_title: e.target.value })}
            placeholder="e.g., Modern Kitchen Remodel in Short Hills, NJ | AJS Construction"
            className={formData.seo_title.length > 60 ? 'border-red-300' : ''}
          />
          {formData.seo_title.length > 60 && (
            <p className="text-sm text-red-600 mt-1">
              Title is too long. Consider shortening it for better SEO.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Meta Description */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Meta Description</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={generateMetaDescription}
              disabled={isGenerating}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isGenerating ? 'Generating...' : 'AI Generate'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Optimal length: 150-160 characters • Current: {formData.meta_description.length}
          </p>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.meta_description}
            onChange={(e) => updateFormData({ meta_description: e.target.value })}
            placeholder="Brief description of the project that will appear in search results..."
            rows={3}
            className={formData.meta_description.length > 160 ? 'border-red-300' : ''}
          />
          {formData.meta_description.length > 160 && (
            <p className="text-sm text-red-600 mt-1">
              Description is too long. Consider shortening it for better SEO.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* URL Slug */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link className="w-5 h-5" />
              URL Slug
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Project URL: /portfolio/{formData.url_slug}
            </p>
          </CardHeader>
          <CardContent>
            <Input
              value={formData.url_slug}
              onChange={(e) => updateFormData({ url_slug: e.target.value })}
              placeholder="modern-kitchen-short-hills"
            />
          </CardContent>
        </Card>

        {/* Focus Keyword */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5" />
                Focus Keyword
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={generateFocusKeyword}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Suggest
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Input
              value={formData.focus_keyword}
              onChange={(e) => updateFormData({ focus_keyword: e.target.value })}
              placeholder="e.g., kitchen remodeling short hills"
            />
          </CardContent>
        </Card>
      </div>

      {/* SEO Analysis Button */}
      <div className="flex justify-center">
        <Button
          onClick={analyzeSEO}
          disabled={isAnalyzing || !formData.seo_title || !formData.meta_description}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Search className="w-4 h-4 mr-2" />
          {isAnalyzing ? 'Analyzing...' : 'Analyze SEO'}
        </Button>
      </div>

      {/* SEO Tips */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h4 className="font-semibold text-blue-900 mb-2">SEO Tips</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Include your main service and location in the title</li>
            <li>• Use your focus keyword naturally in the description</li>
            <li>• Keep URLs short and descriptive</li>
            <li>• Mention specific materials and features for long-tail keywords</li>
            <li>• Project pages help with local SEO and showcase expertise</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
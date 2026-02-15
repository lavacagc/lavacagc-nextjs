import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle, Sparkles, Link, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SEOEditorProps {
  contentType: 'blog_post' | 'project' | 'service_area' | 'page';
  contentId: string;
  title: string;
  content: string;
  currentSlug?: string;
  onSave: (seoData: Record<string, string | string[]>) => void;
}

interface SEOAnalysis {
  score: number;
  issues: string[];
  suggestions: string[];
  data: {
    wordCount: number;
    readingTime: number;
  };
}

const SEOEditor: React.FC<SEOEditorProps> = ({
  contentType,
  contentId,
  title,
  content,
  currentSlug,
  onSave
}) => {
  const [seoData, setSeoData] = useState({
    metaTitle: '',
    metaDescription: '',
    focusKeyword: '',
    canonicalUrl: '',
    slug: currentSlug || '',
    robotsDirectives: ['index', 'follow']
  });
  
  const [seoAnalysis, setSeoAnalysis] = useState<SEOAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoGenMode, setAutoGenMode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadExistingSEOData();
    generateSlugFromTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when content identity changes
  }, [contentId, title]);

  useEffect(() => {
    // Real-time SEO analysis as user types
    const debounceTimer = setTimeout(() => {
      if (seoData.metaTitle || seoData.metaDescription || seoData.focusKeyword) {
        performSEOAnalysis();
      }
    }, 1000);

    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced analysis triggered by SEO field changes
  }, [seoData.metaTitle, seoData.metaDescription, seoData.focusKeyword, content]);

  const loadExistingSEOData = async () => {
    const { data, error } = await supabase
      .from('seo_metadata')
      .select('*')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .single();

    if (data && !error) {
      setSeoData({
        metaTitle: data.meta_title || '',
        metaDescription: data.meta_description || '',
        focusKeyword: data.focus_keyword || '',
        canonicalUrl: data.canonical_url || '',
        slug: currentSlug || '',
        robotsDirectives: data.robots_directives || ['index', 'follow']
      });
    }
  };

  const generateSlugFromTitle = () => {
    if (title && !currentSlug) {
      const autoSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setSeoData(prev => ({ ...prev, slug: autoSlug }));
    }
  };

  const performSEOAnalysis = async () => {
    if (analyzing) return;
    
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('seo-analyzer', {
        body: {
          contentType,
          contentId,
          title: seoData.metaTitle || title,
          content,
          focusKeyword: seoData.focusKeyword,
          url: seoData.canonicalUrl
        }
      });

      if (error) throw error;

      setSeoAnalysis(data.analysis);
      
      // Auto-update meta description if in auto-gen mode
      if (autoGenMode && data.metaDescription) {
        setSeoData(prev => ({ 
          ...prev, 
          metaDescription: data.metaDescription 
        }));
      }
    } catch (error) {
      console.error('SEO analysis failed:', error);
      toast({
        title: "Analysis Failed",
        description: "Could not analyze SEO. Please try again.",
        variant: "destructive"
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const generateMetaDescription = async () => {
    setAutoGenMode(true);
    await performSEOAnalysis();
    setAutoGenMode(false);
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('seo_metadata')
        .upsert({
          content_type: contentType,
          content_id: contentId,
          meta_title: seoData.metaTitle,
          meta_description: seoData.metaDescription,
          focus_keyword: seoData.focusKeyword,
          canonical_url: seoData.canonicalUrl,
          robots_directives: seoData.robotsDirectives,
          auto_generated: false
        });

      if (error) throw error;

      onSave(seoData);
      toast({
        title: "SEO Settings Saved",
        description: "Your SEO metadata has been updated successfully."
      });

      // Trigger fresh analysis
      performSEOAnalysis();
    } catch {
      toast({
        title: "Save Failed",
        description: "Could not save SEO settings. Please try again.",
        variant: "destructive"
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-accent-emerald';
    if (score >= 60) return 'text-accent-tangerine';
    return 'text-accent-sunset';
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* SEO Score Overview */}
      {seoAnalysis && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span>SEO Score</span>
              </CardTitle>
              <Badge variant={getScoreBadgeVariant(seoAnalysis.score)}>
                {seoAnalysis.score}/100
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={seoAnalysis.score} className="mb-4" />
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-accent-sunset mb-2 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Issues ({seoAnalysis.issues.length})
                </h4>
                <ul className="space-y-1 text-sm text-text-secondary">
                  {seoAnalysis.issues.map((issue, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-accent-sunset mr-2">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-accent-emerald mb-2 flex items-center">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Suggestions ({seoAnalysis.suggestions.length})
                </h4>
                <ul className="space-y-1 text-sm text-text-secondary">
                  {seoAnalysis.suggestions.map((suggestion, index) => (
                    <li key={index} className="flex items-start">
                      <span className="text-accent-emerald mr-2">•</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="font-semibold text-text-primary">{seoAnalysis.data.wordCount}</div>
                <div className="text-xs text-text-secondary">Words</div>
              </div>
              <div>
                <div className="font-semibold text-text-primary">{seoAnalysis.data.readingTime}</div>
                <div className="text-xs text-text-secondary">Min read</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meta Information */}
      <Card>
        <CardHeader>
          <CardTitle>Meta Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Meta Title</label>
            <Input
              value={seoData.metaTitle}
              onChange={(e) => setSeoData(prev => ({ ...prev, metaTitle: e.target.value }))}
              placeholder={title}
              maxLength={60}
            />
            <div className="text-xs text-text-secondary mt-1">
              {seoData.metaTitle.length}/60 characters
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Meta Description</label>
              <Button
                variant="outline"
                size="sm"
                onClick={generateMetaDescription}
                disabled={analyzing}
                className="text-xs"
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Auto-generate
              </Button>
            </div>
            <Textarea
              value={seoData.metaDescription}
              onChange={(e) => setSeoData(prev => ({ ...prev, metaDescription: e.target.value }))}
              placeholder="A compelling description of your content that will appear in search results..."
              maxLength={160}
              rows={3}
            />
            <div className="text-xs text-text-secondary mt-1">
              {seoData.metaDescription.length}/160 characters
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Focus Keyword</label>
            <Input
              value={seoData.focusKeyword}
              onChange={(e) => setSeoData(prev => ({ ...prev, focusKeyword: e.target.value }))}
              placeholder="primary keyword or phrase"
            />
          </div>
        </CardContent>
      </Card>

      {/* URL Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Link className="h-5 w-5" />
            <span>URL & Technical Settings</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">URL Slug</label>
            <Input
              value={seoData.slug}
              onChange={(e) => setSeoData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
              placeholder="seo-friendly-url-slug"
            />
            <div className="text-xs text-text-secondary mt-1">
              Preview: /{contentType === 'blog_post' ? 'blog' : contentType === 'project' ? 'portfolio' : 'locations'}/{seoData.slug}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Canonical URL</label>
            <Input
              value={seoData.canonicalUrl}
              onChange={(e) => setSeoData(prev => ({ ...prev, canonicalUrl: e.target.value }))}
              placeholder="https://ajsconstructionnj.com/page-url"
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex space-x-4">
        <Button
          onClick={performSEOAnalysis}
          disabled={analyzing}
          variant="outline"
          className="flex-1"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          {analyzing ? 'Analyzing...' : 'Analyze SEO'}
        </Button>
        
        <Button
          onClick={handleSave}
          className="flex-1 bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-elegant"
        >
          Save SEO Settings
        </Button>
      </div>
    </div>
  );
};

export default SEOEditor;
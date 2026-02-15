import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckboxIcon } from '@/components/ui/checkbox-icon';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  AlertCircle, 
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ContentItem {
  id: string;
  title: string;
  slug?: string;
  type: string;
  currentSEO: {
    metaTitle?: string;
    metaDescription?: string;
    focusKeyword?: string;
    score?: number;
  };
  selected: boolean;
}

const BulkSEOEditor: React.FC = () => {
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadAllContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only needs to run on mount
  }, []);

  const loadAllContent = async () => {
    setLoading(true);
    try {
      // Load blog posts
      const { data: blogPosts } = await supabase
        .from('blog_posts')
        .select('id, title, slug');

      // Load projects  
      const { data: projects } = await supabase
        .from('projects')
        .select('id, title');

      // Load service areas
      const { data: serviceAreas } = await supabase
        .from('service_areas')
        .select('id, name');

      // Get SEO metadata for all content
      const { data: allSeoData } = await supabase
        .from('seo_metadata')
        .select('content_type, content_id, meta_title, meta_description, focus_keyword, seo_score');

      const seoMap = new Map();
      (allSeoData || []).forEach(seo => {
        seoMap.set(`${seo.content_type}_${seo.content_id}`, seo);
      });

      const allItems: ContentItem[] = [
        ...(blogPosts || []).map(post => {
          const seoData = seoMap.get(`blog_post_${post.id}`) || {};
          return {
            id: post.id,
            title: post.title,
            slug: post.slug,
            type: 'blog_post',
            currentSEO: {
              metaTitle: seoData.meta_title,
              metaDescription: seoData.meta_description,
              focusKeyword: seoData.focus_keyword,
              score: seoData.seo_score
            },
            selected: false
          };
        }),
        ...(projects || []).map(project => {
          const seoData = seoMap.get(`project_${project.id}`) || {};
          return {
            id: project.id,
            title: project.title,
            type: 'project',
            currentSEO: {
              metaTitle: seoData.meta_title,
              metaDescription: seoData.meta_description,
              focusKeyword: seoData.focus_keyword,
              score: seoData.seo_score
            },
            selected: false
          };
        }),
        ...(serviceAreas || []).map(area => {
          const seoData = seoMap.get(`service_area_${area.id}`) || {};
          return {
            id: area.id,
            title: area.name,
            type: 'service_area',
            currentSEO: {
              metaTitle: seoData.meta_title,
              metaDescription: seoData.meta_description,
              focusKeyword: seoData.focus_keyword,
              score: seoData.seo_score
            },
            selected: false
          };
        })
      ];

      setContentItems(allItems);
    } catch {
      toast({
        title: "Loading Failed",
        description: "Could not load content items.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = contentItems.every(item => item.selected);
    setContentItems(prev => prev.map(item => ({ ...item, selected: !allSelected })));
  };

  const toggleItemSelection = (id: string) => {
    setContentItems(prev => prev.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const generateMissingMetaDescriptions = async () => {
    setProcessing(true);
    setProgress(0);

    try {
      const { data, error } = await supabase.functions.invoke('bulk-seo-operations', {
        body: {
          operation: 'generate_missing_meta_descriptions'
        }
      });

      if (error) throw error;

      toast({
        title: "Meta Descriptions Generated",
        description: `Generated ${data.result.processed} meta descriptions.`
      });

      // Reload data
      await loadAllContent();
    } catch {
      toast({
        title: "Generation Failed",
        description: "Could not generate meta descriptions.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const updateAllSEOScores = async () => {
    setProcessing(true);
    const selectedItems = contentItems.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select items to update.",
        variant: "destructive"
      });
      setProcessing(false);
      return;
    }

    try {
      let completed = 0;
      
      for (const item of selectedItems) {
        // Analyze each item individually
        const { error } = await supabase.functions.invoke('seo-analyzer', {
          body: {
            contentType: item.type,
            contentId: item.id,
            title: item.title,
            content: '', // Would need to fetch full content
            focusKeyword: item.currentSEO.focusKeyword
          }
        });

        if (!error) completed++;
        setProgress((completed / selectedItems.length) * 100);
      }

      toast({
        title: "SEO Analysis Complete",
        description: `Updated ${completed}/${selectedItems.length} items.`
      });

      await loadAllContent();
    } catch {
      toast({
        title: "Update Failed",
        description: "Could not update SEO scores.",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const getScoreDisplay = (score?: number) => {
    if (!score && score !== 0) return <Badge variant="outline">Not analyzed</Badge>;
    
    const variant = score >= 80 ? 'default' : score >= 60 ? 'secondary' : 'destructive';
    return <Badge variant={variant}>{score}/100</Badge>;
  };

  const selectedCount = contentItems.filter(item => item.selected).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Bulk SEO Management</span>
            <div className="flex space-x-2">
              <Button
                onClick={generateMissingMetaDescriptions}
                disabled={processing}
                variant="outline"
                size="sm"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Generate Descriptions
              </Button>
              
              <Button
                onClick={updateAllSEOScores}
                disabled={processing || selectedCount === 0}
                size="sm"
                className="bg-gradient-to-r from-primary to-accent-tangerine"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Update Scores ({selectedCount})
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        
        {processing && (
          <CardContent className="pt-0">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-text-secondary mt-2">
              Processing... {Math.round(progress)}% complete
            </p>
          </CardContent>
        )}
      </Card>

      {/* Content List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Content Items ({contentItems.length})</CardTitle>
            <Button
              onClick={toggleSelectAll}
              variant="outline"
              size="sm"
            >
              {contentItems.every(item => item.selected) ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading content...</div>
          ) : (
            <div className="space-y-3">
              {contentItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CheckboxIcon
                      checked={item.selected}
                      size="md"
                      onChange={() => toggleItemSelection(item.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground text-lg">{item.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {item.type.replace('_', ' ')}
                        </Badge>
                        {item.slug && (
                          <span className="text-xs text-muted-foreground truncate">/{item.slug}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {getScoreDisplay(item.currentSEO.score)}
                    
                    <div className="flex items-center space-x-1">
                      {item.currentSEO.metaTitle ? (
                        <CheckCircle className="h-4 w-4 text-accent-emerald" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-accent-sunset" />
                      )}
                      <span className="text-xs text-text-secondary">Title</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      {item.currentSEO.metaDescription ? (
                        <CheckCircle className="h-4 w-4 text-accent-emerald" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-accent-sunset" />
                      )}
                      <span className="text-xs text-text-secondary">Description</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkSEOEditor;
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { Label } from '@/components/ui/label';
import { AdminRadioGroup, AdminRadioGroupItem } from '@/components/admin/ui/AdminRadioGroup';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BlogPost {
  id: string;
  title: string;
  category: string;
}

export function BlogPostSelector() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [enhancementLevel, setEnhancementLevel] = useState<'light' | 'moderate' | 'heavy'>('moderate');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedPosts, setProcessedPosts] = useState<Record<string, 'success' | 'error'>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, category')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error loading posts:', error);
      toast.error('Failed to load blog posts');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePost = (postId: string) => {
    const newSelected = new Set(selectedPosts);
    if (newSelected.has(postId)) {
      newSelected.delete(postId);
    } else {
      newSelected.add(postId);
    }
    setSelectedPosts(newSelected);
  };

  const selectAll = () => {
    setSelectedPosts(new Set(posts.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedPosts(new Set());
  };

  const enhanceSelected = async () => {
    if (selectedPosts.size === 0) {
      toast.error('Please select at least one post');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessedPosts({});

      const postsToEnhance = posts.filter(p => selectedPosts.has(p.id));

      for (const post of postsToEnhance) {
        try {
          // Get full post data
          const { data: fullPost, error: fetchError } = await supabase
            .from('blog_posts')
            .select('content')
            .eq('id', post.id)
            .single();

          if (fetchError) throw fetchError;

          // Enhance the content
          const { data: enhanceData, error: enhanceError } = await supabase.functions.invoke(
            'enhance-blog-content',
            {
              body: {
                title: post.title,
                content: fullPost.content,
                category: post.category,
                enhancementLevel,
              },
            }
          );

          if (enhanceError) throw enhanceError;
          if (!enhanceData?.enhancedContent) throw new Error('No enhanced content returned');

          // Update the post
          const { error: updateError } = await supabase
            .from('blog_posts')
            .update({ content: enhanceData.enhancedContent })
            .eq('id', post.id);

          if (updateError) throw updateError;

          setProcessedPosts(prev => ({ ...prev, [post.id]: 'success' }));
        } catch (error) {
          console.error(`Error enhancing post ${post.title}:`, error);
          setProcessedPosts(prev => ({ ...prev, [post.id]: 'error' }));
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const successCount = Object.values(processedPosts).filter(status => status === 'success').length;
      toast.success(`Enhanced ${successCount} of ${postsToEnhance.length} posts`);
    } catch (error) {
      console.error('Error enhancing posts:', error);
      toast.error('Failed to enhance posts');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Select Posts to Enhance
        </CardTitle>
        <CardDescription>
          Choose which blog posts to enhance and set the enhancement level
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Select posts to enhance with AI. Choose your enhancement level:
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Light:</strong> Minimal formatting improvements (1-2 styled boxes)</li>
              <li><strong>Moderate:</strong> Balanced enhancements with better structure (2-4 boxes)</li>
              <li><strong>Heavy:</strong> Complete transformation with maximum styling (4-6 boxes)</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Enhancement Level</Label>
            <AdminRadioGroup value={enhancementLevel} onValueChange={(value) => setEnhancementLevel(value as any)} disabled={isProcessing}>
              <div className="flex items-center space-x-3">
                <AdminRadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="text-sm font-normal cursor-pointer">Light - Minimal changes</Label>
              </div>
              <div className="flex items-center space-x-3">
                <AdminRadioGroupItem value="moderate" id="moderate" />
                <Label htmlFor="moderate" className="text-sm font-normal cursor-pointer">Moderate - Balanced improvements</Label>
              </div>
              <div className="flex items-center space-x-3">
                <AdminRadioGroupItem value="heavy" id="heavy" />
                <Label htmlFor="heavy" className="text-sm font-normal cursor-pointer">Heavy - Complete transformation</Label>
              </div>
            </AdminRadioGroup>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={isProcessing} className="h-8 text-xs">
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll} disabled={isProcessing} className="h-8 text-xs">
              Deselect All
            </Button>
            <span className="text-xs text-muted-foreground flex items-center ml-auto">
              {selectedPosts.size} of {posts.length} selected
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1 border rounded-md p-3">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex items-center space-x-2 p-1.5 rounded-md hover:bg-muted/50"
              >
                <AdminCheckbox
                  id={post.id}
                  checked={selectedPosts.has(post.id)}
                  onCheckedChange={() => togglePost(post.id)}
                  disabled={isProcessing}
                  className="h-3 w-3"
                />
                <Label
                  htmlFor={post.id}
                  className="flex-1 text-sm font-normal cursor-pointer"
                >
                  {post.title}
                  <span className="text-xs text-muted-foreground ml-2">({post.category})</span>
                </Label>
                {processedPosts[post.id] === 'success' && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                )}
                {processedPosts[post.id] === 'error' && (
                  <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          <Button
            onClick={enhanceSelected}
            disabled={isProcessing || selectedPosts.size === 0}
            className="w-full h-9"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enhancing Posts...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Enhance Selected Posts ({selectedPosts.size})
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

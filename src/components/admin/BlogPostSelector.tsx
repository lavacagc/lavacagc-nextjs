import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { Label } from '@/components/ui/label';
import { AdminRadioGroup, AdminRadioGroupItem } from '@/components/admin/ui/AdminRadioGroup';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Loader2, CheckCircle2, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BlogPost {
  id: string;
  title: string;
  category: string;
  published: boolean;
}

interface BlogPostSelectorProps {
  onEditPost: (postId: string) => void;
}

export function BlogPostSelector({ onEditPost }: BlogPostSelectorProps) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [enhancementLevel, setEnhancementLevel] = useState<'light' | 'moderate' | 'heavy'>(
    'moderate'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, category, published')
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

  const selectPost = (postId: string) => {
    setSelectedPostId(postId === selectedPostId ? null : postId);
  };

  const rewriteAndReview = async () => {
    if (!selectedPostId) {
      toast.error('Please select a post to rewrite');
      return;
    }

    const selectedPost = posts.find((p) => p.id === selectedPostId);
    if (!selectedPost) return;

    try {
      setIsProcessing(true);

      // Get full post data
      const { data: fullPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('content')
        .eq('id', selectedPostId)
        .single();

      if (fetchError) throw fetchError;

      toast.loading(`Rewriting "${selectedPost.title}" with ${enhancementLevel} enhancement...`, {
        id: 'rewrite-progress',
      });

      // Enhance the content with local SEO focus
      const { data: enhanceData, error: enhanceError } = await supabase.functions.invoke(
        'enhance-blog-content',
        {
          body: {
            title: selectedPost.title,
            content: fullPost.content,
            category: selectedPost.category,
            enhancementLevel,
          },
        }
      );

      if (enhanceError) throw enhanceError;
      if (!enhanceData?.enhancedContent) throw new Error('No enhanced content returned');

      // Update the post and unpublish it for review
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          content: enhanceData.enhancedContent,
          published: false, // Unpublish for manual review
        })
        .eq('id', selectedPostId);

      if (updateError) throw updateError;

      toast.success('Post rewritten successfully! Opening editor for review...', {
        id: 'rewrite-progress',
      });

      // Wait a moment for user to see the success message
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Navigate to editor for manual review
      onEditPost(selectedPostId);
    } catch (error) {
      console.error('Error rewriting post:', error);
      toast.error('Failed to rewrite post', {
        id: 'rewrite-progress',
      });
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

  const selectedPost = posts.find((p) => p.id === selectedPostId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Rewrite Post with Local SEO
        </CardTitle>
        <CardDescription>
          Select a post to rewrite with enhanced local SEO optimization and contractor voice
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <strong>New Local SEO Rewriter:</strong> Transforms your blog posts with:
            <ul className="list-disc ml-5 mt-2 space-y-1 text-sm">
              <li>
                <strong>Light:</strong> Quick polish - Add local context, improve voice, minimal
                restructuring
              </li>
              <li>
                <strong>Moderate:</strong> Local SEO optimization - Contractor voice, town examples,
                E-E-A-T signals
              </li>
              <li>
                <strong>Heavy:</strong> Complete rewrite - Maximum local SEO, multiple town
                mentions, full expertise
              </li>
            </ul>
            <p className="mt-3 text-sm font-medium">
              ⚠️ Post will be unpublished after rewriting for your manual review
            </p>
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Enhancement Level</Label>
            <AdminRadioGroup
              value={enhancementLevel}
              onValueChange={(value) =>
                setEnhancementLevel(value as 'light' | 'moderate' | 'heavy')
              }
              disabled={isProcessing}
            >
              <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
                <AdminRadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="text-sm font-normal cursor-pointer flex-1">
                  <strong>Light</strong> - Quick polish with local context
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
                <AdminRadioGroupItem value="moderate" id="moderate" />
                <Label htmlFor="moderate" className="text-sm font-normal cursor-pointer flex-1">
                  <strong>Moderate</strong> - Full local SEO optimization
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
                <AdminRadioGroupItem value="heavy" id="heavy" />
                <Label htmlFor="heavy" className="text-sm font-normal cursor-pointer flex-1">
                  <strong>Heavy</strong> - Complete rewrite with max local SEO
                </Label>
              </div>
            </AdminRadioGroup>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Select Post to Rewrite</Label>
            <div className="max-h-96 overflow-y-auto space-y-1 border rounded-md p-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className={`flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedPostId === post.id
                      ? 'bg-primary/10 border border-primary/20'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => !isProcessing && selectPost(post.id)}
                >
                  <AdminCheckbox
                    id={post.id}
                    checked={selectedPostId === post.id}
                    onCheckedChange={() => selectPost(post.id)}
                    disabled={isProcessing}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <Label htmlFor={post.id} className="text-sm font-normal cursor-pointer block">
                      {post.title}
                    </Label>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">({post.category})</span>
                      {post.published ? (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Published
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedPostId === post.id && (
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedPost && (
            <div className="bg-muted/50 p-3 rounded-md text-sm">
              <p className="font-medium">Selected: {selectedPost.title}</p>
              <p className="text-muted-foreground text-xs mt-1">
                This post will be rewritten with <strong>{enhancementLevel}</strong> enhancement and
                unpublished for your review.
              </p>
            </div>
          )}

          <Button
            onClick={rewriteAndReview}
            disabled={isProcessing || !selectedPostId}
            className="w-full h-10"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rewriting with Local SEO...
              </>
            ) : (
              <>
                <Edit className="mr-2 h-4 w-4" />
                Rewrite & Review {selectedPost && `"${selectedPost.title}"`}
              </>
            )}
          </Button>

          {selectedPostId && !isProcessing && (
            <p className="text-xs text-center text-muted-foreground">
              The editor will open automatically after rewriting
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

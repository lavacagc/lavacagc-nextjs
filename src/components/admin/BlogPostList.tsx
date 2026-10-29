import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Edit, Eye, Trash2, Globe, FileX, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { blogPagePaths, requestRevalidate } from '@/lib/revalidate';
import { adminPublishArticle } from '@/lib/articles/adminPublish';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  published: boolean;
  scheduled_publish_at: string | null;
  source?: string | null;
  review_hold?: { reasons?: string[] } | null;
  created_at: string;
  updated_at: string;
}

interface BlogPostListProps {
  onEditPost: (id: string) => void;
}

export function BlogPostList({ onEditPost }: BlogPostListProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, category, author, published, scheduled_publish_at, source, review_hold, created_at, updated_at')
        .order('updated_at', { ascending: false })
        // The admin list, not the public one; a cap keeps it a bounded read.
        .limit(500);

      if (error) throw error;
      // `source` and `review_hold` (Phase 2 migration) are not in the generated types file yet.
      setPosts((data ?? []) as unknown as BlogPost[]);
    } catch (error) {
      console.error('Error loading posts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load blog posts',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Publish goes through /api/admin/articles/<id>/publish, so the publish
   * guard can hold it (PG4): a held post gets a toast naming the first reason
   * and opens in the editor, which lists every reason with "Publish anyway".
   * Unpublish is a plain write; taking a post down needs no check.
   */
  const publishPost = async (id: string) => {
    const result = await adminPublishArticle(id);
    const now = new Date().toISOString();
    if (result.status === 'held') {
      setPosts(posts.map((post) => (post.id === id ? { ...post, review_hold: { reasons: result.reasons } } : post)));
      toast({
        title: 'Held for review',
        description: `${result.reasons[0].replace(/\.$/, '')}${result.reasons.length > 1 ? ` (and ${result.reasons.length - 1} more)` : ''}. Opening the editor.`,
        variant: 'destructive',
      });
      onEditPost(id);
      return;
    }
    if (result.status === 'error') {
      toast({ title: 'Error', description: result.message, variant: 'destructive' });
      return;
    }
    // The route revalidated /blog, the post and the sitemap.
    setPosts(posts.map((post) => (post.id === id ? { ...post, published: true, review_hold: null, updated_at: now } : post)));
    toast({ title: 'Success', description: 'Post published successfully' });
  };

  const togglePublished = async (id: string, published: boolean) => {
    if (!published) {
      await publishPost(id);
      return;
    }
    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('blog_posts')
        // An unpublish keeps the last published_at for the record.
        .update({ published: false, updated_at: now })
        .eq('id', id);

      if (error) throw error;

      setPosts(posts.map((post) => (post.id === id ? { ...post, published: false, updated_at: now } : post)));
      // Hide it on /blog, its page and the sitemap on the next request.
      const slug = posts.find((post) => post.id === id)?.slug;
      void requestRevalidate(blogPagePaths(slug));

      toast({
        title: 'Success',
        description: 'Post unpublished successfully',
      });
    } catch (error) {
      console.error('Error updating post:', error);
      toast({
        title: 'Error',
        description: 'Failed to update post status',
        variant: 'destructive',
      });
    }
  };

  const deletePost = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const deleted = posts.find((post) => post.id === id);
      const { error } = await supabase.from('blog_posts').delete().eq('id', id);

      if (error) throw error;

      setPosts(posts.filter((post) => post.id !== id));
      if (deleted?.published) void requestRevalidate(blogPagePaths(deleted.slug));

      toast({
        title: 'Success',
        description: 'Post deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete post',
        variant: 'destructive',
      });
    }
  };

  const cancelSchedule = async (id: string, title: string) => {
    if (!confirm(`Cancel scheduled publish for "${title}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({ scheduled_publish_at: null })
        .eq('id', id);

      if (error) throw error;

      setPosts(posts.map((post) =>
        post.id === id ? { ...post, scheduled_publish_at: null } : post
      ));

      toast({
        title: 'Success',
        description: 'Scheduled publish cancelled',
      });
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel scheduled publish',
        variant: 'destructive',
      });
    }
  };

  // Computed values for tabs
  const scheduledPosts = posts.filter(p => p.scheduled_publish_at && !p.published);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileX className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No blog posts yet</h3>
        <p className="text-muted-foreground">Get started by creating your first blog post.</p>
      </Card>
    );
  }

  const statusBadge = (post: BlogPost) => (
    <>
    {post.published ? (
      <Badge variant="default">
        <Globe className="w-3 h-3 mr-1" /> Published
      </Badge>
    ) : post.scheduled_publish_at ? (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        <Clock className="w-3 h-3 mr-1" /> Scheduled
      </Badge>
    ) : post.review_hold ? (
      <Badge variant="secondary" className="bg-amber-100 text-amber-900 hover:bg-amber-100" title="The publish guard held this post; open it to see why">
        <AlertTriangle className="w-3 h-3 mr-1" /> Held for review
      </Badge>
    ) : (
      <Badge variant="secondary">
        <FileX className="w-3 h-3 mr-1" /> Draft
      </Badge>
    )}
    </>
  );

  const scheduleText = (post: BlogPost) => post.scheduled_publish_at && (
    <div className="text-sm">
      {formatInTimeZone(
        new Date(post.scheduled_publish_at),
        'America/New_York',
        'MMM d, yyyy'
      )}
      <span className="block text-xs text-muted-foreground">
        {formatInTimeZone(
          new Date(post.scheduled_publish_at),
          'America/New_York',
          "h:mm a 'ET'"
        )}
      </span>
    </div>
  );

  /** View, edit, publish or cancel, delete: the same buttons in the table and in the phone cards. */
  const postActions = (post: BlogPost, align: 'end' | 'start' = 'end') => (
  <div className={`flex items-center gap-2 ${align === 'end' ? 'justify-end' : 'justify-start -ml-2'}`}>
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.preventDefault();
        // A draft has no public page yet; the preview route shows it to an admin.
        router.push(post.published ? `/blog/${post.slug}` : `/blog/preview/${post.slug}`);
      }}
      title="View post"
    >
      <Eye className="w-4 h-4" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onEditPost(post.id)}
      title="Edit post"
    >
      <Edit className="w-4 h-4" />
    </Button>
    {post.scheduled_publish_at && !post.published ? (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => cancelSchedule(post.id, post.title)}
        title="Cancel scheduled publish"
        className="text-amber-600 hover:text-amber-700"
      >
        <XCircle className="w-4 h-4" />
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => togglePublished(post.id, post.published)}
        title={post.published ? 'Unpublish' : 'Publish'}
      >
        {post.published ? (
          <FileX className="w-4 h-4" />
        ) : (
          <Globe className="w-4 h-4" />
        )}
      </Button>
    )}
    <Button
      variant="ghost"
      size="sm"
      onClick={() => deletePost(post.id, post.title)}
      className="text-destructive hover:text-destructive"
      title="Delete post"
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  </div>
  );

  const claudeBadge = (post: BlogPost) => post.source === 'claude' && (
    <Badge variant="outline" className="whitespace-nowrap text-[10px] font-normal">From Claude Code</Badge>
  );

  // Desktop: one table row per post.
  const renderPostRow = (post: BlogPost, showScheduleColumn = false) => (
    <TableRow key={post.id}>
      <TableCell className="font-medium">
        <span className="mr-2 align-middle">{post.title}</span>
        {claudeBadge(post)}
      </TableCell>
      <TableCell>{post.category}</TableCell>
      <TableCell>{statusBadge(post)}</TableCell>
      {showScheduleColumn && post.scheduled_publish_at && <TableCell>{scheduleText(post)}</TableCell>}
      <TableCell>{post.author}</TableCell>
      <TableCell>
        {formatDistanceToNow(new Date(post.updated_at), { addSuffix: true })}
      </TableCell>
      <TableCell className="text-right">{postActions(post)}</TableCell>
    </TableRow>
  );

  // Phones: a card per post, so status and the publish button are on screen
  // instead of past the table's horizontal scroll.
  const renderPostCard = (post: BlogPost) => (
    <div key={post.id} className="rounded-lg border border-border p-4 space-y-2" data-testid="blog-post-card">
      <div className="font-medium leading-snug break-words">{post.title}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {statusBadge(post)}
        {claudeBadge(post)}
        <span>{post.category}</span>
      </div>
      {post.scheduled_publish_at && !post.published && scheduleText(post)}
      <div className="text-xs text-muted-foreground">
        {post.author} · updated {formatDistanceToNow(new Date(post.updated_at), { addSuffix: true })}
      </div>
      {postActions(post, 'start')}
    </div>
  );

  const renderList = (list: BlogPost[], showScheduleColumn = false) => (
    <>
      <div className="space-y-3 md:hidden">{list.map((post) => renderPostCard(post))}</div>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              {showScheduleColumn && <TableHead>Scheduled For</TableHead>}
              <TableHead>Author</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((post) => renderPostRow(post, showScheduleColumn))}
          </TableBody>
        </Table>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="posts">All Posts</TabsTrigger>
          <TabsTrigger value="scheduled" className="relative">
            Scheduled
            {scheduledPosts.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs">
                {scheduledPosts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4 mt-6">
          {renderList(posts)}
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4 mt-6">
          {scheduledPosts.length === 0 ? (
            <Card className="p-8 text-center">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No scheduled posts</h3>
              <p className="text-muted-foreground">
                Posts scheduled for future publication will appear here.
              </p>
            </Card>
          ) : (
            renderList(
              [...scheduledPosts].sort((a, b) => new Date(a.scheduled_publish_at!).getTime() - new Date(b.scheduled_publish_at!).getTime()),
              true,
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

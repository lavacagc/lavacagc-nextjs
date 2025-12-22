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
import { Edit, Eye, Trash2, Globe, FileX, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { BlogPostGenerator } from './BlogPostGenerator';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  author: string;
  published: boolean;
  scheduled_publish_at: string | null;
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
        .select('id, title, slug, category, author, published, scheduled_publish_at, created_at, updated_at')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
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

  const togglePublished = async (id: string, published: boolean) => {
    try {
      const { error } = await supabase
        .from('blog_posts')
        .update({ published: !published })
        .eq('id', id);

      if (error) throw error;

      setPosts(posts.map((post) => (post.id === id ? { ...post, published: !published } : post)));

      toast({
        title: 'Success',
        description: `Post ${!published ? 'published' : 'unpublished'} successfully`,
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
      const { error } = await supabase.from('blog_posts').delete().eq('id', id);

      if (error) throw error;

      setPosts(posts.filter((post) => post.id !== id));

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
  const publishedPosts = posts.filter(p => p.published);
  const draftPosts = posts.filter(p => !p.published && !p.scheduled_publish_at);

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

  // Helper function to render a post row
  const renderPostRow = (post: BlogPost, showScheduleColumn = false) => (
    <TableRow key={post.id}>
      <TableCell className="font-medium">{post.title}</TableCell>
      <TableCell>{post.category}</TableCell>
      <TableCell>
        {post.published ? (
          <Badge variant="default">
            <Globe className="w-3 h-3 mr-1" /> Published
          </Badge>
        ) : post.scheduled_publish_at ? (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            <Clock className="w-3 h-3 mr-1" /> Scheduled
          </Badge>
        ) : (
          <Badge variant="secondary">
            <FileX className="w-3 h-3 mr-1" /> Draft
          </Badge>
        )}
      </TableCell>
      {showScheduleColumn && post.scheduled_publish_at && (
        <TableCell>
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
        </TableCell>
      )}
      <TableCell>{post.author}</TableCell>
      <TableCell>
        {formatDistanceToNow(new Date(post.updated_at), { addSuffix: true })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              console.log('View button clicked for:', post.slug);
              router.push(`/blog/${post.slug}`);
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
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="posts">All Posts</TabsTrigger>
          <TabsTrigger value="scheduled" className="relative">
            Scheduled
            {scheduledPosts.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 px-1.5 py-0.5 text-xs">
                {scheduledPosts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="generate">Generate New</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4 mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => renderPostRow(post))}
            </TableBody>
          </Table>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled For</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledPosts
                  .sort((a, b) => new Date(a.scheduled_publish_at!).getTime() - new Date(b.scheduled_publish_at!).getTime())
                  .map((post) => renderPostRow(post, true))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="generate" className="mt-6">
          <BlogPostGenerator onPostCreated={onEditPost} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { MarkdownEditor } from './MarkdownEditor';
import { toast } from '@/hooks/use-toast';
import { Loader2, Save, Eye, Upload, Sparkles, X } from 'lucide-react';
import { convertHeicToJpeg } from '@/utils/heicConverter';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  category: string;
  featured_image: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  published: boolean;
}

interface BlogPostEditorProps {
  postId?: string | null;
  onSave: () => void;
  onCancel: () => void;
}

const categories = [
  'Kitchen Remodeling',
  'Bathroom Renovation',
  'Home Additions',
  'Basement Finishing',
  'General Remodeling',
];

export function BlogPostEditor({ postId, onSave, onCancel }: BlogPostEditorProps) {
  const [post, setPost] = useState<Partial<BlogPost>>({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    author: 'Alex T.',
    category: 'Kitchen Remodeling',
    featured_image: '',
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    published: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');

  useEffect(() => {
    if (postId) {
      loadPost();
    }
  }, [postId]);

  const loadPost = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (error) throw error;
      setPost(data);
    } catch (error) {
      console.error('Error loading post:', error);
      toast({
        title: 'Error',
        description: 'Failed to load blog post',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleTitleChange = (title: string) => {
    setPost((prev) => ({
      ...prev,
      title,
      slug: generateSlug(title),
      meta_title: title,
    }));
  };

  const handleSave = async () => {
    if (!post.title || !post.content || !post.category) {
      toast({
        title: 'Validation Error',
        description: 'Title, content, and category are required',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const postData = {
        title: post.title,
        slug: post.slug || generateSlug(post.title),
        excerpt: post.excerpt || '',
        content: post.content,
        author: post.author || 'Alex T.',
        category: post.category,
        featured_image: post.featured_image || '',
        meta_title: post.meta_title || post.title,
        meta_description: post.meta_description || post.excerpt || '',
        meta_keywords: post.meta_keywords || '',
        published: post.published || false,
      };

      if (postId) {
        const { error } = await supabase.from('blog_posts').update(postData).eq('id', postId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('blog_posts').insert(postData);
        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error saving post:', error);
      toast({
        title: 'Error',
        description: 'Failed to save blog post',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = () => {
    if (post.slug) {
      window.open(`/blog/${post.slug}`, '_blank');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;

    // Convert HEIC to JPEG if needed
    try {
      file = await convertHeicToJpeg(file);
    } catch (error) {
      console.error('Error converting HEIC:', error);
      toast({
        title: 'Conversion Error',
        description: `Failed to convert ${file.name}. Please try a different format.`,
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = fileName; // Remove the blog-images/ prefix since it's already the bucket name

      const { error: uploadError } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('blog-images').getPublicUrl(filePath);

      setPost((prev) => ({ ...prev, featured_image: publicUrl }));
      toast({
        title: 'Success',
        description: 'Image uploaded successfully',
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an image prompt',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-image', {
        body: { prompt: imagePrompt },
      });

      if (error) throw error;
      if (!data.imageUrl) throw new Error('No image URL returned');

      // Convert base64 to blob and upload
      const base64Response = await fetch(data.imageUrl);
      const blob = await base64Response.blob();

      const fileName = `${Math.random()}.png`;
      const filePath = fileName; // Remove the blog-images/ prefix

      const { error: uploadError } = await supabase.storage
        .from('blog-images')
        .upload(filePath, blob);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('blog-images').getPublicUrl(filePath);

      setPost((prev) => ({ ...prev, featured_image: publicUrl }));
      setImagePrompt('');
      toast({
        title: 'Success',
        description: 'Image generated successfully',
      });
    } catch (error) {
      console.error('Error generating image:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate image',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setPost((prev) => ({ ...prev, featured_image: '' }));
  };

  const handleGenerateSEO = async () => {
    if (!post.title || !post.content) {
      toast({
        title: 'Missing Content',
        description: 'Please add a title and content before generating SEO',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingSEO(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-blog-seo', {
        body: {
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
        },
      });

      if (error) throw error;

      setPost((prev) => ({
        ...prev,
        meta_title: data.metaTitle,
        meta_description: data.metaDescription,
        meta_keywords: data.keywords,
      }));

      toast({
        title: 'SEO Generated',
        description: 'Meta title, description, and keywords have been generated',
      });
    } catch (error) {
      console.error('Error generating SEO:', error);
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate SEO metadata',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSEO(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={post.title || ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Enter blog post title"
              />
            </div>

            <div>
              <Label htmlFor="slug">URL Slug</Label>
              <Input
                id="slug"
                value={post.slug || ''}
                onChange={(e) => setPost((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="url-friendly-slug"
              />
            </div>

            <div>
              <Label htmlFor="excerpt">Excerpt</Label>
              <Textarea
                id="excerpt"
                value={post.excerpt || ''}
                onChange={(e) => setPost((prev) => ({ ...prev, excerpt: e.target.value }))}
                placeholder="Brief description of the blog post"
                rows={3}
              />
            </div>

            <div>
              <MarkdownEditor
                label="Content"
                value={post.content || ''}
                onChange={(content) => setPost((prev) => ({ ...prev, content }))}
                placeholder="Write your blog post content in Markdown..."
                rows={20}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Featured Image</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {post.featured_image && (
                <div className="relative">
                  <img
                    src={post.featured_image}
                    alt="Featured"
                    className="w-full h-48 object-cover rounded-md"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={handleRemoveImage}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <div>
                <Label htmlFor="image-upload">Upload Image</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*,.heic,.heif"
                    onChange={handleImageUpload}
                    disabled={isUploadingImage}
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" disabled={isUploadingImage}>
                    {isUploadingImage ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <Label htmlFor="image-prompt">Generate with AI</Label>
                <div className="space-y-2 mt-2">
                  <Textarea
                    id="image-prompt"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the image you want to generate..."
                    rows={3}
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Image
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Publish Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="published"
                  checked={post.published || false}
                  onCheckedChange={(published) => setPost((prev) => ({ ...prev, published }))}
                />
                <Label htmlFor="published">Published</Label>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={post.category}
                  onValueChange={(category) => setPost((prev) => ({ ...prev, category }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="author">Author</Label>
                <Input
                  id="author"
                  value={post.author || ''}
                  onChange={(e) => setPost((prev) => ({ ...prev, author: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SEO Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGenerateSEO}
                disabled={isGeneratingSEO || !post.title || !post.content}
              >
                {isGeneratingSEO ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate SEO
                  </>
                )}
              </Button>

              <Separator />

              <div>
                <Label htmlFor="meta_title">Meta Title</Label>
                <Input
                  id="meta_title"
                  value={post.meta_title || ''}
                  onChange={(e) => setPost((prev) => ({ ...prev, meta_title: e.target.value }))}
                  placeholder="SEO title"
                />
              </div>

              <div>
                <Label htmlFor="meta_description">Meta Description</Label>
                <Textarea
                  id="meta_description"
                  value={post.meta_description || ''}
                  onChange={(e) =>
                    setPost((prev) => ({ ...prev, meta_description: e.target.value }))
                  }
                  placeholder="SEO description"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="meta_keywords">Keywords</Label>
                <Input
                  id="meta_keywords"
                  value={post.meta_keywords || ''}
                  onChange={(e) => setPost((prev) => ({ ...prev, meta_keywords: e.target.value }))}
                  placeholder="keyword1, keyword2, keyword3"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {post.slug && (
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Post
          </Button>
        </div>
      </div>
    </div>
  );
}

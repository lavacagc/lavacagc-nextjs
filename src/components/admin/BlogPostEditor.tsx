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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { MarkdownEditor } from './MarkdownEditor';
import { toast } from '@/hooks/use-toast';
import { Loader2, Save, Eye, Upload, X, Clock, CalendarIcon, AlertTriangle } from 'lucide-react';
import { convertHeicToJpeg } from '@/utils/heicConverter';
import { format, parse } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { blogPagePaths, requestRevalidate } from '@/lib/revalidate';
import { adminPublishArticle } from '@/lib/articles/adminPublish';

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
  scheduled_publish_at: string | null;
  published_at?: string | null;
  source?: string | null;
  /** Set by the publish guard when it held a publish (Phase 2 slice G). */
  review_hold?: { reasons?: string[]; checked_at?: string } | null;
}

const EASTERN_TZ = 'America/New_York';

// Convert UTC to Eastern for display
const utcToEastern = (utcDate: string | null): { date: Date | undefined; time: string } => {
  if (!utcDate) return { date: undefined, time: '09:00' };
  const zonedDate = toZonedTime(new Date(utcDate), EASTERN_TZ);
  return {
    date: zonedDate,
    time: format(zonedDate, 'HH:mm')
  };
};

// Convert Eastern to UTC for storage
const easternToUtc = (date: Date, time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const combinedDate = new Date(date);
  combinedDate.setHours(hours, minutes, 0, 0);
  return fromZonedTime(combinedDate, EASTERN_TZ).toISOString();
};

// Generate time options for the select (30-minute intervals)
const generateTimeOptions = () => {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const min of ['00', '30']) {
      const value = `${hour.toString().padStart(2, '0')}:${min}`;
      const label = format(parse(value, 'HH:mm', new Date()), 'h:mm a');
      options.push({ value, label });
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

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
    scheduled_publish_at: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  // What the database held when the post was loaded: a save compares against it
  // to stamp published_at on a publish and to revalidate the old slug's page.
  const [loaded, setLoaded] = useState<{ published: boolean; slug: string } | null>(null);
  // The row this editor writes: the post it opened, or the one its first save created.
  const [savedId, setSavedId] = useState<string | null>(postId ?? null);
  // Why the publish guard held this post; shown above the form with "Publish anyway".
  const [holdReasons, setHoldReasons] = useState<string[]>([]);

  // Scheduling state
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState<string>('09:00');
  const [isScheduled, setIsScheduled] = useState(false);

  useEffect(() => {
    if (postId) {
      loadPost();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadPost depends on postId which is already in deps; including it would cause infinite loops
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
      setSavedId(data.id);
      setLoaded({ published: !!data.published, slug: data.slug ?? '' });
      // `review_hold` (Phase 2 migration) is not in the generated types file yet.
      const hold = (data as { review_hold?: BlogPost['review_hold'] }).review_hold;
      setHoldReasons(!data.published && Array.isArray(hold?.reasons) ? hold.reasons : []);

      // Load scheduling info if present
      if (data.scheduled_publish_at) {
        const { date, time } = utcToEastern(data.scheduled_publish_at);
        setScheduleDate(date);
        setScheduleTime(time);
        setIsScheduled(true);
      } else {
        setScheduleDate(undefined);
        setScheduleTime('09:00');
        setIsScheduled(false);
      }
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

  /**
   * Save the post. A draft-to-live change is saved as a draft first and then
   * published through /api/admin/articles/<id>/publish, so the publish guard
   * checks exactly what was saved and can hold it (PG4). `override` is
   * "Publish anyway" (PG3): it saves, then publishes despite the hold, and the
   * server records the admin's id.
   */
  const handleSave = async (opts: { override?: boolean } = {}) => {
    if (!post.title || !post.content || !post.category) {
      toast({
        title: 'Validation Error',
        description: 'Title, content, and category are required',
        variant: 'destructive',
      });
      return;
    }

    // Validate schedule if set ("Publish anyway" publishes now, schedule or not)
    if (isScheduled && scheduleDate && !opts.override) {
      const scheduledUtc = easternToUtc(scheduleDate, scheduleTime);
      if (new Date(scheduledUtc) <= new Date()) {
        toast({
          title: 'Invalid Schedule',
          description: 'Scheduled time must be in the future',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const willPublish = opts.override ? true : isScheduled ? false : (post.published || false);
      // Draft to live goes through the guard on the server, after this write.
      const goingLive = willPublish && !loaded?.published;
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
        // A draft stays a draft here even when it is about to go live: the
        // publish route flips it (and stamps published_at) only if the guard
        // passes. An edit of a live post keeps it live and keeps its date.
        published: goingLive ? false : willPublish,
        updated_at: new Date().toISOString(),
        // Set scheduled time if scheduling is enabled
        scheduled_publish_at: isScheduled && scheduleDate && !opts.override
          ? easternToUtc(scheduleDate, scheduleTime)
          : null,
      };

      let id = savedId;
      if (id) {
        const { error } = await supabase.from('blog_posts').update(postData).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('blog_posts').insert(postData).select('id').single();
        if (error) throw error;
        id = data.id as string;
        setSavedId(id);
      }

      if (goingLive && id) {
        const result = await adminPublishArticle(id, { override: opts.override });
        if (result.status === 'held') {
          // Saved as a draft; the reasons show above the form with "Publish anyway".
          setHoldReasons(result.reasons);
          setPost((prev) => ({ ...prev, published: false }));
          setLoaded({ published: false, slug: postData.slug });
          toast({
            title: 'Held for review',
            description: `Saved as a draft. ${result.reasons.length} thing${result.reasons.length === 1 ? '' : 's'} to check before it can go live.`,
            variant: 'destructive',
          });
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (result.status === 'error') {
          setLoaded({ published: false, slug: postData.slug });
          toast({ title: 'Saved as a draft', description: `Could not publish: ${result.message}`, variant: 'destructive' });
          return;
        }
        // Published: the route revalidated /blog, the post and the sitemap.
        setHoldReasons([]);
        toast({
          title: result.overridden ? 'Published anyway' : 'Published',
          description: result.overridden ? 'Published over the review hold; your override is recorded.' : 'Blog post saved and published.',
        });
        onSave();
        return;
      }

      // The public blog pages are ISR copies; drop the ones this save touched
      // (the list, the post under its new and old slug, the sitemap) so the
      // change shows on the next request instead of after the ISR window.
      // A draft that stays a draft changes nothing public, so it skips this.
      if (willPublish || loaded?.published) {
        void requestRevalidate(blogPagePaths(postData.slug, loaded?.slug));
      }

      // Show appropriate success message
      if (isScheduled && scheduleDate) {
        const formattedDate = format(scheduleDate, 'MMMM d, yyyy');
        const formattedTime = format(parse(scheduleTime, 'HH:mm', new Date()), 'h:mm a');
        toast({
          title: 'Post Scheduled',
          description: `Will be published on ${formattedDate} at ${formattedTime} ET`,
        });
      } else {
        toast({
          title: 'Success',
          description: 'Blog post saved successfully',
        });
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
      // A draft has no public page yet; the preview route shows it to an admin.
      window.open(loaded?.published ? `/blog/${post.slug}` : `/blog/preview/${post.slug}`, '_blank');
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

  const handleRemoveImage = () => {
    setPost((prev) => ({ ...prev, featured_image: '' }));
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
      {holdReasons.length > 0 && !post.published && (
        <div role="alert" data-testid="review-hold" className="rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-amber-900">Held for review</h3>
              <p className="mt-1 text-sm text-amber-900">
                The publish guard kept this post off the site. Fix what it names and save again, or publish it as it is.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-950" data-testid="review-hold-reasons">
                {holdReasons.map((reason) => (
                  <li key={reason} className="break-words">{reason}</li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                onClick={() => handleSave({ override: true })}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Publish anyway
              </Button>
            </div>
          </div>
        </div>
      )}

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
                  <Image
                    src={post.featured_image}
                    alt={`Featured image for ${post.title || 'blog post'}`}
                    width={400}
                    height={192}
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
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Schedule Publication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {post.published ? (
                <p className="text-sm text-muted-foreground">
                  This post is already published.
                </p>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="schedule"
                      checked={isScheduled}
                      onCheckedChange={(checked) => {
                        setIsScheduled(checked);
                        if (!checked) {
                          setScheduleDate(undefined);
                          setPost(prev => ({ ...prev, scheduled_publish_at: null }));
                        }
                      }}
                    />
                    <Label htmlFor="schedule">Schedule for later</Label>
                  </div>

                  {isScheduled && (
                    <div className="space-y-4 pt-2">
                      {/* Date Picker */}
                      <div className="space-y-2">
                        <Label>Publish Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !scheduleDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {scheduleDate
                                ? format(scheduleDate, "MMMM d, yyyy")
                                : "Select date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={scheduleDate}
                              onSelect={setScheduleDate}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Time Picker */}
                      <div className="space-y-2">
                        <Label>Publish Time (Eastern)</Label>
                        <Select value={scheduleTime} onValueChange={setScheduleTime}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {timeOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          All times are Eastern Time (ET)
                        </p>
                      </div>

                      {scheduleDate && (
                        <div className="p-3 bg-primary/5 rounded-md border border-primary/10">
                          <p className="text-sm font-medium">
                            Scheduled for:
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(scheduleDate, 'EEEE, MMMM d, yyyy')} at{' '}
                            {format(parse(scheduleTime, 'HH:mm', new Date()), 'h:mm a')} ET
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {post.scheduled_publish_at && !isScheduled && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-sm text-amber-800">
                        Currently scheduled for:{' '}
                        {formatInTimeZone(
                          new Date(post.scheduled_publish_at),
                          EASTERN_TZ,
                          "MMMM d, yyyy 'at' h:mm a"
                        )} ET
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-amber-700"
                        onClick={() => {
                          const { date, time } = utcToEastern(post.scheduled_publish_at ?? null);
                          setScheduleDate(date);
                          setScheduleTime(time);
                          setIsScheduled(true);
                        }}
                      >
                        Edit schedule
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">SEO Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
          <Button onClick={() => handleSave()} disabled={isSaving}>
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

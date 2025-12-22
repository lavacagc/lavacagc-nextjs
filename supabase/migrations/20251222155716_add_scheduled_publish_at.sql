-- Add scheduled_publish_at column to blog_posts for article scheduling
ALTER TABLE public.blog_posts
ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ NULL;

-- Add index for efficient querying of scheduled posts
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled
ON public.blog_posts (scheduled_publish_at)
WHERE scheduled_publish_at IS NOT NULL AND published = false;

-- Add comment for documentation
COMMENT ON COLUMN public.blog_posts.scheduled_publish_at IS 'UTC timestamp for when the post should be automatically published. NULL means not scheduled.';

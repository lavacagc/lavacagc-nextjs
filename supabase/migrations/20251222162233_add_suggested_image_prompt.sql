-- Add suggested_image_prompt column to blog_posts for AI-generated image prompts
ALTER TABLE public.blog_posts
ADD COLUMN IF NOT EXISTS suggested_image_prompt TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.blog_posts.suggested_image_prompt IS 'AI-generated prompt suggestion for the featured image based on article content';

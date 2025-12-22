import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "https://esm.sh/resend@3.2.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  author: string;
  category: string;
  featured_image: string | null;
  meta_description: string | null;
  scheduled_publish_at: string;
}

// Generate social media copy for different platforms
function generateSocialCopy(post: BlogPost, baseUrl: string): {
  twitter: string;
  linkedin: string;
  facebook: string;
} {
  const postUrl = `${baseUrl}/blog/${post.slug}`;
  const excerpt = post.excerpt || post.meta_description || post.title;
  const shortExcerpt = excerpt.length > 100 ? excerpt.substring(0, 100) + '...' : excerpt;

  return {
    twitter: `New blog post: ${post.title}\n\n${shortExcerpt}\n\nRead more: ${postUrl}`,
    linkedin: `We just published a new article on ${post.category}:\n\n"${post.title}"\n\n${excerpt}\n\nRead the full article: ${postUrl}`,
    facebook: `New on our blog: ${post.title}\n\n${excerpt}\n\nRead now: ${postUrl}`
  };
}

// Format date for Eastern Time display
function formatToEastern(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

const handler = async (req: Request): Promise<Response> => {
  // This function is called by pg_cron, no CORS needed for internal calls
  // But we'll add basic headers for manual testing
  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date().toISOString();
    console.log(`[${now}] Checking for scheduled posts to publish...`);

    // Find articles that should be published now
    const { data: postsToPublish, error: fetchError } = await supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, author, category, featured_image, meta_description, scheduled_publish_at')
      .lte('scheduled_publish_at', now)
      .eq('published', false)
      .not('scheduled_publish_at', 'is', null);

    if (fetchError) {
      console.error('Error fetching scheduled posts:', fetchError);
      throw fetchError;
    }

    if (!postsToPublish || postsToPublish.length === 0) {
      console.log('No scheduled posts to publish at this time');
      return new Response(JSON.stringify({
        success: true,
        published: 0,
        message: 'No scheduled posts to publish'
      }), {
        status: 200,
        headers
      });
    }

    console.log(`Found ${postsToPublish.length} post(s) to publish`);
    const baseUrl = 'https://www.lavacagc.com';
    const publishedPosts: { id: string; title: string }[] = [];

    for (const post of postsToPublish as BlogPost[]) {
      console.log(`Publishing post: "${post.title}" (ID: ${post.id})`);

      // Publish the post
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          published: true,
          scheduled_publish_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', post.id);

      if (updateError) {
        console.error(`Error publishing post ${post.id}:`, updateError);
        continue;
      }

      publishedPosts.push({ id: post.id, title: post.title });

      // Generate social media copy
      const socialCopy = generateSocialCopy(post, baseUrl);

      // Send notification email to admins
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EE9639, #FF9051); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Blog Post Published!</h1>
            <p style="color: white; margin: 5px 0 0 0; opacity: 0.9;">Your scheduled article is now live</p>
          </div>

          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #002855; margin-bottom: 10px;">${post.title}</h2>

            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
              ${post.excerpt || post.meta_description || 'No excerpt available.'}
            </p>

            <div style="margin: 25px 0;">
              <a href="${baseUrl}/blog/${post.slug}"
                 style="background: #EE9639; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                View Article
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />

            <h3 style="color: #002855; margin-bottom: 15px;">Social Media Copy</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 15px;">Copy and paste these ready-to-use posts:</p>

            <div style="margin-bottom: 20px;">
              <h4 style="color: #1DA1F2; margin-bottom: 8px; font-size: 14px;">
                <span style="display: inline-block; width: 20px; height: 20px; background: #1DA1F2; border-radius: 4px; color: white; text-align: center; line-height: 20px; margin-right: 8px; font-size: 12px;">X</span>
                Twitter/X
              </h4>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; white-space: pre-wrap; border-left: 3px solid #1DA1F2;">${socialCopy.twitter}</div>
            </div>

            <div style="margin-bottom: 20px;">
              <h4 style="color: #0A66C2; margin-bottom: 8px; font-size: 14px;">
                <span style="display: inline-block; width: 20px; height: 20px; background: #0A66C2; border-radius: 4px; color: white; text-align: center; line-height: 20px; margin-right: 8px; font-size: 12px;">in</span>
                LinkedIn
              </h4>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; white-space: pre-wrap; border-left: 3px solid #0A66C2;">${socialCopy.linkedin}</div>
            </div>

            <div style="margin-bottom: 20px;">
              <h4 style="color: #1877F2; margin-bottom: 8px; font-size: 14px;">
                <span style="display: inline-block; width: 20px; height: 20px; background: #1877F2; border-radius: 4px; color: white; text-align: center; line-height: 20px; margin-right: 8px; font-size: 12px;">f</span>
                Facebook
              </h4>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; white-space: pre-wrap; border-left: 3px solid #1877F2;">${socialCopy.facebook}</div>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />

            <div style="background: #e8f4f8; padding: 15px; border-radius: 4px;">
              <table style="width: 100%; font-size: 14px;">
                <tr>
                  <td style="padding: 4px 0; color: #666;"><strong>Published:</strong></td>
                  <td style="padding: 4px 0; color: #333;">${formatToEastern(new Date())} ET</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #666;"><strong>Scheduled for:</strong></td>
                  <td style="padding: 4px 0; color: #333;">${formatToEastern(new Date(post.scheduled_publish_at))} ET</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #666;"><strong>Author:</strong></td>
                  <td style="padding: 4px 0; color: #333;">${post.author}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: #666;"><strong>Category:</strong></td>
                  <td style="padding: 4px 0; color: #333;">${post.category}</td>
                </tr>
              </table>
            </div>
          </div>

          <div style="background: #f5f5f5; padding: 20px; text-align: center; color: #666;">
            <p style="margin: 0; font-size: 14px;">La Vaca General Contractors LLC</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">Automated Blog Scheduler</p>
          </div>
        </div>
      `;

      try {
        const emailResponse = await resend.emails.send({
          from: "La Vaca GC Blog <notifications@email.lavaca.link>",
          to: ["alex@lavacagc.com", "veronica@lavacagc.com"],
          subject: `Blog Published: ${post.title}`,
          html: emailHtml
        });

        console.log(`Email notification sent for "${post.title}":`, emailResponse);
      } catch (emailError) {
        console.error(`Failed to send email for post ${post.id}:`, emailError);
        // Continue even if email fails - the post is already published
      }
    }

    const response = {
      success: true,
      published: publishedPosts.length,
      posts: publishedPosts,
      timestamp: new Date().toISOString()
    };

    console.log('Publish operation completed:', response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Error in publish-scheduled-articles:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers
    });
  }
};

serve(handler);

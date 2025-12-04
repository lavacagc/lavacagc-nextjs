import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getCorsHeaders,
  fetchRecentPosts,
  fetchRecentProjects,
  buildLinksContext,
  SPECIAL_FORMATTING
} from "../_shared/internalLinks.ts";

type EnhancementLevel = 'light' | 'moderate' | 'heavy';

// Get link count based on enhancement level
function getLinkCount(level: EnhancementLevel): string {
  switch (level) {
    case 'light': return "2-3";
    case 'moderate': return "3-5";
    case 'heavy': return "5-7";
  }
}

// Get enhancement-specific instructions
function getEnhancementPrompt(
  level: EnhancementLevel,
  linksContext: string
): string {
  switch (level) {
    case 'light':
      return `ENHANCEMENT LEVEL: Light Polish

Your task is to lightly polish this blog post while preserving its core structure and message.

WHAT TO DO:
- Fix any grammar, spelling, or punctuation errors
- Improve sentence flow and readability
- Add 1-2 natural mentions of Northern NJ towns we serve
- Enhance the contractor voice (experienced, trustworthy, professional)
- Add 2-3 natural internal links where they fit contextually
- Keep the overall structure mostly intact

WHAT NOT TO DO:
- Don't completely restructure the content
- Don't change the main topic or focus
- Don't add excessive promotional language
- Don't remove existing good content

${linksContext}

${SPECIAL_FORMATTING}`;

    case 'moderate':
      return `ENHANCEMENT LEVEL: Full Local SEO Optimization

Your task is to optimize this blog post for local SEO while maintaining its core message.

WHAT TO DO:
- Rewrite with a strong contractor voice showing expertise and experience
- Add specific NJ town examples (Short Hills, Montclair, Alpine, Saddle River, etc.)
- Include E-E-A-T signals throughout:
  * Experience: "In our 20+ years serving Northern NJ..."
  * Expertise: Technical knowledge and industry insights
  * Authority: References to industry standards and best practices
  * Trust: Mentions of licensing, insurance, customer satisfaction
- Add 3-5 natural internal links strategically placed throughout
- Improve headings for SEO (include location keywords where natural)
- Add a soft CTA section linking to project calculator or contact page
- Use local terminology and references familiar to NJ homeowners

WHAT NOT TO DO:
- Don't lose the original topic focus
- Don't make it sound like a sales pitch
- Don't stuff keywords unnaturally
- Don't remove valuable technical information

${linksContext}

${SPECIAL_FORMATTING}`;

    case 'heavy':
      return `ENHANCEMENT LEVEL: Complete Rewrite for Maximum Local SEO

Your task is to completely rewrite this blog post for maximum local SEO impact while keeping the same topic.

WHAT TO DO:
- Full contractor voice rewrite with clear expertise signals throughout
- Mention 5-7 different NJ towns naturally throughout the content
- Strong E-E-A-T signals in every section:
  * Experience: Multiple references to projects completed, years in business
  * Expertise: Deep technical knowledge, industry certifications
  * Authority: Industry standards, building codes, best practices
  * Trust: Licensing, insurance, warranty, customer reviews
- Add 5-7 internal links strategically placed:
  * Links to relevant service pages when discussing work types
  * Links to location pages when mentioning towns
  * Links to blog posts when referencing topics
  * CTA links to calculator and contact
- Restructure with SEO-optimized headings (include keywords naturally)
- Add callout boxes for key information (checklists, tips, warnings)
- Create a compelling opening that addresses homeowner pain points
- End with a strong but natural CTA section

CONTENT STRUCTURE:
1. Engaging introduction with location relevance
2. 4-6 main sections with keyword-rich H2 headings
3. Include at least 2 styled callout boxes (checklist, info, or warning)
4. Conclusion with clear next steps and CTA links

${linksContext}

${SPECIAL_FORMATTING}`;
  }
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // Parse request body
    const { title, content, category, enhancementLevel } = await req.json();

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const level: EnhancementLevel = ['light', 'moderate', 'heavy'].includes(enhancementLevel)
      ? enhancementLevel
      : 'moderate';

    // Fetch recent posts and projects for internal linking (if Supabase is configured)
    let recentPosts: { title: string; url: string }[] = [];
    let recentProjects: { title: string; url: string; serviceTypes?: string[]; location?: string }[] = [];
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      [recentPosts, recentProjects] = await Promise.all([
        fetchRecentPosts(supabaseClient),
        fetchRecentProjects(supabaseClient)
      ]);
    }

    // Get link count and build context first
    const linkCount = getLinkCount(level);
    const linksContext = buildLinksContext(recentPosts, recentProjects, linkCount);

    // Get enhancement-specific prompt
    const instructions = getEnhancementPrompt(level, linksContext);

    // Build the main prompt
    const systemPrompt = `You are an expert content editor for La Vaca General Contractors, a luxury home remodeling company serving Northern New Jersey. Your job is to enhance existing blog content for better SEO performance and reader engagement.

ORIGINAL POST TITLE: ${title || 'Untitled'}
CATEGORY: ${category || 'Home Improvement'}

${instructions}

---

ORIGINAL CONTENT TO ENHANCE:

${content}

---

IMPORTANT: Return ONLY the enhanced markdown content. Start with # for the title. Do not include any explanatory text before or after the content.`;

    console.log(`Enhancing blog post "${title}" with ${level} enhancement`);

    // Call Gemini API - use gemini-2.5-flash for fast, high-quality text generation
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: systemPrompt }]
          }],
          generationConfig: {
            temperature: level === 'heavy' ? 0.8 : level === 'moderate' ? 0.7 : 0.5,
            topP: 0.9,
            maxOutputTokens: 8192,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ]
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const data = await geminiResponse.json();
    const enhancedContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!enhancedContent) {
      console.error("No content in response:", JSON.stringify(data).substring(0, 500));
      throw new Error("No enhanced content generated");
    }

    console.log(`Blog post enhanced successfully with ${level} level, length: ${enhancedContent.length}`);

    return new Response(
      JSON.stringify({ enhancedContent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in enhance-blog-content:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to enhance blog content",
        code: "ENHANCEMENT_ERROR"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

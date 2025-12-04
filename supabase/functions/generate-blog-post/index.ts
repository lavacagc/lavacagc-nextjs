import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  getCorsHeaders,
  fetchRecentPosts,
  fetchRecentProjects,
  buildLinksContext,
  SPECIAL_FORMATTING
} from "../_shared/internalLinks.ts";

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
    const { topic, information, category, tone } = await req.json();

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "A topic is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Build the internal links context for the AI
    const linksContext = buildLinksContext(recentPosts, recentProjects, "3-5");

    // Build the main prompt
    const systemPrompt = `You are an expert content writer for La Vaca General Contractors, a luxury home remodeling company serving Northern New Jersey. You create engaging, SEO-optimized blog posts that are informative and convert readers into leads.

Writing Style:
- Tone: ${tone || 'professional'}
- Voice: Knowledgeable but approachable, like talking to a trusted neighbor who happens to be an expert
- Length: 1200-1800 words
- Structure: Use clear H2 and H3 headings, short paragraphs, bullet points where appropriate

SEO Requirements:
- Include the main topic/keyword naturally throughout
- Use LSI keywords related to home remodeling
- Include location-relevant terms (Northern NJ, Essex County, Bergen County, Morris County)
- Create content that answers common homeowner questions

${linksContext}

${SPECIAL_FORMATTING}

ARTICLE STRUCTURE:
1. Start with # Title (include main keyword)
2. Opening paragraph that hooks the reader and addresses their pain point
3. 3-5 main sections with H2 headings
4. Include at least one checklist or info box
5. Closing section with subtle CTA (link to calculator or contact)

Now write a comprehensive blog post about: "${topic}"
Category: ${category || 'Home Improvement Tips'}
${information ? `\nAdditional context to incorporate: ${information}` : ''}`;

    console.log("Generating blog post about:", topic);

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
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 4096,
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
    const generatedContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedContent) {
      console.error("No content in response:", JSON.stringify(data).substring(0, 500));
      throw new Error("No content generated");
    }

    console.log("Blog post generated successfully, length:", generatedContent.length);

    return new Response(
      JSON.stringify({ generatedContent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-blog-post:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate blog post",
        code: "GENERATION_ERROR"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

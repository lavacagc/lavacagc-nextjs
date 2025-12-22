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

    // Extract key details from the generated content for a more contextual image prompt
    const contentPreview = generatedContent.substring(0, 1500);

    // Generate a suggested image prompt based on the article content
    const imagePromptRequest = `You are an expert at crafting image generation prompts for luxury home remodeling photography. Analyze this blog article and create ONE highly detailed, specific image prompt.

ARTICLE TOPIC: "${topic}"
CATEGORY: ${category}

ARTICLE EXCERPT:
${contentPreview}

PROMPT REQUIREMENTS:
1. Start with "Professional interior photography of" or "Architectural photography of"
2. Specify the EXACT room type (master bathroom, chef's kitchen, finished basement, etc.)
3. Include 3-4 SPECIFIC materials with finishes (e.g., "honed Calacatta marble countertops", "wire-brushed white oak cabinetry", "brushed brass Waterworks fixtures")
4. Mention lighting style (e.g., "soft morning light through floor-to-ceiling windows", "warm recessed LED lighting", "statement pendant lights")
5. Include architectural details (e.g., "coffered ceiling", "herringbone tile floor", "frameless glass shower enclosure")
6. Add atmosphere words (e.g., "serene", "sophisticated", "inviting warmth")
7. End with technical specs: "shot on Canon 5D Mark IV, 24mm tilt-shift lens, f/8, natural light"

STYLE REFERENCE: Northern New Jersey luxury homes - think Montclair Victorians, Short Hills estates, Alpine contemporary mansions

EXAMPLES OF GREAT PROMPTS:
- "Professional interior photography of a luxury master bathroom renovation, featuring a freestanding Waterworks soaking tub against floor-to-ceiling Statuario marble walls, custom floating double vanity in rift-cut white oak with integrated LED mirrors, heated Carrara hexagon floor tiles, frameless glass walk-in shower with rainfall head, soft diffused daylight from frosted privacy windows, serene spa-like atmosphere, shot on Canon 5D Mark IV, 24mm tilt-shift lens, f/8"
- "Architectural photography of a chef's kitchen in a Bergen County estate, white Shaker cabinetry with unlacquered brass hardware, waterfall-edge Taj Mahal quartzite island, Wolf 48-inch range with pot filler, custom walnut open shelving, subway tile backsplash in warm white, morning sunlight streaming through garden windows, inviting yet sophisticated ambiance, professional real estate photography style"

Return ONLY the image prompt, nothing else. Make it 300-450 characters, rich with specific details that will generate a stunning, realistic luxury renovation photo.`;

    let suggestedImagePrompt = "";
    try {
      const imagePromptResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: imagePromptRequest }]
            }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 512,
            }
          })
        }
      );

      if (imagePromptResponse.ok) {
        const imagePromptData = await imagePromptResponse.json();
        suggestedImagePrompt = imagePromptData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        console.log("Generated image prompt:", suggestedImagePrompt);
      }
    } catch (imagePromptError) {
      console.error("Error generating image prompt (non-fatal):", imagePromptError);
      // Continue without the image prompt - it's not critical
    }

    return new Response(
      JSON.stringify({ generatedContent, suggestedImagePrompt }),
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

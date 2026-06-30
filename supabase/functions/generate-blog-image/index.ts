import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { openaiImage } from "../_shared/openai.ts";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://www.lavacagc.com',
  'https://lavacagc.com',
  'https://lavaca.link',
  'https://www.lavaca.link',
  'https://vacamoo.com',
  'https://www.vacamoo.com',
  'https://lavacagc-nextjs-138k.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
  };
};

// Style enhancement for professional remodeling images
const STYLE_SUFFIX = ", professional photography, luxury home renovation, high-end finishes, bright natural lighting, architectural photography style, photorealistic, 8k quality, interior design magazine";

// OpenAI's latest image model (pinned for stable production output/cost; swap to
// "chatgpt-image-latest" if you ever want the rolling always-newest alias).
const MODEL = "gpt-image-2";
const SIZE = "1536x1024"; // landscape ~16:9 hero
const QUALITY = "high"; // "low" | "medium" | "high" | "auto"

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Parse request body
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "A prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enhance prompt with professional styling
    const enhancedPrompt = `${prompt.trim()}${STYLE_SUFFIX}`;
    console.log(`Generating image with ${MODEL}:`, enhancedPrompt.substring(0, 100) + "...");

    const { b64, mimeType } = await openaiImage({
      model: MODEL,
      prompt: enhancedPrompt,
      size: SIZE,
      quality: QUALITY,
    });
    const imageUrl = `data:${mimeType};base64,${b64}`;

    console.log(`Image generated successfully with ${MODEL}`);

    return new Response(
      JSON.stringify({ imageUrl, model: MODEL }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-blog-image:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate image",
        code: "GENERATION_ERROR"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

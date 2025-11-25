import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
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
    console.log("Generating image with prompt:", enhancedPrompt.substring(0, 100) + "...");

    // Primary: Gemini 3 Pro Image (highest quality, up to 4K, 16:9 aspect ratio)
    // Fallback: Gemini 2.0 Flash experimental (if 3 Pro unavailable)
    const PRIMARY_MODEL = "gemini-3-pro-image-preview";
    const FALLBACK_MODEL = "gemini-2.0-flash-exp-image-generation";

    console.log(`Trying primary model: ${PRIMARY_MODEL}`);
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${PRIMARY_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: enhancedPrompt }]
          }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: "16:9"
            }
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Primary model error:", errorText);

      // Try fallback model (doesn't support aspect ratio)
      console.log(`Trying fallback model: ${FALLBACK_MODEL}`);
      const fallbackResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${FALLBACK_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: enhancedPrompt }]
            }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"]
            }
          })
        }
      );

      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.text();
        console.error("Fallback model error:", fallbackError);
        throw new Error(`Image generation failed: ${geminiResponse.status} - ${errorText.substring(0, 200)}`);
      }

      const fallbackData = await fallbackResponse.json();
      console.log("Fallback response structure:", JSON.stringify(fallbackData).substring(0, 300));

      const imagePart = fallbackData.candidates?.[0]?.content?.parts?.find(
        (part: { inlineData?: { data: string; mimeType: string } }) => part.inlineData
      );

      if (!imagePart?.inlineData?.data) {
        throw new Error("No image data in fallback response");
      }

      const mimeType = imagePart.inlineData.mimeType || "image/png";
      const imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

      console.log("Image generated successfully via fallback model");
      return new Response(
        JSON.stringify({ imageUrl, model: FALLBACK_MODEL }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse primary model response
    const data = await geminiResponse.json();
    console.log("Primary response structure:", JSON.stringify(data).substring(0, 300));

    // Find image part in response
    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (part: { inlineData?: { data: string; mimeType: string } }) => part.inlineData
    );

    if (!imagePart?.inlineData?.data) {
      console.error("Unexpected response structure:", JSON.stringify(data).substring(0, 500));
      throw new Error("No image data in response");
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const imageUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

    console.log("Image generated successfully via primary model");

    return new Response(
      JSON.stringify({ imageUrl, model: PRIMARY_MODEL }),
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

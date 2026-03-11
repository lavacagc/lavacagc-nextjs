import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';

interface AnalysisRequest {
  beforeImages: string[]; // base64 data URLs
  afterImages: string[];  // base64 data URLs
  location: string;
  serviceTypes: string[];
  rooms?: string[];       // optional room labels
  mode: 'full' | 'categorize' | 'compare';
}

interface ProjectContent {
  title: string;
  challenge: string;
  solution: string;
  materialsUsed: string[];
  specialFeatures: string[];
  seoTitle: string;
  metaDescription: string;
  roomAnalysis?: Array<{
    room: string;
    beforeDescription: string;
    afterDescription: string;
    transformationSummary: string;
  }>;
  altTexts: {
    before: string[];
    after: string[];
  };
}

async function callGemini(prompt: string, images: Array<{ data: string; mimeType: string }>) {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  // Add images first
  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data,
      },
    });
  }

  // Add text prompt
  parts.push({ text: prompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  return JSON.parse(text);
}

function extractBase64(dataUrl: string): { data: string; mimeType: string } {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  // If it's already raw base64, assume JPEG
  return { mimeType: 'image/jpeg', data: dataUrl };
}

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 }
    );
  }

  try {
    const body: AnalysisRequest = await request.json();
    const { beforeImages, afterImages, location, serviceTypes, rooms, mode } = body;

    if (mode === 'categorize') {
      // Analyze a single image to determine if it's before/during/after
      const images = [...beforeImages, ...afterImages].slice(0, 1);
      if (images.length === 0) {
        return NextResponse.json({ error: 'No images provided' }, { status: 400 });
      }

      const imageData = [extractBase64(images[0])];
      const prompt = `Analyze this construction/renovation photo. Determine if this is a "before" photo (showing the space before renovation - often dated, damaged, under demolition, bare studs, old fixtures) or an "after" photo (showing completed renovation - new finishes, clean, modern, staged).

Also provide a concise SEO-friendly alt text description (under 120 characters) describing what's visible.

Respond in this exact JSON format:
{
  "category": "before" or "after" or "during",
  "confidence": 0.0 to 1.0,
  "altText": "description of the image",
  "room": "kitchen" or "bathroom" or "bedroom" or "living room" or "basement" or "exterior" or "other",
  "details": "brief description of what you see"
}`;

      const result = await callGemini(prompt, imageData);
      return NextResponse.json({ analysis: result });
    }

    if (mode === 'compare') {
      // Compare before and after photos
      if (beforeImages.length === 0 || afterImages.length === 0) {
        return NextResponse.json(
          { error: 'Need at least one before and one after image' },
          { status: 400 }
        );
      }

      const imageData = [
        ...beforeImages.slice(0, 3).map(extractBase64),
        ...afterImages.slice(0, 3).map(extractBase64),
      ];

      const beforeCount = Math.min(beforeImages.length, 3);
      const afterCount = Math.min(afterImages.length, 3);

      const prompt = `You are analyzing a home renovation project for a general contractor's portfolio website.

The first ${beforeCount} image(s) are BEFORE photos (pre-renovation).
The next ${afterCount} image(s) are AFTER photos (post-renovation).

Location: ${location || 'New Jersey'}
Service types: ${serviceTypes.join(', ') || 'renovation'}
${rooms && rooms.length > 0 ? `Rooms: ${rooms.join(', ')}` : ''}

Compare the before and after photos carefully and generate portfolio content.

Respond in this exact JSON format:
{
  "title": "A compelling project title (e.g., 'Modern Kitchen Transformation in Montclair')",
  "challenge": "2-3 sentences describing what was wrong with the space before renovation. Be specific about what you see in the before photos - outdated fixtures, damage, layout issues, etc.",
  "solution": "2-3 sentences describing how La Vaca General Contractors transformed the space. Reference specific improvements visible in the after photos - new materials, better layout, modern finishes, etc.",
  "materialsUsed": ["List of materials you can identify in the after photos - e.g., Quartz Countertops, Porcelain Tile, etc."],
  "specialFeatures": ["List of notable features visible in the after photos - e.g., Kitchen Island, Walk-in Shower, etc."],
  "seoTitle": "SEO-optimized page title under 60 chars including location",
  "metaDescription": "SEO meta description under 155 chars with call to action",
  "roomAnalysis": [
    {
      "room": "room name",
      "beforeDescription": "What the room looked like before",
      "afterDescription": "What the room looks like after",
      "transformationSummary": "One sentence summary of the transformation"
    }
  ],
  "altTexts": {
    "before": ["SEO alt text for each before image (under 120 chars each)"],
    "after": ["SEO alt text for each after image (under 120 chars each)"]
  }
}

Be specific and reference what you actually see. Don't make up details that aren't visible in the photos. Use professional contractor language, not flowery marketing speak.`;

      const result: ProjectContent = await callGemini(prompt, imageData);
      return NextResponse.json({ content: result });
    }

    // Full analysis (default) - same as compare but with more detail
    if (mode === 'full' || !mode) {
      const hasBeforeImages = beforeImages.length > 0;
      const hasAfterImages = afterImages.length > 0;

      if (!hasBeforeImages && !hasAfterImages) {
        return NextResponse.json({ error: 'No images provided' }, { status: 400 });
      }

      const imageData = [
        ...beforeImages.slice(0, 3).map(extractBase64),
        ...afterImages.slice(0, 3).map(extractBase64),
      ];

      const beforeCount = Math.min(beforeImages.length, 3);
      const afterCount = Math.min(afterImages.length, 3);

      let imageContext = '';
      if (hasBeforeImages && hasAfterImages) {
        imageContext = `The first ${beforeCount} image(s) are BEFORE photos. The next ${afterCount} image(s) are AFTER photos.`;
      } else if (hasBeforeImages) {
        imageContext = `These ${beforeCount} image(s) are BEFORE photos (pre-renovation). Generate content based on what needs to be improved.`;
      } else {
        imageContext = `These ${afterCount} image(s) are AFTER photos (completed renovation). Generate content based on the finished work.`;
      }

      const prompt = `You are analyzing a home renovation project for La Vaca General Contractors' portfolio website.

${imageContext}

Location: ${location || 'New Jersey'}
Service types: ${serviceTypes.join(', ') || 'renovation'}
${rooms && rooms.length > 0 ? `Rooms: ${rooms.join(', ')}` : ''}

Generate professional portfolio content based on what you see in the photos.

Respond in this exact JSON format:
{
  "title": "A compelling project title including the city/town name",
  "challenge": "2-3 sentences describing the challenges or issues visible in the before state",
  "solution": "2-3 sentences describing the renovation solution and improvements",
  "materialsUsed": ["Materials identified in photos"],
  "specialFeatures": ["Notable features identified"],
  "seoTitle": "SEO title under 60 chars",
  "metaDescription": "Meta description under 155 chars with CTA",
  "altTexts": {
    "before": ["Alt text for each before image"],
    "after": ["Alt text for each after image"]
  }
}

Be specific about what you see. Use professional contractor language.`;

      const result = await callGemini(prompt, imageData);
      return NextResponse.json({ content: result });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (error) {
    console.error('Project analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}

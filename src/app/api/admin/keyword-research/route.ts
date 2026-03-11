import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;

interface KeywordResult {
  keyword: string;
  source: 'autocomplete' | 'related' | 'ai';
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  competitiveness: 'low' | 'medium' | 'high';
  relevance: number; // 0-100
}

interface KeywordResearchResponse {
  primaryKeyword: string;
  keywords: KeywordResult[];
  suggestedTitle: string;
  suggestedMetaDescription: string;
  suggestedSlug: string;
  titleVariations: string[];
  searchInsights: string[];
}

// Google Autocomplete API (free, no key needed)
async function getGoogleSuggestions(query: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return (data[1] || []).slice(0, 10);
  } catch {
    return [];
  }
}

// Get keyword ideas from multiple seed queries
// Falls back to broader geo (state) if local town returns nothing
async function getKeywordIdeas(
  serviceTypes: string[],
  location: string
): Promise<string[]> {
  const allSuggestions: string[] = [];
  
  // Build location variants: exact → state
  const locationVariants = [location];
  // Extract state if location has comma (e.g., "Rochelle Park, NJ")
  const parts = location.split(',').map(p => p.trim());
  if (parts.length > 1) {
    locationVariants.push(parts[1]); // state abbreviation
  }
  // Always add "new jersey" and "nj" as fallbacks
  if (!location.toLowerCase().includes('new jersey')) {
    locationVariants.push('New Jersey');
    locationVariants.push('NJ');
  }

  const buildQueries = (loc: string) => [
    ...serviceTypes.map(s => `${s} ${loc}`),
    ...serviceTypes.map(s => `${s} contractor ${loc}`),
    ...serviceTypes.map(s => `${s} cost ${loc}`),
    ...serviceTypes.map(s => `${s} near me`),
    ...serviceTypes.map(s => `${s} before and after`),
    ...serviceTypes.map(s => `how much does ${s} cost`),
    `best contractor ${loc}`,
    `home renovation ${loc}`,
  ];

  // Try each location variant until we get results
  for (const loc of locationVariants) {
    const queries = buildQueries(loc).slice(0, 8);
    const results = await Promise.all(queries.map(q => getGoogleSuggestions(q)));
    
    for (const suggestions of results) {
      allSuggestions.push(...suggestions);
    }

    // If we got enough results, stop
    if (allSuggestions.length >= 5) break;
  }

  // If still empty, try just the service types without location
  if (allSuggestions.length === 0) {
    const genericQueries = serviceTypes.flatMap(s => [
      `${s} contractor near me`,
      `${s} cost`,
      `${s} ideas`,
      `${s} before and after`,
    ]).slice(0, 6);
    
    const results = await Promise.all(genericQueries.map(q => getGoogleSuggestions(q)));
    for (const suggestions of results) {
      allSuggestions.push(...suggestions);
    }
  }

  // Deduplicate
  return [...new Set(allSuggestions)];
}

// Use Gemini to analyze keywords and generate optimized SEO content
async function analyzeWithGemini(
  keywords: string[],
  serviceTypes: string[],
  location: string,
  projectTitle: string,
  challenge: string,
  solution: string,
  materials: string[],
  features: string[]
): Promise<KeywordResearchResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const prompt = `You are an SEO expert specializing in home renovation contractor websites in New Jersey.

I have a portfolio project page for "La Vaca General Contractors" with these details:
- Service types: ${serviceTypes.join(', ')}
- Location: ${location}
- Project title: ${projectTitle}
- Challenge: ${challenge || 'Not provided'}
- Solution: ${solution || 'Not provided'}
- Materials: ${materials.join(', ') || 'Not specified'}
- Features: ${features.join(', ') || 'Not specified'}

Here are real Google autocomplete suggestions people are searching for:
${keywords.map((k, i) => `${i + 1}. "${k}"`).join('\n')}

Based on REAL search patterns above, generate optimized SEO content. The title and description must target terms people are ACTUALLY searching.

Respond in this exact JSON format:
{
  "primaryKeyword": "the single best keyword to target (from the autocomplete data)",
  "keywords": [
    {
      "keyword": "exact keyword phrase",
      "source": "autocomplete",
      "searchIntent": "commercial" or "transactional" or "informational" or "navigational",
      "competitiveness": "low" or "medium" or "high",
      "relevance": 0-100
    }
  ],
  "suggestedTitle": "SEO title under 60 chars that includes the primary keyword naturally. Must include the city/town. Format: [Service] in [City] | Before & After | La Vaca GC",
  "suggestedMetaDescription": "Meta description under 155 chars with CTA. Must reference the transformation and include a call to action like 'See the transformation' or 'Get a free estimate'. Include phone: (201) 614-2814",
  "suggestedSlug": "url-friendly-slug-with-keywords",
  "titleVariations": [
    "3-5 alternative title options targeting different keywords from the list, each under 60 chars"
  ],
  "searchInsights": [
    "2-3 brief insights about what people in this area are searching for based on the autocomplete data"
  ]
}

Rules:
- Only include keywords with relevance > 40
- Rank by relevance (most relevant first)
- The suggested title MUST contain at least one real autocomplete keyword
- Make the meta description compelling and action-oriented
- Include the city name in the slug
- Title variations should target different search intents (cost, before/after, best, near me)`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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
  if (!text) throw new Error('Empty Gemini response');

  return JSON.parse(text);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serviceTypes, location, projectTitle, challenge, solution, materials, features } = body;

    if (!serviceTypes?.length || !location) {
      return NextResponse.json(
        { error: 'Service types and location are required' },
        { status: 400 }
      );
    }

    // Step 1: Get real Google autocomplete data
    const rawKeywords = await getKeywordIdeas(serviceTypes, location);

    if (rawKeywords.length === 0) {
      return NextResponse.json(
        { error: 'Could not fetch keyword suggestions. Try again.' },
        { status: 500 }
      );
    }

    // Step 2: Analyze with Gemini and generate SEO content
    const result = await analyzeWithGemini(
      rawKeywords,
      serviceTypes,
      location,
      projectTitle || '',
      challenge || '',
      solution || '',
      materials || [],
      features || []
    );

    return NextResponse.json({
      ...result,
      rawSuggestions: rawKeywords,
    });
  } catch (error) {
    console.error('Keyword research error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Research failed' },
      { status: 500 }
    );
  }
}

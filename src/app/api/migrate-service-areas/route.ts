import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Temporary migration endpoint - DELETE after running once
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  
  if (secret !== 'migrate-2026-02-17') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Step 1: Check current columns
  const { data: existing } = await supabase
    .from('service_areas')
    .select('*')
    .limit(1);

  // Check if columns already exist
  const hasSlug = existing && existing[0] && 'slug' in existing[0];
  
  if (hasSlug) {
    return NextResponse.json({ message: 'Migration already applied', existing: existing[0] });
  }

  return NextResponse.json({ 
    message: 'Schema migration needed. Run this SQL in Supabase Dashboard SQL Editor:',
    sql: `
-- Add new columns to service_areas
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS neighborhood_features JSONB DEFAULT '[]'::jsonb;
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS expertise_cards JSONB DEFAULT '[]'::jsonb;

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_service_areas_slug ON service_areas(slug);
    `,
    step2: 'After running the SQL, call this endpoint again with ?secret=migrate-2026-02-17&seed=true to populate data'
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  
  if (secret !== 'migrate-2026-02-17') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  // First, clean up duplicates — keep only one per name
  const { data: allAreas } = await supabase
    .from('service_areas')
    .select('id, name')
    .order('created_at', { ascending: true });

  if (allAreas) {
    const seen = new Map<string, string>();
    const dupeIds: string[] = [];
    for (const area of allAreas) {
      if (seen.has(area.name)) {
        dupeIds.push(area.id);
      } else {
        seen.set(area.name, area.id);
      }
    }
    if (dupeIds.length > 0) {
      await supabase.from('service_areas').delete().in('id', dupeIds);
    }
  }

  // City content to seed
  const cityContent: Record<string, { name: string; neighborhoodFeatures: string[]; expertiseCards: { title: string; description: string }[] }> = {
    'alpine': {
      name: 'Alpine',
      neighborhoodFeatures: [
        "Historic estates and modern luxury homes",
        "Strict architectural guidelines",
        "Premium material requirements",
        "High-end finish expectations",
        "Excellent return on investment"
      ],
      expertiseCards: [
        { title: "Alpine Estate Expertise", description: "Specialized knowledge of Alpine's luxury estate requirements, architectural review boards, and exclusive community standards for high-end renovations." },
        { title: "Luxury Materials & Finishes", description: "Access to the finest imported materials, custom millwork, and premium finishes that meet Alpine's discerning standards and HOA requirements." }
      ]
    },
    'short-hills': {
      name: 'Short Hills',
      neighborhoodFeatures: [
        "Historic Tudor and Colonial architecture",
        "High property values requiring quality finishes",
        "Strong demand for modern amenities",
        "Excellent school district driving home values",
        "Strict township regulations"
      ],
      expertiseCards: [
        { title: "Short Hills Architectural Expertise", description: "Deep understanding of Short Hills' diverse architectural styles, from historic Tudors to contemporary designs, ensuring seamless renovations." },
        { title: "Premium Material Selection", description: "Curated selection of high-end materials and finishes that complement Short Hills' luxury market expectations." }
      ]
    },
    'saddle-river': {
      name: 'Saddle River',
      neighborhoodFeatures: [
        "Sprawling estate properties",
        "Equestrian-friendly community",
        "Minimum lot size requirements",
        "Prestigious neighborhood standards",
        "Private, secluded settings"
      ],
      expertiseCards: [
        { title: "Saddle River Estate Specialists", description: "Expert knowledge of Saddle River's unique estate requirements and zoning regulations for luxury property renovations." },
        { title: "Custom Estate Features", description: "Specialized in high-end amenities including home theaters, wine cellars, and indoor pools that Saddle River homeowners expect." }
      ]
    },
    'bloomfield': {
      name: 'Bloomfield',
      neighborhoodFeatures: [
        "Diverse historic housing stock from Victorians to Cape Cods",
        "Neighborhoods like Brookdale and Watsessing with distinct character",
        "Competitive $400K average home values with strong renovation ROI",
        "Mix of original architectural details worth preserving",
        "Convenient online permit applications through township"
      ],
      expertiseCards: [
        { title: "Historic Home Modernization", description: "Expertise updating Bloomfield's diverse Victorian, Colonial, and Cape Cod homes while preserving original character and architectural details." },
        { title: "Value-Driven Renovations", description: "Strategic improvements that maximize equity in Bloomfield's competitive $400K market, delivering measurable ROI for neighborhood comparables." }
      ]
    },
    'caldwell': {
      name: 'Caldwell',
      neighborhoodFeatures: [
        "Historic borough with Grover Cleveland birthplace heritage",
        "Preservation guidelines near downtown core",
        "$550K average home values in family-oriented community",
        "Mix of historic and updated homes requiring sensitive renovations",
        "Efficient 7-14 day permit processing times"
      ],
      expertiseCards: [
        { title: "Historic Preservation Compliance", description: "Navigate Caldwell's historic preservation guidelines with expertise in period-appropriate renovations that respect the borough's Grover Cleveland-era character." },
        { title: "System Modernization", description: "Specialize in updating electrical, plumbing, and HVAC in Caldwell's older homes while maintaining exterior charm and historic integrity." }
      ]
    },
    'clifton': {
      name: 'Clifton',
      neighborhoodFeatures: [
        "Large diverse city with established neighborhoods like Athenia and Richfield",
        "Fast 5-10 day permit processing—among quickest in the region",
        "$450K average home values with excellent renovation potential",
        "Passaic County's largest city with varied housing types",
        "Convenient highway access attracting buyers seeking updated homes"
      ],
      expertiseCards: [
        { title: "Streamlined Project Execution", description: "Leverage Clifton's fast permit processing to complete renovations efficiently across all neighborhoods from Athenia to Montclair Heights." },
        { title: "Energy-Efficient Modernization", description: "Update Clifton's older housing stock with modern kitchens, bathrooms, and energy-efficient systems that reduce costs and increase marketability." }
      ]
    },
    'essex-fells': {
      name: 'Essex Fells',
      neighborhoodFeatures: [
        "Exclusive $1.7M average home values on wooded estate lots",
        "Strict tree preservation ordinances protecting natural character",
        "Custom homes requiring sophisticated renovation approaches",
        "Small borough with just 2,100 residents and high standards",
        "Careful zoning requirements for additions and modifications"
      ],
      expertiseCards: [
        { title: "Estate Property Expertise", description: "Specialized knowledge of Essex Fells' tree preservation ordinances, working with arborists to plan renovations around protected specimens on wooded lots." },
        { title: "Luxury Custom Renovations", description: "Tailored renovations for Essex Fells' custom homes, respecting natural settings while incorporating high-end finishes and modern amenities." }
      ]
    },
    'ho-ho-kus': {
      name: 'Ho-Ho-Kus',
      neighborhoodFeatures: [
        "Quaint borough known for tree-lined streets and historic charm",
        "$800K average home values with architectural character",
        "Strict guidelines preserving historic neighborhood aesthetics",
        "Bergen County location with strong community identity",
        "Renovations must respect streetscape and architectural continuity"
      ],
      expertiseCards: [
        { title: "Historic Character Preservation", description: "Expert renovations that comply with Ho-Ho-Kus architectural guidelines while updating interiors with modern functionality and premium finishes." },
        { title: "Seamless Period Integration", description: "Blend modern kitchens, bathrooms, and systems into Ho-Ho-Kus historic homes without compromising the streetscape charm that defines the borough." }
      ]
    },
    'livingston': {
      name: 'Livingston',
      neighborhoodFeatures: [
        "Family-friendly township with top-rated school system",
        "$700K average home values driven by education quality",
        "Neighborhoods from Livingston Center to Riker Hill",
        "High demand for functional family spaces and home offices",
        "Online permit applications and efficient processing"
      ],
      expertiseCards: [
        { title: "Family-Focused Renovations", description: "Design practical spaces Livingston families need—expanded kitchens for entertaining, finished basements for play areas, home offices, and mudrooms." },
        { title: "School District Investment", description: "Strategic renovations that capitalize on Livingston's excellent schools, maximizing home value for families investing in this top-rated district." }
      ]
    },
    'madison': {
      name: 'Madison',
      neighborhoodFeatures: [
        "Known as 'Rose City' with charming historic downtown",
        "$750K average home values in Morris County location",
        "Diverse architecture from Colonials to contemporary",
        "Historic Preservation review in designated districts",
        "Top-rated schools attracting families seeking quality homes"
      ],
      expertiseCards: [
        { title: "Rose City Architectural Expertise", description: "Navigate Madison's diverse architectural styles and historic preservation requirements while delivering renovations that enhance Rose City's distinctive character." },
        { title: "Family-Oriented Upgrades", description: "Create spaces that leverage Madison's top schools and community—larger kitchens, additional bathrooms, finished basements—maximizing family appeal." }
      ]
    },
    'maplewood': {
      name: 'Maplewood',
      neighborhoodFeatures: [
        "Vibrant arts scene with diverse community and charming village center",
        "Multiple historic districts requiring commission review",
        "$600K average home values in competitive Essex County market",
        "Housing ranges from Victorian to mid-century modern",
        "Strong demand for character-preserving renovations"
      ],
      expertiseCards: [
        { title: "Historic District Expertise", description: "Navigate Maplewood's multiple historic districts and Historic Commission review process while preserving the architectural character that makes each neighborhood unique." },
        { title: "Period-Appropriate Modernization", description: "Update Victorian, Colonial, and mid-century homes with modern kitchens and bathrooms while respecting original details and Maplewood's artistic character." }
      ]
    },
    'millburn': {
      name: 'Millburn',
      neighborhoodFeatures: [
        "Includes Short Hills with $900K+ average home values",
        "Excellent school district driving strong real estate demand",
        "Diverse neighborhoods from Wyoming to Old Short Hills",
        "Same permit process as Short Hills through township",
        "High expectations for quality finishes and craftsmanship"
      ],
      expertiseCards: [
        { title: "Millburn Township Specialists", description: "Deep expertise with Millburn's diverse neighborhoods and township permit requirements, ensuring smooth approvals for renovations across all areas." },
        { title: "Quality-Driven Renovations", description: "Premium materials and skilled craftsmanship meeting Millburn homeowners' high standards, with focus on ROI in this competitive $900K+ market." }
      ]
    },
    'montclair': {
      name: 'Montclair',
      neighborhoodFeatures: [
        "Vibrant Essex County township with arts, culture, and diverse neighborhoods",
        "Multiple historic districts from Upper Montclair to Montclair Heights",
        "$650K average home values with competitive market dynamics",
        "Housing from Victorian mansions to contemporary updates",
        "Historic Preservation Commission review for designated areas"
      ],
      expertiseCards: [
        { title: "Multi-District Expertise", description: "Navigate Montclair's various neighborhoods and Historic Preservation requirements, from Upper Montclair estates to South Montclair homes." },
        { title: "Character-Conscious Modernization", description: "Blend modern kitchens and bathrooms into Montclair's diverse housing stock while preserving the original details and artistic character defining each area." }
      ]
    },
    'morristown': {
      name: 'Morristown',
      neighborhoodFeatures: [
        "Historic Morris County seat with Revolutionary War heritage",
        "$550K average home values in walkable downtown location",
        "Historic District requiring architectural review",
        "Mix of historic homes, condos, and townhomes",
        "Strong demand balancing preservation with modern updates"
      ],
      expertiseCards: [
        { title: "Historic District Navigation", description: "Expert guidance through Morristown Historic District architectural review, preserving Revolutionary War-era character while modernizing interiors." },
        { title: "Multi-Unit Expertise", description: "Handle renovations for Morristown's single-family homes, condos, and townhomes, coordinating with HOAs while delivering quality craftsmanship." }
      ]
    },
    'parsippany': {
      name: 'Parsippany',
      neighborhoodFeatures: [
        "Large Morris County township with corporate headquarters presence",
        "Neighborhoods from Lake Hiawatha to Troy Hills",
        "$500K average home values with strong professional buyer demand",
        "Online permit applications and efficient processing",
        "Diverse housing requiring tailored renovation approaches"
      ],
      expertiseCards: [
        { title: "Corporate Market Expertise", description: "Renovations appealing to Parsippany's professional demographic, with focus on quality finishes and modern amenities that corporate relocations expect." },
        { title: "Multi-Neighborhood Knowledge", description: "Tailored approaches for Parsippany's distinct neighborhoods from Lake Hiawatha waterfront to Troy Hills estates, understanding each area's unique character." }
      ]
    },
    'verona': {
      name: 'Verona',
      neighborhoodFeatures: [
        "Charming borough known for small-town feel and excellent schools",
        "$650K average home values with strong family appeal",
        "Efficient 7-10 day permit processing—among fastest in Essex County",
        "Neighborhoods from Verona Center to Forest Avenue",
        "Rising property values making renovations excellent investments"
      ],
      expertiseCards: [
        { title: "Fast-Track Project Execution", description: "Leverage Verona's efficient 7-10 day permit processing to move quickly from planning to construction, minimizing disruption for busy families." },
        { title: "Value Maximization Strategy", description: "Strategic renovations capitalizing on Verona's rising $650K market, with focus on kitchen and bathroom updates delivering strong ROI." }
      ]
    },
    'west-caldwell': {
      name: 'West Caldwell',
      neighborhoodFeatures: [
        "Suburban Essex County township with excellent schools and NYC commute",
        "$600K average home values attracting professional families",
        "Distinct from Caldwell Borough despite sharing 07006 zip code",
        "Family-oriented neighborhoods valuing functional spaces",
        "Strong demand for home offices and finished basements"
      ],
      expertiseCards: [
        { title: "Suburban Family Renovations", description: "Design functional spaces West Caldwell families need—expanded kitchens, home offices for commuters, finished basements, and additional bathrooms." },
        { title: "Professional Household Solutions", description: "Renovations meeting needs of West Caldwell's professional families, balancing work-from-home functionality with family living and entertaining spaces." }
      ]
    },
    'west-orange': {
      name: 'West Orange',
      neighborhoodFeatures: [
        "Historic township home to Thomas Edison's laboratory and Llewellyn Park",
        "$500K average home values with diverse neighborhoods",
        "Llewellyn Park private community with additional architectural requirements",
        "Neighborhoods from Pleasantdale to Rock Spring with varied character",
        "Mix of historic preservation and modern renovation needs"
      ],
      expertiseCards: [
        { title: "Llewellyn Park Specialists", description: "Navigate America's first planned community with expertise in Llewellyn Park Association requirements and historic architectural guidelines." },
        { title: "Historic Modernization", description: "Update West Orange's diverse housing stock while preserving period details, from Thomas Edison-era homes to mid-century properties across all neighborhoods." }
      ]
    }
  };

  const results: string[] = [];

  for (const [slug, content] of Object.entries(cityContent)) {
    // Find existing record by name
    const { data: existing } = await supabase
      .from('service_areas')
      .select('id')
      .eq('name', content.name)
      .limit(1)
      .single();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('service_areas')
        .update({
          slug,
          neighborhood_features: content.neighborhoodFeatures,
          expertise_cards: content.expertiseCards,
          has_page: true,
          active: true
        })
        .eq('id', existing.id);

      if (error) {
        results.push(`${slug}: UPDATE FAILED - ${error.message}`);
      } else {
        results.push(`${slug}: UPDATED`);
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('service_areas')
        .insert({
          name: content.name,
          slug,
          neighborhood_features: content.neighborhoodFeatures,
          expertise_cards: content.expertiseCards,
          has_page: true,
          active: true,
          sort_order: Object.keys(cityContent).indexOf(slug) + 1
        });

      if (error) {
        results.push(`${slug}: INSERT FAILED - ${error.message}`);
      } else {
        results.push(`${slug}: INSERTED`);
      }
    }
  }

  return NextResponse.json({ results });
}

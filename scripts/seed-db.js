// Run with: cd lavacagc-nextjs && node -e "require('./scripts/seed-db.js')"
// or: cd lavacagc-nextjs && node scripts/seed-db.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const newCities = [
  {
    name: "Bloomfield", slug: "bloomfield", active: true, has_page: true, sort_order: 100,
    description: "Historic Essex County township with diverse neighborhoods",
    neighborhood_features: ["Diverse historic housing stock from Victorians to Cape Cods","Neighborhoods like Brookdale and Watsessing with distinct character","Competitive $400K average home values with strong renovation ROI","Mix of original architectural details worth preserving","Convenient online permit applications through township"],
    expertise_cards: [{"title":"Historic Home Modernization","description":"Expertise updating Bloomfield's diverse Victorian, Colonial, and Cape Cod homes while preserving original character and architectural details."},{"title":"Value-Driven Renovations","description":"Strategic improvements that maximize equity in Bloomfield's competitive $400K market, delivering measurable ROI for neighborhood comparables."}]
  },
  {
    name: "Clifton", slug: "clifton", active: true, has_page: true, sort_order: 101,
    description: "Diverse Passaic County city with established neighborhoods",
    neighborhood_features: ["Large diverse city with established neighborhoods like Athenia and Richfield","Fast 5-10 day permit processing—among quickest in the region","$450K average home values with excellent renovation potential","Passaic County's largest city with varied housing types","Convenient highway access attracting buyers seeking updated homes"],
    expertise_cards: [{"title":"Streamlined Project Execution","description":"Leverage Clifton's fast permit processing to complete renovations efficiently across all neighborhoods from Athenia to Montclair Heights."},{"title":"Energy-Efficient Modernization","description":"Update Clifton's older housing stock with modern kitchens, bathrooms, and energy-efficient systems that reduce costs and increase marketability."}]
  },
  {
    name: "Maplewood", slug: "maplewood", active: true, has_page: true, sort_order: 102,
    description: "Vibrant Essex County township with arts scene and diverse community",
    neighborhood_features: ["Vibrant arts scene with diverse community and charming village center","Multiple historic districts requiring commission review","$600K average home values in competitive Essex County market","Housing ranges from Victorian to mid-century modern","Strong demand for character-preserving renovations"],
    expertise_cards: [{"title":"Historic District Expertise","description":"Navigate Maplewood's multiple historic districts and Historic Commission review process while preserving the architectural character that makes each neighborhood unique."},{"title":"Period-Appropriate Modernization","description":"Update Victorian, Colonial, and mid-century homes with modern kitchens and bathrooms while respecting original details and Maplewood's artistic character."}]
  },
  {
    name: "Parsippany", slug: "parsippany", active: true, has_page: true, sort_order: 103,
    description: "Major Morris County township with diverse housing and corporate HQs",
    neighborhood_features: ["Large Morris County township with corporate headquarters presence","Neighborhoods from Lake Hiawatha to Troy Hills","$500K average home values with strong professional buyer demand","Online permit applications and efficient processing","Diverse housing requiring tailored renovation approaches"],
    expertise_cards: [{"title":"Corporate Market Expertise","description":"Renovations appealing to Parsippany's professional demographic, with focus on quality finishes and modern amenities that corporate relocations expect."},{"title":"Multi-Neighborhood Knowledge","description":"Tailored approaches for Parsippany's distinct neighborhoods from Lake Hiawatha waterfront to Troy Hills estates, understanding each area's unique character."}]
  },
  {
    name: "West Caldwell", slug: "west-caldwell", active: true, has_page: true, sort_order: 104,
    description: "Suburban Essex County township with excellent schools",
    neighborhood_features: ["Suburban Essex County township with excellent schools and NYC commute","$600K average home values attracting professional families","Distinct from Caldwell Borough despite sharing 07006 zip code","Family-oriented neighborhoods valuing functional spaces","Strong demand for home offices and finished basements"],
    expertise_cards: [{"title":"Suburban Family Renovations","description":"Design functional spaces West Caldwell families need—expanded kitchens, home offices for commuters, finished basements, and additional bathrooms."},{"title":"Professional Household Solutions","description":"Renovations meeting needs of West Caldwell's professional families, balancing work-from-home functionality with family living and entertaining spaces."}]
  }
];

async function main() {
  // Try insert
  for (const city of newCities) {
    const { error } = await supabase.from('service_areas').insert(city);
    if (error) {
      console.log(`INSERT ${city.slug} failed (${error.code}): ${error.message}`);
      // If RLS blocks insert, try upsert
      const { error: upsertErr } = await supabase.from('service_areas').upsert(city, { onConflict: 'slug' });
      if (upsertErr) {
        console.log(`  UPSERT also failed: ${upsertErr.message}`);
      } else {
        console.log(`  UPSERT ${city.slug} OK`);
      }
    } else {
      console.log(`INSERT ${city.slug} OK`);
    }
  }
}

main().catch(console.error);

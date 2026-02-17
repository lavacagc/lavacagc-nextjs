#!/bin/bash
# Seed neighborhood_features and expertise_cards into Supabase service_areas table

SUPABASE_URL="https://xrvbrnrbnyfdwkfdoepq.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10"

update_city() {
  local slug="$1"
  local data="$2"
  echo -n "Updating $slug... "
  local status=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
    "$SUPABASE_URL/rest/v1/service_areas?slug=eq.$slug" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$data")
  echo "$status"
}

create_city() {
  local data="$1"
  local name=$(echo "$data" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
  echo -n "Creating $name... "
  local status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$SUPABASE_URL/rest/v1/service_areas" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$data")
  echo "$status"
}

echo "=== Updating existing cities ==="

# Alpine
update_city "alpine" '{
  "neighborhood_features": ["Historic estates and modern luxury homes","Strict architectural guidelines","Premium material requirements","High-end finish expectations","Excellent return on investment"],
  "expertise_cards": [{"title":"Alpine Estate Expertise","description":"Specialized knowledge of Alpine'\''s luxury estate requirements, architectural review boards, and exclusive community standards for high-end renovations."},{"title":"Luxury Materials & Finishes","description":"Access to the finest imported materials, custom millwork, and premium finishes that meet Alpine'\''s discerning standards and HOA requirements."},{"title":"Maximum Investment Returns","description":"Strategic renovations designed to maximize property values in Alpine'\''s exclusive $2M+ market, with proven ROI for luxury homeowners."}]
}'

# Short Hills
update_city "short-hills" '{
  "neighborhood_features": ["Historic Tudor and Colonial architecture","High property values requiring quality finishes","Strong demand for modern amenities","Excellent school district driving home values","Strict township regulations"],
  "expertise_cards": [{"title":"Short Hills Architectural Expertise","description":"Deep understanding of Short Hills'\'' diverse architectural styles, from historic Tudors to contemporary designs, ensuring seamless renovations."},{"title":"Premium Material Selection","description":"Curated selection of high-end materials and finishes that complement Short Hills'\'' luxury market expectations."},{"title":"Value-Adding Renovations","description":"Strategic improvements that maximize ROI in Short Hills'\'' competitive real estate market, with average home values exceeding $1.5M."}]
}'

# Saddle River
update_city "saddle-river" '{
  "neighborhood_features": ["Sprawling estate properties","Equestrian-friendly community","Minimum lot size requirements","Prestigious neighborhood standards","Private, secluded settings"],
  "expertise_cards": [{"title":"Saddle River Estate Specialists","description":"Expert knowledge of Saddle River'\''s unique estate requirements and zoning regulations for luxury property renovations."},{"title":"Custom Estate Features","description":"Specialized in high-end amenities including home theaters, wine cellars, and indoor pools that Saddle River homeowners expect."},{"title":"Privacy-Focused Design","description":"Renovations designed to enhance privacy and exclusivity while maintaining the natural beauty of Saddle River properties."}]
}'

# Caldwell
update_city "caldwell" '{
  "neighborhood_features": ["Historic borough with Grover Cleveland birthplace heritage","Preservation guidelines near downtown core","$550K average home values in family-oriented community","Mix of historic and updated homes requiring sensitive renovations","Efficient 7-14 day permit processing times"],
  "expertise_cards": [{"title":"Historic Preservation Compliance","description":"Navigate Caldwell'\''s historic preservation guidelines with expertise in period-appropriate renovations that respect the borough'\''s Grover Cleveland-era character."},{"title":"System Modernization","description":"Specialize in updating electrical, plumbing, and HVAC in Caldwell'\''s older homes while maintaining exterior charm and historic integrity."}]
}'

# Essex Fells
update_city "essex-fells" '{
  "neighborhood_features": ["Exclusive $1.7M average home values on wooded estate lots","Strict tree preservation ordinances protecting natural character","Custom homes requiring sophisticated renovation approaches","Small borough with just 2,100 residents and high standards","Careful zoning requirements for additions and modifications"],
  "expertise_cards": [{"title":"Estate Property Expertise","description":"Specialized knowledge of Essex Fells'\'' tree preservation ordinances, working with arborists to plan renovations around protected specimens on wooded lots."},{"title":"Luxury Custom Renovations","description":"Tailored renovations for Essex Fells'\'' custom homes, respecting natural settings while incorporating high-end finishes and modern amenities."}]
}'

# Ho-Ho-Kus
update_city "ho-ho-kus" '{
  "neighborhood_features": ["Quaint borough known for tree-lined streets and historic charm","$800K average home values with architectural character","Strict guidelines preserving historic neighborhood aesthetics","Bergen County location with strong community identity","Renovations must respect streetscape and architectural continuity"],
  "expertise_cards": [{"title":"Historic Character Preservation","description":"Expert renovations that comply with Ho-Ho-Kus architectural guidelines while updating interiors with modern functionality and premium finishes."},{"title":"Seamless Period Integration","description":"Blend modern kitchens, bathrooms, and systems into Ho-Ho-Kus historic homes without compromising the streetscape charm that defines the borough."}]
}'

# Livingston
update_city "livingston" '{
  "neighborhood_features": ["Family-friendly township with top-rated school system","$700K average home values driven by education quality","Neighborhoods from Livingston Center to Riker Hill","High demand for functional family spaces and home offices","Online permit applications and efficient processing"],
  "expertise_cards": [{"title":"Family-Focused Renovations","description":"Design practical spaces Livingston families need—expanded kitchens for entertaining, finished basements for play areas, home offices, and mudrooms."},{"title":"School District Investment","description":"Strategic renovations that capitalize on Livingston'\''s excellent schools, maximizing home value for families investing in this top-rated district."}]
}'

# Madison
update_city "madison" '{
  "neighborhood_features": ["Known as '\''Rose City'\'' with charming historic downtown","$750K average home values in Morris County location","Diverse architecture from Colonials to contemporary","Historic Preservation review in designated districts","Top-rated schools attracting families seeking quality homes"],
  "expertise_cards": [{"title":"Rose City Architectural Expertise","description":"Navigate Madison'\''s diverse architectural styles and historic preservation requirements while delivering renovations that enhance Rose City'\''s distinctive character."},{"title":"Family-Oriented Upgrades","description":"Create spaces that leverage Madison'\''s top schools and community—larger kitchens, additional bathrooms, finished basements—maximizing family appeal."}]
}'

# Millburn
update_city "millburn" '{
  "neighborhood_features": ["Includes Short Hills with $900K+ average home values","Excellent school district driving strong real estate demand","Diverse neighborhoods from Wyoming to Old Short Hills","Same permit process as Short Hills through township","High expectations for quality finishes and craftsmanship"],
  "expertise_cards": [{"title":"Millburn Township Specialists","description":"Deep expertise with Millburn'\''s diverse neighborhoods and township permit requirements, ensuring smooth approvals for renovations across all areas."},{"title":"Quality-Driven Renovations","description":"Premium materials and skilled craftsmanship meeting Millburn homeowners'\'' high standards, with focus on ROI in this competitive $900K+ market."}]
}'

# Montclair
update_city "montclair" '{
  "neighborhood_features": ["Vibrant Essex County township with arts, culture, and diverse neighborhoods","Multiple historic districts from Upper Montclair to Montclair Heights","$650K average home values with competitive market dynamics","Housing from Victorian mansions to contemporary updates","Historic Preservation Commission review for designated areas"],
  "expertise_cards": [{"title":"Multi-District Expertise","description":"Navigate Montclair'\''s various neighborhoods and Historic Preservation requirements, from Upper Montclair estates to South Montclair homes."},{"title":"Character-Conscious Modernization","description":"Blend modern kitchens and bathrooms into Montclair'\''s diverse housing stock while preserving the original details and artistic character defining each area."}]
}'

# Morristown
update_city "morristown" '{
  "neighborhood_features": ["Historic Morris County seat with Revolutionary War heritage","$550K average home values in walkable downtown location","Historic District requiring architectural review","Mix of historic homes, condos, and townhomes","Strong demand balancing preservation with modern updates"],
  "expertise_cards": [{"title":"Historic District Navigation","description":"Expert guidance through Morristown Historic District architectural review, preserving Revolutionary War-era character while modernizing interiors."},{"title":"Multi-Unit Expertise","description":"Handle renovations for Morristown'\''s single-family homes, condos, and townhomes, coordinating with HOAs while delivering quality craftsmanship."}]
}'

# Verona
update_city "verona" '{
  "neighborhood_features": ["Charming borough known for small-town feel and excellent schools","$650K average home values with strong family appeal","Efficient 7-10 day permit processing—among fastest in Essex County","Neighborhoods from Verona Center to Forest Avenue","Rising property values making renovations excellent investments"],
  "expertise_cards": [{"title":"Fast-Track Project Execution","description":"Leverage Verona'\''s efficient 7-10 day permit processing to move quickly from planning to construction, minimizing disruption for busy families."},{"title":"Value Maximization Strategy","description":"Strategic renovations capitalizing on Verona'\''s rising $650K market, with focus on kitchen and bathroom updates delivering strong ROI."}]
}'

# West Orange
update_city "west-orange" '{
  "neighborhood_features": ["Historic township home to Thomas Edison'\''s laboratory and Llewellyn Park","$500K average home values with diverse neighborhoods","Llewellyn Park private community with additional architectural requirements","Neighborhoods from Pleasantdale to Rock Spring with varied character","Mix of historic preservation and modern renovation needs"],
  "expertise_cards": [{"title":"Llewellyn Park Specialists","description":"Navigate America'\''s first planned community with expertise in Llewellyn Park Association requirements and historic architectural guidelines."},{"title":"Historic Modernization","description":"Update West Orange'\''s diverse housing stock while preserving period details, from Thomas Edison-era homes to mid-century properties across all neighborhoods."}]
}'

# Summit (no CITY_CONTENT, use DEFAULT_CONTENT)
update_city "summit" '{
  "neighborhood_features": ["Established residential community","Quality construction standards","Growing property values","Family-oriented neighborhood","Convenient local amenities"],
  "expertise_cards": [{"title":"Local Expertise","description":"Deep understanding of local building codes, permit requirements, and neighborhood standards for successful renovations."},{"title":"Quality Craftsmanship","description":"Premium materials and skilled craftsmanship that meet the high standards expected in your community."},{"title":"Investment Value","description":"Strategic renovations designed to maximize property value and provide excellent return on investment."}]
}'

# Florham Park (no CITY_CONTENT, use DEFAULT_CONTENT)
update_city "florham-park" '{
  "neighborhood_features": ["Established residential community","Quality construction standards","Growing property values","Family-oriented neighborhood","Convenient local amenities"],
  "expertise_cards": [{"title":"Local Expertise","description":"Deep understanding of local building codes, permit requirements, and neighborhood standards for successful renovations."},{"title":"Quality Craftsmanship","description":"Premium materials and skilled craftsmanship that meet the high standards expected in your community."},{"title":"Investment Value","description":"Strategic renovations designed to maximize property value and provide excellent return on investment."}]
}'

# Chatham (no CITY_CONTENT in source, use DEFAULT_CONTENT — it already exists in DB)
update_city "chatham" '{
  "neighborhood_features": ["Established residential community","Quality construction standards","Growing property values","Family-oriented neighborhood","Convenient local amenities"],
  "expertise_cards": [{"title":"Local Expertise","description":"Deep understanding of local building codes, permit requirements, and neighborhood standards for successful renovations."},{"title":"Quality Craftsmanship","description":"Premium materials and skilled craftsmanship that meet the high standards expected in your community."},{"title":"Investment Value","description":"Strategic renovations designed to maximize property value and provide excellent return on investment."}]
}'

echo ""
echo "=== Creating new cities (not in DB yet) ==="

# Bloomfield
create_city '{
  "name": "Bloomfield",
  "slug": "bloomfield",
  "active": true,
  "featured": false,
  "sort_order": 100,
  "neighborhood_features": ["Diverse historic housing stock from Victorians to Cape Cods","Neighborhoods like Brookdale and Watsessing with distinct character","Competitive $400K average home values with strong renovation ROI","Mix of original architectural details worth preserving","Convenient online permit applications through township"],
  "expertise_cards": [{"title":"Historic Home Modernization","description":"Expertise updating Bloomfield'\''s diverse Victorian, Colonial, and Cape Cod homes while preserving original character and architectural details."},{"title":"Value-Driven Renovations","description":"Strategic improvements that maximize equity in Bloomfield'\''s competitive $400K market, delivering measurable ROI for neighborhood comparables."}]
}'

# Clifton
create_city '{
  "name": "Clifton",
  "slug": "clifton",
  "active": true,
  "featured": false,
  "sort_order": 101,
  "neighborhood_features": ["Large diverse city with established neighborhoods like Athenia and Richfield","Fast 5-10 day permit processing—among quickest in the region","$450K average home values with excellent renovation potential","Passaic County'\''s largest city with varied housing types","Convenient highway access attracting buyers seeking updated homes"],
  "expertise_cards": [{"title":"Streamlined Project Execution","description":"Leverage Clifton'\''s fast permit processing to complete renovations efficiently across all neighborhoods from Athenia to Montclair Heights."},{"title":"Energy-Efficient Modernization","description":"Update Clifton'\''s older housing stock with modern kitchens, bathrooms, and energy-efficient systems that reduce costs and increase marketability."}]
}'

# Maplewood
create_city '{
  "name": "Maplewood",
  "slug": "maplewood",
  "active": true,
  "featured": false,
  "sort_order": 102,
  "neighborhood_features": ["Vibrant arts scene with diverse community and charming village center","Multiple historic districts requiring commission review","$600K average home values in competitive Essex County market","Housing ranges from Victorian to mid-century modern","Strong demand for character-preserving renovations"],
  "expertise_cards": [{"title":"Historic District Expertise","description":"Navigate Maplewood'\''s multiple historic districts and Historic Commission review process while preserving the architectural character that makes each neighborhood unique."},{"title":"Period-Appropriate Modernization","description":"Update Victorian, Colonial, and mid-century homes with modern kitchens and bathrooms while respecting original details and Maplewood'\''s artistic character."}]
}'

# Parsippany
create_city '{
  "name": "Parsippany",
  "slug": "parsippany",
  "active": true,
  "featured": false,
  "sort_order": 103,
  "neighborhood_features": ["Large Morris County township with corporate headquarters presence","Neighborhoods from Lake Hiawatha to Troy Hills","$500K average home values with strong professional buyer demand","Online permit applications and efficient processing","Diverse housing requiring tailored renovation approaches"],
  "expertise_cards": [{"title":"Corporate Market Expertise","description":"Renovations appealing to Parsippany'\''s professional demographic, with focus on quality finishes and modern amenities that corporate relocations expect."},{"title":"Multi-Neighborhood Knowledge","description":"Tailored approaches for Parsippany'\''s distinct neighborhoods from Lake Hiawatha waterfront to Troy Hills estates, understanding each area'\''s unique character."}]
}'

# West Caldwell
create_city '{
  "name": "West Caldwell",
  "slug": "west-caldwell",
  "active": true,
  "featured": false,
  "sort_order": 104,
  "neighborhood_features": ["Suburban Essex County township with excellent schools and NYC commute","$600K average home values attracting professional families","Distinct from Caldwell Borough despite sharing 07006 zip code","Family-oriented neighborhoods valuing functional spaces","Strong demand for home offices and finished basements"],
  "expertise_cards": [{"title":"Suburban Family Renovations","description":"Design functional spaces West Caldwell families need—expanded kitchens, home offices for commuters, finished basements, and additional bathrooms."},{"title":"Professional Household Solutions","description":"Renovations meeting needs of West Caldwell'\''s professional families, balancing work-from-home functionality with family living and entertaining spaces."}]
}'

echo ""
echo "=== Done! ==="

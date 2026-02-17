-- Insert missing service areas that exist in CITY_CONTENT but not in the DB
-- These are: bloomfield, clifton, maplewood, parsippany, west-caldwell

INSERT INTO service_areas (name, slug, active, has_page, sort_order, description, neighborhood_features, expertise_cards)
VALUES
  ('Bloomfield', 'bloomfield', true, true, 100, 'Historic Essex County township with diverse neighborhoods',
   '["Diverse historic housing stock from Victorians to Cape Cods","Neighborhoods like Brookdale and Watsessing with distinct character","Competitive $400K average home values with strong renovation ROI","Mix of original architectural details worth preserving","Convenient online permit applications through township"]'::jsonb,
   '[{"title":"Historic Home Modernization","description":"Expertise updating Bloomfield''s diverse Victorian, Colonial, and Cape Cod homes while preserving original character and architectural details."},{"title":"Value-Driven Renovations","description":"Strategic improvements that maximize equity in Bloomfield''s competitive $400K market, delivering measurable ROI for neighborhood comparables."}]'::jsonb),

  ('Clifton', 'clifton', true, true, 101, 'Diverse Passaic County city with established neighborhoods',
   '["Large diverse city with established neighborhoods like Athenia and Richfield","Fast 5-10 day permit processing—among quickest in the region","$450K average home values with excellent renovation potential","Passaic County''s largest city with varied housing types","Convenient highway access attracting buyers seeking updated homes"]'::jsonb,
   '[{"title":"Streamlined Project Execution","description":"Leverage Clifton''s fast permit processing to complete renovations efficiently across all neighborhoods from Athenia to Montclair Heights."},{"title":"Energy-Efficient Modernization","description":"Update Clifton''s older housing stock with modern kitchens, bathrooms, and energy-efficient systems that reduce costs and increase marketability."}]'::jsonb),

  ('Maplewood', 'maplewood', true, true, 102, 'Vibrant Essex County township with arts scene and diverse community',
   '["Vibrant arts scene with diverse community and charming village center","Multiple historic districts requiring commission review","$600K average home values in competitive Essex County market","Housing ranges from Victorian to mid-century modern","Strong demand for character-preserving renovations"]'::jsonb,
   '[{"title":"Historic District Expertise","description":"Navigate Maplewood''s multiple historic districts and Historic Commission review process while preserving the architectural character that makes each neighborhood unique."},{"title":"Period-Appropriate Modernization","description":"Update Victorian, Colonial, and mid-century homes with modern kitchens and bathrooms while respecting original details and Maplewood''s artistic character."}]'::jsonb),

  ('Parsippany', 'parsippany', true, true, 103, 'Major Morris County township with diverse housing and corporate HQs',
   '["Large Morris County township with corporate headquarters presence","Neighborhoods from Lake Hiawatha to Troy Hills","$500K average home values with strong professional buyer demand","Online permit applications and efficient processing","Diverse housing requiring tailored renovation approaches"]'::jsonb,
   '[{"title":"Corporate Market Expertise","description":"Renovations appealing to Parsippany''s professional demographic, with focus on quality finishes and modern amenities that corporate relocations expect."},{"title":"Multi-Neighborhood Knowledge","description":"Tailored approaches for Parsippany''s distinct neighborhoods from Lake Hiawatha waterfront to Troy Hills estates, understanding each area''s unique character."}]'::jsonb),

  ('West Caldwell', 'west-caldwell', true, true, 104, 'Suburban Essex County township with excellent schools',
   '["Suburban Essex County township with excellent schools and NYC commute","$600K average home values attracting professional families","Distinct from Caldwell Borough despite sharing 07006 zip code","Family-oriented neighborhoods valuing functional spaces","Strong demand for home offices and finished basements"]'::jsonb,
   '[{"title":"Suburban Family Renovations","description":"Design functional spaces West Caldwell families need—expanded kitchens, home offices for commuters, finished basements, and additional bathrooms."},{"title":"Professional Household Solutions","description":"Renovations meeting needs of West Caldwell''s professional families, balancing work-from-home functionality with family living and entertaining spaces."}]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

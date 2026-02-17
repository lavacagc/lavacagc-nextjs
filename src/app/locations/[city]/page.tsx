import { Card } from "@/components/ui/card";
import { MapPin, CheckCircle2, Phone, FileText, Clock, Building2, ExternalLink, HelpCircle, ChevronDown } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOSchema from "@/components/SEOSchema";
import LocalSEOSchema from "@/components/LocalSEOSchema";
import GoogleMaps from "@/components/GoogleMaps";
import NAPInfo from "@/components/NAPInfo";
import CanonicalUrl from "@/components/CanonicalUrl";
import Breadcrumb from "@/components/Breadcrumb";
import { CityHeroButtons, CityServiceCard, CityCTAButtons } from "@/components/CityLandingClient";
import { getLocationBySlug, getLocationMetaTitle, getLocationMetaDescription } from "@/data/locationData";
import { notFound } from "next/navigation";
import type { Metadata } from 'next';
import Link from "next/link";

// Define valid cities
const VALID_CITIES = [
  'alpine', 'bloomfield', 'caldwell', 'clifton', 'essex-fells', 'ho-ho-kus',
  'livingston', 'madison', 'maplewood', 'millburn', 'montclair', 'morristown',
  'parsippany', 'saddle-river', 'short-hills', 'verona', 'west-caldwell', 'west-orange'
];

// City-specific content
const CITY_CONTENT: Record<string, {
  neighborhoodFeatures: string[];
  expertiseCards: { title: string; description: string }[];
}> = {
  'alpine': {
    neighborhoodFeatures: [
      "Historic estates and modern luxury homes",
      "Strict architectural guidelines",
      "Premium material requirements",
      "High-end finish expectations",
      "Excellent return on investment"
    ],
    expertiseCards: [
      {
        title: "Alpine Estate Expertise",
        description: "Specialized knowledge of Alpine's luxury estate requirements, architectural review boards, and exclusive community standards for high-end renovations."
      },
      {
        title: "Luxury Materials & Finishes",
        description: "Access to the finest imported materials, custom millwork, and premium finishes that meet Alpine's discerning standards and HOA requirements."
      },
      {
        title: "Maximum Investment Returns",
        description: "Strategic renovations designed to maximize property values in Alpine's exclusive $2M+ market, with proven ROI for luxury homeowners."
      }
    ]
  },
  'short-hills': {
    neighborhoodFeatures: [
      "Historic Tudor and Colonial architecture",
      "High property values requiring quality finishes",
      "Strong demand for modern amenities",
      "Excellent school district driving home values",
      "Strict township regulations"
    ],
    expertiseCards: [
      {
        title: "Short Hills Architectural Expertise",
        description: "Deep understanding of Short Hills' diverse architectural styles, from historic Tudors to contemporary designs, ensuring seamless renovations."
      },
      {
        title: "Premium Material Selection",
        description: "Curated selection of high-end materials and finishes that complement Short Hills' luxury market expectations."
      },
      {
        title: "Value-Adding Renovations",
        description: "Strategic improvements that maximize ROI in Short Hills' competitive real estate market, with average home values exceeding $1.5M."
      }
    ]
  },
  'saddle-river': {
    neighborhoodFeatures: [
      "Sprawling estate properties",
      "Equestrian-friendly community",
      "Minimum lot size requirements",
      "Prestigious neighborhood standards",
      "Private, secluded settings"
    ],
    expertiseCards: [
      {
        title: "Saddle River Estate Specialists",
        description: "Expert knowledge of Saddle River's unique estate requirements and zoning regulations for luxury property renovations."
      },
      {
        title: "Custom Estate Features",
        description: "Specialized in high-end amenities including home theaters, wine cellars, and indoor pools that Saddle River homeowners expect."
      },
      {
        title: "Privacy-Focused Design",
        description: "Renovations designed to enhance privacy and exclusivity while maintaining the natural beauty of Saddle River properties."
      }
    ]
  },
  'bloomfield': {
    neighborhoodFeatures: [
      "Diverse historic housing stock from Victorians to Cape Cods",
      "Neighborhoods like Brookdale and Watsessing with distinct character",
      "Competitive $400K average home values with strong renovation ROI",
      "Mix of original architectural details worth preserving",
      "Convenient online permit applications through township"
    ],
    expertiseCards: [
      {
        title: "Historic Home Modernization",
        description: "Expertise updating Bloomfield's diverse Victorian, Colonial, and Cape Cod homes while preserving original character and architectural details."
      },
      {
        title: "Value-Driven Renovations",
        description: "Strategic improvements that maximize equity in Bloomfield's competitive $400K market, delivering measurable ROI for neighborhood comparables."
      }
    ]
  },
  'caldwell': {
    neighborhoodFeatures: [
      "Historic borough with Grover Cleveland birthplace heritage",
      "Preservation guidelines near downtown core",
      "$550K average home values in family-oriented community",
      "Mix of historic and updated homes requiring sensitive renovations",
      "Efficient 7-14 day permit processing times"
    ],
    expertiseCards: [
      {
        title: "Historic Preservation Compliance",
        description: "Navigate Caldwell's historic preservation guidelines with expertise in period-appropriate renovations that respect the borough's Grover Cleveland-era character."
      },
      {
        title: "System Modernization",
        description: "Specialize in updating electrical, plumbing, and HVAC in Caldwell's older homes while maintaining exterior charm and historic integrity."
      }
    ]
  },
  'clifton': {
    neighborhoodFeatures: [
      "Large diverse city with established neighborhoods like Athenia and Richfield",
      "Fast 5-10 day permit processing—among quickest in the region",
      "$450K average home values with excellent renovation potential",
      "Passaic County's largest city with varied housing types",
      "Convenient highway access attracting buyers seeking updated homes"
    ],
    expertiseCards: [
      {
        title: "Streamlined Project Execution",
        description: "Leverage Clifton's fast permit processing to complete renovations efficiently across all neighborhoods from Athenia to Montclair Heights."
      },
      {
        title: "Energy-Efficient Modernization",
        description: "Update Clifton's older housing stock with modern kitchens, bathrooms, and energy-efficient systems that reduce costs and increase marketability."
      }
    ]
  },
  'essex-fells': {
    neighborhoodFeatures: [
      "Exclusive $1.7M average home values on wooded estate lots",
      "Strict tree preservation ordinances protecting natural character",
      "Custom homes requiring sophisticated renovation approaches",
      "Small borough with just 2,100 residents and high standards",
      "Careful zoning requirements for additions and modifications"
    ],
    expertiseCards: [
      {
        title: "Estate Property Expertise",
        description: "Specialized knowledge of Essex Fells' tree preservation ordinances, working with arborists to plan renovations around protected specimens on wooded lots."
      },
      {
        title: "Luxury Custom Renovations",
        description: "Tailored renovations for Essex Fells' custom homes, respecting natural settings while incorporating high-end finishes and modern amenities."
      }
    ]
  },
  'ho-ho-kus': {
    neighborhoodFeatures: [
      "Quaint borough known for tree-lined streets and historic charm",
      "$800K average home values with architectural character",
      "Strict guidelines preserving historic neighborhood aesthetics",
      "Bergen County location with strong community identity",
      "Renovations must respect streetscape and architectural continuity"
    ],
    expertiseCards: [
      {
        title: "Historic Character Preservation",
        description: "Expert renovations that comply with Ho-Ho-Kus architectural guidelines while updating interiors with modern functionality and premium finishes."
      },
      {
        title: "Seamless Period Integration",
        description: "Blend modern kitchens, bathrooms, and systems into Ho-Ho-Kus historic homes without compromising the streetscape charm that defines the borough."
      }
    ]
  },
  'livingston': {
    neighborhoodFeatures: [
      "Family-friendly township with top-rated school system",
      "$700K average home values driven by education quality",
      "Neighborhoods from Livingston Center to Riker Hill",
      "High demand for functional family spaces and home offices",
      "Online permit applications and efficient processing"
    ],
    expertiseCards: [
      {
        title: "Family-Focused Renovations",
        description: "Design practical spaces Livingston families need—expanded kitchens for entertaining, finished basements for play areas, home offices, and mudrooms."
      },
      {
        title: "School District Investment",
        description: "Strategic renovations that capitalize on Livingston's excellent schools, maximizing home value for families investing in this top-rated district."
      }
    ]
  },
  'madison': {
    neighborhoodFeatures: [
      "Known as 'Rose City' with charming historic downtown",
      "$750K average home values in Morris County location",
      "Diverse architecture from Colonials to contemporary",
      "Historic Preservation review in designated districts",
      "Top-rated schools attracting families seeking quality homes"
    ],
    expertiseCards: [
      {
        title: "Rose City Architectural Expertise",
        description: "Navigate Madison's diverse architectural styles and historic preservation requirements while delivering renovations that enhance Rose City's distinctive character."
      },
      {
        title: "Family-Oriented Upgrades",
        description: "Create spaces that leverage Madison's top schools and community—larger kitchens, additional bathrooms, finished basements—maximizing family appeal."
      }
    ]
  },
  'maplewood': {
    neighborhoodFeatures: [
      "Vibrant arts scene with diverse community and charming village center",
      "Multiple historic districts requiring commission review",
      "$600K average home values in competitive Essex County market",
      "Housing ranges from Victorian to mid-century modern",
      "Strong demand for character-preserving renovations"
    ],
    expertiseCards: [
      {
        title: "Historic District Expertise",
        description: "Navigate Maplewood's multiple historic districts and Historic Commission review process while preserving the architectural character that makes each neighborhood unique."
      },
      {
        title: "Period-Appropriate Modernization",
        description: "Update Victorian, Colonial, and mid-century homes with modern kitchens and bathrooms while respecting original details and Maplewood's artistic character."
      }
    ]
  },
  'millburn': {
    neighborhoodFeatures: [
      "Includes Short Hills with $900K+ average home values",
      "Excellent school district driving strong real estate demand",
      "Diverse neighborhoods from Wyoming to Old Short Hills",
      "Same permit process as Short Hills through township",
      "High expectations for quality finishes and craftsmanship"
    ],
    expertiseCards: [
      {
        title: "Millburn Township Specialists",
        description: "Deep expertise with Millburn's diverse neighborhoods and township permit requirements, ensuring smooth approvals for renovations across all areas."
      },
      {
        title: "Quality-Driven Renovations",
        description: "Premium materials and skilled craftsmanship meeting Millburn homeowners' high standards, with focus on ROI in this competitive $900K+ market."
      }
    ]
  },
  'montclair': {
    neighborhoodFeatures: [
      "Vibrant Essex County township with arts, culture, and diverse neighborhoods",
      "Multiple historic districts from Upper Montclair to Montclair Heights",
      "$650K average home values with competitive market dynamics",
      "Housing from Victorian mansions to contemporary updates",
      "Historic Preservation Commission review for designated areas"
    ],
    expertiseCards: [
      {
        title: "Multi-District Expertise",
        description: "Navigate Montclair's various neighborhoods and Historic Preservation requirements, from Upper Montclair estates to South Montclair homes."
      },
      {
        title: "Character-Conscious Modernization",
        description: "Blend modern kitchens and bathrooms into Montclair's diverse housing stock while preserving the original details and artistic character defining each area."
      }
    ]
  },
  'morristown': {
    neighborhoodFeatures: [
      "Historic Morris County seat with Revolutionary War heritage",
      "$550K average home values in walkable downtown location",
      "Historic District requiring architectural review",
      "Mix of historic homes, condos, and townhomes",
      "Strong demand balancing preservation with modern updates"
    ],
    expertiseCards: [
      {
        title: "Historic District Navigation",
        description: "Expert guidance through Morristown Historic District architectural review, preserving Revolutionary War-era character while modernizing interiors."
      },
      {
        title: "Multi-Unit Expertise",
        description: "Handle renovations for Morristown's single-family homes, condos, and townhomes, coordinating with HOAs while delivering quality craftsmanship."
      }
    ]
  },
  'parsippany': {
    neighborhoodFeatures: [
      "Large Morris County township with corporate headquarters presence",
      "Neighborhoods from Lake Hiawatha to Troy Hills",
      "$500K average home values with strong professional buyer demand",
      "Online permit applications and efficient processing",
      "Diverse housing requiring tailored renovation approaches"
    ],
    expertiseCards: [
      {
        title: "Corporate Market Expertise",
        description: "Renovations appealing to Parsippany's professional demographic, with focus on quality finishes and modern amenities that corporate relocations expect."
      },
      {
        title: "Multi-Neighborhood Knowledge",
        description: "Tailored approaches for Parsippany's distinct neighborhoods from Lake Hiawatha waterfront to Troy Hills estates, understanding each area's unique character."
      }
    ]
  },
  'verona': {
    neighborhoodFeatures: [
      "Charming borough known for small-town feel and excellent schools",
      "$650K average home values with strong family appeal",
      "Efficient 7-10 day permit processing—among fastest in Essex County",
      "Neighborhoods from Verona Center to Forest Avenue",
      "Rising property values making renovations excellent investments"
    ],
    expertiseCards: [
      {
        title: "Fast-Track Project Execution",
        description: "Leverage Verona's efficient 7-10 day permit processing to move quickly from planning to construction, minimizing disruption for busy families."
      },
      {
        title: "Value Maximization Strategy",
        description: "Strategic renovations capitalizing on Verona's rising $650K market, with focus on kitchen and bathroom updates delivering strong ROI."
      }
    ]
  },
  'west-caldwell': {
    neighborhoodFeatures: [
      "Suburban Essex County township with excellent schools and NYC commute",
      "$600K average home values attracting professional families",
      "Distinct from Caldwell Borough despite sharing 07006 zip code",
      "Family-oriented neighborhoods valuing functional spaces",
      "Strong demand for home offices and finished basements"
    ],
    expertiseCards: [
      {
        title: "Suburban Family Renovations",
        description: "Design functional spaces West Caldwell families need—expanded kitchens, home offices for commuters, finished basements, and additional bathrooms."
      },
      {
        title: "Professional Household Solutions",
        description: "Renovations meeting needs of West Caldwell's professional families, balancing work-from-home functionality with family living and entertaining spaces."
      }
    ]
  },
  'west-orange': {
    neighborhoodFeatures: [
      "Historic township home to Thomas Edison's laboratory and Llewellyn Park",
      "$500K average home values with diverse neighborhoods",
      "Llewellyn Park private community with additional architectural requirements",
      "Neighborhoods from Pleasantdale to Rock Spring with varied character",
      "Mix of historic preservation and modern renovation needs"
    ],
    expertiseCards: [
      {
        title: "Llewellyn Park Specialists",
        description: "Navigate America's first planned community with expertise in Llewellyn Park Association requirements and historic architectural guidelines."
      },
      {
        title: "Historic Modernization",
        description: "Update West Orange's diverse housing stock while preserving period details, from Thomas Edison-era homes to mid-century properties across all neighborhoods."
      }
    ]
  }
};

// Default content for cities without specific data
const DEFAULT_CONTENT = {
  neighborhoodFeatures: [
    "Established residential community",
    "Quality construction standards",
    "Growing property values",
    "Family-oriented neighborhood",
    "Convenient local amenities"
  ],
  expertiseCards: [
    {
      title: "Local Expertise",
      description: "Deep understanding of local building codes, permit requirements, and neighborhood standards for successful renovations."
    },
    {
      title: "Quality Craftsmanship",
      description: "Premium materials and skilled craftsmanship that meet the high standards expected in your community."
    },
    {
      title: "Investment Value",
      description: "Strategic renovations designed to maximize property value and provide excellent return on investment."
    }
  ]
};

interface CityPageProps {
  params: Promise<{
    city: string;
  }>;
}

// Generate static params for all 12 cities
export async function generateStaticParams() {
  return VALID_CITIES.map((city) => ({
    city
  }));
}

// Generate metadata for each city page
export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { city } = await params;

  if (!VALID_CITIES.includes(city)) {
    return {
      title: 'Page Not Found'
    };
  }

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    return {
      title: 'Page Not Found'
    };
  }

  return {
    title: getLocationMetaTitle(city),
    description: getLocationMetaDescription(city),
    alternates: {
      canonical: `https://www.lavacagc.com/locations/${city}`,
    },
    openGraph: {
      title: `Home Remodeling Contractor in ${locationData.name}, NJ | La Vaca General Contractors`,
      description: getLocationMetaDescription(city),
      url: `https://www.lavacagc.com/locations/${city}`,
    },
  };
}

export default async function CityLandingPage({ params }: CityPageProps) {
  const { city } = await params;

  // Validate city
  if (!VALID_CITIES.includes(city)) {
    notFound();
  }

  const locationData = getLocationBySlug(city);

  if (!locationData) {
    notFound();
  }

  const cityContent = CITY_CONTENT[city] || DEFAULT_CONTENT;

  const services = [
    {
      title: `Kitchen Remodeling in ${locationData.name}`,
      description: `Custom kitchen designs for ${locationData.name}'s luxury homes`,
      features: [`Custom Cabinetry for ${locationData.name} Homes`, "Premium Granite & Quartz", "High-End Appliance Integration"],
      link: `/locations/${city}/services/kitchen-remodeling`
    },
    {
      title: `Bathroom Renovations in ${locationData.name}`,
      description: `Spa-like bathroom retreats for ${locationData.name} residences`,
      features: ["Walk-in Showers & Soaking Tubs", "Custom Vanities & Storage", "Heated Floors & Premium Fixtures"],
      link: `/locations/${city}/services/bathroom-renovation`
    },
    {
      title: `Basement Finishing in ${locationData.name} NJ`,
      description: `Transform your ${locationData.name} basement into luxury living space`,
      features: ["Home Theaters & Wine Cellars", "Home Offices & Study Areas", "Guest Suites & Entertainment Areas"],
      link: `/locations/${city}/services/basement-finishing`
    },
    {
      title: `Home Additions - ${locationData.name} Estates`,
      description: `Expand your ${locationData.name} estate while maintaining architectural integrity`,
      features: ["Master Suite Additions", "Second Story Expansions", "Sunrooms & Family Room Extensions"],
      link: `/locations/${city}/services/home-additions`
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOSchema
        title={`Home Remodeling Contractor in ${locationData.name}, NJ`}
        description={getLocationMetaDescription(city)}
        type="LocalBusiness"
      />
      <LocalSEOSchema location={locationData} />
      <CanonicalUrl customUrl={`https://www.lavacagc.com/locations/${city}`} />

      {/* FAQ JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": locationData.faqs.map(faq => ({
              "@type": "Question",
              "name": faq.question,
              "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer
              }
            }))
          })
        }}
      />

      <Header />

      <main>
        {/* Breadcrumb Navigation */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="relative bg-gradient-to-br from-background via-background to-muted py-20 lg:py-32">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-4xl mx-auto">
              <div className="flex items-center justify-center mb-6">
                <MapPin className="h-8 w-8 text-primary mr-3" />
                <span className="text-xl text-secondary font-semibold">{locationData.name}, NJ</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-bold text-text-primary mb-6 leading-tight">
                Premium Home Remodeling Contractor Near Me
                <span className="block text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  {locationData.name}, {locationData.county}, NJ
                </span>
              </h1>
              <p className="text-xl text-text-secondary mb-8 leading-relaxed max-w-3xl mx-auto">
                Looking for &quot;contractors near me&quot; in {locationData.name}, NJ? La Vaca specializes in luxury renovations for {locationData.name}&apos;s prestigious homes in {locationData.county}.
                <span className="font-semibold text-secondary"> Licensed {locationData.name} contractor serving {locationData.zipCodes?.[0] || ''} and surrounding areas.</span>
              </p>
              <CityHeroButtons cityName={locationData.name} />
            </div>
          </div>
        </section>

        {/* Services Section */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Our {locationData.name} Remodeling Services
              </h2>
              <p className="text-xl text-text-secondary max-w-3xl mx-auto">
                Comprehensive luxury renovation solutions tailored for {locationData.name} homeowners
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {services.map((service, index) => (
                <CityServiceCard key={index} service={service} />
              ))}
            </div>
          </div>
        </section>

        {/* Neighborhood Expertise Section */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-4xl font-bold text-text-primary mb-6">
                  {locationData.name} Neighborhood
                  <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Expertise</span>
                </h2>
                <p className="text-xl text-text-secondary mb-8 leading-relaxed">
                  {locationData.name}&apos;s luxury real estate market demands the highest standards of craftsmanship and design.
                  We understand the unique requirements of renovating in this prestigious community.
                </p>
                <div className="space-y-4">
                  {cityContent.neighborhoodFeatures.map((feature, index) => (
                    <div key={index} className="flex items-center">
                      <div className="w-2 h-2 bg-primary rounded-full mr-4 flex-shrink-0"></div>
                      <span className="text-text-secondary">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                {cityContent.expertiseCards.map((card, index) => (
                  <Card key={index} className="p-6 bg-gradient-to-r from-primary/5 to-accent-sunset/5 border-primary/20">
                    <h3 className="text-xl font-bold text-text-primary mb-3">{card.title}</h3>
                    <p className="text-text-secondary">{card.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Guide Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-text-primary mb-4">
                  {locationData.name} Remodeling Investment Guide
                </h2>
                <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                  Typical project costs for {locationData.name} homeowners. Final pricing depends on scope, materials, and complexity.
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Kitchen Remodeling</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$55K - $150K+</div>
                  <p className="text-sm text-text-secondary">Custom cabinetry, premium countertops, appliances</p>
                </Card>
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Bathroom Renovation</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$25K - $110K+</div>
                  <p className="text-sm text-text-secondary">Spa features, heated floors, luxury fixtures</p>
                </Card>
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Basement Finishing</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$40K - $120K+</div>
                  <p className="text-sm text-text-secondary">Entertainment spaces, home theaters, wet bars</p>
                </Card>
                <Card className="text-center p-6">
                  <h3 className="font-bold text-text-primary mb-2">Home Additions</h3>
                  <div className="text-2xl font-bold text-primary mb-2">$80K - $300K+</div>
                  <p className="text-sm text-text-secondary">Master suites, second stories, extensions</p>
                </Card>
              </div>

              <div className="text-center mt-8">
                <p className="text-sm text-text-muted mb-4">
                  * Prices reflect typical {locationData.county} luxury project ranges. Get a personalized estimate for your specific project.
                </p>
                <Link
                  href="/project-calculator"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-10 px-6"
                >
                  Get Your Free Estimate
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Permit Information Section */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-text-primary mb-4">
                  {locationData.name} Building Permits & Requirements
                </h2>
                <p className="text-lg text-text-secondary max-w-3xl mx-auto">
                  We handle all permit applications and inspections for your {locationData.name} renovation project. Here&apos;s what you need to know about local requirements.
                </p>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Contact Info Card */}
                <Card className="p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary text-lg mb-1">{locationData.permitInfo.department}</h3>
                      <p className="text-text-secondary text-sm">{locationData.permitInfo.address}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-primary" />
                      <a href={`tel:${locationData.permitInfo.phone.replace(/[^0-9]/g, '')}`} className="text-primary hover:underline font-medium">
                        {locationData.permitInfo.phone}
                      </a>
                    </div>

                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-primary" />
                      <span className="text-text-secondary">Processing Time: <span className="font-medium text-text-primary">{locationData.permitInfo.processingTime}</span></span>
                    </div>

                    {locationData.permitInfo.portalUrl && (
                      <div className="flex items-center gap-3">
                        <ExternalLink className="h-5 w-5 text-primary" />
                        <a href={locationData.permitInfo.portalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                          Online Permit Portal
                        </a>
                      </div>
                    )}
                  </div>

                  {locationData.permitInfo.notes && (
                    <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm text-text-secondary italic">{locationData.permitInfo.notes}</p>
                    </div>
                  )}
                </Card>

                {/* Requirements Card */}
                <Card className="p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary text-lg mb-1">Typical Permit Requirements</h3>
                      <p className="text-text-secondary text-sm">Common permits needed for {locationData.name} renovations</p>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {locationData.permitInfo.requirements.map((requirement, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-text-secondary">{requirement}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 p-4 bg-gradient-to-r from-primary/5 to-accent-sunset/5 rounded-lg border border-primary/20">
                    <p className="text-sm text-text-primary font-medium">
                      Don&apos;t worry about permits – we handle everything from application to final inspection!
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <HelpCircle className="h-8 w-8 text-primary" />
                  <h2 className="text-3xl font-bold text-text-primary">
                    {locationData.name} Renovation FAQs
                  </h2>
                </div>
                <p className="text-lg text-text-secondary">
                  Common questions about home remodeling in {locationData.name}, NJ
                </p>
              </div>

              <div className="space-y-4">
                {locationData.faqs.map((faq, index) => (
                  <details
                    key={index}
                    className="group bg-background rounded-lg border border-border overflow-hidden"
                  >
                    <summary className="flex items-center justify-between cursor-pointer p-6 hover:bg-muted/50 transition-colors">
                      <span className="font-semibold text-text-primary pr-4">{faq.question}</span>
                      <ChevronDown className="h-5 w-5 text-primary flex-shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-6 pb-6 text-text-secondary leading-relaxed">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>

              <div className="text-center mt-8">
                <p className="text-text-secondary mb-4">
                  Have more questions about your {locationData.name} renovation project?
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white h-10 px-6"
                >
                  Contact Us for Answers
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Nearby Service Areas Section */}
        <section className="py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-text-primary mb-4">
                Also Serving Nearby Communities
              </h2>
              <p className="text-lg text-text-secondary mb-8">
                In addition to {locationData.name}, we provide premium home remodeling services throughout {locationData.county} and surrounding areas.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {locationData.nearbyAreas.map((area, index) => {
                  // Convert area name to slug format
                  const slug = area.toLowerCase().replace(/\s+/g, '-');
                  // Check if this area is one we have a page for
                  const hasPage = VALID_CITIES.includes(slug);

                  return hasPage ? (
                    <Link
                      key={index}
                      href={`/locations/${slug}`}
                      className="inline-flex items-center px-4 py-2 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors font-medium"
                    >
                      {area}, NJ
                    </Link>
                  ) : (
                    <span
                      key={index}
                      className="inline-flex items-center px-4 py-2 rounded-full bg-muted text-text-secondary font-medium"
                    >
                      {area}, NJ
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Google Maps & Contact Section */}
        <section className="py-16 bg-muted">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12">
              <div>
                <GoogleMaps location={locationData} />
              </div>
              <div>
                <NAPInfo />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section id="estimate" className="py-16 bg-secondary text-secondary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to Transform Your {locationData.name} Home?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
              Schedule your estimate in 2 minutes for your {locationData.name} luxury renovation project.
            </p>
            <CityCTAButtons />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

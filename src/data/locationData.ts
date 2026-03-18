// Comprehensive location data for Northern New Jersey

export interface PermitInfo {
  department: string;
  phone: string;
  address: string;
  portalUrl?: string;
  requirements: string[];
  processingTime: string;
  notes?: string;
}

export interface LocationFAQ {
  question: string;
  answer: string;
}

export interface LocationData {
  name: string;
  slug: string;
  county: string;
  zipCodes: string[];
  neighborhoods: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  drivingDirections: string;
  description: string;
  metaKeywords: string[];
  nearbyAreas: string[];
  demographics: {
    population: number;
    medianIncome: string;
    avgHomeValue: string;
  };
  permitInfo: PermitInfo;
  faqs: LocationFAQ[];
}

export const locationData: Record<string, LocationData> = {
  alpine: {
    name: "Alpine",
    slug: "alpine",
    county: "Bergen County",
    zipCodes: ["07620"],
    neighborhoods: ["Alpine Borough", "Alpine Heights", "Closter Road Area"],
    coordinates: { lat: 40.951389, lng: -73.931667 },
    drivingDirections: "From NYC: Take I-95 North to Exit 2 (Alpine/Tenafly). Turn right onto US-9W North. Alpine is located along the scenic Palisades.",
    description: "Exclusive Bergen County community known for luxury homes and Palisades views",
    metaKeywords: ["Alpine NJ contractor", "Bergen County remodeling", "luxury home renovation Alpine", "07620 contractor"],
    nearbyAreas: ["Tenafly", "Cresskill", "Closter", "Demarest"],
    demographics: {
      population: 1849,
      medianIncome: "$250,000+",
      avgHomeValue: "$2.5M+"
    },
    permitInfo: {
      department: "Alpine Borough Construction Department",
      phone: "(201) 784-2900",
      address: "100 Church Street, Alpine, NJ 07620",
      portalUrl: "https://www.alpinenj.org/building-department",
      requirements: [
        "Building permit for structural changes",
        "Electrical permit for new circuits or panel upgrades",
        "Plumbing permit for fixture additions or relocations",
        "Zoning approval for additions or exterior changes",
        "Fire subcode permit if applicable"
      ],
      processingTime: "7-14 business days",
      notes: "Alpine has strict architectural review requirements for exterior modifications"
    },
    faqs: [
      {
        question: "What makes Alpine home renovations unique?",
        answer: "Alpine is one of New Jersey's most exclusive communities with homes averaging $2.5M+. Renovations here require understanding strict architectural review requirements, working with luxury materials, and respecting the community's prestigious character. We specialize in high-end renovations that meet Alpine's exacting standards."
      },
      {
        question: "Do I need architectural review approval for renovations in Alpine?",
        answer: "Yes, Alpine Borough requires architectural review for most exterior modifications. This includes additions, facade changes, and significant landscaping alterations. We handle the entire approval process for you, ensuring your project meets all community guidelines."
      },
      {
        question: "How long does a typical kitchen remodel take in Alpine?",
        answer: "A luxury kitchen remodel in Alpine typically takes 8-14 weeks depending on scope and custom features. This includes time for permit approval, custom cabinetry fabrication, and installation of high-end appliances. We provide detailed timelines during your consultation."
      },
      {
        question: "What's the average cost of a bathroom renovation in Alpine, NJ?",
        answer: "Luxury bathroom renovations in Alpine range from $45,000 to $150,000+ depending on size, fixtures, and finishes. Alpine homeowners typically choose premium materials like natural stone, custom vanities, and high-end fixtures to match their home's quality."
      }
    ]
  },
  "short-hills": {
    name: "Short Hills",
    slug: "short-hills",
    county: "Essex County",
    zipCodes: ["07078"],
    neighborhoods: ["Short Hills Center", "Hartshorn", "White Oak Ridge"],
    coordinates: { lat: 40.740556, lng: -74.327222 },
    drivingDirections: "From NYC: Take NJ Transit to Short Hills Station or drive via I-78 West to Exit 48 (Morris Ave). Short Hills is easily accessible from Manhattan.",
    description: "Affluent Essex County suburb renowned for upscale shopping and excellent schools",
    metaKeywords: ["Short Hills NJ contractor", "Essex County remodeling", "luxury renovation Short Hills", "07078 contractor"],
    nearbyAreas: ["Millburn", "Summit", "Chatham", "Madison"],
    demographics: {
      population: 13311,
      medianIncome: "$200,000+",
      avgHomeValue: "$1.8M+"
    },
    permitInfo: {
      department: "Millburn Township Building Department",
      phone: "(973) 564-7066",
      address: "375 Millburn Avenue, Millburn, NJ 07041",
      portalUrl: "https://www.twp.millburn.nj.us/departments/building",
      requirements: [
        "Building permit for all renovations over $500",
        "Electrical permit for panel upgrades or new circuits",
        "Plumbing permit for new fixtures",
        "Historic preservation review in designated areas",
        "Tree removal permit if applicable"
      ],
      processingTime: "10-21 business days",
      notes: "Short Hills is part of Millburn Township; permits are processed through Millburn"
    },
    faqs: [
      {
        question: "Why choose a local contractor for Short Hills renovations?",
        answer: "Short Hills homes feature diverse architectural styles from historic Tudors to modern designs. A local contractor understands Millburn Township's permit requirements, works with the architectural character of the neighborhood, and has relationships with local suppliers for premium materials that match Short Hills' luxury standards."
      },
      {
        question: "Are there historic preservation requirements in Short Hills?",
        answer: "Yes, certain areas of Short Hills have historic preservation designations that require additional review. We're familiar with these requirements and can guide you through the approval process for renovations in historically designated areas."
      },
      {
        question: "How much does a basement finishing project cost in Short Hills?",
        answer: "Basement finishing in Short Hills typically ranges from $50,000 to $150,000+ depending on size and features. Many Short Hills homeowners include home theaters, wine cellars, or guest suites to maximize their home's value in this competitive market."
      },
      {
        question: "What's the ROI on kitchen remodeling in Short Hills?",
        answer: "Kitchen remodels in Short Hills typically see 70-80% ROI at resale, higher than the national average. Given Short Hills' average home values exceeding $1.5M, a well-executed kitchen renovation is one of the best investments you can make in your home."
      }
    ]
  },
  "saddle-river": {
    name: "Saddle River",
    slug: "saddle-river",
    county: "Bergen County",
    zipCodes: ["07458"],
    neighborhoods: ["Saddle River Valley", "East Saddle River", "West Saddle River"],
    coordinates: { lat: 41.024167, lng: -74.096944 },
    drivingDirections: "From NYC: Take I-80 West to Exit 64 (Saddle River Road). Follow signs to Saddle River Borough through scenic Bergen County countryside.",
    description: "Prestigious Bergen County enclave featuring expansive estates and horse properties",
    metaKeywords: ["Saddle River NJ contractor", "Bergen County luxury remodeling", "estate renovation Saddle River", "07458 contractor"],
    nearbyAreas: ["Upper Saddle River", "Allendale", "Ramsey", "Ho-Ho-Kus"],
    demographics: {
      population: 3152,
      medianIncome: "$200,000+",
      avgHomeValue: "$1.9M+"
    },
    permitInfo: {
      department: "Saddle River Borough Construction Office",
      phone: "(201) 327-2609",
      address: "100 East Allendale Road, Saddle River, NJ 07458",
      portalUrl: "https://www.saddleriver.org/departments/construction",
      requirements: [
        "Building permit for structural modifications",
        "Electrical subcode permit",
        "Plumbing subcode permit",
        "Planning Board approval for additions",
        "Environmental permit for properties near wetlands"
      ],
      processingTime: "14-21 business days",
      notes: "Saddle River has minimum lot size requirements and strict zoning for estate properties"
    },
    faqs: [
      {
        question: "What special considerations exist for Saddle River estate renovations?",
        answer: "Saddle River's expansive estate properties often require specialized considerations including environmental permits for properties near wetlands, Planning Board approval for additions, and compliance with minimum lot size requirements. We have extensive experience navigating these unique requirements."
      },
      {
        question: "Can you add a home addition to my Saddle River property?",
        answer: "Yes, home additions are popular in Saddle River. We handle the full process including architectural design, Planning Board approval, permits, and construction. Our team ensures additions complement your estate's existing architecture and meet all zoning requirements."
      },
      {
        question: "How long does permit approval take in Saddle River?",
        answer: "Permit processing in Saddle River typically takes 14-21 business days, though projects requiring Planning Board approval may take longer. We factor this into all project timelines and handle the entire permitting process on your behalf."
      },
      {
        question: "What luxury features are popular in Saddle River home renovations?",
        answer: "Saddle River homeowners often include home theaters, wine cellars, indoor pools, spa bathrooms, gourmet kitchens, and guest suites. We specialize in these high-end features and can customize your renovation to your lifestyle needs."
      }
    ]
  },
  "essex-fells": {
    name: "Essex Fells",
    slug: "essex-fells",
    county: "Essex County",
    zipCodes: ["07021"],
    neighborhoods: ["Essex Fells Borough", "Fells Point", "Woodland Area"],
    coordinates: { lat: 40.823056, lng: -74.281944 },
    drivingDirections: "From NYC: Take I-280 West to Exit 8B (Roseland/Essex Fells). Follow signs through scenic Essex County to Essex Fells Borough.",
    description: "Exclusive Essex County borough known for wooded lots and custom homes",
    metaKeywords: ["Essex Fells NJ contractor", "Essex County remodeling", "custom home renovation Essex Fells", "07021 contractor"],
    nearbyAreas: ["Roseland", "North Caldwell", "West Caldwell", "Fairfield"],
    demographics: {
      population: 2115,
      medianIncome: "$200,000+",
      avgHomeValue: "$1.7M+"
    },
    permitInfo: {
      department: "Essex Fells Borough Building Department",
      phone: "(973) 226-3400",
      address: "255 Roseland Avenue, Essex Fells, NJ 07021",
      requirements: [
        "Building permit for interior and exterior renovations",
        "Electrical permit for service upgrades",
        "Plumbing permit for new fixtures",
        "Zoning permit for additions",
        "Tree preservation permit for protected trees"
      ],
      processingTime: "7-14 business days",
      notes: "Essex Fells maintains strict tree preservation ordinances for wooded properties"
    },
    faqs: [
      {
        question: "What are Essex Fells' tree preservation requirements?",
        answer: "Essex Fells has strict tree preservation ordinances to maintain its wooded character. If your renovation requires removing protected trees, you'll need a tree removal permit. We work with local arborists and understand which trees require permits and how to plan around protected specimens."
      },
      {
        question: "How do custom home renovations work in Essex Fells?",
        answer: "Essex Fells is known for custom homes on wooded lots. We specialize in renovations that respect the natural setting while modernizing interiors. Our design approach preserves your home's character while incorporating contemporary features and finishes."
      },
      {
        question: "What's the typical timeline for a whole-home renovation in Essex Fells?",
        answer: "Whole-home renovations in Essex Fells typically take 4-8 months depending on scope. This includes design, permitting, and construction. We provide detailed schedules and regular updates throughout your project."
      },
      {
        question: "Do you handle permits for Essex Fells renovations?",
        answer: "Yes, we handle all permitting for Essex Fells projects including building, electrical, plumbing, and tree preservation permits. Our team manages the entire approval process so you don't have to worry about paperwork."
      }
    ]
  },
  millburn: {
    name: "Millburn",
    slug: "millburn",
    county: "Essex County",
    zipCodes: ["07041"],
    neighborhoods: ["Millburn Center", "Wyoming", "Old Short Hills"],
    coordinates: { lat: 40.729167, lng: -74.312222 },
    drivingDirections: "From NYC: Take NJ Transit to Millburn Station or drive via I-78 West to Exit 49 (Vauxhall Road). Located in the heart of Essex County.",
    description: "Desirable Essex County community with excellent schools and transit access",
    metaKeywords: ["Millburn NJ contractor", "Essex County home remodeling", "Millburn renovation contractor", "07041 contractor"],
    nearbyAreas: ["Short Hills", "Summit", "Springfield", "Union"],
    demographics: {
      population: 20149,
      medianIncome: "$150,000+",
      avgHomeValue: "$900,000+"
    },
    permitInfo: {
      department: "Millburn Township Building Department",
      phone: "(973) 564-7066",
      address: "375 Millburn Avenue, Millburn, NJ 07041",
      portalUrl: "https://www.twp.millburn.nj.us/departments/building",
      requirements: [
        "Building permit for renovations over $500",
        "Electrical permit for all electrical work",
        "Plumbing permit for fixture changes",
        "Certificate of Occupancy for completed work",
        "Historic review for designated properties"
      ],
      processingTime: "10-21 business days",
      notes: "Millburn includes Short Hills; online permit applications available"
    },
    faqs: [
      {
        question: "What's the difference between Millburn and Short Hills for permitting?",
        answer: "Short Hills is part of Millburn Township, so all permits are processed through the Millburn Building Department. There's no difference in requirements—both communities follow the same permitting process and building codes."
      },
      {
        question: "How do I get started with a Millburn home renovation?",
        answer: "Contact us for a free consultation where we'll discuss your vision, assess your home, and provide a preliminary estimate. We'll then develop detailed plans, handle all permitting, and guide you through material selections before beginning construction."
      },
      {
        question: "Does Millburn have online permit applications?",
        answer: "Yes, Millburn Township offers online permit applications. However, we handle the entire permitting process for our clients, submitting applications, tracking progress, and scheduling inspections so you don't have to manage any paperwork."
      },
      {
        question: "What kitchen features are popular in Millburn homes?",
        answer: "Millburn homeowners often request open-concept layouts, custom cabinetry, quartz or quartzite countertops, professional-grade appliances, and large islands with seating. We help you select features that match your lifestyle and increase your home's value."
      }
    ]
  },
  montclair: {
    name: "Montclair",
    slug: "montclair",
    county: "Essex County",
    zipCodes: ["07042", "07043"],
    neighborhoods: ["Upper Montclair", "South Montclair", "Montclair Heights", "Watchung Plaza"],
    coordinates: { lat: 40.814167, lng: -74.208889 },
    drivingDirections: "From NYC: Take NJ Transit bus or train to Montclair. By car, take I-80 to Route 23 South or Garden State Parkway to Exit 151.",
    description: "Vibrant Essex County township known for arts, culture, and diverse neighborhoods",
    metaKeywords: ["Montclair NJ contractor", "Essex County remodeling", "Upper Montclair renovation", "07042 07043 contractor"],
    nearbyAreas: ["Glen Ridge", "Bloomfield", "Verona", "Cedar Grove"],
    demographics: {
      population: 38634,
      medianIncome: "$120,000+",
      avgHomeValue: "$650,000+"
    },
    permitInfo: {
      department: "Montclair Township Building Department",
      phone: "(973) 509-4950",
      address: "205 Claremont Avenue, Montclair, NJ 07042",
      portalUrl: "https://www.montclairnjusa.org/departments/building",
      requirements: [
        "Building permit for structural changes",
        "Electrical permit for panel upgrades",
        "Plumbing permit for new fixtures",
        "Historic Preservation Commission approval in historic districts",
        "Zoning approval for variances"
      ],
      processingTime: "10-14 business days",
      notes: "Montclair has multiple historic districts with additional review requirements"
    },
    faqs: [
      {
        question: "Does Montclair have historic district requirements?",
        answer: "Yes, Montclair has multiple historic districts where renovations require Historic Preservation Commission approval. This applies to exterior changes visible from public areas. We're experienced with these requirements and can help you navigate the approval process while preserving your home's character."
      },
      {
        question: "What neighborhoods do you serve in Montclair?",
        answer: "We serve all Montclair neighborhoods including Upper Montclair, South Montclair, Montclair Heights, and Watchung Plaza. Each area has unique architectural styles, and we tailor our approach to complement your neighborhood's character."
      },
      {
        question: "How much does a bathroom renovation cost in Montclair?",
        answer: "Bathroom renovations in Montclair typically range from $25,000 to $75,000+ depending on size and features. Premium features like heated floors, custom tile work, and spa showers are popular among Montclair homeowners looking to maximize their investment."
      },
      {
        question: "Can you renovate older Montclair homes while maintaining character?",
        answer: "Absolutely. Many Montclair homes have historic charm worth preserving. We specialize in blending modern amenities with period details, updating kitchens and bathrooms with contemporary functionality while respecting original millwork, windows, and architectural features."
      }
    ]
  },
  morristown: {
    name: "Morristown",
    slug: "morristown",
    county: "Morris County",
    zipCodes: ["07960", "07962", "07963"],
    neighborhoods: ["Historic Morristown", "Morris Plains", "Convent Station"],
    coordinates: { lat: 40.796944, lng: -74.481389 },
    drivingDirections: "From NYC: Take NJ Transit Morris & Essex Line to Morristown Station or drive via I-287 to Exit 36A (Morris Ave/Morristown).",
    description: "Historic Morris County seat with vibrant downtown and Revolutionary War heritage",
    metaKeywords: ["Morristown NJ contractor", "Morris County remodeling", "historic home renovation Morristown", "07960 contractor"],
    nearbyAreas: ["Morris Plains", "Madison", "Chatham", "Mendham"],
    demographics: {
      population: 18411,
      medianIncome: "$90,000+",
      avgHomeValue: "$550,000+"
    },
    permitInfo: {
      department: "Morristown Building Department",
      phone: "(973) 292-6636",
      address: "200 South Street, Morristown, NJ 07960",
      portalUrl: "https://www.townofmorristown.org/building-department",
      requirements: [
        "Construction permit for building modifications",
        "Electrical subcode permit",
        "Plumbing subcode permit",
        "Historic Preservation approval in historic district",
        "Zoning permit for use changes"
      ],
      processingTime: "7-14 business days",
      notes: "Morristown Historic District requires additional architectural review"
    },
    faqs: [
      {
        question: "What historic considerations apply to Morristown renovations?",
        answer: "Morristown's Historic District requires architectural review for exterior modifications. If your home is within the historic district, we'll guide you through the approval process while ensuring your renovation respects the town's Revolutionary War heritage and character."
      },
      {
        question: "How is Morristown different from other Morris County towns for renovations?",
        answer: "Morristown is the county seat with a vibrant downtown and mix of historic and modern homes. Renovations here often blend historic preservation with modern updates. We understand the local character and design renovations that fit seamlessly into Morristown's unique atmosphere."
      },
      {
        question: "Do you work on condos and townhomes in Morristown?",
        answer: "Yes, we handle renovations for condos, townhomes, and single-family homes in Morristown. For condos and townhomes, we coordinate with HOA requirements and building management while delivering the same quality craftsmanship as our single-family projects."
      },
      {
        question: "What's the best way to maximize my Morristown home's value through renovation?",
        answer: "Kitchen and bathroom remodels offer the best ROI in Morristown. Focus on quality finishes, functional layouts, and modern amenities. We provide guidance on which upgrades will have the greatest impact on your specific home and neighborhood."
      }
    ]
  },
  livingston: {
    name: "Livingston",
    slug: "livingston",
    county: "Essex County",
    zipCodes: ["07039"],
    neighborhoods: ["Livingston Center", "Riker Hill", "Collins Avenue Area"],
    coordinates: { lat: 40.795833, lng: -74.315278 },
    drivingDirections: "From NYC: Take I-280 West to Exit 5A (Livingston Ave) or Route 10 West to Livingston. Convenient Essex County location.",
    description: "Family-friendly Essex County township with excellent schools and recreation",
    metaKeywords: ["Livingston NJ contractor", "Essex County home improvement", "Livingston renovation contractor", "07039 contractor"],
    nearbyAreas: ["West Orange", "Roseland", "Florham Park", "East Hanover"],
    demographics: {
      population: 30021,
      medianIncome: "$130,000+",
      avgHomeValue: "$700,000+"
    },
    permitInfo: {
      department: "Livingston Township Building Department",
      phone: "(973) 535-7930",
      address: "357 South Livingston Avenue, Livingston, NJ 07039",
      portalUrl: "https://www.livingstonnj.org/departments/building",
      requirements: [
        "Building permit for structural work",
        "Electrical permit for service changes",
        "Plumbing permit for fixture installations",
        "Fire subcode permit when required",
        "Zoning approval for additions"
      ],
      processingTime: "7-14 business days",
      notes: "Livingston offers online permit applications and tracking"
    },
    faqs: [
      {
        question: "Why is Livingston popular for family home renovations?",
        answer: "Livingston is known for excellent schools and family-friendly neighborhoods. Many families invest in renovations to create more functional spaces—adding mudrooms, expanding kitchens, finishing basements for playrooms, or updating bathrooms. We help families design practical, beautiful spaces."
      },
      {
        question: "How long does a kitchen remodel take in Livingston?",
        answer: "A typical Livingston kitchen remodel takes 8-12 weeks from demolition to completion. This includes custom cabinetry lead times and thorough inspections. We provide a detailed timeline during planning so you can prepare accordingly."
      },
      {
        question: "Does Livingston offer online permit tracking?",
        answer: "Yes, Livingston Township has online permit applications and tracking. We handle all permitting for our clients, but you can also monitor your project's permit status online for added peace of mind."
      },
      {
        question: "What basement features are popular in Livingston homes?",
        answer: "Livingston homeowners often finish basements as family entertainment areas, home offices, gyms, or guest suites. With excellent schools drawing families to the area, playrooms and study spaces are particularly popular additions."
      }
    ]
  },
  "west-orange": {
    name: "West Orange",
    slug: "west-orange",
    county: "Essex County",
    zipCodes: ["07052"],
    neighborhoods: ["Llewellyn Park", "Pleasantdale", "Gregory", "Rock Spring"],
    coordinates: { lat: 40.798611, lng: -74.239167 },
    drivingDirections: "From NYC: Take NJ Transit bus to West Orange or drive via I-280 West to Exit 7 (Prospect Ave). Located in scenic Essex County.",
    description: "Historic Essex County township home to Thomas Edison's laboratory and Llewellyn Park",
    metaKeywords: ["West Orange NJ contractor", "Essex County remodeling", "Llewellyn Park renovation", "07052 contractor"],
    nearbyAreas: ["Orange", "South Orange", "Montclair", "Livingston"],
    demographics: {
      population: 48843,
      medianIncome: "$100,000+",
      avgHomeValue: "$500,000+"
    },
    permitInfo: {
      department: "West Orange Township Building Department",
      phone: "(973) 325-4110",
      address: "66 Main Street, West Orange, NJ 07052",
      portalUrl: "https://www.westorange.org/departments/building",
      requirements: [
        "Building permit for interior/exterior renovations",
        "Electrical permit for wiring changes",
        "Plumbing permit for plumbing work",
        "Llewellyn Park Association approval in Llewellyn Park",
        "Certificate of Occupancy inspection"
      ],
      processingTime: "7-14 business days",
      notes: "Llewellyn Park is a private community with additional architectural requirements"
    },
    faqs: [
      {
        question: "What's special about renovating in Llewellyn Park?",
        answer: "Llewellyn Park is America's first planned residential community and a private gated neighborhood with strict architectural guidelines. Renovations require approval from the Llewellyn Park Association in addition to township permits. We're experienced with these requirements and ensure all renovations meet community standards."
      },
      {
        question: "Do you renovate homes throughout West Orange?",
        answer: "Yes, we serve all West Orange neighborhoods including Llewellyn Park, Pleasantdale, Gregory, and Rock Spring. Each area has unique characteristics, and we tailor our approach to match your neighborhood's style and your home's architecture."
      },
      {
        question: "What historic features should be preserved in West Orange homes?",
        answer: "West Orange has rich history including Thomas Edison's laboratory. Many homes feature period details worth preserving. We specialize in updating functionality while respecting original woodwork, windows, and architectural details that give your home character."
      },
      {
        question: "How much does home renovation cost in West Orange?",
        answer: "Costs vary by project scope. Kitchen remodels range from $45,000-$120,000+, bathroom renovations $20,000-$60,000+, and basement finishing $40,000-$100,000+. We provide detailed estimates based on your specific project requirements."
      }
    ]
  },
  verona: {
    name: "Verona",
    slug: "verona",
    county: "Essex County",
    zipCodes: ["07044"],
    neighborhoods: ["Verona Center", "Forest Avenue", "Linden Avenue"],
    coordinates: { lat: 40.830556, lng: -74.240833 },
    drivingDirections: "From NYC: Take NJ Transit bus or drive via Route 23 South to Verona or I-280 to Exit 8 (Eisenhower Parkway).",
    description: "Charming Essex County borough known for small-town feel and excellent schools",
    metaKeywords: ["Verona NJ contractor", "Essex County home renovation", "Verona remodeling contractor", "07044 contractor"],
    nearbyAreas: ["Montclair", "Cedar Grove", "North Caldwell", "Essex Fells"],
    demographics: {
      population: 13332,
      medianIncome: "$140,000+",
      avgHomeValue: "$650,000+"
    },
    permitInfo: {
      department: "Verona Township Building Department",
      phone: "(973) 857-4834",
      address: "600 Bloomfield Avenue, Verona, NJ 07044",
      requirements: [
        "Building permit for construction work",
        "Electrical permit for electrical modifications",
        "Plumbing permit for plumbing work",
        "Zoning approval for additions",
        "CO inspection upon completion"
      ],
      processingTime: "7-10 business days",
      notes: "Verona has efficient permit processing for residential projects"
    },
    faqs: [
      {
        question: "What makes Verona a great place for home renovation?",
        answer: "Verona offers a charming small-town feel with excellent schools and rising property values. Investing in renovation helps homeowners capitalize on this growth. The borough's efficient permit process means projects can move quickly from planning to completion."
      },
      {
        question: "How fast can permits be processed in Verona?",
        answer: "Verona has one of the faster permit processing times in Essex County at 7-10 business days for standard residential projects. We handle all permitting and can provide accurate timeline expectations during your consultation."
      },
      {
        question: "What renovation projects add the most value in Verona?",
        answer: "Kitchen and bathroom updates offer excellent ROI in Verona's competitive market. With average home values around $650,000, quality renovations help your home stand out. Finished basements are also popular for growing families in the area."
      },
      {
        question: "Do you provide design services for Verona renovations?",
        answer: "Yes, we offer comprehensive design services including space planning, material selection, and 3D renderings. We help you visualize your renovation before construction begins and ensure every detail aligns with your vision."
      }
    ]
  },
  caldwell: {
    name: "Caldwell",
    slug: "caldwell",
    county: "Essex County",
    zipCodes: ["07006"],
    neighborhoods: ["Caldwell Borough", "Grover Cleveland Area", "Westville"],
    coordinates: { lat: 40.840278, lng: -74.276389 },
    drivingDirections: "From NYC: Take I-80 West to Exit 47B (Caldwell/Route 23 South) or I-280 West to Route 23 North. Located in northwestern Essex County.",
    description: "Historic Essex County borough birthplace of President Grover Cleveland",
    metaKeywords: ["Caldwell NJ contractor", "Essex County remodeling", "historic home renovation Caldwell", "07006 contractor"],
    nearbyAreas: ["West Caldwell", "North Caldwell", "Roseland", "Fairfield"],
    demographics: {
      population: 7970,
      medianIncome: "$120,000+",
      avgHomeValue: "$550,000+"
    },
    permitInfo: {
      department: "Caldwell Borough Building Department",
      phone: "(973) 226-6100",
      address: "1 Provost Square, Caldwell, NJ 07006",
      requirements: [
        "Building permit for renovations",
        "Electrical subcode permit",
        "Plumbing subcode permit",
        "Historic review for Grover Cleveland birthplace area",
        "Zoning permit for exterior changes"
      ],
      processingTime: "7-14 business days",
      notes: "Caldwell Borough has historic preservation guidelines near downtown"
    },
    faqs: [
      {
        question: "Does Caldwell have historic preservation requirements?",
        answer: "Yes, Caldwell Borough has historic preservation guidelines, especially near downtown and the Grover Cleveland birthplace area. If your home is in a designated area, we'll help you navigate the approval process while maintaining the historic character that makes Caldwell special."
      },
      {
        question: "What's the difference between Caldwell Borough and West Caldwell?",
        answer: "Caldwell Borough and West Caldwell are separate municipalities sharing the same zip code (07006). Each has its own building department and permit requirements. We're familiar with both and can handle projects in either community."
      },
      {
        question: "How do I start a home renovation project in Caldwell?",
        answer: "Contact us for a free consultation. We'll visit your home, discuss your goals, and provide preliminary estimates. From there, we develop detailed plans, handle permitting, and guide you through material selections before beginning construction."
      },
      {
        question: "What types of renovations are popular in Caldwell?",
        answer: "Caldwell homeowners often invest in kitchen updates, bathroom renovations, and basement finishing. Historic homes may also need updates to electrical, plumbing, or HVAC systems. We specialize in modernizing homes while preserving their character."
      }
    ]
  },
  "west-caldwell": {
    name: "West Caldwell",
    slug: "west-caldwell",
    county: "Essex County",
    zipCodes: ["07006"],
    neighborhoods: ["West Caldwell Township", "Westville Avenue", "Bloomfield Avenue"],
    coordinates: { lat: 40.851944, lng: -74.290833 },
    drivingDirections: "From NYC: Take I-280 West to Exit 5A (Livingston Ave) then Route 527 North, or I-80 West to Exit 47B. Located in northwestern Essex County.",
    description: "Suburban Essex County township with excellent schools and easy NYC commute",
    metaKeywords: ["West Caldwell NJ contractor", "Essex County remodeling", "home renovation West Caldwell", "07006 contractor"],
    nearbyAreas: ["Caldwell", "North Caldwell", "Essex Fells", "Fairfield"],
    demographics: {
      population: 10527,
      medianIncome: "$130,000+",
      avgHomeValue: "$600,000+"
    },
    permitInfo: {
      department: "West Caldwell Township Building Department",
      phone: "(973) 226-2300",
      address: "30 Clinton Road, West Caldwell, NJ 07006",
      requirements: [
        "Building permit for structural modifications",
        "Electrical permit for electrical work",
        "Plumbing permit for plumbing changes",
        "Zoning approval for additions",
        "Certificate of Occupancy inspection"
      ],
      processingTime: "7-14 business days",
      notes: "West Caldwell shares zip code with Caldwell Borough"
    },
    faqs: [
      {
        question: "What makes West Caldwell ideal for suburban renovations?",
        answer: "West Caldwell offers excellent schools, easy NYC commute, and family-friendly neighborhoods. Homeowners invest in renovations to maximize these benefits—updating kitchens for entertaining, adding home offices, or creating finished basements for growing families."
      },
      {
        question: "How do West Caldwell permits differ from Caldwell Borough?",
        answer: "West Caldwell Township has its own building department at 30 Clinton Road. While both share the 07006 zip code, permits must be obtained from the correct municipality. We determine which department your property falls under and handle all permitting accordingly."
      },
      {
        question: "What's the average home addition cost in West Caldwell?",
        answer: "Home additions in West Caldwell typically range from $80,000 to $250,000+ depending on size and complexity. We provide detailed estimates based on your specific plans and help you understand the investment needed to achieve your goals."
      },
      {
        question: "Can you help with second-story additions in West Caldwell?",
        answer: "Yes, we handle second-story additions including structural engineering, architectural design, and all construction. These projects require careful planning for zoning compliance and structural integrity—areas where our expertise ensures successful outcomes."
      }
    ]
  },
  "ho-ho-kus": {
    name: "Ho-Ho-Kus",
    slug: "ho-ho-kus",
    county: "Bergen County",
    zipCodes: ["07423"],
    neighborhoods: ["Ho-Ho-Kus Borough", "Sheridan Avenue", "Franklin Turnpike"],
    coordinates: { lat: 40.996944, lng: -74.100833 },
    drivingDirections: "From NYC: Take I-287 North to Exit 58 (Franklin Lakes/Ho-Ho-Kus) or NJ Transit bus. Located in scenic Bergen County.",
    description: "Quaint Bergen County borough known for historic charm and tree-lined streets",
    metaKeywords: ["Ho-Ho-Kus NJ contractor", "Bergen County remodeling", "historic home renovation Ho-Ho-Kus", "07423 contractor"],
    nearbyAreas: ["Ridgewood", "Waldwick", "Allendale", "Franklin Lakes"],
    demographics: {
      population: 4078,
      medianIncome: "$160,000+",
      avgHomeValue: "$800,000+"
    },
    permitInfo: {
      department: "Ho-Ho-Kus Borough Building Department",
      phone: "(201) 652-4400",
      address: "333 Warren Avenue, Ho-Ho-Kus, NJ 07423",
      requirements: [
        "Building permit for construction work",
        "Electrical permit for service modifications",
        "Plumbing permit for fixture changes",
        "Historic review for properties in historic district",
        "Zoning approval for exterior changes"
      ],
      processingTime: "7-14 business days",
      notes: "Ho-Ho-Kus maintains strict architectural guidelines for historic character"
    },
    faqs: [
      {
        question: "What historic guidelines apply to Ho-Ho-Kus renovations?",
        answer: "Ho-Ho-Kus maintains strict architectural guidelines to preserve its historic character. Exterior modifications may require review to ensure they complement the neighborhood's charm. We understand these requirements and design renovations that respect local standards while meeting your needs."
      },
      {
        question: "Why are tree-lined streets important for Ho-Ho-Kus renovations?",
        answer: "Ho-Ho-Kus is known for its beautiful tree-lined streets and quaint character. Renovations should respect this aesthetic. We design projects that enhance your home while maintaining the streetscape appeal that makes Ho-Ho-Kus special."
      },
      {
        question: "What's the typical renovation budget in Ho-Ho-Kus?",
        answer: "With average home values around $800,000, Ho-Ho-Kus homeowners typically invest $50,000-$150,000+ in renovations. Kitchen and bathroom updates are most common, with many also choosing basement finishing or additions to expand living space."
      },
      {
        question: "Do you work with Bergen County historic homes?",
        answer: "Yes, we specialize in renovating historic homes throughout Bergen County including Ho-Ho-Kus. We balance modern functionality with period-appropriate details, preserving your home's character while updating systems and finishes."
      }
    ]
  },
  maplewood: {
    name: "Maplewood",
    slug: "maplewood",
    county: "Essex County",
    zipCodes: ["07040"],
    neighborhoods: ["Maplewood Village", "Jefferson", "Hilton", "Prospect Hill"],
    coordinates: { lat: 40.733056, lng: -74.271667 },
    drivingDirections: "From NYC: Take NJ Transit Midtown Direct to Maplewood Station or drive via I-78 West to Exit 50B (Millburn/Maplewood). Located in central Essex County.",
    description: "Vibrant Essex County township known for arts scene, diverse community, and charming village center",
    metaKeywords: ["Maplewood NJ contractor", "Essex County remodeling", "home renovation Maplewood", "07040 contractor"],
    nearbyAreas: ["South Orange", "Millburn", "Irvington", "Newark"],
    demographics: {
      population: 24355,
      medianIncome: "$130,000+",
      avgHomeValue: "$600,000+"
    },
    permitInfo: {
      department: "Maplewood Township Building Department",
      phone: "(973) 762-8120",
      address: "574 Valley Street, Maplewood, NJ 07040",
      portalUrl: "https://www.twp.maplewood.nj.us/building",
      requirements: [
        "Building permit for structural modifications",
        "Electrical permit for electrical work",
        "Plumbing permit for plumbing changes",
        "Historic Commission review in historic areas",
        "Certificate of Occupancy inspection"
      ],
      processingTime: "7-14 business days",
      notes: "Maplewood has several historic districts with additional review requirements"
    },
    faqs: [
      {
        question: "Does Maplewood have historic district requirements?",
        answer: "Yes, Maplewood has several historic districts where exterior renovations require Historic Commission review. We're experienced with these requirements and can guide you through the approval process while preserving your home's character and the neighborhood's historic integrity."
      },
      {
        question: "What makes Maplewood unique for home renovations?",
        answer: "Maplewood is known for its vibrant arts scene, diverse community, and charming village center. Homes range from historic Victorians to mid-century modern. We tailor renovations to complement each home's style and the owner's lifestyle."
      },
      {
        question: "How competitive is the Maplewood housing market for renovations?",
        answer: "Maplewood's housing market is competitive, making quality renovations an excellent investment. Well-executed kitchen and bathroom updates can significantly impact resale value. We help you prioritize improvements that offer the best return."
      },
      {
        question: "Do you work in all Maplewood neighborhoods?",
        answer: "Yes, we serve all Maplewood neighborhoods including Maplewood Village, Jefferson, Hilton, and Prospect Hill. Each area has distinct character, and we design renovations that complement your specific neighborhood and home style."
      }
    ]
  },
  madison: {
    name: "Madison",
    slug: "madison",
    county: "Morris County",
    zipCodes: ["07940"],
    neighborhoods: ["Madison Borough", "Rose City", "Dodge Field Area", "Downtown Madison"],
    coordinates: { lat: 40.759722, lng: -74.417222 },
    drivingDirections: "From NYC: Take NJ Transit Morris & Essex Line to Madison Station or drive via I-287 to Route 24 West to Exit 2A (Madison Ave).",
    description: "Charming Morris County borough known as the 'Rose City' with historic downtown and top schools",
    metaKeywords: ["Madison NJ contractor", "Morris County remodeling", "home renovation Madison", "07940 contractor"],
    nearbyAreas: ["Chatham", "Florham Park", "Morristown", "Summit"],
    demographics: {
      population: 16105,
      medianIncome: "$150,000+",
      avgHomeValue: "$750,000+"
    },
    permitInfo: {
      department: "Madison Borough Building Department",
      phone: "(973) 593-3045",
      address: "50 Kings Road, Madison, NJ 07940",
      portalUrl: "https://www.rosenet.org/departments/building",
      requirements: [
        "Building permit for construction work",
        "Electrical permit for electrical modifications",
        "Plumbing permit for plumbing work",
        "Historic Preservation review in historic districts",
        "Zoning approval for additions"
      ],
      processingTime: "7-14 business days",
      notes: "Madison Borough has historic downtown area with architectural guidelines"
    },
    faqs: [
      {
        question: "Why is Madison called the 'Rose City'?",
        answer: "Madison earned the nickname 'Rose City' for its historic rose gardens and nursery industry. This heritage influences the community's character, with many homes featuring beautiful landscaping. We design renovations that complement Madison's charming aesthetic."
      },
      {
        question: "What architectural styles are common in Madison?",
        answer: "Madison features diverse architectural styles from historic Colonials and Victorians to mid-century and contemporary homes. We're experienced with all styles and ensure renovations respect your home's original character while adding modern functionality."
      },
      {
        question: "How do Madison's excellent schools affect renovation decisions?",
        answer: "Madison's top-rated schools attract families, making home improvements an excellent investment. Many homeowners focus on family-friendly features—larger kitchens, finished basements, additional bathrooms—to maximize their home's appeal and value."
      },
      {
        question: "What permits are required for Madison renovations?",
        answer: "Madison requires building, electrical, and plumbing permits for most renovations. Historic district properties may need additional approval. We handle all permitting, ensuring your project complies with local requirements and moves forward efficiently."
      }
    ]
  },
  parsippany: {
    name: "Parsippany",
    slug: "parsippany",
    county: "Morris County",
    zipCodes: ["07054", "07034"],
    neighborhoods: ["Lake Hiawatha", "Troy Hills", "Parsippany", "Lake Parsippany"],
    coordinates: { lat: 40.857778, lng: -74.426111 },
    drivingDirections: "From NYC: Take I-80 West to Exit 47 (Parsippany) or I-287 to Exit 39 (Route 10). Major Morris County township with excellent highway access.",
    description: "Major Morris County township with diverse housing options and corporate headquarters",
    metaKeywords: ["Parsippany NJ contractor", "Morris County remodeling", "home renovation Parsippany", "07054 contractor"],
    nearbyAreas: ["Morris Plains", "Boonton", "Mountain Lakes", "East Hanover"],
    demographics: {
      population: 53238,
      medianIncome: "$110,000+",
      avgHomeValue: "$500,000+"
    },
    permitInfo: {
      department: "Parsippany-Troy Hills Building Department",
      phone: "(973) 263-4350",
      address: "1001 Parsippany Boulevard, Parsippany, NJ 07054",
      portalUrl: "https://www.parsippany.net/building-department",
      requirements: [
        "Construction permit for building work",
        "Electrical subcode permit",
        "Plumbing subcode permit",
        "Fire protection permit when required",
        "Zoning permit for additions or expansions"
      ],
      processingTime: "7-14 business days",
      notes: "Parsippany has online permit application and inspection scheduling"
    },
    faqs: [
      {
        question: "What neighborhoods do you serve in Parsippany?",
        answer: "We serve all Parsippany neighborhoods including Lake Hiawatha, Troy Hills, Lake Parsippany, and the central Parsippany area. Each neighborhood has unique characteristics, and we tailor our approach to match your home and community."
      },
      {
        question: "Does Parsippany offer online permits?",
        answer: "Yes, Parsippany-Troy Hills offers online permit applications and inspection scheduling. We utilize these systems to streamline the permitting process for our clients, ensuring efficient project timelines."
      },
      {
        question: "What's the typical renovation cost in Parsippany?",
        answer: "With average home values around $500,000, Parsippany homeowners typically invest $40,000-$100,000+ in renovations. Kitchen and bathroom updates are most popular, followed by basement finishing and home additions."
      },
      {
        question: "How does Parsippany's corporate presence affect home values?",
        answer: "Parsippany's strong corporate presence and excellent highway access attract professionals who value quality renovations. Investing in your home helps capitalize on this demand, whether you're staying long-term or positioning for future sale."
      }
    ]
  },
  clifton: {
    name: "Clifton",
    slug: "clifton",
    county: "Passaic County",
    zipCodes: ["07011", "07012", "07013", "07014"],
    neighborhoods: ["Athenia", "Albion Place", "Richfield", "Montclair Heights", "Allwood"],
    coordinates: { lat: 40.858611, lng: -74.163889 },
    drivingDirections: "From NYC: Take Route 3 West to Clifton or I-80 West to Exit 61. Easily accessible Passaic County city near major highways.",
    description: "Diverse Passaic County city with established neighborhoods and convenient NYC access",
    metaKeywords: ["Clifton NJ contractor", "Passaic County remodeling", "home renovation Clifton", "07011 contractor"],
    nearbyAreas: ["Passaic", "Nutley", "Bloomfield", "Little Falls"],
    demographics: {
      population: 85540,
      medianIncome: "$75,000+",
      avgHomeValue: "$450,000+"
    },
    permitInfo: {
      department: "Clifton City Building Department",
      phone: "(973) 470-5820",
      address: "900 Clifton Avenue, Clifton, NJ 07013",
      portalUrl: "https://www.cliftonnj.org/departments/building",
      requirements: [
        "Construction permit for building modifications",
        "Electrical permit for electrical work",
        "Plumbing permit for plumbing changes",
        "Fire subcode permit for fire systems",
        "Certificate of Occupancy inspection"
      ],
      processingTime: "5-10 business days",
      notes: "Clifton has streamlined permit processing for residential renovations"
    },
    faqs: [
      {
        question: "How fast is permit processing in Clifton?",
        answer: "Clifton has one of the faster permit processing times in the area at 5-10 business days for residential renovations. This streamlined process helps projects move from planning to construction quickly. We handle all permitting on your behalf."
      },
      {
        question: "What neighborhoods do you serve in Clifton?",
        answer: "We serve all Clifton neighborhoods including Athenia, Albion Place, Richfield, Montclair Heights, and Allwood. Each area has distinct character, and we design renovations that complement your specific neighborhood."
      },
      {
        question: "Is Clifton a good investment for home renovation?",
        answer: "Yes, Clifton's diverse housing stock and convenient NYC access make it attractive for homebuyers. Quality renovations can significantly increase your home's value and appeal. We help you prioritize improvements that offer the best return on investment."
      },
      {
        question: "What renovation services are popular in Clifton?",
        answer: "Clifton homeowners commonly request kitchen remodels, bathroom updates, and basement finishing. Many also invest in exterior improvements and energy-efficient upgrades to modernize older homes while reducing utility costs."
      }
    ]
  },
  bloomfield: {
    name: "Bloomfield",
    slug: "bloomfield",
    county: "Essex County",
    zipCodes: ["07003"],
    neighborhoods: ["Brookdale", "Watsessing", "Silver Lake", "Center Bloomfield"],
    coordinates: { lat: 40.806944, lng: -74.186111 },
    drivingDirections: "From NYC: Take NJ Transit to Bloomfield Station or drive via Garden State Parkway Exit 151. Located in northeastern Essex County.",
    description: "Historic Essex County township with diverse neighborhoods and strong community spirit",
    metaKeywords: ["Bloomfield NJ contractor", "Essex County remodeling", "home renovation Bloomfield", "07003 contractor"],
    nearbyAreas: ["Montclair", "Glen Ridge", "Nutley", "Belleville"],
    demographics: {
      population: 49139,
      medianIncome: "$80,000+",
      avgHomeValue: "$400,000+"
    },
    permitInfo: {
      department: "Bloomfield Township Building Department",
      phone: "(973) 680-4009",
      address: "1 Municipal Plaza, Bloomfield, NJ 07003",
      portalUrl: "https://www.bloomfieldtwpnj.com/building",
      requirements: [
        "Building permit for construction",
        "Electrical permit for electrical work",
        "Plumbing permit for plumbing modifications",
        "Fire subcode permit when applicable",
        "Zoning approval for exterior changes"
      ],
      processingTime: "7-10 business days",
      notes: "Bloomfield offers convenient online permit applications"
    },
    faqs: [
      {
        question: "Does Bloomfield offer online permit applications?",
        answer: "Yes, Bloomfield Township offers convenient online permit applications. We utilize this system to streamline permitting for our clients, tracking progress and scheduling inspections electronically for faster project completion."
      },
      {
        question: "What neighborhoods do you serve in Bloomfield?",
        answer: "We serve all Bloomfield neighborhoods including Brookdale, Watsessing, Silver Lake, and Center Bloomfield. Each area has unique characteristics and housing stock, and we tailor our approach to match your specific neighborhood."
      },
      {
        question: "How does Bloomfield compare to nearby towns for renovations?",
        answer: "Bloomfield offers excellent value with average home prices around $400,000—lower than neighboring Montclair and Glen Ridge but with similar convenience and character. This makes it an ideal market for renovation investments that can significantly increase equity."
      },
      {
        question: "What types of homes are common in Bloomfield?",
        answer: "Bloomfield features diverse housing from historic Victorians and Colonials to Cape Cods and split-levels. Many homes have original character worth preserving. We specialize in updating functionality while respecting architectural heritage."
      }
    ]
  }
};

export const getLocationBySlug = (slug: string): LocationData | undefined => {
  return locationData[slug];
};

export const getAllLocations = (): LocationData[] => {
  return Object.values(locationData);
};

export const getLocationMetaTitle = (location: string, service?: string): string => {
  const loc = getLocationBySlug(location);
  if (!loc) return "";
  
  if (service) {
    const serviceMap: Record<string, string> = {
      'kitchen-remodeling': 'Kitchen Remodeling',
      'bathroom-renovation': 'Bathroom Renovation',
      'basement-finishing': 'Basement Finishing',
      'home-additions': 'Home Additions',
      'interior-finishing': 'Interior Finishing'
    };

    const serviceName = serviceMap[service] || service;
    // Pattern: "[Service] Contractor [City] NJ" — keyword-first like JMC, Magnolia, Blackbirdz (#1-3 rankers)
    // Brand appended by root layout template: "| La Vaca General Contractors"
    return `${serviceName} Contractor in ${loc.name}, NJ | Free Estimate`;
  }

  // Pattern: "Kitchen, Bathroom & Basement Remodeling [City] NJ" — specific services beat generic "home remodeling"
  // Competitors ranking #1-3 (JMC, Magnolia, G&L Sons) all lead with specific service keywords
  // Brand appended by root layout template: "| La Vaca General Contractors"
  return `Kitchen, Bathroom & Basement Remodeling in ${loc.name}, NJ`;
};

export const getLocationMetaDescription = (location: string, service?: string): string => {
  const loc = getLocationBySlug(location);
  if (!loc) return "";
  
  const neighborhoods = loc.neighborhoods.slice(0, 2).join(", ");
  const zipCode = loc.zipCodes[0];
  
  if (service) {
    const serviceMap: Record<string, string> = {
      'kitchen-remodeling': 'kitchen remodeling',
      'bathroom-renovation': 'bathroom renovation',
      'basement-finishing': 'basement finishing',
      'home-additions': 'home additions',
      'interior-finishing': 'interior finishing'
    };

    const serviceName = serviceMap[service] || service;
    // Competitor-proven pattern: specific service + city + trust + differentiator + phone CTA
    return `Trusted ${serviceName} contractor in ${loc.name}, NJ. 100% transparent pricing, daily photo updates on your project — no surprises. Licensed & insured, 5-star rated. Serving ${neighborhoods} (${zipCode}). Call (201) 212-4917 for your free estimate.`;
  }

  // Competitor-proven: lead with services (JMC, Magnolia, G&L Sons pattern) + La Vaca differentiator
  // Key insight: competitors ranking #1-5 all list specific services, include phone, and mention trust signals
  return `Top-rated kitchen, bathroom & basement remodeling contractor in ${loc.name}, NJ. You get 100% transparent pricing and daily updates on your project — we treat your home like it's ours. Licensed, insured, 5-star reviewed. Serving ${neighborhoods} (${zipCode}). Call (201) 212-4917.`;
};
// Comprehensive location data for Northern New Jersey

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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
      'home-additions': 'Home Addition'
    };
    
    const serviceName = serviceMap[service] || service;
    return `${serviceName} Contractor in ${loc.name}, NJ | Licensed & Insured | La Vaca`;
  }
  
  return `Home Remodeling Contractor in ${loc.name}, NJ | Licensed & Insured | La Vaca`;
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
      'home-additions': 'home addition'
    };
    
    const serviceName = serviceMap[service] || service;
    return `Expert ${serviceName} contractor serving ${loc.name}, ${neighborhoods} (${zipCode}). Licensed, insured, 5-star rated. Free estimates for ${loc.county} homeowners.`;
  }
  
  return `Premier home remodeling contractor in ${loc.name}, ${loc.county}. Serving ${neighborhoods}, ${zipCode} and surrounding areas. Licensed, insured, 5-star rated. Free estimates.`;
};
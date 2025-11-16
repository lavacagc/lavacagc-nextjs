// FAQ Data for different services
export const kitchenRemodelingFAQs = [
  {
    question: "How much does a kitchen remodel cost in New Jersey?",
    answer: "Kitchen remodeling costs in NJ typically range from $35,000 to $85,000, depending on the size, materials, and complexity. Luxury renovations can exceed $100,000. We provide detailed estimates based on your specific needs and budget."
  },
  {
    question: "How long does a kitchen renovation take?",
    answer: "Most kitchen renovations take 4-8 weeks to complete. Timeline depends on the scope of work, custom elements, and permit requirements. We provide a detailed timeline during the planning phase."
  },
  {
    question: "Do I need permits for my kitchen remodel?",
    answer: "Permits are typically required for electrical, plumbing, or structural changes. We handle all permit applications and ensure your project meets local building codes and regulations."
  },
  {
    question: "Can I live in my home during the renovation?",
    answer: "While possible, it can be challenging. We recommend setting up a temporary kitchen area and discuss accommodation options during our consultation to minimize disruption."
  },
  {
    question: "What's included in your kitchen remodeling service?",
    answer: "Our service includes design consultation, demolition, electrical and plumbing updates, cabinet installation, countertops, flooring, painting, and final cleanup. We handle every aspect of your renovation."
  }
];

export const bathroomRenovationFAQs = [
  {
    question: "How much does a bathroom renovation cost?",
    answer: "Bathroom renovations in New Jersey typically cost between $15,000 and $45,000. The price varies based on size, fixtures, materials, and complexity of the work required."
  },
  {
    question: "How long does a bathroom remodel take?",
    answer: "Most bathroom renovations take 2-4 weeks to complete. Complex projects with custom features may take longer. We provide a detailed timeline during planning."
  },
  {
    question: "Can you work around my schedule?",
    answer: "Yes, we work with homeowners to minimize disruption. For homes with multiple bathrooms, we can schedule work to ensure you always have access to facilities."
  },
  {
    question: "Do you handle plumbing and electrical work?",
    answer: "Absolutely. Our licensed professionals handle all plumbing and electrical updates, ensuring everything meets current codes and safety standards."
  },
  {
    question: "What fixtures and materials do you recommend?",
    answer: "We recommend high-quality, water-efficient fixtures from trusted brands. During consultation, we'll discuss options that fit your style, budget, and maintenance preferences."
  }
];

export const basementFinishingFAQs = [
  {
    question: "How much does basement finishing cost?",
    answer: "Basement finishing typically costs $25,000 to $75,000 in New Jersey, depending on size, features, and finishes. We provide detailed estimates based on your specific vision and requirements."
  },
  {
    question: "How do you handle moisture and waterproofing?",
    answer: "We start with thorough moisture assessment and implement proper waterproofing, vapor barriers, and ventilation systems to ensure a dry, comfortable living space."
  },
  {
    question: "What can I use my finished basement for?",
    answer: "Finished basements are perfect for family rooms, home offices, guest suites, entertainment areas, home gyms, or rental units. We design spaces to match your lifestyle needs."
  },
  {
    question: "Do you need permits for basement finishing?",
    answer: "Yes, permits are typically required for electrical, plumbing, and egress windows. We handle all permit applications and ensure compliance with local building codes."
  },
  {
    question: "How long does basement finishing take?",
    answer: "Most basement finishing projects take 4-8 weeks, depending on size and complexity. We provide detailed timelines during the planning phase."
  }
];

// Review data
export const customerReviews = [
  {
    author: "Sarah M.",
    rating: 5,
    text: "Outstanding kitchen renovation! The team was professional, on time, and the quality exceeded our expectations. Our new kitchen is absolutely beautiful.",
    date: "2024-08-15",
    location: "Alpine, NJ",
    service: "Kitchen Remodeling"
  },
  {
    author: "Michael R.",
    rating: 5,
    text: "Incredible bathroom transformation. They handled everything from design to completion. The attention to detail and craftsmanship is remarkable.",
    date: "2024-07-22",
    location: "Short Hills, NJ",
    service: "Bathroom Renovation"
  },
  {
    author: "Jennifer L.",
    rating: 5,
    text: "Our basement went from unused storage to a beautiful family room. The team was clean, professional, and finished ahead of schedule.",
    date: "2024-06-30",
    location: "Montclair, NJ",
    service: "Basement Finishing"
  },
  {
    author: "David K.",
    rating: 5,
    text: "Home addition exceeded all expectations. They seamlessly integrated the new space with our existing home. Couldn't be happier with the results.",
    date: "2024-06-10",
    location: "Millburn, NJ",
    service: "Home Additions"
  },
  {
    author: "Lisa T.",
    rating: 5,
    text: "Professional service from start to finish. Great communication, quality work, and they stayed within budget. Highly recommend for any remodeling project.",
    date: "2024-05-28",
    location: "Verona, NJ",
    service: "Kitchen Remodeling"
  },
  {
    author: "Robert H.",
    rating: 5,
    text: "Amazing craftsmanship and attention to detail. Our new bathroom is like a spa retreat. The team was respectful and cleaned up daily.",
    date: "2024-05-15",
    location: "Livingston, NJ",
    service: "Bathroom Renovation"
  }
];

// Pricing data
export const kitchenPricingOptions = [
  {
    name: "Essential Kitchen",
    price: {
      min: 35000,
      max: 55000,
      unit: "project",
      currency: "USD"
    },
    description: "Complete kitchen renovation with quality finishes and modern functionality.",
    features: [
      "Custom cabinet installation",
      "Granite or quartz countertops",
      "New appliance installation",
      "Updated plumbing and electrical",
      "Premium flooring installation",
      "Fresh paint and trim work"
    ],
    timeline: "4-6 weeks"
  },
  {
    name: "Premium Kitchen",
    price: {
      min: 55000,
      max: 85000,
      unit: "project",
      currency: "USD"
    },
    description: "Luxury kitchen transformation with high-end materials and custom features.",
    features: [
      "Custom cabinetry with soft-close hardware",
      "Premium stone countertops",
      "High-end appliance package",
      "Under-cabinet lighting",
      "Tile backsplash installation",
      "Hardwood or luxury vinyl flooring",
      "Recessed lighting upgrade"
    ],
    popular: true,
    timeline: "6-8 weeks"
  },
  {
    name: "Luxury Kitchen",
    price: {
      min: 85000,
      max: 150000,
      unit: "project",
      currency: "USD"
    },
    description: "Ultimate kitchen renovation with designer finishes and premium everything.",
    features: [
      "Custom millwork and cabinetry",
      "Exotic stone countertops",
      "Professional-grade appliances",
      "Smart home integration",
      "Custom tile and stone work",
      "Premium hardwood flooring",
      "Architectural lighting design",
      "Wine storage solutions"
    ],
    timeline: "8-12 weeks"
  }
];

export const bathroomPricingOptions = [
  {
    name: "Standard Bathroom",
    price: {
      min: 15000,
      max: 25000,
      unit: "project",
      currency: "USD"
    },
    description: "Complete bathroom renovation with modern fixtures and quality finishes.",
    features: [
      "New vanity and countertop",
      "Tile shower or tub surround",
      "Modern fixtures and hardware",
      "Ceramic or porcelain flooring",
      "Updated lighting and ventilation",
      "Fresh paint and trim"
    ],
    timeline: "2-3 weeks"
  },
  {
    name: "Premium Bathroom",
    price: {
      min: 25000,
      max: 45000,
      unit: "project",
      currency: "USD"
    },
    description: "Luxury bathroom transformation with spa-like features and premium materials.",
    features: [
      "Custom vanity with stone countertops",
      "Walk-in shower with glass enclosure",
      "High-end fixtures and fittings",
      "Natural stone or luxury tile flooring",
      "Heated floors (optional)",
      "Recessed lighting and ventilation fan",
      "Custom mirror and storage solutions"
    ],
    popular: true,
    timeline: "3-4 weeks"
  }
];

// How-to process data
export const kitchenRemodelingProcess = {
  name: "Kitchen Remodeling Process",
  description: "Our comprehensive 8-step process ensures your kitchen renovation is completed efficiently with exceptional results.",
  totalTime: "P6W", // ISO 8601 duration format (6 weeks)
  estimatedCost: {
    currency: "USD",
    value: 60000
  },
  difficulty: "Professional" as const,
  tools: [
    "Professional demolition equipment",
    "Precision measuring tools",
    "Licensed electrical tools",
    "Plumbing installation equipment",
    "Cabinet installation hardware"
  ],
  materials: [
    "Custom cabinetry",
    "Stone countertops",
    "Quality appliances",
    "Electrical components",
    "Plumbing fixtures",
    "Flooring materials",
    "Paint and finishes"
  ],
  steps: [
    {
      name: "Initial Consultation and Design",
      text: "We meet with you to understand your vision, assess your space, take measurements, and create a detailed design plan that fits your lifestyle and budget.",
      tool: "Design software and measuring equipment"
    },
    {
      name: "Permits and Planning",
      text: "We handle all necessary permits and create a detailed project timeline, ordering materials and scheduling subcontractors for seamless execution.",
      supply: "Permit applications and project documentation"
    },
    {
      name: "Demolition and Preparation",
      text: "Careful removal of existing fixtures, cabinets, and finishes while protecting your home. We prepare the space for new installations.",
      tool: "Professional demolition equipment"
    },
    {
      name: "Rough-in Work",
      text: "Licensed professionals update electrical wiring, plumbing, and HVAC systems according to your new kitchen layout and local building codes.",
      supply: "Electrical and plumbing components"
    },
    {
      name: "Drywall and Painting",
      text: "Installation of drywall, proper insulation, and preparation for painting. We apply primer and paint in your chosen colors.",
      supply: "Drywall, insulation, paint, and primers"
    },
    {
      name: "Flooring Installation",
      text: "Professional installation of your selected flooring material, ensuring proper subfloor preparation and precise fitting around cabinetry.",
      supply: "Flooring materials and underlayment"
    },
    {
      name: "Cabinet and Countertop Installation",
      text: "Precise installation of custom cabinetry followed by professional countertop installation with proper support and sealing.",
      supply: "Custom cabinets and stone countertops"
    },
    {
      name: "Final Details and Cleanup",
      text: "Installation of fixtures, hardware, backsplash, and appliances. Thorough cleaning and final walkthrough to ensure your complete satisfaction.",
      supply: "Fixtures, hardware, and appliances"
    }
  ]
};

// Optimized list content
export const kitchenBenefits = [
  {
    text: "Increased Home Value",
    description: "A quality kitchen renovation can increase your home's value by 15-25%, making it one of the best investments you can make.",
    highlight: true
  },
  {
    text: "Enhanced Functionality",
    description: "Modern layouts and storage solutions maximize space efficiency and improve your daily cooking experience."
  },
  {
    text: "Energy Efficiency",
    description: "New appliances and lighting reduce energy costs while providing better performance and reliability."
  },
  {
    text: "Improved Safety",
    description: "Updated electrical and plumbing systems ensure your kitchen meets current safety codes and standards."
  },
  {
    text: "Personalized Design",
    description: "Custom solutions tailored to your lifestyle, cooking habits, and aesthetic preferences."
  }
];

export const bathroomBenefits = [
  {
    text: "Spa-Like Retreat",
    description: "Transform your bathroom into a relaxing sanctuary with luxury finishes and modern amenities.",
    highlight: true
  },
  {
    text: "Water Efficiency",
    description: "Modern fixtures reduce water usage while maintaining excellent performance and comfort."
  },
  {
    text: "Enhanced Storage",
    description: "Custom vanities and storage solutions maximize space and reduce clutter."
  },
  {
    text: "Improved Lighting",
    description: "Proper lighting design enhances functionality and creates ambiance for relaxation."
  },
  {
    text: "Universal Design",
    description: "Age-in-place features ensure your bathroom remains accessible and comfortable for years to come."
  }
];
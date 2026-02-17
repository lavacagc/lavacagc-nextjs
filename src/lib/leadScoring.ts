/**
 * Lead Scoring System for La Vaca GC
 * 
 * Scores leads based on multiple factors to prioritize follow-up efforts.
 * Scoring criteria:
 * - Service type (50-95 pts)
 * - Location match (20 pts bonus)
 * - Contact info completeness (25 pts max)
 * - Lead source quality (5-20 pts)
 * - Budget indicators (10-20 pts)
 */

export interface LeadScoringInput {
  // Project details
  projectType?: string | null;
  inquiry_type?: string | null;
  
  // Location
  city?: string | null;
  zip_code?: string | null;
  street_address?: string | null;
  
  // Contact info
  email?: string | null;
  phone?: string | null;
  
  // Source
  source?: string | null;
  
  // Budget indicators (from message, project_description, or metadata)
  message?: string | null;
  project_description?: string | null;
  metadata?: Record<string, unknown> | null;
  
  // Calculator-specific
  combined_total?: number | null;
  estimate_range_max?: number | null;
}

export interface LeadScoringResult {
  score: number;
  tier: 'hot' | 'warm' | 'cold';
  reasons: string[];
}

// Service areas in Northern NJ (primary markets)
const SERVICE_AREAS = [
  'montclair', 'west orange', 'livingston', 'short hills', 'maplewood',
  'millburn', 'summit', 'chatham', 'madison', 'morristown',
  'verona', 'caldwell', 'west caldwell', 'essex fells', 'bloomfield',
  'parsippany', 'florham park', 'cedar grove', 'alpine', 'saddle river',
  'ho-ho-kus', 'kinnelon', 'clifton', 'rahway'
];

// Service area ZIP codes
const SERVICE_ZIPS = [
  '07042', '07043', '07052', '07078', '07040', // Montclair, Maplewood, West Orange
  '07039', '07041', '07092', // Livingston, Millburn, Short Hills
  '07901', '07902', '07928', // Summit, Chatham
  '07960', '07940', '07950', // Morristown, Madison
  '07044', '07006', '07009', // Verona, Caldwell, West Caldwell
  '07021', '07003', // Essex Fells, Bloomfield
  '07054', '07950', '07932', // Parsippany, Florham Park, Cedar Grove
  '07401', '07458', '07423', // Alpine, Saddle River, Ho-Ho-Kus
  '07405', '07013', '07065'  // Kinnelon, Clifton, Rahway
];

/**
 * Score a lead based on multiple weighted factors
 */
export function scoreLead(input: LeadScoringInput): LeadScoringResult {
  let score = 0;
  const reasons: string[] = [];

  // 1. Service Type Scoring (50-95 points)
  const projectType = (input.projectType || input.inquiry_type || '').toLowerCase();
  
  if (projectType.includes('whole home') || projectType === 'whole_home') {
    score += 95;
    reasons.push('Whole home remodel (+95pts)');
  } else if (projectType.includes('kitchen')) {
    score += 90;
    reasons.push('Kitchen remodel (+90pts)');
  } else if (projectType.includes('addition') || projectType.includes('home addition')) {
    score += 85;
    reasons.push('Home addition (+85pts)');
  } else if (projectType.includes('bathroom')) {
    score += 80;
    reasons.push('Bathroom remodel (+80pts)');
  } else if (projectType.includes('basement')) {
    score += 70;
    reasons.push('Basement finish (+70pts)');
  } else if (projectType) {
    score += 50;
    reasons.push('Other project type (+50pts)');
  }

  // 2. Location Match (20 points bonus)
  const city = (input.city || '').toLowerCase().trim();
  const zipCode = (input.zip_code || '').trim();
  
  const isServiceArea = SERVICE_AREAS.some(area => city.includes(area)) ||
                        SERVICE_ZIPS.includes(zipCode);
  
  if (isServiceArea) {
    score += 20;
    reasons.push(`In service area: ${input.city || input.zip_code} (+20pts)`);
  }

  // 3. Contact Info Completeness (up to 25 points)
  if (input.phone) {
    score += 15;
    reasons.push('Has phone number (+15pts)');
  }
  
  if (input.email) {
    score += 10;
    reasons.push('Has email (+10pts)');
  }

  // 4. Lead Source Quality (5-20 points)
  const source = (input.source || '').toLowerCase();
  
  if (source.includes('calculator')) {
    score += 20;
    reasons.push('Calculator lead (+20pts)');
  } else if (source.includes('contact') || source.includes('form')) {
    score += 15;
    reasons.push('Contact form lead (+15pts)');
  } else if (source.includes('chatbot') || source.includes('chat')) {
    score += 10;
    reasons.push('Chatbot lead (+10pts)');
  } else if (source.includes('exit')) {
    score += 5;
    reasons.push('Exit intent lead (+5pts)');
  }

  // 5. Budget Indicators (10-20 points)
  let budgetMentioned = false;
  
  // Check calculator estimate
  if (input.combined_total && input.combined_total > 50000) {
    score += 20;
    reasons.push(`High budget project: $${Math.round(input.combined_total).toLocaleString()} (+20pts)`);
    budgetMentioned = true;
  } else if (input.estimate_range_max && input.estimate_range_max > 50000) {
    score += 20;
    reasons.push(`High budget estimate: $${Math.round(input.estimate_range_max).toLocaleString()} (+20pts)`);
    budgetMentioned = true;
  } else if (input.combined_total && input.combined_total > 25000) {
    score += 10;
    reasons.push(`Mid budget project: $${Math.round(input.combined_total).toLocaleString()} (+10pts)`);
    budgetMentioned = true;
  } else if (input.estimate_range_max && input.estimate_range_max > 25000) {
    score += 10;
    reasons.push(`Mid budget estimate: $${Math.round(input.estimate_range_max).toLocaleString()} (+10pts)`);
    budgetMentioned = true;
  }
  
  // Check message/description for budget keywords if not found in calculator
  if (!budgetMentioned) {
    const text = `${input.message || ''} ${input.project_description || ''}`.toLowerCase();
    const metadata = input.metadata ? JSON.stringify(input.metadata).toLowerCase() : '';
    const fullText = `${text} ${metadata}`;
    
    // High budget indicators
    if (
      fullText.match(/\$\s*([5-9]\d{4,}|[1-9]\d{5,})/) || // $50k+
      fullText.includes('100k') || fullText.includes('100,000') ||
      fullText.includes('luxury') || fullText.includes('high-end') ||
      fullText.includes('premium')
    ) {
      score += 20;
      reasons.push('High budget mentioned in text (+20pts)');
    }
    // Mid budget indicators
    else if (
      fullText.match(/\$\s*([2-4]\d{4})/) || // $25k-49k
      fullText.includes('25k') || fullText.includes('30k') ||
      fullText.includes('40k')
    ) {
      score += 10;
      reasons.push('Mid budget mentioned in text (+10pts)');
    }
  }

  // Determine tier
  let tier: 'hot' | 'warm' | 'cold';
  if (score >= 80) {
    tier = 'hot';
  } else if (score >= 50) {
    tier = 'warm';
  } else {
    tier = 'cold';
  }

  return {
    score,
    tier,
    reasons
  };
}

/**
 * Helper to extract lead scoring input from a generic lead object
 */
export function prepareLeadForScoring(lead: Record<string, unknown>): LeadScoringInput {
  return {
    projectType: lead.project_type as string | null,
    inquiry_type: lead.inquiry_type as string | null,
    city: lead.city as string | null,
    zip_code: lead.zip_code as string | null,
    street_address: lead.street_address as string | null,
    email: lead.email as string | null,
    phone: lead.phone as string | null,
    source: lead.source as string | null,
    message: lead.message as string | null,
    project_description: lead.project_description as string | null,
    metadata: lead.metadata as Record<string, unknown> | null,
    combined_total: lead.combined_total as number | null,
    estimate_range_max: lead.estimate_range_max as number | null,
  };
}

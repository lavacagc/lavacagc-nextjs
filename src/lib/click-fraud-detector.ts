/**
 * Server-side click fraud detection utility.
 * Tracks IP addresses + click patterns in Supabase and flags suspicious activity.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Known datacenter / cloud provider IP ranges (CIDR prefixes)
// These are commonly used by click bots and fraud operations
const DATACENTER_PREFIXES = [
  // AWS
  '3.', '13.', '18.', '34.', '35.', '44.', '46.51.', '50.16.', '50.17.', '50.19.',
  '52.', '54.', '67.202.', '72.44.', '75.101.', '107.20.', '107.21.', '107.22.',
  '174.129.', '184.72.', '184.73.', '204.236.',
  // Google Cloud
  '34.', '35.', '104.196.', '104.197.', '104.198.', '104.199.',
  '130.211.', '146.148.', '162.222.', '173.255.',
  // Azure
  '13.64.', '13.65.', '13.66.', '13.67.', '13.68.', '13.69.', '13.70.',
  '13.71.', '13.72.', '13.73.', '13.74.', '13.75.', '13.76.', '13.77.',
  '20.', '23.96.', '23.97.', '23.98.', '23.99.', '23.100.', '23.101.', '23.102.',
  '40.64.', '40.65.', '40.66.', '40.67.', '40.68.', '40.69.', '40.70.',
  '40.71.', '40.74.', '40.75.', '40.76.', '40.77.', '40.78.', '40.79.',
  '40.80.', '40.81.', '40.82.', '40.83.', '40.84.', '40.85.', '40.86.',
  '40.87.', '40.88.', '40.89.', '40.90.', '40.91.', '40.112.', '40.113.',
  '40.114.', '40.115.', '40.116.', '40.117.', '40.118.', '40.119.', '40.120.',
  '40.121.', '40.122.', '40.123.', '40.124.', '40.125.', '40.126.', '40.127.',
  '51.', '52.', '65.52.', '70.37.', '104.40.', '104.41.', '104.42.', '104.43.',
  '104.44.', '104.45.', '104.46.', '104.47.', '104.208.', '104.209.', '104.210.', '104.211.',
  '104.214.', '104.215.',
  // DigitalOcean
  '45.55.', '67.205.', '68.183.', '104.131.', '104.236.', '107.170.',
  '128.199.', '134.209.', '138.68.', '138.197.', '139.59.', '142.93.',
  '146.185.', '157.230.', '159.65.', '159.89.', '159.203.', '161.35.',
  '162.243.', '163.47.', '164.90.', '165.22.', '165.227.', '167.71.',
  '167.99.', '167.172.', '170.64.', '174.138.', '178.62.', '178.128.',
  '188.166.', '192.34.', '198.199.', '198.211.', '206.189.', '207.154.',
  '209.97.',
  // Hetzner
  '5.9.', '78.46.', '88.99.', '88.198.', '136.243.', '138.201.', '144.76.',
  '148.251.', '159.69.', '167.235.', '168.119.', '176.9.', '178.63.',
  '195.201.',
  // OVH
  '5.39.', '5.196.', '37.59.', '37.187.', '46.105.', '51.38.', '51.68.',
  '51.75.', '51.77.', '51.79.', '51.83.', '51.89.', '51.91.', '51.161.',
  '51.178.', '51.195.', '51.210.', '51.222.', '54.36.', '54.37.', '54.38.',
  '57.128.', '57.129.', '135.125.', '137.74.', '139.99.', '141.94.',
  '141.95.', '142.4.', '142.44.', '144.217.', '145.239.', '147.135.',
  '149.56.', '151.80.', '158.69.', '164.132.', '167.114.', '176.31.',
  '178.32.', '178.33.', '185.12.', '188.165.', '192.95.', '192.99.',
  '193.70.', '198.27.', '198.50.', '198.100.', '198.245.',
];

// Known bot user agent patterns
const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /scrape/i, /headless/i,
  /phantom/i, /selenium/i, /puppeteer/i, /playwright/i,
  /wget/i, /curl/i, /python-requests/i, /httpie/i,
  /ahrefs/i, /semrush/i, /moz/i, /yandex/i, /baidu/i,
  /lighthouse/i, /pagespeed/i, /gtmetrix/i,
];

function isDatacenterIP(ip: string): boolean {
  return DATACENTER_PREFIXES.some(prefix => ip.startsWith(prefix));
}

function isBotUserAgent(userAgent: string): boolean {
  return BOT_UA_PATTERNS.some(pattern => pattern.test(userAgent));
}

interface ClickTrackingRecord {
  ip_address: string;
  user_agent: string | null;
  gclid: string | null;
  page_url: string | null;
  referrer: string | null;
  is_suspicious: boolean;
  fraud_reason: string | null;
  session_id: string | null;
}

/**
 * Check if a click appears fraudulent based on IP, user agent, and click patterns.
 */
export async function isClickFraudulent(
  ip: string,
  userAgent: string,
): Promise<boolean> {
  // Quick checks first (no DB needed)
  if (isBotUserAgent(userAgent)) {
    return true;
  }

  if (isDatacenterIP(ip)) {
    return true;
  }

  // Check click frequency in Supabase
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('click_tracking')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('click_timestamp', oneHourAgo);

    if (error) {
      console.error('Click fraud check DB error:', error);
      return false; // Don't block on DB errors
    }

    // >5 clicks from same IP in 1 hour = suspicious
    if (count !== null && count > 5) {
      return true;
    }
  } catch (err) {
    console.error('Click fraud detection error:', err);
    return false;
  }

  return false;
}

/**
 * Record a click event for fraud tracking.
 */
export async function recordClick(data: {
  ip: string;
  userAgent: string | null;
  gclid: string | null;
  pageUrl: string | null;
  referrer: string | null;
  sessionId: string | null;
}): Promise<void> {
  const isSuspicious = data.userAgent
    ? await isClickFraudulent(data.ip, data.userAgent)
    : false;

  let fraudReason: string | null = null;
  if (isSuspicious && data.userAgent) {
    if (isBotUserAgent(data.userAgent)) {
      fraudReason = 'bot_user_agent';
    } else if (isDatacenterIP(data.ip)) {
      fraudReason = 'datacenter_ip';
    } else {
      fraudReason = 'high_click_frequency';
    }
  }

  const record: ClickTrackingRecord = {
    ip_address: data.ip,
    user_agent: data.userAgent,
    gclid: data.gclid,
    page_url: data.pageUrl,
    referrer: data.referrer,
    is_suspicious: isSuspicious,
    fraud_reason: fraudReason,
    session_id: data.sessionId,
  };

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    await supabase.from('click_tracking').insert(record);
  } catch (err) {
    console.error('Failed to record click:', err);
  }
}

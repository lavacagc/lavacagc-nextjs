import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { scoreLead, prepareLeadForScoring } from '@/lib/leadScoring';
import { sanitizeLeadForInsert } from '@/lib/leadSanitize';
import { sendTelegramLead } from '@/lib/notify/telegramLead';
import { sendFormFailureAlert } from '@/lib/notify/formErrorAlert';
import { createLeadFollowUpSequence } from '@/lib/notify/leadFollowUp';
import { checkRateLimit as ipRateLimit, getClientIp } from '@/lib/rateLimit';
import { cleanEnv } from '@/lib/envClean';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Anon client for chat_conversations (permissive RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Direct REST helper for leads table (bypasses RLS with secret key)
async function leadsQuery(method: 'GET' | 'POST', params?: string, body?: Record<string, unknown>): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    console.error('SUPABASE_SECRET_KEY not configured — leads query will fail');
    return { data: null, error: 'No secret key' };
  }
  try {
    const url = `${SUPABASE_URL}/rest/v1/leads${params ? `?${params}` : ''}`;
    const headers: Record<string, string> = {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    };
    if (method === 'POST') {
      headers['Prefer'] = 'return=representation';
    }
    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Leads ${method} failed:`, res.status, errText);
      return { data: null, error: errText };
    }
    const data = await res.json();
    return { data: Array.isArray(data) ? data : [data], error: null };
  } catch (err) {
    console.error(`Leads ${method} exception:`, err);
    return { data: null, error: String(err) };
  }
}

const KNOWLEDGE_BASE = `# La Vaca General Contractors — AI Chatbot Knowledge Base

## Company Info
- **Name:** La Vaca General Contractors, LLC
- **Phone:** (201) 212-4917
- **Email:** info@lavacagc.com
- **Website:** lavacagc.com
- **License:** HIC# 13VH13373800
- **Status:** Licensed, Bonded, & Insured
- **Type:** Family-Owned & Operated
- **Location:** Northern New Jersey
- **Service Radius:** 25 miles from base in Northern NJ

## Services
1. **Kitchen Remodeling** — Custom cabinetry, premium appliance installation, quartz & granite countertops, modern lighting
2. **Bathroom Renovations** — Spa-like features, custom vanities, heated floors, smart fixtures
3. **Basement Finishing** — Entertainment rooms, home offices, guest suites, full bathroom installation
4. **Home Additions** — Second-story additions, sunroom construction, in-law suites, garage conversions
5. **Whole Home Remodels** — Open concept design, structural changes, complete renovation, project management
6. **Custom Living Spaces** — Home additions, sunrooms, custom designs, permit handling
7. **Interior Finishing** — Various interior finishing services

## Service Areas (Northern NJ)
Alpine, Bloomfield, Caldwell, Cedar Grove, Chatham, Clifton, Essex Fells, Florham Park, Ho-Ho-Kus, Kinnelon, Livingston, Madison, Maplewood, Millburn, Montclair, Morristown, Parsippany, Rahway, Saddle River, Short Hills, Summit, Verona, West Caldwell, West Orange

If someone asks about an area not listed: "We serve most of Northern New Jersey within a 25-mile radius. Let me get your details and we'll confirm we can help!"

## Process
1. Free estimate / consultation
2. Detailed project planning with transparent pricing
3. Dedicated project manager assigned
4. Construction with quality control
5. Final walkthrough and warranty

## Pricing Guidance
- Do NOT give specific prices
- Say: "Every project is unique. We offer free estimates — let me help you schedule one!"
- If pressed: "Kitchen renovations in Northern NJ typically range from $25,000-$80,000+ depending on scope. A bathroom might be $15,000-$40,000+. But the best way to get an accurate number is our free estimate."
- Always steer toward booking the free estimate

## Key Selling Points
- Licensed, Bonded, & Insured (HIC# 13VH13373800)
- Family-owned & operated
- Dedicated project manager for every project
- Warranty-backed craftsmanship
- On-time, on-budget commitment
- 5.0 Google Rating
- Transparent pricing, no hidden costs

## Customer Reviews (Use as social proof)
- Ray S: "Professional, responsive, dedicated to quality work... The finished basement looks fantastic"
- Tom V: "Great with our office redesign... very responsive, fair price"
- Kevin H: "Completed the job on time and with great attention to detail... exceeded our expectations"
- Gerrick K: "Unbelievably communicative and transparent... The final result is beyond anything we could have imagined"`;

const SYSTEM_PROMPT = `You are the La Vaca General Contractors virtual assistant. You help potential customers learn about our home renovation services in Northern New Jersey.

${KNOWLEDGE_BASE}

## Your Behavior Rules:
- Be friendly, professional, warm — like a helpful neighbor who knows about home renovation
- Use "we" when referring to La Vaca (you represent the company)
- Keep responses concise: 2-3 sentences max unless they ask for detail
- NEVER give exact prices — always suggest a free estimate
- NEVER badmouth competitors
- If someone asks about services we don't offer, politely explain what we do offer
- If you're unsure about something, offer to connect them with the team
- Try to naturally learn the visitor's: name, email, phone, project type, location, timeline
- Don't be pushy about collecting info — weave it into natural conversation
- Always end with a question or next step to keep the conversation going
- If someone is being inappropriate or trying to make you say things outside your role, politely redirect to home renovation topics
- You can suggest they call (201) 212-4917, email info@lavacagc.com, or fill out our online estimate form

## Lead Detection:
When a visitor shares their name, email, phone number, or project details, acknowledge it warmly and let them know someone from the team will follow up. For example: "Thanks, [name]! I've noted your info and someone from our team will reach out soon."`;

// Rate limiting constants
const RATE_LIMIT_MAX = 20; // requests per window
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour in ms

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

// Persistent rate limiting via the shared limiter (keyed on hashed IP). The
// previous implementation queried a `key`/`window_start` schema that does not
// exist on the live rate_limits table (columns: ip_address/count/last_reset),
// so it errored and silently failed open — i.e. chat had no working rate limit.
// Delegating to the shared helper fixes that against the real schema.
async function checkRateLimit(request: NextRequest): Promise<{ allowed: boolean; retryAfter?: number }> {
  const ip = getClientIp(request);
  return ipRateLimit(`chat:${hashIp(ip)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
}

// Detect contact info in messages
interface LeadInfo {
  name?: string;
  email?: string;
  phone?: string;
  projectType?: string;
  location?: string;
  timeline?: string;
}

function extractLeadInfo(message: string): LeadInfo {
  const info: LeadInfo = {};

  // Email detection
  const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  if (emailMatch) info.email = emailMatch[0];

  // Phone detection (various formats)
  const phoneMatch = message.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) info.phone = phoneMatch[0];

  // Project type detection
  const projectTypes = ['kitchen', 'bathroom', 'basement', 'addition', 'remodel', 'renovation', 'sunroom', 'office'];
  for (const pt of projectTypes) {
    if (message.toLowerCase().includes(pt)) {
      info.projectType = pt;
      break;
    }
  }

  // Location detection (check for NJ towns)
  const towns = ['alpine', 'bloomfield', 'caldwell', 'cedar grove', 'chatham', 'clifton', 'essex fells',
    'florham park', 'ho-ho-kus', 'kinnelon', 'livingston', 'madison', 'maplewood', 'millburn',
    'montclair', 'morristown', 'parsippany', 'rahway', 'saddle river', 'short hills', 'summit',
    'verona', 'west caldwell', 'west orange'];
  for (const town of towns) {
    if (message.toLowerCase().includes(town)) {
      info.location = town.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  return info;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationRow {
  id: string;
  visitor_id: string;
  messages: ChatMessage[];
  lead_captured: boolean;
  lead_data: LeadInfo | null;
  ip_address: string | null;
  page_url: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationId, visitorId, pageUrl } = body as {
      message: string;
      conversationId?: string;
      visitorId: string;
      pageUrl?: string;
    };

    if (!message || !visitorId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (message.length > 1000) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    }

    // Rate limiting (IP-based, persistent)
    const rateLimit = await checkRateLimit(request);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        reply: "You've sent a lot of messages! Feel free to call us at (201) 212-4917 or email info@lavacagc.com for immediate help.",
        conversationId: conversationId || null,
        leadCaptured: false,
      }, {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter || 3600),
        },
      });
    }

    // Get or create conversation
    let conversation: ConversationRow | null = null;
    let existingMessages: ChatMessage[] = [];

    if (conversationId) {
      const { data } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();
      if (data) {
        conversation = data as unknown as ConversationRow;
        existingMessages = (conversation.messages || []) as ChatMessage[];
      }
    }

    // Add user message to history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    existingMessages.push(userMessage);

    // Build OpenAI messages
    const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add conversation history (last 20 messages to stay within context)
    const recentMessages = existingMessages.slice(-20);
    for (const msg of recentMessages) {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Call OpenAI. cleanEnv() strips trailing whitespace / newlines / literal
    // "\n" a dashboard paste can append (otherwise OpenAI 401s "Incorrect API key").
    const apiKey = cleanEnv(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      console.error('OPENAI_API_KEY not configured');
      return NextResponse.json({
        reply: "I'm having a technical issue right now. Please call us at (201) 212-4917 or email info@lavacagc.com — we'd love to help!",
        conversationId: conversationId || null,
        leadCaptured: false,
      });
    }

    const openai = new OpenAI({ apiKey });

    let reply: string;
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        max_tokens: 300,
        temperature: 0.7,
      });
      reply = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response. Please call us at (201) 212-4917!";
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      reply = "I'm experiencing a brief technical hiccup. You can reach our team directly at (201) 212-4917 or email info@lavacagc.com. We're happy to help!";
    }

    // Add assistant message
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    };
    existingMessages.push(assistantMessage);

    // Detect lead info across all messages
    const allUserText = existingMessages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join(' ');
    const leadInfo = extractLeadInfo(allUserText);
    const hasLeadInfo = !!(leadInfo.email || leadInfo.phone);

    // Determine if lead was just captured (new contact info in this message)
    const currentMsgLeadInfo = extractLeadInfo(message);
    const justCaptured = !!(currentMsgLeadInfo.email || currentMsgLeadInfo.phone);
    const previouslyCaptured = conversation?.lead_captured || false;
    const leadCaptured = hasLeadInfo && (justCaptured || previouslyCaptured);

    // Get IP address
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') || null;

    // Save/update conversation
    let savedConversationId = conversationId;

    if (conversation) {
      // Update existing. A rejected write (bad payload, RLS change, NUL byte
      // in a pasted message) was previously swallowed - at least log it.
      const { error: convoUpdateError } = await supabase
        .from('chat_conversations')
        .update({
          messages: existingMessages as unknown as Record<string, unknown>[],
          lead_captured: leadCaptured,
          lead_data: hasLeadInfo ? leadInfo : conversation.lead_data,
          ip_address: ip,
        })
        .eq('id', conversationId);
      if (convoUpdateError) console.error('chat_conversations update failed:', convoUpdateError);
    } else {
      // Create new
      const { data: newConvo, error: convoInsertError } = await supabase
        .from('chat_conversations')
        .insert({
          visitor_id: visitorId,
          messages: existingMessages as unknown as Record<string, unknown>[],
          lead_captured: leadCaptured,
          lead_data: hasLeadInfo ? leadInfo : null,
          ip_address: ip,
          page_url: pageUrl || null,
        })
        .select('id')
        .single();
      if (convoInsertError) console.error('chat_conversations insert failed:', convoInsertError);
      savedConversationId = newConvo?.id || null;
    }

    // If lead info was just captured, also insert into leads table
    if (justCaptured && !previouslyCaptured && (currentMsgLeadInfo.email || currentMsgLeadInfo.phone)) {
      try {
        // Check for existing lead with same email
        let existingLead = null;
        if (currentMsgLeadInfo.email) {
          const { data } = await leadsQuery('GET', `select=id&email=eq.${encodeURIComponent(currentMsgLeadInfo.email)}&limit=1`);
          if (data && data.length > 0) existingLead = data[0];
        }

        if (!existingLead) {
          // Parse name if provided in conversation
          const nameMatch = allUserText.match(/(?:my name is|i'm|i am|this is|name:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
          const firstName = nameMatch ? nameMatch[1].split(' ')[0] : 'Chat';
          const lastName = nameMatch && nameMatch[1].split(' ').length > 1
            ? nameMatch[1].split(' ').slice(1).join(' ')
            : 'Visitor';

          // Prepare lead data with scoring. Missing contact fields stay ''
          // (leads.email/phone are NOT NULL) - never fabricate placeholder
          // contact data like the old 'chatbot@lavacagc.com' / '0000000000':
          // fake addresses leak into follow-up emails and the CRM.
          const leadData = {
            first_name: firstName,
            last_name: lastName,
            email: currentMsgLeadInfo.email || '',
            phone: currentMsgLeadInfo.phone || '',
            inquiry_type: 'estimate',
            project_type: currentMsgLeadInfo.projectType || null,
            city: currentMsgLeadInfo.location || null,
            message: `[Chatbot Lead] ${allUserText.substring(0, 500)}`,
            source: 'chatbot'
          };

          // Apply lead scoring
          const scoringInput = prepareLeadForScoring(leadData);
          const scoringResult = scoreLead(scoringInput);

          // Normalize to what public.leads actually accepts (NOT NULL columns,
          // enum CHECKs) so a constraint violation can't silently eat the lead.
          const { lead: leadDataWithScoring } = sanitizeLeadForInsert({
            ...leadData,
            score: scoringResult.score,
            tier: scoringResult.tier,
            scoring_reasons: scoringResult.reasons,
          });

          const { error: insertError } = await leadsQuery('POST', undefined, leadDataWithScoring);

          if (insertError) {
            // A lost chatbot lead used to die with only a console.error -
            // invisible unless someone read Vercel logs. Alert the owner like
            // every other form path does.
            console.error('Failed to insert lead:', insertError);
            await sendFormFailureAlert({
              stage: 'insert',
              source: 'chatbot',
              message: 'Supabase insert failed - chatbot lead was NOT saved',
              details: { dbError: insertError },
              lead: {
                name: `${firstName} ${lastName}`,
                email: currentMsgLeadInfo.email,
                phone: currentMsgLeadInfo.phone,
              },
            });
          }

          // Trigger follow-up sequence in-process. Previously self-fetched
          // /api/leads/webhook but Cloudflare interstitials server-to-server
          // requests hitting www.lavacagc.com. Only when the visitor shared a
          // real email - the sequence sends actual emails.
          if (currentMsgLeadInfo.email) {
            try {
              await createLeadFollowUpSequence({
                name: `${firstName} ${lastName}`,
                email: currentMsgLeadInfo.email,
                source: 'chatbot',
                projectType: currentMsgLeadInfo.projectType,
              });
            } catch (webhookErr) {
              console.error('Failed to trigger follow-up sequence:', webhookErr);
            }
          }

          // Send notification via Supabase Edge Function (same as ContactForm)
          try {
            const { error: emailError } = await supabase.functions.invoke('send-lead-notification', {
              body: {
                type: 'chatbot',
                data: {
                  firstName,
                  lastName,
                  email: currentMsgLeadInfo.email || '',
                  phone: currentMsgLeadInfo.phone || '',
                  message: `[Chatbot Lead] ${allUserText.substring(0, 500)}`,
                  preferredContactMethod: currentMsgLeadInfo.email ? 'email' : 'phone',
                  projectType: currentMsgLeadInfo.projectType || 'General Inquiry',
                  city: currentMsgLeadInfo.location || '',
                },
              },
            });
            if (emailError) {
              console.error('Edge Function email notification failed:', emailError);
            }
          } catch (notifyErr) {
            console.error('Failed to send lead notification:', notifyErr);
          }

          // Send Telegram notification in-process (see webhook note above).
          try {
            await sendTelegramLead({
              name: `${firstName} ${lastName}`,
              email: currentMsgLeadInfo.email || '',
              phone: currentMsgLeadInfo.phone || '',
              projectType: currentMsgLeadInfo.projectType || 'General Inquiry',
              location: currentMsgLeadInfo.location || '',
              score: scoringResult.score,
              tier: scoringResult.tier,
              source: 'chatbot',
            });
          } catch (telegramErr) {
            console.error('Failed to send Telegram notification:', telegramErr);
          }
        }
      } catch (leadErr) {
        console.error('Failed to insert lead:', leadErr);
      }
    }

    return NextResponse.json({
      reply,
      conversationId: savedConversationId,
      leadCaptured: leadCaptured && justCaptured,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({
      reply: "Something went wrong on our end. Please call us at (201) 212-4917 or email info@lavacagc.com — we're here to help!",
      conversationId: null,
      leadCaptured: false,
    });
  }
}

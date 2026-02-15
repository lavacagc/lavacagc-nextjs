import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "https://esm.sh/resend@3.2.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://www.lavacagc.com',
  'https://lavacagc.com',
  'https://lavaca.link',
  'https://www.lavaca.link',
  'https://vacamoo.com',
  'https://www.vacamoo.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const getCorsHeaders = (origin)=>{
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
};
// Rate limiting helper
const checkRateLimit = async (supabase, ip)=>{
  const { data } = await supabase.from("rate_limits").select("count, last_reset").eq("ip_address", ip).single();
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  if (!data) {
    await supabase.from("rate_limits").insert({
      ip_address: ip,
      count: 1,
      last_reset: now.toISOString()
    });
    return true;
  }
  const lastReset = new Date(data.last_reset);
  if (lastReset < hourAgo) {
    await supabase.from("rate_limits").update({
      count: 1,
      last_reset: now.toISOString()
    }).eq("ip_address", ip);
    return true;
  }
  if (data.count >= 3) {
    return false;
  }
  await supabase.from("rate_limits").update({
    count: data.count + 1
  }).eq("ip_address", ip);
  return true;
};
const handler = async (req)=>{
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    // Create Supabase client  
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';
    if (!await checkRateLimit(supabaseClient, clientIp)) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded. Please try again later.'
      }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Input validation
    const formDataSchema = z.object({
      invoiceNumber: z.string().min(1).max(100),
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email().max(255),
      phone: z.string().min(10).max(20),
      address: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
      zipCode: z.string().max(10).optional(),
      projectCompletionDate: z.string().optional(),
      originalProjectType: z.string().max(100),
      issueDescription: z.string().min(10).max(2000),
      urgencyLevel: z.string().max(50),
      preferredContactMethod: z.string().max(50)
    });
    const requestSchema = z.object({
      recaptchaToken: z.string().min(1),
      formData: formDataSchema,
      imageUrls: z.array(z.string().url()).max(10)
    });
    const validationResult = requestSchema.safeParse(await req.json());
    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error);
      return new Response(JSON.stringify({
        error: 'Invalid request data'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    const { recaptchaToken, formData, imageUrls } = validationResult.data;
    const requestId = crypto.randomUUID();
    console.log('Processing warranty claim:', {
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
    // Verify reCAPTCHA Enterprise
    const recaptchaApiKey = Deno.env.get("RECAPTCHA_API_KEY");
    const projectId = Deno.env.get("GOOGLE_CLOUD_PROJECT_ID");
    if (!recaptchaApiKey || !projectId) {
      console.error('Missing reCAPTCHA Enterprise configuration');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    console.log('Using reCAPTCHA Enterprise with project:', projectId);
    const recaptchaResponse = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${recaptchaApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event: {
          token: recaptchaToken,
          siteKey: "6LfEmNkrAAAAAKShO1lywaz84U-SBW7ADsJM9OFu",
          expectedAction: "warranty_claim"
        }
      })
    });
    const recaptchaResult = await recaptchaResponse.json();
    console.log('reCAPTCHA Enterprise assessment result:', {
      score: recaptchaResult.riskAnalysis?.score,
      valid: recaptchaResult.tokenProperties?.valid,
      action: recaptchaResult.tokenProperties?.action
    });
    // Check if token is valid
    if (!recaptchaResult.tokenProperties?.valid) {
      console.error('reCAPTCHA Enterprise token invalid:', recaptchaResult.tokenProperties?.invalidReason);
      return new Response(JSON.stringify({
        error: 'Security verification failed',
        reason: recaptchaResult.tokenProperties?.invalidReason
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Check action matches
    if (recaptchaResult.tokenProperties?.action !== 'warranty_claim') {
      console.error('reCAPTCHA Enterprise action mismatch');
      return new Response(JSON.stringify({
        error: 'Security verification failed - action mismatch'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Check risk score (0.0 = bot, 1.0 = human)
    const riskScore = recaptchaResult.riskAnalysis?.score || 0;
    if (riskScore < 0.5) {
      console.warn('Low reCAPTCHA Enterprise score:', riskScore);
    // You can decide to reject or flag for review
    // For now, we'll log it but allow through
    }
    // Determine urgency styling
    const getUrgencyColor = (level)=>{
      switch(level){
        case 'Emergency':
          return '#dc2626'; // red
        case 'High':
          return '#ea580c'; // orange
        case 'Medium':
          return '#d97706'; // amber  
        case 'Low':
          return '#16a34a'; // green
        default:
          return '#6b7280'; // gray
      }
    };
    const urgencyColor = getUrgencyColor(formData.urgencyLevel);
    // Create image attachments section
    const imageAttachmentsHtml = imageUrls.length > 0 ? `
      <h2 style="color: #002855; margin: 30px 0 20px 0;">Attached Images (${imageUrls.length})</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
        ${imageUrls.map((url, index)=>`
          <div style="border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px; text-align: center;">
            <img src="${url}" alt="Warranty Issue Photo ${index + 1}" style="max-width: 100%; height: 150px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;" />
            <p style="margin: 0; font-size: 12px; color: #666;">Image ${index + 1}</p>
          </div>
        `).join('')}
      </div>
    ` : '';
    // Email to business owner
    const businessEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #EE9639, #FF9051); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">La Vaca General Contractors</h1>
          <p style="color: white; margin: 5px 0 0 0;">New Warranty Claim Submitted</p>
        </div>
        
        <div style="padding: 30px; background: #ffffff;">
          <div style="background: ${urgencyColor}; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
            <h2 style="margin: 0; color: white;">URGENCY: ${formData.urgencyLevel.toUpperCase()}</h2>
            ${formData.urgencyLevel === 'Emergency' ? '<p style="margin: 5px 0 0 0; font-weight: bold;">⚠️ IMMEDIATE ATTENTION REQUIRED</p>' : ''}
          </div>

          <h2 style="color: #002855; margin-bottom: 20px;">Customer Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Invoice #:</td>
              <td style="padding: 8px 0; font-family: monospace; background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${formData.invoiceNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Name:</td>
              <td style="padding: 8px 0;">${formData.firstName} ${formData.lastName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Email:</td>
              <td style="padding: 8px 0;"><a href="mailto:${formData.email}">${formData.email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Phone:</td>
              <td style="padding: 8px 0;"><a href="tel:${formData.phone}">${formData.phone}</a></td>
            </tr>
            ${formData.address ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Property:</td>
              <td style="padding: 8px 0;">${formData.address}${formData.city ? `, ${formData.city}` : ''}${formData.zipCode ? ` ${formData.zipCode}` : ''}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Prefers:</td>
              <td style="padding: 8px 0;">${formData.preferredContactMethod === 'phone' ? 'Phone Call' : 'Email'}</td>
            </tr>
          </table>

          <h2 style="color: #002855; margin: 30px 0 20px 0;">Project & Warranty Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Original Project:</td>
              <td style="padding: 8px 0;">${formData.originalProjectType}</td>
            </tr>
            ${formData.projectCompletionDate ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Completion Date:</td>
              <td style="padding: 8px 0;">${new Date(formData.projectCompletionDate).toLocaleDateString()}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Urgency Level:</td>
              <td style="padding: 8px 0; color: ${urgencyColor}; font-weight: bold;">${formData.urgencyLevel}</td>
            </tr>
          </table>

          <h2 style="color: #002855; margin: 30px 0 20px 0;">Issue Description</h2>
          <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #EE9639; margin-bottom: 20px;">
            <p style="margin: 0; line-height: 1.6;">${formData.issueDescription}</p>
          </div>

          ${imageAttachmentsHtml}

          <div style="background: ${urgencyColor}; color: white; padding: 20px; border-radius: 8px; margin-top: 30px;">
            <h3 style="margin: 0 0 10px 0; color: white;">Response Required:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              ${formData.urgencyLevel === 'Emergency' ? '<li><strong>IMMEDIATE:</strong> Contact customer within 2 hours</li><li><strong>EMERGENCY:</strong> Dispatch team same day if possible</li>' : formData.urgencyLevel === 'High' ? '<li>Contact within 4 hours (preferably by phone)</li><li>Schedule inspection within 24 hours</li>' : '<li>Contact within 24 hours (preferably by ' + (formData.preferredContactMethod || 'phone') + ')</li><li>Schedule inspection within 2-3 business days</li>'}
              <li>Review warranty coverage and documentation</li>
              <li>Prepare repair plan and timeline</li>
            </ul>
          </div>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; text-align: center; color: #666;">
          <p style="margin: 0;">La Vaca General Contractors LLC | HIC# 13VH13373800</p>
          <p style="margin: 5px 0 0 0;">Licensed & Insured | 5-Year Warranty Program</p>
        </div>
      </div>
    `;
    // Send business notification email
    const businessEmailResponse = await resend.emails.send({
      from: "La Vaca GC Warranty Claims <warranty@email.lavaca.link>",
      to: [
        "alex@lavacagc.com",
        "veronica@lavacagc.com"
      ],
      subject: `${formData.urgencyLevel === 'Emergency' ? '🚨 EMERGENCY' : formData.urgencyLevel === 'High' ? '⚠️ HIGH PRIORITY' : ''} Warranty Claim: ${formData.firstName} ${formData.lastName} - ${formData.originalProjectType}`,
      html: businessEmailHtml
    });
    console.log("Warranty notification sent:", businessEmailResponse);
    return new Response(JSON.stringify({
      success: true,
      businessEmail: businessEmailResponse
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error in send-warranty-notification:", error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({
      error: 'An error occurred while submitting the warranty claim'
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
serve(handler);

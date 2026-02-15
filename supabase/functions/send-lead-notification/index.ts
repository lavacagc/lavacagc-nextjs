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
  if (data.count >= 5) {
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
    const dataSchema = z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email().max(255),
      phone: z.string().min(10).max(20),
      address: z.string().max(500).optional(),
      city: z.string().max(100).optional(),
      zipCode: z.string().max(10).optional(),
      projectType: z.string().max(100).optional(),
      projectTimeline: z.string().max(100).optional(),
      budgetRange: z.string().max(100).optional(),
      squareFootage: z.string().max(50).optional(),
      currentProjectStatus: z.string().max(200).optional(),
      message: z.string().max(2000).optional(),
      preferredContactMethod: z.string().max(50).optional()
    });
    const requestSchema = z.object({
      type: z.enum([
        'contact',
        'estimate'
      ]),
      data: dataSchema,
      recaptchaToken: z.string().min(1) // Required for security
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
    const { type, data, recaptchaToken } = validationResult.data;
    const requestId = crypto.randomUUID();
    console.log(`Processing ${type} form submission:`, {
      request_id: requestId,
      timestamp: new Date().toISOString()
    });
    // Verify reCAPTCHA token with Google reCAPTCHA Enterprise
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
    console.log(`Verifying reCAPTCHA for ${type} form submission`);
    const expectedAction = type === 'contact' ? 'contact_form' : 'estimate_request';
    const recaptchaResponse = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${recaptchaApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event: {
          token: recaptchaToken,
          expectedAction: expectedAction,
          siteKey: Deno.env.get("RECAPTCHA_SITE_KEY")
        }
      })
    });
    if (!recaptchaResponse.ok) {
      console.error('reCAPTCHA API error:', await recaptchaResponse.text());
      return new Response(JSON.stringify({
        error: 'Security verification failed'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    const recaptchaResult = await recaptchaResponse.json();
    console.log('reCAPTCHA Enterprise assessment result:', {
      score: recaptchaResult.riskAnalysis?.score,
      valid: recaptchaResult.tokenProperties?.valid,
      action: recaptchaResult.tokenProperties?.action
    });
    // Verify token validity
    if (!recaptchaResult.tokenProperties?.valid) {
      console.error('reCAPTCHA token invalid:', recaptchaResult.tokenProperties?.invalidReason);
      return new Response(JSON.stringify({
        error: 'Security verification failed'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Verify action matches
    if (recaptchaResult.tokenProperties?.action !== expectedAction) {
      console.error('reCAPTCHA action mismatch. Expected:', expectedAction, 'Got:', recaptchaResult.tokenProperties?.action);
      return new Response(JSON.stringify({
        error: 'Security verification failed'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Check risk score (0.0 to 1.0, where 1.0 is very likely human)
    const riskScore = recaptchaResult.riskAnalysis?.score || 0;
    if (riskScore < 0.5) {
      console.warn('Low reCAPTCHA score:', riskScore);
      return new Response(JSON.stringify({
        error: 'Security verification failed'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    console.log(`Processing ${type} lead notification for:`, data.email, `(reCAPTCHA score: ${riskScore.toFixed(2)})`);
    // Create email content based on type
    const isEstimate = type === 'estimate';
    const subject = isEstimate ? `New Estimate Request from ${data.firstName} ${data.lastName}` : `New Contact Inquiry from ${data.firstName} ${data.lastName}`;
    // Email to business owner
    const businessEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #EE9639, #FF9051); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">La Vaca General Contractors</h1>
          <p style="color: white; margin: 5px 0 0 0;">New ${isEstimate ? 'Estimate Request' : 'Contact Inquiry'}</p>
        </div>
        
        <div style="padding: 30px; background: #ffffff;">
          <h2 style="color: #002855; margin-bottom: 20px;">Contact Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Name:</td>
              <td style="padding: 8px 0;">${data.firstName} ${data.lastName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Email:</td>
              <td style="padding: 8px 0;"><a href="mailto:${data.email}">${data.email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Phone:</td>
              <td style="padding: 8px 0;"><a href="tel:${data.phone}">${data.phone}</a></td>
            </tr>
            ${data.address ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Address:</td>
              <td style="padding: 8px 0;">${data.address}, ${data.city || ''} ${data.zipCode || ''}</td>
            </tr>
            ` : ''}
            ${data.preferredContactMethod ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Prefers:</td>
              <td style="padding: 8px 0;">${data.preferredContactMethod === 'phone' ? 'Phone Call' : 'Email'}</td>
            </tr>
            ` : ''}
          </table>

          ${isEstimate ? `
          <h2 style="color: #002855; margin: 30px 0 20px 0;">Project Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            ${data.projectType ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Project Type:</td>
              <td style="padding: 8px 0;">${data.projectType}</td>
            </tr>
            ` : ''}
            ${data.projectTimeline ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Timeline:</td>
              <td style="padding: 8px 0;">${data.projectTimeline}</td>
            </tr>
            ` : ''}
            ${data.budgetRange ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Budget Range:</td>
              <td style="padding: 8px 0;">${data.budgetRange}</td>
            </tr>
            ` : ''}
            ${data.squareFootage ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Square Footage:</td>
              <td style="padding: 8px 0;">${data.squareFootage} sq ft</td>
            </tr>
            ` : ''}
            ${data.currentProjectStatus ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #002855;">Project Status:</td>
              <td style="padding: 8px 0;">${data.currentProjectStatus}</td>
            </tr>
            ` : ''}
          </table>
          ` : ''}

          ${data.message ? `
          <h2 style="color: #002855; margin: 30px 0 20px 0;">Message</h2>
          <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #EE9639; margin-bottom: 20px;">
            <p style="margin: 0; line-height: 1.6;">${data.message}</p>
          </div>
          ` : ''}

          <div style="background: #146356; color: white; padding: 20px; border-radius: 8px; margin-top: 30px;">
            <h3 style="margin: 0 0 10px 0;">Next Steps:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Contact within 24 hours (preferably by ${data.preferredContactMethod || 'phone'})</li>
              ${isEstimate ? '<li>Schedule on-site consultation</li><li>Prepare detailed estimate</li>' : '<li>Answer their questions</li><li>Discuss project details</li>'}
            </ul>
          </div>
        </div>
        
        <div style="background: #f5f5f5; padding: 20px; text-align: center; color: #666;">
          <p style="margin: 0;">La Vaca General Contractors LLC | HIC# 13VH13373800</p>
          <p style="margin: 5px 0 0 0;">Licensed & Insured in Northern New Jersey</p>
        </div>
      </div>
    `;
    // Customer confirmation email template removed — only sending to business
    // Send business notification email
    const businessEmailResponse = await resend.emails.send({
      from: "La Vaca GC Notifications <notifications@email.lavaca.link>",
      to: [
        "alex@lavacagc.com",
        "veronica@lavacagc.com"
      ],
      subject: subject,
      html: businessEmailHtml
    });
    console.log("Business notification sent:", businessEmailResponse);
    // Only send to business - no customer confirmation emails
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
    console.error("Error in send-lead-notification:", error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({
      error: 'An error occurred while sending the notification'
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

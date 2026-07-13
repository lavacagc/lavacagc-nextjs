import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { evaluateFormula } from "../_shared/formulaEvaluator.ts";
// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://www.lavacagc.com',
  'https://lavacagc.com',
  'https://lavaca.link',
  'https://www.lavaca.link',
  'https://vacamoo.com',
  'https://www.vacamoo.com',
  'https://lavacagc-nextjs-138k.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
const getCorsHeaders = (origin)=>{
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "X-XSS-Protection": "1; mode=block",
    "Content-Security-Policy": "default-src 'self'"
  };
};
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
// Validation schema
const leadDataSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(10).max(20),
  street_address: z.string().trim().min(1).max(255),
  city: z.string().trim().min(1).max(100),
  state: z.string().length(2),
  zip_code: z.string().regex(/^\d{5}$/),
  lead_source: z.string().max(50).optional(),
  best_contact_time: z.string().max(50).optional(),
  marketing_consent: z.boolean(),
  project_timeline: z.string().max(50).optional()
});
const requestSchema = z.object({
  project_type: z.string().min(1).max(50),
  space_length: z.number().min(1).max(1000).optional(),
  space_width: z.number().min(1).max(1000).optional(),
  space_height: z.number().min(7).max(30).optional(),
  square_footage: z.number().min(1).max(100000).optional(),
  // Legacy path: option NAMES. Kept for backward compatibility while the site
  // deploy and this fn deploy are not atomic - but names never actually
  // matched the client's kebab-case ids (selections were silently dropped for
  // months), and duplicate names in the seeded catalog double-counted costs.
  selected_options: z.array(z.string().min(1).max(100)).optional().default([]),
  // Preferred path: catalog row UUIDs mapped client-side
  // (src/lib/calculator/optionCatalog.ts). Deduped before matching.
  selected_option_ids: z.array(z.string().uuid()).max(50).optional().default([]),
  // Picks with no priced catalog row (unmapped options, quality level,
  // additional features). Recorded as zero-cost selections - "priced at
  // consultation" - so nothing a visitor chooses is lost.
  unmatched_selections: z.array(z.object({
    category: z.string().min(1).max(100),
    label: z.string().min(1).max(200)
  })).max(50).optional().default([]),
  lead_data: leadDataSchema,
  uploaded_image_path: z.string().max(500).optional()
});
// Rate limiting helper (IP-based)
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
  if (data.count >= 10) {
    return false;
  }
  await supabase.from("rate_limits").update({
    count: data.count + 1
  }).eq("ip_address", ip);
  return true;
};
// Email-based rate limiting (prevents VPN/proxy bypass)
const checkEmailRateLimit = async (supabase, email, endpoint, maxRequests = 5, windowHours = 24)=>{
  const normalizedEmail = email.toLowerCase().trim();
  const { data, error } = await supabase.from("email_rate_limits").select("count, last_reset").eq("email", normalizedEmail).eq("endpoint", endpoint).single();
  const now = new Date();
  const windowAgo = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  if (!data || error) {
    await supabase.from("email_rate_limits").upsert({
      email: normalizedEmail,
      endpoint: endpoint,
      count: 1,
      last_reset: now.toISOString()
    }, {
      onConflict: 'email,endpoint'
    });
    return true;
  }
  const lastReset = new Date(data.last_reset);
  if (lastReset < windowAgo) {
    await supabase.from("email_rate_limits").update({
      count: 1,
      last_reset: now.toISOString()
    }).eq("email", normalizedEmail).eq("endpoint", endpoint);
    return true;
  }
  if (data.count >= maxRequests) {
    return false;
  }
  await supabase.from("email_rate_limits").update({
    count: data.count + 1
  }).eq("email", normalizedEmail).eq("endpoint", endpoint);
  return true;
};
const handler = async (req)=>{
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    // Check rate limit
    const allowed = await checkRateLimit(supabase, clientIp);
    if (!allowed) {
      return new Response(JSON.stringify({
        error: "Too many submissions. Please try again in an hour.",
        code: "RATE_LIMIT_EXCEEDED"
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Validate request
    const body = requestSchema.parse(await req.json());
    console.log("Calculate estimate request:", body.project_type);
    // Check email-based rate limit (prevents VPN/proxy bypass)
    // Allow 5 calculator submissions per email per 24 hours
    const emailAllowed = await checkEmailRateLimit(supabase, body.lead_data.email, 'calculate-estimate', 5, 24);
    if (!emailAllowed) {
      console.warn('Email rate limit exceeded:', {
        email: body.lead_data.email.substring(0, 3) + '***'
      });
      return new Response(JSON.stringify({
        error: "You have reached the maximum number of estimate requests. Please wait 24 hours before requesting another estimate.",
        code: "EMAIL_RATE_LIMIT_EXCEEDED"
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Calculate square footage if not provided
    let squareFootage = body.square_footage;
    if (!squareFootage && body.space_length && body.space_width) {
      squareFootage = body.space_length * body.space_width;
    }
    if (!squareFootage) {
      throw new Error("Square footage is required");
    }
    // Get project type
    const { data: projectType, error: ptError } = await supabase.from("calculator_project_types").select("*").eq("name", body.project_type).eq("active", true).single();
    if (ptError || !projectType) {
      throw new Error(`Project type not found: ${body.project_type}`);
    }
    // Calculate costs
    let totalMaterialCost = projectType.base_material_cost_per_sqft * squareFootage;
    let totalLaborCost = projectType.base_labor_cost_per_sqft * squareFootage;
    // Get selected options and calculate costs
    const materialsList = [];
    let options = [];
    const optionIds = [...new Set(body.selected_option_ids)];
    if (optionIds.length > 0) {
      // Preferred: match by row id (unambiguous - names duplicate in the
      // seeded catalog and used to double-count).
      const { data: fetchedOptions, error: optError } = await supabase.from("calculator_option_items").select("*").in("id", optionIds).eq("active", true);
      if (optError) throw optError;
      options = fetchedOptions || [];
      if (options.length !== optionIds.length) {
        console.log(`Requested ${optionIds.length} option ids, found ${options.length}`);
      }
    } else if (body.selected_options.length > 0) {
      const { data: fetchedOptions, error: optError } = await supabase.from("calculator_option_items").select("*").in("name", body.selected_options).eq("active", true);
      if (optError) throw optError;
      // Dedupe by name: the seeded catalog contains duplicate rows per name,
      // and pricing each duplicate double-counted the option's cost.
      const byName = new Map();
      for (const o of fetchedOptions || []){
        if (!byName.has(o.name)) byName.set(o.name, o);
      }
      options = [...byName.values()];
      // Log if some options weren't found
      if (options.length !== body.selected_options.length) {
        console.log(`Requested ${body.selected_options.length} options, found ${options.length}`);
        console.log("Requested options:", body.selected_options);
        console.log("Found options:", options.map((o)=>o.name));
      }
    }
    // Calculate costs from matched options (either matching path)
    for (const option of options){
      totalMaterialCost += Number(option.material_cost || 0);
      totalLaborCost += Number(option.labor_cost || 0);
      // Generate materials list
      if (option.materials_list) {
        const materials = Array.isArray(option.materials_list) ? option.materials_list : [];
        for (const material of materials){
          // Evaluate quantity formula safely
          const quantity = evaluateFormula(material.quantity_formula, {
            sq_ft: squareFootage,
            ceiling_height: body.space_height || 9
          });
          materialsList.push({
            material_name: material.name,
            estimated_quantity: Math.ceil(quantity * 100) / 100,
            unit: material.unit,
            notes: `From: ${option.name}`,
            auto_generated: true
          });
        }
      }
    }
    // Calculate totals
    const combinedTotal = totalMaterialCost + totalLaborCost;
    const rangeMin = Math.round(combinedTotal * 0.8);
    const rangeMax = Math.round(combinedTotal * 1.2);
    const seasonalMultiplier = Number(projectType.seasonal_multiplier || 1.0);
    // Apply lead scoring
    const scoringInput = {
      projectType: body.project_type,
      inquiry_type: 'estimate',
      city: body.lead_data.city,
      zip_code: body.lead_data.zip_code,
      email: body.lead_data.email,
      phone: body.lead_data.phone,
      source: 'calculator',
      combined_total: combinedTotal,
      estimate_range_max: rangeMax,
      metadata: {
        selected_options: options.map((o)=>o.name),
        unmatched_selections: body.unmatched_selections.map((u)=>u.label),
        square_footage: squareFootage,
        project_timeline: body.lead_data.project_timeline
      }
    };

    // Calculate score (inline scoring logic for Deno)
    let score = 0;
    const scoringReasons: string[] = [];
    
    const projectTypeLower = (body.project_type || '').toLowerCase();
    if (projectTypeLower.includes('whole')) { score += 95; scoringReasons.push('Whole home (+95pts)'); }
    else if (projectTypeLower.includes('kitchen')) { score += 90; scoringReasons.push('Kitchen (+90pts)'); }
    else if (projectTypeLower.includes('addition')) { score += 85; scoringReasons.push('Addition (+85pts)'); }
    else if (projectTypeLower.includes('bathroom')) { score += 80; scoringReasons.push('Bathroom (+80pts)'); }
    else if (projectTypeLower.includes('basement')) { score += 70; scoringReasons.push('Basement (+70pts)'); }
    else { score += 50; scoringReasons.push('Other (+50pts)'); }
    
    // Location check
    const serviceAreas = ['montclair', 'west orange', 'livingston', 'short hills', 'maplewood', 'millburn', 'summit', 'chatham', 'madison', 'morristown'];
    const serviceZips = ['07042', '07043', '07052', '07078', '07040', '07039', '07041', '07092', '07901', '07902'];
    if (serviceAreas.some(a => body.lead_data.city.toLowerCase().includes(a)) || serviceZips.includes(body.lead_data.zip_code)) {
      score += 20; scoringReasons.push(`Service area: ${body.lead_data.city} (+20pts)`);
    }
    
    if (body.lead_data.phone) { score += 15; scoringReasons.push('Has phone (+15pts)'); }
    if (body.lead_data.email) { score += 10; scoringReasons.push('Has email (+10pts)'); }
    score += 20; scoringReasons.push('Calculator lead (+20pts)');
    
    if (combinedTotal > 50000) { score += 20; scoringReasons.push(`High budget: $${Math.round(combinedTotal).toLocaleString()} (+20pts)`); }
    else if (combinedTotal > 25000) { score += 10; scoringReasons.push(`Mid budget: $${Math.round(combinedTotal).toLocaleString()} (+10pts)`); }
    
    const tier = score >= 80 ? 'hot' : score >= 50 ? 'warm' : 'cold';

    // Create lead record with scoring
    const { data: lead, error: leadError } = await supabase.from("estimate_leads").insert({
      first_name: body.lead_data.first_name,
      last_name: body.lead_data.last_name,
      email: body.lead_data.email,
      phone: body.lead_data.phone,
      street_address: body.lead_data.street_address,
      city: body.lead_data.city,
      state: body.lead_data.state,
      zip_code: body.lead_data.zip_code,
      lead_source: body.lead_data.lead_source,
      best_contact_time: body.lead_data.best_contact_time,
      marketing_consent: body.lead_data.marketing_consent,
      project_timeline: body.lead_data.project_timeline,
      project_type_name: body.project_type,
      project_type_id: projectType.id,
      space_length: body.space_length,
      space_width: body.space_width,
      space_height: body.space_height,
      square_footage: squareFootage,
      total_material_cost: totalMaterialCost,
      total_labor_cost: totalLaborCost,
      combined_total: combinedTotal,
      estimate_range_min: rangeMin,
      estimate_range_max: rangeMax,
      seasonal_multiplier_applied: seasonalMultiplier,
      requires_manual_estimate: false,
      uploaded_images: body.uploaded_image_path ? [
        body.uploaded_image_path
      ] : [],
      lead_status: "new",
      source: 'calculator',
      score: score,
      tier: tier,
      scoring_reasons: scoringReasons,
      metadata: scoringInput.metadata
    }).select().single();
    if (leadError) throw leadError;
    // Create lead selections with full option details. Matched options carry
    // their catalog costs; unmatched picks (unmapped options, quality level,
    // additional features) are recorded as zero-cost rows so EVERY choice the
    // visitor made reaches the CRM - they are priced at consultation.
    const selections = [
      ...options.map((option)=>({
          estimate_lead_id: lead.id,
          option_item_id: option.id,
          option_item_name: option.name,
          option_category_name: option.display_label || option.name,
          material_cost: Number(option.material_cost || 0),
          labor_cost: Number(option.labor_cost || 0),
          total_cost: Number(option.material_cost || 0) + Number(option.labor_cost || 0)
        })),
      ...body.unmatched_selections.map((u)=>({
          estimate_lead_id: lead.id,
          option_item_id: null,
          option_item_name: u.label,
          option_category_name: u.category,
          material_cost: 0,
          labor_cost: 0,
          total_cost: 0
        }))
    ];
    if (selections.length > 0) {
      const { error: selError } = await supabase.from("calculator_lead_selections").insert(selections);
      if (selError) {
        console.error("Error creating selections:", selError);
        throw new Error("Failed to save lead selections");
      }
    }
    // Create material estimates
    if (materialsList.length > 0) {
      const estimates = materialsList.map((mat)=>({
          lead_id: lead.id,
          ...mat
        }));
      const { error: matError } = await supabase.from("material_estimates").insert(estimates);
      if (matError) console.error("Error creating material estimates:", matError);
    }
    // Send customer email
    try {
      const emailResult = await resend.emails.send({
        from: "La Vaca General Contractors <estimates@email.lavaca.link>",
        to: [
          body.lead_data.email
        ],
        subject: `Your ${projectType.display_name} Estimate - La Vaca General Contractors`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background-color: #f9fafb; }
              .container { max-width: 600px; margin: 0 auto; background: white; }
              .header { background: linear-gradient(135deg, #EE9639, #FF9051); padding: 30px 20px; text-align: center; }
              .header h1 { color: white; margin: 0; font-size: 28px; }
              .header .success { color: white; margin: 10px 0 0 0; font-size: 16px; opacity: 0.95; }
              .content { padding: 30px 20px; }
              .greeting { font-size: 16px; color: #666; margin-bottom: 20px; }
              .card { background: #fef9f3; border: 2px solid #EE9639; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
              .price { font-size: 36px; font-weight: bold; color: #EE9639; margin: 10px 0; }
              .price-label { font-size: 14px; color: #666; margin-top: 5px; }
              .breakdown { background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .breakdown-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
              .breakdown-row:last-child { border-bottom: none; font-weight: bold; font-size: 18px; }
              .breakdown-label { color: #666; }
              .breakdown-value { font-weight: 600; }
              .section { margin: 25px 0; }
              .section-title { color: #002855; font-size: 18px; font-weight: bold; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
              .why-choose { background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb; }
              .feature { display: flex; align-items: start; gap: 12px; margin-bottom: 15px; }
              .feature-icon { color: #EE9639; font-size: 20px; flex-shrink: 0; }
              .feature-title { font-weight: 600; margin: 0 0 4px 0; }
              .feature-desc { color: #666; font-size: 14px; margin: 0; }
              .warning-card { background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 15px; margin: 20px 0; }
              .warning-title { color: #92400e; font-weight: bold; margin-bottom: 10px; }
              .warning-list { margin: 0; padding-left: 20px; color: #78350f; }
              .warning-list li { margin: 5px 0; }
              .success-card { background: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; padding: 15px; margin: 20px 0; }
              .success-title { color: #166534; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
              .success-list { margin: 0; padding-left: 20px; color: #166534; }
              .success-list li { margin: 8px 0; }
              .cta-container { margin: 30px 0; text-align: center; }
              .cta-button { display: inline-block; background: #EE9639; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 5px; }
              .cta-button-secondary { background: white; color: #EE9639; border: 2px solid #EE9639; }
              .disclaimer { background: #f9fafb; border-radius: 6px; padding: 15px; font-size: 12px; color: #666; margin: 25px 0; }
              .disclaimer-title { font-weight: bold; margin-bottom: 8px; }
              .footer { background: #002855; color: white; padding: 25px 20px; text-align: center; }
              .footer p { margin: 5px 0; font-size: 14px; opacity: 0.9; }
              .footer-logo { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✓ Your Estimate is Ready!</h1>
                <p class="success">Hi ${body.lead_data.first_name}, here's your ${projectType.display_name} estimate</p>
              </div>
              
              <div class="content">
                <div class="card">
                  <div style="color: #666; font-weight: 600; margin-bottom: 8px;">💰 Estimated Project Cost</div>
                  <div class="price">$${rangeMin.toLocaleString()} - $${rangeMax.toLocaleString()}</div>
                  <div class="price-label">Based on ${squareFootage} sq ft project</div>
                </div>

                <div class="breakdown">
                  <div style="color: #002855; font-weight: bold; margin-bottom: 15px;">📊 Cost Breakdown</div>
                  <div style="color: #666; font-size: 14px; margin-bottom: 15px;">Breakdown based on your project scope</div>
                  <div class="breakdown-row">
                    <span class="breakdown-label">Materials</span>
                    <span class="breakdown-value">${Math.round((totalMaterialCost / combinedTotal) * 100)}%</span>
                  </div>
                  <div class="breakdown-row">
                    <span class="breakdown-label">Labor</span>
                    <span class="breakdown-value">${Math.round((totalLaborCost / combinedTotal) * 100)}%</span>
                  </div>
                </div>

                <div class="section">
                  <div class="section-title">⭐ Why Choose Us</div>
                  <div class="why-choose">
                    <div class="feature">
                      <div class="feature-icon">✓</div>
                      <div>
                        <p class="feature-title">Licensed & Insured</p>
                        <p class="feature-desc">Fully licensed contractors with comprehensive insurance</p>
                      </div>
                    </div>
                    <div class="feature">
                      <div class="feature-icon">✓</div>
                      <div>
                        <p class="feature-title">20+ Years Experience</p>
                        <p class="feature-desc">Serving Northern NJ with quality workmanship</p>
                      </div>
                    </div>
                    <div class="feature">
                      <div class="feature-icon">✓</div>
                      <div>
                        <p class="feature-title">Transparent Pricing</p>
                        <p class="feature-desc">No hidden fees or surprise costs</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="warning-card">
                  <div class="warning-title">⚠️ What Could Affect Pricing</div>
                  <ul class="warning-list">
                    <li>Existing plumbing or electrical issues that need repair</li>
                    <li>Structural modifications or load-bearing wall adjustments</li>
                    <li>Material availability and lead times</li>
                    <li>Permit fees and local building code compliance</li>
                  </ul>
                </div>

                <div class="success-card">
                  <div class="success-title">
                    <span>🛡️</span>
                    <span>Our Non-Negotiables</span>
                  </div>
                  <ul class="success-list">
                    <li><strong>Quality Materials:</strong> We only use premium, long-lasting materials</li>
                    <li><strong>Building Codes:</strong> 100% compliance with local regulations</li>
                    <li><strong>Clean Worksite:</strong> Daily cleanup and debris removal</li>
                  </ul>
                </div>

                <div style="background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <div style="color: #0c4a6e; font-weight: bold; margin-bottom: 15px; font-size: 16px;">📚 Learn More About Our Process & Guarantees</div>
                  <div style="display: flex; flex-direction: column; gap: 10px;">
                    <a href="https://www.lavacagc.com/warranty" style="color: #0ea5e9; text-decoration: none; font-weight: 500;">🛡️ Our 5-Year Craftsmanship Warranty →</a>
                    <a href="https://www.lavacagc.com/process" style="color: #0ea5e9; text-decoration: none; font-weight: 500;">📋 Our Proven 7-Step Renovation Process →</a>
                    <a href="https://www.lavacagc.com/about" style="color: #0ea5e9; text-decoration: none; font-weight: 500;">👥 Meet Alex & Veronica - Your Project Team →</a>
                  </div>
                </div>

                <div class="disclaimer">
                  <div class="disclaimer-title">Important Notice:</div>
                  <p>This estimate is provided for informational purposes only and does not constitute a binding contract. Final pricing may vary based on site conditions and specific requirements. All work is subject to a detailed written proposal and signed contract.</p>
                </div>

                <div class="cta-container">
                  <div style="font-size: 18px; font-weight: bold; color: #002855; margin-bottom: 15px;">Ready to Move Forward?</div>
                  <p style="color: #666; margin-bottom: 20px;">We'll contact you within 24 hours to discuss your project</p>
                  <a href="tel:+19735551234" class="cta-button">📞 Request Phone Consultation</a>
                  <a href="mailto:alex@lavacagc.com" class="cta-button cta-button-secondary">📅 Schedule Assessment</a>
                </div>
              </div>

              <div class="footer">
                <div class="footer-logo">La Vaca General Contractors</div>
                <p>Licensed & Insured | HIC# 13VH13373800</p>
                <p>Serving Northern New Jersey's Luxury Home Market</p>
                <p style="margin-top: 15px; font-size: 12px; opacity: 0.7;">
                  Questions? Reply to this email or call us at (973) 555-1234
                </p>
              </div>
            </div>
          </body>
          </html>
        `
      });
      console.log("Customer email sent successfully:", emailResult);
    } catch (emailError) {
      console.error("Error sending customer email:", emailError);
    // Don't throw - we want the lead to be created even if email fails
    }
    // Build per-option breakdown table
    const optionsBreakdown = (options?.map((opt)=>`
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${opt.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${Number(opt.material_cost || 0).toLocaleString()}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${Number(opt.labor_cost || 0).toLocaleString()}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${Number(opt.total_cost || 0).toLocaleString()}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${opt.labor_hours || 0} hrs</td>
      </tr>
    `).join("\n") || "") + (body.unmatched_selections.map((u)=>{
      // Client-supplied strings - escape before interpolating into email HTML.
      const esc = (s: string)=>s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      return `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${esc(u.label)} <span style="color:#92400e;">(${esc(u.category)})</span></td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #92400e;" colspan="4">Priced at consultation</td>
      </tr>
    `;}).join("\n"));
    const totalLaborHours = options?.reduce((sum, opt)=>sum + Number(opt.labor_hours || 0), 0) || 0;
    const encodedAddress = encodeURIComponent(`${body.lead_data.street_address}, ${body.lead_data.city}, ${body.lead_data.state} ${body.lead_data.zip_code}`);
    // Send admin notification
    try {
      const adminEmailResult = await resend.emails.send({
        from: "Calculator Leads <calculator@email.lavaca.link>",
        to: [
          "alex@lavacagc.com",
          "veronica@lavacagc.com"
        ],
        subject: `NEW ${projectType.display_name.toUpperCase()} LEAD - ${body.lead_data.project_timeline || 'Timeline TBD'} - $${Math.round(combinedTotal).toLocaleString()}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .header { background: #dc2626; color: white; padding: 20px; }
              .content { padding: 20px; }
              table { border-collapse: collapse; width: 100%; margin: 15px 0; }
              th { background: #1e40af; color: white; padding: 10px; text-align: left; }
              td { padding: 8px; border: 1px solid #ddd; }
              .highlight { background: #fef3c7; padding: 15px; margin: 15px 0; border-left: 4px solid #f59e0b; }
              .cta { background: #1e40af; color: white; padding: 15px 30px; text-decoration: none; display: inline-block; margin: 20px 0; border-radius: 5px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>🚨 NEW ${projectType.display_name.toUpperCase()} LEAD</h1>
              <p style="margin: 0; font-size: 18px;">Lead ID: ${lead.id}</p>
            </div>
            <div class="content">
              
              <h2>👤 Contact Information</h2>
              <table>
                <tr><td><strong>Name:</strong></td><td>${body.lead_data.first_name} ${body.lead_data.last_name}</td></tr>
                <tr><td><strong>Email:</strong></td><td><a href="mailto:${body.lead_data.email}">${body.lead_data.email}</a></td></tr>
                <tr><td><strong>Phone:</strong></td><td><a href="tel:${body.lead_data.phone}">${body.lead_data.phone}</a></td></tr>
                <tr><td><strong>Address:</strong></td><td>${body.lead_data.street_address}, ${body.lead_data.city}, ${body.lead_data.state} ${body.lead_data.zip_code} <a href="https://maps.google.com/?q=${encodedAddress}">📍 View Map</a></td></tr>
                <tr><td><strong>Lead Source:</strong></td><td>${body.lead_data.lead_source || 'Unknown'}</td></tr>
                <tr><td><strong>Timeline:</strong></td><td>${body.lead_data.project_timeline || 'Not specified'}</td></tr>
                <tr><td><strong>Best Time:</strong></td><td>${body.lead_data.best_contact_time || 'Anytime'}</td></tr>
                <tr><td><strong>Marketing Consent:</strong></td><td>${body.lead_data.marketing_consent ? 'Yes ✓' : 'No'}</td></tr>
              </table>
              
              <h2>🏗️ Project Details</h2>
              <table>
                <tr><td><strong>Project Type:</strong></td><td>${projectType.display_name}</td></tr>
                <tr><td><strong>Square Footage:</strong></td><td>${squareFootage} sq ft</td></tr>
                <tr><td><strong>Dimensions:</strong></td><td>${body.space_length || 'N/A'} ft × ${body.space_width || 'N/A'} ft × ${body.space_height || 'N/A'} ft</td></tr>
              </table>
              
              <div class="highlight">
                <h2 style="margin-top: 0;">💰 COST BREAKDOWN (INTERNAL ONLY)</h2>
                <table>
                  <tr style="background: #fee2e2;">
                    <td><strong>Total Materials:</strong></td>
                    <td style="text-align: right;"><strong>$${totalMaterialCost.toLocaleString()}</strong></td>
                  </tr>
                  <tr style="background: #fef3c7;">
                    <td><strong>Total Labor:</strong></td>
                    <td style="text-align: right;"><strong>$${totalLaborCost.toLocaleString()}</strong></td>
                  </tr>
                  <tr style="background: #dcfce7;">
                    <td><strong>Combined Total:</strong></td>
                    <td style="text-align: right;"><strong style="font-size: 20px;">$${combinedTotal.toLocaleString()}</strong></td>
                  </tr>
                  <tr style="background: #e0e7ff;">
                    <td><em>Customer Sees Range:</em></td>
                    <td style="text-align: right;"><em>$${rangeMin.toLocaleString()} - $${rangeMax.toLocaleString()}</em></td>
                  </tr>
                </table>
              </div>
              
              <h3>📊 Per-Option Breakdown</h3>
              <table>
                <tr>
                  <th>Option</th>
                  <th style="text-align: right;">Materials</th>
                  <th style="text-align: right;">Labor</th>
                  <th style="text-align: right;">Total</th>
                  <th style="text-align: right;">Hours</th>
                </tr>
                ${optionsBreakdown}
                <tr style="background: #f3f4f6; font-weight: bold;">
                  <td>TOTALS</td>
                  <td style="text-align: right;">$${totalMaterialCost.toLocaleString()}</td>
                  <td style="text-align: right;">$${totalLaborCost.toLocaleString()}</td>
                  <td style="text-align: right;">$${combinedTotal.toLocaleString()}</td>
                  <td style="text-align: right;">${totalLaborHours} hrs</td>
                </tr>
              </table>
              
              ${materialsList.length > 0 ? `
              <h3>🔧 Materials List</h3>
              <ul>
                ${materialsList.map((mat)=>`<li>${mat.material_name}: <strong>${Math.ceil(mat.estimated_quantity * 100) / 100} ${mat.unit}</strong> (${mat.notes})</li>`).join("\n")}
              </ul>
              ` : ''}
              
              ${body.uploaded_image_path ? `
              <h3>📷 Uploaded Image</h3>
              <p><a href="${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/project-images/${body.uploaded_image_path}">View/Download Image</a></p>
              ` : ''}
              
              <div style="margin: 30px 0; padding: 20px; background: #fef3c7; border-left: 4px solid #f59e0b;">
                <h3 style="margin-top: 0;">⚠️ ACTION REQUIRED</h3>
                <p><strong>Contact ${body.lead_data.first_name} within 24 hours!</strong></p>
                <p>Best time to call: ${body.lead_data.best_contact_time || 'Anytime'}</p>
              </div>
              
              <a href="https://yourdomain.com/admin/leads/${lead.id}" class="cta">View in Admin Dashboard</a>
            </div>
          </body>
          </html>
        `
      });
      console.log("Admin email sent successfully:", adminEmailResult);
    } catch (emailError) {
      console.error("Error sending admin email:", emailError);
    // Don't throw - we want the lead to be created even if email fails
    }

    // Send Telegram notification
    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
    
    if (telegramToken && telegramChatId) {
      try {
        const tierEmoji = tier === 'hot' ? '🔥' : tier === 'warm' ? '🟡' : '🔵';
        const message = [
          `${tierEmoji} <b>New ${tier.toUpperCase()} Lead!</b>`,
          '',
          `👤 <b>Name:</b> ${body.lead_data.first_name} ${body.lead_data.last_name}`,
          `📱 <b>Phone:</b> <code>${body.lead_data.phone}</code>`,
          `📧 <b>Email:</b> ${body.lead_data.email}`,
          `🏠 <b>Project:</b> ${projectType.display_name}`,
          `📍 <b>Location:</b> ${body.lead_data.city}, ${body.lead_data.state}`,
          `💰 <b>Estimate:</b> $${Math.round(combinedTotal).toLocaleString()}`,
          `⭐ <b>Score:</b> ${score}/100`,
          `📊 <b>Source:</b> calculator`,
        ].join('\n');

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
        
        console.log("Telegram notification sent successfully");
      } catch (telegramError) {
        console.error("Error sending Telegram notification:", telegramError);
      }
    }
    return new Response(JSON.stringify({
      success: true,
      lead_id: lead.id,
      lead_data: lead,
      estimate_range: {
        min: rangeMin,
        max: rangeMax
      },
      materials_list: materialsList,
      message: "Estimate sent to your email"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("Error in calculate-estimate:", error);
    // Handle validation errors
    if (error.name === "ZodError") {
      return new Response(JSON.stringify({
        error: "Invalid input data",
        code: "VALIDATION_ERROR",
        details: error.errors
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      error: error.message || "Service temporarily unavailable",
      code: "INTERNAL_ERROR"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
};
serve(handler);

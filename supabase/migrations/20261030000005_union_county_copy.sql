-- Decision 006 Q21: La Vaca serves Union County as a fourth county.
-- 20261030000000_phase_2.sql now seeds the four-county copy for a fresh
-- database. This brings a database that already ran the three-county seed
-- (the local rig, any preview) to the same copy.
--
-- Guarded per column: a column is rewritten only while it still holds the
-- exact three-county seed text, so anything the admin has edited in
-- Services & Prices is left alone. The Union keyword is appended only when
-- it is missing and the list has room (the editor caps keywords at 10).
-- Re-running it changes nothing.

-- cabinet-repainting
UPDATE public.home_services SET seo_title_en = 'Cabinet Painting in Essex, Morris, Bergen & Union NJ, $2,095', updated_at = now()
  WHERE slug = 'cabinet-repainting' AND seo_title_en = 'Cabinet Repainting in Essex, Morris & Bergen NJ from $2,095';
UPDATE public.home_services SET seo_title_es = 'Pintar gabinetes en Essex, Morris, Bergen y Union, $2,095', updated_at = now()
  WHERE slug = 'cabinet-repainting' AND seo_title_es = 'Pintura de gabinetes en Essex, Morris y Bergen desde $2,095';
UPDATE public.home_services SET seo_description_en = 'Cabinet repainting costs from $2,095 in Essex, Morris, Bergen and Union NJ. Sprayed enamel, two coats, firm quote from your photos the same day.', updated_at = now()
  WHERE slug = 'cabinet-repainting' AND seo_description_en = 'Cabinet repainting costs from $2,095 in Essex, Morris and Bergen Counties NJ. Sprayed enamel, two coats, firm quote from your photos the same day.';
UPDATE public.home_services SET seo_description_es = 'Repintado de gabinetes desde $2,095 en Essex, Morris, Bergen y Union NJ. Esmalte con pistola, dos capas y cotización firme con sus fotos el mismo día.', updated_at = now()
  WHERE slug = 'cabinet-repainting' AND seo_description_es = 'Repintado de gabinetes desde $2,095 en Essex, Morris y Bergen NJ. Esmalte con pistola, dos capas y cotización firme con sus fotos el mismo día.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('cabinet painting Union County'::text), updated_at = now()
  WHERE slug = 'cabinet-repainting' AND NOT seo_keywords ? 'cabinet painting Union County' AND jsonb_array_length(seo_keywords) < 10;
-- hvac-cleaning
UPDATE public.home_services SET seo_title_en = 'HVAC Cleaning in Essex, Morris, Bergen & Union NJ from $299', updated_at = now()
  WHERE slug = 'hvac-cleaning' AND seo_title_en = 'HVAC Cleaning in Essex, Morris & Bergen NJ from $299';
UPDATE public.home_services SET seo_title_es = 'Limpieza de HVAC en Essex, Morris, Bergen y Union desde $299', updated_at = now()
  WHERE slug = 'hvac-cleaning' AND seo_title_es = 'Limpieza de HVAC en Essex, Morris y Bergen NJ desde $299';
UPDATE public.home_services SET seo_description_en = 'HVAC cleaning costs from $299 per system in Essex, Morris, Bergen and Union NJ: coil, blower and drain line cleaned, filter changed. Firm price.', updated_at = now()
  WHERE slug = 'hvac-cleaning' AND seo_description_en = 'HVAC cleaning costs from $299 per system in Essex, Morris and Bergen NJ: coil, blower and drain line cleaned, filter changed. Firm price, fast scheduling.';
UPDATE public.home_services SET seo_description_es = 'Limpieza de HVAC desde $299 por sistema en Essex, Morris, Bergen y Union NJ: serpentín, ventilador y drenaje limpios, filtro nuevo. Precio firme.', updated_at = now()
  WHERE slug = 'hvac-cleaning' AND seo_description_es = 'Limpieza de HVAC desde $299 por sistema en Essex, Morris y Bergen NJ: serpentín, ventilador y drenaje limpios, filtro nuevo. Precio firme y agenda rápida.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('HVAC cleaning Union County'::text), updated_at = now()
  WHERE slug = 'hvac-cleaning' AND NOT seo_keywords ? 'HVAC cleaning Union County' AND jsonb_array_length(seo_keywords) < 10;
-- duct-and-vent-cleaning
UPDATE public.home_services SET seo_title_en = 'Air Duct Cleaning in Essex, Morris, Bergen & Union from $449', updated_at = now()
  WHERE slug = 'duct-and-vent-cleaning' AND seo_title_en = 'Air Duct Cleaning in Essex, Morris & Bergen NJ from $449';
UPDATE public.home_services SET seo_title_es = 'Limpieza de ductos: Essex, Morris, Bergen y Union, $449', updated_at = now()
  WHERE slug = 'duct-and-vent-cleaning' AND seo_title_es = 'Limpieza de ductos en Essex, Morris y Bergen NJ desde $449';
UPDATE public.home_services SET seo_description_en = 'Air duct cleaning costs from $449 for up to 10 vents in Essex, Morris, Bergen and Union NJ. Vacuumed and sanitized in one visit, firm price from your photos.', updated_at = now()
  WHERE slug = 'duct-and-vent-cleaning' AND seo_description_en = 'Air duct cleaning costs from $449 for up to 10 vents in Essex, Morris and Bergen NJ. Vacuumed and sanitized in one visit, firm price from your photos.';
UPDATE public.home_services SET seo_description_es = 'Limpieza de ductos desde $449 por hasta 10 rejillas en Essex, Morris, Bergen y Union NJ. Aspirado y desinfectado en una visita, precio firme con sus fotos.', updated_at = now()
  WHERE slug = 'duct-and-vent-cleaning' AND seo_description_es = 'Limpieza de ductos desde $449 por hasta 10 rejillas en Essex, Morris y Bergen NJ. Aspirado y desinfectado en una visita, precio firme con sus fotos.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('air duct cleaning Union County'::text), updated_at = now()
  WHERE slug = 'duct-and-vent-cleaning' AND NOT seo_keywords ? 'air duct cleaning Union County' AND jsonb_array_length(seo_keywords) < 10;
-- home-cleaning
UPDATE public.home_services SET seo_title_en = 'Home Cleaning in Essex, Morris, Bergen & Union NJ from $259', updated_at = now()
  WHERE slug = 'home-cleaning' AND seo_title_en = 'Home Cleaning in Essex, Morris & Bergen County NJ from $259';
UPDATE public.home_services SET seo_title_es = 'Limpieza de casa en Essex, Morris, Bergen y Union desde $259', updated_at = now()
  WHERE slug = 'home-cleaning' AND seo_title_es = 'Limpieza de casa en Essex, Morris y Bergen NJ desde $259';
UPDATE public.home_services SET seo_description_en = 'House cleaning costs from $259 for up to 2 bedrooms and 1 bath in Essex, Morris, Bergen and Union NJ. Vetted crews, firm price up front, one-time or recurring.', updated_at = now()
  WHERE slug = 'home-cleaning' AND seo_description_en = 'House cleaning costs from $259 for up to 2 bedrooms and 1 bath in Essex, Morris and Bergen NJ. Vetted crews, firm price up front, one-time or recurring.';
UPDATE public.home_services SET seo_description_es = 'Limpieza de casa desde $259 para hasta 2 recámaras y 1 baño en Essex, Morris, Bergen y Union NJ. Equipos verificados, precio firme, una vez o recurrente.', updated_at = now()
  WHERE slug = 'home-cleaning' AND seo_description_es = 'Limpieza de casa desde $259 para hasta 2 recámaras y 1 baño en Essex, Morris y Bergen NJ. Equipos verificados, precio firme, una vez o recurrente.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('house cleaning Union County'::text), updated_at = now()
  WHERE slug = 'home-cleaning' AND NOT seo_keywords ? 'house cleaning Union County' AND jsonb_array_length(seo_keywords) < 10;
-- exterior-painting
UPDATE public.home_services SET seo_title_en = 'Exterior Painting $2.95/sq ft: Essex, Morris, Bergen & Union', updated_at = now()
  WHERE slug = 'exterior-painting' AND seo_title_en = 'Exterior Painting in Essex, Morris & Bergen NJ, $2.95/sq ft';
UPDATE public.home_services SET seo_title_es = 'Pintura exterior: Essex, Morris, Bergen y Union, $2.95/pie²', updated_at = now()
  WHERE slug = 'exterior-painting' AND seo_title_es = 'Pintura exterior en Essex, Morris y Bergen desde $2.95/pie²';
UPDATE public.home_services SET seo_description_en = 'Exterior painting costs $2.95 per sq ft, $3,600 minimum, in Essex, Morris, Bergen and Union NJ. Power wash, prime, two coats, firm quote from photos.', updated_at = now()
  WHERE slug = 'exterior-painting' AND seo_description_en = 'Exterior painting costs $2.95 per sq ft, $3,600 minimum, in Essex, Morris and Bergen NJ. Power wash, prime and two coats, firm quote from your photos.';
UPDATE public.home_services SET seo_description_es = 'Pintura exterior a $2.95 por pie², mínimo $3,600, en Essex, Morris, Bergen y Union NJ. Lavado a presión, imprimación y dos capas, precio firme con fotos.', updated_at = now()
  WHERE slug = 'exterior-painting' AND seo_description_es = 'Pintura exterior a $2.95 por pie², mínimo $3,600, en Essex, Morris y Bergen NJ. Lavado a presión, imprimación y dos capas, cotización firme con sus fotos.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('exterior painting Union County'::text), updated_at = now()
  WHERE slug = 'exterior-painting' AND NOT seo_keywords ? 'exterior painting Union County' AND jsonb_array_length(seo_keywords) < 10;
-- gutter-cleaning
UPDATE public.home_services SET seo_title_en = 'Gutter Cleaning in Essex, Morris, Bergen & Union from $279', updated_at = now()
  WHERE slug = 'gutter-cleaning' AND seo_title_en = 'Gutter Cleaning in Essex, Morris & Bergen NJ from $279';
UPDATE public.home_services SET seo_title_es = 'Limpieza de canaletas en Essex, Morris, Bergen y Union, $279', updated_at = now()
  WHERE slug = 'gutter-cleaning' AND seo_title_es = 'Limpieza de canaletas en Essex, Morris y Bergen desde $279';
UPDATE public.home_services SET seo_description_en = 'Gutter cleaning costs from $279 single story, $349 two story, in Essex, Morris, Bergen and Union NJ. Cleared, flushed, checked and photographed, firm price.', updated_at = now()
  WHERE slug = 'gutter-cleaning' AND seo_description_en = 'Gutter cleaning costs from $279 single story, $349 two story, in Essex, Morris and Bergen NJ. Cleared, flushed, checked and photographed, firm price.';
UPDATE public.home_services SET seo_description_es = 'Limpieza de canaletas desde $279 un piso, $349 dos pisos, en Essex, Morris, Bergen y Union NJ. Despejadas, enjuagadas, revisadas y con fotos, precio firme.', updated_at = now()
  WHERE slug = 'gutter-cleaning' AND seo_description_es = 'Limpieza de canaletas desde $279 un piso, $349 dos pisos, en Essex, Morris y Bergen NJ. Despejadas, enjuagadas, revisadas y con fotos, precio firme.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('gutter cleaning Union County'::text), updated_at = now()
  WHERE slug = 'gutter-cleaning' AND NOT seo_keywords ? 'gutter cleaning Union County' AND jsonb_array_length(seo_keywords) < 10;
-- drywall-patching
UPDATE public.home_services SET seo_title_en = 'Drywall Repair in Essex, Morris, Bergen & Union NJ from $349', updated_at = now()
  WHERE slug = 'drywall-patching' AND seo_title_en = 'Drywall Repair in Essex, Morris & Bergen NJ from $349';
UPDATE public.home_services SET seo_title_es = 'Reparación de drywall en Essex, Morris, Bergen y Union, $349', updated_at = now()
  WHERE slug = 'drywall-patching' AND seo_title_es = 'Reparación de drywall en Essex, Morris y Bergen desde $349';
UPDATE public.home_services SET seo_description_en = 'Drywall repair costs from $349 for the first patch in Essex, Morris, Bergen and Union NJ: patched, taped, primed and painted to blend. Firm price.', updated_at = now()
  WHERE slug = 'drywall-patching' AND seo_description_en = 'Drywall repair costs from $349 for the first patch in Essex, Morris and Bergen NJ: cut, patched, taped, primed and painted to blend. Firm price from photos.';
UPDATE public.home_services SET seo_description_es = 'Reparación de drywall desde $349 por el primer parche en Essex, Morris, Bergen y Union NJ: parchado, encintado, imprimado y pintado. Precio firme.', updated_at = now()
  WHERE slug = 'drywall-patching' AND seo_description_es = 'Reparación de drywall desde $349 por el primer parche en Essex, Morris y Bergen NJ: cortado, parchado, encintado, imprimado y pintado. Precio firme con fotos.';
UPDATE public.home_services SET seo_keywords = seo_keywords || jsonb_build_array('drywall repair Union County'::text), updated_at = now()
  WHERE slug = 'drywall-patching' AND NOT seo_keywords ? 'drywall repair Union County' AND jsonb_array_length(seo_keywords) < 10;

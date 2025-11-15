export interface CalculatorProjectType {
  id: string;
  name: string;
  display_name: string;
  base_price_per_sqft: number;
  base_material_cost_per_sqft: number;
  base_labor_cost_per_sqft: number;
  min_sqft: number;
  max_sqft: number;
  requires_pdf_upload: boolean;
  has_calculator_options: boolean;
  active: boolean;
  seasonal_multiplier: number;
  created_at: string;
  updated_at: string;
}

export interface CalculatorOptionCategory {
  id: string;
  project_type_id: string;
  name: string;
  description: string | null;
  display_order: number;
  required: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalculatorOptionItem {
  id: string;
  option_category_id: string;
  name: string;
  description: string | null;
  modifier_type: 'additive' | 'multiplicative' | 'reductive' | 'fixed';
  modifier_value: number | null;
  material_cost: number;
  labor_cost: number;
  total_cost: number;
  display_label: string | null;
  materials_list: string[];
  labor_hours: number | null;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalculatorCategoryWithItems extends CalculatorOptionCategory {
  items: CalculatorOptionItem[];
}

export interface PDFUpload {
  id: string;
  filename: string;
  label: string;
  file_path: string;
  file_size: number;
  page_count?: number;
  uploaded_at: string;
}

export interface EstimateLead {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  lead_source?: string;
  project_timeline?: string;
  marketing_consent: boolean;
  best_contact_time?: string;
  project_type_id: string;
  project_type_name: string;
  project_description?: string;
  space_length?: number;
  space_width?: number;
  space_height?: number;
  square_footage?: number;
  total_material_cost?: number;
  total_labor_cost?: number;
  combined_total?: number;
  estimate_range_min?: number;
  estimate_range_max?: number;
  seasonal_multiplier_applied?: number;
  requires_manual_estimate: boolean;
  manual_estimate_provided?: number;
  manual_estimate_notes?: string;
  assessment_requested: boolean;
  consultation_requested: boolean;
  uploaded_images?: string[];
  uploaded_plans?: PDFUpload[];
  lead_status?: string;
  admin_notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LeadSelection {
  id?: string;
  estimate_lead_id: string;
  option_item_id: string;
  option_category_name: string;
  option_item_name: string;
  material_cost: number;
  labor_cost: number;
  total_cost: number;
  created_at?: string;
}

export interface CalculatorFormData {
  // Contact info
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  
  // Lead details
  lead_source?: string;
  project_timeline?: string;
  marketing_consent: boolean;
  best_contact_time?: string;
  
  // Project details
  project_type_id: string;
  project_type_name: string;
  project_description?: string;
  
  // Dimensions
  dimension_mode: 'sqft' | 'dimensions';
  square_footage?: number;
  space_length?: number;
  space_width?: number;
  space_height?: number;
  
  // Options
  selected_options: Record<string, string>; // category_id -> option_item_id
  
  // Additional services
  assessment_requested: boolean;
  consultation_requested: boolean;
  
  // PDFs (for home additions)
  uploaded_plans?: PDFUpload[];
}

export interface CalculatorResult {
  base_cost: number;
  base_material_cost: number;
  base_labor_cost: number;
  options_cost: number;
  options_material_cost: number;
  options_labor_cost: number;
  seasonal_adjustment: number;
  total_material_cost: number;
  total_labor_cost: number;
  combined_total: number;
  estimate_range_min: number;
  estimate_range_max: number;
  selected_items: Array<{
    category_name: string;
    item_name: string;
    display_label: string;
    material_cost: number;
    labor_cost: number;
    total_cost: number;
  }>;
}

import { supabase } from "@/integrations/supabase/client";
import {
  CalculatorProjectType,
  CalculatorCategoryWithItems,
  EstimateLead,
  LeadSelection,
  PDFUpload,
} from "@/types/calculator";

export const calculatorService = {
  // Fetch all active project types
  async getProjectTypes(): Promise<CalculatorProjectType[]> {
    const { data, error } = await supabase
      .from("calculator_project_types")
      .select("*")
      .eq("active", true)
      .order("display_name");

    if (error) throw error;
    return data || [];
  },

  // Fetch project type by name
  async getProjectTypeByName(name: string): Promise<CalculatorProjectType | null> {
    const { data, error } = await supabase
      .from("calculator_project_types")
      .select("*")
      .eq("name", name)
      .eq("active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw error;
    }
    return data;
  },

  // Fetch categories with items for a project type
  async getCategoriesWithItems(
    projectTypeId: string
  ): Promise<CalculatorCategoryWithItems[]> {
    // Fetch categories
    const { data: categories, error: catError } = await supabase
      .from("calculator_option_categories")
      .select("*")
      .eq("project_type_id", projectTypeId)
      .eq("active", true)
      .order("display_order");

    if (catError) throw catError;
    if (!categories) return [];

    // Fetch all items for these categories
    const categoryIds = categories.map((cat) => cat.id);
    const { data: items, error: itemsError } = await supabase
      .from("calculator_option_items")
      .select("*")
      .in("option_category_id", categoryIds)
      .eq("active", true)
      .order("display_order");

    if (itemsError) throw itemsError;

    // Group items by category and cast types properly
    const categoriesWithItems: CalculatorCategoryWithItems[] = categories.map(
      (category) => ({
        ...category,
        items: (items || [])
          .filter((item) => item.option_category_id === category.id)
          .map((item) => ({
            ...item,
            materials_list: (item.materials_list as Array<Record<string, unknown>>) || [],
            modifier_type: item.modifier_type as 'additive' | 'multiplicative' | 'reductive' | 'fixed',
          })),
      })
    );

    return categoriesWithItems;
  },

  // Upload PDFs to storage
  async uploadPDFs(files: Array<{file: File, label: string}>): Promise<PDFUpload[]> {
    const formData = new FormData();
    
    files.forEach((item, index) => {
      formData.append(`file_${index}`, item.file);
      formData.append(`label_${index}`, item.label);
    });

    const { data, error } = await supabase.functions.invoke(
      "upload-calculator-pdfs",
      {
        body: formData,
      }
    );

    if (error) throw error;
    return data.uploaded_files;
  },

  // Upload image for calculator
  async uploadImage(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);

    const { data, error } = await supabase.functions.invoke(
      "upload-calculator-image",
      {
        body: formData,
      }
    );

    if (error) throw error;
    return data.file_path;
  },

  // Calculate estimate and submit lead
  async calculateEstimate(
    projectType: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- formData is a dynamic shape from calculator steps
    formData: any,
    selectedOptions: string[]
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.functions.invoke(
      "calculate-estimate",
      {
        body: {
          project_type: projectType,
          space_length: formData.dimensions?.length,
          space_width: formData.dimensions?.width,
          space_height: formData.dimensions?.height,
          square_footage: formData.dimensions?.squareFootage,
          selected_options: selectedOptions,
          lead_data: {
            first_name: formData.contact?.firstName,
            last_name: formData.contact?.lastName,
            email: formData.contact?.email,
            phone: formData.contact?.phone,
            street_address: formData.contact?.streetAddress,
            city: formData.contact?.city,
            state: formData.contact?.state,
            zip_code: formData.contact?.zipCode,
            lead_source: formData.contact?.leadSource,
            best_contact_time: formData.contact?.bestContactTime,
            marketing_consent: formData.contact?.marketingConsent || false,
            project_timeline: formData.projectTimeline,
          },
          uploaded_image_path: formData.uploadedImage,
        },
      }
    );

    if (error) throw error;
    return data;
  },

  // Request assessment or consultation
  async requestAssessment(
    leadId: string,
    assessmentType: "in-person" | "phone",
    projectTimeline?: string
  ): Promise<void> {
    const { error } = await supabase.functions.invoke(
      "request-calculator-assessment",
      {
        body: {
          lead_id: leadId,
          assessment_type: assessmentType,
          project_timeline: projectTimeline,
        },
      }
    );

    if (error) throw error;
  },

  // Submit home addition lead
   
  async submitHomeAddition(
    projectDescription: string,
    projectLocation: string,
    uploadedPlans: PDFUpload[],
    leadData: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.functions.invoke(
      "submit-home-addition",
      {
        body: {
          project_description: projectDescription,
          project_location: projectLocation,
          uploaded_plans: uploadedPlans,
          lead_data: {
            first_name: leadData.firstName,
            last_name: leadData.lastName,
            email: leadData.email,
            phone: leadData.phone,
            street_address: leadData.streetAddress,
            city: leadData.city,
            state: leadData.state,
            zip_code: leadData.zipCode,
            lead_source: leadData.leadSource,
            best_contact_time: leadData.bestContactTime,
            marketing_consent: leadData.marketingConsent || false,
          },
        },
      }
    );

    if (error) throw error;
    return data;
  },

  // Submit estimate lead
  async submitEstimateLead(
    lead: EstimateLead,
    selections: Omit<LeadSelection, "estimate_lead_id">[]
  ): Promise<string> {
    // Prepare lead data for insertion - cast JSON fields
    const leadInsert = {
      ...lead,
      uploaded_images: (lead.uploaded_images || []) as unknown as string[],
      uploaded_plans: (lead.uploaded_plans || []) as unknown as PDFUpload[],
    };

    // Insert lead
    const { data: leadData, error: leadError } = await supabase
      .from("estimate_leads")
      .insert([leadInsert])
      .select()
      .single();

    if (leadError) throw leadError;
    if (!leadData) throw new Error("Failed to create lead");

    // Insert selections if any
    if (selections.length > 0) {
      const selectionsWithLeadId = selections.map((sel) => ({
        ...sel,
        estimate_lead_id: leadData.id,
      }));

      const { error: selectionsError } = await supabase
        .from("calculator_lead_selections")
        .insert(selectionsWithLeadId);

      if (selectionsError) throw selectionsError;
    }

    return leadData.id;
  },

  // Get lead by ID (admin only)
  async getLeadById(leadId: string): Promise<EstimateLead | null> {
    const { data, error } = await supabase
      .from("estimate_leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    
    // Cast JSON fields properly
    if (data) {
      return {
        ...data,
        uploaded_images: (data.uploaded_images as unknown as string[]) || [],
        uploaded_plans: (data.uploaded_plans as unknown as PDFUpload[]) || [],
      };
    }
    
    return null;
  },

  // Get lead selections (admin only)
  async getLeadSelections(leadId: string): Promise<LeadSelection[]> {
    const { data, error } = await supabase
      .from("calculator_lead_selections")
      .select("*")
      .eq("estimate_lead_id", leadId)
      .order("created_at");

    if (error) throw error;
    return data || [];
  },

  // Download PDF (admin only)
  async downloadPDF(filePath: string): Promise<Blob> {
    const { data, error } = await supabase.storage
      .from("calculator-pdfs")
      .download(filePath);

    if (error) throw error;
    return data;
  },
};

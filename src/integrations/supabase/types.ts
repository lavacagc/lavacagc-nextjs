export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      listing_renderings: {
        Row: {
          id: string
          listing_id: string
          section: string
          source_before_url: string | null
          before_url: string | null
          after_url: string | null
          style: string | null
          status: string
          attempts: number
          error: string | null
          sort_order: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          listing_id: string
          section: string
          source_before_url?: string | null
          before_url?: string | null
          after_url?: string | null
          style?: string | null
          status?: string
          attempts?: number
          error?: string | null
          sort_order?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          listing_id?: string
          section?: string
          source_before_url?: string | null
          before_url?: string | null
          after_url?: string | null
          style?: string | null
          status?: string
          attempts?: number
          error?: string | null
          sort_order?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_renderings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          }
        ]
      }
      listings: {
        Row: {
          id: string
          slug: string
          external_id: string | null
          mls_number: string | null
          address_line1: string
          address_line2: string | null
          city: string
          county: string | null
          state: string
          zip: string | null
          list_price: number | null
          beds: number | null
          baths: number | null
          sqft: number | null
          lot_size: string | null
          year_built: number | null
          property_type: string | null
          short_description: string | null
          est_remodel_budget_low: number | null
          est_remodel_budget_high: number | null
          est_arv: number | null
          area_comp_avg: number | null
          recommended_scope: string | null
          highlights: string[] | null
          photo_urls: string[] | null
          listing_url: string | null
          featured: boolean | null
          sort_order: number | null
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          slug: string
          external_id?: string | null
          mls_number?: string | null
          address_line1: string
          address_line2?: string | null
          city: string
          county?: string | null
          state?: string
          zip?: string | null
          list_price?: number | null
          beds?: number | null
          baths?: number | null
          sqft?: number | null
          lot_size?: string | null
          year_built?: number | null
          property_type?: string | null
          short_description?: string | null
          est_remodel_budget_low?: number | null
          est_remodel_budget_high?: number | null
          est_arv?: number | null
          area_comp_avg?: number | null
          recommended_scope?: string | null
          highlights?: string[] | null
          photo_urls?: string[] | null
          listing_url?: string | null
          featured?: boolean | null
          sort_order?: number | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          slug?: string
          external_id?: string | null
          mls_number?: string | null
          address_line1?: string
          address_line2?: string | null
          city?: string
          county?: string | null
          state?: string
          zip?: string | null
          list_price?: number | null
          beds?: number | null
          baths?: number | null
          sqft?: number | null
          lot_size?: string | null
          year_built?: number | null
          property_type?: string | null
          short_description?: string | null
          est_remodel_budget_low?: number | null
          est_remodel_budget_high?: number | null
          est_arv?: number | null
          area_comp_avg?: number | null
          recommended_scope?: string | null
          highlights?: string[] | null
          photo_urls?: string[] | null
          listing_url?: string | null
          featured?: boolean | null
          sort_order?: number | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      partner_realtor: {
        Row: {
          id: number
          name: string | null
          brokerage: string | null
          phone: string | null
          email: string | null
          photo_url: string | null
          bio: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          name?: string | null
          brokerage?: string | null
          phone?: string | null
          email?: string | null
          photo_url?: string | null
          bio?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          name?: string | null
          brokerage?: string | null
          phone?: string | null
          email?: string | null
          photo_url?: string | null
          bio?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: number
          buy_and_remodel_published: boolean
          updated_at: string | null
        }
        Insert: {
          id?: number
          buy_and_remodel_published?: boolean
          updated_at?: string | null
        }
        Update: {
          id?: number
          buy_and_remodel_published?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          id: string
          email: string
          first_name: string
          last_name: string
          phone: string | null
          zip_codes: string[]
          status: string
          verify_token: string | null
          verify_token_expires_at: string | null
          unsubscribe_token: string
          verified_at: string | null
          unsubscribed_at: string | null
          source: string | null
          consent_ip: string | null
          consent_user_agent: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          email: string
          first_name: string
          last_name: string
          phone?: string | null
          zip_codes?: string[]
          status?: string
          verify_token?: string | null
          verify_token_expires_at?: string | null
          unsubscribe_token: string
          verified_at?: string | null
          unsubscribed_at?: string | null
          source?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          first_name?: string
          last_name?: string
          phone?: string | null
          zip_codes?: string[]
          status?: string
          verify_token?: string | null
          verify_token_expires_at?: string | null
          unsubscribe_token?: string
          verified_at?: string | null
          unsubscribed_at?: string | null
          source?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_content_history: {
        Row: {
          blog_post_id: string | null
          content_type: string
          context_data: Json | null
          created_at: string
          generated_content: string
          id: string
          length_type: string | null
          prompt: string
          prompt_category: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          blog_post_id?: string | null
          content_type: string
          context_data?: Json | null
          created_at?: string
          generated_content: string
          id?: string
          length_type?: string | null
          prompt: string
          prompt_category?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          blog_post_id?: string | null
          content_type?: string
          context_data?: Json | null
          created_at?: string
          generated_content?: string
          id?: string
          length_type?: string | null
          prompt?: string
          prompt_category?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_content_snippets: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_config: {
        Row: {
          consent_mode_enabled: boolean | null
          created_at: string | null
          custom_dimensions: Json | null
          enhanced_ecommerce: boolean | null
          ga4_measurement_id: string | null
          gtm_container_id: string | null
          id: string
          ip_anonymization: boolean | null
          privacy_settings: Json | null
          tracking_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          consent_mode_enabled?: boolean | null
          created_at?: string | null
          custom_dimensions?: Json | null
          enhanced_ecommerce?: boolean | null
          ga4_measurement_id?: string | null
          gtm_container_id?: string | null
          id?: string
          ip_anonymization?: boolean | null
          privacy_settings?: Json | null
          tracking_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          consent_mode_enabled?: boolean | null
          created_at?: string | null
          custom_dimensions?: Json | null
          enhanced_ecommerce?: boolean | null
          ga4_measurement_id?: string | null
          gtm_container_id?: string | null
          id?: string
          ip_anonymization?: boolean | null
          privacy_settings?: Json | null
          tracking_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compliance_documents: {
        Row: {
          id: string
          document_type: "insurance" | "bond" | "license"
          display_name: string
          description: string | null
          file_url: string | null
          file_name: string | null
          file_size: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_type: "insurance" | "bond" | "license"
          display_name: string
          description?: string | null
          file_url?: string | null
          file_name?: string | null
          file_size?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          document_type?: "insurance" | "bond" | "license"
          display_name?: string
          description?: string | null
          file_url?: string | null
          file_name?: string | null
          file_size?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author: string
          category: string
          content: string
          created_at: string
          excerpt: string | null
          featured_image: string | null
          id: string
          meta_description: string | null
          meta_keywords: string | null
          meta_title: string | null
          published: boolean
          scheduled_publish_at: string | null
          slug: string
          suggested_image_prompt: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string
          category: string
          content: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          published?: boolean
          scheduled_publish_at?: string | null
          slug: string
          suggested_image_prompt?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          category?: string
          content?: string
          created_at?: string
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          published?: boolean
          scheduled_publish_at?: string | null
          slug?: string
          suggested_image_prompt?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      broken_links: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          error_message: string | null
          id: string
          last_checked: string | null
          resolved: boolean | null
          status_code: number | null
          url: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_checked?: string | null
          resolved?: boolean | null
          status_code?: number | null
          url: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          last_checked?: string | null
          resolved?: boolean | null
          status_code?: number | null
          url?: string
        }
        Relationships: []
      }
      calculator_lead_selections: {
        Row: {
          created_at: string | null
          estimate_lead_id: string | null
          id: string
          labor_cost: number
          material_cost: number
          option_category_name: string
          option_item_id: string | null
          option_item_name: string
          total_cost: number
        }
        Insert: {
          created_at?: string | null
          estimate_lead_id?: string | null
          id?: string
          labor_cost: number
          material_cost: number
          option_category_name: string
          option_item_id?: string | null
          option_item_name: string
          total_cost: number
        }
        Update: {
          created_at?: string | null
          estimate_lead_id?: string | null
          id?: string
          labor_cost?: number
          material_cost?: number
          option_category_name?: string
          option_item_id?: string | null
          option_item_name?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "calculator_lead_selections_estimate_lead_id_fkey"
            columns: ["estimate_lead_id"]
            isOneToOne: false
            referencedRelation: "estimate_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculator_lead_selections_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "calculator_option_items"
            referencedColumns: ["id"]
          },
        ]
      }
      calculator_option_categories: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          project_type_id: string | null
          required: boolean | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          project_type_id?: string | null
          required?: boolean | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          project_type_id?: string | null
          required?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calculator_option_categories_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "calculator_project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      calculator_option_items: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          display_label: string | null
          display_order: number | null
          id: string
          labor_cost: number
          labor_hours: number | null
          material_cost: number
          materials_list: Json | null
          modifier_type: string | null
          modifier_value: number | null
          name: string
          option_category_id: string | null
          total_cost: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_label?: string | null
          display_order?: number | null
          id?: string
          labor_cost?: number
          labor_hours?: number | null
          material_cost?: number
          materials_list?: Json | null
          modifier_type?: string | null
          modifier_value?: number | null
          name: string
          option_category_id?: string | null
          total_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          display_label?: string | null
          display_order?: number | null
          id?: string
          labor_cost?: number
          labor_hours?: number | null
          material_cost?: number
          materials_list?: Json | null
          modifier_type?: string | null
          modifier_value?: number | null
          name?: string
          option_category_id?: string | null
          total_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calculator_option_items_option_category_id_fkey"
            columns: ["option_category_id"]
            isOneToOne: false
            referencedRelation: "calculator_option_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      calculator_project_types: {
        Row: {
          active: boolean | null
          base_labor_cost_per_sqft: number
          base_material_cost_per_sqft: number
          base_price_per_sqft: number
          created_at: string | null
          display_name: string
          has_calculator_options: boolean | null
          id: string
          max_sqft: number
          min_sqft: number
          name: string
          requires_pdf_upload: boolean | null
          seasonal_multiplier: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          base_labor_cost_per_sqft?: number
          base_material_cost_per_sqft?: number
          base_price_per_sqft?: number
          created_at?: string | null
          display_name: string
          has_calculator_options?: boolean | null
          id?: string
          max_sqft?: number
          min_sqft?: number
          name: string
          requires_pdf_upload?: boolean | null
          seasonal_multiplier?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          base_labor_cost_per_sqft?: number
          base_material_cost_per_sqft?: number
          base_price_per_sqft?: number
          created_at?: string | null
          display_name?: string
          has_calculator_options?: boolean | null
          id?: string
          max_sqft?: number
          min_sqft?: number
          name?: string
          requires_pdf_upload?: boolean | null
          seasonal_multiplier?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      consent_logs: {
        Row: {
          consent_text: string | null
          consent_type: string
          created_at: string | null
          id: string
          ip_address: unknown
          privacy_url: string | null
          privacy_version: string | null
          tcpa_consent: boolean | null
          terms_url: string | null
          terms_version: string | null
          timestamp: string
          user_agent: string | null
          user_email: string | null
          user_phone: string | null
        }
        Insert: {
          consent_text?: string | null
          consent_type: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          privacy_url?: string | null
          privacy_version?: string | null
          tcpa_consent?: boolean | null
          terms_url?: string | null
          terms_version?: string | null
          timestamp?: string
          user_agent?: string | null
          user_email?: string | null
          user_phone?: string | null
        }
        Update: {
          consent_text?: string | null
          consent_type?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          privacy_url?: string | null
          privacy_version?: string | null
          tcpa_consent?: boolean | null
          terms_url?: string | null
          terms_version?: string | null
          timestamp?: string
          user_agent?: string | null
          user_email?: string | null
          user_phone?: string | null
        }
        Relationships: []
      }
      custom_events: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          event_action: string
          event_category: string
          event_label: string | null
          event_name: string
          event_value: number | null
          id: string
          parameters: Json | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          event_action: string
          event_category: string
          event_label?: string | null
          event_name: string
          event_value?: number | null
          id?: string
          parameters?: Json | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          event_action?: string
          event_category?: string
          event_label?: string | null
          event_name?: string
          event_value?: number | null
          id?: string
          parameters?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      estimate_leads: {
        Row: {
          admin_notes: string | null
          archived_at: string | null
          assessment_requested: boolean | null
          best_contact_time: string | null
          city: string
          combined_total: number | null
          consultation_requested: boolean | null
          contacted_at: string | null
          converted_at: string | null
          created_at: string | null
          email: string
          estimate_range_max: number | null
          estimate_range_min: number | null
          first_name: string
          id: string
          last_name: string
          lead_source: string | null
          lead_status: string | null
          manual_estimate_notes: string | null
          manual_estimate_provided: number | null
          marketing_consent: boolean | null
          phone: string
          project_description: string | null
          project_timeline: string | null
          project_type_id: string | null
          project_type_name: string
          requires_manual_estimate: boolean | null
          seasonal_multiplier_applied: number | null
          space_height: number | null
          space_length: number | null
          space_width: number | null
          square_footage: number | null
          state: string
          street_address: string
          total_labor_cost: number | null
          total_material_cost: number | null
          updated_at: string | null
          uploaded_images: Json | null
          uploaded_plans: Json | null
          zip_code: string
        }
        Insert: {
          admin_notes?: string | null
          archived_at?: string | null
          assessment_requested?: boolean | null
          best_contact_time?: string | null
          city: string
          combined_total?: number | null
          consultation_requested?: boolean | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          email: string
          estimate_range_max?: number | null
          estimate_range_min?: number | null
          first_name: string
          id?: string
          last_name: string
          lead_source?: string | null
          lead_status?: string | null
          manual_estimate_notes?: string | null
          manual_estimate_provided?: number | null
          marketing_consent?: boolean | null
          phone: string
          project_description?: string | null
          project_timeline?: string | null
          project_type_id?: string | null
          project_type_name: string
          requires_manual_estimate?: boolean | null
          seasonal_multiplier_applied?: number | null
          space_height?: number | null
          space_length?: number | null
          space_width?: number | null
          square_footage?: number | null
          state?: string
          street_address: string
          total_labor_cost?: number | null
          total_material_cost?: number | null
          updated_at?: string | null
          uploaded_images?: Json | null
          uploaded_plans?: Json | null
          zip_code: string
        }
        Update: {
          admin_notes?: string | null
          archived_at?: string | null
          assessment_requested?: boolean | null
          best_contact_time?: string | null
          city?: string
          combined_total?: number | null
          consultation_requested?: boolean | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          email?: string
          estimate_range_max?: number | null
          estimate_range_min?: number | null
          first_name?: string
          id?: string
          last_name?: string
          lead_source?: string | null
          lead_status?: string | null
          manual_estimate_notes?: string | null
          manual_estimate_provided?: number | null
          marketing_consent?: boolean | null
          phone?: string
          project_description?: string | null
          project_timeline?: string | null
          project_type_id?: string | null
          project_type_name?: string
          requires_manual_estimate?: boolean | null
          seasonal_multiplier_applied?: number | null
          space_height?: number | null
          space_length?: number | null
          space_width?: number | null
          square_footage?: number | null
          state?: string
          street_address?: string
          total_labor_cost?: number | null
          total_material_cost?: number | null
          updated_at?: string | null
          uploaded_images?: Json | null
          uploaded_plans?: Json | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_leads_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "calculator_project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      gmb_config: {
        Row: {
          access_token: string | null
          account_id: string | null
          business_name: string | null
          created_at: string
          id: string
          last_sync: string | null
          location_id: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          last_sync?: string | null
          location_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          last_sync?: string | null
          location_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      google_reviews: {
        Row: {
          comment: string | null
          create_time: string | null
          created_at: string
          id: string
          review_id: string
          review_reply: string | null
          reviewer_name: string | null
          reviewer_photo_url: string | null
          star_rating: number | null
          update_time: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          create_time?: string | null
          created_at?: string
          id?: string
          review_id: string
          review_reply?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          star_rating?: number | null
          update_time?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          create_time?: string | null
          created_at?: string
          id?: string
          review_id?: string
          review_reply?: string | null
          reviewer_name?: string | null
          reviewer_photo_url?: string | null
          star_rating?: number | null
          update_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      image_optimizations: {
        Row: {
          alt_text: string | null
          compression_ratio: number | null
          content_id: string | null
          content_type: string | null
          created_at: string
          file_size_optimized: number | null
          file_size_original: number | null
          id: string
          optimized_url: string | null
          original_url: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          compression_ratio?: number | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          file_size_optimized?: number | null
          file_size_original?: number | null
          id?: string
          optimized_url?: string | null
          original_url: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          compression_ratio?: number | null
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          file_size_optimized?: number | null
          file_size_original?: number | null
          id?: string
          optimized_url?: string | null
          original_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string | null
          archived_at: string | null
          budget_range: string | null
          city: string | null
          created_at: string
          current_project_status: string | null
          email: string
          first_name: string
          id: string
          inquiry_type: string
          last_name: string
          message: string | null
          phone: string
          preferred_contact_method: string | null
          project_timeline: string | null
          project_type: string | null
          square_footage: number | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          budget_range?: string | null
          city?: string | null
          created_at?: string
          current_project_status?: string | null
          email: string
          first_name: string
          id?: string
          inquiry_type: string
          last_name: string
          message?: string | null
          phone: string
          preferred_contact_method?: string | null
          project_timeline?: string | null
          project_type?: string | null
          square_footage?: number | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          budget_range?: string | null
          city?: string | null
          created_at?: string
          current_project_status?: string | null
          email?: string
          first_name?: string
          id?: string
          inquiry_type?: string
          last_name?: string
          message?: string | null
          phone?: string
          preferred_contact_method?: string | null
          project_timeline?: string | null
          project_type?: string | null
          square_footage?: number | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      material_estimates: {
        Row: {
          auto_generated: boolean | null
          created_at: string | null
          estimated_quantity: number
          id: string
          lead_id: string | null
          material_name: string
          notes: string | null
          unit: string
        }
        Insert: {
          auto_generated?: boolean | null
          created_at?: string | null
          estimated_quantity: number
          id?: string
          lead_id?: string | null
          material_name: string
          notes?: string | null
          unit: string
        }
        Update: {
          auto_generated?: boolean | null
          created_at?: string | null
          estimated_quantity?: number
          id?: string
          lead_id?: string | null
          material_name?: string
          notes?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_estimates_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "estimate_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      non_negotiables: {
        Row: {
          active: boolean | null
          applies_to_all: boolean | null
          created_at: string | null
          description: string
          display_order: number | null
          id: string
          project_type_id: string | null
        }
        Insert: {
          active?: boolean | null
          applies_to_all?: boolean | null
          created_at?: string | null
          description: string
          display_order?: number | null
          id?: string
          project_type_id?: string | null
        }
        Update: {
          active?: boolean | null
          applies_to_all?: boolean | null
          created_at?: string | null
          description?: string
          display_order?: number | null
          id?: string
          project_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "non_negotiables_project_type_id_fkey"
            columns: ["project_type_id"]
            isOneToOne: false
            referencedRelation: "calculator_project_types"
            referencedColumns: ["id"]
          },
        ]
      }
      opt_out_requests: {
        Row: {
          ca_resident: boolean
          confirmation_number: string | null
          created_at: string | null
          email: string
          id: string
          ip_address: unknown
          name: string
          phone: string | null
          processed_at: string | null
          request_type: string | null
          status: string | null
          submitted_at: string | null
          user_agent: string | null
        }
        Insert: {
          ca_resident?: boolean
          confirmation_number?: string | null
          created_at?: string | null
          email: string
          id?: string
          ip_address?: unknown
          name: string
          phone?: string | null
          processed_at?: string | null
          request_type?: string | null
          status?: string | null
          submitted_at?: string | null
          user_agent?: string | null
        }
        Update: {
          ca_resident?: boolean
          confirmation_number?: string | null
          created_at?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          name?: string
          phone?: string | null
          processed_at?: string | null
          request_type?: string | null
          status?: string | null
          submitted_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      data_rights_requests: {
        Row: {
          id: string
          request_type: string
          name: string
          email: string
          phone: string | null
          details: string | null
          ip_address: string | null
          user_agent: string | null
          status: string
          created_at: string
          processed_at: string | null
          response_sent_at: string | null
        }
        Insert: {
          id?: string
          request_type: string
          name: string
          email: string
          phone?: string | null
          details?: string | null
          ip_address?: string | null
          user_agent?: string | null
          status?: string
          created_at?: string
          processed_at?: string | null
          response_sent_at?: string | null
        }
        Update: {
          id?: string
          request_type?: string
          name?: string
          email?: string
          phone?: string | null
          details?: string | null
          ip_address?: string | null
          user_agent?: string | null
          status?: string
          created_at?: string
          processed_at?: string | null
          response_sent_at?: string | null
        }
        Relationships: []
      }
      page_revisions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          page_id: string
          seo_data: Json | null
          title: string
          version_number: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id: string
          seo_data?: Json | null
          title: string
          version_number: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id?: string
          seo_data?: Json | null
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          seo_data: Json | null
          slug: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          seo_data?: Json | null
          slug: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          seo_data?: Json | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      project_images: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          file_size: number | null
          height: number | null
          id: string
          image_category: string | null
          image_url: string
          is_featured: boolean
          media_type: string | null
          project_id: string
          sort_order: number
          updated_at: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          image_category?: string | null
          image_url: string
          is_featured?: boolean
          media_type?: string | null
          project_id: string
          sort_order?: number
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_size?: number | null
          height?: number | null
          id?: string
          image_category?: string | null
          image_url?: string
          is_featured?: boolean
          media_type?: string | null
          project_id?: string
          sort_order?: number
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active: boolean
          budget_range: string | null
          challenge: string | null
          client_first_name: string | null
          created_at: string
          created_by: string | null
          date_completed: string | null
          duration: string | null
          featured: boolean
          featured_image_id: string | null
          focus_keyword: string | null
          id: string
          location: string
          materials_used: string[] | null
          meta_description: string | null
          seo_title: string | null
          service_types: string[]
          solution: string | null
          sort_order: number
          special_features: string[] | null
          testimonial_rating: number | null
          testimonial_text: string | null
          title: string
          updated_at: string
          updated_by: string | null
          url_slug: string | null
        }
        Insert: {
          active?: boolean
          budget_range?: string | null
          challenge?: string | null
          client_first_name?: string | null
          created_at?: string
          created_by?: string | null
          date_completed?: string | null
          duration?: string | null
          featured?: boolean
          featured_image_id?: string | null
          focus_keyword?: string | null
          id?: string
          location: string
          materials_used?: string[] | null
          meta_description?: string | null
          seo_title?: string | null
          service_types?: string[]
          solution?: string | null
          sort_order?: number
          special_features?: string[] | null
          testimonial_rating?: number | null
          testimonial_text?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          url_slug?: string | null
        }
        Update: {
          active?: boolean
          budget_range?: string | null
          challenge?: string | null
          client_first_name?: string | null
          created_at?: string
          created_by?: string | null
          date_completed?: string | null
          duration?: string | null
          featured?: boolean
          featured_image_id?: string | null
          focus_keyword?: string | null
          id?: string
          location?: string
          materials_used?: string[] | null
          meta_description?: string | null
          seo_title?: string | null
          service_types?: string[]
          solution?: string | null
          sort_order?: number
          special_features?: string[] | null
          testimonial_rating?: number | null
          testimonial_text?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          url_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_projects_featured_image"
            columns: ["featured_image_id"]
            isOneToOne: false
            referencedRelation: "project_images"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          created_at: string | null
          id: string
          ip_address: string
          last_reset: string
        }
        Insert: {
          count?: number
          created_at?: string | null
          id?: string
          ip_address: string
          last_reset?: string
        }
        Update: {
          count?: number
          created_at?: string | null
          id?: string
          ip_address?: string
          last_reset?: string
        }
        Relationships: []
      }
      redirects: {
        Row: {
          active: boolean | null
          created_at: string
          destination_url: string
          hit_count: number | null
          id: string
          redirect_type: number | null
          source_url: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          destination_url: string
          hit_count?: number | null
          id?: string
          redirect_type?: number | null
          source_url: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          destination_url?: string
          hit_count?: number | null
          id?: string
          redirect_type?: number | null
          source_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_sync_log: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          reviews_synced: number | null
          started_at: string | null
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          reviews_synced?: number | null
          started_at?: string | null
          status: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          reviews_synced?: number | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      seo_analysis: {
        Row: {
          analysis_data: Json
          content_id: string
          content_type: string
          created_at: string
          id: string
          issues: string[] | null
          keyword_density: number | null
          readability_score: number | null
          score: number
          suggestions: string[] | null
          updated_at: string
        }
        Insert: {
          analysis_data: Json
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          issues?: string[] | null
          keyword_density?: number | null
          readability_score?: number | null
          score?: number
          suggestions?: string[] | null
          updated_at?: string
        }
        Update: {
          analysis_data?: Json
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          issues?: string[] | null
          keyword_density?: number | null
          readability_score?: number | null
          score?: number
          suggestions?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      seo_metadata: {
        Row: {
          auto_generated: boolean | null
          canonical_url: string | null
          content_id: string
          content_type: string
          created_at: string
          focus_keyword: string | null
          id: string
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          robots_directives: string[] | null
          schema_markup: Json | null
          seo_score: number | null
          twitter_description: string | null
          twitter_image: string | null
          twitter_title: string | null
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean | null
          canonical_url?: string | null
          content_id: string
          content_type: string
          created_at?: string
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          robots_directives?: string[] | null
          schema_markup?: Json | null
          seo_score?: number | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean | null
          canonical_url?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          robots_directives?: string[] | null
          schema_markup?: Json | null
          seo_score?: number | null
          twitter_description?: string | null
          twitter_image?: string | null
          twitter_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_areas: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          expertise_cards: Json
          has_page: boolean
          id: string
          name: string
          neighborhood_features: Json
          slug: string | null
          sort_order: number
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          expertise_cards?: Json
          has_page?: boolean
          id?: string
          name: string
          neighborhood_features?: Json
          slug?: string | null
          sort_order?: number
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          expertise_cards?: Json
          has_page?: boolean
          id?: string
          name?: string
          neighborhood_features?: Json
          slug?: string | null
          sort_order?: number
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string
          features: Json
          icon_name: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          features?: Json
          icon_name: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          features?: Json
          icon_name?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: string | null
          data: Json | null
          id: string
          section_key: string
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          data?: Json | null
          id?: string
          section_key: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          data?: Json | null
          id?: string
          section_key?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warranty_claims: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          image_urls: string[] | null
          invoice_number: string
          issue_description: string
          last_name: string
          original_project_type: string | null
          phone: string
          preferred_contact_method: string | null
          project_completion_date: string | null
          updated_at: string
          urgency_level: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          image_urls?: string[] | null
          invoice_number?: string
          issue_description: string
          last_name: string
          original_project_type?: string | null
          phone: string
          preferred_contact_method?: string | null
          project_completion_date?: string | null
          updated_at?: string
          urgency_level?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          image_urls?: string[] | null
          invoice_number?: string
          issue_description?: string
          last_name?: string
          original_project_type?: string | null
          phone?: string
          preferred_contact_method?: string | null
          project_completion_date?: string | null
          updated_at?: string
          urgency_level?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_old_leads: { Args: never; Returns: undefined }
      generate_project_slug: {
        Args: { project_location: string; project_title: string }
        Returns: string
      }
      get_gmb_config_safe: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      sync_google_reviews: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

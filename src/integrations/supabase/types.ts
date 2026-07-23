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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          option_id: string
          question_id: string
          weight_snapshot: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          option_id: string
          question_id: string
          weight_snapshot: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          option_id?: string
          question_id?: string
          weight_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "answers_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_results: {
        Row: {
          assessment_id: string
          computed: Json
          created_at: string
          cutoff_hits: Json
          flags: Json
          id: string
          raw_scores: Json
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          assessment_id: string
          computed: Json
          created_at?: string
          cutoff_hits: Json
          flags?: Json
          id?: string
          raw_scores: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          assessment_id?: string
          computed?: Json
          created_at?: string
          cutoff_hits?: Json
          flags?: Json
          id?: string
          raw_scores?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          access_token_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          instrument_id: string
          patient_id: string
          professional_id: string
          status: Database["public"]["Enums"]["assessment_status"]
          updated_at: string
        }
        Insert: {
          access_token_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          instrument_id: string
          patient_id: string
          professional_id: string
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
        }
        Update: {
          access_token_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          instrument_id?: string
          patient_id?: string
          professional_id?: string
          status?: Database["public"]["Enums"]["assessment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      cutoffs: {
        Row: {
          classification: string
          domain_id: string | null
          id: string
          instrument_id: string
          max_score: number
          message: string
          min_score: number
        }
        Insert: {
          classification: string
          domain_id?: string | null
          id?: string
          instrument_id: string
          max_score: number
          message?: string
          min_score: number
        }
        Update: {
          classification?: string
          domain_id?: string | null
          id?: string
          instrument_id?: string
          max_score?: number
          message?: string
          min_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "cutoffs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutoffs_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          code: string
          id: string
          instrument_id: string
          name: string
        }
        Insert: {
          code: string
          id?: string
          instrument_id: string
          name: string
        }
        Update: {
          code?: string
          id?: string
          instrument_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "domains_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      group_campaigns: {
        Row: {
          access_token_hash: string
          consent_body: string
          consent_title: string
          consent_version: string
          created_at: string
          description: string
          expires_at: string | null
          id: string
          instrument_id: string
          is_active: boolean
          professional_id: string
          title: string
          updated_at: string
        }
        Insert: {
          access_token_hash: string
          consent_body?: string
          consent_title?: string
          consent_version?: string
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          instrument_id: string
          is_active?: boolean
          professional_id: string
          title: string
          updated_at?: string
        }
        Update: {
          access_token_hash?: string
          consent_body?: string
          consent_title?: string
          consent_version?: string
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          instrument_id?: string
          is_active?: boolean
          professional_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_campaigns_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      group_campaign_instruments: {
        Row: {
          campaign_id: string
          created_at: string
          display_order: number
          instrument_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          display_order?: number
          instrument_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          display_order?: number
          instrument_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_campaign_instruments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "group_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_campaign_instruments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      group_responses: {
        Row: {
          answers: Json
          campaign_id: string
          computed: Json
          consent_version: string
          cutoff_hits: Json
          flags: Json
          id: string
          instrument_id: string | null
          ip_hash: string | null
          academic_period: string
          respondent_name: string
          severity_classification: string | null
          submitted_at: string
          user_agent: string | null
        }
        Insert: {
          answers: Json
          campaign_id: string
          computed: Json
          consent_version?: string
          cutoff_hits?: Json
          flags?: Json
          id?: string
          instrument_id?: string | null
          ip_hash?: string | null
          academic_period: string
          respondent_name: string
          severity_classification?: string | null
          submitted_at?: string
          user_agent?: string | null
        }
        Update: {
          answers?: Json
          campaign_id?: string
          computed?: Json
          consent_version?: string
          cutoff_hits?: Json
          flags?: Json
          id?: string
          instrument_id?: string | null
          ip_hash?: string | null
          academic_period?: string
          respondent_name?: string
          severity_classification?: string | null
          submitted_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "group_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_responses_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      instrument_requests: {
        Row: {
          admin_notes: string
          created_at: string
          id: string
          instrument_name: string
          professional_id: string
          purpose: string
          reference: string
          status: Database["public"]["Enums"]["ticket_status"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string
          created_at?: string
          id?: string
          instrument_name: string
          professional_id: string
          purpose: string
          reference?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string
          created_at?: string
          id?: string
          instrument_name?: string
          professional_id?: string
          purpose?: string
          reference?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          updated_at?: string
        }
        Relationships: []
      }
      instruments: {
        Row: {
          code: string
          created_at: string
          description: string
          estimated_minutes: number | null
          id: string
          instructions: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          estimated_minutes?: number | null
          id?: string
          instructions?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          estimated_minutes?: number | null
          id?: string
          instructions?: string
          name?: string
        }
        Relationships: []
      }
      lgpd_consents: {
        Row: {
          accepted_at: string
          assessment_id: string
          id: string
          ip_hash: string
          terms_version: string
          user_agent: string
        }
        Insert: {
          accepted_at?: string
          assessment_id: string
          id?: string
          ip_hash: string
          terms_version: string
          user_agent: string
        }
        Update: {
          accepted_at?: string
          assessment_id?: string
          id?: string
          ip_hash?: string
          terms_version?: string
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_consents_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          id: string
          instrument_id: string
          label: string
          ordinal: number
          question_id: string | null
          weight: number
        }
        Insert: {
          id?: string
          instrument_id: string
          label: string
          ordinal: number
          question_id?: string | null
          weight: number
        }
        Update: {
          id?: string
          instrument_id?: string
          label?: string
          ordinal?: number
          question_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "options_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          anonymized_at: string | null
          birth_year: number | null
          cpf_hash: string | null
          created_at: string
          deleted_at: string | null
          gender: string | null
          id: string
          notes_encrypted: string | null
          pii_encrypted: string
          professional_id: string
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          birth_year?: number | null
          cpf_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          gender?: string | null
          id?: string
          notes_encrypted?: string | null
          pii_encrypted: string
          professional_id: string
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          birth_year?: number | null
          cpf_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          gender?: string | null
          id?: string
          notes_encrypted?: string | null
          pii_encrypted?: string
          professional_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      professional_instruments: {
        Row: {
          created_at: string
          id: string
          instrument_id: string
          is_active: boolean
          professional_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          instrument_id: string
          is_active?: boolean
          professional_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          instrument_id?: string
          is_active?: boolean
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_instruments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          credential: string | null
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential?: string | null
          full_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential?: string | null
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          domain_id: string | null
          id: string
          instrument_id: string
          is_inverted: boolean
          ordinal: number
          text: string
        }
        Insert: {
          domain_id?: string | null
          id?: string
          instrument_id: string
          is_inverted?: boolean
          ordinal: number
          text: string
        }
        Update: {
          domain_id?: string | null
          id?: string
          instrument_id?: string
          is_inverted?: boolean
          ordinal?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          created_at: string
          id: string
          key_hash: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          created_at?: string
          id?: string
          key_hash: string
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          created_at?: string
          id?: string
          key_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      scoring_rules: {
        Row: {
          aggregation: Database["public"]["Enums"]["aggregation_kind"]
          id: string
          instrument_id: string
          max_value: number
          min_value: number
          transform: Json | null
        }
        Insert: {
          aggregation: Database["public"]["Enums"]["aggregation_kind"]
          id?: string
          instrument_id: string
          max_value?: number
          min_value?: number
          transform?: Json | null
        }
        Update: {
          aggregation?: Database["public"]["Enums"]["aggregation_kind"]
          id?: string
          instrument_id?: string
          max_value?: number
          min_value?: number
          transform?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: true
            referencedRelation: "instruments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_stale_assessments: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      aggregation_kind: "SUM" | "MEAN" | "SUM_BY_DOMAIN"
      app_role: "admin" | "professional"
      assessment_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "expired"
        | "cancelled"
      ticket_status: "pending" | "in_review" | "delivered" | "rejected"
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
      aggregation_kind: ["SUM", "MEAN", "SUM_BY_DOMAIN"],
      app_role: ["admin", "professional"],
      assessment_status: [
        "pending",
        "in_progress",
        "completed",
        "expired",
        "cancelled",
      ],
      ticket_status: ["pending", "in_review", "delivered", "rejected"],
    },
  },
} as const

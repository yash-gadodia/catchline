// Generated from the local Catchline schema (supabase/migrations) with
//   supabase gen types typescript --local
// plus the aliases at the bottom. Regenerate after every migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_transfers: {
        Row: {
          created_at: string
          from_user: string
          token: string
        }
        Insert: {
          created_at?: string
          from_user: string
          token?: string
        }
        Update: {
          created_at?: string
          from_user?: string
          token?: string
        }
        Relationships: []
      }
      apple_tokens: {
        Row: {
          created_at: string
          refresh_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          refresh_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          refresh_token?: string
          user_id?: string
        }
        Relationships: []
      }
      analyses: {
        Row: {
          analysis: Json
          created_at: string
          id: string
          lift_id: string
          user_id: string
        }
        Insert: {
          analysis: Json
          created_at?: string
          id?: string
          lift_id: string
          user_id: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          id?: string
          lift_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_lift_id_fkey"
            columns: ["lift_id"]
            isOneToOne: true
            referencedRelation: "lifts"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_deletions: {
        Row: {
          bucket: string
          created_at: string
          id: number
          lift_id: string | null
          name: string
          request_id: number | null
          source: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          lift_id?: string | null
          name: string
          request_id?: number | null
          source: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          lift_id?: string | null
          name?: string
          request_id?: number | null
          source?: string
        }
        Relationships: []
      }
      coach_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          lift_id: string
          notes: string | null
          overrides: Json
          revoked_at: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          lift_id: string
          notes?: string | null
          overrides?: Json
          revoked_at?: string | null
          token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          lift_id?: string
          notes?: string | null
          overrides?: Json
          revoked_at?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_links_lift_id_fkey"
            columns: ["lift_id"]
            isOneToOne: false
            referencedRelation: "lifts"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          created_at: string
          granted: boolean
          id: number
          kind: string
          user_id: string
          version: string
        }
        Insert: {
          created_at?: string
          granted: boolean
          id?: never
          kind: string
          user_id?: string
          version: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: never
          kind?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      cues: {
        Row: {
          created_at: string
          fault_id: string
          first_lift_id: string | null
          id: string
          last_lift_id: string | null
          movement: string
          sessions: number
          status: string
          text: string
          updated_at: string
          user_id: string
          why: string | null
        }
        Insert: {
          created_at?: string
          fault_id: string
          first_lift_id?: string | null
          id?: string
          last_lift_id?: string | null
          movement: string
          sessions?: number
          status?: string
          text: string
          updated_at?: string
          user_id: string
          why?: string | null
        }
        Update: {
          created_at?: string
          fault_id?: string
          first_lift_id?: string | null
          id?: string
          last_lift_id?: string | null
          movement?: string
          sessions?: number
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cues_first_lift_id_fkey"
            columns: ["first_lift_id"]
            isOneToOne: false
            referencedRelation: "lifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cues_last_lift_id_fkey"
            columns: ["last_lift_id"]
            isOneToOne: false
            referencedRelation: "lifts"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          note: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lifts: {
        Row: {
          attempts: number
          charged_to: string | null
          clip_deleted_at: string | null
          clip_path: string
          created_at: string
          cue_id: string | null
          no_cue_code: string | null
          error: string | null
          id: string
          load_kg: number | null
          movement: string
          pose_source: string
          processed_at: string | null
          queued_at: string | null
          retest_cue_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          charged_to?: string | null
          clip_deleted_at?: string | null
          clip_path: string
          created_at?: string
          cue_id?: string | null
          no_cue_code?: string | null
          error?: string | null
          id?: string
          load_kg?: number | null
          movement: string
          pose_source?: string
          processed_at?: string | null
          queued_at?: string | null
          retest_cue_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          charged_to?: string | null
          clip_deleted_at?: string | null
          clip_path?: string
          created_at?: string
          cue_id?: string | null
          no_cue_code?: string | null
          error?: string | null
          id?: string
          load_kg?: number | null
          movement?: string
          pose_source?: string
          processed_at?: string | null
          queued_at?: string | null
          retest_cue_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ops_alerts: {
        Row: {
          closed_at: string | null
          detail: Json | null
          id: number
          kind: string
          opened_at: string
        }
        Insert: {
          closed_at?: string | null
          detail?: Json | null
          id?: never
          kind: string
          opened_at: string
        }
        Update: {
          closed_at?: string | null
          detail?: Json | null
          id?: never
          kind?: string
          opened_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          founding: boolean
          id: string
          plan: string
          plan_synced_at: string | null
          push_token: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          founding?: boolean
          id: string
          plan?: string
          plan_synced_at?: string | null
          push_token?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          founding?: boolean
          id?: string
          plan?: string
          plan_synced_at?: string | null
          push_token?: string | null
        }
        Relationships: []
      }
      revenuecat_events: {
        Row: {
          id: string
          received_at: string
          type: string
          user_id: string | null
        }
        Insert: {
          id: string
          received_at?: string
          type: string
          user_id?: string | null
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          bonus_credits: number
          lifetime_count: number
          period_count: number
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_credits?: number
          lifetime_count?: number
          period_count?: number
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_credits?: number
          lifetime_count?: number
          period_count?: number
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      worker_heartbeats: {
        Row: {
          seen_at: string
          version: string | null
          worker_id: string
        }
        Insert: {
          seen_at?: string
          version?: string | null
          worker_id: string
        }
        Update: {
          seen_at?: string
          version?: string | null
          worker_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_account_transfer: { Args: never; Returns: string }
      complete_account_transfer: { Args: { p_token: string }; Returns: Json }
      apply_plan: {
        Args: {
          p_event_at: string
          p_event_id: string
          p_event_type: string
          p_founding: boolean
          p_plan: string
          p_user: string
        }
        Returns: string
      }
      claim_lift_job: {
        Args: { p_max_attempts?: number; p_vt?: number }
        Returns: {
          attempt: number
          clip_path: string
          lift_id: string
          load_kg: number
          movement: string
          msg_id: number
          user_id: string
        }[]
      }
      complete_lift_job: {
        Args: { p_analysis: Json; p_lift_id: string; p_msg_id: number }
        Returns: Json
      }
      consent_granted: {
        Args: { p_kind: string; p_user: string }
        Returns: boolean
      }
      create_coach_link: {
        Args: { p_days?: number; p_lift_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          lift_id: string
          notes: string | null
          overrides: Json
          revoked_at: string | null
          token: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_lift: {
        Args: { p_load_kg?: number; p_movement: string; p_retest_cue_id?: string }
        Returns: {
          attempts: number
          charged_to: string | null
          clip_deleted_at: string | null
          clip_path: string
          created_at: string
          cue_id: string | null
          no_cue_code: string | null
          error: string | null
          id: string
          load_kg: number | null
          movement: string
          pose_source: string
          processed_at: string | null
          queued_at: string | null
          retest_cue_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: never; Returns: undefined }
      enqueue_lift: {
        Args: { p_lift_id: string }
        Returns: {
          attempts: number
          charged_to: string | null
          clip_deleted_at: string | null
          clip_path: string
          created_at: string
          cue_id: string | null
          no_cue_code: string | null
          error: string | null
          id: string
          load_kg: number | null
          movement: string
          pose_source: string
          processed_at: string | null
          queued_at: string | null
          retest_cue_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_lift_job: {
        Args: {
          p_error: string
          p_lift_id: string
          p_msg_id: number
          p_retry: boolean
        }
        Returns: string
      }
      fail_device_lift: { Args: { p_code: string; p_lift_id: string }; Returns: string }
      delete_my_server_analyses: { Args: never; Returns: number }
      founding_seats: { Args: never; Returns: Json }
      get_coach_link: { Args: { p_token: string }; Returns: Json }
      lift_allowance: { Args: never; Returns: Json }
      lifts_ahead: { Args: { p_lift_id: string }; Returns: number }
      mark_clip_deleted: { Args: { p_lift_id: string }; Returns: undefined }
      ops_health: { Args: { p_now?: string }; Returns: Json }
      ops_health_check: { Args: { p_now?: string }; Returns: Json }
      plan_cap: {
        Args: { p_plan: string }
        Returns: {
          cap: number
          per_month: boolean
        }[]
      }
      purge_storage: { Args: { p_max_age?: string }; Returns: number }
      refund_lift: { Args: { p_lift_id: string }; Returns: undefined }
      save_device_analysis: {
        Args: { p_cue?: Json; p_lift_id: string; p_no_cue_code?: string }
        Returns: Json
      }
      start_device_analysis: {
        Args: { p_lift_id: string }
        Returns: {
          attempts: number
          charged_to: string | null
          clip_deleted_at: string | null
          clip_path: string
          created_at: string
          cue_id: string | null
          no_cue_code: string | null
          error: string | null
          id: string
          load_kg: number | null
          movement: string
          pose_source: string
          processed_at: string | null
          queued_at: string | null
          retest_cue_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_coach_feedback: {
        Args: { p_notes?: string; p_overrides?: Json; p_token: string }
        Returns: boolean
      }
      wake_worker: { Args: never; Returns: undefined }
      worker_heartbeat: { Args: { p_version: string; p_worker: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const



export type Profile = Tables<'profiles'>;
export type Lift = Tables<'lifts'>;
export type LiftStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'failed';
export type AnalysisRow = Tables<'analyses'>;
export type CueRow = Tables<'cues'>;
export type CueStatus = 'trying' | 'stuck' | 'didnt_stick' | 'dropped';
export type CoachLink = Tables<'coach_links'>;
export type Consent = Tables<'consents'>;
export type UsageCounters = Tables<'usage_counters'>;
export type FeatureFlag = Tables<'feature_flags'>;

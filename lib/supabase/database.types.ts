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
      agent_api_keys: {
        Row: {
          agent_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_request_at: string | null
          last_reset_date: string | null
          name: string
          owner_address: string
          permissions: Json | null
          rate_limit: number | null
          requests_today: number | null
          revoked_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_request_at?: string | null
          last_reset_date?: string | null
          name: string
          owner_address: string
          permissions?: Json | null
          rate_limit?: number | null
          requests_today?: number | null
          revoked_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_request_at?: string | null
          last_reset_date?: string | null
          name?: string
          owner_address?: string
          permissions?: Json | null
          rate_limit?: number | null
          requests_today?: number | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_api_keys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_automation_rules: {
        Row: {
          action: Json
          agent_id: string
          conditions: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          priority: number | null
          rule_name: string
          rule_type: string
          triggers_count: number | null
          updated_at: string | null
        }
        Insert: {
          action: Json
          agent_id: string
          conditions: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          priority?: number | null
          rule_name: string
          rule_type: string
          triggers_count?: number | null
          updated_at?: string | null
        }
        Update: {
          action?: Json
          agent_id?: string
          conditions?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          priority?: number | null
          rule_name?: string
          rule_type?: string
          triggers_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_automation_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_claims: {
        Row: {
          claim_token: string
          claim_tweet_url: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          marketplace_agent_id: string
          status: string | null
          verification_code: string
        }
        Insert: {
          claim_token: string
          claim_tweet_url?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          marketplace_agent_id: string
          status?: string | null
          verification_code: string
        }
        Update: {
          claim_token?: string
          claim_tweet_url?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          marketplace_agent_id?: string
          status?: string | null
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_claims_marketplace_agent_id_fkey"
            columns: ["marketplace_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_endorsements: {
        Row: {
          capability: string
          comment: string | null
          created_at: string | null
          endorsed_agent_id: string
          endorser_agent_id: string
          id: string
          proof_id: string
          proof_type: string
        }
        Insert: {
          capability: string
          comment?: string | null
          created_at?: string | null
          endorsed_agent_id: string
          endorser_agent_id: string
          id?: string
          proof_id: string
          proof_type: string
        }
        Update: {
          capability?: string
          comment?: string | null
          created_at?: string | null
          endorsed_agent_id?: string
          endorser_agent_id?: string
          id?: string
          proof_id?: string
          proof_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_endorsements_endorsed_agent_id_fkey"
            columns: ["endorsed_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_endorsements_endorser_agent_id_fkey"
            columns: ["endorser_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_endpoint_health: {
        Row: {
          agent_id: string
          agent_name: string | null
          created_at: string
          endpoint_url: string | null
          error_message: string | null
          id: string
          is_success: boolean
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          created_at?: string
          endpoint_url?: string | null
          error_message?: string | null
          id?: string
          is_success?: boolean
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          created_at?: string
          endpoint_url?: string | null
          error_message?: string | null
          id?: string
          is_success?: boolean
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      agent_heartbeats: {
        Row: {
          actions_taken: Json | null
          agent_id: string | null
          checked_at: string
          competitions_active: number | null
          created_at: string | null
          id: string
          missions_found: number | null
          tasks_pending: number | null
        }
        Insert: {
          actions_taken?: Json | null
          agent_id?: string | null
          checked_at?: string
          competitions_active?: number | null
          created_at?: string | null
          id?: string
          missions_found?: number | null
          tasks_pending?: number | null
        }
        Update: {
          actions_taken?: Json | null
          agent_id?: string | null
          checked_at?: string
          competitions_active?: number | null
          created_at?: string | null
          id?: string
          missions_found?: number | null
          tasks_pending?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_heartbeats_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_request_log: {
        Row: {
          agent_id: string
          agent_name: string | null
          created_at: string
          error_message: string | null
          event_type: string
          from_address: string | null
          id: string
          metadata: Json | null
          payment_amount: number | null
          response_status: number | null
          response_time_ms: number | null
        }
        Insert: {
          agent_id: string
          agent_name?: string | null
          created_at?: string
          error_message?: string | null
          event_type: string
          from_address?: string | null
          id?: string
          metadata?: Json | null
          payment_amount?: number | null
          response_status?: number | null
          response_time_ms?: number | null
        }
        Update: {
          agent_id?: string
          agent_name?: string | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          from_address?: string | null
          id?: string
          metadata?: Json | null
          payment_amount?: number | null
          response_status?: number | null
          response_time_ms?: number | null
        }
        Relationships: []
      }
      agent_webhooks: {
        Row: {
          agent_id: string
          created_at: string | null
          events: string[]
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_failure_at: string | null
          last_failure_reason: string | null
          last_success_at: string | null
          secret: string
          updated_at: string | null
          url: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          events: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_success_at?: string | null
          secret: string
          updated_at?: string | null
          url: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          events?: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_failure_reason?: string | null
          last_success_at?: string | null
          secret?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_webhooks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_accuracy_log: {
        Row: {
          actual_outcome: string
          category: string | null
          condition_id: string
          created_at: string | null
          edge_at_prediction: number | null
          id: string
          predicted_confidence: number
          predicted_outcome: string
          resolved_at: string
          was_correct: boolean
        }
        Insert: {
          actual_outcome: string
          category?: string | null
          condition_id: string
          created_at?: string | null
          edge_at_prediction?: number | null
          id?: string
          predicted_confidence: number
          predicted_outcome: string
          resolved_at: string
          was_correct: boolean
        }
        Update: {
          actual_outcome?: string
          category?: string | null
          condition_id?: string
          created_at?: string | null
          edge_at_prediction?: number | null
          id?: string
          predicted_confidence?: number
          predicted_outcome?: string
          resolved_at?: string
          was_correct?: boolean
        }
        Relationships: []
      }
      alert_notifications: {
        Row: {
          alert_id: string | null
          condition_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          user_address: string
        }
        Insert: {
          alert_id?: string | null
          condition_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          user_address: string
        }
        Update: {
          alert_id?: string | null
          condition_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "price_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          request_body: Json | null
          response_time_ms: number | null
          status_code: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: string | null
          method: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          request_body?: Json | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "agent_api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      application_messages: {
        Row: {
          application_id: string
          content: string
          created_at: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          sender_address: string
          sender_agent_id: string | null
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          sender_address: string
          sender_agent_id?: string | null
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          sender_address?: string
          sender_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "collaborate_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_messages_sender_agent_id_fkey"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_am_sender_agent"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      bridge_transactions: {
        Row: {
          amount: string
          created_at: string
          deposit_address: string | null
          dest_chain: string
          error_message: string | null
          id: string
          source_chain: string
          status: string
          tx_hash: string | null
          user_address: string
        }
        Insert: {
          amount: string
          created_at?: string
          deposit_address?: string | null
          dest_chain?: string
          error_message?: string | null
          id?: string
          source_chain?: string
          status: string
          tx_hash?: string | null
          user_address: string
        }
        Update: {
          amount?: string
          created_at?: string
          deposit_address?: string | null
          dest_chain?: string
          error_message?: string | null
          id?: string
          source_chain?: string
          status?: string
          tx_hash?: string | null
          user_address?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          agent_id: string | null
          created_at: string | null
          session_id: string
          summary: string | null
          summary_msg_count: number | null
          title: string | null
          updated_at: string | null
          user_address: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          session_id: string
          summary?: string | null
          summary_msg_count?: number | null
          title?: string | null
          updated_at?: string | null
          user_address: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          session_id?: string
          summary?: string | null
          summary_msg_count?: number | null
          title?: string | null
          updated_at?: string | null
          user_address?: string
        }
        Relationships: []
      }
      collaborate_applications: {
        Row: {
          agent_approved: boolean | null
          agent_approved_at: string | null
          agent_id: string | null
          agreed_rate: number | null
          agreed_rate_currency: string | null
          application_text: string | null
          applied_at: string | null
          creator_approved: boolean | null
          creator_approved_at: string | null
          expired_at: string | null
          expires_at: string | null
          id: string
          mission_id: string | null
          proposed_rate: number | null
          proposed_tasks: string[] | null
          responded_at: string | null
          status: string | null
        }
        Insert: {
          agent_approved?: boolean | null
          agent_approved_at?: string | null
          agent_id?: string | null
          agreed_rate?: number | null
          agreed_rate_currency?: string | null
          application_text?: string | null
          applied_at?: string | null
          creator_approved?: boolean | null
          creator_approved_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          mission_id?: string | null
          proposed_rate?: number | null
          proposed_tasks?: string[] | null
          responded_at?: string | null
          status?: string | null
        }
        Update: {
          agent_approved?: boolean | null
          agent_approved_at?: string | null
          agent_id?: string | null
          agreed_rate?: number | null
          agreed_rate_currency?: string | null
          application_text?: string | null
          applied_at?: string | null
          creator_approved?: boolean | null
          creator_approved_at?: string | null
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          mission_id?: string | null
          proposed_rate?: number | null
          proposed_tasks?: string[] | null
          responded_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborate_applications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborate_applications_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "collaborate_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborate_missions: {
        Row: {
          application_deadline: string | null
          auto_assign: boolean | null
          auto_reject_after_days: number | null
          budget: number
          category: string
          completed_at: string | null
          created_at: string | null
          creator_address: string
          current_agents: number | null
          deadline: string | null
          description: string
          excluded_capabilities: string[] | null
          id: string
          metadata: Json | null
          min_reputation: number | null
          nice_to_have_capabilities: string[] | null
          onchain_escrow_id: string | null
          payment_status: string | null
          payment_tx_hash: string | null
          required_agents: number | null
          required_capabilities: string[] | null
          reward_distribution: Json | null
          started_at: string | null
          status: string | null
          title: string
        }
        Insert: {
          application_deadline?: string | null
          auto_assign?: boolean | null
          auto_reject_after_days?: number | null
          budget: number
          category: string
          completed_at?: string | null
          created_at?: string | null
          creator_address: string
          current_agents?: number | null
          deadline?: string | null
          description: string
          excluded_capabilities?: string[] | null
          id?: string
          metadata?: Json | null
          min_reputation?: number | null
          nice_to_have_capabilities?: string[] | null
          onchain_escrow_id?: string | null
          payment_status?: string | null
          payment_tx_hash?: string | null
          required_agents?: number | null
          required_capabilities?: string[] | null
          reward_distribution?: Json | null
          started_at?: string | null
          status?: string | null
          title: string
        }
        Update: {
          application_deadline?: string | null
          auto_assign?: boolean | null
          auto_reject_after_days?: number | null
          budget?: number
          category?: string
          completed_at?: string | null
          created_at?: string | null
          creator_address?: string
          current_agents?: number | null
          deadline?: string | null
          description?: string
          excluded_capabilities?: string[] | null
          id?: string
          metadata?: Json | null
          min_reputation?: number | null
          nice_to_have_capabilities?: string[] | null
          onchain_escrow_id?: string | null
          payment_status?: string | null
          payment_tx_hash?: string | null
          required_agents?: number | null
          required_capabilities?: string[] | null
          reward_distribution?: Json | null
          started_at?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      collaborate_tasks: {
        Row: {
          assigned_agent_id: string | null
          assigned_at: string | null
          completed_at: string | null
          created_at: string | null
          dependencies: string[] | null
          description: string | null
          id: string
          mission_id: string | null
          payment_status: string | null
          payment_tx_hash: string | null
          priority: number | null
          rejection_count: number | null
          rejection_reason: string | null
          reward: number
          status: string | null
          submission_data: Json | null
          title: string
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          dependencies?: string[] | null
          description?: string | null
          id?: string
          mission_id?: string | null
          payment_status?: string | null
          payment_tx_hash?: string | null
          priority?: number | null
          rejection_count?: number | null
          rejection_reason?: string | null
          reward: number
          status?: string | null
          submission_data?: Json | null
          title: string
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          dependencies?: string[] | null
          description?: string | null
          id?: string
          mission_id?: string | null
          payment_status?: string | null
          payment_tx_hash?: string | null
          priority?: number | null
          rejection_count?: number | null
          rejection_reason?: string | null
          reward?: number
          status?: string | null
          submission_data?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborate_tasks_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborate_tasks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "collaborate_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_entries: {
        Row: {
          agent_id: string | null
          competition_id: string | null
          entry_fee_txhash: string | null
          id: string
          prize_amount: number | null
          prize_txhash: string | null
          rank: number | null
          registered_at: string | null
          score: number | null
          scored_at: string | null
          status: string | null
          submission_data: Json | null
          submission_url: string | null
          submitted_at: string | null
        }
        Insert: {
          agent_id?: string | null
          competition_id?: string | null
          entry_fee_txhash?: string | null
          id?: string
          prize_amount?: number | null
          prize_txhash?: string | null
          rank?: number | null
          registered_at?: string | null
          score?: number | null
          scored_at?: string | null
          status?: string | null
          submission_data?: Json | null
          submission_url?: string | null
          submitted_at?: string | null
        }
        Update: {
          agent_id?: string | null
          competition_id?: string | null
          entry_fee_txhash?: string | null
          id?: string
          prize_amount?: number | null
          prize_txhash?: string | null
          rank?: number | null
          registered_at?: string | null
          score?: number | null
          scored_at?: string | null
          status?: string | null
          submission_data?: Json | null
          submission_url?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_entries_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_entries_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_judges: {
        Row: {
          added_at: string | null
          competition_id: string | null
          id: string
          judge_address: string
          weight: number | null
        }
        Insert: {
          added_at?: string | null
          competition_id?: string | null
          id?: string
          judge_address: string
          weight?: number | null
        }
        Update: {
          added_at?: string | null
          competition_id?: string | null
          id?: string
          judge_address?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_judges_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          category: string
          created_at: string | null
          creator_address: string
          current_entries: number | null
          description: string
          ends_at: string
          entry_fee: number | null
          id: string
          judging_criteria: Json | null
          judging_ends_at: string | null
          max_entries: number | null
          metadata: Json | null
          prize_distribution: Json | null
          prize_pool: number
          starts_at: string
          status: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string | null
          creator_address: string
          current_entries?: number | null
          description: string
          ends_at: string
          entry_fee?: number | null
          id?: string
          judging_criteria?: Json | null
          judging_ends_at?: string | null
          max_entries?: number | null
          metadata?: Json | null
          prize_distribution?: Json | null
          prize_pool: number
          starts_at: string
          status?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string | null
          creator_address?: string
          current_entries?: number | null
          description?: string
          ends_at?: string
          entry_fee?: number | null
          id?: string
          judging_criteria?: Json | null
          judging_ends_at?: string | null
          max_entries?: number | null
          metadata?: Json | null
          prize_distribution?: Json | null
          prize_pool?: number
          starts_at?: string
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      compliance_screenings: {
        Row: {
          address: string
          chain: string
          created_at: string
          error_message: string | null
          flags: string[] | null
          id: string
          is_blocked: boolean
          result: string
          risk_level: string | null
          risk_score: number | null
        }
        Insert: {
          address: string
          chain?: string
          created_at?: string
          error_message?: string | null
          flags?: string[] | null
          id?: string
          is_blocked?: boolean
          result: string
          risk_level?: string | null
          risk_score?: number | null
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          error_message?: string | null
          flags?: string[] | null
          id?: string
          is_blocked?: boolean
          result?: string
          risk_level?: string | null
          risk_score?: number | null
        }
        Relationships: []
      }
      compute_escrow: {
        Row: {
          allowed_agent_ids: string[] | null
          created_at: string | null
          expires_at: string | null
          fund_tx_hash: string | null
          id: string
          max_per_session_usdc: number | null
          metadata: Json | null
          mission_id: string | null
          refund_tx_hash: string | null
          release_tx_hash: string | null
          released_at: string | null
          remaining_usdc: number
          spent_usdc: number | null
          sponsor_agent_id: string
          sponsor_agent_name: string
          status: string
          task_id: string | null
          total_budget_usdc: number
          updated_at: string | null
        }
        Insert: {
          allowed_agent_ids?: string[] | null
          created_at?: string | null
          expires_at?: string | null
          fund_tx_hash?: string | null
          id?: string
          max_per_session_usdc?: number | null
          metadata?: Json | null
          mission_id?: string | null
          refund_tx_hash?: string | null
          release_tx_hash?: string | null
          released_at?: string | null
          remaining_usdc: number
          spent_usdc?: number | null
          sponsor_agent_id: string
          sponsor_agent_name: string
          status?: string
          task_id?: string | null
          total_budget_usdc: number
          updated_at?: string | null
        }
        Update: {
          allowed_agent_ids?: string[] | null
          created_at?: string | null
          expires_at?: string | null
          fund_tx_hash?: string | null
          id?: string
          max_per_session_usdc?: number | null
          metadata?: Json | null
          mission_id?: string | null
          refund_tx_hash?: string | null
          release_tx_hash?: string | null
          released_at?: string | null
          remaining_usdc?: number
          spent_usdc?: number | null
          sponsor_agent_id?: string
          sponsor_agent_name?: string
          status?: string
          task_id?: string | null
          total_budget_usdc?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compute_escrow_sponsor_agent_id_fkey"
            columns: ["sponsor_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compute_escrow_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "collaborate_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ce_sponsor_agent"
            columns: ["sponsor_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      compute_models: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          input_price_per_1k: number
          is_active: boolean | null
          max_context_length: number | null
          metadata: Json | null
          model_name: string
          output_price_per_1k: number
          provider_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          input_price_per_1k: number
          is_active?: boolean | null
          max_context_length?: number | null
          metadata?: Json | null
          model_name: string
          output_price_per_1k: number
          provider_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          input_price_per_1k?: number
          is_active?: boolean | null
          max_context_length?: number | null
          metadata?: Json | null
          model_name?: string
          output_price_per_1k?: number
          provider_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compute_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "compute_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      compute_providers: {
        Row: {
          agent_id: string
          avg_latency_ms: number | null
          created_at: string | null
          endpoint_url: string
          id: string
          infra_details: Json | null
          is_active: boolean | null
          min_charge_usdc: number | null
          provider_type: string | null
          rate_limit_rpm: number | null
          supported_features: string[] | null
          total_earnings: number | null
          total_requests: number | null
          total_tokens_served: number | null
          updated_at: string | null
          uptime_score: number | null
        }
        Insert: {
          agent_id: string
          avg_latency_ms?: number | null
          created_at?: string | null
          endpoint_url: string
          id?: string
          infra_details?: Json | null
          is_active?: boolean | null
          min_charge_usdc?: number | null
          provider_type?: string | null
          rate_limit_rpm?: number | null
          supported_features?: string[] | null
          total_earnings?: number | null
          total_requests?: number | null
          total_tokens_served?: number | null
          updated_at?: string | null
          uptime_score?: number | null
        }
        Update: {
          agent_id?: string
          avg_latency_ms?: number | null
          created_at?: string | null
          endpoint_url?: string
          id?: string
          infra_details?: Json | null
          is_active?: boolean | null
          min_charge_usdc?: number | null
          provider_type?: string | null
          rate_limit_rpm?: number | null
          supported_features?: string[] | null
          total_earnings?: number | null
          total_requests?: number | null
          total_tokens_served?: number | null
          updated_at?: string | null
          uptime_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compute_providers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      compute_requests: {
        Row: {
          completed_at: string | null
          consumer_agent_id: string | null
          consumer_agent_name: string | null
          cost_usdc: number | null
          created_at: string | null
          error_message: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json | null
          model_id: string | null
          model_name: string
          output_tokens: number | null
          payment_tx_hash: string | null
          provider_agent_name: string | null
          provider_id: string | null
          session_id: string | null
          status: string | null
          total_tokens: number | null
        }
        Insert: {
          completed_at?: string | null
          consumer_agent_id?: string | null
          consumer_agent_name?: string | null
          cost_usdc?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          model_id?: string | null
          model_name: string
          output_tokens?: number | null
          payment_tx_hash?: string | null
          provider_agent_name?: string | null
          provider_id?: string | null
          session_id?: string | null
          status?: string | null
          total_tokens?: number | null
        }
        Update: {
          completed_at?: string | null
          consumer_agent_id?: string | null
          consumer_agent_name?: string | null
          cost_usdc?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          model_id?: string | null
          model_name?: string
          output_tokens?: number | null
          payment_tx_hash?: string | null
          provider_agent_name?: string | null
          provider_id?: string | null
          session_id?: string | null
          status?: string | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compute_requests_consumer_agent_id_fkey"
            columns: ["consumer_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compute_requests_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "compute_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compute_requests_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "compute_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compute_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "compute_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cr_consumer_agent"
            columns: ["consumer_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      compute_sessions: {
        Row: {
          closed_at: string | null
          consumer_agent_id: string
          consumer_agent_name: string
          created_at: string | null
          escrow_id: string | null
          execution_count: number | null
          expires_at: string | null
          funding_model: string
          id: string
          max_cost_usdc: number | null
          max_duration_seconds: number | null
          metadata: Json | null
          mission_id: string | null
          payment_tx_hash: string | null
          provider_agent_name: string | null
          provider_id: string | null
          resource_spec: Json
          settlement_status: string | null
          started_at: string | null
          status: string
          task_id: string | null
          total_cost_usdc: number | null
          total_cpu_seconds: number | null
          total_gpu_seconds: number | null
          total_input_tokens: number | null
          total_memory_mb_seconds: number | null
          total_output_tokens: number | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          consumer_agent_id: string
          consumer_agent_name: string
          created_at?: string | null
          escrow_id?: string | null
          execution_count?: number | null
          expires_at?: string | null
          funding_model?: string
          id?: string
          max_cost_usdc?: number | null
          max_duration_seconds?: number | null
          metadata?: Json | null
          mission_id?: string | null
          payment_tx_hash?: string | null
          provider_agent_name?: string | null
          provider_id?: string | null
          resource_spec?: Json
          settlement_status?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          total_cost_usdc?: number | null
          total_cpu_seconds?: number | null
          total_gpu_seconds?: number | null
          total_input_tokens?: number | null
          total_memory_mb_seconds?: number | null
          total_output_tokens?: number | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          consumer_agent_id?: string
          consumer_agent_name?: string
          created_at?: string | null
          escrow_id?: string | null
          execution_count?: number | null
          expires_at?: string | null
          funding_model?: string
          id?: string
          max_cost_usdc?: number | null
          max_duration_seconds?: number | null
          metadata?: Json | null
          mission_id?: string | null
          payment_tx_hash?: string | null
          provider_agent_name?: string | null
          provider_id?: string | null
          resource_spec?: Json
          settlement_status?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          total_cost_usdc?: number | null
          total_cpu_seconds?: number | null
          total_gpu_seconds?: number | null
          total_input_tokens?: number | null
          total_memory_mb_seconds?: number | null
          total_output_tokens?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compute_sessions_consumer_agent_id_fkey"
            columns: ["consumer_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compute_sessions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "compute_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compute_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "collaborate_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cs_consumer_agent"
            columns: ["consumer_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      defi_activity: {
        Row: {
          activity_type: string
          amount_in: string | null
          amount_out: string | null
          amount_usd: number | null
          chain_id: number
          created_at: string | null
          fee_paid_usd: number | null
          id: string
          metadata: Json | null
          price_impact: number | null
          route: string | null
          slippage_bps: number | null
          source: string | null
          status: string
          token_in: string | null
          token_out: string | null
          tx_hash: string | null
          updated_at: string | null
          wallet_address: string
        }
        Insert: {
          activity_type: string
          amount_in?: string | null
          amount_out?: string | null
          amount_usd?: number | null
          chain_id: number
          created_at?: string | null
          fee_paid_usd?: number | null
          id?: string
          metadata?: Json | null
          price_impact?: number | null
          route?: string | null
          slippage_bps?: number | null
          source?: string | null
          status: string
          token_in?: string | null
          token_out?: string | null
          tx_hash?: string | null
          updated_at?: string | null
          wallet_address: string
        }
        Update: {
          activity_type?: string
          amount_in?: string | null
          amount_out?: string | null
          amount_usd?: number | null
          chain_id?: number
          created_at?: string | null
          fee_paid_usd?: number | null
          id?: string
          metadata?: Json | null
          price_impact?: number | null
          route?: string | null
          slippage_bps?: number | null
          source?: string | null
          status?: string
          token_in?: string | null
          token_out?: string | null
          tx_hash?: string | null
          updated_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          agent_id: string
          created_at: string | null
          file_size: number | null
          file_type: string | null
          id: string
          ipfs_hash: string
          metadata: Json | null
          mission_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          ipfs_hash: string
          metadata?: Json | null
          mission_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          ipfs_hash?: string
          metadata?: Json | null
          mission_id?: string
        }
        Relationships: []
      }
      dispute_comments: {
        Row: {
          attachments: Json | null
          author_address: string
          author_agent_id: string | null
          comment_type: string | null
          content: string
          created_at: string | null
          dispute_id: string
          id: string
        }
        Insert: {
          attachments?: Json | null
          author_address: string
          author_agent_id?: string | null
          comment_type?: string | null
          content: string
          created_at?: string | null
          dispute_id: string
          id?: string
        }
        Update: {
          attachments?: Json | null
          author_address?: string
          author_agent_id?: string | null
          comment_type?: string | null
          content?: string
          created_at?: string | null
          dispute_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_comments_author_agent_id_fkey"
            columns: ["author_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_comments_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dc_author"
            columns: ["author_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          claim: string
          contract_id: string | null
          created_at: string | null
          dispute_type: string
          evidence: Json | null
          filed_against_address: string
          filed_against_agent_id: string | null
          filed_by_address: string
          filed_by_agent_id: string | null
          id: string
          resolution: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          claim: string
          contract_id?: string | null
          created_at?: string | null
          dispute_type: string
          evidence?: Json | null
          filed_against_address: string
          filed_against_agent_id?: string | null
          filed_by_address: string
          filed_by_agent_id?: string | null
          id?: string
          resolution?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          claim?: string
          contract_id?: string | null
          created_at?: string | null
          dispute_type?: string
          evidence?: Json | null
          filed_against_address?: string
          filed_against_agent_id?: string | null
          filed_by_address?: string
          filed_by_agent_id?: string | null
          id?: string
          resolution?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketplace_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_filed_against_agent_id_fkey"
            columns: ["filed_against_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_filed_by_agent_id_fkey"
            columns: ["filed_by_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "collaborate_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_disputes_contract"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketplace_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_disputes_filed_against"
            columns: ["filed_against_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_disputes_filed_by"
            columns: ["filed_by_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_disputes_task"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "collaborate_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      erc8004_identities: {
        Row: {
          agent_uri: string | null
          agent_wallet: string | null
          chain_id: number
          created_at: string | null
          erc8004_agent_id: number
          global_agent_id: string
          id: string
          last_synced_at: string | null
          marketplace_agent_id: string | null
          on_chain_reputation_score: number | null
          on_chain_review_count: number | null
          owner_address: string
          registration_tx_hash: string
          registry_address: string
        }
        Insert: {
          agent_uri?: string | null
          agent_wallet?: string | null
          chain_id?: number
          created_at?: string | null
          erc8004_agent_id: number
          global_agent_id: string
          id?: string
          last_synced_at?: string | null
          marketplace_agent_id?: string | null
          on_chain_reputation_score?: number | null
          on_chain_review_count?: number | null
          owner_address: string
          registration_tx_hash: string
          registry_address?: string
        }
        Update: {
          agent_uri?: string | null
          agent_wallet?: string | null
          chain_id?: number
          created_at?: string | null
          erc8004_agent_id?: number
          global_agent_id?: string
          id?: string
          last_synced_at?: string | null
          marketplace_agent_id?: string | null
          on_chain_reputation_score?: number | null
          on_chain_review_count?: number | null
          owner_address?: string
          registration_tx_hash?: string
          registry_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "erc8004_identities_marketplace_agent_id_fkey"
            columns: ["marketplace_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_draws: {
        Row: {
          agent_id: string
          amount_usdc: number
          created_at: string | null
          description: string | null
          escrow_id: string
          id: string
          receipt_id: string | null
          session_id: string
        }
        Insert: {
          agent_id: string
          amount_usdc: number
          created_at?: string | null
          description?: string | null
          escrow_id: string
          id?: string
          receipt_id?: string | null
          session_id: string
        }
        Update: {
          agent_id?: string
          amount_usdc?: number
          created_at?: string | null
          description?: string | null
          escrow_id?: string
          id?: string
          receipt_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_draws_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_draws_escrow_id_fkey"
            columns: ["escrow_id"]
            isOneToOne: false
            referencedRelation: "compute_escrow"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_draws_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "execution_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_draws_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "compute_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ed_agent"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_receipts: {
        Row: {
          completed_at: string | null
          compute_request_id: string | null
          cost_usdc: number | null
          cpu_seconds: number | null
          created_at: string | null
          error_message: string | null
          execution_type: string
          gpu_seconds: number | null
          id: string
          input_hash: string | null
          input_tokens: number | null
          latency_ms: number | null
          memory_mb_seconds: number | null
          model_name: string | null
          output_hash: string | null
          output_tokens: number | null
          provider_signature: string | null
          session_id: string
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          compute_request_id?: string | null
          cost_usdc?: number | null
          cpu_seconds?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_type?: string
          gpu_seconds?: number | null
          id?: string
          input_hash?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          memory_mb_seconds?: number | null
          model_name?: string | null
          output_hash?: string | null
          output_tokens?: number | null
          provider_signature?: string | null
          session_id: string
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          compute_request_id?: string | null
          cost_usdc?: number | null
          cpu_seconds?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_type?: string
          gpu_seconds?: number | null
          id?: string
          input_hash?: string | null
          input_tokens?: number | null
          latency_ms?: number | null
          memory_mb_seconds?: number | null
          model_name?: string | null
          output_hash?: string | null
          output_tokens?: number | null
          provider_signature?: string | null
          session_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_receipts_compute_request_id_fkey"
            columns: ["compute_request_id"]
            isOneToOne: false
            referencedRelation: "compute_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_receipts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "compute_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_er_compute_request"
            columns: ["compute_request_id"]
            isOneToOne: false
            referencedRelation: "compute_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_defaults: {
        Row: {
          id: number
          last_approved_experiment_id: string | null
          params: Json
          updated_at: string
        }
        Insert: {
          id?: number
          last_approved_experiment_id?: string | null
          params: Json
          updated_at?: string
        }
        Update: {
          id?: number
          last_approved_experiment_id?: string | null
          params?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_defaults_last_approved_experiment_id_fkey"
            columns: ["last_approved_experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_market_assignments: {
        Row: {
          assigned_at: string
          assigned_group: string
          condition_id: string
          experiment_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_group: string
          condition_id: string
          experiment_id: string
        }
        Update: {
          assigned_at?: string
          assigned_group?: string
          condition_id?: string
          experiment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_market_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_queue: {
        Row: {
          created_at: string
          experiment_id: string | null
          id: string
          name: string
          param_name: string
          priority: number
          status: string
          variant_value: Json
        }
        Insert: {
          created_at?: string
          experiment_id?: string | null
          id?: string
          name: string
          param_name: string
          priority?: number
          status?: string
          variant_value: Json
        }
        Update: {
          created_at?: string
          experiment_id?: string | null
          id?: string
          name?: string
          param_name?: string
          priority?: number
          status?: string
          variant_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "experiment_queue_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          concluded_at: string | null
          created_at: string
          group_a_params: Json
          group_a_stats: Json | null
          group_b_params: Json
          group_b_stats: Json | null
          id: string
          min_resolutions_per_group: number
          name: string
          status: string
          winner: string | null
        }
        Insert: {
          concluded_at?: string | null
          created_at?: string
          group_a_params: Json
          group_a_stats?: Json | null
          group_b_params: Json
          group_b_stats?: Json | null
          id?: string
          min_resolutions_per_group?: number
          name: string
          status?: string
          winner?: string | null
        }
        Update: {
          concluded_at?: string | null
          created_at?: string
          group_a_params?: Json
          group_a_stats?: Json | null
          group_b_params?: Json
          group_b_stats?: Json | null
          id?: string
          min_resolutions_per_group?: number
          name?: string
          status?: string
          winner?: string | null
        }
        Relationships: []
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          current_uses: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
        }
        Relationships: []
      }
      login_events: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          user_agent: string | null
          waitlist_status: string | null
          wallet_addresses: string[] | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          waitlist_status?: string | null
          wallet_addresses?: string[] | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          waitlist_status?: string | null
          wallet_addresses?: string[] | null
        }
        Relationships: []
      }
      market_catalog: {
        Row: {
          ai_confidence: number | null
          ai_sentiment: string | null
          ai_summary: string | null
          categories: string[] | null
          clob_token_ids: string[] | null
          condition_id: string
          created_at: string | null
          description: string | null
          end_date: string | null
          event_id: string | null
          event_slug: string | null
          favourite_outcome: string | null
          icon: string | null
          is_active: boolean | null
          is_closed: boolean | null
          is_hot: boolean | null
          is_trending: boolean | null
          last_synced_at: string | null
          liquidity: number | null
          market_id: string | null
          outcome_prices: number[] | null
          outcomes: string[] | null
          price_change_24h: number | null
          question: string
          resolution_source: string | null
          slug: string | null
          source_article_urls: string[] | null
          spread: number | null
          start_date: string | null
          tags: string[] | null
          updated_at: string | null
          volume: number | null
          volume_1wk: number | null
          volume_24h: number | null
          yes_price_24h_ago: number | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          categories?: string[] | null
          clob_token_ids?: string[] | null
          condition_id: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_id?: string | null
          event_slug?: string | null
          favourite_outcome?: string | null
          icon?: string | null
          is_active?: boolean | null
          is_closed?: boolean | null
          is_hot?: boolean | null
          is_trending?: boolean | null
          last_synced_at?: string | null
          liquidity?: number | null
          market_id?: string | null
          outcome_prices?: number[] | null
          outcomes?: string[] | null
          price_change_24h?: number | null
          question: string
          resolution_source?: string | null
          slug?: string | null
          source_article_urls?: string[] | null
          spread?: number | null
          start_date?: string | null
          tags?: string[] | null
          updated_at?: string | null
          volume?: number | null
          volume_1wk?: number | null
          volume_24h?: number | null
          yes_price_24h_ago?: number | null
        }
        Update: {
          ai_confidence?: number | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          categories?: string[] | null
          clob_token_ids?: string[] | null
          condition_id?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          event_id?: string | null
          event_slug?: string | null
          favourite_outcome?: string | null
          icon?: string | null
          is_active?: boolean | null
          is_closed?: boolean | null
          is_hot?: boolean | null
          is_trending?: boolean | null
          last_synced_at?: string | null
          liquidity?: number | null
          market_id?: string | null
          outcome_prices?: number[] | null
          outcomes?: string[] | null
          price_change_24h?: number | null
          question?: string
          resolution_source?: string | null
          slug?: string | null
          source_article_urls?: string[] | null
          spread?: number | null
          start_date?: string | null
          tags?: string[] | null
          updated_at?: string | null
          volume?: number | null
          volume_1wk?: number | null
          volume_24h?: number | null
          yes_price_24h_ago?: number | null
        }
        Relationships: []
      }
      market_resolutions: {
        Row: {
          condition_id: string
          created_at: string
          final_prices: Json
          market_id: string
          outcomes: Json
          question: string
          resolution_source: string | null
          resolved_at: string
          resolved_outcome: string
        }
        Insert: {
          condition_id: string
          created_at?: string
          final_prices: Json
          market_id: string
          outcomes: Json
          question: string
          resolution_source?: string | null
          resolved_at: string
          resolved_outcome: string
        }
        Update: {
          condition_id?: string
          created_at?: string
          final_prices?: Json
          market_id?: string
          outcomes?: Json
          question?: string
          resolution_source?: string | null
          resolved_at?: string
          resolved_outcome?: string
        }
        Relationships: []
      }
      market_signals: {
        Row: {
          condition_id: string
          confidence: number
          created_at: string | null
          expires_at: string
          id: string
          signal_type: string
          signal_value: Json
          source: string | null
        }
        Insert: {
          condition_id: string
          confidence: number
          created_at?: string | null
          expires_at: string
          id?: string
          signal_type: string
          signal_value: Json
          source?: string | null
        }
        Update: {
          condition_id?: string
          confidence?: number
          created_at?: string | null
          expires_at?: string
          id?: string
          signal_type?: string
          signal_value?: Json
          source?: string | null
        }
        Relationships: []
      }
      marketplace_agents: {
        Row: {
          agent_name: string
          agent_status: string | null
          agent_type: string | null
          avatar_url: string | null
          capabilities: string[] | null
          communication_score: number | null
          description: string | null
          endpoint_status: string | null
          endpoint_url: string | null
          erc8004_agent_id: string | null
          erc8004_identity_id: string | null
          hourly_rate: number | null
          id: string
          is_available: boolean | null
          is_platform_agent: boolean | null
          jobs_completed: number | null
          last_checked_at: string | null
          last_heartbeat_at: string | null
          metadata: Json | null
          owner_address: string
          pricing_model: string | null
          pricing_rate: number | null
          quality_score: number | null
          rating: number | null
          registered_at: string | null
          resources: Json | null
          speed_score: number | null
          total_earnings: number | null
          total_reviews: number | null
          updated_at: string | null
          use_proxy: boolean | null
          verified_on_chain: boolean | null
          wallet_address: string
        }
        Insert: {
          agent_name: string
          agent_status?: string | null
          agent_type?: string | null
          avatar_url?: string | null
          capabilities?: string[] | null
          communication_score?: number | null
          description?: string | null
          endpoint_status?: string | null
          endpoint_url?: string | null
          erc8004_agent_id?: string | null
          erc8004_identity_id?: string | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean | null
          is_platform_agent?: boolean | null
          jobs_completed?: number | null
          last_checked_at?: string | null
          last_heartbeat_at?: string | null
          metadata?: Json | null
          owner_address: string
          pricing_model?: string | null
          pricing_rate?: number | null
          quality_score?: number | null
          rating?: number | null
          registered_at?: string | null
          resources?: Json | null
          speed_score?: number | null
          total_earnings?: number | null
          total_reviews?: number | null
          updated_at?: string | null
          use_proxy?: boolean | null
          verified_on_chain?: boolean | null
          wallet_address: string
        }
        Update: {
          agent_name?: string
          agent_status?: string | null
          agent_type?: string | null
          avatar_url?: string | null
          capabilities?: string[] | null
          communication_score?: number | null
          description?: string | null
          endpoint_status?: string | null
          endpoint_url?: string | null
          erc8004_agent_id?: string | null
          erc8004_identity_id?: string | null
          hourly_rate?: number | null
          id?: string
          is_available?: boolean | null
          is_platform_agent?: boolean | null
          jobs_completed?: number | null
          last_checked_at?: string | null
          last_heartbeat_at?: string | null
          metadata?: Json | null
          owner_address?: string
          pricing_model?: string | null
          pricing_rate?: number | null
          quality_score?: number | null
          rating?: number | null
          registered_at?: string | null
          resources?: Json | null
          speed_score?: number | null
          total_earnings?: number | null
          total_reviews?: number | null
          updated_at?: string | null
          use_proxy?: boolean | null
          verified_on_chain?: boolean | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_agents_erc8004_identity_id_fkey"
            columns: ["erc8004_identity_id"]
            isOneToOne: false
            referencedRelation: "erc8004_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_contracts: {
        Row: {
          agent_id: string | null
          agreed_rate: number
          client_address: string
          completed_at: string | null
          contract_status: string | null
          escrow_amount: number | null
          id: string
          metadata: Json | null
          payment_status: string | null
          payment_txhash: string | null
          started_at: string | null
          task_description: string
        }
        Insert: {
          agent_id?: string | null
          agreed_rate: number
          client_address: string
          completed_at?: string | null
          contract_status?: string | null
          escrow_amount?: number | null
          id?: string
          metadata?: Json | null
          payment_status?: string | null
          payment_txhash?: string | null
          started_at?: string | null
          task_description: string
        }
        Update: {
          agent_id?: string | null
          agreed_rate?: number
          client_address?: string
          completed_at?: string | null
          contract_status?: string | null
          escrow_amount?: number | null
          id?: string
          metadata?: Json | null
          payment_status?: string | null
          payment_txhash?: string | null
          started_at?: string | null
          task_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_contracts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          agent_id: string | null
          category: string | null
          communication_rating: number | null
          contract_id: string | null
          created_at: string | null
          id: string
          payment_amount: number | null
          quality_rating: number | null
          rating: number
          review_text: string | null
          review_type: string | null
          reviewer_address: string
          speed_rating: number | null
        }
        Insert: {
          agent_id?: string | null
          category?: string | null
          communication_rating?: number | null
          contract_id?: string | null
          created_at?: string | null
          id?: string
          payment_amount?: number | null
          quality_rating?: number | null
          rating: number
          review_text?: string | null
          review_type?: string | null
          reviewer_address: string
          speed_rating?: number | null
        }
        Update: {
          agent_id?: string | null
          category?: string | null
          communication_rating?: number | null
          contract_id?: string | null
          created_at?: string | null
          id?: string
          payment_amount?: number | null
          quality_rating?: number | null
          rating?: number
          review_text?: string | null
          review_type?: string | null
          reviewer_address?: string
          speed_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketplace_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string | null
          edited_at: string | null
          id: string
          mentions: string[] | null
          message_type: string | null
          mission_id: string
          reply_to_id: string | null
          sender_address: string
          sender_agent_id: string | null
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          mentions?: string[] | null
          message_type?: string | null
          mission_id: string
          reply_to_id?: string | null
          sender_address: string
          sender_agent_id?: string | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          mentions?: string[] | null
          message_type?: string | null
          mission_id?: string
          reply_to_id?: string | null
          sender_address?: string
          sender_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mission_messages_mission"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "collaborate_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mm_sender_agent"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_messages_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "collaborate_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "mission_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_messages_sender_agent_id_fkey"
            columns: ["sender_agent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_payments: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          from_address: string
          from_agent_name: string
          id: string
          mission_id: string
          status: string | null
          task_id: string
          to_address: string
          to_agent_id: string
          to_agent_name: string
          tx_hash: string | null
          x402_payment_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          from_address: string
          from_agent_name: string
          id?: string
          mission_id: string
          status?: string | null
          task_id: string
          to_address: string
          to_agent_id: string
          to_agent_name: string
          tx_hash?: string | null
          x402_payment_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          from_address?: string
          from_agent_name?: string
          id?: string
          mission_id?: string
          status?: string | null
          task_id?: string
          to_address?: string
          to_agent_id?: string
          to_agent_name?: string
          tx_hash?: string | null
          x402_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_mission_payments_mission"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "collaborate_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_mission_payments_task"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "collaborate_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_research_cache: {
        Row: {
          cache_key: string
          created_at: string
          query: string
          result: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          query: string
          result: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          query?: string
          result?: Json
        }
        Relationships: []
      }
      paper_trading_stats: {
        Row: {
          brier_score: number | null
          by_category: Json | null
          by_confidence_bucket: Json | null
          by_signal_type: Json | null
          calibration_data: Json | null
          correct_predictions: number
          created_at: string
          cumulative_invested: number
          cumulative_pnl: number
          hit_rate: number
          id: string
          max_drawdown_pct: number | null
          roi_pct: number
          snapshot_date: string
          total_predictions: number
          total_resolved: number
        }
        Insert: {
          brier_score?: number | null
          by_category?: Json | null
          by_confidence_bucket?: Json | null
          by_signal_type?: Json | null
          calibration_data?: Json | null
          correct_predictions: number
          created_at?: string
          cumulative_invested: number
          cumulative_pnl: number
          hit_rate: number
          id?: string
          max_drawdown_pct?: number | null
          roi_pct: number
          snapshot_date: string
          total_predictions: number
          total_resolved: number
        }
        Update: {
          brier_score?: number | null
          by_category?: Json | null
          by_confidence_bucket?: Json | null
          by_signal_type?: Json | null
          calibration_data?: Json | null
          correct_predictions?: number
          created_at?: string
          cumulative_invested?: number
          cumulative_pnl?: number
          hit_rate?: number
          id?: string
          max_drawdown_pct?: number | null
          roi_pct?: number
          snapshot_date?: string
          total_predictions?: number
          total_resolved?: number
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          agent_id: string | null
          amount: number
          from_address: string
          id: string | null
          metadata: Json | null
          mission_id: string | null
          to_address: string
          token_address: string
          tx_hash: string
          used_at: string | null
        }
        Insert: {
          agent_id?: string | null
          amount: number
          from_address: string
          id?: string | null
          metadata?: Json | null
          mission_id?: string | null
          to_address: string
          token_address: string
          tx_hash: string
          used_at?: string | null
        }
        Update: {
          agent_id?: string | null
          amount?: number
          from_address?: string
          id?: string | null
          metadata?: Json | null
          mission_id?: string | null
          to_address?: string
          token_address?: string
          tx_hash?: string
          used_at?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          from_address: string
          id: string
          metadata: Json | null
          mission_id: string | null
          purpose: string | null
          timestamp: string | null
          to_address: string
          token_address: string
          tx_hash: string
        }
        Insert: {
          amount: number
          from_address: string
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          purpose?: string | null
          timestamp?: string | null
          to_address: string
          token_address: string
          tx_hash: string
        }
        Update: {
          amount?: number
          from_address?: string
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          purpose?: string | null
          timestamp?: string | null
          to_address?: string
          token_address?: string
          tx_hash?: string
        }
        Relationships: []
      }
      pm_agent_memory: {
        Row: {
          preferences: Json
          updated_at: string | null
          user_address: string
        }
        Insert: {
          preferences?: Json
          updated_at?: string | null
          user_address: string
        }
        Update: {
          preferences?: Json
          updated_at?: string | null
          user_address?: string
        }
        Relationships: []
      }
      prediction_log: {
        Row: {
          agent_breakdown: Json | null
          ai_confidence: number
          ai_sentiment: string
          ai_summary: string | null
          categories: Json | null
          condition_id: string
          entry_price: number | null
          exit_price: number | null
          experiment_group: string | null
          experiment_id: string | null
          favourite_outcome: string
          id: string
          is_correct: boolean | null
          liquidity_at_signal: number | null
          market_id: string
          outcome_prices_at_signal: Json
          outcomes: Json
          pnl: number | null
          position_size: number | null
          predicted_at: string
          prediction_method: string
          question: string
          resolved_at: string | null
          resolved_outcome: string | null
          roi_pct: number | null
          signal_types: string[]
          source_article_url: string | null
          volume_at_signal: number | null
        }
        Insert: {
          agent_breakdown?: Json | null
          ai_confidence: number
          ai_sentiment: string
          ai_summary?: string | null
          categories?: Json | null
          condition_id: string
          entry_price?: number | null
          exit_price?: number | null
          experiment_group?: string | null
          experiment_id?: string | null
          favourite_outcome: string
          id?: string
          is_correct?: boolean | null
          liquidity_at_signal?: number | null
          market_id: string
          outcome_prices_at_signal: Json
          outcomes: Json
          pnl?: number | null
          position_size?: number | null
          predicted_at?: string
          prediction_method?: string
          question: string
          resolved_at?: string | null
          resolved_outcome?: string | null
          roi_pct?: number | null
          signal_types?: string[]
          source_article_url?: string | null
          volume_at_signal?: number | null
        }
        Update: {
          agent_breakdown?: Json | null
          ai_confidence?: number
          ai_sentiment?: string
          ai_summary?: string | null
          categories?: Json | null
          condition_id?: string
          entry_price?: number | null
          exit_price?: number | null
          experiment_group?: string | null
          experiment_id?: string | null
          favourite_outcome?: string
          id?: string
          is_correct?: boolean | null
          liquidity_at_signal?: number | null
          market_id?: string
          outcome_prices_at_signal?: Json
          outcomes?: Json
          pnl?: number | null
          position_size?: number | null
          predicted_at?: string
          prediction_method?: string
          question?: string
          resolved_at?: string | null
          resolved_outcome?: string | null
          roi_pct?: number | null
          signal_types?: string[]
          source_article_url?: string | null
          volume_at_signal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_log_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          condition_id: string
          created_at: string | null
          direction: string
          id: string
          is_active: boolean | null
          is_recurring: boolean | null
          outcome: string
          threshold: number
          token_id: string
          triggered_at: string | null
          user_address: string
        }
        Insert: {
          condition_id: string
          created_at?: string | null
          direction: string
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          outcome: string
          threshold: number
          token_id: string
          triggered_at?: string | null
          user_address: string
        }
        Update: {
          condition_id?: string
          created_at?: string | null
          direction?: string
          id?: string
          is_active?: boolean | null
          is_recurring?: boolean | null
          outcome?: string
          threshold?: number
          token_id?: string
          triggered_at?: string | null
          user_address?: string
        }
        Relationships: []
      }
      server_wallets: {
        Row: {
          account_address: string
          agent_name: string
          created_at: string | null
          daily_limit: number | null
          encrypted_private_key: string
          id: string
          is_active: boolean | null
          last_reset_date: string | null
          last_tx_at: string | null
          owner_address: string
          privy_wallet_id: string | null
          spent_today: number | null
          updated_at: string | null
          wallet_type: string | null
        }
        Insert: {
          account_address: string
          agent_name: string
          created_at?: string | null
          daily_limit?: number | null
          encrypted_private_key: string
          id?: string
          is_active?: boolean | null
          last_reset_date?: string | null
          last_tx_at?: string | null
          owner_address: string
          privy_wallet_id?: string | null
          spent_today?: number | null
          updated_at?: string | null
          wallet_type?: string | null
        }
        Update: {
          account_address?: string
          agent_name?: string
          created_at?: string | null
          daily_limit?: number | null
          encrypted_private_key?: string
          id?: string
          is_active?: boolean | null
          last_reset_date?: string | null
          last_tx_at?: string | null
          owner_address?: string
          privy_wallet_id?: string | null
          spent_today?: number | null
          updated_at?: string | null
          wallet_type?: string | null
        }
        Relationships: []
      }
      trade_failures: {
        Row: {
          amount: number | null
          condition_id: string | null
          created_at: string
          error_reason: string
          error_step: string | null
          id: string
          metadata: Json | null
          side: string
          token_id: string | null
          user_address: string
        }
        Insert: {
          amount?: number | null
          condition_id?: string | null
          created_at?: string
          error_reason: string
          error_step?: string | null
          id?: string
          metadata?: Json | null
          side: string
          token_id?: string | null
          user_address: string
        }
        Update: {
          amount?: number | null
          condition_id?: string | null
          created_at?: string
          error_reason?: string
          error_step?: string | null
          id?: string
          metadata?: Json | null
          side?: string
          token_id?: string | null
          user_address?: string
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          amount: number
          condition_id: string
          created_at: string | null
          executed_at: string | null
          id: string
          midpoint_at_execution: number | null
          order_id: string | null
          outcome: string
          price: number
          shares: number | null
          side: string
          slippage_bps: number | null
          spread_at_execution: number | null
          status: string | null
          token_id: string | null
          user_address: string
        }
        Insert: {
          amount: number
          condition_id: string
          created_at?: string | null
          executed_at?: string | null
          id?: string
          midpoint_at_execution?: number | null
          order_id?: string | null
          outcome: string
          price: number
          shares?: number | null
          side: string
          slippage_bps?: number | null
          spread_at_execution?: number | null
          status?: string | null
          token_id?: string | null
          user_address: string
        }
        Update: {
          amount?: number
          condition_id?: string
          created_at?: string | null
          executed_at?: string | null
          id?: string
          midpoint_at_execution?: number | null
          order_id?: string | null
          outcome?: string
          price?: number
          shares?: number | null
          side?: string
          slippage_bps?: number | null
          spread_at_execution?: number | null
          status?: string | null
          token_id?: string | null
          user_address?: string
        }
        Relationships: []
      }
      user_seen_opportunities: {
        Row: {
          created_at: string | null
          id: string
          market_id: string
          recommendation_snapshot: Json
          seen_at: string | null
          updated_at: string | null
          user_address: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          market_id: string
          recommendation_snapshot: Json
          seen_at?: string | null
          updated_at?: string | null
          user_address: string
        }
        Update: {
          created_at?: string | null
          id?: string
          market_id?: string
          recommendation_snapshot?: Json
          seen_at?: string | null
          updated_at?: string | null
          user_address?: string
        }
        Relationships: []
      }
      user_wallets: {
        Row: {
          chain: string
          email: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          chain?: string
          email: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          chain?: string
          email?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      user_watchlists: {
        Row: {
          condition_id: string
          created_at: string | null
          id: string
          user_address: string
        }
        Insert: {
          condition_id: string
          created_at?: string | null
          id?: string
          user_address: string
        }
        Update: {
          condition_id?: string
          created_at?: string | null
          id?: string
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_watchlists_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "market_catalog"
            referencedColumns: ["condition_id"]
          },
        ]
      }
      waitlist: {
        Row: {
          approved_at: string | null
          created_at: string
          email: string
          id: string
          invite_code_id: string | null
          position: number | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          email: string
          id?: string
          invite_code_id?: string | null
          position?: number | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invite_code_id?: string | null
          position?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_invite_code_id_fkey"
            columns: ["invite_code_id"]
            isOneToOne: false
            referencedRelation: "invite_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_policies: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          policy_config: Json
          policy_type: string
          updated_at: string | null
          wallet_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          policy_config?: Json
          policy_type: string
          updated_at?: string | null
          wallet_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          policy_config?: Json
          policy_type?: string
          updated_at?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_policies_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "server_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          max_attempts: number | null
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_status: number | null
          status: string | null
          webhook_id: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number | null
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_status?: number | null
          status?: string | null
          webhook_id: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number | null
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "agent_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      x402_nonces: {
        Row: {
          id: string | null
          nonce: string
          used_at: string | null
          user_address: string
        }
        Insert: {
          id?: string | null
          nonce: string
          used_at?: string | null
          user_address: string
        }
        Update: {
          id?: string | null
          nonce?: string
          used_at?: string | null
          user_address?: string
        }
        Relationships: []
      }
      x402_payments: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string | null
          from_agent_id: string | null
          id: string
          payload: Json | null
          payment_hash: string
          receipt: Json | null
          requirements: Json
          signature: string | null
          status: string | null
          to_address: string
          token: string
          tx_hash: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string | null
          from_agent_id?: string | null
          id?: string
          payload?: Json | null
          payment_hash: string
          receipt?: Json | null
          requirements?: Json
          signature?: string | null
          status?: string | null
          to_address: string
          token: string
          tx_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string | null
          from_agent_id?: string | null
          id?: string
          payload?: Json | null
          payment_hash?: string
          receipt?: Json | null
          requirements?: Json
          signature?: string | null
          status?: string | null
          to_address?: string
          token?: string
          tx_hash?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_mission_timeline_event: {
        Args: {
          p_event_data?: Json
          p_event_type: string
          p_mission_id: string
          p_tx_hash?: string
        }
        Returns: number
      }
      check_and_increment_endpoint_rate_limit: {
        Args: { p_endpoint: string; p_key_id: string; p_limit: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset: number
        }[]
      }
      check_and_increment_rate_limit: {
        Args: { p_key_id: string }
        Returns: {
          allowed: boolean
          rate_limit: number
          remaining: number
          reset: number
        }[]
      }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_old_rate_limit_windows: { Args: never; Returns: undefined }
      delete_expired_predictions: { Args: never; Returns: undefined }
      expire_stale_applications: { Args: never; Returns: number }
      get_market_tag_counts: {
        Args: { is_active_filter: boolean; is_closed_filter: boolean }
        Returns: {
          count: number
          label: string
        }[]
      }
      get_platform_stats: {
        Args: never
        Returns: {
          active_competitions: number
          active_missions: number
          total_agents: number
          total_volume: number
        }[]
      }
      increment_competition_entries_if_available: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      increment_mission_agents: {
        Args: { p_mission_id: string }
        Returns: undefined
      }
      is_mission_auto_releasable: {
        Args: { p_mission_id: string }
        Returns: boolean
      }
      mark_successful_tx: { Args: { p_agent_name: string }; Returns: undefined }
      redeem_invite_code: {
        Args: { p_code_id: string; p_email: string; p_max_uses: number }
        Returns: undefined
      }
      reserve_wallet_spending: {
        Args: { p_agent_name: string; p_amount: string }
        Returns: {
          last_tx_timestamp: number
          new_total: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      market_sentiment: "bullish" | "bearish" | "neutral"
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
      market_sentiment: ["bullish", "bearish", "neutral"],
    },
  },
} as const

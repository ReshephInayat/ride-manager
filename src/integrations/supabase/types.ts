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
      activity_logs: {
        Row: {
          actor: string
          actor_name: string | null
          created_at: string
          details: string | null
          driver_id: string | null
          id: string
          kind: string
          ride_id: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          title: string
          user_id: string
        }
        Insert: {
          actor: string
          actor_name?: string | null
          created_at?: string
          details?: string | null
          driver_id?: string | null
          id?: string
          kind: string
          ride_id?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          title: string
          user_id: string
        }
        Update: {
          actor?: string
          actor_name?: string | null
          created_at?: string
          details?: string | null
          driver_id?: string | null
          id?: string
          kind?: string
          ride_id?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      car_installments: {
        Row: {
          amount: number
          car_id: string
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid: boolean
          paid_date: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          amount?: number
          car_id: string
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid?: boolean
          paid_date?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          amount?: number
          car_id?: string
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid?: boolean
          paid_date?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_installments_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
        ]
      }
      car_insurance: {
        Row: {
          car_id: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          policy_number: string | null
          premium: number
          provider: string
          start_date: string
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          car_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          policy_number?: string | null
          premium?: number
          provider: string
          start_date: string
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          car_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          policy_number?: string | null
          premium?: number
          provider?: string
          start_date?: string
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_insurance_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
        ]
      }
      car_maintenance: {
        Row: {
          car_id: string
          cost: number
          created_at: string
          description: string | null
          id: string
          mileage_at_service: number | null
          next_service_mileage: number | null
          service_date: string
          system: Database["public"]["Enums"]["workspace_system"]
          type: Database["public"]["Enums"]["maintenance_type"]
          user_id: string
        }
        Insert: {
          car_id: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          mileage_at_service?: number | null
          next_service_mileage?: number | null
          service_date?: string
          system?: Database["public"]["Enums"]["workspace_system"]
          type?: Database["public"]["Enums"]["maintenance_type"]
          user_id: string
        }
        Update: {
          car_id?: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          mileage_at_service?: number | null
          next_service_mileage?: number | null
          service_date?: string
          system?: Database["public"]["Enums"]["workspace_system"]
          type?: Database["public"]["Enums"]["maintenance_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_maintenance_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
        ]
      }
      cars: {
        Row: {
          color: string | null
          created_at: string
          current_mileage: number
          id: string
          license_plate: string | null
          make: string | null
          model: string | null
          name: string
          status: Database["public"]["Enums"]["car_status"]
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          current_mileage?: number
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name: string
          status?: Database["public"]["Enums"]["car_status"]
          system?: Database["public"]["Enums"]["workspace_system"]
          updated_at?: string
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          current_mileage?: number
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name?: string
          status?: Database["public"]["Enums"]["car_status"]
          system?: Database["public"]["Enums"]["workspace_system"]
          updated_at?: string
          user_id?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          driver_id: string
          heading: number | null
          lat: number
          lng: number
          ride_id: string | null
          speed: number | null
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          heading?: number | null
          lat: number
          lng: number
          ride_id?: string | null
          speed?: number | null
          system?: Database["public"]["Enums"]["workspace_system"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          heading?: number | null
          lat?: number
          lng?: number
          ride_id?: string | null
          speed?: number | null
          system?: Database["public"]["Enums"]["workspace_system"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_login_attempts: {
        Row: {
          attempted_at: string
          client_key: string
          id: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          client_key: string
          id?: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          client_key?: string
          id?: string
          success?: boolean
        }
        Relationships: []
      }
      driver_notification_log: {
        Row: {
          id: string
          kind: string
          ride_id: string
          sent_at: string
        }
        Insert: {
          id?: string
          kind: string
          ride_id: string
          sent_at?: string
        }
        Update: {
          id?: string
          kind?: string
          ride_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_notification_log_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_payouts: {
        Row: {
          amount: number
          created_at: string
          driver_id: string
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          driver_id: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          driver_id?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_payouts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_sessions: {
        Row: {
          created_at: string
          driver_id: string
          expires_at: string
          id: string
          system: Database["public"]["Enums"]["workspace_system"]
          token: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          expires_at?: string
          id?: string
          system?: Database["public"]["Enums"]["workspace_system"]
          token?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          expires_at?: string
          id?: string
          system?: Database["public"]["Enums"]["workspace_system"]
          token?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pin_hash: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pin_hash?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pin_hash?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: []
      }
      fuel_expenses: {
        Row: {
          car_id: string
          cost: number
          created_at: string
          driver_id: string | null
          fuel_date: string
          gallons: number | null
          id: string
          mileage_at_fill: number | null
          notes: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          car_id: string
          cost?: number
          created_at?: string
          driver_id?: string | null
          fuel_date?: string
          gallons?: number | null
          id?: string
          mileage_at_fill?: number | null
          notes?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          car_id?: string
          cost?: number
          created_at?: string
          driver_id?: string | null
          fuel_date?: string
          gallons?: number | null
          id?: string
          mileage_at_fill?: number | null
          notes?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_expenses_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          ride_id: string | null
        }
        Insert: {
          amount?: number
          description: string
          id?: string
          invoice_id: string
          ride_id?: string | null
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          ride_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bill_to: string
          created_at: string
          id: string
          invoice_number: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          public_token: string | null
          sales_tax_amount: number
          sales_tax_rate: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          system: Database["public"]["Enums"]["workspace_system"]
          total: number
          user_id: string
        }
        Insert: {
          bill_to?: string
          created_at?: string
          id?: string
          invoice_number: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          public_token?: string | null
          sales_tax_amount?: number
          sales_tax_rate?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          system?: Database["public"]["Enums"]["workspace_system"]
          total?: number
          user_id: string
        }
        Update: {
          bill_to?: string
          created_at?: string
          id?: string
          invoice_number?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          public_token?: string | null
          sales_tax_amount?: number
          sales_tax_rate?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          system?: Database["public"]["Enums"]["workspace_system"]
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          driver_id: string | null
          id: string
          kind: string
          read: boolean
          ride_id: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          kind: string
          read?: boolean
          ride_id?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          kind?: string
          read?: boolean
          ride_id?: string | null
          system?: Database["public"]["Enums"]["workspace_system"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_reminders: {
        Row: {
          created_at: string
          id: string
          message: string | null
          notified: boolean
          remind_at: string
          ride_id: string
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          notified?: boolean
          remind_at: string
          ride_id: string
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          notified?: boolean
          remind_at?: string
          ride_id?: string
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_reminders_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          amount: number
          created_at: string
          dedupe_key: string | null
          department: string | null
          driver_id: string | null
          dropoff_location: string | null
          dropoff_to: string | null
          flight_number: string | null
          id: string
          notes: string | null
          passenger_email: string | null
          passenger_name: string | null
          phone: string | null
          pickup_from: string | null
          pickup_location: string | null
          pickup_time: string | null
          ride_date: string
          ride_key: string
          riders: number
          route_id: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["ride_status"]
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          dedupe_key?: string | null
          department?: string | null
          driver_id?: string | null
          dropoff_location?: string | null
          dropoff_to?: string | null
          flight_number?: string | null
          id?: string
          notes?: string | null
          passenger_email?: string | null
          passenger_name?: string | null
          phone?: string | null
          pickup_from?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          ride_date: string
          ride_key: string
          riders?: number
          route_id?: string | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          system?: Database["public"]["Enums"]["workspace_system"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          dedupe_key?: string | null
          department?: string | null
          driver_id?: string | null
          dropoff_location?: string | null
          dropoff_to?: string | null
          flight_number?: string | null
          id?: string
          notes?: string | null
          passenger_email?: string | null
          passenger_name?: string | null
          phone?: string | null
          pickup_from?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          ride_date?: string
          ride_key?: string
          riders?: number
          route_id?: string | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          system?: Database["public"]["Enums"]["workspace_system"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          dropoff_location: string
          id: string
          name: string
          pickup_location: string
          price: number
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Insert: {
          created_at?: string
          dropoff_location: string
          id?: string
          name: string
          pickup_location: string
          price?: number
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        Update: {
          created_at?: string
          dropoff_location?: string
          id?: string
          name?: string
          pickup_location?: string
          price?: number
          system?: Database["public"]["Enums"]["workspace_system"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      build_ride_key: {
        Args: {
          _dropoff_location: string
          _dropoff_to: string
          _flight_number: string
          _passenger_email: string
          _passenger_name: string
          _phone: string
          _pickup_from: string
          _pickup_location: string
          _pickup_time: string
          _ride_date: string
        }
        Returns: string
      }
      driver_clear_location: {
        Args: { _driver_id: string; _pin: string }
        Returns: undefined
      }
      driver_clear_location_by_token: {
        Args: { _token: string }
        Returns: undefined
      }
      driver_delete_notifications: {
        Args: { _driver_id: string; _pin: string }
        Returns: undefined
      }
      driver_delete_notifications_by_token: {
        Args: { _token: string }
        Returns: undefined
      }
      driver_login: {
        Args: {
          _client_key?: string
          _pin: string
          _system: Database["public"]["Enums"]["workspace_system"]
        }
        Returns: {
          id: string
          name: string
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }[]
      }
      driver_login_with_token: {
        Args: {
          _client_key?: string
          _pin: string
          _system: Database["public"]["Enums"]["workspace_system"]
        }
        Returns: {
          driver_id: string
          driver_name: string
          driver_system: Database["public"]["Enums"]["workspace_system"]
          session_token: string
        }[]
      }
      driver_mark_notifications_read: {
        Args: { _driver_id: string; _pin: string }
        Returns: undefined
      }
      driver_mark_read_by_token: {
        Args: { _token: string }
        Returns: undefined
      }
      driver_notifications: {
        Args: { _driver_id: string; _pin: string }
        Returns: {
          body: string | null
          created_at: string
          driver_id: string | null
          id: string
          kind: string
          read: boolean
          ride_id: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          title: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      driver_notifications_by_token: {
        Args: { _token: string }
        Returns: {
          body: string | null
          created_at: string
          driver_id: string | null
          id: string
          kind: string
          read: boolean
          ride_id: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          title: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      driver_rides: {
        Args: { _driver_id: string; _pin: string }
        Returns: {
          amount: number
          created_at: string
          dedupe_key: string | null
          department: string | null
          driver_id: string | null
          dropoff_location: string | null
          dropoff_to: string | null
          flight_number: string | null
          id: string
          notes: string | null
          passenger_email: string | null
          passenger_name: string | null
          phone: string | null
          pickup_from: string | null
          pickup_location: string | null
          pickup_time: string | null
          ride_date: string
          ride_key: string
          riders: number
          route_id: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["ride_status"]
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      driver_rides_by_token: {
        Args: { _token: string }
        Returns: {
          amount: number
          created_at: string
          dedupe_key: string | null
          department: string | null
          driver_id: string | null
          dropoff_location: string | null
          dropoff_to: string | null
          flight_number: string | null
          id: string
          notes: string | null
          passenger_email: string | null
          passenger_name: string | null
          phone: string | null
          pickup_from: string | null
          pickup_location: string | null
          pickup_time: string | null
          ride_date: string
          ride_key: string
          riders: number
          route_id: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["ride_status"]
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      driver_update_location: {
        Args: {
          _accuracy?: number
          _driver_id: string
          _heading?: number
          _lat: number
          _lng: number
          _pin: string
          _ride_id: string
          _speed?: number
        }
        Returns: undefined
      }
      driver_update_location_by_token: {
        Args: {
          _accuracy?: number
          _heading?: number
          _lat: number
          _lng: number
          _ride_id: string
          _speed?: number
          _token: string
        }
        Returns: undefined
      }
      driver_update_ride_status: {
        Args: {
          _driver_id: string
          _pin: string
          _ride_id: string
          _status: Database["public"]["Enums"]["ride_status"]
        }
        Returns: {
          amount: number
          created_at: string
          dedupe_key: string | null
          department: string | null
          driver_id: string | null
          dropoff_location: string | null
          dropoff_to: string | null
          flight_number: string | null
          id: string
          notes: string | null
          passenger_email: string | null
          passenger_name: string | null
          phone: string | null
          pickup_from: string | null
          pickup_location: string | null
          pickup_time: string | null
          ride_date: string
          ride_key: string
          riders: number
          route_id: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["ride_status"]
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_update_status_by_token: {
        Args: {
          _ride_id: string
          _status: Database["public"]["Enums"]["ride_status"]
          _token: string
        }
        Returns: {
          amount: number
          created_at: string
          dedupe_key: string | null
          department: string | null
          driver_id: string | null
          dropoff_location: string | null
          dropoff_to: string | null
          flight_number: string | null
          id: string
          notes: string | null
          passenger_email: string | null
          passenger_name: string | null
          phone: string | null
          pickup_from: string | null
          pickup_location: string | null
          pickup_time: string | null
          ride_date: string
          ride_key: string
          riders: number
          route_id: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["ride_status"]
          system: Database["public"]["Enums"]["workspace_system"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      driver_validate_session: {
        Args: { _token: string }
        Returns: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pin_hash: string | null
          system: Database["public"]["Enums"]["workspace_system"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "drivers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_invoice_by_token: {
        Args: { _token: string }
        Returns: {
          bill_to: string
          created_at: string
          id: string
          invoice_number: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          public_token: string | null
          sales_tax_amount: number
          sales_tax_rate: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          system: Database["public"]["Enums"]["workspace_system"]
          total: number
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_invoice_items_by_token: {
        Args: { _token: string }
        Returns: {
          amount: number
          description: string
          id: string
          invoice_id: string
          ride_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_activity: {
        Args: {
          _actor: string
          _actor_name: string
          _details?: string
          _driver_id?: string
          _kind: string
          _ride_id?: string
          _system: Database["public"]["Enums"]["workspace_system"]
          _title: string
          _user_id: string
        }
        Returns: undefined
      }
      log_invoice_access: {
        Args: { _ip?: string; _token: string }
        Returns: undefined
      }
      normalize_ride_key_text: { Args: { _value: string }; Returns: string }
      normalize_ride_key_time: { Args: { _value: string }; Returns: string }
      set_driver_pin: {
        Args: { _driver_id: string; _pin: string }
        Returns: undefined
      }
    }
    Enums: {
      car_status: "active" | "inactive" | "in_service"
      invoice_status: "draft" | "finalized"
      maintenance_type:
        | "oil_change"
        | "tire"
        | "brake"
        | "general"
        | "scheduled_service"
      ride_status:
        | "pending"
        | "completed"
        | "cancelled"
        | "no_show"
        | "started"
        | "arrived"
      workspace_system: "api" | "llc"
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
      car_status: ["active", "inactive", "in_service"],
      invoice_status: ["draft", "finalized"],
      maintenance_type: [
        "oil_change",
        "tire",
        "brake",
        "general",
        "scheduled_service",
      ],
      ride_status: [
        "pending",
        "completed",
        "cancelled",
        "no_show",
        "started",
        "arrived",
      ],
      workspace_system: ["api", "llc"],
    },
  },
} as const

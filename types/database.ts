/**
 * Database types for the Supabase `public` schema.
 *
 * Generated 2026-09-22 by introspecting PostgREST's OpenAPI schema
 * (`GET /rest/v1/`) with the service-role key, not the official
 * `supabase gen types` CLI (that needs a Supabase access token or a direct
 * Postgres connection string, neither of which was provided). Column names,
 * types, nullability and defaults below are real. One thing this approach
 * can't see, that the official generator would get exactly right:
 *   - `Enums`/status values: CHECK constraints (e.g. on `listings.status`,
 *     `profiles.role`) don't appear in PostgREST's schema, only native
 *     Postgres enum types would. Values noted in comments are only the ones
 *     confirmed elsewhere (RLS policies, a constraint someone pasted).
 * (`listings.search_vector` was confirmed generated/trigger-maintained by
 * inserting a test row without it and seeing it auto-populate; it's Row-only
 * below, not in Insert/Update.)
 * Foreign key names follow Postgres's default `<table>_<column>_fkey`
 * convention (confirmed for `profiles_id_fkey`); the others are inferred.
 *
 * To replace with exact, fully-generated types:
 *   npx supabase login
 *   npx supabase gen types typescript --project-id uygmzqpftoqvwhmqfguf --schema public > types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      experience_tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["experience_tags"]["Insert"]>;
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          title: string;
          slug: string;
          description: string | null;
          category_id: string | null;
          location: string | null;
          keywords: string[] | null;
          /**
           * CHECK constraint `listings_status_check`. Confirmed by probing
           * (inserting each candidate, service-role, then deleting): "draft"
           * (default), "published" (public per RLS), and "archived" are
           * accepted; "expired", "pending", "pending_review", "unpublished",
           * "rejected", "under_review" and "scheduled" are all rejected.
           */
          status: string;
          featured_image_url: string | null;
          /** FK -> profiles.id. */
          created_by: string | null;
          /** date, not timestamp. */
          expires_at: string | null;
          created_at: string;
          updated_at: string;
          /**
           * Weighted tsvector (title weight A, description weight C), confirmed
           * auto-populated on insert without being written explicitly — a
           * generated/trigger-maintained column. Read-only: omitted from
           * Insert/Update below.
           */
          search_vector: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          description?: string | null;
          category_id?: string | null;
          location?: string | null;
          keywords?: string[] | null;
          status?: string;
          featured_image_url?: string | null;
          created_by?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_images: {
        Row: {
          id: string;
          listing_id: string;
          url: string;
          alt_text: string | null;
          position: number;
          is_featured: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          url: string;
          alt_text?: string | null;
          position?: number;
          is_featured?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_images"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      listing_experience_tags: {
        Row: {
          listing_id: string;
          tag_id: string;
        };
        Insert: {
          listing_id: string;
          tag_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["listing_experience_tags"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "listing_experience_tags_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listing_experience_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "experience_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          /** Same as auth.users.id. */
          id: string;
          full_name: string | null;
          /** CHECK constraint: 'admin' | 'editor' | 'viewer' (default 'viewer'). */
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

/** Row type for a table, e.g. `Tables<"listings">`. */
export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

/** Insert payload type for a table, e.g. `TablesInsert<"listings">`. */
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

/** Update payload type for a table, e.g. `TablesUpdate<"listings">`. */
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

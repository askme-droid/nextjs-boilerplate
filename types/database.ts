/**
 * Database types for the Supabase `public` schema.
 *
 * !! HAND-WRITTEN PLACEHOLDER. Table names come from the project brief, but the
 * !! columns are an educated guess, not read from your database. Replace this
 * !! file with generated types, which are always exact:
 * !!
 * !!   npx supabase login
 * !!   npx supabase gen types typescript --project-id <your-project-ref> --schema public > types/database.ts
 *
 * The shape below matches what `supabase gen types` emits, so the swap needs no
 * other code changes (Tables<"listings">, etc. keep working).
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
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          parent_id?: string | null;
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
          /** "published" is public per RLS; other values are unconfirmed. */
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          description?: string | null;
          category_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
        Relationships: [];
      };
      listing_images: {
        Row: {
          id: string;
          listing_id: string;
          storage_path: string;
          alt_text: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          storage_path: string;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_images"]["Insert"]>;
        Relationships: [];
      };
      listing_experience_tags: {
        Row: {
          listing_id: string;
          experience_tag_id: string;
        };
        Insert: {
          listing_id: string;
          experience_tag_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["listing_experience_tags"]["Insert"]
        >;
        Relationships: [];
      };
      profiles: {
        Row: {
          /** Same as auth.users.id. */
          id: string;
          full_name: string | null;
          /** Defaults to "viewer"; "admin" and "editor" are staff per RLS. */
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
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
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

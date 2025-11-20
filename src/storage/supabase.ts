import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load environment variables before reading them
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let adminClient: SupabaseClient | null = null;

function buildAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. History features disabled.",
    );
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (adminClient) {
    return adminClient;
  }
  adminClient = buildAdminClient();
  return adminClient;
}






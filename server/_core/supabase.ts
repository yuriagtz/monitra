import { createClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { ENV } from "./env";
import type { Request, Response } from "express";

/**
 * Creates a Supabase client for server-side admin operations
 * This client uses the service role key for admin operations
 */
export function createAdminClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error("Supabase URL and Service Role Key must be configured");
  }
  
  return createClient(
    ENV.supabaseUrl,
    ENV.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Creates a Supabase client for request-based operations
 * This client uses the anon key and manages user sessions via cookies
 */
export function createServerSupabaseClient(req: Request, res: Response) {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key must be configured");
  }

  return createServerClient(
    ENV.supabaseUrl,
    ENV.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(req.headers.cookie ?? "");
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.appendHeader("Set-Cookie", serializeCookieHeader(name, value, options));
          });
        },
      },
    }
  );
}


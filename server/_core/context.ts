import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { createServerSupabaseClient } from "./supabase";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  supabase: ReturnType<typeof createServerSupabaseClient> | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let supabase: ReturnType<typeof createServerSupabaseClient> | null = null;
  let user: User | null = null;

  try {
    // Try to create Supabase client
    supabase = createServerSupabaseClient(opts.req, opts.res);
  } catch (error) {
    // If Supabase is not configured, log warning but continue
    console.warn("[Auth] Supabase client creation failed:", error);
    console.warn("[Auth] Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in environment variables");
    // supabase will remain null, which will be handled in auth routers
  }

  if (supabase) {
    try {
      // Get the current Supabase session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session?.user && !error) {
        // Try to find user in our database by Supabase user ID
        const db = await getDb();
        if (db && session.user.email) {
          try {
            // First, try to find by email (Supabase user email)
            // Note: If plan column doesn't exist, we'll handle it gracefully
            let foundUser;
            try {
              const result = await db
                .select()
                .from(users)
                .where(eq(users.email, session.user.email))
                .limit(1);
              foundUser = result[0];
            } catch (error: any) {
              // If plan column doesn't exist, try selecting without it
              if (error?.message?.includes('plan') || error?.code === '42703') {
                console.warn("[Auth] plan column not found, attempting to add it or use default");
                // Try to add plan column if it doesn't exist
                try {
                  await db.execute(`
                    DO $$ BEGIN
                      CREATE TYPE plan AS ENUM ('free', 'light', 'pro');
                    EXCEPTION
                      WHEN duplicate_object THEN null;
                    END $$;
                    
                    ALTER TABLE users 
                    ADD COLUMN IF NOT EXISTS plan plan NOT NULL DEFAULT 'free';
                  `);
                  // Retry the query
                  const result = await db
                    .select()
                    .from(users)
                    .where(eq(users.email, session.user.email))
                    .limit(1);
                  foundUser = result[0];
                } catch (migrationError) {
                  console.error("[Auth] Failed to add plan column:", migrationError);
                  // Use default plan if column still doesn't exist
                  foundUser = null;
                }
              } else {
                throw error;
              }
            }
            
            if (foundUser) {
              // Ensure plan is set to default if missing
              if (!foundUser.plan) {
                foundUser = { ...foundUser, plan: 'free' as const };
              }
              // If user exists, check if we should update profile image from Google
              // This updates the profile image if it's missing and Google provides one
              const provider = session.user.app_metadata?.provider;
              if (provider === 'google' && !foundUser.profileImage) {
                const profileImage = session.user.user_metadata?.avatar_url || 
                                   session.user.user_metadata?.picture || 
                                   null;
                
                if (profileImage) {
                  try {
                    await db.update(users)
                      .set({ profileImage })
                      .where(eq(users.id, foundUser.id));
                    
                    // Update the user object with the new profile image
                    user = { ...foundUser, profileImage };
                  } catch (updateError) {
                    console.error("[Auth] Failed to update profile image:", updateError);
                    // Continue with existing user data
                    user = foundUser;
                  }
                } else {
                  user = foundUser;
                }
              } else {
                user = foundUser;
              }
            } else {
              // If user doesn't exist in our DB, create one automatically
              // This handles OAuth users (Google, etc.) who sign in for the first time
              try {
                const openId = `supabase_${session.user.id}`;
                const name = session.user.user_metadata?.full_name || 
                            session.user.user_metadata?.name || 
                            session.user.email?.split('@')[0] || 
                            'User';
                
                // Get profile image from Google OAuth metadata
                // Google provides 'avatar_url' or 'picture' in user_metadata
                const profileImage = session.user.user_metadata?.avatar_url || 
                                   session.user.user_metadata?.picture || 
                                   null;
                
                // Try to insert with plan, but handle if column doesn't exist
                try {
                  await db.insert(users).values({
                    openId,
                    name,
                    email: session.user.email ?? null,
                    profileImage,
                    loginMethod: session.user.app_metadata?.provider || 'supabase',
                    role: 'user',
                    plan: 'free', // デフォルトプラン
                  });
                } catch (insertError: any) {
                  // If plan column doesn't exist, try to add it first
                  if (insertError?.message?.includes('plan') || insertError?.code === '42703') {
                    console.warn("[Auth] plan column not found, attempting to add it");
                    try {
                      await db.execute(`
                        DO $$ BEGIN
                          CREATE TYPE plan AS ENUM ('free', 'light', 'pro');
                        EXCEPTION
                          WHEN duplicate_object THEN null;
                        END $$;
                        
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS plan plan NOT NULL DEFAULT 'free';
                      `);
                      // Retry insert
                      await db.insert(users).values({
                        openId,
                        name,
                        email: session.user.email ?? null,
                        profileImage,
                        loginMethod: session.user.app_metadata?.provider || 'supabase',
                        role: 'user',
                        plan: 'free',
                      });
                    } catch (migrationError) {
                      console.error("[Auth] Failed to add plan column during user creation:", migrationError);
                      // Insert without plan (if column doesn't exist and we can't add it)
                      // This will fail if plan is required, but we've tried our best
                      throw insertError;
                    }
                  } else {
                    throw insertError;
                  }
                }
                
                // Get the newly created user
                const [newUser] = await db
                  .select()
                  .from(users)
                  .where(eq(users.email, session.user.email ?? ""))
                  .limit(1);
                
                if (newUser) {
                  user = newUser;
                }
              } catch (dbError) {
                console.error("[Auth] Failed to create user in database:", dbError);
                // Continue without user, will be handled by auth router
                user = null;
              }
            }
          } catch (dbError) {
            console.error("[Auth] Database query error:", dbError);
            user = null;
          }
        }
      }
    } catch (error) {
      // Authentication is optional for public procedures.
      console.warn("[Auth] Failed to authenticate:", error);
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    supabase,
  };
}

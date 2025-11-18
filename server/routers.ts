import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getDb } from "./db";
import { users, monitoringHistory } from "../drizzle/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { monitorLandingPage, monitorCreative } from "./monitoring";
import bcrypt from 'bcrypt';

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().email(),
        password: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if Supabase is configured
        if (!ctx.supabase) {
          throw new Error('認証システムが設定されていません。Supabaseの環境変数を確認してください。');
        }

        const database = await getDb();
        if (!database) throw new Error('Database not available');

        // Check if user already exists in our database
        // Note: We'll also rely on Supabase Auth to catch duplicate emails
        try {
          const existing = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
          if (existing.length > 0) {
            throw new Error('このメールアドレスはすでに登録されています');
          }
        } catch (dbError: any) {
          console.error("[Auth] Database query error when checking existing user:", dbError);
          console.error("[Auth] Error details:", {
            message: dbError.message,
            code: dbError.code,
            detail: dbError.detail,
            constraint: dbError.constraint,
          });
          // If it's a duplicate email error, show a user-friendly message
          if (dbError.code === '23505' || dbError.message?.includes('already exists') || dbError.message?.includes('duplicate') || dbError.message?.includes('unique')) {
            throw new Error('このメールアドレスはすでに登録されています');
          }
          // If it's our custom error, re-throw it
          if (dbError.message === 'このメールアドレスはすでに登録されています') {
            throw dbError;
          }
          // For other database errors, show the actual error for debugging
          throw new Error(`データベースエラー: ${dbError.message || '不明なエラーが発生しました'}`);
        }

        try {
          // Register with Supabase Auth
          // Note: emailRedirectTo is only needed if email confirmation is enabled
          // If email confirmation is disabled, signUp will return a session directly
          const { data: authData, error: authError } = await ctx.supabase.auth.signUp({
            email: input.email,
            password: input.password,
            options: {
              data: {
                name: input.name,
              },
              // Only set emailRedirectTo if email confirmation is enabled
              // For now, we'll let Supabase use default behavior
            },
          });

          if (authError) {
            console.error("[Auth] Supabase signUp error:", authError);
            // Check if user already exists in Supabase Auth
            if (authError.message?.includes('already registered') || 
                authError.message?.includes('already exists') ||
                authError.message?.includes('User already registered')) {
              throw new Error('このメールアドレスはすでに登録されています');
            }
            throw new Error(authError.message || '登録に失敗しました');
          }

          if (!authData.user) {
            throw new Error('ユーザーの作成に失敗しました');
          }

          // Create user in our database
          const openId = `supabase_${authData.user.id}`;
          try {
            await database.insert(users).values({
              openId,
              name: input.name,
              email: input.email,
              loginMethod: 'supabase',
              role: 'user',
            });
          } catch (insertError: any) {
            console.error("[Auth] Database insert error:", insertError);
            console.error("[Auth] Insert error details:", {
              message: insertError.message,
              code: insertError.code,
              detail: insertError.detail,
              constraint: insertError.constraint,
            });
            
            // Check if it's a duplicate key error (user already exists)
            if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
              throw new Error('このメールアドレスはすでに登録されています');
            }
            
            // Re-throw with more details
            throw new Error(`ユーザーの作成に失敗しました: ${insertError.message || '不明なエラー'}`);
          }

          // After signup, immediately sign in to create a session
          // This ensures the user is logged in after registration
          if (authData.session) {
            // Session was created immediately (email confirmation disabled)
            // The session cookies are already set by the Supabase client
            const [newUser] = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
            if (!newUser) {
              throw new Error('ユーザー情報の取得に失敗しました');
            }
            return { success: true, user: newUser, session: authData.session };
          } else {
            // Email confirmation is required, sign in after confirmation
            // For now, we'll try to sign in immediately
            const { data: signInData, error: signInError } = await ctx.supabase.auth.signInWithPassword({
              email: input.email,
              password: input.password,
            });

            if (signInError) {
              console.warn("[Auth] Auto sign-in after registration failed:", signInError);
              // Registration succeeded but auto sign-in failed
              // User will need to confirm email or sign in manually
              const [newUser] = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
              if (!newUser) {
                throw new Error('ユーザー情報の取得に失敗しました');
              }
              return { 
                success: true, 
                user: newUser, 
                requiresEmailConfirmation: true 
              };
            }

            // Get the created user
            const [newUser] = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
            if (!newUser) {
              throw new Error('ユーザー情報の取得に失敗しました');
            }
            return { success: true, user: newUser, session: signInData.session };
          }
        } catch (error: any) {
          console.error("[Auth] Registration error:", error);
          throw new Error(error.message || '登録に失敗しました');
        }
      }),
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if Supabase is configured
        if (!ctx.supabase) {
          throw new Error('認証システムが設定されていません。Supabaseの環境変数を確認してください。');
        }

        const database = await getDb();
        if (!database) throw new Error('Database not available');

        try {
          // Login with Supabase Auth
          const { data: authData, error: authError } = await ctx.supabase.auth.signInWithPassword({
            email: input.email,
            password: input.password,
          });

          if (authError) {
            console.error("[Auth] Supabase signIn error:", authError);
            throw new Error(authError.message || 'メールアドレスまたはパスワードが正しくありません');
          }

          if (!authData.user) {
            throw new Error('ログインに失敗しました');
          }

          // Find or create user in our database
          let [user] = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
          
          if (!user) {
            // Create user in our database if doesn't exist
            const openId = `supabase_${authData.user.id}`;
            await database.insert(users).values({
              openId,
              name: authData.user.user_metadata?.name || input.email,
              email: input.email,
              loginMethod: 'supabase',
              role: 'user',
            });
            const result = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
            if (result.length === 0) {
              throw new Error('ユーザー情報の取得に失敗しました');
            }
            user = result[0];
          } else {
            // Update last signed in
            await database.update(users)
              .set({ lastSignedIn: new Date() })
              .where(eq(users.id, user.id));
            const result = await database.select().from(users).where(eq(users.id, user.id)).limit(1);
            if (result.length > 0) {
              user = result[0];
            }
          }

          return { success: true, user };
        } catch (error: any) {
          console.error("[Auth] Login error:", error);
          throw new Error(error.message || 'ログインに失敗しました');
        }
      }),
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        profileImage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const updates: any = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.email !== undefined) updates.email = input.email;
        if (input.profileImage !== undefined) updates.profileImage = input.profileImage;

        if (Object.keys(updates).length > 0) {
          await db.update(users)
            .set(updates)
            .where(eq(users.id, ctx.user.id));
        }

        return { success: true };
      }),
    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        if (!ctx.supabase) {
          throw new Error('認証システムが設定されていません。Supabaseの環境変数を確認してください。');
        }

        // Get current user
        const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
        
        // If user has existing password, verify current password
        if (user.password && input.currentPassword) {
          const isValid = await bcrypt.compare(input.currentPassword, user.password);
          if (!isValid) {
            throw new Error('Current password is incorrect');
          }
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(input.newPassword, 10);

        // Update password in our users table
        await db.update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, ctx.user.id));

        // Also update Supabase Auth password so that email+password login works
        const { error: supabaseError } = await ctx.supabase.auth.updateUser({
          password: input.newPassword,
        });

        if (supabaseError) {
          console.error("[Auth] Supabase updateUser (password) error:", supabaseError);
          throw new Error(supabaseError.message || "Supabase側のパスワード更新に失敗しました");
        }

        return { success: true };
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      // Sign out from Supabase
      await ctx.supabase.auth.signOut();
      
      // Also clear any legacy cookies
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      
      return {
        success: true,
      } as const;
    }),
  }),

  landingPages: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getLandingPagesByUserId(ctx.user.id);
    }),
    
    create: protectedProcedure
      .input(z.object({
        url: z.string().url(),
        title: z.string().min(1, "タイトルは必須です"),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // プランの制限をチェック
        const { PLAN_CONFIG } = await import('./_core/plan');
        const userPlan = (ctx.user.plan as "free" | "light" | "pro" | "admin") || "free";
        const maxLpCount = PLAN_CONFIG[userPlan].maxLpCount;
        
        // 現在のLP数を取得
        const currentLandingPages = await db.getLandingPagesByUserId(ctx.user.id);
        const currentLpCount = currentLandingPages.length;
        
        // プラン制限をチェック
        if (maxLpCount !== null && currentLpCount >= maxLpCount) {
          throw new Error(`${PLAN_CONFIG[userPlan].name}では、最大${maxLpCount}ページまで登録できます。プランをアップグレードしてください。`);
        }
        
        // タイトルが空文字列の場合は「無題」に設定
        const title = input.title.trim() || "無題";
        
        const id = await db.createLandingPage({
          ...input,
          title,
          userId: ctx.user.id,
        });
        
        // 登録後、即座に監視を実行して初期状態を登録
        // 非同期で実行（エラーはログに記録するが、登録処理は成功とする）
        monitorLandingPage(id).catch((error) => {
          console.error(`[LP Create] Failed to run initial monitoring for LP ${id}:`, error);
        });
        
        return { id };
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        url: z.string().url().optional(),
        title: z.string().min(1, "タイトルは必須です").optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updateData } = input;
        const landingPage = await db.getLandingPageById(id);
        if (!landingPage || landingPage.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        
        // タイトルが空文字列や未定義の場合は「無題」に設定
        if (updateData.title !== undefined && (!updateData.title || updateData.title.trim() === "")) {
          updateData.title = "無題";
        }
        
        await db.updateLandingPage(id, updateData);
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const landingPage = await db.getLandingPageById(input.id);
        if (!landingPage || landingPage.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        await db.deleteLandingPage(input.id);
        return { success: true };
      }),
    
    monitor: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const landingPage = await db.getLandingPageById(input.id);
        if (!landingPage || landingPage.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        
        // 監視を実行して完了を待つ（タイムアウト: 2分）
        try {
          const result = await Promise.race([
            monitorLandingPage(landingPage.id),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("監視がタイムアウトしました（2分）")), 120000);
            }),
          ]);
          
          return {
            success: true,
            result: {
              contentChanged: result.contentChanged,
              linkBroken: result.linkBroken,
              message: result.message,
            },
          };
        } catch (error: any) {
          // タイムアウトまたはエラーの場合でも、バックグラウンドで実行を続ける
          console.error(`[LP Monitor] Monitoring error for LP ${landingPage.id}:`, error);
          
          // 非同期で再試行（エラーはログのみ）
          monitorLandingPage(landingPage.id).catch((err) => {
            console.error(`[LP Monitor] Background monitoring failed for LP ${landingPage.id}:`, err);
          });
          
          throw new Error(error.message || "監視の実行中にエラーが発生しました");
        }
      }),
    
    monitorAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        // ユーザーが所有するすべてのLPを取得
        const allLandingPages = await db.getLandingPagesByUserId(ctx.user.id);
        
        if (allLandingPages.length === 0) {
          throw new Error("監視対象のLPがありません");
        }
        
        // すべてのLPをバックグラウンドで監視実行（非同期）
        // 注意: 完了を待たずに即座にレスポンスを返す（クライアント側でポーリング）
        const monitoringPromises = allLandingPages.map((landingPage) => {
          return monitorLandingPage(landingPage.id).catch((error) => {
            console.error(`[LP Monitor All] Failed to monitor LP ${landingPage.id} (${landingPage.url}):`, error);
            return null; // エラーがあっても他のLPの監視は続行
          });
        });
        
        // 非同期で実行開始（完了は待たない）
        Promise.all(monitoringPromises).then((results) => {
          const successCount = results.filter(r => r !== null).length;
          const errorCount = results.filter(r => r === null).length;
          console.log(`[LP Monitor All] Completed monitoring for ${allLandingPages.length} LP(s): ${successCount} success, ${errorCount} errors`);
        }).catch((error) => {
          console.error("[LP Monitor All] Error in batch monitoring:", error);
        });
        
        return {
          success: true,
          message: `${allLandingPages.length}件のLPの監視を開始しました`,
          count: allLandingPages.length,
        };
      }),
  }),
  
  tags: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // LP用・クリエイティブ用すべてを返す（フロント側で種別ごとにフィルタ）
      return await db.getTagsByUserId(ctx.user.id);
    }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        // "lp" | "creative" のどちら向けタグか（未指定は LP 用）
        targetType: z.enum(["lp", "creative"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { targetType = "lp", ...rest } = input;
        const id = await db.createTag({
          ...rest,
          targetType,
          userId: ctx.user.id,
        });
        return { id };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteTag(input.id);
        return { success: true };
      }),
    
    addToLandingPage: protectedProcedure
      .input(z.object({ landingPageId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        await db.addTagToLandingPage(input.landingPageId, input.tagId);
        return { success: true };
      }),
    
    removeFromLandingPage: protectedProcedure
      .input(z.object({ landingPageId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        await db.removeTagFromLandingPage(input.landingPageId, input.tagId);
        return { success: true };
      }),
    
    getForLandingPage: protectedProcedure
      .input(z.object({ landingPageId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTagsForLandingPage(input.landingPageId);
      }),

    // クリエイティブ用タグ取得
    getForCreative: protectedProcedure
      .input(z.object({ creativeId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTagsForCreative(input.creativeId);
      }),

    // 現ユーザーの全クリエイティブに紐づくタグ一覧（フィルタ用）
    getForUserCreatives: protectedProcedure.query(async ({ ctx }) => {
      return await db.getCreativeTagsByUserId(ctx.user.id);
    }),

    // 現ユーザーの全LPに紐づくタグ一覧（フィルタ用）
    getForUserLandingPages: protectedProcedure.query(async ({ ctx }) => {
      return await db.getLandingPageTagsByUserId(ctx.user.id);
    }),

    // クリエイティブにタグを付与
    addToCreative: protectedProcedure
      .input(z.object({ creativeId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        await db.addTagToCreative(input.creativeId, input.tagId);
        return { success: true };
      }),

    // クリエイティブからタグを削除
    removeFromCreative: protectedProcedure
      .input(z.object({ creativeId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        await db.removeTagFromCreative(input.creativeId, input.tagId);
        return { success: true };
      }),
  }),
  
  analytics: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const landingPages = await db.getLandingPagesByUserId(ctx.user.id);
      const allHistory = await Promise.all(
        landingPages.map(landingPage => db.getMonitoringHistoryByLandingPageId(landingPage.id))
      );
      const flatHistory = allHistory.flat();
      
      return {
        totalLPs: landingPages.length,
        totalChecks: flatHistory.length,
        changesDetected: flatHistory.filter(h => h.status === 'changed').length,
        errorsCount: flatHistory.filter(h => h.status === 'error').length,
      };
    }),
    
    changeFrequency: protectedProcedure.query(async ({ ctx }) => {
      const landingPages = await db.getLandingPagesByUserId(ctx.user.id);
      const result = await Promise.all(
        landingPages.map(async (landingPage) => {
          const history = await db.getMonitoringHistoryByLandingPageId(landingPage.id);
          const changes = history.filter((h) => h.status === "changed");
          const errors = history.filter((h) => h.status === "error");
          const lastChange = changes.reduce<Date | null>((latest, entry) => {
            if (!latest || entry.createdAt > latest) {
              return entry.createdAt;
            }
            return latest;
          }, null);

          const lastChangeOrCreated = lastChange ?? landingPage.createdAt;

          const checks = history.length;
          const errorRate =
            checks > 0 ? (errors.length / checks) * 100 : 0;

          return {
            id: landingPage.id,
            name: landingPage.title || landingPage.url.substring(0, 30) + "...",
            url: landingPage.url,
            changes: changes.length,
            checks,
            errors: errors.length,
            errorRate,
            lastChangeAt: lastChangeOrCreated
              ? lastChangeOrCreated.toISOString()
              : null,
          };
        })
      );
      return result.filter((r) => r.checks > 0);
    }),
    
    changeTrend: protectedProcedure
      .input(z.object({ landingPageId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        let history;
        if (input.landingPageId) {
          const landingPage = await db.getLandingPageById(input.landingPageId);
          if (!landingPage || landingPage.userId !== ctx.user.id) {
            throw new Error("Not found or unauthorized");
          }
          history = await db.getMonitoringHistoryByLandingPageId(input.landingPageId);
        } else {
          const landingPages = await db.getLandingPagesByUserId(ctx.user.id);
          const allHistory = await Promise.all(
            landingPages.map((landingPage) => db.getMonitoringHistoryByLandingPageId(landingPage.id))
          );
          history = allHistory.flat();
        }

        // Group by date
        const grouped = history.reduce((acc, h) => {
          const date = h.createdAt.toISOString().split("T")[0];
          if (!acc[date]) {
            acc[date] = { date, changes: 0, checks: 0, errors: 0 };
          }
          acc[date].checks++;
          if (h.status === "changed") {
            acc[date].changes++;
          }
          if (h.status === "error") {
            acc[date].errors++;
          }
          return acc;
        }, {} as Record<string, { date: string; changes: number; checks: number; errors: number }>);

        return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
      }),

    // クリエイティブ別集計（LPと同じ形で返す）
    creativeChangeFrequency: protectedProcedure.query(async ({ ctx }) => {
      const creatives = await db.getCreativesByUserId(ctx.user.id);
      const result = await Promise.all(
        creatives.map(async (creative) => {
          const history = await db.getMonitoringHistoryByCreativeId(
            creative.id
          );
          const changes = history.filter((h) => h.status === "changed");
          const errors = history.filter((h) => h.status === "error");
          const lastChange = changes.reduce<Date | null>((latest, entry) => {
            if (!latest || entry.createdAt > latest) {
              return entry.createdAt;
            }
            return latest;
          }, null);

          const lastChangeOrCreated = lastChange ?? creative.createdAt;

          const checks = history.length;
          const errorRate = checks > 0 ? (errors.length / checks) * 100 : 0;

          return {
            id: creative.id,
            name: creative.title,
            // フロントのテーブル互換用にURL相当（画像URLを優先）
            url: creative.imageUrl || creative.targetUrl || "",
            changes: changes.length,
            checks,
            errors: errors.length,
            errorRate,
            lastChangeAt: lastChangeOrCreated
              ? lastChangeOrCreated.toISOString()
              : null,
          };
        })
      );

      return result.filter((r) => r.checks > 0);
    }),

    // クリエイティブの変更トレンド
    creativeChangeTrend: protectedProcedure
      .input(z.object({ creativeId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        let history;
        if (input.creativeId) {
          const creative = await db.getCreativeById(input.creativeId);
          if (!creative || creative.userId !== ctx.user.id) {
            throw new Error("Not found or unauthorized");
          }
          history = await db.getMonitoringHistoryByCreativeId(input.creativeId);
        } else {
          const creatives = await db.getCreativesByUserId(ctx.user.id);
          const allHistory = await Promise.all(
            creatives.map((c) => db.getMonitoringHistoryByCreativeId(c.id))
          );
          history = allHistory.flat();
        }

        const grouped = history.reduce((acc, h) => {
          const date = h.createdAt.toISOString().split("T")[0];
          if (!acc[date]) {
            acc[date] = { date, changes: 0, checks: 0, errors: 0 };
          }
          acc[date].checks++;
          if (h.status === "changed") {
            acc[date].changes++;
          }
          if (h.status === "error") {
            acc[date].errors++;
          }
          return acc;
        }, {} as Record<string, { date: string; changes: number; checks: number; errors: number }>);

        return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
      }),
  }),
  
  notifications: router({
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getNotificationSettings(ctx.user.id);
      return settings || null;
    }),
    
    updateSettings: protectedProcedure
      .input(z.object({
        emailEnabled: z.boolean().optional(),
        emailAddress: z.string().optional(),
        slackEnabled: z.boolean().optional(),
        slackWebhookUrl: z.string().optional(),
        discordEnabled: z.boolean().optional(),
        discordWebhookUrl: z.string().optional(),
        chatworkEnabled: z.boolean().optional(),
        chatworkApiToken: z.string().optional(),
        chatworkRoomId: z.string().optional(),
        notifyOnChange: z.boolean().optional(),
        notifyOnError: z.boolean().optional(),
        notifyOnBrokenLink: z.boolean().optional(),
        ignoreFirstViewOnly: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Drizzleのbooleanカラムにそのままbooleanを渡す
        const dbInput: any = {};
        if (input.emailEnabled !== undefined) dbInput.emailEnabled = input.emailEnabled;
        if (input.emailAddress !== undefined) dbInput.emailAddress = input.emailAddress;
        if (input.slackEnabled !== undefined) dbInput.slackEnabled = input.slackEnabled;
        if (input.slackWebhookUrl !== undefined) dbInput.slackWebhookUrl = input.slackWebhookUrl;
        if (input.discordEnabled !== undefined) dbInput.discordEnabled = input.discordEnabled;
        if (input.discordWebhookUrl !== undefined) dbInput.discordWebhookUrl = input.discordWebhookUrl;
        if (input.chatworkEnabled !== undefined) dbInput.chatworkEnabled = input.chatworkEnabled;
        if (input.chatworkApiToken !== undefined) dbInput.chatworkApiToken = input.chatworkApiToken;
        if (input.chatworkRoomId !== undefined) dbInput.chatworkRoomId = input.chatworkRoomId;
        if (input.notifyOnChange !== undefined) dbInput.notifyOnChange = input.notifyOnChange;
        if (input.notifyOnError !== undefined) dbInput.notifyOnError = input.notifyOnError;
        if (input.notifyOnBrokenLink !== undefined) dbInput.notifyOnBrokenLink = input.notifyOnBrokenLink;
        if (input.ignoreFirstViewOnly !== undefined) dbInput.ignoreFirstViewOnly = input.ignoreFirstViewOnly;
        
        await db.upsertNotificationSettings(ctx.user.id, dbInput);
        return { success: true };
      }),
    
    testNotification: protectedProcedure
      .input(z.object({ channel: z.enum(['email', 'slack', 'discord', 'chatwork']) }))
      .mutation(async ({ ctx, input }) => {
        const settings = await db.getNotificationSettings(ctx.user.id);
        if (!settings) {
          throw new Error('通知設定が見つかりません');
        }
        
        const { sendEmailNotification, sendSlackNotification, sendDiscordNotification, sendChatworkNotification } = await import('./notification');
        
        const testPayload = {
          title: 'テスト通知',
          message: 'これはテスト通知です。設定が正しく機能しています。',
          lpTitle: 'テストLP',
          lpUrl: 'https://example.com',
          changeType: 'テスト',
        };
        
        let result = false;
        
        switch (input.channel) {
          case 'email':
            if (settings.emailEnabled && settings.emailAddress) {
              result = await sendEmailNotification(settings.emailAddress, testPayload);
            }
            break;
          case 'slack':
            if (settings.slackEnabled && settings.slackWebhookUrl) {
              result = await sendSlackNotification(settings.slackWebhookUrl, testPayload);
            }
            break;
          case 'discord':
            if (settings.discordEnabled && settings.discordWebhookUrl) {
              result = await sendDiscordNotification(settings.discordWebhookUrl, testPayload);
            }
            break;
          case 'chatwork':
            if (settings.chatworkEnabled && settings.chatworkApiToken && settings.chatworkRoomId) {
              result = await sendChatworkNotification(settings.chatworkApiToken, settings.chatworkRoomId, testPayload);
            }
            break;
        }

        return { success: result };
      }),
  }),
  
  creatives: router({
    // 一覧
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getCreativesByUserId(ctx.user.id);
    }),

    // 追加
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1, "タイトルは必須です"),
          imageUrl: z.string().url("画像URLの形式が正しくありません"),
          landingPageId: z.number().optional(),
          targetUrl: z.string().url().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // プランの制限をチェック
        const { PLAN_CONFIG } = await import('./_core/plan');
        const userPlan = (ctx.user.plan as "free" | "light" | "pro" | "admin") || "free";
        const maxCreativeCount = PLAN_CONFIG[userPlan].maxCreativeCount;
        
        // 現在のクリエイティブ数を取得
        const currentCreatives = await db.getCreativesByUserId(ctx.user.id);
        const currentCreativeCount = currentCreatives.length;
        
        // プラン制限をチェック
        if (maxCreativeCount !== null && currentCreativeCount >= maxCreativeCount) {
          throw new Error(`${PLAN_CONFIG[userPlan].name}では、最大${maxCreativeCount}件まで登録できます。プランをアップグレードしてください。`);
        }
        
        const id = await db.createCreative({
          userId: ctx.user.id,
          title: input.title,
          imageUrl: input.imageUrl,
          landingPageId: input.landingPageId ?? null,
          targetUrl: input.targetUrl ?? null,
          description: input.description ?? null,
        });

        // LPと同様に、登録直後に基準画像を取得しておく（非同期・通知なし）
        monitorCreative(id).catch((error) => {
          console.error(
            `[Creative Create] Failed to run initial monitoring for creative ${id}:`,
            error
          );
        });

        return { id };
      }),

    // 更新
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().min(1),
          imageUrl: z.string().url(),
          landingPageId: z.number().optional().nullable(),
          targetUrl: z.string().url().optional().nullable(),
          description: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const creative = await db.getCreativeById(input.id);
        if (!creative || creative.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }

        await db.updateCreative(input.id, {
          title: input.title,
          imageUrl: input.imageUrl,
          landingPageId: input.landingPageId ?? null,
          targetUrl: input.targetUrl ?? null,
          description: input.description ?? null,
        });

        return { success: true };
      }),

    // 削除
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const creative = await db.getCreativeById(input.id);
        if (!creative || creative.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }

        await db.deleteCreative(input.id);
        // 監視履歴はとりあえず残す（必要ならここで creativeId の履歴を消す）

        return { success: true };
      }),

    // 監視履歴（/history/creative/:id 用）
    history: protectedProcedure
      .input(z.object({ creativeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const creative = await db.getCreativeById(input.creativeId);
        if (!creative || creative.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        return await db.getMonitoringHistoryByCreativeId(input.creativeId, 100);
      }),

    // 単発監視
    monitor: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const creative = await db.getCreativeById(input.id);
        if (!creative || creative.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }

        const result = await monitorCreative(input.id);

        return { success: true, result };
      }),

    // 全クリエイティブの監視を一括実行
    monitorAll: protectedProcedure.mutation(async ({ ctx }) => {
      const creatives = await db.getCreativesByUserId(ctx.user.id);

      if (creatives.length === 0) {
        throw new Error("監視対象のクリエイティブがありません");
      }

      const monitoringPromises = creatives.map((c) =>
        monitorCreative(c.id).catch((error) => {
          console.error(
            `[Creative Monitor All] Failed to monitor creative ${c.id}:`,
            error
          );
          return null;
        })
      );

      // 完了は待つが、エラーがあっても全体は継続
      await Promise.all(monitoringPromises);

      return {
        success: true,
        message: `${creatives.length}件のクリエイティブの監視を実行しました`,
        count: creatives.length,
      };
    }),
  }),
  
  monitoring: router({
    recent: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const limit = input.limit || 10;
        // ユーザーが所有するLPのIDを取得
        const userLandingPages = await db.getLandingPagesByUserId(ctx.user.id);
        const userLandingPageIds = userLandingPages.map((landingPage) => landingPage.id);
        
        if (userLandingPageIds.length === 0) {
          return [];
        }
        
        // ユーザーが所有するLPの監視履歴のみを取得
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        
        return await dbInstance
          .select()
          .from(monitoringHistory)
          .where(inArray(monitoringHistory.landingPageId, userLandingPageIds))
          .orderBy(desc(monitoringHistory.createdAt))
          .limit(limit);
      }),

    // クリエイティブ用の最近の監視履歴
    creativeRecent: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const limit = input.limit || 10;
        const userCreatives = await db.getCreativesByUserId(ctx.user.id);
        const creativeIds = userCreatives.map((c) => c.id);

        if (creativeIds.length === 0) {
          return [];
        }

        const dbInstance = await getDb();
        if (!dbInstance) return [];

        return await dbInstance
          .select()
          .from(monitoringHistory)
          .where(inArray(monitoringHistory.creativeId, creativeIds))
          .orderBy(desc(monitoringHistory.createdAt))
          .limit(limit);
      }),
    
    history: protectedProcedure
      .input(z.object({ landingPageId: z.number() }))
      .query(async ({ input }) => {
        return await db.getMonitoringHistoryByLandingPageId(input.landingPageId);
      }),
    
    check: protectedProcedure
      .input(z.object({ landingPageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const landingPage = await db.getLandingPageById(input.landingPageId);
        if (!landingPage || landingPage.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        
        const result = await monitorLandingPage(input.landingPageId);
        return result;
      }),
  }),
  
  schedules: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // 現在のユーザーのスケジュール設定を返す（配列形式で返す互換性のため）
      const schedule = await db.getScheduleSettingsByUserId(ctx.user.id);
      return schedule ? [schedule] : [];
    }),
    
    get: protectedProcedure
      .query(async ({ ctx }) => {
        const schedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) return null;
        
        // プランに応じた最小監視間隔と最大監視LP数をチェック
        const { getMinIntervalDays, PLAN_CONFIG } = await import('./_core/plan');
        const userPlan = (ctx.user.plan as "free" | "light" | "pro" | "admin") || "free";
        const minIntervalDays = getMinIntervalDays(userPlan);
        const maxLpCount = PLAN_CONFIG[userPlan].maxLpCount;
        
        let updatedSchedule = schedule;
        let scheduleChanged = false;

        // 1) 現在の間隔が最小間隔より小さい場合は自動調整
        if (updatedSchedule.intervalDays < minIntervalDays) {
          const excludedIdsJson = updatedSchedule.excludedLandingPageIds;
          
          const id = await db.upsertScheduleSettings(ctx.user.id, {
            intervalDays: minIntervalDays,
            enabled: updatedSchedule.enabled,
            excludedLandingPageIds: excludedIdsJson,
          });
          
          const { startSchedule } = await import('./scheduler');
          await startSchedule(id);
          
          const reloaded = await db.getScheduleSettingsByUserId(ctx.user.id);
          updatedSchedule = reloaded || updatedSchedule;
          scheduleChanged = true;
        }

        // 2) プランごとの最大監視LP数を超えている場合は、自動的に監視対象を絞る
        if (maxLpCount !== null) {
          const userLandingPages = await db.getLandingPagesByUserId(ctx.user.id);
          const allLandingPageIds = userLandingPages.map((landingPage) => landingPage.id);

          // 現在の除外LPをセット化
          const excludedIdsJson = updatedSchedule.excludedLandingPageIds;
          const excludedIds = excludedIdsJson ? (JSON.parse(excludedIdsJson) as number[]) : [];
          const excludedSet = new Set<number>(excludedIds);

          // 現在監視対象になっているLP（除外されていないもの）
          const monitoredIds = allLandingPageIds.filter((id) => !excludedSet.has(id));

          if (monitoredIds.length > maxLpCount) {
            // 監視対象が多すぎる場合は、古い順（ID昇順）で最大数だけ残し、残りを除外に追加
            const sortedMonitored = [...monitoredIds].sort((a, b) => a - b);
            const allowedIds = new Set(sortedMonitored.slice(0, maxLpCount));
            const forceExcludedIds = sortedMonitored.filter((id) => !allowedIds.has(id));

            const nextExcludedSet = new Set<number>(excludedSet);
            forceExcludedIds.forEach((id) => nextExcludedSet.add(id));

            const nextExcludedIdsJson =
              nextExcludedSet.size > 0 ? JSON.stringify(Array.from(nextExcludedSet)) : null;

            const id = await db.upsertScheduleSettings(ctx.user.id, {
              excludedLandingPageIds: nextExcludedIdsJson,
            });

            const { startSchedule } = await import('./scheduler');
            await startSchedule(id);

            const reloaded = await db.getScheduleSettingsByUserId(ctx.user.id);
            updatedSchedule = reloaded || updatedSchedule;
            scheduleChanged = true;
          }
        }
        
        return updatedSchedule;
      }),
    
    upsert: protectedProcedure
      .input(z.object({
        intervalDays: z.number().min(1, "監視間隔は1日以上である必要があります"),
        executeHour: z.number().min(0).max(23).optional(),
        enabled: z.boolean().optional(),
        excludedLandingPageIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // プランのバリデーションと自動調整
        const { validateIntervalDays, getMinIntervalDays } = await import('./_core/plan');
        // planが存在しない場合はデフォルトで'free'を使用
        const userPlan = (ctx.user.plan as "free" | "light" | "pro" | "admin") || "free";
        const minIntervalDays = getMinIntervalDays(userPlan);
        
        // 指定された間隔が最小間隔より小さい場合は自動調整
        let adjustedIntervalDays = input.intervalDays;
        if (adjustedIntervalDays < minIntervalDays) {
          adjustedIntervalDays = minIntervalDays;
        }
        
        const validation = validateIntervalDays(userPlan, adjustedIntervalDays);
        
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        
        // 除外LPのIDリストをJSON文字列に変換
        const excludedIdsJson = input.excludedLandingPageIds 
          ? JSON.stringify(input.excludedLandingPageIds)
          : null;
        
        const { enabled } = input;
        const isEnabled = enabled !== undefined ? enabled : true; // デフォルトは有効
        
        // 次回実行予定日時を計算（新規作成時または次回実行予定がない場合、または間隔/実行時間が変更された場合）
        const existingSchedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        let nextRunAt: Date | undefined = undefined;
        
        const now = new Date();
        const newExecuteHour = input.executeHour ?? existingSchedule?.executeHour ?? 9;
        const shouldUpdateNextRunAt = !existingSchedule || 
                                       !existingSchedule.nextRunAt || 
                                       existingSchedule.intervalDays !== adjustedIntervalDays ||
                                       (existingSchedule?.executeHour ?? 9) !== newExecuteHour;
        
        if (shouldUpdateNextRunAt) {
          nextRunAt = new Date(now);
          
          // 最終実行日を確認
          const lastRunAt = existingSchedule?.lastRunAt ? new Date(existingSchedule.lastRunAt) : null;
          
          const executeHour = newExecuteHour;
          
          if (!lastRunAt) {
            // 一度も実行されていない場合
            nextRunAt.setHours(executeHour, 0, 0, 0);
            // 実行時刻が既に過ぎている場合は明日に設定
            if (nextRunAt.getTime() <= now.getTime()) {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
            }
            // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
          } else {
            // 最終実行日から監視間隔を計算
            const daysSinceLastRun = Math.floor((now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastRun >= adjustedIntervalDays) {
              // 監視間隔以上経過している場合は、次回実行を詰める
              nextRunAt.setHours(executeHour, 0, 0, 0);
              // 実行時刻が既に過ぎている場合は明日に設定
              if (nextRunAt.getTime() <= now.getTime()) {
                nextRunAt.setDate(nextRunAt.getDate() + 1);
              }
              // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
            } else {
              // まだ間隔が経過していない場合は、最終実行日 + 間隔日数後の指定時刻に設定
              nextRunAt = new Date(lastRunAt);
              nextRunAt.setDate(nextRunAt.getDate() + adjustedIntervalDays);
              nextRunAt.setHours(executeHour, 0, 0, 0);
            }
          }
        }
        
        const id = await db.upsertScheduleSettings(ctx.user.id, {
          intervalDays: adjustedIntervalDays,
          executeHour: input.executeHour ?? existingSchedule?.executeHour ?? 9,
          enabled: isEnabled,
          excludedLandingPageIds: excludedIdsJson,
          ...(nextRunAt && { nextRunAt }), // nextRunAtが計算された場合のみ設定
        });
        
        // Import scheduler dynamically to avoid circular dependency
        const { startSchedule } = await import('./scheduler');
        // 有効な場合はスケジュールを開始（既存のスケジュールも再起動）
        if (isEnabled) {
          await startSchedule(id);
        }
        
        // 更新後のスケジュールを取得して返す
        const updatedSchedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        
        return { 
          success: true, 
          id, 
          adjustedIntervalDays: adjustedIntervalDays !== input.intervalDays ? adjustedIntervalDays : undefined,
          schedule: updatedSchedule,
        };
      }),
    
    delete: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        if (schedule) {
          const { stopSchedule } = await import('./scheduler');
          stopSchedule(schedule.id);
        }
        
        await db.deleteScheduleSettings(ctx.user.id);
        return { success: true };
      }),
    
    start: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) {
          throw new Error("スケジュール設定が見つかりません");
        }
        
        // 次回実行予定日時を設定（まだ設定されていない場合）
        let nextRunAt: Date | undefined = undefined;
        if (!schedule.nextRunAt) {
          const now = new Date();
          
          // 最終実行日を確認
          const lastRunAt = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
          
          const executeHour = schedule.executeHour ?? 9;
          
          if (!lastRunAt) {
            // 一度も実行されていない場合
            nextRunAt = new Date(now);
            nextRunAt.setHours(executeHour, 0, 0, 0);
            // 実行時刻が既に過ぎている場合は明日に設定
            if (nextRunAt.getTime() <= now.getTime()) {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
            }
            // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
          } else {
            // 最終実行日から監視間隔を計算
            const daysSinceLastRun = Math.floor((now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastRun >= schedule.intervalDays) {
              // 監視間隔以上経過している場合は、次回実行を詰める
              nextRunAt = new Date(now);
              nextRunAt.setHours(executeHour, 0, 0, 0);
              // 実行時刻が既に過ぎている場合は明日に設定
              if (nextRunAt.getTime() <= now.getTime()) {
                nextRunAt.setDate(nextRunAt.getDate() + 1);
              }
              // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
            } else {
              // まだ間隔が経過していない場合は、最終実行日 + 間隔日数後の指定時刻に設定
              nextRunAt = new Date(lastRunAt);
              nextRunAt.setDate(nextRunAt.getDate() + schedule.intervalDays);
              nextRunAt.setHours(executeHour, 0, 0, 0);
            }
          }
        }
        
        // データベースのenabledフィールドをtrueに更新
        const id = await db.upsertScheduleSettings(ctx.user.id, {
          enabled: true,
          ...(nextRunAt && { nextRunAt }), // nextRunAtが計算された場合のみ設定
        });
        
        const { startSchedule } = await import('./scheduler');
        // 更新後のIDを使用してスケジュールを開始
        await startSchedule(id);
        return { success: true };
      }),
    
    stop: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) {
          throw new Error("スケジュール設定が見つかりません");
        }
        
        // データベースのenabledフィールドをfalseに更新
        await db.upsertScheduleSettings(ctx.user.id, {
          enabled: false,
        });
        
        const { stopSchedule } = await import('./scheduler');
        stopSchedule(schedule.id);
        return { success: true };
      }),
    
    // 検証用リセット（前回実行日を削除し、次回実行予定を設定）
    reset: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) {
          throw new Error("スケジュール設定が見つかりません");
        }
        
        const dbInstance = await getDb();
        if (!dbInstance) {
          throw new Error("データベースに接続できません");
        }
        
        const { scheduleSettings } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        
        // 次回実行予定を2025/11/8 18:00に設定
        const nextRunAt = new Date('2025-11-08T18:00:00');
        
        await dbInstance.update(scheduleSettings)
          .set({ 
            lastRunAt: null,
            nextRunAt
          })
          .where(eq(scheduleSettings.id, schedule.id));
        
        // スケジューラーを再起動して新しいnextRunAtを反映
        const { startSchedule } = await import('./scheduler');
        await startSchedule(schedule.id);
        
        return { 
          success: true, 
          message: "スケジュールをリセットしました",
          nextRunAt: nextRunAt.toISOString()
        };
      }),
  }),

  creativeSchedules: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // 現在のユーザーのクリエイティブスケジュール設定を返す（配列形式で返す互換性のため）
      const schedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
      return schedule ? [schedule] : [];
    }),
    
    get: protectedProcedure
      .query(async ({ ctx }) => {
        const schedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) return null;
        
        // プランに応じた最小監視間隔と最大監視クリエイティブ数をチェック
        const { getMinIntervalDays, PLAN_CONFIG } = await import('./_core/plan');
        const userPlan = (ctx.user.plan as "free" | "light" | "pro" | "admin") || "free";
        const minIntervalDays = getMinIntervalDays(userPlan);
        const maxCreativeCount = PLAN_CONFIG[userPlan].maxCreativeCount;
        
        let updatedSchedule = schedule;
        let scheduleChanged = false;

        // 1) 現在の間隔が最小間隔より小さい場合は自動調整
        if (updatedSchedule.intervalDays < minIntervalDays) {
          const excludedIdsJson = updatedSchedule.excludedCreativeIds;
          
          const id = await db.upsertCreativeScheduleSettings(ctx.user.id, {
            intervalDays: minIntervalDays,
            enabled: updatedSchedule.enabled,
            excludedCreativeIds: excludedIdsJson,
          });
          
          const { startCreativeSchedule } = await import('./scheduler');
          await startCreativeSchedule(id);
          
          const reloaded = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
          updatedSchedule = reloaded || updatedSchedule;
          scheduleChanged = true;
        }

        // 2) プランごとの最大監視クリエイティブ数を超えている場合は、自動的に監視対象を絞る
        if (maxCreativeCount !== null) {
          const userCreatives = await db.getCreativesByUserId(ctx.user.id);
          const allCreativeIds = userCreatives.map((creative) => creative.id);

          // 現在の除外クリエイティブをセット化
          const excludedIdsJson = updatedSchedule.excludedCreativeIds;
          const excludedIds = excludedIdsJson ? (JSON.parse(excludedIdsJson) as number[]) : [];
          const excludedSet = new Set<number>(excludedIds);

          // 現在監視対象になっているクリエイティブ（除外されていないもの）
          const monitoredIds = allCreativeIds.filter((id) => !excludedSet.has(id));

          if (monitoredIds.length > maxCreativeCount) {
            // 監視対象が多すぎる場合は、古い順（ID昇順）で最大数だけ残し、残りを除外に追加
            const sortedMonitored = [...monitoredIds].sort((a, b) => a - b);
            const allowedIds = new Set(sortedMonitored.slice(0, maxCreativeCount));
            const forceExcludedIds = sortedMonitored.filter((id) => !allowedIds.has(id));

            const nextExcludedSet = new Set<number>(excludedSet);
            forceExcludedIds.forEach((id) => nextExcludedSet.add(id));

            const nextExcludedIdsJson =
              nextExcludedSet.size > 0 ? JSON.stringify(Array.from(nextExcludedSet)) : null;

            const id = await db.upsertCreativeScheduleSettings(ctx.user.id, {
              excludedCreativeIds: nextExcludedIdsJson,
            });

            const { startCreativeSchedule } = await import('./scheduler');
            await startCreativeSchedule(id);

            const reloaded = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
            updatedSchedule = reloaded || updatedSchedule;
            scheduleChanged = true;
          }
        }
        
        return updatedSchedule;
      }),
    
    upsert: protectedProcedure
      .input(z.object({
        intervalDays: z.number().min(1, "監視間隔は1日以上である必要があります"),
        executeHour: z.number().min(0).max(23).optional(),
        enabled: z.boolean().optional(),
        excludedCreativeIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // プランのバリデーションと自動調整
        const { validateIntervalDays, getMinIntervalDays } = await import('./_core/plan');
        // planが存在しない場合はデフォルトで'free'を使用
        const userPlan = (ctx.user.plan as "free" | "light" | "pro" | "admin") || "free";
        const minIntervalDays = getMinIntervalDays(userPlan);
        
        // 指定された間隔が最小間隔より小さい場合は自動調整
        let adjustedIntervalDays = input.intervalDays;
        if (adjustedIntervalDays < minIntervalDays) {
          adjustedIntervalDays = minIntervalDays;
        }
        
        const validation = validateIntervalDays(userPlan, adjustedIntervalDays);
        
        if (!validation.valid) {
          throw new Error(validation.error);
        }
        
        // 除外クリエイティブのIDリストをJSON文字列に変換
        const excludedIdsJson = input.excludedCreativeIds 
          ? JSON.stringify(input.excludedCreativeIds)
          : null;
        
        const { enabled } = input;
        const isEnabled = enabled !== undefined ? enabled : true; // デフォルトは有効
        
        // 次回実行予定日時を計算（新規作成時または次回実行予定がない場合、または間隔/実行時間が変更された場合）
        const existingSchedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        let nextRunAt: Date | undefined = undefined;
        
        const now = new Date();
        const newExecuteHour = input.executeHour ?? existingSchedule?.executeHour ?? 9;
        const shouldUpdateNextRunAt = !existingSchedule || 
                                       !existingSchedule.nextRunAt || 
                                       existingSchedule.intervalDays !== adjustedIntervalDays ||
                                       (existingSchedule?.executeHour ?? 9) !== newExecuteHour;
        
        if (shouldUpdateNextRunAt) {
          nextRunAt = new Date(now);
          
          // 最終実行日を確認
          const lastRunAt = existingSchedule?.lastRunAt ? new Date(existingSchedule.lastRunAt) : null;
          
          const executeHour = newExecuteHour;
          
          if (!lastRunAt) {
            // 一度も実行されていない場合
            nextRunAt.setHours(executeHour, 0, 0, 0);
            // 実行時刻が既に過ぎている場合は明日に設定
            if (nextRunAt.getTime() <= now.getTime()) {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
            }
            // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
          } else {
            // 最終実行日から監視間隔を計算
            const daysSinceLastRun = Math.floor((now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastRun >= adjustedIntervalDays) {
              // 監視間隔以上経過している場合は、次回実行を詰める
              nextRunAt.setHours(executeHour, 0, 0, 0);
              // 実行時刻が既に過ぎている場合は明日に設定
              if (nextRunAt.getTime() <= now.getTime()) {
                nextRunAt.setDate(nextRunAt.getDate() + 1);
              }
              // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
            } else {
              // まだ間隔が経過していない場合は、最終実行日 + 間隔日数後の指定時刻に設定
              nextRunAt = new Date(lastRunAt);
              nextRunAt.setDate(nextRunAt.getDate() + adjustedIntervalDays);
              nextRunAt.setHours(executeHour, 0, 0, 0);
            }
          }
        }
        
        const id = await db.upsertCreativeScheduleSettings(ctx.user.id, {
          intervalDays: adjustedIntervalDays,
          executeHour: input.executeHour ?? existingSchedule?.executeHour ?? 9,
          enabled: isEnabled,
          excludedCreativeIds: excludedIdsJson,
          ...(nextRunAt && { nextRunAt }), // nextRunAtが計算された場合のみ設定
        });
        
        // Import scheduler dynamically to avoid circular dependency
        const { startCreativeSchedule } = await import('./scheduler');
        // 有効な場合はスケジュールを開始（既存のスケジュールも再起動）
        if (isEnabled) {
          await startCreativeSchedule(id);
        }
        
        // 更新後のスケジュールを取得して返す
        const updatedSchedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        
        return { 
          success: true, 
          id, 
          adjustedIntervalDays: adjustedIntervalDays !== input.intervalDays ? adjustedIntervalDays : undefined,
          schedule: updatedSchedule,
        };
      }),
    
    delete: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        if (schedule) {
          const { stopCreativeSchedule } = await import('./scheduler');
          stopCreativeSchedule(schedule.id);
        }
        
        await db.deleteCreativeScheduleSettings(ctx.user.id);
        return { success: true };
      }),
    
    start: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) {
          throw new Error("スケジュール設定が見つかりません");
        }
        
        // 次回実行予定日時を設定（まだ設定されていない場合）
        let nextRunAt: Date | undefined = undefined;
        if (!schedule.nextRunAt) {
          const now = new Date();
          
          // 最終実行日を確認
          const lastRunAt = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
          
          const executeHour = schedule.executeHour ?? 9;
          
          if (!lastRunAt) {
            // 一度も実行されていない場合
            nextRunAt = new Date(now);
            nextRunAt.setHours(executeHour, 0, 0, 0);
            // 実行時刻が既に過ぎている場合は明日に設定
            if (nextRunAt.getTime() <= now.getTime()) {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
            }
            // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
          } else {
            // 最終実行日から監視間隔を計算
            const daysSinceLastRun = Math.floor((now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysSinceLastRun >= schedule.intervalDays) {
              // 監視間隔以上経過している場合は、次回実行を詰める
              nextRunAt = new Date(now);
              nextRunAt.setHours(executeHour, 0, 0, 0);
              // 実行時刻が既に過ぎている場合は明日に設定
              if (nextRunAt.getTime() <= now.getTime()) {
                nextRunAt.setDate(nextRunAt.getDate() + 1);
              }
              // 実行時刻が今日の時刻より後で、まだ過ぎていない場合は当日のまま
            } else {
              // まだ間隔が経過していない場合は、最終実行日 + 間隔日数後の指定時刻に設定
              nextRunAt = new Date(lastRunAt);
              nextRunAt.setDate(nextRunAt.getDate() + schedule.intervalDays);
              nextRunAt.setHours(executeHour, 0, 0, 0);
            }
          }
        }
        
        // データベースのenabledフィールドをtrueに更新
        const id = await db.upsertCreativeScheduleSettings(ctx.user.id, {
          enabled: true,
          ...(nextRunAt && { nextRunAt }), // nextRunAtが計算された場合のみ設定
        });
        
        const { startCreativeSchedule } = await import('./scheduler');
        // 更新後のIDを使用してスケジュールを開始
        await startCreativeSchedule(id);
        return { success: true };
      }),
    
    stop: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) {
          throw new Error("スケジュール設定が見つかりません");
        }
        
        // データベースのenabledフィールドをfalseに更新
        await db.upsertCreativeScheduleSettings(ctx.user.id, {
          enabled: false,
        });
        
        const { stopCreativeSchedule } = await import('./scheduler');
        stopCreativeSchedule(schedule.id);
        return { success: true };
      }),
    
    // 検証用リセット（前回実行日を削除し、次回実行予定を設定）
    reset: protectedProcedure
      .mutation(async ({ ctx }) => {
        const schedule = await db.getCreativeScheduleSettingsByUserId(ctx.user.id);
        if (!schedule) {
          throw new Error("スケジュール設定が見つかりません");
        }
        
        const dbInstance = await getDb();
        if (!dbInstance) {
          throw new Error("データベースに接続できません");
        }
        
        const { creativeScheduleSettings } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        
        // 次回実行予定を2025/11/8 18:00に設定
        const nextRunAt = new Date('2025-11-08T18:00:00');
        
        await dbInstance.update(creativeScheduleSettings)
          .set({ 
            lastRunAt: null,
            nextRunAt
          })
          .where(eq(creativeScheduleSettings.id, schedule.id));
        
        // スケジューラーを再起動して新しいnextRunAtを反映
        const { startCreativeSchedule } = await import('./scheduler');
        await startCreativeSchedule(schedule.id);
        
        return { 
          success: true, 
          message: "スケジュールをリセットしました",
          nextRunAt: nextRunAt.toISOString()
        };
      }),
  }),
  
  importExport: router({
    importLps: protectedProcedure
      .input(z.object({
        landingPages: z.array(z.object({
          title: z.string(),
          url: z.string(),
          description: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        for (const landingPage of input.landingPages) {
          try {
            // タイトルが空の場合は「無題」に設定
            const title = (landingPage.title && landingPage.title.trim() !== "") ? landingPage.title : "無題";
            
            const id = await db.createLandingPage({
              userId: ctx.user.id,
              title,
              url: landingPage.url,
              description: landingPage.description || '',
            });
            results.push({ success: true, id, title });
          } catch (error) {
            results.push({ success: false, title: landingPage.title, error: String(error) });
          }
        }
        return { results };
      }),
    getHistory: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getExportHistoryByUserId(ctx.user.id);
      }),
    recordExport: protectedProcedure
      .input(z.object({
        type: z.string(),
        filename: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.addExportHistoryEntry({
          userId: ctx.user.id,
          type: input.type,
          filename: input.filename,
        });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

// Export for use in other files
export { db };

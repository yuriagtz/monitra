import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getDb } from "./db";
import { users, monitoringHistory } from "../drizzle/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { monitorLandingPage } from "./monitoring";
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

        // Update password
        await db.update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, ctx.user.id));

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

  lp: router({
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
        const userPlan = (ctx.user.plan as "free" | "light" | "pro") || "free";
        const maxLpCount = PLAN_CONFIG[userPlan].maxLpCount;
        
        // 現在のLP数を取得
        const currentLps = await db.getLandingPagesByUserId(ctx.user.id);
        const currentLpCount = currentLps.length;
        
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
        const lp = await db.getLandingPageById(id);
        if (!lp || lp.userId !== ctx.user.id) {
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
        const lp = await db.getLandingPageById(input.id);
        if (!lp || lp.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        await db.deleteLandingPage(input.id);
        return { success: true };
      }),
    
    monitor: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const lp = await db.getLandingPageById(input.id);
        if (!lp || lp.userId !== ctx.user.id) {
          throw new Error("Not found or unauthorized");
        }
        
        // 監視を実行して完了を待つ（タイムアウト: 2分）
        try {
          const result = await Promise.race([
            monitorLandingPage(lp.id),
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
          console.error(`[LP Monitor] Monitoring error for LP ${lp.id}:`, error);
          
          // 非同期で再試行（エラーはログのみ）
          monitorLandingPage(lp.id).catch((err) => {
            console.error(`[LP Monitor] Background monitoring failed for LP ${lp.id}:`, err);
          });
          
          throw new Error(error.message || "監視の実行中にエラーが発生しました");
        }
      }),
    
    monitorAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        // ユーザーが所有するすべてのLPを取得
        const allLPs = await db.getLandingPagesByUserId(ctx.user.id);
        
        if (allLPs.length === 0) {
          throw new Error("監視対象のLPがありません");
        }
        
        // すべてのLPをバックグラウンドで監視実行（非同期）
        // 注意: 完了を待たずに即座にレスポンスを返す（クライアント側でポーリング）
        const monitoringPromises = allLPs.map((lp) => {
          return monitorLandingPage(lp.id).catch((error) => {
            console.error(`[LP Monitor All] Failed to monitor LP ${lp.id} (${lp.url}):`, error);
            return null; // エラーがあっても他のLPの監視は続行
          });
        });
        
        // 非同期で実行開始（完了は待たない）
        Promise.all(monitoringPromises).then((results) => {
          const successCount = results.filter(r => r !== null).length;
          const errorCount = results.filter(r => r === null).length;
          console.log(`[LP Monitor All] Completed monitoring for ${allLPs.length} LP(s): ${successCount} success, ${errorCount} errors`);
        }).catch((error) => {
          console.error("[LP Monitor All] Error in batch monitoring:", error);
        });
        
        return {
          success: true,
          message: `${allLPs.length}件のLPの監視を開始しました`,
          count: allLPs.length,
        };
      }),
  }),
  
  tags: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getTagsByUserId(ctx.user.id);
    }),
    
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(50),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createTag({
          ...input,
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
  }),
  
  analytics: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const lps = await db.getLandingPagesByUserId(ctx.user.id);
      const allHistory = await Promise.all(
        lps.map(lp => db.getMonitoringHistoryByLandingPageId(lp.id))
      );
      const flatHistory = allHistory.flat();
      
      return {
        totalLPs: lps.length,
        totalChecks: flatHistory.length,
        changesDetected: flatHistory.filter(h => h.status === 'changed').length,
        errorsCount: flatHistory.filter(h => h.status === 'error').length,
      };
    }),
    
    changeFrequency: protectedProcedure.query(async ({ ctx }) => {
      const lps = await db.getLandingPagesByUserId(ctx.user.id);
      const result = await Promise.all(
        lps.map(async (lp) => {
          const history = await db.getMonitoringHistoryByLandingPageId(lp.id);
          return {
            name: lp.title || lp.url.substring(0, 30) + '...',
            changes: history.filter(h => h.status === 'changed').length,
            checks: history.length,
          };
        })
      );
      return result.filter(r => r.checks > 0);
    }),
    
    changeTrend: protectedProcedure
      .input(z.object({ landingPageId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        let history;
        if (input.landingPageId) {
          const lp = await db.getLandingPageById(input.landingPageId);
          if (!lp || lp.userId !== ctx.user.id) {
            throw new Error('Not found or unauthorized');
          }
          history = await db.getMonitoringHistoryByLandingPageId(input.landingPageId);
        } else {
          const lps = await db.getLandingPagesByUserId(ctx.user.id);
          const allHistory = await Promise.all(
            lps.map(lp => db.getMonitoringHistoryByLandingPageId(lp.id))
          );
          history = allHistory.flat();
        }
        
        // Group by date
        const grouped = history.reduce((acc, h) => {
          const date = h.createdAt.toISOString().split('T')[0];
          if (!acc[date]) {
            acc[date] = { date, changes: 0, checks: 0 };
          }
          acc[date].checks++;
          if (h.status === 'changed') {
            acc[date].changes++;
          }
          return acc;
        }, {} as Record<string, { date: string; changes: number; checks: number }>);
        
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
        // Convert booleans to integers for database
        const dbInput: any = {};
        if (input.emailEnabled !== undefined) dbInput.emailEnabled = input.emailEnabled ? 1 : 0;
        if (input.emailAddress !== undefined) dbInput.emailAddress = input.emailAddress;
        if (input.slackEnabled !== undefined) dbInput.slackEnabled = input.slackEnabled ? 1 : 0;
        if (input.slackWebhookUrl !== undefined) dbInput.slackWebhookUrl = input.slackWebhookUrl;
        if (input.discordEnabled !== undefined) dbInput.discordEnabled = input.discordEnabled ? 1 : 0;
        if (input.discordWebhookUrl !== undefined) dbInput.discordWebhookUrl = input.discordWebhookUrl;
        if (input.chatworkEnabled !== undefined) dbInput.chatworkEnabled = input.chatworkEnabled ? 1 : 0;
        if (input.chatworkApiToken !== undefined) dbInput.chatworkApiToken = input.chatworkApiToken;
        if (input.chatworkRoomId !== undefined) dbInput.chatworkRoomId = input.chatworkRoomId;
        if (input.notifyOnChange !== undefined) dbInput.notifyOnChange = input.notifyOnChange ? 1 : 0;
        if (input.notifyOnError !== undefined) dbInput.notifyOnError = input.notifyOnError ? 1 : 0;
        if (input.notifyOnBrokenLink !== undefined) dbInput.notifyOnBrokenLink = input.notifyOnBrokenLink ? 1 : 0;
        if (input.ignoreFirstViewOnly !== undefined) dbInput.ignoreFirstViewOnly = input.ignoreFirstViewOnly ? 1 : 0;
        
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
  
  monitoring: router({
    recent: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const limit = input.limit || 10;
        // ユーザーが所有するLPのIDを取得
        const userLPs = await db.getLandingPagesByUserId(ctx.user.id);
        const userLpIds = userLPs.map((lp) => lp.id);
        
        if (userLpIds.length === 0) {
          return [];
        }
        
        // ユーザーが所有するLPの監視履歴のみを取得
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        
        return await dbInstance
          .select()
          .from(monitoringHistory)
          .where(inArray(monitoringHistory.landingPageId, userLpIds))
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
        const lp = await db.getLandingPageById(input.landingPageId);
        if (!lp || lp.userId !== ctx.user.id) {
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
        
        // プランに応じた最小監視間隔をチェック
        const { getMinIntervalDays } = await import('./_core/plan');
        const userPlan = (ctx.user.plan as "free" | "light" | "pro") || "free";
        const minIntervalDays = getMinIntervalDays(userPlan);
        
        // 現在の間隔が最小間隔より小さい場合は自動調整
        if (schedule.intervalDays < minIntervalDays) {
          const excludedIdsJson = schedule.excludedLandingPageIds;
          const excludedIds = excludedIdsJson ? JSON.parse(excludedIdsJson) as number[] : [];
          
          // 自動的に最小間隔に更新
          const id = await db.upsertScheduleSettings(ctx.user.id, {
            intervalDays: minIntervalDays,
            enabled: schedule.enabled,
            excludedLandingPageIds: excludedIdsJson,
          });
          
          // スケジューラーを再起動
          const { startSchedule } = await import('./scheduler');
          await startSchedule(id);
          
          // 更新後のスケジュールを返す
          const updatedSchedule = await db.getScheduleSettingsByUserId(ctx.user.id);
          return updatedSchedule || schedule;
        }
        
        return schedule;
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
        const userPlan = (ctx.user.plan as "free" | "light" | "pro") || "free";
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
  
  importExport: router({
    importLps: protectedProcedure
      .input(z.object({
        lps: z.array(z.object({
          title: z.string(),
          url: z.string(),
          description: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        for (const lp of input.lps) {
          try {
            // タイトルが空の場合は「無題」に設定
            const title = (lp.title && lp.title.trim() !== "") ? lp.title : "無題";
            
            const id = await db.createLandingPage({
              userId: ctx.user.id,
              title,
              url: lp.url,
              description: lp.description || '',
            });
            results.push({ success: true, id, title });
          } catch (error) {
            results.push({ success: false, title: lp.title, error: String(error) });
          }
        }
        return { results };
      }),
  }),
});

export type AppRouter = typeof appRouter;

// Export for use in other files
export { db };

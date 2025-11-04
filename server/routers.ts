import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
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
        const database = await getDb();
        if (!database) throw new Error('Database not available');

        // Check if user already exists
        const existing = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (existing.length > 0) {
          throw new Error('このメールアドレスはすでに登録されています');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(input.password, 10);

        // Create user with a temporary openId (email-based)
        const openId = `local_${input.email}_${Date.now()}`;
        await database.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          password: hashedPassword,
          loginMethod: 'local',
          role: 'user',
        });

        // Get the created user
        const [newUser] = await database.select().from(users).where(eq(users.email, input.email)).limit(1);

        // Set session cookie
        const token = Buffer.from(JSON.stringify({ userId: newUser.id, openId: newUser.openId })).toString('base64');
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return { success: true, user: newUser };
      }),
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const database = await getDb();
        if (!database) throw new Error('Database not available');

        // Find user by email
        const [user] = await database.select().from(users).where(eq(users.email, input.email)).limit(1);
        if (!user || !user.password) {
          throw new Error('メールアドレスまたはパスワードが正しくありません');
        }

        // Verify password
        const isValid = await bcrypt.compare(input.password, user.password);
        if (!isValid) {
          throw new Error('メールアドレスまたはパスワードが正しくありません');
        }

        // Update last signed in
        await database.update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, user.id));

        // Set session cookie
        const token = Buffer.from(JSON.stringify({ userId: user.id, openId: user.openId })).toString('base64');
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return { success: true, user };
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
    logout: publicProcedure.mutation(({ ctx }) => {
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
        title: z.string().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.createLandingPage({
          ...input,
          userId: ctx.user.id,
        });
        return { id };
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
        
        // Import monitoring function
        const { monitorLandingPage } = await import("./monitoring");
        
        // Run monitoring asynchronously
        monitorLandingPage(lp.id).catch(console.error);
        
        return { success: true };
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
      .query(async ({ input }) => {
        const limit = input.limit || 10;
        return await db.getRecentMonitoringHistory(limit);
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
    list: protectedProcedure.query(async () => {
      return await db.getAllScheduleSettings();
    }),
    
    get: protectedProcedure
      .input(z.object({ landingPageId: z.number() }))
      .query(async ({ input }) => {
        return await db.getScheduleSettings(input.landingPageId);
      }),
    
    upsert: protectedProcedure
      .input(z.object({
        landingPageId: z.number(),
        scheduleType: z.enum(["interval", "cron"]),
        intervalMinutes: z.number().optional(),
        cronExpression: z.string().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { landingPageId, enabled, ...settings } = input;
        const id = await db.upsertScheduleSettings(landingPageId, {
          ...settings,
          enabled: enabled !== undefined ? (enabled ? 1 : 0) : undefined,
        });
        
        // Import scheduler dynamically to avoid circular dependency
        const { startSchedule } = await import('./scheduler');
        if (enabled) {
          await startSchedule(id);
        }
        
        return { success: true, id };
      }),
    
    delete: protectedProcedure
      .input(z.object({ landingPageId: z.number() }))
      .mutation(async ({ input }) => {
        const schedule = await db.getScheduleSettings(input.landingPageId);
        if (schedule) {
          const { stopSchedule } = await import('./scheduler');
          stopSchedule(schedule.id);
        }
        
        await db.deleteScheduleSettings(input.landingPageId);
        return { success: true };
      }),
    
    start: protectedProcedure
      .input(z.object({ scheduleId: z.number() }))
      .mutation(async ({ input }) => {
        const { startSchedule } = await import('./scheduler');
        await startSchedule(input.scheduleId);
        return { success: true };
      }),
    
    stop: protectedProcedure
      .input(z.object({ scheduleId: z.number() }))
      .mutation(async ({ input }) => {
        const { stopSchedule } = await import('./scheduler');
        stopSchedule(input.scheduleId);
        return { success: true };
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
            const id = await db.createLandingPage({
              userId: ctx.user.id,
              title: lp.title,
              url: lp.url,
              description: lp.description || '',
            });
            results.push({ success: true, id, title: lp.title });
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

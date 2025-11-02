import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { monitorLandingPage } from "./monitoring";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
});

export type AppRouter = typeof appRouter;

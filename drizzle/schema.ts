import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Landing pages being monitored
 */
export const landingPages = mysqlTable("landing_pages", {
  id: int("id").autoincrement().primaryKey(),
  url: text("url").notNull(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LandingPage = typeof landingPages.$inferSelect;
export type InsertLandingPage = typeof landingPages.$inferInsert;

/**
 * Monitoring history for each landing page
 */
export const monitoringHistory = mysqlTable("monitoring_history", {
  id: int("id").autoincrement().primaryKey(),
  landingPageId: int("landingPageId").notNull(),
  checkType: mysqlEnum("checkType", ["content_change", "link_broken"]).notNull(),
  status: mysqlEnum("status", ["ok", "changed", "error"]).notNull(),
  message: text("message"),
  screenshotUrl: text("screenshotUrl"),
  previousScreenshotUrl: text("previousScreenshotUrl"),
  diffImageUrl: text("diffImageUrl"),
  checkedAt: timestamp("checkedAt").defaultNow().notNull(),
});

export type MonitoringHistory = typeof monitoringHistory.$inferSelect;
export type InsertMonitoringHistory = typeof monitoringHistory.$inferInsert;

/**
 * Latest screenshots for each landing page
 */
export const screenshots = mysqlTable("screenshots", {
  id: int("id").autoincrement().primaryKey(),
  landingPageId: int("landingPageId").notNull().unique(),
  screenshotUrl: text("screenshotUrl").notNull(),
  fileKey: text("fileKey").notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});

export type Screenshot = typeof screenshots.$inferSelect;
export type InsertScreenshot = typeof screenshots.$inferInsert;
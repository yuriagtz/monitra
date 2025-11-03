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
  password: varchar("password", { length: 255 }), // bcrypt hash
  profileImage: text("profileImage"),
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
  landingPageId: int("landing_page_id").notNull(),
  checkType: mysqlEnum("check_type", ["content_change", "link_broken"]).notNull(),
  status: mysqlEnum("status", ["ok", "changed", "error"]).notNull(),
  message: text("message"),
  screenshotUrl: text("screenshot_url"),
  previousScreenshotUrl: text("previous_screenshot_url"),
  diffImageUrl: text("diff_image_url"),
  // Region-based diff analysis
  diffTopThird: varchar("diff_top_third", { length: 20 }),
  diffMiddleThird: varchar("diff_middle_third", { length: 20 }),
  diffBottomThird: varchar("diff_bottom_third", { length: 20 }),
  regionAnalysis: text("region_analysis"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

/**
 * Tags for categorizing landing pages
 */
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(), // Hex color code
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

/**
 * Many-to-many relationship between landing pages and tags
 */
export const landingPageTags = mysqlTable("landing_page_tags", {
  id: int("id").autoincrement().primaryKey(),
  landingPageId: int("landingPageId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LandingPageTag = typeof landingPageTags.$inferSelect;
export type InsertLandingPageTag = typeof landingPageTags.$inferInsert;

/**
 * Notification settings table
 */
export const notificationSettings = mysqlTable("notification_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  
  // Notification channels
  emailEnabled: int("email_enabled").default(0).notNull(),
  emailAddress: text("email_address"),
  
  slackEnabled: int("slack_enabled").default(0).notNull(),
  slackWebhookUrl: text("slack_webhook_url"),
  
  discordEnabled: int("discord_enabled").default(0).notNull(),
  discordWebhookUrl: text("discord_webhook_url"),
  
  chatworkEnabled: int("chatwork_enabled").default(0).notNull(),
  chatworkApiToken: text("chatwork_api_token"),
  chatworkRoomId: text("chatwork_room_id"),
  
  // Notification conditions
  notifyOnChange: int("notify_on_change").default(1).notNull(),
  notifyOnError: int("notify_on_error").default(1).notNull(),
  notifyOnBrokenLink: int("notify_on_broken_link").default(1).notNull(),
  ignoreFirstViewOnly: int("ignore_first_view_only").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = typeof notificationSettings.$inferInsert;

/**
 * Schedule settings table
 */
export const scheduleSettings = mysqlTable("schedule_settings", {
  id: int("id").autoincrement().primaryKey(),
  landingPageId: int("landing_page_id").notNull(),
  enabled: int("enabled").default(1).notNull(),
  
  // Schedule type: interval (minutes) or cron expression
  scheduleType: mysqlEnum("schedule_type", ["interval", "cron"]).default("interval").notNull(),
  intervalMinutes: int("interval_minutes").default(60), // For interval type
  cronExpression: text("cron_expression"), // For cron type
  
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type ScheduleSetting = typeof scheduleSettings.$inferSelect;
export type InsertScheduleSetting = typeof scheduleSettings.$inferInsert;
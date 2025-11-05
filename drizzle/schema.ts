import { pgTable, serial, text, timestamp, varchar, boolean, integer, pgEnum } from "drizzle-orm/pg-core";

// Enums
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const checkTypeEnum = pgEnum("check_type", ["content_change", "link_broken"]);
export const statusEnum = pgEnum("status", ["ok", "changed", "error"]);
export const scheduleTypeEnum = pgEnum("schedule_type", ["interval", "cron"]);
export const planEnum = pgEnum("plan", ["free", "light", "pro"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Supabase Auth identifier (openId) - links to Supabase auth.users.id. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }), // bcrypt hash (optional, Supabase Auth handles auth)
  profileImage: text("profileImage"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  plan: planEnum("plan").default("free").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Landing pages being monitored
 */
export const landingPages = pgTable("landing_pages", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  userId: integer("userId").notNull(),
  // enabled: boolean("enabled").default(true).notNull(), // 監視有効/無効フラグ（マイグレーション後に有効化）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type LandingPage = typeof landingPages.$inferSelect;
export type InsertLandingPage = typeof landingPages.$inferInsert;

/**
 * Monitoring history for each landing page
 */
export const monitoringHistory = pgTable("monitoring_history", {
  id: serial("id").primaryKey(),
  landingPageId: integer("landing_page_id").notNull(),
  checkType: checkTypeEnum("check_type").notNull(),
  status: statusEnum("status").notNull(),
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
 * Tags for categorizing landing pages
 */
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(), // Hex color code
  userId: integer("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

/**
 * Many-to-many relationship between landing pages and tags
 */
export const landingPageTags = pgTable("landing_page_tags", {
  id: serial("id").primaryKey(),
  landingPageId: integer("landingPageId").notNull(),
  tagId: integer("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LandingPageTag = typeof landingPageTags.$inferSelect;
export type InsertLandingPageTag = typeof landingPageTags.$inferInsert;

/**
 * Notification settings table
 */
export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  
  // Notification channels
  emailEnabled: boolean("email_enabled").default(false).notNull(),
  emailAddress: text("email_address"),
  
  slackEnabled: boolean("slack_enabled").default(false).notNull(),
  slackWebhookUrl: text("slack_webhook_url"),
  
  discordEnabled: boolean("discord_enabled").default(false).notNull(),
  discordWebhookUrl: text("discord_webhook_url"),
  
  chatworkEnabled: boolean("chatwork_enabled").default(false).notNull(),
  chatworkApiToken: text("chatwork_api_token"),
  chatworkRoomId: text("chatwork_room_id"),
  
  // Notification conditions
  notifyOnChange: boolean("notify_on_change").default(true).notNull(),
  notifyOnError: boolean("notify_on_error").default(true).notNull(),
  notifyOnBrokenLink: boolean("notify_on_broken_link").default(true).notNull(),
  ignoreFirstViewOnly: boolean("ignore_first_view_only").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = typeof notificationSettings.$inferInsert;

/**
 * Schedule settings table
 * ユーザーごとに1つのスケジュール設定（全LPを一括監視）
 */
export const scheduleSettings = pgTable("schedule_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(), // ユーザーごとに1スケジュール
  enabled: boolean("enabled").default(true).notNull(),

  // 監視間隔（日単位）
  intervalDays: integer("interval_days").notNull(), // 1日、2日、3日など

  // 実行時間（時、0-23）
  executeHour: integer("execute_hour").default(9).notNull(), // デフォルトは9時（午前9時）

  // 除外LPのIDリスト（JSON配列として保存）
  excludedLandingPageIds: text("excluded_landing_page_ids"), // JSON配列: [1, 2, 3]

  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type ScheduleSetting = typeof scheduleSettings.$inferSelect;
export type InsertScheduleSetting = typeof scheduleSettings.$inferInsert;

/**
 * Notification history table
 * Records notification sending history
 */
export const notificationHistoryStatusEnum = pgEnum("notification_history_status", ["pending", "success", "failed"]);

export const notificationHistory = pgTable("notification_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  landingPageId: integer("landing_page_id"), // NULL許可（全体通知の場合）
  monitoringHistoryId: integer("monitoring_history_id"), // NULL許可（手動通知の場合）
  channel: varchar("channel", { length: 20 }).notNull(), // email, slack, discord, chatwork
  status: notificationHistoryStatusEnum("status").default("pending").notNull(),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type NotificationHistory = typeof notificationHistory.$inferSelect;
export type InsertNotificationHistory = typeof notificationHistory.$inferInsert;

/**
 * Schedule execution log table
 * Records schedule execution history
 */
export const scheduleExecutionStatusEnum = pgEnum("schedule_execution_status", ["started", "completed", "failed"]);

export const scheduleExecutionLog = pgTable("schedule_execution_log", {
  id: serial("id").primaryKey(),
  scheduleSettingId: integer("schedule_setting_id").notNull(),
  landingPageId: integer("landing_page_id").notNull(),
  status: scheduleExecutionStatusEnum("status").default("started").notNull(),
  monitoringHistoryId: integer("monitoring_history_id"), // NULL許可（失敗時）
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"), // 実行時間（ミリ秒）
});

export type ScheduleExecutionLog = typeof scheduleExecutionLog.$inferSelect;
export type InsertScheduleExecutionLog = typeof scheduleExecutionLog.$inferInsert;
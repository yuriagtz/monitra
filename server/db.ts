import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  InsertUser, 
  users, 
  landingPages, 
  InsertLandingPage,
  monitoringHistory,
  InsertMonitoringHistory,
  tags,
  InsertTag,
  landingPageTags,
  InsertLandingPageTag,
  notificationSettings,
  type NotificationSetting,
  type InsertNotificationSetting,
  scheduleSettings,
  type ScheduleSetting,
  type InsertScheduleSetting
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
let _client: postgres.Sql | null = null;

export async function getDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Database] DATABASE_URL environment variable is not set");
    console.warn("[Database] Please set DATABASE_URL in your .env file");
    console.warn("[Database] Format: postgresql://user:password@host:port/database");
    return null;
  }
  
  if (!_db || !_client) {
    try {
      // Create postgres client
      const dbUrl = process.env.DATABASE_URL;
      // Mask password in logs for security
      const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
      console.log("[Database] Connecting to:", maskedUrl);
      
      _client = postgres(dbUrl, {
        max: 10, // Connection pool size
        idle_timeout: 20,
        connect_timeout: 10,
        transform: {
          undefined: null, // Handle undefined values
        },
      });
      _db = drizzle(_client);
      
      // Test connection
      await _client`SELECT 1`;
      console.log("[Database] Successfully connected to PostgreSQL");
    } catch (error) {
      console.error("[Database] Failed to initialize connection:", error);
      console.error("[Database] DATABASE_URL format should be: postgresql://user:password@host:port/database");
      _db = null;
      _client = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Landing Pages
export async function createLandingPage(data: InsertLandingPage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(landingPages).values(data).returning({ id: landingPages.id });
  return result[0].id;
}

export async function getLandingPagesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const lps = await db.select().from(landingPages).where(eq(landingPages.userId, userId));
  
  // タイトルがnullまたは空文字列の場合は「無題」に設定
  return lps.map(lp => ({
    ...lp,
    title: lp.title && lp.title.trim() !== "" ? lp.title : "無題"
  }));
}

export async function getLandingPageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(landingPages).where(eq(landingPages.id, id)).limit(1);
  if (result.length === 0) return undefined;
  
  const lp = result[0];
  // タイトルがnullまたは空文字列の場合は「無題」に設定
  return {
    ...lp,
    title: lp.title && lp.title.trim() !== "" ? lp.title : "無題"
  };
}

export async function updateLandingPage(id: number, data: Partial<InsertLandingPage>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(landingPages)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(landingPages.id, id));
}

export async function deleteLandingPage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(landingPages).where(eq(landingPages.id, id));
}

// Monitoring History
export async function createMonitoringHistory(data: InsertMonitoringHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(monitoringHistory).values(data).returning({ id: monitoringHistory.id });
  return result[0].id;
}

export async function getMonitoringHistoryByLandingPageId(landingPageId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select()
    .from(monitoringHistory)
    .where(eq(monitoringHistory.landingPageId, landingPageId))
    .orderBy(desc(monitoringHistory.createdAt))
    .limit(limit);
}

// Screenshots table has been removed
// All screenshot data is now stored in monitoring_history table

export async function getRecentMonitoringHistory(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(monitoringHistory)
    .orderBy(desc(monitoringHistory.createdAt))
    .limit(limit);
  return result;
}

// Tags
export async function getTagsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(tags).where(eq(tags.userId, userId));
  return result;
}

export async function createTag(data: InsertTag) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(tags).values(data).returning({ id: tags.id });
  return result[0].id;
}

export async function deleteTag(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete tag associations first
  await db.delete(landingPageTags).where(eq(landingPageTags.tagId, id));
  // Then delete the tag
  await db.delete(tags).where(eq(tags.id, id));
}

export async function addTagToLandingPage(landingPageId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(landingPageTags).values({ landingPageId, tagId });
}

export async function removeTagFromLandingPage(landingPageId: number, tagId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(landingPageTags)
    .where(eq(landingPageTags.landingPageId, landingPageId));
}

export async function getTagsForLandingPage(landingPageId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select({
    id: tags.id,
    name: tags.name,
    color: tags.color,
  })
  .from(landingPageTags)
  .innerJoin(tags, eq(landingPageTags.tagId, tags.id))
  .where(eq(landingPageTags.landingPageId, landingPageId));
  
  return result;
}

// Notification settings
export async function getNotificationSettings(userId: number): Promise<NotificationSetting | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertNotificationSettings(userId: number, settings: Partial<InsertNotificationSetting>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  const existing = await getNotificationSettings(userId);
  
  if (existing) {
    await db.update(notificationSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(notificationSettings.userId, userId));
  } else {
    await db.insert(notificationSettings).values({
      userId,
      ...settings,
    } as InsertNotificationSetting);
  }
}

// Schedule settings
export async function getScheduleSettingsByUserId(userId: number) {
  const db = await getDb();
  if (!db || !_client) return undefined;
  
  try {
    // まずテーブルのカラム構造を確認
    const columns = await _client`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedule_settings'
      ORDER BY ordinal_position;
    `;
    
    const columnNames = Array.isArray(columns) ? columns.map((c: any) => c.column_name) : [];
    let hasUserId = columnNames.includes('user_id');
    let hasExcludedIds = columnNames.includes('excluded_landing_page_ids');
    let hasExecuteHour = columnNames.includes('execute_hour');
    
    // user_idカラムが存在しない場合は、マイグレーションが必要
    if (!hasUserId) {
      console.error("[Database] user_id column not found in schedule_settings table. Migration required.");
      console.error("[Database] Please run COMPLETE_SCHEDULE_MIGRATION.sql in Supabase Dashboard");
      return undefined;
    }
    
    // excluded_landing_page_idsカラムが存在しない場合は追加を試みる
    if (!hasExcludedIds) {
      try {
        await _client`
          ALTER TABLE schedule_settings 
          ADD COLUMN excluded_landing_page_ids TEXT;
        `;
        console.log("[Database] Added excluded_landing_page_ids column");
        hasExcludedIds = true;
      } catch (addError: any) {
        // 既に存在する場合は無視
        if (addError?.message?.includes('already exists') || addError?.code === '42701') {
          hasExcludedIds = true;
        } else {
          console.warn("[Database] Failed to add excluded_landing_page_ids column:", addError);
        }
      }
    }
    
    // execute_hourカラムが存在しない場合は追加を試みる
    if (!hasExecuteHour) {
      try {
        await _client`
          ALTER TABLE schedule_settings 
          ADD COLUMN execute_hour INTEGER NOT NULL DEFAULT 9;
        `;
        console.log("[Database] Added execute_hour column");
        hasExecuteHour = true;
      } catch (addError: any) {
        // 既に存在する場合は無視
        if (addError?.message?.includes('already exists') || addError?.code === '42701') {
          hasExecuteHour = true;
        } else {
          console.warn("[Database] Failed to add execute_hour column:", addError);
        }
      }
    }
    
    // カラムが存在する場合は通常のSELECT（Drizzle ORMを使用）
    if (hasExcludedIds && hasExecuteHour) {
      const result = await db.select().from(scheduleSettings).where(eq(scheduleSettings.userId, userId)).limit(1);
      return result.length > 0 ? result[0] : undefined;
    } else {
      // 一部のカラムが存在しない場合は、存在するカラムのみでSELECT
      let selectColumns = "id, user_id, enabled, interval_days";
      if (hasExecuteHour) {
        selectColumns += ", execute_hour";
      }
      if (hasExcludedIds) {
        selectColumns += ", excluded_landing_page_ids";
      }
      selectColumns += ", last_run_at, next_run_at, created_at, updated_at";
      
      const result = await _client`
        SELECT ${_client.unsafe(selectColumns)}
        FROM schedule_settings
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      
      if (Array.isArray(result) && result.length > 0) {
        return {
          ...result[0],
          excludedLandingPageIds: hasExcludedIds ? result[0].excluded_landing_page_ids : null,
          executeHour: hasExecuteHour ? (result[0].execute_hour ?? 9) : 9,
        };
      }
      return undefined;
    }
  } catch (error: any) {
    // エラーが発生した場合、カラムを除外してSELECT
    if (error?.message?.includes('excluded_landing_page_ids') || 
        error?.message?.includes('execute_hour') || 
        error?.message?.includes('user_id') || 
        error?.code === '42703') {
      console.warn("[Database] Column error, using fallback query");
      try {
        // カラムを追加してから再試行
        if (error?.message?.includes('excluded_landing_page_ids')) {
          await _client`
            ALTER TABLE schedule_settings 
            ADD COLUMN IF NOT EXISTS excluded_landing_page_ids TEXT;
          `;
        }
        if (error?.message?.includes('execute_hour')) {
          await _client`
            ALTER TABLE schedule_settings 
            ADD COLUMN IF NOT EXISTS execute_hour INTEGER NOT NULL DEFAULT 9;
          `;
        }
        
        // 再試行
        const result = await db.select().from(scheduleSettings).where(eq(scheduleSettings.userId, userId)).limit(1);
        return result.length > 0 ? result[0] : undefined;
      } catch (retryError: any) {
        console.error("[Database] Fallback query also failed:", retryError);
        throw error;
      }
    }
    throw error;
  }
}

export async function getAllScheduleSettings() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(scheduleSettings);
}

export async function upsertScheduleSettings(userId: number, settings: Partial<InsertScheduleSetting>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // excludedLandingPageIdsが存在しない場合、カラムを追加しようとする
  if (settings.excludedLandingPageIds !== undefined) {
    try {
      // カラムが存在するか確認してから使用
      await db.execute(`
        ALTER TABLE schedule_settings 
        ADD COLUMN IF NOT EXISTS excluded_landing_page_ids TEXT;
      `);
    } catch (error: any) {
      // カラムが既に存在する場合はエラーを無視
      if (!error?.message?.includes('already exists') && error?.code !== '42701') {
        console.warn("[Database] Failed to add excluded_landing_page_ids column:", error);
      }
    }
  }
  
  // executeHourが存在しない場合、カラムを追加しようとする
  if (settings.executeHour !== undefined || _client) {
    try {
      // カラムが存在するか確認してから使用
      if (_client) {
        await _client`
          ALTER TABLE schedule_settings 
          ADD COLUMN IF NOT EXISTS execute_hour INTEGER NOT NULL DEFAULT 9;
        `;
      } else {
        await db.execute(`
          ALTER TABLE schedule_settings 
          ADD COLUMN IF NOT EXISTS execute_hour INTEGER NOT NULL DEFAULT 9;
        `);
      }
    } catch (error: any) {
      // カラムが既に存在する場合はエラーを無視
      if (!error?.message?.includes('already exists') && error?.code !== '42701') {
        console.warn("[Database] Failed to add execute_hour column:", error);
      }
    }
  }
  
  const existing = await getScheduleSettingsByUserId(userId);
  
  // excludedLandingPageIdsが存在しない場合は設定から除外
  const settingsToUpdate = { ...settings };
  if (settingsToUpdate.excludedLandingPageIds === undefined) {
    delete settingsToUpdate.excludedLandingPageIds;
  }
  
  // nextRunAtがundefinedの場合は設定から除外（nullに更新したい場合は明示的にnullを渡す）
  if (settingsToUpdate.nextRunAt === undefined) {
    delete settingsToUpdate.nextRunAt;
  }
  
  if (existing) {
    await db.update(scheduleSettings)
      .set({ ...settingsToUpdate, updatedAt: new Date() })
      .where(eq(scheduleSettings.userId, userId));
    return existing.id;
  } else {
    const result = await db.insert(scheduleSettings).values({
      userId,
      ...settingsToUpdate,
    } as InsertScheduleSetting).returning({ id: scheduleSettings.id });
    return result[0].id;
  }
}

export async function deleteScheduleSettings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(scheduleSettings).where(eq(scheduleSettings.userId, userId));
}

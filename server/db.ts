import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  landingPages, 
  InsertLandingPage,
  monitoringHistory,
  InsertMonitoringHistory,
  screenshots,
  InsertScreenshot,
  tags,
  InsertTag,
  landingPageTags,
  InsertLandingPageTag
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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
  
  const result = await db.insert(landingPages).values(data);
  return result[0].insertId;
}

export async function getLandingPagesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(landingPages).where(eq(landingPages.userId, userId));
}

export async function getLandingPageById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(landingPages).where(eq(landingPages.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
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
  
  const result = await db.insert(monitoringHistory).values(data);
  return result[0].insertId;
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

// Screenshots
export async function upsertScreenshot(data: InsertScreenshot) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(screenshots).values(data).onDuplicateKeyUpdate({
    set: {
      screenshotUrl: data.screenshotUrl,
      fileKey: data.fileKey,
      capturedAt: data.capturedAt || new Date(),
    },
  });
}

export async function getScreenshotByLandingPageId(landingPageId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(screenshots).where(eq(screenshots.landingPageId, landingPageId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

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
  
  const result = await db.insert(tags).values(data);
  return Number(result[0].insertId);
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

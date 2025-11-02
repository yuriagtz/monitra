import * as cron from 'node-cron';
import { getDb } from './db';
import { scheduleSettings, landingPages } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { monitorLandingPage } from './monitoring';

const scheduledTasks = new Map<number, ReturnType<typeof cron.schedule>>();

export async function initializeScheduler() {
  console.log('[Scheduler] Initializing...');
  
  // Load all enabled schedules from database
  const db = await getDb();
  if (!db) {
    console.warn('[Scheduler] Database not available');
    return;
  }
  
  const schedules = await db.select().from(scheduleSettings).where(eq(scheduleSettings.enabled, 1));
  
  for (const schedule of schedules) {
    await startSchedule(schedule.id);
  }
  
  console.log(`[Scheduler] Initialized with ${schedules.length} active schedules`);
}

export async function startSchedule(scheduleId: number) {
  const db = await getDb();
  if (!db) return;
  
  const schedule = await db.select().from(scheduleSettings).where(eq(scheduleSettings.id, scheduleId)).limit(1);
  if (schedule.length === 0 || !schedule[0].enabled) return;
  
  const setting = schedule[0];
  
  // Stop existing task if any
  stopSchedule(scheduleId);
  
  let cronExpression: string;
  
  if (setting.scheduleType === 'cron' && setting.cronExpression) {
    cronExpression = setting.cronExpression;
  } else {
    // Convert interval minutes to cron expression
    const minutes = setting.intervalMinutes || 60;
    cronExpression = `*/${minutes} * * * *`;
  }
  
  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    console.error(`[Scheduler] Invalid cron expression for schedule ${scheduleId}: ${cronExpression}`);
    return;
  }
  
  const task = cron.schedule(cronExpression, async () => {
    console.log(`[Scheduler] Running scheduled task for LP ${setting.landingPageId}`);
    
    try {
      // Get LP details
      const lp = await db.select().from(landingPages).where(eq(landingPages.id, setting.landingPageId)).limit(1);
      if (lp.length === 0) {
        console.error(`[Scheduler] LP ${setting.landingPageId} not found`);
        return;
      }
      
      // Run monitoring
      await monitorLandingPage(lp[0].id);
      
      // Update last run time
      await db.update(scheduleSettings)
        .set({ 
          lastRunAt: new Date(),
          nextRunAt: getNextRunTime(cronExpression)
        })
        .where(eq(scheduleSettings.id, scheduleId));
        
      console.log(`[Scheduler] Completed scheduled task for LP ${setting.landingPageId}`);
    } catch (error) {
      console.error(`[Scheduler] Error running scheduled task for LP ${setting.landingPageId}:`, error);
    }
  });
  
  scheduledTasks.set(scheduleId, task);
  console.log(`[Scheduler] Started schedule ${scheduleId} with expression: ${cronExpression}`);
}

export function stopSchedule(scheduleId: number) {
  const task = scheduledTasks.get(scheduleId);
  if (task) {
    task.stop();
    scheduledTasks.delete(scheduleId);
    console.log(`[Scheduler] Stopped schedule ${scheduleId}`);
  }
}

export async function stopAllSchedules() {
  scheduledTasks.forEach((task) => {
    task.stop();
  });
  scheduledTasks.clear();
  console.log('[Scheduler] Stopped all schedules');
}

function getNextRunTime(cronExpression: string): Date {
  // Simple approximation - in production, use a proper cron parser
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  return now;
}

// Initialize scheduler on module load
initializeScheduler().catch(console.error);

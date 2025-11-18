import * as cron from 'node-cron';
import { getDb } from './db';
import { scheduleSettings, landingPages, creativeScheduleSettings, creatives } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { monitorLandingPage, monitorCreative } from './monitoring';
import { getLandingPagesByUserId, getCreativesByUserId } from './db';

const scheduledTasks = new Map<number, ReturnType<typeof cron.schedule>>();
const creativeScheduledTasks = new Map<number, ReturnType<typeof cron.schedule>>();
// 実行中のスケジュールを追跡（重複実行を防ぐ）
const runningSchedules = new Set<number>();
const runningCreativeSchedules = new Set<number>();
// 実行中のLPを追跡（LP単位での重複実行を防ぐ）
const runningLps = new Set<number>();
// 実行中のクリエイティブを追跡（クリエイティブ単位での重複実行を防ぐ）
const runningCreatives = new Set<number>();

// 毎時0分にチェック（実行時刻は各スケジュールのexecuteHourで設定）
const SCHEDULE_CHECK_TIME = "0 * * * *";

export async function initializeScheduler() {
  console.log('[Scheduler] Initializing...');
  
  // Load all enabled schedules from database
  const db = await getDb();
  if (!db) {
    console.warn('[Scheduler] Database not available');
    return;
  }
  
  const schedules = await db.select().from(scheduleSettings).where(eq(scheduleSettings.enabled, true));
  const creativeSchedules = await db.select().from(creativeScheduleSettings).where(eq(creativeScheduleSettings.enabled, true));
  
  for (const schedule of schedules) {
    await startSchedule(schedule.id);
  }
  
  for (const creativeSchedule of creativeSchedules) {
    await startCreativeSchedule(creativeSchedule.id);
  }
  
  console.log(`[Scheduler] Initialized with ${schedules.length} active LP schedules and ${creativeSchedules.length} active creative schedules`);
}

export async function startSchedule(scheduleId: number) {
  const db = await getDb();
  if (!db) return;
  
  // Stop existing task if any
  stopSchedule(scheduleId);
  
  // データベースから最新の設定を再取得（更新後の設定を反映）
  const latestSchedule = await db.select().from(scheduleSettings).where(eq(scheduleSettings.id, scheduleId)).limit(1);
  if (latestSchedule.length === 0 || !latestSchedule[0].enabled) return;
  
  const setting = latestSchedule[0];
  
  // 次回実行予定日時を設定（まだ設定されていない場合）
  // データベースに既にnextRunAtが設定されている場合は、それを信頼する（upsertで計算済み）
  // ただし、nextRunAtが設定されていない場合のみ再計算
  if (!setting.nextRunAt) {
    const now = new Date();
    let nextRunAt: Date;
    
    // 最終実行日を確認
    const lastRunAt = setting.lastRunAt ? new Date(setting.lastRunAt) : null;
    
    const executeHour = setting.executeHour ?? 9;
    
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
      
      if (daysSinceLastRun >= setting.intervalDays) {
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
        nextRunAt.setDate(nextRunAt.getDate() + setting.intervalDays);
        nextRunAt.setHours(executeHour, 0, 0, 0);
      }
    }
    
    await db.update(scheduleSettings)
      .set({ nextRunAt })
      .where(eq(scheduleSettings.id, scheduleId));
    
    console.log(`[Scheduler] Set initial nextRunAt for schedule ${scheduleId}: ${nextRunAt.toISOString()}`);
    
    // 設定を更新
    setting.nextRunAt = nextRunAt;
  }
  
  // 毎時0分にチェックし、指定時刻で間隔が経過していれば実行
  const task = cron.schedule(SCHEDULE_CHECK_TIME, async () => {
    try {
      const now = new Date();
      console.log(`[Scheduler] Hourly check triggered at ${now.toISOString()} for schedule ${scheduleId}`);
      
      // データベースから最新のスケジュール設定を取得
      const latestSchedule = await db.select().from(scheduleSettings).where(eq(scheduleSettings.id, scheduleId)).limit(1);
      if (latestSchedule.length === 0 || !latestSchedule[0].enabled) {
        console.log(`[Scheduler] Schedule ${scheduleId} is disabled or not found, skipping`);
        return;
      }
      
      const currentSetting = latestSchedule[0];
      const executeHour = currentSetting.executeHour ?? 9;
      
      // ローカル時間での現在時刻を取得
      const nowLocal = new Date(now);
      const currentHour = nowLocal.getHours();
      const currentMinute = nowLocal.getMinutes();
      
      // nextRunAtをローカル時間として解釈（UTCで保存されているが、ローカル時間として扱う）
      let nextRunAtLocal: Date | null = null;
      if (currentSetting.nextRunAt) {
        nextRunAtLocal = new Date(currentSetting.nextRunAt);
        // UTCで保存されているnextRunAtをローカル時間として扱う
        // （データベースから取得した時点で既にローカル時間に変換されている）
      }
      
      const nextRunAtLocalStr = nextRunAtLocal 
        ? `${nextRunAtLocal.getFullYear()}-${String(nextRunAtLocal.getMonth() + 1).padStart(2, '0')}-${String(nextRunAtLocal.getDate()).padStart(2, '0')} ${String(nextRunAtLocal.getHours()).padStart(2, '0')}:${String(nextRunAtLocal.getMinutes()).padStart(2, '0')}:${String(nextRunAtLocal.getSeconds()).padStart(2, '0')} (local)`
        : 'null';
      console.log(`[Scheduler] Checking schedule ${scheduleId}: nextRunAt=${nextRunAtLocalStr}, executeHour=${executeHour}, currentHour=${currentHour}:${currentMinute.toString().padStart(2, '0')} (local time)`);
      
      // nextRunAtを確認して、実行すべきかどうかを判定
      if (nextRunAtLocal) {
        const timeDiff = nextRunAtLocal.getTime() - nowLocal.getTime();
        const minutesDiff = Math.floor(timeDiff / 1000 / 60);
        console.log(`[Scheduler] Time difference: ${timeDiff}ms (${minutesDiff} minutes)`);
        
        // nextRunAtがまだ来ていない場合はスキップ
        if (nextRunAtLocal.getTime() > nowLocal.getTime()) {
          console.log(`[Scheduler] nextRunAt is in the future (${minutesDiff} minutes later), skipping`);
          return;
        }
        
        // nextRunAtが過ぎている場合は実行
        // ただし、実行時刻（executeHour）と一致する場合のみ実行（毎時0分にチェックしているため）
        if (nextRunAtLocal.getTime() <= nowLocal.getTime()) {
          // 実行時刻と一致する場合のみ実行
          if (currentHour === executeHour && currentMinute === 0) {
            console.log(`[Scheduler] nextRunAt reached for schedule ${scheduleId}: ${nextRunAtLocal.toISOString()} (current: ${nowLocal.toISOString()})`);
            // 実行を続ける
          } else {
            // 実行時刻が一致しない場合は、次の実行時刻に更新してスキップ
            const nextRunAt = new Date(nowLocal);
            nextRunAt.setHours(executeHour, 0, 0, 0);
            if (nextRunAt.getTime() <= nowLocal.getTime()) {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
            }
            await db.update(scheduleSettings)
              .set({ nextRunAt })
              .where(eq(scheduleSettings.id, scheduleId));
            console.log(`[Scheduler] nextRunAt is in the past (${Math.abs(minutesDiff)} minutes ago), but execution hour doesn't match (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}). Updated to next execution time: ${nextRunAt.toISOString()}`);
            return;
          }
        }
      } else {
        // nextRunAtが設定されていない場合は、実行時刻と一致する場合のみ実行
        if (currentHour !== executeHour || currentMinute !== 0) {
          console.log(`[Scheduler] nextRunAt not set and execution hour doesn't match (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}), skipping`);
          return;
        }
        console.log(`[Scheduler] nextRunAt not set, but execution time matches (hour: ${currentHour}, executeHour: ${executeHour})`);
      }
      
      // 最終実行日時を確認
      const lastRunAt = currentSetting.lastRunAt ? new Date(currentSetting.lastRunAt) : null;
      
      // 間隔が経過しているかチェック（nextRunAtが設定されている場合はスキップ）
      if (lastRunAt && !currentSetting.nextRunAt) {
        const daysSinceLastRun = Math.floor((nowLocal.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastRun < currentSetting.intervalDays) {
          console.log(`[Scheduler] Schedule ${scheduleId} not due yet (${daysSinceLastRun} days since last run, need ${currentSetting.intervalDays} days)`);
          
          // 次回実行予定日時を更新
          const nextRunAt = new Date(lastRunAt);
          nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
          nextRunAt.setHours(executeHour, 0, 0, 0);
          await db.update(scheduleSettings)
            .set({ nextRunAt })
            .where(eq(scheduleSettings.id, scheduleId));
          return;
        }
      }
      
      // 既に実行中の場合はスキップ（重複実行を防ぐ）
      if (runningSchedules.has(scheduleId)) {
        console.log(`[Scheduler] Schedule ${scheduleId} is already running, skipping duplicate execution`);
        return;
      }
      
      // nextRunAtが過ぎている場合は、即座に次回実行予定日時を更新して、重複実行を防ぐ
      if (nextRunAtLocal && nextRunAtLocal.getTime() <= nowLocal.getTime()) {
        const nextRunAt = new Date(nowLocal);
        nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
        nextRunAt.setHours(executeHour, 0, 0, 0);
        await db.update(scheduleSettings)
          .set({ nextRunAt })
          .where(eq(scheduleSettings.id, scheduleId));
        console.log(`[Scheduler] Updated nextRunAt to ${nextRunAt.toISOString()} to prevent duplicate execution`);
      }
      
      // 実行中フラグを設定
      runningSchedules.add(scheduleId);
      
      try {
        console.log(`[Scheduler] Running schedule ${scheduleId} for user ${currentSetting.userId} at ${nowLocal.toISOString()} (nextRunAt: ${nextRunAtLocal ? nextRunAtLocal.toISOString() : 'not set'})`);
        
        // ユーザーの全LPを取得
        const allLandingPages = await getLandingPagesByUserId(currentSetting.userId);
        
        // 除外LPをフィルタリング
        let targetLandingPages = allLandingPages;
        if (currentSetting.excludedLandingPageIds) {
          try {
            const excludedIds = JSON.parse(currentSetting.excludedLandingPageIds) as number[];
            targetLandingPages = allLandingPages.filter(landingPage => !excludedIds.includes(landingPage.id));
          } catch (error) {
            console.error(`[Scheduler] Failed to parse excluded LP IDs for schedule ${scheduleId}:`, error);
            // パースに失敗した場合は全LPを対象とする
          }
        }
        
        if (targetLandingPages.length === 0) {
          console.log(`[Scheduler] No LPs to monitor for user ${currentSetting.userId} (${allLandingPages.length} total, ${allLandingPages.length - targetLandingPages.length} excluded)`);
          // 次回実行予定日時を更新
          const nextRunAt = new Date(nowLocal);
          nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
          nextRunAt.setHours(executeHour, 0, 0, 0);
          await db.update(scheduleSettings)
            .set({ 
              lastRunAt: nowLocal,
              nextRunAt
            })
            .where(eq(scheduleSettings.id, scheduleId));
          return;
        }
        
        console.log(`[Scheduler] Running scheduled monitoring for user ${currentSetting.userId} (${targetLandingPages.length} LP(s), ${allLandingPages.length - targetLandingPages.length} excluded)`);
        
        // 対象LPに対して監視を実行（並列実行、ただし重複実行を防ぐ）
        const monitoringPromises = targetLandingPages.map(landingPage => {
          // LP単位での重複実行を防ぐ
          if (runningLps.has(landingPage.id)) {
            console.log(`[Scheduler] LP ${landingPage.id} is already being monitored, skipping duplicate`);
            return Promise.resolve(null);
          }
          
          // 実行中フラグを設定
          runningLps.add(landingPage.id);
          
          return monitorLandingPage(landingPage.id)
            .then(result => {
              runningLps.delete(landingPage.id);
              return result;
            })
            .catch(error => {
              runningLps.delete(landingPage.id);
              console.error(`[Scheduler] Error monitoring LP ${landingPage.id}:`, error);
              return null;
            });
        });
        
        await Promise.all(monitoringPromises);
        
        // 次回実行予定日時を更新
        const nextRunAt = new Date(nowLocal);
        nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
        nextRunAt.setHours(executeHour, 0, 0, 0);
        
        // Update last run time
        await db.update(scheduleSettings)
          .set({ 
            lastRunAt: nowLocal,
            nextRunAt
          })
          .where(eq(scheduleSettings.id, scheduleId));
          
        console.log(`[Scheduler] Completed scheduled monitoring for user ${currentSetting.userId} (${targetLandingPages.length} LP(s))`);
      } finally {
        // 実行中フラグを解除
        runningSchedules.delete(scheduleId);
      }
    } catch (error) {
      console.error(`[Scheduler] Error running scheduled task for schedule ${scheduleId}:`, error);
      // エラー時も実行中フラグを解除
      runningSchedules.delete(scheduleId);
    }
  });
  
  // 既存のタスクが存在する場合は確実に停止
  const existingTask = scheduledTasks.get(scheduleId);
  if (existingTask) {
    try {
      existingTask.stop();
      existingTask.destroy?.();
      console.log(`[Scheduler] Stopped existing task for schedule ${scheduleId} before starting new one`);
    } catch (error) {
      console.error(`[Scheduler] Error stopping existing task for schedule ${scheduleId}:`, error);
    }
  }
  
  scheduledTasks.set(scheduleId, task);
  
  // タスクを開始
  task.start();
  
  console.log(`[Scheduler] Started schedule ${scheduleId} for user ${setting.userId} (interval: ${setting.intervalDays} days, check time: ${SCHEDULE_CHECK_TIME})`);
  console.log(`[Scheduler] Total active schedules: ${scheduledTasks.size}`);
}

export function stopSchedule(scheduleId: number) {
  const task = scheduledTasks.get(scheduleId);
  if (task) {
    try {
      task.stop();
      task.destroy?.(); // タスクを完全に破棄
    } catch (error) {
      console.error(`[Scheduler] Error stopping schedule ${scheduleId}:`, error);
    }
    scheduledTasks.delete(scheduleId);
    console.log(`[Scheduler] Stopped schedule ${scheduleId}`);
  }
}

export async function startCreativeSchedule(scheduleId: number) {
  const db = await getDb();
  if (!db) return;
  
  // Stop existing task if any
  stopCreativeSchedule(scheduleId);
  
  // データベースから最新の設定を再取得（更新後の設定を反映）
  const latestSchedule = await db.select().from(creativeScheduleSettings).where(eq(creativeScheduleSettings.id, scheduleId)).limit(1);
  if (latestSchedule.length === 0 || !latestSchedule[0].enabled) return;
  
  const setting = latestSchedule[0];
  
  // 次回実行予定日時を設定（まだ設定されていない場合）
  if (!setting.nextRunAt) {
    const now = new Date();
    let nextRunAt: Date;
    
    // 最終実行日を確認
    const lastRunAt = setting.lastRunAt ? new Date(setting.lastRunAt) : null;
    
    const executeHour = setting.executeHour ?? 9;
    
    if (!lastRunAt) {
      // 一度も実行されていない場合
      nextRunAt = new Date(now);
      nextRunAt.setHours(executeHour, 0, 0, 0);
      // 実行時刻が既に過ぎている場合は明日に設定
      if (nextRunAt.getTime() <= now.getTime()) {
        nextRunAt.setDate(nextRunAt.getDate() + 1);
      }
    } else {
      // 最終実行日から監視間隔を計算
      const daysSinceLastRun = Math.floor((now.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastRun >= setting.intervalDays) {
        // 監視間隔以上経過している場合は、次回実行を詰める
        nextRunAt = new Date(now);
        nextRunAt.setHours(executeHour, 0, 0, 0);
        // 実行時刻が既に過ぎている場合は明日に設定
        if (nextRunAt.getTime() <= now.getTime()) {
          nextRunAt.setDate(nextRunAt.getDate() + 1);
        }
      } else {
        // まだ間隔が経過していない場合は、最終実行日 + 間隔日数後の指定時刻に設定
        nextRunAt = new Date(lastRunAt);
        nextRunAt.setDate(nextRunAt.getDate() + setting.intervalDays);
        nextRunAt.setHours(executeHour, 0, 0, 0);
      }
    }
    
    await db.update(creativeScheduleSettings)
      .set({ nextRunAt })
      .where(eq(creativeScheduleSettings.id, scheduleId));
    
    console.log(`[Scheduler] Set initial nextRunAt for creative schedule ${scheduleId}: ${nextRunAt.toISOString()}`);
    
    // 設定を更新
    setting.nextRunAt = nextRunAt;
  }
  
  // 毎時0分にチェックし、指定時刻で間隔が経過していれば実行
  const task = cron.schedule(SCHEDULE_CHECK_TIME, async () => {
    try {
      const now = new Date();
      console.log(`[Scheduler] Hourly check triggered at ${now.toISOString()} for creative schedule ${scheduleId}`);
      
      // データベースから最新のスケジュール設定を取得
      const latestSchedule = await db.select().from(creativeScheduleSettings).where(eq(creativeScheduleSettings.id, scheduleId)).limit(1);
      if (latestSchedule.length === 0 || !latestSchedule[0].enabled) {
        console.log(`[Scheduler] Creative schedule ${scheduleId} is disabled or not found, skipping`);
        return;
      }
      
      const currentSetting = latestSchedule[0];
      const executeHour = currentSetting.executeHour ?? 9;
      
      // ローカル時間での現在時刻を取得
      const nowLocal = new Date(now);
      const currentHour = nowLocal.getHours();
      const currentMinute = nowLocal.getMinutes();
      
      // nextRunAtをローカル時間として解釈
      let nextRunAtLocal: Date | null = null;
      if (currentSetting.nextRunAt) {
        nextRunAtLocal = new Date(currentSetting.nextRunAt);
      }
      
      const nextRunAtLocalStr = nextRunAtLocal 
        ? `${nextRunAtLocal.getFullYear()}-${String(nextRunAtLocal.getMonth() + 1).padStart(2, '0')}-${String(nextRunAtLocal.getDate()).padStart(2, '0')} ${String(nextRunAtLocal.getHours()).padStart(2, '0')}:${String(nextRunAtLocal.getMinutes()).padStart(2, '0')}:${String(nextRunAtLocal.getSeconds()).padStart(2, '0')} (local)`
        : 'null';
      console.log(`[Scheduler] Checking creative schedule ${scheduleId}: nextRunAt=${nextRunAtLocalStr}, executeHour=${executeHour}, currentHour=${currentHour}:${currentMinute.toString().padStart(2, '0')} (local time)`);
      
      // nextRunAtを確認して、実行すべきかどうかを判定
      if (nextRunAtLocal) {
        const timeDiff = nextRunAtLocal.getTime() - nowLocal.getTime();
        const minutesDiff = Math.floor(timeDiff / 1000 / 60);
        console.log(`[Scheduler] Time difference: ${timeDiff}ms (${minutesDiff} minutes)`);
        
        // nextRunAtがまだ来ていない場合はスキップ
        if (nextRunAtLocal.getTime() > nowLocal.getTime()) {
          console.log(`[Scheduler] nextRunAt is in the future (${minutesDiff} minutes later), skipping`);
          return;
        }
        
        // nextRunAtが過ぎている場合は実行
        if (nextRunAtLocal.getTime() <= nowLocal.getTime()) {
          // 実行時刻と一致する場合のみ実行
          if (currentHour === executeHour && currentMinute === 0) {
            console.log(`[Scheduler] nextRunAt reached for creative schedule ${scheduleId}: ${nextRunAtLocal.toISOString()} (current: ${nowLocal.toISOString()})`);
            // 実行を続ける
          } else {
            // 実行時刻が一致しない場合は、次の実行時刻に更新してスキップ
            const nextRunAt = new Date(nowLocal);
            nextRunAt.setHours(executeHour, 0, 0, 0);
            if (nextRunAt.getTime() <= nowLocal.getTime()) {
              nextRunAt.setDate(nextRunAt.getDate() + 1);
            }
            await db.update(creativeScheduleSettings)
              .set({ nextRunAt })
              .where(eq(creativeScheduleSettings.id, scheduleId));
            console.log(`[Scheduler] nextRunAt is in the past (${Math.abs(minutesDiff)} minutes ago), but execution hour doesn't match (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}). Updated to next execution time: ${nextRunAt.toISOString()}`);
            return;
          }
        }
      } else {
        // nextRunAtが設定されていない場合は、実行時刻と一致する場合のみ実行
        if (currentHour !== executeHour || currentMinute !== 0) {
          console.log(`[Scheduler] nextRunAt not set and execution hour doesn't match (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}), skipping`);
          return;
        }
        console.log(`[Scheduler] nextRunAt not set, but execution time matches (hour: ${currentHour}, executeHour: ${executeHour})`);
      }
      
      // 最終実行日時を確認
      const lastRunAt = currentSetting.lastRunAt ? new Date(currentSetting.lastRunAt) : null;
      
      // 間隔が経過しているかチェック
      if (lastRunAt && !currentSetting.nextRunAt) {
        const daysSinceLastRun = Math.floor((nowLocal.getTime() - lastRunAt.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastRun < currentSetting.intervalDays) {
          console.log(`[Scheduler] Creative schedule ${scheduleId} not due yet (${daysSinceLastRun} days since last run, need ${currentSetting.intervalDays} days)`);
          
          // 次回実行予定日時を更新
          const nextRunAt = new Date(lastRunAt);
          nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
          nextRunAt.setHours(executeHour, 0, 0, 0);
          await db.update(creativeScheduleSettings)
            .set({ nextRunAt })
            .where(eq(creativeScheduleSettings.id, scheduleId));
          return;
        }
      }
      
      // 既に実行中の場合はスキップ
      if (runningCreativeSchedules.has(scheduleId)) {
        console.log(`[Scheduler] Creative schedule ${scheduleId} is already running, skipping duplicate execution`);
        return;
      }
      
      // nextRunAtが過ぎている場合は、即座に次回実行予定日時を更新して、重複実行を防ぐ
      if (nextRunAtLocal && nextRunAtLocal.getTime() <= nowLocal.getTime()) {
        const nextRunAt = new Date(nowLocal);
        nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
        nextRunAt.setHours(executeHour, 0, 0, 0);
        await db.update(creativeScheduleSettings)
          .set({ nextRunAt })
          .where(eq(creativeScheduleSettings.id, scheduleId));
        console.log(`[Scheduler] Updated nextRunAt to ${nextRunAt.toISOString()} to prevent duplicate execution`);
      }
      
      // 実行中フラグを設定
      runningCreativeSchedules.add(scheduleId);
      
      try {
        console.log(`[Scheduler] Running creative schedule ${scheduleId} for user ${currentSetting.userId} at ${nowLocal.toISOString()} (nextRunAt: ${nextRunAtLocal ? nextRunAtLocal.toISOString() : 'not set'})`);
        
        // ユーザーの全クリエイティブを取得
        const allCreatives = await getCreativesByUserId(currentSetting.userId);
        
        // 除外クリエイティブをフィルタリング
        let targetCreatives = allCreatives;
        if (currentSetting.excludedCreativeIds) {
          try {
            const excludedIds = JSON.parse(currentSetting.excludedCreativeIds) as number[];
            targetCreatives = allCreatives.filter(creative => !excludedIds.includes(creative.id));
          } catch (error) {
            console.error(`[Scheduler] Failed to parse excluded creative IDs for schedule ${scheduleId}:`, error);
          }
        }
        
        if (targetCreatives.length === 0) {
          console.log(`[Scheduler] No creatives to monitor for user ${currentSetting.userId} (${allCreatives.length} total, ${allCreatives.length - targetCreatives.length} excluded)`);
          // 次回実行予定日時を更新
          const nextRunAt = new Date(nowLocal);
          nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
          nextRunAt.setHours(executeHour, 0, 0, 0);
          await db.update(creativeScheduleSettings)
            .set({ 
              lastRunAt: nowLocal,
              nextRunAt
            })
            .where(eq(creativeScheduleSettings.id, scheduleId));
          return;
        }
        
        console.log(`[Scheduler] Running scheduled monitoring for user ${currentSetting.userId} (${targetCreatives.length} creative(s), ${allCreatives.length - targetCreatives.length} excluded)`);
        
        // 対象クリエイティブに対して監視を実行
        const monitoringPromises = targetCreatives.map(creative => {
          if (runningCreatives.has(creative.id)) {
            console.log(`[Scheduler] Creative ${creative.id} is already being monitored, skipping duplicate`);
            return Promise.resolve(null);
          }
          
          runningCreatives.add(creative.id);
          
          return monitorCreative(creative.id)
            .then(result => {
              runningCreatives.delete(creative.id);
              return result;
            })
            .catch(error => {
              runningCreatives.delete(creative.id);
              console.error(`[Scheduler] Error monitoring creative ${creative.id}:`, error);
              return null;
            });
        });
        
        await Promise.all(monitoringPromises);
        
        // 次回実行予定日時を更新
        const nextRunAt = new Date(nowLocal);
        nextRunAt.setDate(nextRunAt.getDate() + currentSetting.intervalDays);
        nextRunAt.setHours(executeHour, 0, 0, 0);
        
        // Update last run time
        await db.update(creativeScheduleSettings)
          .set({ 
            lastRunAt: nowLocal,
            nextRunAt
          })
          .where(eq(creativeScheduleSettings.id, scheduleId));
          
        console.log(`[Scheduler] Completed scheduled monitoring for user ${currentSetting.userId} (${targetCreatives.length} creative(s))`);
      } finally {
        // 実行中フラグを解除
        runningCreativeSchedules.delete(scheduleId);
      }
    } catch (error) {
      console.error(`[Scheduler] Error running scheduled task for creative schedule ${scheduleId}:`, error);
      runningCreativeSchedules.delete(scheduleId);
    }
  });
  
  // 既存のタスクが存在する場合は確実に停止
  const existingTask = creativeScheduledTasks.get(scheduleId);
  if (existingTask) {
    try {
      existingTask.stop();
      existingTask.destroy?.();
      console.log(`[Scheduler] Stopped existing task for creative schedule ${scheduleId} before starting new one`);
    } catch (error) {
      console.error(`[Scheduler] Error stopping existing task for creative schedule ${scheduleId}:`, error);
    }
  }
  
  creativeScheduledTasks.set(scheduleId, task);
  
  // タスクを開始
  task.start();
  
  console.log(`[Scheduler] Started creative schedule ${scheduleId} for user ${setting.userId} (interval: ${setting.intervalDays} days, check time: ${SCHEDULE_CHECK_TIME})`);
  console.log(`[Scheduler] Total active creative schedules: ${creativeScheduledTasks.size}`);
}

export function stopCreativeSchedule(scheduleId: number) {
  const task = creativeScheduledTasks.get(scheduleId);
  if (task) {
    try {
      task.stop();
      task.destroy?.(); // タスクを完全に破棄
    } catch (error) {
      console.error(`[Scheduler] Error stopping creative schedule ${scheduleId}:`, error);
    }
    creativeScheduledTasks.delete(scheduleId);
    console.log(`[Scheduler] Stopped creative schedule ${scheduleId}`);
  }
}

export async function stopAllSchedules() {
  scheduledTasks.forEach((task) => {
    task.stop();
  });
  scheduledTasks.clear();
  creativeScheduledTasks.forEach((task) => {
    task.stop();
  });
  creativeScheduledTasks.clear();
  console.log('[Scheduler] Stopped all schedules');
}

/**
 * タイムゾーンを考慮してローカル時間を取得する
 */
function getLocalTime(timezone: string = 'Asia/Tokyo'): Date {
  // タイムゾーン値を検証（不正な値の場合はデフォルト値を使用）
  let validTimezone = timezone || 'Asia/Tokyo';
  // 先頭にコロンがある場合や空文字の場合、デフォルト値を使用
  if (!validTimezone || validTimezone.startsWith(':') || validTimezone.trim() === '') {
    console.warn(`[Scheduler] Invalid timezone "${timezone}", using default "Asia/Tokyo"`);
    validTimezone = 'Asia/Tokyo';
  }
  
  const now = new Date();
  // タイムゾーンを考慮してローカル時間を取得
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: validTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const localDate = new Date(
    parseInt(parts.find(p => p.type === 'year')!.value),
    parseInt(parts.find(p => p.type === 'month')!.value) - 1,
    parseInt(parts.find(p => p.type === 'day')!.value),
    parseInt(parts.find(p => p.type === 'hour')!.value),
    parseInt(parts.find(p => p.type === 'minute')!.value),
    parseInt(parts.find(p => p.type === 'second')!.value)
  );
  
  return localDate;
}

/**
 * Vercel Cron Jobs用: すべての有効なスケジュールをチェックして実行すべきものを実行する
 * この関数はnode-cronに依存せず、外部から呼び出されることを想定している
 * Vercel CronはUTC時間で実行されるため、タイムゾーンを考慮してローカル時間に変換する
 */
export async function checkAndRunSchedules() {
  console.log('[Scheduler] Checking schedules for execution (Vercel Cron)...');
  
  const db = await getDb();
  if (!db) {
    console.warn('[Scheduler] Database not available');
    return { checked: 0, executed: 0 };
  }
  
  // タイムゾーン設定（環境変数から取得、デフォルトはAsia/Tokyo）
  // process.env.TZが不正な値（例：:UTC）の場合、デフォルト値を使用
  let timezone = process.env.TZ || 'Asia/Tokyo';
  if (!timezone || timezone.startsWith(':') || timezone.trim() === '') {
    console.warn(`[Scheduler] Invalid TZ environment variable "${process.env.TZ}", using default "Asia/Tokyo"`);
    timezone = 'Asia/Tokyo';
  }
  const nowUTC = new Date();
  const nowLocal = getLocalTime(timezone);
  const currentHour = nowLocal.getHours();
  const currentMinute = nowLocal.getMinutes();
  
  console.log(`[Scheduler] UTC time: ${nowUTC.toISOString()}, Local time (${timezone}): ${nowLocal.toISOString()}, Current hour: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`);
  
  // すべての有効なスケジュールを取得
  const schedules = await db.select().from(scheduleSettings).where(eq(scheduleSettings.enabled, true));
  
  console.log(`[Scheduler] Found ${schedules.length} enabled schedule(s)`);
  
  let executedCount = 0;
  
  for (const schedule of schedules) {
    const scheduleId = schedule.id;
    const executeHour = schedule.executeHour ?? 9;
    
    // nextRunAtをローカル時間として解釈
    // データベースにはUTC時間で保存されているが、ローカル時間として扱う
    let nextRunAtLocal: Date | null = null;
    if (schedule.nextRunAt) {
      const nextRunAtUTC = new Date(schedule.nextRunAt);
      // UTC時間を指定されたタイムゾーンのローカル時間に変換
      // nextRunAtは本来ローカル時間で設定されているため、UTCとして保存されているものをローカル時間として解釈
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(nextRunAtUTC);
      nextRunAtLocal = new Date(
        parseInt(parts.find(p => p.type === 'year')!.value),
        parseInt(parts.find(p => p.type === 'month')!.value) - 1,
        parseInt(parts.find(p => p.type === 'day')!.value),
        parseInt(parts.find(p => p.type === 'hour')!.value),
        parseInt(parts.find(p => p.type === 'minute')!.value),
        parseInt(parts.find(p => p.type === 'second')!.value)
      );
    }
    
    // nextRunAtが設定されている場合、まだ来ていない場合はスキップ
    if (nextRunAtLocal && nextRunAtLocal.getTime() > nowLocal.getTime()) {
      const timeDiff = nextRunAtLocal.getTime() - nowLocal.getTime();
      const minutesDiff = Math.floor(timeDiff / 1000 / 60);
      console.log(`[Scheduler] Schedule ${scheduleId}: nextRunAt is in the future (${minutesDiff} minutes later), skipping`);
      continue;
    }
    
    // nextRunAtが設定されていない場合、実行時刻が一致しない場合はスキップ
    // 実行時刻が一致しなくても、nextRunAtが過ぎている場合は実行する（Cronジョブの実行遅延を考慮）
    if (!nextRunAtLocal && (currentHour !== executeHour || currentMinute > 5)) {
      console.log(`[Scheduler] Schedule ${scheduleId}: execution hour doesn't match (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}), skipping`);
      continue;
    }
    
    // nextRunAtが設定されているが、実行時刻が大きく外れている場合（±1時間以上）はスキップ
    if (nextRunAtLocal) {
      const hourDiff = Math.abs(currentHour - executeHour);
      if (hourDiff > 1 && hourDiff < 23) {
        console.log(`[Scheduler] Schedule ${scheduleId}: execution hour is too far from executeHour (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}), skipping`);
        continue;
      }
    }
    
    // 既に実行中の場合はスキップ
    if (runningSchedules.has(scheduleId)) {
      console.log(`[Scheduler] Schedule ${scheduleId} is already running, skipping duplicate execution`);
      continue;
    }
    
    // nextRunAtが過ぎている場合は、即座に次回実行予定日時を更新して、重複実行を防ぐ
    if (nextRunAtLocal && nextRunAtLocal.getTime() <= nowLocal.getTime()) {
      const nextRunAtLocalCalc = new Date(nowLocal);
      nextRunAtLocalCalc.setDate(nextRunAtLocalCalc.getDate() + schedule.intervalDays);
      nextRunAtLocalCalc.setHours(executeHour, 0, 0, 0);
      // ローカル時間をUTC時間に変換して保存
      const nextRunAt = new Date(nextRunAtLocalCalc.getTime());
      await db.update(scheduleSettings)
        .set({ nextRunAt })
        .where(eq(scheduleSettings.id, scheduleId));
      console.log(`[Scheduler] Updated nextRunAt to ${nextRunAt.toISOString()} (local: ${nextRunAtLocalCalc.toISOString()}) to prevent duplicate execution`);
    }
    
    // 実行中フラグを設定
    runningSchedules.add(scheduleId);
    
    try {
      console.log(`[Scheduler] Running schedule ${scheduleId} for user ${schedule.userId} at ${nowLocal.toISOString()}`);
      
      // ユーザーの全LPを取得
      const allLandingPages = await getLandingPagesByUserId(schedule.userId);
      
      // 除外LPをフィルタリング
      let targetLandingPages = allLandingPages;
      if (schedule.excludedLandingPageIds) {
        try {
          const excludedIds = JSON.parse(schedule.excludedLandingPageIds) as number[];
          targetLandingPages = allLandingPages.filter(landingPage => !excludedIds.includes(landingPage.id));
        } catch (error) {
          console.error(`[Scheduler] Failed to parse excluded LP IDs for schedule ${scheduleId}:`, error);
        }
      }
      
      if (targetLandingPages.length === 0) {
        console.log(`[Scheduler] No LPs to monitor for user ${schedule.userId}`);
        // 次回実行予定日時を更新（ローカル時間で計算してからUTCに変換）
        const nextRunAtLocalCalc = new Date(nowLocal);
        nextRunAtLocalCalc.setDate(nextRunAtLocalCalc.getDate() + schedule.intervalDays);
        nextRunAtLocalCalc.setHours(executeHour, 0, 0, 0);
        // ローカル時間をUTC時間に変換して保存
        const nextRunAt = new Date(nextRunAtLocalCalc.getTime());
        await db.update(scheduleSettings)
          .set({ 
            lastRunAt: nowLocal,
            nextRunAt
          })
          .where(eq(scheduleSettings.id, scheduleId));
        continue;
      }
      
      console.log(`[Scheduler] Running scheduled monitoring for user ${schedule.userId} (${targetLandingPages.length} LP(s))`);
      
      // 対象LPに対して監視を実行（並列実行、ただし重複実行を防ぐ）
      const monitoringPromises = targetLandingPages.map(landingPage => {
        // LP単位での重複実行を防ぐ
        if (runningLps.has(landingPage.id)) {
          console.log(`[Scheduler] LP ${landingPage.id} is already being monitored, skipping duplicate`);
          return Promise.resolve(null);
        }
        
        // 実行中フラグを設定
        runningLps.add(landingPage.id);
        
        return monitorLandingPage(landingPage.id)
          .then(result => {
            runningLps.delete(landingPage.id);
            return result;
          })
          .catch(error => {
            runningLps.delete(landingPage.id);
            console.error(`[Scheduler] Error monitoring LP ${landingPage.id}:`, error);
            return null;
          });
      });
      
      await Promise.all(monitoringPromises);
      
      // 次回実行予定日時を更新（ローカル時間で計算してからUTCに変換）
      const nextRunAtLocal = new Date(nowLocal);
      nextRunAtLocal.setDate(nextRunAtLocal.getDate() + schedule.intervalDays);
      nextRunAtLocal.setHours(executeHour, 0, 0, 0);
      // ローカル時間をUTC時間に変換して保存
      const nextRunAt = new Date(nextRunAtLocal.getTime());
      
      // Update last run time
      await db.update(scheduleSettings)
        .set({ 
          lastRunAt: nowLocal,
          nextRunAt
        })
        .where(eq(scheduleSettings.id, scheduleId));
        
      console.log(`[Scheduler] Completed scheduled monitoring for user ${schedule.userId} (${targetLandingPages.length} LP(s))`);
      executedCount++;
    } catch (error) {
      console.error(`[Scheduler] Error running scheduled task for schedule ${scheduleId}:`, error);
    } finally {
      // 実行中フラグを解除
      runningSchedules.delete(scheduleId);
    }
  }
  
  // クリエイティブスケジュールもチェック
  const creativeSchedules = await db.select().from(creativeScheduleSettings).where(eq(creativeScheduleSettings.enabled, true));
  
  console.log(`[Scheduler] Found ${creativeSchedules.length} enabled creative schedule(s)`);
  
  let executedCreativeCount = 0;
  
  for (const schedule of creativeSchedules) {
    const scheduleId = schedule.id;
    const executeHour = schedule.executeHour ?? 9;
    
    // nextRunAtをローカル時間として解釈
    // データベースにはUTC時間で保存されているが、ローカル時間として扱う
    let nextRunAtLocal: Date | null = null;
    if (schedule.nextRunAt) {
      const nextRunAtUTC = new Date(schedule.nextRunAt);
      // UTC時間を指定されたタイムゾーンのローカル時間に変換
      // nextRunAtは本来ローカル時間で設定されているため、UTCとして保存されているものをローカル時間として解釈
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(nextRunAtUTC);
      nextRunAtLocal = new Date(
        parseInt(parts.find(p => p.type === 'year')!.value),
        parseInt(parts.find(p => p.type === 'month')!.value) - 1,
        parseInt(parts.find(p => p.type === 'day')!.value),
        parseInt(parts.find(p => p.type === 'hour')!.value),
        parseInt(parts.find(p => p.type === 'minute')!.value),
        parseInt(parts.find(p => p.type === 'second')!.value)
      );
    }
    
    // nextRunAtが設定されている場合、まだ来ていない場合はスキップ
    if (nextRunAtLocal && nextRunAtLocal.getTime() > nowLocal.getTime()) {
      const timeDiff = nextRunAtLocal.getTime() - nowLocal.getTime();
      const minutesDiff = Math.floor(timeDiff / 1000 / 60);
      console.log(`[Scheduler] Creative schedule ${scheduleId}: nextRunAt is in the future (${minutesDiff} minutes later), skipping`);
      continue;
    }
    
    // nextRunAtが設定されていない場合、実行時刻が一致しない場合はスキップ
    // 実行時刻が一致しなくても、nextRunAtが過ぎている場合は実行する（Cronジョブの実行遅延を考慮）
    if (!nextRunAtLocal && (currentHour !== executeHour || currentMinute > 5)) {
      console.log(`[Scheduler] Creative schedule ${scheduleId}: execution hour doesn't match (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}), skipping`);
      continue;
    }
    
    // nextRunAtが設定されているが、実行時刻が大きく外れている場合（±1時間以上）はスキップ
    if (nextRunAtLocal) {
      const hourDiff = Math.abs(currentHour - executeHour);
      if (hourDiff > 1 && hourDiff < 23) {
        console.log(`[Scheduler] Creative schedule ${scheduleId}: execution hour is too far from executeHour (current: ${currentHour}:${currentMinute.toString().padStart(2, '0')}, executeHour: ${executeHour}), skipping`);
        continue;
      }
    }
    
    // 既に実行中の場合はスキップ
    if (runningCreativeSchedules.has(scheduleId)) {
      console.log(`[Scheduler] Creative schedule ${scheduleId} is already running, skipping duplicate execution`);
      continue;
    }
    
    // nextRunAtが過ぎている場合は、即座に次回実行予定日時を更新して、重複実行を防ぐ
    if (nextRunAtLocal && nextRunAtLocal.getTime() <= nowLocal.getTime()) {
      const nextRunAtLocalCalc = new Date(nowLocal);
      nextRunAtLocalCalc.setDate(nextRunAtLocalCalc.getDate() + schedule.intervalDays);
      nextRunAtLocalCalc.setHours(executeHour, 0, 0, 0);
      // ローカル時間をUTC時間に変換して保存
      const nextRunAt = new Date(nextRunAtLocalCalc.getTime());
      await db.update(creativeScheduleSettings)
        .set({ nextRunAt })
        .where(eq(creativeScheduleSettings.id, scheduleId));
      console.log(`[Scheduler] Updated nextRunAt to ${nextRunAt.toISOString()} (local: ${nextRunAtLocalCalc.toISOString()}) to prevent duplicate execution`);
    }
    
    // 実行中フラグを設定
    runningCreativeSchedules.add(scheduleId);
    
    try {
      console.log(`[Scheduler] Running creative schedule ${scheduleId} for user ${schedule.userId} at ${nowLocal.toISOString()}`);
      
      // ユーザーの全クリエイティブを取得
      const allCreatives = await getCreativesByUserId(schedule.userId);
      
      // 除外クリエイティブをフィルタリング
      let targetCreatives = allCreatives;
      if (schedule.excludedCreativeIds) {
        try {
          const excludedIds = JSON.parse(schedule.excludedCreativeIds) as number[];
          targetCreatives = allCreatives.filter(creative => !excludedIds.includes(creative.id));
        } catch (error) {
          console.error(`[Scheduler] Failed to parse excluded creative IDs for schedule ${scheduleId}:`, error);
        }
      }
      
      if (targetCreatives.length === 0) {
        console.log(`[Scheduler] No creatives to monitor for user ${schedule.userId}`);
        // 次回実行予定日時を更新（ローカル時間で計算してからUTCに変換）
        const nextRunAtLocalCalc = new Date(nowLocal);
        nextRunAtLocalCalc.setDate(nextRunAtLocalCalc.getDate() + schedule.intervalDays);
        nextRunAtLocalCalc.setHours(executeHour, 0, 0, 0);
        // ローカル時間をUTC時間に変換して保存
        const nextRunAt = new Date(nextRunAtLocalCalc.getTime());
        await db.update(creativeScheduleSettings)
          .set({ 
            lastRunAt: nowLocal,
            nextRunAt
          })
          .where(eq(creativeScheduleSettings.id, scheduleId));
        continue;
      }
      
      console.log(`[Scheduler] Running scheduled monitoring for user ${schedule.userId} (${targetCreatives.length} creative(s))`);
      
      // 対象クリエイティブに対して監視を実行（並列実行、ただし重複実行を防ぐ）
      const monitoringPromises = targetCreatives.map(creative => {
        // クリエイティブ単位での重複実行を防ぐ
        if (runningCreatives.has(creative.id)) {
          console.log(`[Scheduler] Creative ${creative.id} is already being monitored, skipping duplicate`);
          return Promise.resolve(null);
        }
        
        // 実行中フラグを設定
        runningCreatives.add(creative.id);
        
        return monitorCreative(creative.id)
          .then(result => {
            runningCreatives.delete(creative.id);
            return result;
          })
          .catch(error => {
            runningCreatives.delete(creative.id);
            console.error(`[Scheduler] Error monitoring creative ${creative.id}:`, error);
            return null;
          });
      });
      
      await Promise.all(monitoringPromises);
      
      // 次回実行予定日時を更新（ローカル時間で計算してからUTCに変換）
      const nextRunAtLocal = new Date(nowLocal);
      nextRunAtLocal.setDate(nextRunAtLocal.getDate() + schedule.intervalDays);
      nextRunAtLocal.setHours(executeHour, 0, 0, 0);
      // ローカル時間をUTC時間に変換して保存
      const nextRunAt = new Date(nextRunAtLocal.getTime());
      
      // Update last run time
      await db.update(creativeScheduleSettings)
        .set({ 
          lastRunAt: nowLocal,
          nextRunAt
        })
        .where(eq(creativeScheduleSettings.id, scheduleId));
        
      console.log(`[Scheduler] Completed scheduled monitoring for user ${schedule.userId} (${targetCreatives.length} creative(s))`);
      executedCreativeCount++;
    } catch (error) {
      console.error(`[Scheduler] Error running scheduled task for creative schedule ${scheduleId}:`, error);
    } finally {
      // 実行中フラグを解除
      runningCreativeSchedules.delete(scheduleId);
    }
  }
  
  console.log(`[Scheduler] Checked ${schedules.length} LP schedule(s), executed ${executedCount} LP schedule(s)`);
  console.log(`[Scheduler] Checked ${creativeSchedules.length} creative schedule(s), executed ${executedCreativeCount} creative schedule(s)`);
  return { checked: schedules.length + creativeSchedules.length, executed: executedCount + executedCreativeCount };
}

-- 完全なスケジュール設定テーブルのマイグレーションSQL
-- このSQLをSupabase DashboardのSQL Editorで実行してください

-- ステップ1: 新しいカラムを追加（既に存在する場合はスキップ）
ALTER TABLE schedule_settings 
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS excluded_landing_page_ids TEXT;

-- ステップ2: 既存データがある場合の移行（landing_page_idからuser_idを取得）
-- 注意: 既存のスケジュール設定がある場合のみ実行
UPDATE schedule_settings ss
SET user_id = (
  SELECT lp."userId"
  FROM landing_pages lp
  WHERE lp.id = ss.landing_page_id
  LIMIT 1
)
WHERE user_id IS NULL AND landing_page_id IS NOT NULL;

-- interval_daysの設定（既存のinterval_minutesから変換）
UPDATE schedule_settings ss
SET interval_days = CASE
  WHEN ss.interval_minutes IS NOT NULL THEN
    CASE
      WHEN ss.interval_minutes < 1440 THEN 1  -- 1日未満は1日に丸める
      ELSE CEIL(ss.interval_minutes::numeric / 1440)  -- 分を日に変換
    END
  ELSE 3  -- デフォルトは3日
END
WHERE interval_days IS NULL;

-- ステップ3: ユーザーごとに1つのスケジュールに統合（重複を削除）
-- 同じユーザーに複数のスケジュールがある場合、最初のもの（最小ID）を残し、他のものを削除
DELETE FROM schedule_settings ss1
WHERE ss1.id NOT IN (
  SELECT MIN(ss2.id)
  FROM schedule_settings ss2
  WHERE ss2.user_id IS NOT NULL
  GROUP BY ss2.user_id
)
AND ss1.user_id IS NOT NULL;

-- ステップ4: NOT NULL制約を追加
ALTER TABLE schedule_settings
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN interval_days SET NOT NULL;

-- ステップ5: UNIQUE制約を追加（ユーザーごとに1つ）
ALTER TABLE schedule_settings
  DROP CONSTRAINT IF EXISTS schedule_settings_user_id_unique;
ALTER TABLE schedule_settings
  ADD CONSTRAINT schedule_settings_user_id_unique UNIQUE (user_id);

-- ステップ6: 外部キー制約を追加
ALTER TABLE schedule_settings
  DROP CONSTRAINT IF EXISTS schedule_settings_user_id_fkey;
ALTER TABLE schedule_settings
  ADD CONSTRAINT schedule_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ステップ7: 古い列を削除（注意: 既存データが失われる可能性があります）
-- まず、データが重要でないことを確認してください
ALTER TABLE schedule_settings
  DROP COLUMN IF EXISTS landing_page_id,
  DROP COLUMN IF EXISTS schedule_type,
  DROP COLUMN IF EXISTS interval_minutes,
  DROP COLUMN IF EXISTS cron_expression;

-- ステップ8: インデックスを再作成
DROP INDEX IF EXISTS idx_schedule_settings_landingPageId;
CREATE INDEX IF NOT EXISTS idx_schedule_settings_user_id ON schedule_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_settings_enabled_next_run_at ON schedule_settings(enabled, next_run_at) 
WHERE enabled = true AND next_run_at IS NOT NULL;

-- 確認: テーブル構造を確認
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'schedule_settings'
ORDER BY ordinal_position;


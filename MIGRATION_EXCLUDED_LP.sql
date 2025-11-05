-- 除外LP機能のマイグレーションSQL
-- このSQLをSupabase DashboardのSQL Editorで実行してください

-- スケジュール設定テーブルに除外LP列を追加
ALTER TABLE schedule_settings 
  ADD COLUMN IF NOT EXISTS excluded_landing_page_ids TEXT;

-- 確認: 列が追加されたか確認
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schedule_settings' AND column_name = 'excluded_landing_page_ids';


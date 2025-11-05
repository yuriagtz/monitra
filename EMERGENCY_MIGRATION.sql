-- 緊急マイグレーション: plan列を追加
-- このSQLをSupabase DashboardのSQL Editorで実行してください

-- ステップ1: プランENUMを作成（既に存在する場合はスキップ）
DO $$ BEGIN
    CREATE TYPE plan AS ENUM ('free', 'light', 'pro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ステップ2: ユーザーテーブルにplan列を追加（既に存在する場合はスキップ）
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN plan plan NOT NULL DEFAULT 'free';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 確認: plan列が追加されたか確認
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'plan';


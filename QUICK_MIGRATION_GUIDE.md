# クイックマイグレーションガイド

## 問題

データベーススキーマとコードが一致していないため、アプリケーションが正常に動作しません。

## 必要なマイグレーション

1. **ユーザーテーブルに`plan`列を追加**
2. **スケジュール設定テーブルを変更**（`landingPageId` → `userId`、`intervalMinutes` → `intervalDays`）

## マイグレーション方法

### 方法1: Supabase Dashboardで直接SQLを実行（推奨）

1. Supabase Dashboardにログイン
2. 「SQL Editor」を開く
3. 以下のSQLを順番に実行

```sql
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

-- ステップ3: スケジュール設定テーブルに新しい列を追加
ALTER TABLE schedule_settings 
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS interval_days INTEGER;

-- ステップ4: 既存データの移行（既存のlandingPageIdからuserIdを取得）
UPDATE schedule_settings ss
SET user_id = (
  SELECT lp.user_id
  FROM landing_pages lp
  WHERE lp.id = ss.landing_page_id
  LIMIT 1
),
interval_days = CASE
  WHEN ss.interval_minutes IS NOT NULL THEN
    CASE
      WHEN ss.interval_minutes < 1440 THEN 1  -- 1日未満は1日に丸める
      ELSE CEIL(ss.interval_minutes::numeric / 1440)  -- 分を日に変換
    END
  ELSE 3  -- デフォルトは3日
END
WHERE user_id IS NULL;

-- ステップ5: ユーザーごとに1つのスケジュールに統合（重複を削除）
DELETE FROM schedule_settings ss1
WHERE ss1.id NOT IN (
  SELECT MIN(ss2.id)
  FROM schedule_settings ss2
  WHERE ss2.user_id IS NOT NULL
  GROUP BY ss2.user_id
);

-- ステップ6: 制約を追加
ALTER TABLE schedule_settings
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN interval_days SET NOT NULL;

-- UNIQUE制約を追加（ユーザーごとに1つ）
ALTER TABLE schedule_settings
  DROP CONSTRAINT IF EXISTS schedule_settings_user_id_unique;
ALTER TABLE schedule_settings
  ADD CONSTRAINT schedule_settings_user_id_unique UNIQUE (user_id);

-- 外部キー制約を追加
ALTER TABLE schedule_settings
  DROP CONSTRAINT IF EXISTS schedule_settings_user_id_fkey;
ALTER TABLE schedule_settings
  ADD CONSTRAINT schedule_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ステップ7: 古い列を削除（注意: 既存データが失われる可能性があります）
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
```

### 方法2: Drizzle Kitを使用（開発環境）

```bash
# マイグレーションファイルを生成
npx drizzle-kit generate

# マイグレーションを実行
npx drizzle-kit migrate
```

**注意**: 既存データがある場合は、方法1（手動SQL）を推奨します。

## マイグレーション後の確認

1. アプリケーションを再起動
2. ログインしてダッシュボードにアクセスできるか確認
3. スケジュール設定ページが正常に動作するか確認

## エラーが発生した場合

### エラー: "column already exists"
- 該当する`ALTER TABLE ... ADD COLUMN`をスキップしてください

### エラー: "duplicate key value violates unique constraint"
- ステップ5で重複を削除する前に、重複を確認してください：
  ```sql
  SELECT landing_page_id, COUNT(*) 
  FROM schedule_settings 
  GROUP BY landing_page_id 
  HAVING COUNT(*) > 1;
  ```

### エラー: "relation does not exist"
- テーブルが存在しない場合は、先にテーブルを作成する必要があります


# スケジュール・プラン機能のマイグレーションSQL

## 1. プラン列をユーザーテーブルに追加

```sql
-- プランENUMを作成
CREATE TYPE plan AS ENUM ('free', 'light', 'pro');

-- ユーザーテーブルにplan列を追加
ALTER TABLE users ADD COLUMN plan plan NOT NULL DEFAULT 'free';
```

## 2. スケジュール設定テーブルの変更

### ステップ1: 新しい列を追加
```sql
ALTER TABLE schedule_settings 
  ADD COLUMN user_id INTEGER,
  ADD COLUMN interval_days INTEGER;
```

### ステップ2: 既存データの移行（既存のlandingPageIdからuserIdを取得）
```sql
-- 既存のスケジュール設定から、landingPageIdを使ってuserIdを取得して設定
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
END;
```

### ステップ3: ユーザーごとに1つのスケジュールに統合（重複を削除）
```sql
-- 同じユーザーに複数のスケジュールがある場合、最初のもの（最小ID）を残し、他のものを削除
DELETE FROM schedule_settings ss1
WHERE ss1.id NOT IN (
  SELECT MIN(ss2.id)
  FROM schedule_settings ss2
  WHERE ss2.user_id IS NOT NULL
  GROUP BY ss2.user_id
);
```

### ステップ4: 制約を追加
```sql
-- NOT NULL制約を追加
ALTER TABLE schedule_settings
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN interval_days SET NOT NULL;

-- UNIQUE制約を追加（ユーザーごとに1つ）
ALTER TABLE schedule_settings
  ADD CONSTRAINT schedule_settings_user_id_unique UNIQUE (user_id);

-- 外部キー制約を追加
ALTER TABLE schedule_settings
  ADD CONSTRAINT schedule_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

### ステップ5: 古い列を削除
```sql
-- 古い列を削除
ALTER TABLE schedule_settings
  DROP COLUMN IF EXISTS landing_page_id,
  DROP COLUMN IF EXISTS schedule_type,
  DROP COLUMN IF EXISTS interval_minutes,
  DROP COLUMN IF EXISTS cron_expression;
```

### ステップ6: インデックスを再作成
```sql
-- 古いインデックスを削除
DROP INDEX IF EXISTS idx_schedule_settings_landingPageId;

-- 新しいインデックスを作成
CREATE INDEX idx_schedule_settings_user_id ON schedule_settings(user_id);
CREATE INDEX idx_schedule_settings_enabled_next_run_at ON schedule_settings(enabled, next_run_at) 
WHERE enabled = true AND next_run_at IS NOT NULL;
```

## 注意事項

1. **バックアップ**: マイグレーション実行前に必ずデータベースのバックアップを取得してください
2. **順序**: 上記のステップは順番に実行してください
3. **既存データ**: 既存のスケジュール設定は移行されますが、ユーザーごとに1つに統合されます
4. **テスト**: 本番環境で実行する前に、テスト環境で十分にテストしてください

## ロールバック（必要に応じて）

```sql
-- プラン列を削除
ALTER TABLE users DROP COLUMN IF EXISTS plan;
DROP TYPE IF EXISTS plan;

-- スケジュール設定テーブルを元に戻す（データは保持）
ALTER TABLE schedule_settings
  ADD COLUMN landing_page_id INTEGER,
  ADD COLUMN schedule_type schedule_type DEFAULT 'interval',
  ADD COLUMN interval_minutes INTEGER DEFAULT 60,
  ADD COLUMN cron_expression TEXT;

-- データを復元（user_idからlandingPageIdを取得する必要がある）
-- 注意: この部分はデータモデルの変更により完全な復元は難しい可能性があります

ALTER TABLE schedule_settings
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS interval_days;
```


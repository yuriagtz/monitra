# データベースマイグレーションガイド

## 概要

このガイドでは、データベース設計の改善に伴うマイグレーション手順を説明します。

## マイグレーション内容

### Phase 1: 既存テーブルの改善

1. **`landing_pages`テーブル**
   - `enabled`カラムの追加（デフォルト: `true`）

2. **`schedule_settings`テーブル**
   - `landingPageId`にUNIQUE制約を追加（1LPにつき1スケジュール）

### Phase 2: 新規テーブルの追加

1. **`notification_history`テーブル**
   - 通知送信履歴を記録

2. **`schedule_execution_log`テーブル**
   - スケジュール実行履歴を記録

## マイグレーション手順

### 1. マイグレーションファイルの生成

```bash
pnpm run db:push
```

または、Drizzle Kitを使用してマイグレーションファイルを生成：

```bash
npx drizzle-kit generate
```

### 2. マイグレーションの確認

生成されたマイグレーションファイルを確認：

```bash
ls drizzle/
```

以下のようなファイルが生成されます：
- `0000_*.sql` - マイグレーションファイル

### 3. マイグレーションの実行

SupabaseのPostgreSQLデータベースにマイグレーションを適用：

```bash
npx drizzle-kit migrate
```

または、Supabase CLIを使用：

```bash
supabase db push
```

### 4. データベースの確認

Supabase Dashboardで以下を確認：

1. **テーブル一覧**
   - `landing_pages`に`enabled`カラムが追加されているか
   - `schedule_settings`の`landing_page_id`にUNIQUE制約が追加されているか
   - `notification_history`テーブルが作成されているか
   - `schedule_execution_log`テーブルが作成されているか

2. **インデックス**
   - 各テーブルに適切なインデックスが作成されているか

3. **外部キー制約**
   - 外部キー制約が正しく設定されているか

## 注意事項

### 既存データへの影響

1. **`landing_pages.enabled`カラム**
   - 既存のLPレコードには`enabled = true`が自動的に設定されます
   - 監視を停止したいLPは`enabled = false`に設定してください

2. **`schedule_settings.landingPageId`のUNIQUE制約**
   - 既存データで重複がある場合は、マイグレーション前に修正が必要です
   - 重複を確認するSQL：
     ```sql
     SELECT landing_page_id, COUNT(*) 
     FROM schedule_settings 
     GROUP BY landing_page_id 
     HAVING COUNT(*) > 1;
     ```

### ロールバック手順（必要に応じて）

マイグレーションをロールバックする場合：

1. Supabase Dashboardの「Database」→「Migrations」から該当マイグレーションを削除
2. または、手動でSQLを実行してテーブルを削除/カラムを削除

## マイグレーション後の確認

### 1. アプリケーションの動作確認

- [ ] LP管理ページでLPの有効/無効を切り替えられるか
- [ ] スケジュール設定で1LPにつき1スケジュールのみ設定できるか
- [ ] 通知送信履歴が記録されるか（通知機能使用時）
- [ ] スケジュール実行ログが記録されるか（スケジュール実行時）

### 2. パフォーマンス確認

- [ ] クエリの実行時間が適切か
- [ ] インデックスが正しく機能しているか

## トラブルシューティング

### エラー: "duplicate key value violates unique constraint"

**原因**: `schedule_settings`テーブルに重複した`landingPageId`が存在

**解決方法**:
1. 重複を確認：
   ```sql
   SELECT landing_page_id, COUNT(*) 
   FROM schedule_settings 
   GROUP BY landing_page_id 
   HAVING COUNT(*) > 1;
   ```
2. 重複を削除（古いレコードを削除）：
   ```sql
   DELETE FROM schedule_settings 
   WHERE id NOT IN (
     SELECT MIN(id) 
     FROM schedule_settings 
     GROUP BY landing_page_id
   );
   ```

### エラー: "column already exists"

**原因**: 既にカラムが存在している

**解決方法**: マイグレーションファイルから該当カラムの追加部分を削除

### エラー: "relation does not exist"

**原因**: テーブルが存在しない

**解決方法**: マイグレーションの順序を確認し、依存関係を正しく設定

## 次のステップ

マイグレーション完了後、以下の作業を実施：

1. **外部キー制約の追加**（オプション）
   - データ整合性を向上させるため、外部キー制約を追加
   - 詳細は`DATABASE_DESIGN.md`を参照

2. **インデックスの最適化**（オプション）
   - クエリパフォーマンスに基づいてインデックスを追加
   - 詳細は`DATABASE_DESIGN.md`を参照

3. **アプリケーションコードの更新**
   - 新しいテーブルを使用する機能を実装
   - 通知履歴の表示機能
   - スケジュール実行ログの表示機能

## 参考資料

- [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) - データベース設計の詳細
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [Supabase Database Migrations](https://supabase.com/docs/guides/database/migrations)


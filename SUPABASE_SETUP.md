# Supabase認証セットアップガイド

## 完了した作業

✅ Supabaseクライアントライブラリのインストール
✅ 環境変数設定の追加
✅ クライアント側Supabase初期化コード作成
✅ サーバー側Supabase初期化コード作成
✅ 認証コンテキストのSupabase対応
✅ 認証ルーターのSupabase対応（register, login, logout）
✅ ログインページの確認（既に対応済み）

## 必要な環境変数の設定

プロジェクトルートに `.env` ファイルを作成（または既存のものを更新）し、以下の環境変数を設定してください：

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://heqnynrusuxwirumvdta.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlcW55bnJ1c3V4d2lydW12ZHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjk0MDYsImV4cCI6MjA3Nzg0NTQwNn0.JN80HbemIK1Bi6fs7ZT7T4y1DyqE-L3-djvwjfAbFQI
SUPABASE_SERVICE_ROLE_KEY=<ここにService Role Keyを設定>

# Supabase PostgreSQL Database Connection
# ⚠️ Windows環境ではSession poolerを使用してください（IPv6未対応のため）
# Supabase Dashboard → Settings → Database → Connection string → Session pooler から取得
# 形式（Session pooler推奨）: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
# リージョン: ap-northeast-1
DATABASE_URL=postgresql://postgres.heqnynrusuxwirumvdta:[YOUR-DATABASE-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# その他の環境変数
JWT_SECRET=your-secret-key-here
NODE_ENV=development
PORT=3000
```

## データベースパスワードの取得方法

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. プロジェクト「Monitra」を選択
3. 左メニューから「Settings」→「Database」を選択
4. 「Connection string」セクションで「Session pooler」を選択（Windows環境では必須）
5. パスワードを設定/リセット（まだ設定していない場合）
   - 「Reset database password」をクリックしてパスワードを設定
6. 接続文字列をコピーし、`DATABASE_URL`に設定
   - 形式: `postgresql://postgres.heqnynrusuxwirumvdta:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`

**重要**: Windows環境ではDirect接続（`db.xxx.supabase.co`）は使用できません。必ずSession pooler（`aws-0-xxx.pooler.supabase.com`）を使用してください。

## Service Role Keyの取得方法

1. [Supabase Dashboard](https://supabase.com/dashboard) にログイン
2. プロジェクト「Monitra」を選択
3. 左メニューから「Settings」→「API」を選択
4. 「Project API keys」セクションで「service_role」キーをコピー
   - ⚠️ **重要**: Service Role Keyは秘密情報です。絶対に公開しないでください
   - このキーはサーバー側でのみ使用し、クライアント側には露出させないでください

## 動作確認

環境変数を設定した後、開発サーバーを再起動してください：

```bash
pnpm run dev
```

### 確認ポイント

1. **ログイン**: `/login` ページでメールアドレスとパスワードでログインできる
2. **新規登録**: `/register` ページで新規ユーザーを登録できる
3. **認証状態**: ログイン後、ダッシュボードにアクセスできる
4. **ログアウト**: ログアウト機能が正常に動作する

## データベースとの連携

現在の実装では：
- **認証**: Supabase Authを使用
- **データベース**: Supabase PostgreSQL（完全移行済み）
- `users`テーブルにユーザー情報を保存
- `openId`フィールドに`supabase_{supabase_user_id}`の形式で保存
- `loginMethod`フィールドに`'supabase'`を設定

## マイグレーションの実行

スキーマは既にSupabaseデータベースに適用済みです。以下のテーブルが作成されています：

- `users` - ユーザー情報
- `landing_pages` - ランディングページ
- `monitoring_history` - 監視履歴
- `screenshots` - スクリーンショット
- `tags` - タグ
- `landing_page_tags` - ランディングページとタグの関連
- `notification_settings` - 通知設定
- `schedule_settings` - スケジュール設定

## 今後の作業（オプション）

- [ ] Manus関連コードの削除（vite-plugin-manus-runtime、ManusDialogコンポーネントなど）
- [ ] OAuth関連コードの削除（server/_core/oauth.ts、server/_core/sdk.tsなど）
- [ ] パスワードリセット機能の実装（Supabase Authのパスワードリセット機能を使用）
- [ ] メール認証の有効化（Supabase Dashboardで設定）

## トラブルシューティング

### エラー: "Supabase URL and Anon Key must be configured"
→ 環境変数 `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` が設定されているか確認してください

### エラー: "Supabase URL and Service Role Key must be configured"
→ 環境変数 `SUPABASE_SERVICE_ROLE_KEY` が設定されているか確認してください

### ログインできない
→ Supabase Dashboardで「Authentication」→「Providers」で「Email」が有効になっているか確認してください


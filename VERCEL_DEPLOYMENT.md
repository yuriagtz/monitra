# Vercelデプロイメントガイド

## ビルド設定

Vercel プロジェクト設定で以下を指定してください。

- Install Command: `pnpm install`
- Build Command: `pnpm run build`
- Output Directory: `dist/public`
- Functions Runtime: Project Settings > Functions で Node.js 20 を選択（未設定の場合は `NODE_VERSION=20` を環境変数に追加）

`pnpm run build` は以下を実行します。

1. `vite build` → `dist/public/` にフロントエンドを出力
2. `esbuild` → `dist/index.js` にExpressサーバー（サーバーレスハンドラー）をバンドル

## 環境変数の設定

Vercelのダッシュボードで以下の環境変数を設定してください。

### 必須環境変数

- `DATABASE_URL`: データベース接続URL
- `SUPABASE_URL`: SupabaseプロジェクトURL
- `SUPABASE_ANON_KEY`: Supabase匿名キー
- `SUPABASE_SERVICE_ROLE_KEY`: Supabaseサービスロールキー
- `GOOGLE_CLIENT_ID`: Google OAuth クライアントID
- `GOOGLE_CLIENT_SECRET`: Google OAuth クライアントシークレット

### オプション環境変数

- `CRON_SECRET`: Vercel Cronエンドポイントの認証用シークレット（推奨）
  - 設定すると、`/api/cron/schedule-check`エンドポイントが保護されます
  - ランダムな文字列を生成して設定してください（例: `openssl rand -hex 32`）
  - 設定しない場合は、Vercelの内部ネットワークからのみアクセス可能です

- `TZ`: タイムゾーン設定（デフォルト: `Asia/Tokyo`）
  - スケジュール実行時のタイムゾーンを指定します
  - 例: `Asia/Tokyo`, `America/New_York`, `Europe/London`
  - タイムゾーン名の一覧: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

- `PUPPETEER_CHROME_BUILD_ID`: ChromeのビルドID（緊急時のフォールバックのみ）
  - **通常は設定不要**。デフォルトでは常に最新版のChromeを使用します
  - Chromeのインストールに問題が発生した場合のみ、特定のビルドIDを指定してください
  - ビルドIDは [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) で確認できます
  - **注意**: この環境変数を設定すると、Chromeのアップデートに対応できなくなります

## ルーティングとCron設定

`vercel.json` にはサーバーレスハンドラーとCron設定が含まれています。

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node",
      "config": {
        "includeFiles": ["dist/public/**"]
      }
    }
  ],
  "routes": [
    { "src": "/api/cron/schedule-check", "dest": "/dist/index.js" },
    { "src": "/api/(.*)", "dest": "/dist/index.js" },
    { "src": "/(.*)", "dest": "/dist/index.js" }
  ],
  "crons": [
    {
      "path": "/api/cron/schedule-check",
      "schedule": "0 * * * *"
    }
  ]
}
```

- すべてのAPIリクエストとページリクエストは `dist/index.js` にルーティングされ、Expressが処理します。
- `includeFiles` で `dist/public/**` を指定することで、Express が参照するフロントエンド資産をサーバーレス関数に同梱しています。
- 本番環境では `process.cwd()/dist/public` を配信ルートとして参照するため、`dist` フォルダ全体がビルド成果物に含まれている必要があります。
- Cron Jobは毎時0分（UTC）に `/api/cron/schedule-check` を呼び出します。

## タイムゾーンの考慮

- Vercel Cron Jobsは**UTC時間**で実行されます
- アプリケーションは`TZ`環境変数で指定されたタイムゾーン（デフォルト: `Asia/Tokyo`）で動作します
- スケジュール設定の`executeHour`は、指定されたタイムゾーンのローカル時間で解釈されます

### 例

- `TZ=Asia/Tokyo`（デフォルト）の場合
  - `executeHour=9`は、日本時間の9時（UTC時間では0時）に実行されます
  - Vercel Cronは毎時0分（UTC）に実行されるため、日本時間の9時、10時、11時...に実行されます

- `TZ=America/New_York`の場合
  - `executeHour=9`は、東部時間の9時（UTC時間では14時または13時、サマータイムによる）に実行されます

## デプロイ後の確認

1. Vercelのダッシュボードで「Functions」と「Cron Jobs」セクションを確認
2. `/api/cron/schedule-check`エンドポイントが正しく設定されているか確認
3. スケジュール設定画面で「次回実行予定」が正しく表示されているか確認
4. 実際にスケジュールが実行されるか確認

## トラブルシューティング

### Cronが実行されない場合

1. Vercelのログを確認（「Functions」タブ → `/api/cron/schedule-check`）
2. 環境変数が正しく設定されているか確認
3. `CRON_SECRET`を設定している場合、認証が正しく行われているか確認

### タイムゾーンが合わない場合

1. `TZ`環境変数が正しく設定されているか確認
2. スケジュール設定の`executeHour`が期待するタイムゾーンで解釈されているか確認
3. ログでUTC時間とローカル時間の両方を確認


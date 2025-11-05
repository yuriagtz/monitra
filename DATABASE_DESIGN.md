# データベース設計書

## 概要

Monitra（LP監視システム）のデータベース設計書です。PostgreSQLを使用し、Drizzle ORMで管理します。

## 設計原則

1. **正規化**: データの重複を最小限に抑える
2. **整合性**: 外部キー制約でデータの整合性を保証
3. **パフォーマンス**: 適切なインデックスでクエリを最適化
4. **拡張性**: 将来の機能追加に対応できる柔軟な設計
5. **監査**: 作成日時・更新日時を記録

---

## テーブル一覧

### 1. ユーザー管理

#### `users` - ユーザー情報
認証済みユーザーの基本情報を管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | ユーザーID（自動採番） |
| openId | VARCHAR(64) | UNIQUE, NOT NULL | Supabase Auth ID（`supabase_{user_id}`形式） |
| name | TEXT | | ユーザー名 |
| email | VARCHAR(320) | | メールアドレス |
| password | VARCHAR(255) | | パスワードハッシュ（Supabase Auth使用時は不要） |
| profileImage | TEXT | | プロフィール画像URL |
| loginMethod | VARCHAR(64) | | ログイン方法（`supabase`, `google`など） |
| role | ENUM | NOT NULL, DEFAULT 'user' | ユーザー権限（`user`, `admin`） |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新日時 |
| lastSignedIn | TIMESTAMP | NOT NULL, DEFAULT NOW() | 最終ログイン日時 |

**インデックス:**
- `idx_users_openId` ON `openId` (UNIQUE)
- `idx_users_email` ON `email` (WHERE email IS NOT NULL)

**制約:**
- `email`は一意である必要がある（ただしNULL許可）

---

### 2. LP管理

#### `landing_pages` - ランディングページ情報
監視対象のランディングページを管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | LP ID（自動採番） |
| url | TEXT | NOT NULL | 監視対象URL |
| title | VARCHAR(255) | | LPタイトル |
| description | TEXT | | 説明 |
| userId | INTEGER | NOT NULL, FK → users.id | 所有者ユーザーID |
| enabled | BOOLEAN | NOT NULL, DEFAULT true | 監視有効/無効 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新日時 |

**インデックス:**
- `idx_landing_pages_userId` ON `userId`
- `idx_landing_pages_enabled` ON `enabled` (WHERE enabled = true)
- `idx_landing_pages_url` ON `url` (部分インデックス、重複チェック用)

**外部キー:**
- `fk_landing_pages_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE

**制約:**
- `url`は一意である必要がある（同じユーザー内で）

---

### 3. 監視履歴

#### `monitoring_history` - 監視実行履歴
各LPの監視実行結果を記録します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 履歴ID（自動採番） |
| landingPageId | INTEGER | NOT NULL, FK → landing_pages.id | LP ID |
| checkType | ENUM | NOT NULL | チェック種類（`content_change`, `link_broken`） |
| status | ENUM | NOT NULL | ステータス（`ok`, `changed`, `error`） |
| message | TEXT | | メッセージ |
| screenshotUrl | TEXT | | 現在のスクリーンショットURL |
| previousScreenshotUrl | TEXT | | 前回のスクリーンショットURL |
| diffImageUrl | TEXT | | 差分画像URL |
| diffTopThird | VARCHAR(20) | | 上部領域の差分率（%） |
| diffMiddleThird | VARCHAR(20) | | 中部領域の差分率（%） |
| diffBottomThird | VARCHAR(20) | | 下部領域の差分率（%） |
| regionAnalysis | TEXT | | 領域分析結果（JSON形式） |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

**インデックス:**
- `idx_monitoring_history_landingPageId` ON `landingPageId`
- `idx_monitoring_history_createdAt` ON `createdAt` DESC
- `idx_monitoring_history_status` ON `status` (WHERE status != 'ok')
- `idx_monitoring_history_landingPageId_createdAt` ON (`landingPageId`, `createdAt` DESC) - 複合インデックス

**外部キー:**
- `fk_monitoring_history_landingPageId` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE

---

### 4. スクリーンショット

#### `screenshots` - 最新スクリーンショット
各LPの最新スクリーンショット情報を管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | スクリーンショットID |
| landingPageId | INTEGER | NOT NULL, UNIQUE, FK → landing_pages.id | LP ID |
| screenshotUrl | TEXT | NOT NULL | スクリーンショットURL |
| fileKey | TEXT | NOT NULL | ストレージ上のファイルキー |
| capturedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 撮影日時 |

**インデックス:**
- `idx_screenshots_landingPageId` ON `landingPageId` (UNIQUE)

**外部キー:**
- `fk_screenshots_landingPageId` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE

---

### 5. タグ管理

#### `tags` - タグマスター
ユーザーが作成したタグを管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | タグID |
| name | VARCHAR(50) | NOT NULL | タグ名 |
| color | VARCHAR(7) | NOT NULL | カラーコード（HEX形式） |
| userId | INTEGER | NOT NULL, FK → users.id | 所有者ユーザーID |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

**インデックス:**
- `idx_tags_userId` ON `userId`
- `idx_tags_userId_name` ON (`userId`, `name`) UNIQUE - ユーザー内でタグ名は一意

**外部キー:**
- `fk_tags_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE

**制約:**
- `color`は`#`で始まる6桁のHEXカラーコードである必要がある

---

#### `landing_page_tags` - LP-タグ関連
LPとタグの多対多の関係を管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 関連ID |
| landingPageId | INTEGER | NOT NULL, FK → landing_pages.id | LP ID |
| tagId | INTEGER | NOT NULL, FK → tags.id | タグID |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

**インデックス:**
- `idx_landing_page_tags_landingPageId` ON `landingPageId`
- `idx_landing_page_tags_tagId` ON `tagId`
- `idx_landing_page_tags_unique` ON (`landingPageId`, `tagId`) UNIQUE - 重複防止

**外部キー:**
- `fk_landing_page_tags_landingPageId` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE
- `fk_landing_page_tags_tagId` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE

---

### 6. 通知設定

#### `notification_settings` - 通知設定
ユーザーごとの通知設定を管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 設定ID |
| userId | INTEGER | NOT NULL, UNIQUE, FK → users.id | ユーザーID |
| emailEnabled | BOOLEAN | NOT NULL, DEFAULT false | メール通知有効 |
| emailAddress | TEXT | | メールアドレス |
| slackEnabled | BOOLEAN | NOT NULL, DEFAULT false | Slack通知有効 |
| slackWebhookUrl | TEXT | | Slack Webhook URL |
| discordEnabled | BOOLEAN | NOT NULL, DEFAULT false | Discord通知有効 |
| discordWebhookUrl | TEXT | | Discord Webhook URL |
| chatworkEnabled | BOOLEAN | NOT NULL, DEFAULT false | Chatwork通知有効 |
| chatworkApiToken | TEXT | | Chatwork APIトークン |
| chatworkRoomId | TEXT | | ChatworkルームID |
| notifyOnChange | BOOLEAN | NOT NULL, DEFAULT true | 変更検出時に通知 |
| notifyOnError | BOOLEAN | NOT NULL, DEFAULT true | エラー時に通知 |
| notifyOnBrokenLink | BOOLEAN | NOT NULL, DEFAULT true | リンク切れ時に通知 |
| ignoreFirstViewOnly | BOOLEAN | NOT NULL, DEFAULT false | ファーストビューのみ除外 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新日時 |

**インデックス:**
- `idx_notification_settings_userId` ON `userId` (UNIQUE)

**外部キー:**
- `fk_notification_settings_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE

---

#### `notification_history` - 通知送信履歴（新規追加）
通知送信の履歴を記録します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 履歴ID |
| userId | INTEGER | NOT NULL, FK → users.id | ユーザーID |
| landingPageId | INTEGER | FK → landing_pages.id | LP ID（通知対象） |
| monitoringHistoryId | INTEGER | FK → monitoring_history.id | 監視履歴ID |
| channel | VARCHAR(20) | NOT NULL | 通知チャネル（`email`, `slack`, `discord`, `chatwork`） |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | 送信ステータス（`pending`, `success`, `failed`） |
| errorMessage | TEXT | | エラーメッセージ（失敗時） |
| sentAt | TIMESTAMP | | 送信日時 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |

**インデックス:**
- `idx_notification_history_userId` ON `userId`
- `idx_notification_history_landingPageId` ON `landingPageId`
- `idx_notification_history_status` ON `status` (WHERE status = 'pending')
- `idx_notification_history_createdAt` ON `createdAt` DESC

**外部キー:**
- `fk_notification_history_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
- `fk_notification_history_landingPageId` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE SET NULL
- `fk_notification_history_monitoringHistoryId` FOREIGN KEY (`monitoringHistoryId`) REFERENCES `monitoring_history`(`id`) ON DELETE SET NULL

---

### 7. スケジュール設定

#### `schedule_settings` - 監視スケジュール設定
各LPの自動監視スケジュールを管理します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | 設定ID |
| landingPageId | INTEGER | NOT NULL, UNIQUE, FK → landing_pages.id | LP ID |
| enabled | BOOLEAN | NOT NULL, DEFAULT true | スケジュール有効/無効 |
| scheduleType | ENUM | NOT NULL, DEFAULT 'interval' | スケジュール種類（`interval`, `cron`） |
| intervalMinutes | INTEGER | | 間隔（分）- `scheduleType`が`interval`の場合 |
| cronExpression | TEXT | | Cron式 - `scheduleType`が`cron`の場合 |
| lastRunAt | TIMESTAMP | | 最終実行日時 |
| nextRunAt | TIMESTAMP | | 次回実行予定日時 |
| createdAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 作成日時 |
| updatedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新日時 |

**インデックス:**
- `idx_schedule_settings_landingPageId` ON `landingPageId` (UNIQUE)
- `idx_schedule_settings_enabled_nextRunAt` ON (`enabled`, `nextRunAt`) (WHERE enabled = true AND nextRunAt IS NOT NULL)

**外部キー:**
- `fk_schedule_settings_landingPageId` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE

**制約:**
- `scheduleType`が`interval`の場合、`intervalMinutes`は必須
- `scheduleType`が`cron`の場合、`cronExpression`は必須

---

#### `schedule_execution_log` - スケジュール実行ログ（新規追加）
スケジュール実行の履歴を記録します。

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | SERIAL | PRIMARY KEY | ログID |
| scheduleSettingId | INTEGER | NOT NULL, FK → schedule_settings.id | スケジュール設定ID |
| landingPageId | INTEGER | NOT NULL, FK → landing_pages.id | LP ID |
| status | VARCHAR(20) | NOT NULL | 実行ステータス（`started`, `completed`, `failed`） |
| monitoringHistoryId | INTEGER | FK → monitoring_history.id | 監視履歴ID（成功時） |
| errorMessage | TEXT | | エラーメッセージ（失敗時） |
| startedAt | TIMESTAMP | NOT NULL, DEFAULT NOW() | 開始日時 |
| completedAt | TIMESTAMP | | 完了日時 |
| durationMs | INTEGER | | 実行時間（ミリ秒） |

**インデックス:**
- `idx_schedule_execution_log_scheduleSettingId` ON `scheduleSettingId`
- `idx_schedule_execution_log_landingPageId` ON `landingPageId`
- `idx_schedule_execution_log_startedAt` ON `startedAt` DESC
- `idx_schedule_execution_log_status` ON `status` (WHERE status = 'failed')

**外部キー:**
- `fk_schedule_execution_log_scheduleSettingId` FOREIGN KEY (`scheduleSettingId`) REFERENCES `schedule_settings`(`id`) ON DELETE CASCADE
- `fk_schedule_execution_log_landingPageId` FOREIGN KEY (`landingPageId`) REFERENCES `landing_pages`(`id`) ON DELETE CASCADE
- `fk_schedule_execution_log_monitoringHistoryId` FOREIGN KEY (`monitoringHistoryId`) REFERENCES `monitoring_history`(`id`) ON DELETE SET NULL

---

## エンティティ関係図（ERD）

```
users
  ├── landing_pages (1:N)
  │     ├── monitoring_history (1:N)
  │     ├── screenshots (1:1)
  │     ├── schedule_settings (1:1)
  │     ├── landing_page_tags (N:M)
  │     └── notification_history (1:N)
  ├── tags (1:N)
  ├── notification_settings (1:1)
  └── notification_history (1:N)

tags
  └── landing_page_tags (N:M)
      └── landing_pages

schedule_settings
  └── schedule_execution_log (1:N)
```

---

## インデックス戦略

### パフォーマンス最適化のためのインデックス

1. **検索クエリ用**
   - `users.email` - ログイン時のユーザー検索
   - `landing_pages.userId` - ユーザー所有LPの一覧取得
   - `monitoring_history.landingPageId` + `createdAt` - 履歴の時系列取得

2. **フィルタリング用**
   - `landing_pages.enabled` - 有効なLPのみ取得
   - `monitoring_history.status` - エラー・変更のみ抽出
   - `schedule_settings.enabled` + `nextRunAt` - 次回実行予定の取得

3. **一意性制約用**
   - `users.openId` - 認証IDの一意性
   - `landing_pages.url` + `userId` - 同一ユーザー内でのURL重複防止
   - `tags.userId` + `name` - ユーザー内でのタグ名重複防止

---

## データ整合性ルール

### 1. カスケード削除
- ユーザー削除時 → 所有するLP、タグ、通知設定を削除
- LP削除時 → 監視履歴、スクリーンショット、スケジュール設定、タグ関連を削除
- タグ削除時 → LP-タグ関連を削除

### 2. NULL制約
- 重要な識別子（`userId`, `landingPageId`など）はNOT NULL
- オプショナルな情報（`description`, `message`など）はNULL許可

### 3. デフォルト値
- `enabled`系のフラグは`true`をデフォルト
- `createdAt`、`updatedAt`は自動的に現在時刻を設定

---

## パーティショニング戦略（将来の拡張）

大量の監視履歴データに対応するため、以下のパーティショニングを検討：

1. **`monitoring_history`テーブル**
   - 月次パーティショニング（`createdAt`基準）
   - 古いデータのアーカイブとクエリパフォーマンス向上

2. **`notification_history`テーブル**
   - 月次パーティショニング（`createdAt`基準）
   - 通知履歴の大量データに対応

---

## マイグレーション計画

### Phase 1: 基本スキーマ（現在）
- ✅ ユーザー、LP、監視履歴、スクリーンショット
- ✅ タグ、通知設定、スケジュール設定

### Phase 2: 履歴管理（追加が必要）
- ⬜ `notification_history`テーブルの追加
- ⬜ `schedule_execution_log`テーブルの追加

### Phase 3: 外部キー制約の追加
- ⬜ 全テーブルに外部キー制約を追加
- ⬜ カスケード削除の設定

### Phase 4: インデックス最適化
- ⬜ パフォーマンス測定に基づくインデックス追加
- ⬜ 複合インデックスの最適化

### Phase 5: パーティショニング（将来）
- ⬜ 大量データ対応のためのパーティショニング

---

## セキュリティ考慮事項

1. **データ分離**
   - ユーザーごとのデータは`userId`で完全に分離
   - 外部キー制約により、他ユーザーのデータへのアクセスを防止

2. **機密情報**
   - `notification_settings`のAPIトークン、Webhook URLは暗号化を検討
   - パスワードはSupabase Authで管理（ハッシュ化済み）

3. **監査ログ**
   - 重要な操作（削除、設定変更など）のログ記録を検討

---

## パフォーマンス最適化

1. **クエリ最適化**
   - 頻繁に実行されるクエリにインデックスを追加
   - JOINの最適化（必要なカラムのみ選択）

2. **データアーカイブ**
   - 古い監視履歴（1年以上前）は別テーブルにアーカイブ
   - 分析用の集計テーブルを作成（将来）

3. **接続プール**
   - PostgreSQL接続プールサイズを適切に設定（現在: 10）

---

## 参考資料

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Supabase Database Best Practices](https://supabase.com/docs/guides/database)


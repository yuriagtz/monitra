-- パフォーマンス最適化のためのインデックス追加
-- 注意: PostgreSQLではカラム名の大文字小文字が区別されるため、引用符で囲む必要がある

-- landing_pagesテーブルのuserIdにインデックスを追加（LP一覧取得の高速化）
CREATE INDEX IF NOT EXISTS idx_landing_pages_userId ON landing_pages("userId");

-- monitoring_historyテーブルのインデックス追加（履歴取得の高速化）
CREATE INDEX IF NOT EXISTS idx_monitoring_history_landingPageId_createdAt ON monitoring_history(landing_page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_history_creativeId_createdAt ON monitoring_history(creative_id, created_at DESC);

-- landing_page_tagsテーブルのインデックス追加（タグ関連の高速化）
CREATE INDEX IF NOT EXISTS idx_landing_page_tags_landingPageId ON landing_page_tags(landing_page_id);
CREATE INDEX IF NOT EXISTS idx_landing_page_tags_tagId ON landing_page_tags(tag_id);


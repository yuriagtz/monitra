-- 重複データを削除（各LP/クリエイティブとタグの組み合わせで、最新のもの以外を削除）
-- landing_page_tagsテーブルの重複削除
DELETE FROM landing_page_tags
WHERE id NOT IN (
  SELECT MIN(id)
  FROM landing_page_tags
  GROUP BY landing_page_id, tag_id
);

-- creative_tagsテーブルの重複削除
DELETE FROM creative_tags
WHERE id NOT IN (
  SELECT MIN(id)
  FROM creative_tags
  GROUP BY creative_id, tag_id
);

-- landing_page_tagsテーブルにユニーク制約を追加
CREATE UNIQUE INDEX IF NOT EXISTS landing_page_tags_landing_page_id_tag_id_unique 
ON landing_page_tags(landing_page_id, tag_id);

-- creative_tagsテーブルにユニーク制約を追加
CREATE UNIQUE INDEX IF NOT EXISTS creative_tags_creative_id_tag_id_unique 
ON creative_tags(creative_id, tag_id);


-- Remove screenshots table (no longer used)
-- All screenshot data is now stored in monitoring_history table

DROP TABLE IF EXISTS "screenshots" CASCADE;


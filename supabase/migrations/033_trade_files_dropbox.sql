-- Migration 033: Dropbox folder columns for trade_files
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS dropbox_folder_path text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dropbox_folder_url  text DEFAULT NULL;

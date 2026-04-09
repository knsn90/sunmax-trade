-- Google Drive folder ID for each trade file
ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS google_drive_folder_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_drive_folder_url text DEFAULT NULL;

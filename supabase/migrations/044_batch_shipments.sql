-- 044: Partial shipment (batch/parti) desteği
-- Ana dosya (parent_file_id=NULL) birden fazla partiye bölünebilir.
-- Her parti kendi belge serisine sahip tam bir dosyadır.

ALTER TABLE trade_files
  ADD COLUMN IF NOT EXISTS parent_file_id uuid REFERENCES trade_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_no        integer DEFAULT NULL;

CREATE INDEX IF NOT EXISTS trade_files_parent_idx ON trade_files(parent_file_id);

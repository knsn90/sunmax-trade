-- trade_files.file_no unique kuralını düzelt:
-- Eski: global UNIQUE (file_no) — silinen dosyalar bile numarayı bloklar,
-- ve farklı tenant'lar aynı numarayı kullanamaz. Bu yüzden yeni dosya
-- açarken "duplicate key value violates unique constraint
-- trade_files_file_no_key" hatası alınıyordu (silinen/boşluk numaralar).
--
-- Yeni: partial + tenant-bazlı UNIQUE.
--   1) WHERE deleted_at IS NULL → silinen dosyalar numarayı bloklamaz
--   2) (tenant_id, file_no)     → aynı file_no farklı firmalarda olabilir

ALTER TABLE public.trade_files DROP CONSTRAINT IF EXISTS trade_files_file_no_key;

CREATE UNIQUE INDEX IF NOT EXISTS trade_files_file_no_key
  ON public.trade_files (tenant_id, file_no)
  WHERE deleted_at IS NULL;

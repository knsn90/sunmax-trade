-- ============================================================
-- Migration 053: Otomatik ön ödeme borç kaydı trigger'ını devre dışı bırak
--
-- Kullanıcı isteği: Satış dosyasındaki ön ödemeler muhasebe bölümüne
-- otomatik işlenmesin. Trigger yerine manuel yönetim.
-- ============================================================

-- Advance obligations trigger'ını devre dışı bırak
-- (tabloda varsa; yoksa hata vermeden geçer)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_create_advance_obligations'
  ) THEN
    ALTER TABLE trade_files DISABLE TRIGGER trg_create_advance_obligations;
  END IF;
END;
$$;

-- NOT: fn_create_advance_obligations fonksiyonu korunuyor.
-- İleride manuel tetiklemek veya yeniden aktifleştirmek için:
--   ALTER TABLE trade_files ENABLE TRIGGER trg_create_advance_obligations;

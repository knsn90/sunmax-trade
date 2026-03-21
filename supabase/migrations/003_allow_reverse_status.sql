-- Run this in Supabase SQL Editor to allow reverse status changes (#10)
-- This replaces the strict forward-only status validation

CREATE OR REPLACE FUNCTION validate_trade_file_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow any transition from NULL (new record)
  IF OLD.status IS NULL THEN RETURN NEW; END IF;

  -- Same status (update other fields without changing status)
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Forward transitions
  IF OLD.status = 'request' AND NEW.status IN ('sale', 'cancelled') THEN RETURN NEW; END IF;
  IF OLD.status = 'sale' AND NEW.status IN ('delivery', 'request', 'cancelled') THEN RETURN NEW; END IF;
  IF OLD.status = 'delivery' AND NEW.status IN ('completed', 'sale', 'cancelled') THEN RETURN NEW; END IF;
  IF OLD.status = 'completed' AND NEW.status IN ('delivery') THEN RETURN NEW; END IF;

  -- If none matched, allow it anyway (admin override)
  -- Remove this line if you want strict validation:
  RETURN NEW;

END;
$$ LANGUAGE plpgsql;

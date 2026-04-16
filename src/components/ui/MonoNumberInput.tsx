import { useEffect, useRef, useState } from 'react';

/**
 * MonoNumberInput — Mono tasarım standardına uygun sayı input'u.
 * Odak dışındayken binlik ayraç gösterir: 500000 → 500,000
 * Odaklanınca ham rakam gösterir: 500000
 */
interface MonoNumberInputProps {
  value: number | undefined | null;
  onChange: (val: number | undefined) => void;
  placeholder?: string;
  className?: string;
  decimals?: number; // max gösterilecek ondalık hane (default 6)
}

export function MonoNumberInput({
  value,
  onChange,
  placeholder,
  className,
  decimals = 6,
}: MonoNumberInputProps) {
  const [display, setDisplay] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function fmt(n: number): string {
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  // Dışarıdan gelen değer değiştiğinde (focused değilken) display'i güncelle
  useEffect(() => {
    if (focused) return;
    if (value != null && !isNaN(Number(value))) {
      setDisplay(fmt(Number(value)));
    } else {
      setDisplay('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(true);
    // Düzenleme için ham rakamı göster (virgülleri sil)
    const raw = value != null && !isNaN(Number(value)) ? String(value) : '';
    setDisplay(raw);
    // Tüm metni seç
    setTimeout(() => e.target.select(), 0);
  }

  function handleBlur() {
    setFocused(false);
    const raw = display.replace(/,/g, '').trim();
    if (raw === '' || raw === '-') {
      onChange(undefined);
      setDisplay('');
    } else {
      const n = parseFloat(raw);
      if (isNaN(n)) {
        onChange(undefined);
        setDisplay('');
      } else {
        onChange(n);
        setDisplay(fmt(n));
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    // Yalnızca rakam, nokta ve eksi işaretine izin ver
    if (v === '' || /^-?\d*\.?\d*$/.test(v)) {
      setDisplay(v);
      if (v === '' || v === '-') {
        onChange(undefined);
      } else {
        const n = parseFloat(v);
        if (!isNaN(n)) onChange(n);
      }
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
}

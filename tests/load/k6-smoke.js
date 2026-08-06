import http from 'k6/http';
import { check, sleep } from 'k6';

// ⚠️⚠️ UYARI: Bu load test'i ASLA production'a çalıştırma.
// Yüksek istek hacmi Supabase Disk IO bütçesini tüketir ve kesinti yaratır
// (bkz. 2026-08 olayı). Hedef AYRI bir test/staging Supabase projesi veya
// bir Supabase branch olmalıdır.

const BASE = __ENV.K6_TARGET_URL;
if (!BASE) {
  throw new Error('K6_TARGET_URL zorunlu — bir TEST ortamı URL\'i ver.');
}
// Production guard — bilinen prod alan adı / proje ref'i reddedilir
const FORBIDDEN = ['app.pluskimya.com', 'gramxnhbkbnjbmkdomjf'];
if (FORBIDDEN.some((f) => BASE.includes(f))) {
  throw new Error(`Production hedefi yasak (${BASE}). Test ortamı kullan.`);
}

export const options = {
  stages: [
    { duration: '30s', target: 5 },  // ısınma
    { duration: '1m', target: 10 },  // sabit yük
    { duration: '30s', target: 0 },  // soğuma
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // p95 < 1.5s
    http_req_failed: ['rate<0.05'],    // hata oranı < %5
  },
};

export default function () {
  const res = http.get(`${BASE}/login`);
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}

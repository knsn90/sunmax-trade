import { test, expect } from '@playwright/test';

// ─── Auth GEREKTİRMEYEN smoke testleri ────────────────────────────────────────
// Login/firma seçici sayfası render oluyor mu? (backend olmadan da çalışır)
test('login sayfası yükleniyor', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Giriş Yapın' })).toBeVisible();
});

// ─── Kimlik-doğrulamalı akış (opsiyonel) ──────────────────────────────────────
// E2E_EMAIL / E2E_PASSWORD secret'ları ayarlıysa çalışır; değilse atlanır.
// Selektörler uygulamaya göre ince ayar gerektirebilir (bkz. TESTING.md).
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const tenantSlug = process.env.E2E_TENANT_SLUG ?? 'sunplus';

test.describe('authenticated', () => {
  test.skip(!email || !password, 'E2E_EMAIL/E2E_PASSWORD ayarlı değil — atlandı');

  test('giriş → dashboard', async ({ page }) => {
    await page.goto(`/login/${tenantSlug}`);
    await page.getByLabel(/username/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
  });
});

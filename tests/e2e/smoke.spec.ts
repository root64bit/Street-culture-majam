import { test, expect } from '@playwright/test';

test.describe('STREET CULTURE — Smoke Tests', () => {
  test('homepage renders approved Stitch visual identity and headlines', async ({ page }) => {
    await page.goto('/');

    // Check main brand identity
    await expect(page.locator('text=STREET CULTURE').first()).toBeVisible();
    await expect(page.locator('text=ARCHIVAL VAULT').first()).toBeVisible();

    // Check canonical headlines
    await expect(page.locator('text=LIVE LIQUIDITY PROTOCOL V4.2')).toBeVisible();
    await expect(page.locator('text=ARCHIVAL').first()).toBeVisible();
    await expect(page.locator('text=GRAIL VAULT').first()).toBeVisible();

    // Check specimen card
    await expect(page.locator("text=A/X PROTOTYPE RUNNER 'ACID VOID'").first()).toBeVisible();
    await expect(page.locator('text=$2,840').first()).toBeVisible();
  });

  test('navigation routes correctly to category pages', async ({ page }) => {
    await page.goto('/sneakers');
    await expect(page).toHaveURL(/.*sneakers/);
    await expect(page.locator('text=AUTHENTICATED SNEAKERS')).toBeVisible();
  });

  test('search route renders live search input', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('text=SEARCH VAULT INDEX')).toBeVisible();
    const searchInput = page.locator('input[placeholder*="Search by brand"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Jordan');
    await expect(page.locator("text=Air Jordan 1 Retro High OG 'Chicago Lost & Found'")).toBeVisible();
  });

  test('authentication sign-in page loads correctly', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await expect(page.locator('text=SIGN IN TO VAULT')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('consignment portal renders intake workflow', async ({ page }) => {
    await page.goto('/consign');
    await expect(page.locator('text=CONSIGN YOUR ARCHIVAL GRAILS WITH COMPLETE CONFIDENCE')).toBeVisible();
    await expect(page.locator('text=COMPETITIVE CONSIGNMENT COMMISSIONS')).toBeVisible();
  });

  test('health check API endpoint responds with status ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.application).toBe('STREET CULTURE Archival Vault');
  });
});

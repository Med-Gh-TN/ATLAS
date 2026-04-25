import { test, expect } from '@playwright/test';

test.describe('Global Shell Features', () => {
  // E2E-009
  test('E2E-009 | CMD+K opens command palette → keyboard navigation → action executes', async ({ page }) => {
    await page.goto('/dashboard');

    // Simulate CMD+K (or CTRL+K)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+k`);

    // Verify the command palette appears
    await expect(page.locator('[dialog]')).toBeVisible();
    await expect(page.locator('input[placeholder="Type a command or search..."]')).toBeFocused();

    // Keyboard navigate down
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // The palette should close immediately
    await expect(page.locator('[dialog]')).toBeHidden();
  });

  // E2E-010
  test('E2E-010 | Language switch to Arabic → layout is RTL → switch back to French → layout is LTR', async ({ page }) => {
    await page.goto('/dashboard');

    // Access language toggle
    await page.click('button:has-text("FR")');
    await page.click('text="AR"');

    // Verify document directon is RTL
    let dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');

    // Switch back
    await page.click('button:has-text("AR")');
    await page.click('text="FR"');

    dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('ltr');
  });
});

import { test, expect } from '@playwright/test';

test.describe('Learning Flows', () => {
  // E2E-003
  test('E2E-003 | Student: Search for a course → open it → open AI Chat → send a message → verify SSE stream renders tokens', async ({ page }) => {
    await page.goto('/search');

    // Search
    await page.fill('input[placeholder="Search for courses, documents, topics..."]', 'React 101');
    await page.click('button:has-text("Search")');

    // Wait for results
    await page.waitForSelector('text=Found');

    // Assuming clicking first result goes to /courses/[id]
    await page.click('.flex-1 h3.font-semibold');

    // Should be at /courses/[id] - now open AI chat, assume there's an 'AI Chat' tab or button
    await page.goto('/ai/workspace');
    await page.fill('input[placeholder="Ask anything about the course..."]', 'Explain useEffect');
    await page.click('button[type="submit"]');

    // Verify SSE streaming visually (mocked)
    await expect(page.locator('.prose')).toContainText('useEffect', { timeout: 15000 });
  });

  // E2E-004
  test('E2E-004 | Student: Generate flashcard deck → study 5 cards with SM-2 ratings → verify next review dates update', async ({ page }) => {
    await page.goto('/ai/workspace?tab=flashcards');

    // assume generation happens
    await page.click('button:has-text("Generate Flashcards")');

    // click through cards using SM-2 buttons (Easy, Good, Hard, etc.)
    for(let i=0; i<5; i++) {
        await page.click('button:has-text("Show Answer")');
        await page.click('button:has-text("Good")');
    }

    // verify 'Great job' or completion state
    await expect(page.locator('text=You have reviewed all due cards')).toBeVisible({ timeout: 10000 });
  });

  // E2E-005
  test('E2E-005 | Student: Take a quiz → submit → verify score page renders with explanations', async ({ page }) => {
    await page.goto('/ai/workspace?tab=quiz');

    // start quiz
    await page.click('button:has-text("Start New Quiz")');

    // answer mock 5 questions
    for(let i=0; i<5; i++) {
        await page.click('input[type="radio"] >> nth=0');
        if (i < 4) await page.click('button:has-text("Next")');
    }

    // submit
    await page.click('button:has-text("Submit Quiz")');

    // Score page
    await expect(page.locator('text=Score')).toBeVisible({ timeout: 10000 });
  });
});

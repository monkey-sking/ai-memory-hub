const { test, expect } = require('@playwright/test');

test('Workflow execution graph displays and expands', async ({ page }) => {
  // Navigate to workflows page
  await page.goto('http://127.0.0.1:38787/workflows');

  // Wait for workflows to load
  await page.waitForSelector('[class*="Card"]', { timeout: 5000 });

  // Take screenshot of initial state
  await page.screenshot({ path: 'screenshots/workflows-initial.png', fullPage: true });

  // Find workflow card containing "Test workflow node history"
  const workflowCard = page.locator('text=Test workflow node history').locator('..').locator('..').locator('..');

  if (await workflowCard.count() === 0) {
    console.log('Test workflow not found, listing all workflows');
    const titles = await page.locator('h3').allTextContents();
    console.log('Available workflows:', titles);
    throw new Error('Test workflow "Test workflow node history" not found');
  }

  await expect(workflowCard).toBeVisible();

  // Find and click "Execution Graph" button
  const expandButton = workflowCard.locator('button:has-text("Execution Graph")');
  await expect(expandButton).toBeVisible();
  await expandButton.click();

  // Wait for nodes to load
  await page.waitForTimeout(1000);

  // Take screenshot after expansion
  await page.screenshot({ path: 'screenshots/workflows-expanded.png', fullPage: true });

  // Verify node list appeared
  const nodeList = workflowCard.locator('div').filter({ hasText: /planner|executor|reviewer/ }).first();
  await expect(nodeList).toBeVisible();

  // Verify status badges are present (looking for the icon characters)
  const badges = workflowCard.locator('[class*="Badge"]');
  const badgeCount = await badges.count();
  console.log(`Found ${badgeCount} badges`);
  expect(badgeCount).toBeGreaterThan(3); // At least status badge + 3 node badges

  // Verify role/actor info is present
  const hasRoleInfo = await workflowCard.locator('text=/planner:|executor:|reviewer:/').count();
  console.log(`Found ${hasRoleInfo} role labels`);
  expect(hasRoleInfo).toBeGreaterThan(0);

  console.log('✓ Workflow execution graph verified');
});

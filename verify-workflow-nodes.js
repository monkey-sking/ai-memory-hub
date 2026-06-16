import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to workflows page...');
    await page.goto('http://127.0.0.1:38787/workflows');
    await page.waitForLoadState('networkidle');

    // Take initial screenshot
    fs.mkdirSync('screenshots', { recursive: true });
    await page.screenshot({ path: 'screenshots/workflows-initial.png', fullPage: true });
    console.log('✓ Initial screenshot saved');

    // Find workflow cards
    const workflowCards = await page.locator('h3').allTextContents();
    console.log(`Found ${workflowCards.length} workflow cards:`, workflowCards.slice(0, 5));

    // Find the test workflow
    const testWorkflow = workflowCards.find(title => title.includes('Test workflow node history'));
    if (!testWorkflow) {
      console.log('⚠️  Test workflow "Test workflow node history" not found');
      console.log('Available workflows:', workflowCards);
      await browser.close();
      return;
    }

    console.log(`✓ Found workflow: "${testWorkflow}"`);

    // Click the workflow's "Execution Graph" button
    const card = page.locator(`h3:has-text("${testWorkflow}")`).locator('../..');
    const expandButton = card.locator('button:has-text("Execution Graph")');

    const isVisible = await expandButton.isVisible();
    if (!isVisible) {
      console.log('✗ Execution Graph button not visible');
      await browser.close();
      process.exit(1);
    }

    console.log('✓ Execution Graph button found, clicking...');
    await expandButton.click();
    await page.waitForTimeout(1500);

    // Take expanded screenshot
    await page.screenshot({ path: 'screenshots/workflows-expanded.png', fullPage: true });
    console.log('✓ Expanded screenshot saved');

    // Check for node list
    const nodeElements = await card.locator('text=/planner:|executor:|reviewer:/').count();
    console.log(`Found ${nodeElements} node role labels`);

    if (nodeElements === 0) {
      console.log('✗ No node role labels found after expansion');
      await browser.close();
      process.exit(1);
    }

    // Check for status badges
    const badgeCount = await card.locator('[class*="badge"]').count();
    console.log(`Found ${badgeCount} badges in the card`);

    console.log('\n✅ PASS: Execution graph expands and displays node list with role/actor info');

  } catch (err) {
    console.error('✗ FAIL:', err.message);
    await page.screenshot({ path: 'screenshots/error.png', fullPage: true });
    await browser.close();
    process.exit(1);
  }

  await browser.close();
})();

import { chromium } from 'playwright';
import fs from 'fs';

if (process.env.RUN_MANUAL_DASHBOARD_VERIFY !== '1') {
  console.log('Skipping manual dashboard verification. Set RUN_MANUAL_DASHBOARD_VERIFY=1 to run.');
  process.exit(0);
}

const screenshotsDir = 'docs/screenshots';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to workflows page...');
    await page.goto('http://127.0.0.1:38787/workflows');
    await page.waitForLoadState('networkidle');

    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Find Phase 3 test workflows
    const workflowCards = await page.locator('h3').allTextContents();
    console.log(`Found ${workflowCards.length} workflow cards`);

    const phase3Workflows = workflowCards.filter(t =>
      t.includes('Test Phase 3') || t.includes('Test rejection')
    );
    console.log(`Phase 3 test workflows: ${phase3Workflows.length}`);

    if (phase3Workflows.length === 0) {
      console.log('⚠️  No Phase 3 test workflows found');
      await page.screenshot({ path: `${screenshotsDir}/workflows-overview.png`, fullPage: true });
      await browser.close();
      return;
    }

    // Expand first Phase 3 workflow (all nodes completed)
    const workflow1Title = phase3Workflows[0];
    console.log(`\n📋 Testing: "${workflow1Title}"`);

    const card1 = page.locator(`h3:has-text("${workflow1Title}")`).locator('../..');
    const expandBtn1 = card1.locator('button:has-text("Execution Graph")');

    await expandBtn1.scrollIntoViewIfNeeded();
    await expandBtn1.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${screenshotsDir}/phase3-completed-workflow.png`, fullPage: true });
    console.log('✓ Screenshot: phase3-completed-workflow.png');

    // Check node details
    const nodeCount1 = await card1.locator('text=/planner:|executor:|reviewer:/').count();
    console.log(`  Nodes visible: ${nodeCount1}`);

    const autoNotes1 = await card1.locator('text=/Auto-/').count();
    console.log(`  Auto-marked notes: ${autoNotes1}`);

    // Expand second workflow if exists (rejection case)
    if (phase3Workflows.length > 1) {
      const workflow2Title = phase3Workflows[1];
      console.log(`\n📋 Testing: "${workflow2Title}"`);

      const card2 = page.locator(`h3:has-text("${workflow2Title}")`).locator('../..');
      const expandBtn2 = card2.locator('button:has-text("Execution Graph")');

      await expandBtn2.scrollIntoViewIfNeeded();
      await expandBtn2.click();
      await page.waitForTimeout(1000);

      await page.screenshot({ path: `${screenshotsDir}/phase3-rejected-workflow.png`, fullPage: true });
      console.log('✓ Screenshot: phase3-rejected-workflow.png');

      const nodeCount2 = await card2.locator('text=/planner:|executor:|reviewer:/').count();
      console.log(`  Nodes visible: ${nodeCount2}`);

      const rejectedNodes = await card2.locator('text=/rejected|Reject/i').count();
      console.log(`  Rejected indicators: ${rejectedNodes}`);
    }

    console.log('\n✅ Phase 3 verification screenshots captured');

  } catch (err) {
    console.error('✗ Error:', err.message);
    await page.screenshot({ path: `${screenshotsDir}/error-phase3.png`, fullPage: true });
    await browser.close();
    process.exit(1);
  }

  await browser.close();
})();

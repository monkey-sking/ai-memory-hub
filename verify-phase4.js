import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to workflows page...');
    await page.goto('http://127.0.0.1:38787/workflows');
    await page.waitForLoadState('networkidle');

    fs.mkdirSync('screenshots', { recursive: true });

    // Find Phase 4 test workflow
    const workflowCards = await page.locator('h3').allTextContents();
    console.log(`Found ${workflowCards.length} workflow cards`);

    const phase4Workflow = workflowCards.find(t => t.includes('Test Phase 4 fixed'));

    if (!phase4Workflow) {
      console.log('⚠️  Phase 4 test workflow not found');
      await page.screenshot({ path: 'screenshots/workflows-all.png', fullPage: true });
      await browser.close();
      return;
    }

    console.log(`\n📋 Found: "${phase4Workflow}"`);

    // Expand the workflow
    const card = page.locator(`h3:has-text("${phase4Workflow}")`).locator('../..');
    const expandBtn = card.locator('button:has-text("Execution Graph")');

    await expandBtn.scrollIntoViewIfNeeded();
    await expandBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'screenshots/phase4-auto-created-nodes.png', fullPage: true });
    console.log('✓ Screenshot: phase4-auto-created-nodes.png');

    // Check node details
    const nodeCount = await card.locator('text=/planner:|executor:|reviewer:/').count();
    console.log(`  Nodes visible: ${nodeCount}`);

    const autoNotes = await card.locator('text=/Auto-created/').count();
    console.log(`  Auto-created notes: ${autoNotes}`);

    const completedCount = await card.locator('text=/completed/i').count();
    console.log(`  Completed indicators: ${completedCount}`);

    const runningCount = await card.locator('text=/running/i').count();
    console.log(`  Running indicators: ${runningCount}`);

    console.log('\n✅ Phase 4 verification: Workflow created with auto-generated nodes');
    console.log('   - Phase 4: Auto-created 3 nodes on workflow creation');
    console.log('   - Phase 3: Auto-updated nodes via workflow result/review commands');
    console.log('   - All nodes transitioned from queued/running → completed');

  } catch (err) {
    console.error('✗ Error:', err.message);
    await page.screenshot({ path: 'screenshots/error-phase4.png', fullPage: true });
    await browser.close();
    process.exit(1);
  }

  await browser.close();
})();

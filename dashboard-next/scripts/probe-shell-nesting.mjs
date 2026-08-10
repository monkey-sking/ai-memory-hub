// Measures PageShell nesting fallout: how many page-shell sections a route
// renders, the real pixel rhythm between the heading and the first content
// element, and how many scroll containers exist.
//
// /workflows and /projects render their own <PageShell> inside the outer one
// that Dashboard.tsx now provides, so they are compared against /tools and
// /health, which are not nested.
//
// Usage: node scripts/probe-shell-nesting.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || process.env.BASE || 'http://localhost:5271';
const ROUTES = ['/workflows', '/projects', '/tools', '/health', '/memory', '/settings'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const rows = [];

for (const route of ROUTES) {
  const res = await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => null);
  if (!res || !res.ok()) { console.log('SKIP ' + route); continue; }
  // The console holds a live realtime connection, so `networkidle` can resolve
  // before React has swapped the route in. Poll for the shell instead of
  // guessing a fixed wait — a fixed 700ms wait made /memory read as 0 shells.
  await page.waitForSelector('[data-slot="page-shell"]', { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => {
    const round = (n) => Math.round(n * 100) / 100;

    const shells = [...document.querySelectorAll('[data-slot="page-shell"]')].map((el, i) => {
      const cs = getComputedStyle(el);
      const kids = [...el.children];
      // Gaps that a flex `gap` actually paints: only between rendered children.
      const paintedGaps = [];
      for (let k = 1; k < kids.length; k += 1) {
        paintedGaps.push(round(kids[k].getBoundingClientRect().top - kids[k - 1].getBoundingClientRect().bottom));
      }
      return {
        index: i,
        display: cs.display,
        rowGap: cs.rowGap,
        marginTop: cs.marginTop,
        marginBottom: cs.marginBottom,
        paddingTop: cs.paddingTop,
        childCount: kids.length,
        childSlots: kids.map((c) => c.getAttribute('data-slot') || c.tagName.toLowerCase()),
        // gap only paints when there are >= 2 children
        paintedGaps,
        top: round(el.getBoundingClientRect().top),
      };
    });

    // The rhythm a human actually sees: bottom of the h1/description block to
    // the top of the first painted element of the body content.
    const h1 = document.querySelector('h1');
    const header = document.querySelector('[data-slot="page-shell-header"]');
    let headingToContent = null;
    let firstContentDesc = null;
    if (header) {
      const outerContent = header.parentElement.querySelector(':scope > [data-slot="page-shell-content"]');
      // Walk down through wrapper elements that paint nothing, to the first box
      // that actually has a border/background — that is what the eye anchors on.
      let node = outerContent;
      while (node) {
        const next = [...node.children].find((c) => c.getBoundingClientRect().height > 0);
        if (!next) break;
        const cs = getComputedStyle(next);
        const paints = cs.borderTopWidth !== '0px' ||
          (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
        node = next;
        if (paints) break;
      }
      if (node) {
        headingToContent = round(node.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
        firstContentDesc = (node.getAttribute('data-slot') || node.tagName.toLowerCase()) +
          '.' + (typeof node.className === 'string' ? node.className.split(' ').slice(0, 3).join('.') : '');
      }
    }

    // Every element that can scroll vertically on its own.
    const scrollers = [];
    const doc = document.scrollingElement;
    if (doc && doc.scrollHeight > doc.clientHeight + 1) {
      scrollers.push({ what: 'document', overflowY: getComputedStyle(document.body).overflowY, extra: doc.scrollHeight - doc.clientHeight });
    }
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (!['auto', 'scroll', 'overlay'].includes(cs.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      scrollers.push({
        what: (el.getAttribute('data-slot') || el.tagName.toLowerCase()) +
          (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''),
        overflowY: cs.overflowY,
        extra: el.scrollHeight - el.clientHeight,
      });
    }

    // Structural rhythm, independent of what the first child happens to paint:
    // bottom of the outer header to the top of the outer content box.
    let structuralGap = null;
    const outerShell = document.querySelector('[data-slot="page-shell"]');
    if (outerShell) {
      const hdr = outerShell.querySelector(':scope > [data-slot="page-shell-header"]');
      const cnt = outerShell.querySelector(':scope > [data-slot="page-shell-content"]');
      if (hdr && cnt) structuralGap = round(cnt.getBoundingClientRect().top - hdr.getBoundingClientRect().bottom);
    }

    // Every wrapper between the outer content box and the first Panel, with the
    // box-model contribution of each. Anything non-zero here is real extra space.
    const chain = [];
    if (outerShell) {
      let node = outerShell.querySelector(':scope > [data-slot="page-shell-content"]');
      let guard = 0;
      while (node && guard < 12) {
        guard += 1;
        const cs = getComputedStyle(node);
        chain.push({
          tag: (node.getAttribute('data-slot') || node.tagName.toLowerCase()),
          cls: typeof node.className === 'string' ? node.className.split(' ').slice(0, 3).join('.') : '',
          display: cs.display,
          rowGap: cs.display.includes('flex') || cs.display.includes('grid') ? cs.rowGap : '-',
          children: node.children.length,
          mt: cs.marginTop, mb: cs.marginBottom, pt: cs.paddingTop, pb: cs.paddingBottom,
        });
        if (node.getAttribute('data-slot') === 'panel' || node.className.toString().includes('panel')) break;
        node = [...node.children].find((c) => c.getBoundingClientRect().height > 0);
      }
    }

    return {
      shellCount: shells.length,
      shells,
      h1Count: document.querySelectorAll('h1').length,
      h1Text: h1 ? h1.innerText.trim() : null,
      headingToContent,
      firstContentDesc,
      structuralGap,
      chain,
      scrollers,
    };
  });

  rows.push({ route, ...data });

  console.log('\n=== ' + route + ' ===');
  console.log('  page-shell sections: ' + data.shellCount + '   h1: ' + data.h1Count + ' ' + JSON.stringify(data.h1Text));
  for (const s of data.shells) {
    console.log('   [' + s.index + '] display=' + s.display + ' row-gap=' + s.rowGap +
      ' children=' + s.childCount + ' ' + JSON.stringify(s.childSlots));
    console.log('        margin=' + s.marginTop + '/' + s.marginBottom + ' padTop=' + s.paddingTop +
      ' painted-gaps-between-children=' + JSON.stringify(s.paintedGaps) +
      (s.childCount < 2 ? '  <- single child: row-gap paints nothing' : ''));
  }
  console.log('  STRUCTURAL header-bottom -> content-top: ' + data.structuralGap + 'px');
  console.log('  heading-block bottom -> first painted content top: ' + data.headingToContent + 'px  (' + data.firstContentDesc + ')');
  console.log('  wrapper chain outer-content -> first panel:');
  for (const c of data.chain) {
    console.log('        ' + c.tag + (c.cls ? '.' + c.cls : '') +
      '  display=' + c.display + ' row-gap=' + c.rowGap + ' children=' + c.children +
      ' margin=' + c.mt + '/' + c.mb + ' padding=' + c.pt + '/' + c.pb);
  }
  console.log('  scroll containers: ' + data.scrollers.length + ' ' +
    JSON.stringify(data.scrollers.map((s) => s.what + '(' + s.overflowY + ',+' + s.extra + ')')));
}

await browser.close();

console.log('\n================ SUMMARY ================');
const nested = rows.filter((r) => r.shellCount > 1);
const flat = rows.filter((r) => r.shellCount === 1);
console.log('nested routes : ' + nested.map((r) => r.route + '(' + r.shellCount + ' shells, rhythm ' + r.headingToContent + 'px, ' + r.scrollers.length + ' scrollers)').join(', '));
console.log('flat routes   : ' + flat.map((r) => r.route + '(' + r.shellCount + ' shell, rhythm ' + r.headingToContent + 'px, ' + r.scrollers.length + ' scrollers)').join(', '));
const rhythms = [...new Set(rows.map((r) => r.structuralGap))];
console.log('distinct STRUCTURAL header->content gaps: ' + JSON.stringify(rhythms) +
  (rhythms.length === 1 ? '  => no doubled gap from nesting' : '  => CHECK: routes disagree'));
console.log('(first-painted-content rhythms vary by panel padding, not by nesting: ' +
  JSON.stringify(rows.map((r) => r.route + '=' + r.headingToContent)) + ')');
const scrollCounts = [...new Set(rows.map((r) => r.scrollers.length))];
console.log('distinct scroll-container counts: ' + JSON.stringify(scrollCounts) +
  (scrollCounts.length === 1 ? '  => no extra scroll container' : '  => CHECK: routes disagree'));

import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto("http://127.0.0.1:5177/swap", { waitUntil: "networkidle" }).catch(()=>{});
await p.waitForTimeout(2000);
console.log(await p.evaluate(() => {
  const inp = document.querySelector('input[aria-label="You pay"]') || document.querySelectorAll('input[inputmode="decimal"]')[0];
  const cs = getComputedStyle(inp);
  const grid = document.querySelector('.grid.gap-4');
  const g = getComputedStyle(grid);
  return JSON.stringify({
    minWidth: cs.minWidth, flex: cs.flex, width: cs.width, size: inp.getAttribute("size"),
    gridCols: g.gridTemplateColumns, gridAutoCols: g.gridAutoColumns, gridW: grid.getBoundingClientRect().width,
  }, null, 2);
}));
await b.close();

// check-room.js
//
// Checks the D'Andrea Mare Beach reservation page for a specific stay
// (check-in date + number of nights) and alerts on Telegram only if a
// target room type has EVERY night of that stay bookable online
// (not "Sold Out" and not "call us only").
//
// The page renders a grid: room name header, then one row per rate
// plan (e.g. "All Inclusive - Non Refundable"), with one status cell
// per date column (either "SOLD OUT", a phone icon with no price
// text, or a bookable price). There's no guarantee about the
// underlying HTML/CSS classes, so instead of relying on selectors we
// match cells to date columns by their on-screen X position -- this is
// more robust against markup changes.
//
// IMPORTANT: this was written from a screenshot the user shared, not
// from live access to the site (bot detection blocks direct fetches
// from here). Verify it against the debug artifacts before trusting
// it -- see README.

const { chromium } = require('playwright');

const URL_STR =
  'https://dandreamarebeach.reserve-online.net/?checkin=2026-08-13&rooms=1&nights=5&adults=2&infants=1&src=785';

const CHECKIN_DATE = '2026-08-13'; // YYYY-MM-DD
const NIGHTS = 5;

const ROOM_NAMES = ['Double Room Sea View', 'Double Room'];

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Build the list of date labels the site uses, e.g. "Aug 13", for
// every night of the stay (check-in through check-in + nights - 1).
function buildTargetDateLabels(checkinISO, nights) {
  const labels = [];
  const start = new Date(checkinISO + 'T00:00:00Z');
  for (let i = 0; i < nights; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = d.getUTCDate(); // no leading zero, matches site format e.g. "Aug 13"
    labels.push(`${month} ${day}`);
  }
  return labels;
}

async function main() {
  const targetDateLabels = buildTargetDateLabels(CHECKIN_DATE, NIGHTS);
  console.log(`[${new Date().toISOString()}] Target date columns: ${targetDateLabels.join(', ')}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1600, height: 1000 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  console.log('Loading page...');
  await page.goto(URL_STR, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);

  const debugInfo = { targetDateLabels, rooms: {} };

  if (process.env.DEBUG) {
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    const bodyText = await page.innerText('body');
    require('fs').writeFileSync('debug-page-text.txt', bodyText);
  }

  const foundAvailable = [];

  for (const roomName of ROOM_NAMES) {
    const result = await isRoomAvailableForStay(page, roomName, targetDateLabels);
    debugInfo.rooms[roomName] = result;
    console.log(`  -> ${roomName}: ${result.available ? 'AVAILABLE for full stay' : 'not available'} (${result.reason})`);
    if (result.available) foundAvailable.push(roomName);
  }

  if (process.env.DEBUG) {
    require('fs').writeFileSync('debug-availability.json', JSON.stringify(debugInfo, null, 2));
  }

  await browser.close();

  if (foundAvailable.length > 0) {
    const msg =
      `🏨 חדר התפנה לכל התאריכים!\n` +
      foundAvailable.map((r) => `• ${r}`).join('\n') +
      `\n\nצ'ק אין: ${CHECKIN_DATE}, ${NIGHTS} לילות\n${URL_STR}`;
    console.log('Sending Telegram alert...');
    await sendTelegram(msg);
  } else {
    console.log('No target room fully available for the whole stay.');
  }
}

// Collect every visible text node on the page with its on-screen
// bounding box (center X, top/bottom Y), so we can match cells to
// date columns purely by geometry.
async function getTextNodesWithRects(page) {
  return await page.evaluate(() => {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) continue;
      const rect = rects[0];
      if (rect.width === 0 || rect.height === 0) continue;
      results.push({
        text,
        x: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
      });
    }
    return results;
  });
}

async function isRoomAvailableForStay(page, roomName, targetDateLabels) {
  const nodes = await getTextNodesWithRects(page);
  const roomHeaders = nodes.filter((n) => n.text === roomName);

  if (roomHeaders.length === 0) {
    return { available: false, reason: 'room section header not found on page' };
  }

  for (const header of roomHeaders) {
    // Date header row: text like "Aug 13" appearing shortly below the room header
    const dateCandidates = nodes
      .filter((n) => n.top > header.bottom && n.top < header.bottom + 150)
      .filter((n) => /^[A-Z][a-z]{2}\s\d{1,2}$/.test(n.text));

    if (dateCandidates.length === 0) continue;

    const headerRowTop = Math.min(...dateCandidates.map((n) => n.top));
    const headerRow = dateCandidates.filter((n) => Math.abs(n.top - headerRowTop) < 8);

    const targetCols = targetDateLabels
      .map((label) => headerRow.find((n) => n.text === label))
      .filter(Boolean);

    if (targetCols.length < targetDateLabels.length) {
      // This section instance doesn't show all our target dates (e.g. scrolled columns)
      continue;
    }

    // Rate-plan rows live below the date header, before the next room section
    const bandNodes = nodes.filter((n) => n.top > headerRowTop + 10 && n.top < headerRowTop + 400);
    const rowTops = [...new Set(bandNodes.map((n) => Math.round(n.top / 8) * 8))].sort((a, b) => a - b);

    for (const rt of rowTops) {
      const rowNodes = bandNodes.filter((n) => Math.abs(n.top - rt) < 20);

      let allBookable = true;
      const cellSummaries = [];
      for (const col of targetCols) {
        const cellNodes = rowNodes.filter((n) => Math.abs(n.x - col.x) < 45);
        const cellText = cellNodes.map((n) => n.text).join(' ').toUpperCase();
        cellSummaries.push(`${col.text}: "${cellText}"`);

        if (cellText.includes('SOLD OUT')) {
          allBookable = false;
          break;
        }
        const hasPrice = /[€$₪]\s?\d/.test(cellText);
        if (!hasPrice) {
          // No price and no "sold out" text usually means a phone/"call
          // us" icon-only cell -- treat as not self-bookable.
          allBookable = false;
          break;
        }
      }

      if (allBookable) {
        return { available: true, reason: `all ${targetDateLabels.length} nights bookable in one rate plan`, cells: cellSummaries };
      }
    }
  }

  return { available: false, reason: 'no rate plan had every night bookable' };
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars -- cannot send alert.');
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
  if (!res.ok) {
    console.error('Telegram send failed:', res.status, await res.text());
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

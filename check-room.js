// check-room.js
//
// Checks the D'Andrea Mare Beach reservation page for availability of
// "Double Room" or "Double Room Sea View" for a fixed date range, and
// sends a Telegram message if either one looks bookable.
//
// This site uses bot detection, so we drive a real headless browser
// (Playwright + Chromium) with a normal user agent instead of a plain
// HTTP request.
//
// IMPORTANT: Booking-engine markup varies a lot and can change without
// notice. The "is it available" heuristic below is intentionally
// conservative (see isRoomAvailable). Run this once locally with
// DEBUG=1 to see the extracted text and a screenshot, then adjust the
// keyword lists if needed before relying on it.

const { chromium } = require('playwright');

const URL =
  'https://dandreamarebeach.reserve-online.net/?checkin=2026-08-13&rooms=1&nights=5&adults=2&infants=1&src=785';

// Room names we care about (case-insensitive substring match)
const ROOM_NAMES = ['Double Room Sea View', 'Double Room'];

// Telegram credentials, injected as GitHub Actions secrets / env vars
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Words that indicate a room block is actually available to book
const AVAILABLE_HINTS = ['book now', 'select', 'reserve', 'add to cart', 'choose room', 'ILS', '₪', '$'];
// Words that indicate a room block is explicitly NOT available
const UNAVAILABLE_HINTS = ['sold out', 'not available', 'unavailable', 'fully booked', 'no availability'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  console.log(`[${new Date().toISOString()}] Loading page...`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

  // Give the booking widget time to render room cards via JS
  await page.waitForTimeout(5000);

  if (process.env.DEBUG) {
    await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
    const bodyText = await page.innerText('body');
    require('fs').writeFileSync('debug-page-text.txt', bodyText);
    console.log('DEBUG: saved debug-screenshot.png and debug-page-text.txt');
  }

  const foundAvailable = [];

  for (const roomName of ROOM_NAMES) {
    const available = await isRoomAvailable(page, roomName);
    console.log(`  -> ${roomName}: ${available ? 'AVAILABLE' : 'not available / not found'}`);
    if (available) foundAvailable.push(roomName);
  }

  await browser.close();

  if (foundAvailable.length > 0) {
    const msg =
      `🏨 חדר התפנה!\n` +
      foundAvailable.map((r) => `• ${r}`).join('\n') +
      `\n\nתאריכים: 13/08/2026, 5 לילות, 2 מבוגרים + תינוק\n${URL}`;
    console.log('Sending Telegram alert...');
    await sendTelegram(msg);
  } else {
    console.log('No target room available right now.');
  }
}

// Heuristic availability check: find text blocks mentioning the room
// name, then look at nearby text for "available" vs "sold out" signals.
async function isRoomAvailable(page, roomName) {
  // Grab all elements whose visible text contains the room name
  const matches = await page.evaluate((name) => {
    const nameLower = name.toLowerCase();
    const all = Array.from(document.querySelectorAll('body *'));
    const results = [];
    for (const el of all) {
      const text = el.textContent || '';
      if (
        text.toLowerCase().includes(nameLower) &&
        // prefer smaller, more specific containers over huge wrapper divs
        text.length < 2000
      ) {
        results.push(text.trim());
      }
    }
    // Return the shortest matching blocks (most specific to this room)
    return results.sort((a, b) => a.length - b.length).slice(0, 5);
  }, roomName);

  if (matches.length === 0) return false;

  const combined = matches.join(' \n ').toLowerCase();

  const hasUnavailable = UNAVAILABLE_HINTS.some((w) => combined.includes(w));
  if (hasUnavailable) return false;

  const hasAvailableHint = AVAILABLE_HINTS.some((w) => combined.includes(w.toLowerCase()));
  return hasAvailableHint;
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars — cannot send alert.');
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

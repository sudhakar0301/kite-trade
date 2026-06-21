require('dotenv').config();
const fetch = require('node-fetch');

const STREAK_SCANNER_URL = 'https://scanner.streak.tech/api/scanner';

function buildRequestBody() {
  return {
    condition:
      process.env.STREAK_CONDITION ||
      'RSI(14,0) higher than 65 and Plus DI(14,0) higher than 25 and ADX(14,0) higher than Minus DI(14,0) and EMA(close, 3, 0) higher than EMA(close, 5, 0) and multitime frame completed(5min,Plus DI(14,0) higher than Minus DI(14,0)) and multitime frame completed(5min,Low(0) lower than Close(-1)) and multitime frame completed(5min,High(0) higher than equal to Close(-1))',
    scan_on: process.env.STREAK_SCAN_ON || 'nifty_500',
    time_frame: process.env.STREAK_TIME_FRAME || 'min',
    chart_type: process.env.STREAK_CHART_TYPE || 'candlestick',
    slug: process.env.STREAK_SLUG || 'custom-streak-scan',
    basket: []
  };
}

async function runStreakScan() {
  const token = process.env.STREAK_AUTH_TOKEN;
  if (!token) {
    console.error('Missing STREAK_AUTH_TOKEN in environment.');
    process.exit(1);
  }

  const body = buildRequestBody();

  const response = await fetch(STREAK_SCANNER_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      authorization: token,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    parsed = null;
  }

  console.log('Streak status:', response.status);
  console.log('Streak ok:', response.ok);

  if (parsed) {
    console.log('Streak response JSON:');
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    console.log('Streak response text:');
    console.log(rawText);
  }

  if (!response.ok) {
    process.exit(2);
  }
}

runStreakScan().catch((error) => {
  console.error('Streak scan request failed:', error.message);
  process.exit(3);
});

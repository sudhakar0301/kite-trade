const fs = require('fs');
const path = require('path');
const instruments = require('../data/nse500.json');
const { broadcastLog } = require('../ws/logger');
const { calculateVWAP, calculateEMA, calculateRSI } = require('./indicators');
const { getHistoricalData } = require('../utils/dataFetcher');

let PQueue;
let queue;

// Initialize PQueue with dynamic import
(async () => {
  const { default: PQueueClass } = await import('p-queue');
  PQueue = PQueueClass;
  queue = new PQueue({ interval: 1000, intervalCap: 2 });
})();
const outputPath = path.join(__dirname, '../data/filtered_instruments.json');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(date) {
  return date.toISOString().replace('T', ' ').split('.')[0];
}

function getFromDate(daysAgo) {
  const from = new Date();
  from.setDate(from.getDate() - daysAgo);
  from.setHours(9, 15, 0, 0);
  return from;
}

async function fetchTF(token, interval, daysBack) {
  // Wait for queue to be initialized
  while (!queue) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const from = formatDate(getFromDate(daysBack));
  const to = formatDate(new Date());
  return await queue.add(() => getHistoricalData(token, interval, from, to));
}

async function getAllTimeframes(token) {
  return {
    tf1h: await fetchTF(token, '60minute', 45),
    tf15m: await fetchTF(token, '15minute', 14),
    tf5m: await fetchTF(token, '5minute', 7),
    tf1m: await fetchTF(token, 'minute', 2),
  };
}

function extractIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  return {
    ema: calculateEMA(closes, 9),
    vwap: calculateVWAP(candles),
    rsi: calculateRSI(closes, 14)
  };
}

async function scanInstrument(instrument, selected) {
  const { instrument_token, tradingsymbol } = instrument;

  try {
    const { tf1h, tf15m, tf5m, tf1m } = await getAllTimeframes(instrument_token);

    const h1 = extractIndicators(tf1h);
    const m15 = extractIndicators(tf15m);
    const cond1 = h1.rsi > 60;
    const cond2 = m15.rsi > 60;

    if (cond1 && cond2) {
      selected.push(instrument_token);
      global.cache[instrument_token] = {
        candles: tf1m.slice(-200),
        lastUpdated: new Date()
      };
    }
  } catch (err) {
    console.error(`⛔ ${tradingsymbol} error:`, err.message);
  }

  await delay(600);
}

async function batchedScan(instruments, batchSize = 5, delayMs = 1000, selected) {
  const total = instruments.length;
  broadcastLog(`📦 Total instruments: ${total}`);

  for (let i = 0; i < total; i += batchSize) {
    const batch = instruments.slice(i, i + batchSize);
    broadcastLog(`🌀 Batch ${Math.floor(i / batchSize) + 1} (${i + 1} to ${Math.min(i + batch.length, total)})`);

    for (const instrument of batch) {
      await scanInstrument(instrument, selected);
    }

    if (i + batchSize < total) {
      await delay(delayMs);
    }
  }
}

async function runScanAndSubscribe() {
  const selected = [];
  const filtered = instruments.instruments.filter(i => i.exchange === 'NSE' && i.instrument_type === 'EQ');

  broadcastLog(`🔍 Scanning ${filtered.length} instruments...`);
  await batchedScan(filtered, 5, 1000, selected);

  fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2));
  broadcastLog(`📄 Saved ${selected.length} instruments to filtered_instruments.json`);

  return selected;
}

module.exports = { runScanAndSubscribe, getHistoricalData };

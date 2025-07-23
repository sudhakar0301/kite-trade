//const { getHistoricalData } = require('../kite/historical');
const instruments = require('../data/nse500.json');
const { broadcastLog } = require('../ws/logger');
const { getKiteConnect } = require('../kite/connection');

// Cache object to hold historical data
global.cache = {}; // Format: { [instrument_token]: { candles: [...], lastUpdated: timestamp } }

async function buildCache() {
  broadcastLog('📦 Building historical data cache...');

  let success = 0, failed = 0;

  for (const instrument of instruments.instruments) {
    try {
      const candles = await getKiteConnect().getHistoricalData(instrument.instrument_token, 'minute', 100);
      if (candles && candles.length) {
        global.cache[instrument.instrument_token] = {
          candles,
          lastUpdated: new Date(),
        };
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`❌ Failed caching ${instrument.tradingsymbol}`, err.message);
      failed++;
    }

    // Optional: Delay to avoid rate limits
    await new Promise(res => setTimeout(res, 200));
  }

  broadcastLog(`✅ Cache built: ${success} success, ${failed} failed`);
}

function updateCacheWithTick(token, tick) {
  const cacheEntry = global.cache[token];
  if (!cacheEntry || !cacheEntry.candles || !cacheEntry.candles.length) return;

  const candles = cacheEntry.candles;
  const last = candles[candles.length - 1];
  const now = new Date();

  // Append only if new minute
  const lastCandleTime = new Date(last[0]);
  if ((now - lastCandleTime) >= 60 * 1000) {
    const newCandle = [now.toISOString(), tick.open, tick.high, tick.low, tick.last_price, tick.volume];
    candles.push(newCandle);
    if (candles.length > 100) candles.shift(); // Keep last 100
    cacheEntry.lastUpdated = now;
  } else {
    // Update last candle
    last[4] = tick.last_price;
    last[5] = tick.volume;
  }
}

module.exports = {
  buildCache,
  updateCacheWithTick
};

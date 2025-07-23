const { KiteTicker } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
const { checkAndSellOnSubscription } = require("../orders/orderManager");
const { calculateRSIArray, calculateVWAP, calculateEMA } = require("../strategy/indicators");
const { getHistoricalData } = require("../strategy/scanner");
const { from15, to15, fromToday, to1 } = require("../utils/fromAndToDate");
const { updateTokenSubscriptions, setupCSVFileWatcher, parseTokensFromCSVWithSymbols, cleanupCSVWatcher } = require("../utils/tokenSubscriptionManager");
const instrumentsData = require("../data/nse500.json");
const instruments = instrumentsData.instruments; // Extract the instruments array

const accessTokenPath = path.join(__dirname, "../access_token.txt");
const api_key = 'r1a7qo9w30bxsfax';

// Read and validate access token
let access_token;
try {
  access_token = fs.readFileSync(accessTokenPath, "utf8").trim();
  console.log(`📋 Access token loaded: ${access_token.substring(0, 10)}...${access_token.substring(access_token.length - 5)}`);
  console.log(`🔑 Access token length: ${access_token.length}`);
} catch (error) {
  console.error(`❌ Error reading access token: ${error.message}`);
  process.exit(1);
}

let ticker = null;
let subscribedTokens = [];
let csvWatcher = null;

// Simple order cooldown to prevent multiple orders for same token
const lastOrderTime = {};
const ORDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Global order processing lock to ensure orders are placed one at a time
let isProcessingOrder = false;

// Import shared candle cache to prevent circular dependencies
const { candleCache } = require("../cache/sharedCache");

// Candle cache system for real-time indicator calculation
const CACHE_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds
const MAX_CACHE_CANDLES = 500; // Increased to 500 for better indicator accuracy
const MIN_CANDLES_REQUIRED = 100; // Minimum candles needed for calculation

// Structure for current candle being formed
function createCurrentCandle(tick, timestamp) {
  return {
    timestamp: timestamp,
    open: tick.last_price,
    high: tick.last_price,
    low: tick.last_price,
    close: tick.last_price,
    volume: tick.volume || tick.volume_traded || 0,
    oi: tick.oi || 0,
    tickCount: 1
  };
}

// Update current candle with new tick
function updateCurrentCandle(candle, tick) {
  candle.high = Math.max(candle.high, tick.last_price);
  candle.low = Math.min(candle.low, tick.last_price);
  candle.close = tick.last_price;
  candle.volume += (tick.volume || tick.volume_traded || 0);
  candle.oi = tick.oi || candle.oi;
  candle.tickCount++;
  return candle;
}

// Get current minute timestamp (rounded down to minute)
function getCurrentMinuteTimestamp() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.getTime();
}

// Get trading symbol from token
function getTradingSymbol(token) {
  const instrument = instruments.find(i => i.instrument_token == token);
  return instrument ? instrument.tradingsymbol : `TOKEN_${token}`;
}

// Initialize cache for a token with historical data
async function initializeCacheForToken(token, symbol) {
  try {
    if (candleCache.has(token)) {
      return; // Already initialized
    }

    console.log(`🔄 Initializing cache for ${symbol} (${token})`);
    
    // Fetch historical data for indicators (15 days for sufficient data)
    const historicalCandles = await getHistoricalData(token, "minute", from15, to15);
    if (!historicalCandles || historicalCandles.length < MIN_CANDLES_REQUIRED) {
      console.log(`⚠️ Not enough historical data for ${symbol}, got ${historicalCandles?.length || 0} candles, need at least ${MIN_CANDLES_REQUIRED}`);
      return false;
    }

    // Fetch today's data separately for accurate VWAP calculation
    const todaysCandles = await getHistoricalData(token, "minute", fromToday, to1);
  //  console.log(`📅 Fetched today's data for ${symbol}: ${todaysCandles?.length || 0} candles for VWAP`);
// Calculate initial VWAP from today's data
// Calculate initial VWAP from today's data
let initialVWAP = null;
if (todaysCandles && todaysCandles.length > 0) {
  
     try {
    const highs = todaysCandles.map(c => c.high);
    const lows = todaysCandles.map(c => c.low);
    const closes = todaysCandles.map(c => c.close);
    const volumes = todaysCandles.map(c => c.volume || 0);
    const vwapArray = calculateVWAP(highs, lows, closes, volumes);
    if(token == '1510401'){
      console.log(`📅 Fetched today's data for ${symbol}: ${todaysCandles?.length || 0} candles for VWAP`);
    }
    initialVWAP = vwapArray && vwapArray.length > 0 ? vwapArray[vwapArray.length - 1] : null;
    if (initialVWAP !== null && initialVWAP !== undefined && !isNaN(initialVWAP)) {
  
      console.log(`📊 Initial VWAP for ${symbol}: ${initialVWAP.toFixed(2)} (from ${todaysCandles.length} today's candles)`);
    } else {
      console.log(`⚠️ VWAP calculation returned invalid value for ${symbol}: ${initialVWAP}`);
      initialVWAP = null;
    }
  } catch (error) {
    console.error(`❌ Error calculating initial VWAP for ${symbol}: ${error.message}`);
    initialVWAP = null;
  }
}
    // Initialize cache with more historical data
 candleCache.set(token, {
  historical: historicalCandles.slice(-MAX_CACHE_CANDLES),
  todaysHistorical: todaysCandles.slice() || [],
  current: null,
  latestVWAP: initialVWAP, // Store the initial VWAP value
  lastUpdate: Date.now(),
  symbol: symbol
});

   // console.log(`✅ Cache initialized for ${symbol} with ${Math.min(historicalCandles.length, MAX_CACHE_CANDLES)} historical candles (total available: ${historicalCandles.length}) and ${todaysCandles?.length || 0} today's candles`);
    return true;
  } catch (error) {
    console.error(`❌ Error initializing cache for ${symbol}: ${error.message}`);
    return false;
  }
}

// Process tick and update candle cache
function processTickForCache(tick) {
  const token = tick.instrument_token;
  const currentMinute = getCurrentMinuteTimestamp();

  if (!candleCache.has(token)) {
    return null; // Cache not initialized yet
  }

  const cache = candleCache.get(token);

  // Check if we need to start a new candle (new minute)
  if (!cache.current || cache.current.timestamp < currentMinute) {
    // Push previous candle to historical if it exists
    if (cache.current) {
      cache.historical.push(cache.current);

      // Keep only last 500 candles
      if (cache.historical.length > MAX_CACHE_CANDLES) {
        cache.historical = cache.historical.slice(-MAX_CACHE_CANDLES);
      }

           // ✅ Update VWAP based on today's candles + this completed one
      const todayCandles = (cache.todaysHistorical || []).concat(cache.current);
      const highs = todayCandles.map(c => c.high);
      const lows = todayCandles.map(c => c.low);
      const closes = todayCandles.map(c => c.close);
      const volumes = todayCandles.map(c => c.volume || 0);
    //  const vwapArray = calculateVWAP(highs, lows, closes, volumes);
    //  const vwapValue = vwapArray && vwapArray.length > 0 ? vwapArray[vwapArray.length - 1] : null;
      // if (!isNaN(vwapValue)) {
      //   cache.latestVWAP = vwapValue;
      //   console.log(`📈 VWAP updated for ${cache.symbol}: ${vwapValue.toFixed(2)}`);
      // } else {
      //   console.warn(`⚠️ VWAP could not be calculated for ${cache.symbol}`);
      // }

      console.log(`📊 New candle completed for ${cache.symbol}: ${cache.current.close} (${cache.current.tickCount} ticks) - Cache: ${cache.historical.length} candles`);
    }

    // Start new candle
    cache.current = createCurrentCandle(tick, currentMinute);
    console.log(`🕐 Started new candle for ${cache.symbol} at ${new Date(currentMinute).toLocaleTimeString()}`);
  } else {
    // Update current candle with new tick
    updateCurrentCandle(cache.current, tick);
  }

  cache.lastUpdate = Date.now();
  cache.ltp = tick.last_price;
  return cache;
}


// Calculate live indicators using cache + current candle
function calculateLiveIndicators(token) {
  const cache = candleCache.get(token);
  if (!cache) return null;

  try {
    // Combine historical + current candle for indicator calculation
    const allCandles = [...cache.historical];
    if (cache.current) {
      allCandles.push(cache.current);
    }

    // if (allCandles.length < 50) {
    //   console.log(`⚠️ Not enough candles for ${cache.symbol}: ${allCandles.length}, need at least 50`);
    //   return null; // Not enough data for proper indicator calculation
    // }

    // Extract OHLCV data for RSI/EMA calculations
    const closes = allCandles.map(c => c.close);
    const highs = allCandles.map(c => c.high);
    const lows = allCandles.map(c => c.low);
    const volumes = allCandles.map(c => c.volume || 0);

    
        // Get today's candle count for reporting (but VWAP uses cached value)
    let todayCandleCount = 0;
    if (cache.todaysHistorical && cache.todaysHistorical.length > 0) {
      todayCandleCount = cache.todaysHistorical.length + (cache.current ? 1 : 0);
    } else {
      // Fallback: Count today's candles from all data
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      
      const todayCandles = allCandles.filter(c => {
        let candleTime;
        if (c.timestamp) {
          candleTime = c.timestamp;
        } else if (c.date) {
          candleTime = new Date(c.date).getTime();
        } else {
          return false;
        }
        return candleTime >= todayStart;
      });
      todayCandleCount = todayCandles.length;
    }

    // Use cached VWAP that's calculated only on candle formation (1-minute intervals)
    // This avoids recalculating VWAP on every tick for better performance
    let vwap = cache.latestVWAP || null;
    
    // Only log VWAP debug info occasionally to reduce spam
    if (Math.random() < 0.02) { // 2% sampling
      console.log(`📊 ${cache.symbol}: Using cached VWAP = ${vwap?.toFixed(2)} (${todayCandleCount} today's candles, updated on candle formation only)`);
    }

    // Calculate RSI/EMA indicators - these need sufficient historical data
    let rsi = null, ema9 = null, ema21 = null;
    let rsiArr = [];
    
    if (allCandles.length >= MIN_CANDLES_REQUIRED) {
      rsiArr = calculateRSIArray(closes, 14);
      rsi = rsiArr?.length ? rsiArr[rsiArr.length - 1] : null;
      ema9 = calculateEMA(closes, 9);
      ema21 = calculateEMA(closes, 21);
    } else {
      console.log(`⚠️ ${cache.symbol}: Not enough candles for RSI/EMA (${allCandles.length}/${MIN_CANDLES_REQUIRED}), but VWAP calculated anyway`);
    }

    return {
      rsi1m: rsi,
      rsiArray: rsiArr?.slice(-10) || [],
      ema9_1m: ema9,
      ema21_1m: ema21,
      vwap1m: vwap,
      ltp: cache.ltp || closes[closes.length - 1], // Use live LTP
      candleCount: allCandles.length,
      todayCandleCount: todayCandleCount // Use corrected today candle count
    };
  } catch (error) {
    console.error(`❌ Error calculating live indicators for token ${token}: ${error.message}`);
    return null;
  }
}

// Recalculate VWAP for all tokens in cache every minute
// Recalculate VWAP for all tokens in cache every minute
async function updateAllVWAPs() {
  console.log(`🔄 Starting periodic VWAP update for ${candleCache.size} tokens`);
  
  for (const [token, cache] of candleCache.entries()) {
    try {
      // Fetch fresh today's historical data
      const todaysCandles = await getHistoricalData(token, "minute", fromToday, to1);
      if(token == '1510401'){
        console.log(`📅 Fetched today's data for ${cache.symbol}: ${todaysCandles?.length || 0} candles for VWAP`)  ;
      }
      if (todaysCandles && todaysCandles.length > 0) {
        // Update cache with fresh today's data
        cache.todaysHistorical = todaysCandles;
        
        // Calculate VWAP from fresh data + current candle if exists
        const allTodayCandles = [...todaysCandles];
        if (cache.current) {
          allTodayCandles.push(cache.current);
        }
        
        const highs = allTodayCandles.map(c => c.high);
        const lows = allTodayCandles.map(c => c.low);
        const closes = allTodayCandles.map(c => c.close);
        const volumes = allTodayCandles.map(c => c.volume || 0);
        
        const vwapArray = calculateVWAP(highs, lows, closes, volumes);
        const newVWAP = vwapArray && vwapArray.length > 0 ? vwapArray[vwapArray.length - 1] : null;
        
        if (newVWAP !== null && !isNaN(newVWAP)) {
          const oldVWAP = cache.latestVWAP;
          cache.latestVWAP = newVWAP;
          console.log(`📊 VWAP updated for ${cache.symbol}: ${oldVWAP?.toFixed(2)} → ${newVWAP.toFixed(2)} (${allTodayCandles.length} candles)`);
        }
      }
    } catch (error) {
      console.error(`❌ Error updating VWAP for ${cache.symbol}: ${error.message}`);
    }
  }
  
  console.log(`✅ Completed periodic VWAP update`);
}


// Check ticker connection status
function checkTickerStatus() {
  console.log("📊 Ticker Status Check:");
  console.log(`  - Ticker exists: ${!!ticker}`);
  console.log(`  - Ticker connected: ${ticker ? ticker.connected() : 'N/A'}`);
  console.log(`  - Subscribed tokens: ${subscribedTokens.length}`);
  console.log(`  - Sample tokens: ${subscribedTokens.slice(0, 5)}`);
  
  if (ticker && !ticker.connected()) {
    console.log("⚠️ Ticker not connected, attempting reconnection...");
    ticker.connect();
  }
}

// Initialize ticker connection
function initTickListener() {
  if (ticker) {
    console.log("⚠️ Ticker already exists, disconnecting first...");
    ticker.disconnect();
    ticker = null;
  }

  console.log("🔌 Initializing ticker connection...");
  ticker = new KiteTicker({ api_key, access_token });
  
  ticker.on("connect", () => {
    console.log("✅ Ticker connected successfully!");
    if (subscribedTokens.length) {
      const numericTokens = subscribedTokens.map(Number);
      console.log(`📡 Subscribing to ${subscribedTokens.length} tokens:`, subscribedTokens.slice(0, 5), subscribedTokens.length > 5 ? '...' : '');
      ticker.subscribe(numericTokens);
      ticker.setMode(ticker.modeFull, numericTokens);
      console.log(`📡 Ticker connected & resubscribed to ${subscribedTokens.length} tokens`);
    } else {
      console.log("📡 Ticker connected but no tokens to subscribe to");
    }
  });

  ticker.on("ticks", (ticks) => {
    console.log(`📊 Received ${ticks.length} ticks at ${new Date().toLocaleTimeString()}`);
    handleTicks(ticks);
  });
  
  ticker.on("disconnect", (error) => {
    console.log("🔌 Ticker disconnected:", error);
    // Auto-reconnect after 5 seconds
    setTimeout(() => {
      console.log("🔄 Attempting to reconnect ticker...");
      if (ticker) {
        ticker.connect();
      }
    }, 5000);
  });
  
  ticker.on("error", (error) => {
    console.error("❌ Ticker error:", error);
  });
  
  ticker.on("noreconnect", () => {
    console.log("❌ Ticker won't reconnect - manual restart required");
  });
  
  ticker.on("reconnect", () => {
    console.log("🔄 Ticker reconnecting...");
  });

  console.log("🚀 Starting ticker connection...");
  ticker.connect();
}

// Handle incoming ticks - calculate live indicators and check conditions
async function handleTicks(ticks) {
  if (!ticks || !ticks.length) return;

  console.log(`📊 Processing ${ticks.length} ticks at ${new Date().toLocaleTimeString()}`);

  // Process each tick for live indicator calculation
  const liveDataToBroadcast = [];
  
  for (const tick of ticks) {
    const token = tick.instrument_token;
    const symbol = getTradingSymbol(token);
    
    // Initialize cache if not exists
    if (!candleCache.has(token)) {
      const initialized = await initializeCacheForToken(token, symbol);
      if (!initialized) {
        console.log(`⚠️ Skipping ${symbol} - cache initialization failed`);
        continue;
      }
    }
    
    // Process tick and update candle cache
    const cache = processTickForCache(tick);
    if (!cache) {
      console.log(`⚠️ Skipping ${symbol} - cache processing failed`);
      continue;
    }
    
    // Calculate live indicators
    const liveIndicators = calculateLiveIndicators(token);
    if (liveIndicators) {
      const liveData = {
        token,
        symbol,
        ...liveIndicators,
        timestamp: new Date().toISOString()
      };
      
      liveDataToBroadcast.push(liveData);
      
      // Log indicator values with candle count info
      console.log(`📈 ${symbol}: RSI=${liveIndicators.rsi1m?.toFixed(2)}, EMA9=${liveIndicators.ema9_1m?.toFixed(2)}, EMA21=${liveIndicators.ema21_1m?.toFixed(2)}, VWAP=${liveIndicators.vwap1m?.toFixed(2)}, LTP=${liveIndicators.ltp} [${liveIndicators.candleCount} candles, ${liveIndicators.todayCandleCount} today]`);
      
      // Detailed debugging for accuracy verification (random sampling to avoid spam)
      if (Math.random() < 0.02) { // 2% sampling rate
        console.log(`🔍 ${symbol} Accuracy Check:`, {
          totalCandles: liveIndicators.candleCount,
          todayCandles: liveIndicators.todayCandleCount,
          minRequired: MIN_CANDLES_REQUIRED,
          hasMinData: liveIndicators.candleCount >= MIN_CANDLES_REQUIRED,
          rsiValid: liveIndicators.rsi1m !== null && !isNaN(liveIndicators.rsi1m),
          emaValid: liveIndicators.ema9_1m !== null && !isNaN(liveIndicators.ema9_1m),
          vwapValid: liveIndicators.vwap1m !== null && !isNaN(liveIndicators.vwap1m)
        });
      }
    }
  }

  // Broadcast all live data to UI
  if (liveDataToBroadcast.length > 0 && global.broadcastToClients) {
    // Send each token's data individually with the correct message type
    liveDataToBroadcast.forEach(liveData => {
      global.broadcastToClients({
        type: "simplified_strategy_update",
        data: liveData
      });
    });
    console.log(`📡 Broadcasted ${liveDataToBroadcast.length} live indicator updates to UI`);
  }

  // Periodic system health check
  // if (Math.random() < 0.1) { // 10% chance per tick batch
  //   const cacheSize = candleCache.size;
  //   const avgCandles = cacheSize > 0 ? 
  //     Array.from(candleCache.values()).reduce((sum, cache) => sum + cache.candles.length, 0) / cacheSize : 0;
    
  //   console.log(`🏥 System Health: ${cacheSize} tokens cached, avg ${avgCandles.toFixed(0)} candles per token, ${liveDataToBroadcast.length} active indicators`);
  // }

  // Process order logic for first tick only (to avoid spam)
  if (ticks.length > 0 && !isProcessingOrder) {
    const firstTick = ticks[0];
    const token = firstTick.instrument_token;
    const symbol = getTradingSymbol(token);
    const ltp = firstTick.last_price;
    
    // Check order cooldown
    const lastOrder = lastOrderTime[token] || 0;
    const timeSinceLastOrder = Date.now() - lastOrder;
    
    if (timeSinceLastOrder >= ORDER_COOLDOWN_MS) {
      // Get live indicators for this token
      const indicators = calculateLiveIndicators(token);
      
      if (indicators && indicators.rsi1m && indicators.ema9_1m && indicators.ema21_1m && indicators.vwap1m) {
        // Check sell conditions
        const sellCondition = 
          (indicators.ema9_1m < indicators.vwap1m && 
          indicators.vwap1m < indicators.ema21_1m && 
          indicators.rsi1m < 42) || 
          (indicators.ema9_1m < indicators.vwap1m && 
          indicators.vwap1m < indicators.ema21_1m && 
          indicators.rsi1m < 42);
        if (sellCondition) {
          isProcessingOrder = true;
          console.log(`✅ SELL CONDITION MET for ${symbol}: EMA9(${indicators.ema9_1m.toFixed(2)}) < VWAP(${indicators.vwap1m.toFixed(2)}) < EMA21(${indicators.ema21_1m.toFixed(2)}) && RSI(${indicators.rsi1m.toFixed(2)}) < 42`);
          
          try {
            // Use the existing order function
            await checkAndSellOnSubscription(token, symbol);
            lastOrderTime[token] = Date.now();
          } catch (error) {
            console.error(`❌ Error processing sell order for ${symbol}: ${error.message}`);
          } finally {
            isProcessingOrder = false;
          }
        } else {
          console.log(`❌ Sell condition NOT met for ${symbol}: EMA9=${indicators.ema9_1m?.toFixed(2)}, VWAP=${indicators.vwap1m?.toFixed(2)}, EMA21=${indicators.ema21_1m?.toFixed(2)}, RSI=${indicators.rsi1m?.toFixed(2)}`);
        }
      }
    }
  }
}

// Subscribe to new tokens (replace all existing subscriptions)
async function subscribeToTokens(tokens) {
  console.log(`🔄 Replacing all subscriptions with ${tokens.length} new tokens`);
  console.log(`🎯 First 10 tokens to subscribe:`, tokens.slice(0, 10));
  
  // Clear existing subscriptions
  if (ticker && ticker.connected() && subscribedTokens.length > 0) {
    const oldNumericTokens = subscribedTokens.map(Number);
    ticker.unsubscribe(oldNumericTokens);
    console.log(`📡 Unsubscribed from ${subscribedTokens.length} old tokens`);
  }
  
  // Update token list
  subscribedTokens = [...new Set(tokens)]; // Remove duplicates
  console.log(`📝 Updated subscribedTokens array: ${subscribedTokens.length} total tokens`);

  // Subscribe to new tokens
  if (ticker && ticker.connected()) {
    const numericNewTokens = subscribedTokens.map(Number);
    console.log(`📡 Subscribing to tokens:`, numericNewTokens.slice(0, 10), numericNewTokens.length > 10 ? '...' : '');
    ticker.subscribe(numericNewTokens);
    ticker.setMode(ticker.modeFull, numericNewTokens);
    console.log(`📡 Subscribed to ${numericNewTokens.length} new tokens in FULL mode`);
  } else {
    console.log("⚠️ Ticker not connected, tokens saved for when connection is ready");
    console.log(`🔌 Ticker state: exists=${!!ticker}, connected=${ticker ? ticker.connected() : 'N/A'}`);
  }
}

// Handle CSV file updates - replace all tokens
async function updateTokenSubscriptionsFromCSV(newTokenList, csvFilePath) {
  console.log(`🎯 Token replacement triggered by CSV: ${csvFilePath}`);
  console.log(`📊 Replacing with ${Array.isArray(newTokenList) ? newTokenList.length : 'non-array'} tokens`);
  
  try {
    if (!Array.isArray(newTokenList)) {
      throw new Error('newTokenList must be an array');
    }

    // Clear order cooldowns for fresh start
    Object.keys(lastOrderTime).forEach(token => {
      delete lastOrderTime[token];
    });
    console.log(`🔄 Cleared order cooldowns for fresh start`);

    // Replace all subscriptions
    await subscribeToTokens(newTokenList);
    
    console.log(`✅ Token replacement completed successfully`);
  } catch (error) {
    console.error(`❌ Error in updateTokenSubscriptionsFromCSV: ${error.message}`);
  }
}

// Unsubscribe from all tokens
function unsubscribeAll() {
  if (ticker && subscribedTokens.length) {
    const numericTokens = subscribedTokens.map(Number);
    ticker.unsubscribe(numericTokens);
    console.log(`📡 Unsubscribed from ${subscribedTokens.length} tokens`);
  }
  subscribedTokens = [];
}

// Start CSV file watching for token updates
function startCSVWatching() {
  if (csvWatcher) {
    cleanupCSVWatcher(csvWatcher);
  }

  csvWatcher = setupCSVFileWatcher(updateTokenSubscriptionsFromCSV);

  console.log("👀 CSV file watcher started - watching Downloads folder");
}

// Stop CSV watching
function stopCSVWatching() {
  if (csvWatcher) {
    cleanupCSVWatcher(csvWatcher);
    csvWatcher = null;
    console.log("🛑 CSV file watcher stopped");
  }
}

// Initialize everything
function startTickListener() {
  console.log("🚀 Starting conditional tick listener...");
  console.log(`🔑 Using API key: ${api_key}`);
  console.log(`📋 Access token: ${access_token.substring(0, 10)}...${access_token.substring(access_token.length - 5)}`);
  
  initTickListener();
  startCSVWatching();
  
  // Start periodic status checks
  setInterval(checkTickerStatus, 30000); // Check every 30 seconds
  setInterval(updateAllVWAPs, 60 * 1000); // 🔁 Update VWAP every 1 min
  console.log("✅ Conditional tick listener started - waiting for CSV tokens");
  console.log("🔍 Status checks will run every 30 seconds");
}

// Stop everything
function stopTickListener() {
  console.log("🛑 Stopping tick listener...");
  unsubscribeAll();
  stopCSVWatching();
  if (ticker) {
    ticker.disconnect();
    ticker = null;
  }
  console.log("✅ Tick listener stopped");
}

// Compatibility functions for server.js
function initializeCSVWatcher() {
  // CSV watching is automatically started in startTickListener()
  console.log("📁 CSV watcher already initialized in startTickListener()");
}

function broadcastAllSubscribedTokens() {
  // No longer needed in simplified version
  console.log("📡 Simplified version - no token data to broadcast");
}

function cleanup() {
  stopTickListener();
}

module.exports = {
  startTickListener,
  stopTickListener,
  subscribeToTokens,
  updateTokenSubscriptionsFromCSV,
  unsubscribeAll,
  initTickListener: startTickListener, // Alias for compatibility
  initializeCSVWatcher,
  broadcastAllSubscribedTokens,
  cleanup
};

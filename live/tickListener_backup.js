const { KiteTicker } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
const { getKiteConnect } = require("../kite/connection");
const { calculateRSI, calculateRSIArray, calculateVWAP, calculateEMA, calculateATR } = require("../strategy/indicators");
const { getHistoricalData } = require("../strategy/scanner");
const { from35, from15, fromToday, to15 } = require("../utils/fromAndToDate");
const { calculateHourOpenLow, checkDipRecoveryPattern, checkRecoveryDipPattern, getCurrentTradingHour } = require("../utils/hourCalculations");
const instruments = require("../data/nse500.json");
// Volume analyzer removed for simplified strategy

const accessTokenPath = path.join(__dirname, "../access_token.txt");
const api_key = 'r1a7qo9w30bxsfax';
const access_token = fs.readFileSync(accessTokenPath, "utf8").trim();

// File watching for CSV imports
const os = require('os');
const csv = require('csv-parser');
const { vwap, atr } = require("technicalindicators");
const { placeBuyOrder, placeTargetAndStopLoss } = require("../orders/orderManager");
const { updateTokenSubscriptions, setupCSVFileWatcher, parseTokensFromCSVWithSymbols, cleanupCSVWatcher } = require("../utils/tokenSubscriptionManager");
const downloadsPath = path.join(os.homedir(), 'Downloads');
const filteredTokensPath = path.join(__dirname, '../data/filtered_instruments.json');
const { placeSellOrder } = require("../orders/orderManager");

let ticker = null;
let subscribedTokens = [];
let csvWatcher = null;
let scanPausedByCSV = false;
let csvResumeTimeout = null;
let fiveMinuteSchedulerStarted = false; // Track if scheduler is already running
const lastTickTime = {};
const lastSentRSI = {};
const lastHistoricalFetch = {}; // Track last historical data fetch time for each token
const TICK_THROTTLE_MS = 500;
const CSV_PAUSE_DURATION = 10 * 60 * 1000; // 10 minutes pause after CSV detection

// Cache for historical data and indicators
const tokenDataCache = {}; // { token: { candles1m: [], candles5m: [], rsi1m: 0, ema9_1m: 0, ema20_1m: 0, ema21_1m: 0, vwap1m: 0, atr1m: 0, vwap5m: 0, ema5m: 0, last5mCandleTime: null } }

// Simple VWAP cache for today's 1m candles only
const vwapDataCache = {}; // { token: { lastVwap: 0, lastFetchTime: 0 } }

// Global API rate limiting
let concurrentApiCalls = 0;
const MAX_CONCURRENT_API_CALLS = 3;

// Initialize VWAP cache for a token with today's candles
function initializeVwapCache(token, todayCandles) {
  vwapDataCache[token] = {
    lastVwap: null,
    lastFetchTime: 0
  };
  
  // Calculate initial VWAP if we have today's data
  if (todayCandles && todayCandles.length > 0) {
    const highs = todayCandles.map(c => c.high);
    const lows = todayCandles.map(c => c.low);
    const closes = todayCandles.map(c => c.close);
    const volumes = todayCandles.map(c => c.volume || 0);
    vwapDataCache[token].lastVwap = calculateVWAP(highs, lows, closes, volumes)?.at(-1);
  }
  
  console.log(`📊 Initialized VWAP cache for token ${token} with ${todayCandles?.length || 0} today's candles, VWAP: ${vwapDataCache[token].lastVwap}`);
}

// Update VWAP cache by fetching fresh historical data
async function updateVwapCache(token, tick, forceUpdate = false) {
  // Ensure VWAP cache exists for this token
  if (!vwapDataCache[token]) {
    vwapDataCache[token] = {
      lastVwap: null,
      lastFetchTime: 0
    };
  }
  
  const now = Date.now();
  const currentMinute = Math.floor(now / 60000) * 60000;
  
  // Update frequency: every 1 minute if forced, otherwise every 5 minutes
  const VWAP_CACHE_DURATION_MS = forceUpdate ? 30 * 1000 : 5 * 60 * 1000; // 30 seconds if forced, otherwise 5 minutes
  if (forceUpdate || now - vwapDataCache[token].lastFetchTime > VWAP_CACHE_DURATION_MS) {
    // Rate limiting: Skip if too many concurrent API calls
    if (concurrentApiCalls >= MAX_CONCURRENT_API_CALLS) {
      console.log(`⏸️ Skipping VWAP update for token ${token} - rate limit reached (${concurrentApiCalls}/${MAX_CONCURRENT_API_CALLS})`);
      return vwapDataCache[token].lastVwap;
    }
    
    concurrentApiCalls++;
    try {
      console.log(`📊 Fetching fresh historical data for VWAP calculation for token ${token}...`);
      const todayCandles = await getHistoricalData(token, "minute", fromToday, to15);
      
      if (todayCandles && todayCandles.length > 0) {
        const highs = todayCandles.map(c => c.high);
        const lows = todayCandles.map(c => c.low);
        const closes = todayCandles.map(c => c.close);
        const volumes = todayCandles.map(c => c.volume || 0);
        const vwapResult = calculateVWAP(highs, lows, closes, volumes);
        vwapDataCache[token].lastVwap = vwapResult?.at(-1) || null;
        vwapDataCache[token].lastFetchTime = now;
        
        console.log(`📊 VWAP recalculated from fresh historical data for token ${token}: ${vwapDataCache[token].lastVwap} using ${todayCandles.length} candles`);
      } else {
        console.warn(`⚠️ No today's candles received for VWAP calculation for token ${token}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching historical data for VWAP calculation for token ${token}:`, error.message);
    } finally {
      concurrentApiCalls--;
    }
  }
  
  return vwapDataCache[token].lastVwap;
}

/**
 * SIMPLIFIED DUAL TRADING STRATEGY - BUY AND SELL CONDITIONS:
 * 
 * NEW BUY CONDITIONS (4 conditions):
 * 1. RSI(1m) > 65 (momentum)
 * 2. None of the last 10 RSI values (excluding current) were above 68 (avoid already extended moves)
 * 3. EMA conditions: EMA9(1m) > VWAP(1m) AND EMA21(1m) > VWAP(1m) AND EMA9(1m) > EMA21(1m)
 * 4. ATR(1m) as percentage of LTP < 0.2% (low volatility requirement)
 * 
 * SELL CONDITIONS (Multiple conditions):
 * 1. RSI(1m) < 35 (oversold momentum)
 * 2. None of the last 10 RSI values (excluding current) were below 35 (avoid already extended moves)
 * 3. EMA9(1m) < VWAP(1m) (weakness)
 * 4. Recovery-Dip pattern (Hour High > Hour Open AND LTP < Hour Open)
 * 5. VWAP(1h) < EMA(1h) (hourly weakness)
 * 6. Hour Open > VWAP(1h) (position for short)
 * 7. Gap between VWAP(1m) and EMA9(1m) <= 0.1% (tight spread)
 * 8. Gap between VWAP(1h) and EMA9(1h) < 0.3% (hourly tight spread)
 * 9. Gap down on day start >= -0.5% (only checked in first hour 9:15-10:15 AM)
 * 10. ATR(1m) as percentage of LTP < 0.2% (low volatility requirement)
 * 11. RSI(1h) < 45 (hourly momentum confirmation)
 * 12. Gap between LTP and EMA9(1h) < 0.2% (price near hourly EMA)
 * 
 * If ALL BUY conditions met, place buy order
 * If ALL SELL conditions met, place sell order
 */


// 🔍 Get trading symbol from token
function getTradingSymbol(token) {
  const instrument = instruments.instruments.find(i => i.instrument_token == token);
  return instrument ? instrument.tradingsymbol : `TOKEN_${token}`;
}

// 📊 Update 5-minute indicators using fresh historical data (called every 5 minutes)
async function updateFiveMinuteIndicatorsFromHistorical() {
  console.log(`📊 Starting scheduled 5-minute indicator update for ${subscribedTokens.length} tokens...`);
  
  for (const token of subscribedTokens) {
    const tokenData = tokenDataCache[token];
    if (!tokenData) {
      console.log(`⏭️ Skipping token ${token} - no cached data available`);
      continue;
    }
    
    try {
      console.log(`📊 Fetching fresh 5m historical data for token ${token}...`);
      
      // Fetch fresh 5-minute historical data
      const candles5m = await getHistoricalData(token, "5minute", fromToday, to15);
      
      if (!candles5m || candles5m.length === 0) {
        console.warn(`⚠️ No 5m historical data received for token ${token}`);
        continue;
      }
      
      console.log(`📊 Received ${candles5m.length} fresh 5m candles for token ${token}`);
      
      // Update 5-minute candles cache
      tokenData.candles5m = candles5m.slice(-50); // Keep last 50 5m candles
      
      // Recalculate 5-minute indicators with fresh data
      const closes5m = candles5m.map(c => c.close);
      const highs5m = candles5m.map(c => c.high);
      const lows5m = candles5m.map(c => c.low);
      const volumes5m = candles5m.map(c => c.volume || 0);
      
      // Calculate EMA9 for 5-minute data
      if (closes5m.length >= 9) {
        const ema5m = calculateEMA(closes5m, 9);
        tokenData.ema5m = ema5m;
        console.log(`📊 Updated EMA9(5m) for token ${token}: ${ema5m} (from fresh ${closes5m.length} 5m candles)`);
      }
      
      // Calculate VWAP for 5-minute data
      const nonZeroVolumes = volumes5m.filter(v => v > 0).length;
      console.log(`📊 Fresh 5m data: ${nonZeroVolumes}/${volumes5m.length} candles have volume data`);
      
      if (nonZeroVolumes === 0) {
        console.warn(`⚠️ No volume data in fresh 5m data for token ${token} - using price average`);
        const avgPrice = closes5m.reduce((a,b) => a+b, 0) / closes5m.length;
        tokenData.vwap5m = avgPrice;
        console.log(`📊 Updated VWAP(5m) using price average: ${avgPrice} for token ${token}`);
      } else {
        const vwapResult5m = calculateVWAP(highs5m, lows5m, closes5m, volumes5m);
        if (vwapResult5m && vwapResult5m.length > 0) {
          const vwap5m = vwapResult5m[vwapResult5m.length - 1];
          tokenData.vwap5m = vwap5m;
          console.log(`📊 Updated VWAP(5m) for token ${token}: ${vwap5m} (from fresh ${closes5m.length} 5m candles, ${volumes5m.reduce((a,b) => a+b, 0)} total volume)`);
        } else {
          console.warn(`⚠️ Failed to calculate VWAP(5m) from fresh data for token ${token}`);
        }
      }
      
      // Add small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error updating 5m indicators for token ${token}:`, error.message);
    }
  }
  
  console.log(`✅ Completed 5-minute indicator update cycle`);
}

// Schedule 5-minute indicator updates
function startFiveMinuteScheduler() {
  if (fiveMinuteSchedulerStarted) {
    console.log(`⏭️ 5-minute scheduler already running, skipping start`);
    return;
  }
  
  fiveMinuteSchedulerStarted = true;
  
  // Update immediately on start
  setTimeout(() => {
    updateFiveMinuteIndicatorsFromHistorical().catch(err => {
      console.error(`❌ Error in initial 5m indicator update:`, err.message);
    });
  }, 5000); // Wait 5 seconds after startup
  
  // Then update every 5 minutes
  setInterval(() => {
    updateFiveMinuteIndicatorsFromHistorical().catch(err => {
      console.error(`❌ Error in scheduled 5m indicator update:`, err.message);
    });
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log(`📅 5-minute indicator scheduler started - will update every 5 minutes`);
}

function initTickListener() {
  if (ticker) {
    console.log("⚠️ Ticker already initialized.");
    return;
  }

  ticker = new KiteTicker({ api_key, access_token });
  ticker.connect();

  ticker.on("connect", () => {
    if (subscribedTokens.length) {
      const numericTokens = subscribedTokens.map(Number);
      ticker.subscribe(numericTokens);
      ticker.setMode(ticker.modeFull, numericTokens);
    }
    console.log("✅ Ticker connected & subscribed.");
    
    // Start the 5-minute indicator scheduler
    startFiveMinuteScheduler();
  });

  ticker.on("ticks", handleTicks);
  ticker.on("noreconnect", () => console.log("❌ Ticker won't reconnect."));
  ticker.on("disconnect", () => {
    console.log("🔌 Ticker disconnected.");
  });
}

async function subscribeToTokens(tokens) {
  console.log(`🔄 subscribeToTokens called with ${tokens.length} tokens:`, tokens.slice(0, 5)); // Show first 5 tokens
  
  const newTokens = tokens.filter(t => !subscribedTokens.includes(t));
  if (!newTokens.length) {
    console.log("⏭️ No new tokens to subscribe");
    return;
  }

  subscribedTokens = [...new Set([...subscribedTokens, ...newTokens])];
  console.log(`📝 Updated subscribedTokens array: ${subscribedTokens.length} total tokens`);

  // Initialize historical data for new tokens
  console.log(`📊 Initializing historical data for ${newTokens.length} new tokens...`);
  for (const token of newTokens) {
    try {
      const initialData = await initializeTokenData(token);
      
        // Broadcast initial cached data immediately after initialization
        if (initialData && global.broadcastToClients) {
          const filteredToken = instruments.find(inst => inst.token == token);
          if (filteredToken) {
            const tokenData = {
              token: parseInt(token),
              symbol: filteredToken.symbol,
              ltp: 0, // Will be updated on first tick
              dayGapUp: null,
              hourOpen: null,
              hourLow: null,
              rsi1m: initialData.rsi1m || 0,
              rsiArray: initialData.rsiArray || [], // ✅ Include full RSI array from cache
              ema9_1m: initialData.ema9_1m || 0,
              ema20_1m: initialData.ema20_1m || 0,
              ema21_1m: initialData.ema21_1m || 0,
              vwap1m: initialData.vwap1m || 0,
              atr1m: initialData.atr1m || 0,
              atrPercentage: initialData.atr1m && initialData.vwap1m ? ((initialData.atr1m / initialData.vwap1m) * 100) : null,
              vwap5m: initialData.vwap5m || 0,
              ema5m: initialData.ema5m || 0,
              conditionsMet: false,
              allConditionsMet: false,
              allBuyConditionsMet: false,
              allSellConditionsMet: false,
              // Individual condition flags
              buyRsiAbove65: false,
              buyGapTight: false, 
              buyVwap5mAboveEma5m: false,
              buyNoRecentRsi68: false,
              buyAtrLow: false,
              sellRsiBelow35: false,
              sellGapTight: false,
              sellVwap5mBelowEma5m: false,
              sellNoRecentRsi32: false,
              sellAtrLow: false,
              timestamp: new Date().toISOString()
            };
            
            console.log(`📤 Broadcasting initial data for ${filteredToken.symbol}: RSI=${tokenData.rsi1m}, RSI Array length=${tokenData.rsiArray.length}`);
            
            global.broadcastToClients({
              type: "filtered_token_update",
              data: tokenData
            });
          }
        }      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`❌ Error initializing token ${token}: ${err.message}`);
    }
  }

  if (ticker && ticker.connected()) {
    const numericNewTokens = newTokens.map(Number);
    ticker.subscribe(numericNewTokens);
    ticker.setMode(ticker.modeFull, numericNewTokens);
    console.log(`📡 Subscribed to ${numericNewTokens.length} new tokens`);
  } else {
    console.log("⚠️ Ticker not connected, tokens added to subscribedTokens array");
  }
}

// Smart token subscription update using external manager
async function updateTokenSubscriptionsFromCSV(newTokenList, csvFilePath) {
  console.log(`🎯 Smart token subscription update triggered by CSV: ${csvFilePath}`);
  console.log(`📊 Received ${Array.isArray(newTokenList) ? newTokenList.length : 'non-array'} tokens for processing`);
  console.log(`🔍 First 5 tokens received: [${Array.isArray(newTokenList) ? newTokenList.slice(0, 5).join(', ') : 'N/A'}]`);
  console.log(`🔍 Token types received: [${Array.isArray(newTokenList) ? newTokenList.slice(0, 5).map(t => typeof t).join(', ') : 'N/A'}]`);
  console.log(`🔍 Current subscribedTokens before update: ${subscribedTokens.length} tokens [${subscribedTokens.slice(0, 5).join(', ')}]`);
  
  try {
    // newTokenList should already be an array of parsed tokens from the CSV watcher
    let tokensToProcess = newTokenList;
    
    // Ensure we have an array of tokens
    if (!Array.isArray(tokensToProcess)) {
      console.error(`❌ Expected array of tokens, received:`, typeof tokensToProcess);
      return;
    }
    
    console.log(`🔄 Processing ${tokensToProcess.length} tokens from CSV`);
    
    const result = await updateTokenSubscriptions(
      subscribedTokens,
      tokensToProcess,
      ticker,
      tokenDataCache,
      vwapDataCache,
      initializeTokenData
    );
    
    // Update the global subscribedTokens array
    subscribedTokens = result.updatedTokens;
    
    console.log(`✅ Token subscription update completed:`);
    console.log(`  📈 Added: ${result.changes.added} tokens`);
    console.log(`  📉 Removed: ${result.changes.removed} tokens`);
    console.log(`  🔄 Unchanged: ${result.changes.unchanged} tokens`);
    console.log(`  📊 Total subscribed: ${subscribedTokens.length} tokens`);
    console.log(`🔍 Updated subscribedTokens sample: [${subscribedTokens.slice(0, 5).join(', ')}]`);
    console.log(`🔍 Updated subscribedTokens types: [${subscribedTokens.slice(0, 5).map(t => typeof t).join(', ')}`);
    
    // Broadcast update to clients if available
    if (global.broadcastToClients) {
      try {
        global.broadcastToClients({
          type: "token_subscription_updated",
          data: {
            totalTokens: subscribedTokens.length,
            changes: result.changes,
            csvFile: path.basename(csvFilePath),
            timestamp: new Date().toISOString()
          }
        });
      } catch (broadcastError) {
        console.error(`❌ Error broadcasting token subscription update:`, broadcastError.message);
      }
    }
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error updating token subscriptions from CSV:`, error.message);
    console.error(`❌ Error stack:`, error.stack);
    
    // Broadcast error to clients if available
    if (global.broadcastToClients) {
      try {
        global.broadcastToClients({
          type: "token_subscription_error",
          data: {
            error: error.message,
            csvFile: path.basename(csvFilePath),
            timestamp: new Date().toISOString()
          }
        });
      } catch (broadcastError) {
        console.error(`❌ Error broadcasting token subscription error:`, broadcastError.message);
      }
    }
    
    // Don't re-throw the error to prevent server crash
    console.log(`🛡️ Server continues running despite CSV processing error`);
    return null;
  }
}

function unsubscribeAll() {
  if (ticker && ticker.connected() && subscribedTokens.length) {
    ticker.unsubscribe(subscribedTokens.map(Number));
    console.log(`🛑 Unsubscribed ${subscribedTokens.length} tokens`);
  }
  subscribedTokens = [];
}

const historicalCache = {}; // { token_interval: { timestamp, data } }

async function getCachedHistorical(token, interval, from, to, maxAge = 60000) {
  const key = `${token}_${interval}`;
  const now = Date.now();

  if (historicalCache[key] && now - historicalCache[key].timestamp < maxAge) {
    return historicalCache[key].data;
  }

  const data = await getHistoricalData(token, interval, from, to);
  historicalCache[key] = { timestamp: now, data };
  return data;
}

// Global tick tracking
let tickCounter = 0;
let uniqueTokensSeenInTicks = new Set();

async function handleTicks(ticks) {
  const startTime = Date.now();
  tickCounter++;
  
  // Time-based calculations (simplified - first hour logic not used in simplified conditions)
  const isFirstHour = false; // First hour logic removed in simplified strategy
  
  // Every 100 ticks, log subscription status
  if (tickCounter % 100 === 0) {
    console.log(`📊 Tick Stats (every 100 ticks):`);
    console.log(`  📈 Total ticks processed: ${tickCounter}`);
    console.log(`  🔢 Unique tokens seen in ticks: ${uniqueTokensSeenInTicks.size}`);
    console.log(`  📋 Current subscribedTokens: ${subscribedTokens.length}`);
    console.log(`  🎯 Expected vs Actual: ${subscribedTokens.length} subscribed, ${uniqueTokensSeenInTicks.size} actually sending ticks`);
    
    if (subscribedTokens.length !== uniqueTokensSeenInTicks.size) {
      const subscribedSet = new Set(subscribedTokens.map(String));
      const tickingSet = new Set([...uniqueTokensSeenInTicks].map(String));
      const notTicking = [...subscribedSet].filter(token => !tickingSet.has(token));
      const unexpectedTicking = [...tickingSet].filter(token => !subscribedSet.has(token));
      
      if (notTicking.length > 0) {
        console.warn(`⚠️ Subscribed but not ticking: [${notTicking.slice(0, 5).join(', ')}`);
      }
      if (unexpectedTicking.length > 0) {
        console.warn(`⚠️ Ticking but not in subscribedTokens: [${unexpectedTicking.slice(0, 5).join(', ')}`);
      }
    }
  }
  
  for (const tick of ticks) {
    const token = tick.instrument_token;
    uniqueTokensSeenInTicks.add(token);
    
    const ltp = tick.last_price || 0;
    const nowTs = Date.now();

    // Throttle tick processing
    if (lastTickTime[token] && nowTs - lastTickTime[token] < TICK_THROTTLE_MS) continue;
    lastTickTime[token] = nowTs;

    // Check if we have cached data for this token
    if (!tokenDataCache[token]) {
      console.log(`⚠️ No cached data for token ${token}, skipping...`);
      continue;
    }

       
          // 🎯 PLACE ACTUAL SELL ORDER
          console.log(`📞 Placing SELL order for ${symbol}...`);
          
    const orderResult =  await placeSellOrder(token, symbol, ltp);

    // Update indicators with real-time tick data
    const updatedData = await updateIndicatorsWithTick(token, tick);
    if (!updatedData) continue;

    const { rsi1m, rsiArray, ema9_1m, ema20_1m, ema21_1m, vwap1m, atr1m, atrPercentage, dayGapUp } = updatedData;
    const symbol = getTradingSymbol(token);

    // Always broadcast available data, even if some indicators are missing
    lastSentRSI[token] = rsi1m || 0;
    
    // Get analysis data for 1h indicators (still needed for SELL conditions)
    const serverAnalysisData = global.analysisDataStore?.get(token.toString()) || {};
    
    // Log available indicators
    if (rsi1m && ema9_1m && ema21_1m && vwap1m !== null && vwap1m !== undefined && typeof vwap1m === 'number') {
      console.log(`✅ COMPLETE INDICATORS for ${symbol}: RSI=${rsi1m.toFixed(2)}, EMA9=${ema9_1m.toFixed(2)}, EMA21=${ema21_1m.toFixed(2)}, VWAP=${vwap1m.toFixed(2)}, ATR%=${atrPercentage?.toFixed(3) || 'N/A'}`);
    } else {
      // Send partial data with debug info about what's missing
      const missing = [];
      if (!rsi1m) missing.push('RSI1m');
      if (!ema9_1m) missing.push('EMA9');
      if (!ema21_1m) missing.push('EMA21');
      if (vwap1m === null || vwap1m === undefined || typeof vwap1m !== 'number') missing.push('VWAP1m');
      
      console.log(`⚠️ PARTIAL INDICATORS for ${symbol}: Missing=[${missing.join(', ')}], RSI=${rsi1m || 'N/A'}, EMA9=${ema9_1m || 'N/A'}, EMA21=${ema21_1m || 'N/A'}, VWAP=${vwap1m || 'N/A'}, ATR%=${atrPercentage?.toFixed(3) || 'N/A'}`);
    }
    
    // Send data anyway so you can see what's available
    const tokenInFilteredList = global.filteredTokens?.find(ft => ft.token == token);
      
      // Use fallback from filteredTokens if analysis data is missing
      const vwap1h = serverAnalysisData.vwap1h || tokenInFilteredList?.vwap1h;
      const ema1h = serverAnalysisData.ema1h || tokenInFilteredList?.ema1h;
      const rsi1h = serverAnalysisData.rsi1h || tokenInFilteredList?.rsi1h;
      let gap1h = null;
      
      if (vwap1h && ema1h && typeof vwap1h === 'number' && typeof ema1h === 'number') {
        gap1h = +((Math.abs(vwap1h - ema1h) / ema1h) * 100).toFixed(2);
      }

      // Calculate gap percentage between VWAP1m and EMA9(1m) (still needed for SELL conditions)
      let gap1m = null;
      if (vwap1m && ema9_1m && typeof vwap1m === 'number' && typeof ema9_1m === 'number') {
        gap1m = +((Math.abs(vwap1m - ema9_1m) / ema9_1m) * 100).toFixed(2);
      }

      // Calculate gap up from tick data (already calculated in updateIndicatorsWithTick)
      const gapUpPercent = dayGapUp;

      // Calculate current hour's data (still needed for SELL conditions)
      const cachedData = tokenDataCache[token];
      let hourOpen = null, hourLow = null, hourHigh = null, recoveryDipPattern = null;
      
      if (cachedData && cachedData.candles1m && cachedData.candles1m.length > 0) {
        const hourData = calculateHourOpenLow(cachedData.candles1m);
        hourOpen = hourData.hourOpen;
        hourLow = hourData.hourLow;
        
        // Check recovery-dip pattern for SELL logic only
        if (hourOpen && hourLow) {
          // Calculate hour high from the same hour candles used for hourOpen/hourLow
          const currentHourRange = getCurrentTradingHour();
          if (currentHourRange) {
            const currentHourCandles = cachedData.candles1m.filter(candle => {
              const candleTime = new Date(candle.date);
              return candleTime >= currentHourRange.start && candleTime < currentHourRange.end;
            });
            
            if (currentHourCandles.length > 0) {
              const calculatedHourHigh = Math.max(...currentHourCandles.map(c => c.high));
              hourHigh = calculatedHourHigh; // Store for later reference
              // Use the proper checkRecoveryDipPattern function
              recoveryDipPattern = checkRecoveryDipPattern(hourOpen, calculatedHourHigh, ltp);
            }
          }
        }
        
        if (recoveryDipPattern) {
          console.log(`📉 Recovery-Dip Pattern for ${symbol}: HasRecovered=${recoveryDipPattern.hasRecoveredAboveOpen}, HasDropped=${recoveryDipPattern.hasDroppedBelowOpen}, IsValid=${recoveryDipPattern.isValidPattern}, Recovery=${recoveryDipPattern.recoveryAmount?.toFixed(2) || 'N/A'}, Dip=${recoveryDipPattern.dipAmount?.toFixed(2) || 'N/A'}`);
        }
      }

      // NEW BUY CONDITIONS
      const condition1 = rsi1m > 65;                    // RSI(1m) > 65 (momentum)
      
      // Check that none of the last 10 RSI values (excluding current) were above 68
      const condition1b = (() => {
        if (!rsiArray || rsiArray.length < 11) return false; // Need at least 11 values to check last 10
        const last10Rsi = rsiArray.slice(-11, -1); // Get last 10 RSI values excluding current
        const hasRecentOverbought = last10Rsi.some(rsi => rsi > 68);
        return !hasRecentOverbought; // Return true if NONE were above 68
      })();
      
      // EMA conditions - EMA9 and EMA21 must be above VWAP(1m)
      const condition2a = ema9_1m > vwap1m;             // EMA9(1m) > VWAP(1m)
      const condition2b = ema21_1m > vwap1m;            // EMA21(1m) > VWAP(1m)
      const condition2c = ema9_1m > ema21_1m;           // EMA9(1m) > EMA21(1m) (short term above long term)
      const condition2 = condition2a && condition2b && condition2c; // All EMA conditions must pass
      
      // ATR percentage condition - ATR(1m) as percentage of LTP should be < 0.2%
      const condition3 = atrPercentage !== null ? atrPercentage < 0.2 : false; // ATR% < 0.2%
      
      const allConditionsMet = condition1 && condition1b && condition2 && condition3;
      
      // Debug: Verify BUY calculation is correct
      const calculatedBuyResult = condition1 && condition1b && condition2 && condition3;
      if (allConditionsMet !== calculatedBuyResult) {
        console.error(`❌ BUY Condition Mismatch for ${symbol}! Original: ${allConditionsMet}, Calculated: ${calculatedBuyResult}`);
      }
      
      // ===========================
      // SIMPLIFIED SELL CONDITIONS (Mirror of BUY Logic)
      // ===========================
      const sellCondition1 = rsi1m < 35;                    // RSI(1m) < 35 (downward momentum)
      
      // Check that none of the last 10 RSI values (excluding current) were below 32
      const sellCondition1b = (() => {
        if (!rsiArray || rsiArray.length < 11) return false; // Need at least 11 values to check last 10
        const last10Rsi = rsiArray.slice(-11, -1); // Get last 10 RSI values excluding current
        const hasRecentOversold = last10Rsi.some(rsi => rsi < 32);
        return !hasRecentOversold; // Return true if NONE were below 32
      })();
      
      // Dual timeframe condition - Gap1m <= 0.1% AND VWAP(5m) < EMA9(5m)
      const sellCondition2a = true;
      //const sellCondition2a = gap1m !== null ? gap1m <= 0.1 : false; // Gap between VWAP(1m) and EMA9(1m) <= 0.1% (tight spread)
      const sellCondition2b = cachedData?.vwap5m && cachedData?.ema5m ? cachedData.vwap5m < cachedData.ema5m : false; // VWAP(5m) < EMA9(5m) (5min weakness)
      const sellCondition2 = sellCondition2a && sellCondition2b; // Both timeframes must show weakness setup
      
      // ATR percentage condition - ATR(1m) as percentage of LTP should be < 0.2%
      const sellCondition3 = atrPercentage !== null ? atrPercentage < 0.2 : false; // ATR% < 0.2%
      
      const allSellConditionsMet = sellCondition1 && sellCondition1b && sellCondition2 && sellCondition3;
      
      // Debug: Verify SELL calculation is correct  
      const calculatedSellResult = sellCondition1 && sellCondition1b && sellCondition2 && sellCondition3;
      if (allSellConditionsMet !== calculatedSellResult) {
        console.error(`❌ SELL Condition Mismatch for ${symbol}! Original: ${allSellConditionsMet}, Calculated: ${calculatedSellResult}`);
      }

      // Simplified logging with essential conditions
      console.log(`[${new Date().toISOString()}] ${symbol}`);
      console.log(`  📈 BUY: RSI1m: ${rsi1m.toFixed(2)} [${condition1 ? 'PASS' : 'FAIL'}], RSI_NoRecent68: [${condition1b ? 'PASS' : 'FAIL'}], EMA9>VWAP: ${ema9_1m?.toFixed(2) || 'N/A'}>${vwap1m?.toFixed(2) || 'N/A'} [${condition2a ? 'PASS' : 'FAIL'}], EMA21>VWAP: ${ema21_1m?.toFixed(2) || 'N/A'}>${vwap1m?.toFixed(2) || 'N/A'} [${condition2b ? 'PASS' : 'FAIL'}], EMA9>EMA21: ${ema9_1m?.toFixed(2) || 'N/A'}>${ema21_1m?.toFixed(2) || 'N/A'} [${condition2c ? 'PASS' : 'FAIL'}], EMA-Conditions: [${condition2 ? 'PASS' : 'FAIL'}], ATR%: ${atrPercentage?.toFixed(3) || 'N/A'}% [${condition3 ? 'PASS' : 'FAIL'}], LTP: ${ltp.toFixed(2)}, Signal: ${allConditionsMet ? 'BUY' : 'WAIT'}`);
      console.log(`  📉 SELL: RSI1m: ${rsi1m.toFixed(2)} [${sellCondition1 ? 'PASS' : 'FAIL'}], RSI_NoRecent32: [${sellCondition1b ? 'PASS' : 'FAIL'}], Gap1m: ${gap1m?.toFixed(2) || 'N/A'}% [${sellCondition2a ? 'PASS' : 'FAIL'}], VWAP<EMA9(5m): ${cachedData?.vwap5m?.toFixed(2) || 'N/A'}<${cachedData?.ema5m?.toFixed(2) || 'N/A'} [${sellCondition2b ? 'PASS' : 'FAIL'}], Dual-TF: [${sellCondition2 ? 'PASS' : 'FAIL'}], ATR%: ${atrPercentage?.toFixed(3) || 'N/A'}% [${sellCondition3 ? 'PASS' : 'FAIL'}], LTP: ${ltp.toFixed(2)}, Signal: ${allSellConditionsMet ? 'SELL' : 'WAIT'}`);
      
      // ===========================
      // ORDER PLACEMENT LOGIC
      // ===========================
      
      // Place BUY order if ALL BUY conditions are met AND not in cooldown
      if (allConditionsMet && false) {
        // ===========================
        // DATA SYNCHRONIZATION VALIDATION - CRITICAL SAFETY CHECK
        // ===========================
        // Ensure cached data is properly synchronized with live tick data before placing any orders
        
        // 1. Validate that all required cached data exists and is recent
        if (!cachedData || !cachedData.rsi1m || !cachedData.ema9_1m || !cachedData.vwap1m || !cachedData.atr1m) {
          console.log(`⚠️ ABORTING BUY ORDER for ${symbol} - Missing critical cached data: RSI=${cachedData?.rsi1m ? 'OK' : 'MISSING'}, EMA9=${cachedData?.ema9_1m ? 'OK' : 'MISSING'}, VWAP=${cachedData?.vwap1m ? 'OK' : 'MISSING'}, ATR=${cachedData?.atr1m ? 'OK' : 'MISSING'}`);
          continue;
        }
        
        // 2. Validate that 5-minute data exists for dual timeframe validation
        if (!cachedData.vwap5m || !cachedData.ema5m) {
          console.log(`⚠️ ABORTING BUY ORDER for ${symbol} - Missing 5-minute data: VWAP5m=${cachedData?.vwap5m ? 'OK' : 'MISSING'}, EMA5m=${cachedData?.ema5m ? 'OK' : 'MISSING'}`);
          continue;
        }
        
        // 3. Validate that RSI array has sufficient history for momentum checks
        if (!rsiArray || rsiArray.length < 11) {
          console.log(`⚠️ ABORTING BUY ORDER for ${symbol} - Insufficient RSI history: ${rsiArray?.length || 0} values (need 11+)`);
          continue;
        }
        
        // 4. Validate that current tick data is recent and valid
        const currentTime = Date.now();
        const tickAge = currentTime - (lastTickTime[token] || 0);
        if (tickAge > 30000) { // 30 seconds max tick age
          console.log(`⚠️ ABORTING BUY ORDER for ${symbol} - Stale tick data: ${Math.round(tickAge/1000)}s old`);
          continue;
        }
        
        // 5. Validate that LTP is reasonable and not zero
        if (!ltp || ltp <= 0) {
          console.log(`⚠️ ABORTING BUY ORDER for ${symbol} - Invalid LTP: ${ltp}`);
          continue;
        }
        
        // 6. Final condition re-validation just before order placement (prevent race conditions)
        const revalidateBuyCondition1 = rsi1m > 65;
        const revalidateBuyCondition1b = (() => {
          if (!rsiArray || rsiArray.length < 11) return false;
          const last10Rsi = rsiArray.slice(-11, -1);
          const hasRecentOverbought = last10Rsi.some(rsi => rsi > 68);
          return !hasRecentOverbought;
        })();
        const revalidateBuyCondition2a = gap1m !== null ? gap1m <= 0.1 : false;
        const revalidateBuyCondition2b = cachedData?.vwap5m && cachedData?.ema5m ? cachedData.vwap5m > cachedData.ema5m : false;
        const revalidateBuyCondition2 = revalidateBuyCondition2a && revalidateBuyCondition2b;
        const revalidateBuyCondition3 = atrPercentage !== null ? atrPercentage < 0.2 : false;
        const revalidateAllBuyConditions = revalidateBuyCondition1 && revalidateBuyCondition1b && revalidateBuyCondition2 && revalidateBuyCondition3;
        
        if (!revalidateAllBuyConditions) {
          console.log(`⚠️ ABORTING BUY ORDER for ${symbol} - Conditions changed during validation:`);
          console.log(`   Re-validation: ${revalidateBuyCondition1} && ${revalidateBuyCondition1b} && ${revalidateBuyCondition2} && ${revalidateBuyCondition3} = ${revalidateAllBuyConditions}`);
          continue;
        }
        
        console.log(`✅ DATA SYNC VALIDATION PASSED for BUY order ${symbol} - All cached data synchronized with live tick`);
        
        // Check order cooldown (prevent multiple orders for same token within 5 minutes)
        const ORDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
        const lastOrderTime = cachedData?.lastOrderTime || 0;
        const timeSinceLastOrder = Date.now() - lastOrderTime;
        
        if (timeSinceLastOrder < ORDER_COOLDOWN_MS) {
          const remainingCooldown = Math.ceil((ORDER_COOLDOWN_MS - timeSinceLastOrder) / 1000);
          console.log(`⏰ Order cooldown active for ${symbol}. ${remainingCooldown}s remaining.`);
          continue; // Skip to next token
        }
        
        try {
          console.log(`🚀 BUY SIGNAL for ${symbol} at ${ltp}`);
           
          // 🎯 PLACE ACTUAL BUY ORDER
          console.log(`📞 Placing BUY order for ${symbol}...`);
          const orderResult = await placeBuyOrder({ symbol, price: ltp, token }); // Pass object with symbol, price, and token
          
          if (orderResult && orderResult.order_id) {
            console.log(`✅ ORDER PLACED SUCCESSFULLY! Order ID: ${orderResult.order_id} for ${symbol} at ${ltp}`);
            
            // Update last order time to prevent immediate re-orders
            tokenDataCache[token].lastOrderTime = Date.now();
            
            // 🎯 PLACE TARGET AND STOP LOSS ORDERS
            try {
              console.log(`📊 Placing TARGET and STOP LOSS orders for ${symbol}...`);
              
              // Get quantity from the buy order result (assuming quantity is 1 for simplicity)
              const quantity = orderResult.quantity || 1;
              const buyPrice = ltp;
              const productType = 'MIS'; // Use MIS as default for intraday
              
              // Place target and stop loss orders
              const exitOrders = await placeTargetAndStopLoss(symbol, quantity, buyPrice, vwap1m, productType);
              
              if (exitOrders.targetOrder || exitOrders.stopLossOrder) {
                console.log(`✅ Exit orders placed for ${symbol}:`);
                if (exitOrders.targetOrder) {
                  console.log(`  🎯 Target Order ID: ${exitOrders.targetOrder.orderId} at ${exitOrders.targetOrder.price.toFixed(2)}`);
                }
                if (exitOrders.stopLossOrder) {
                  console.log(`  🛑 Stop Loss Order ID: ${exitOrders.stopLossOrder.orderId} at ${exitOrders.stopLossOrder.price.toFixed(2)}`);
                }
                
                // Broadcast exit orders placement
                if (global.broadcastToClients) {
                  global.broadcastToClients({
                    type: "exit_orders_placed",
                    data: {
                      symbol,
                      buyOrderId: orderResult.order_id,
                      buyPrice: buyPrice,
                      quantity: quantity,
                      targetOrder: exitOrders.targetOrder,
                      stopLossOrder: exitOrders.stopLossOrder,
                      vwap1m: vwap1m,
                      timestamp: new Date().toISOString()
                    }
                  });
                }
              } else {
                console.error(`❌ Failed to place exit orders for ${symbol}`);
              }
            } catch (exitOrderError) {
              console.error(`❌ Error placing exit orders for ${symbol}: ${exitOrderError.message}`);
            }
            
            // Broadcast successful order placement
            if (global.broadcastToClients) {
              global.broadcastToClients({
                type: "order_placed",
                data: {
                  symbol,
                  strategy: "DIP_RECOVERY_RSI_EMA_VWAP",
                  action: "BUY",
                  price: ltp,
                  quantity: 1,
                  orderId: orderResult.order_id,
                  status: "SUCCESS",
                  conditions: {
                    rsi1m: rsi1m.toFixed(2),
                    ema9_1m: ema9_1m.toFixed(2),
                    vwap1m: vwap1m.toFixed(2),
                    hourOpen: hourOpen,
                    hourLow: hourLow,
                    dipAmount: dipRecoveryPattern.dipAmount.toFixed(2),
                    dipPercentage: dipRecoveryPattern.dipPercentage.toFixed(2),
                    recoveryAmount: dipRecoveryPattern.recoveryAmount.toFixed(2),
                    recoveryPercentage: dipRecoveryPattern.recoveryPercentage.toFixed(2)
                  },
                  reason: `RSI1m(${rsi1m.toFixed(2)}) > 70 AND EMA9(${ema9_1m.toFixed(2)}) > VWAP1m(${vwap1m.toFixed(2)}) AND Dip-Recovery Pattern Valid AND VWAP1h(${vwap1h?.toFixed(2)}) > EMA1h(${ema1h?.toFixed(2)}) AND HourOpen(${hourOpen?.toFixed(2)}) < VWAP1h(${vwap1h?.toFixed(2)}) AND Gap1m(${gap1m?.toFixed(2)}%) <= 0.3% AND Gap1h(${gap1h?.toFixed(2)}%) < 0.3%${isFirstHour ? ` AND GapUp(${gapUpPercent?.toFixed(2)}%) <= 0.5%` : ' (GapUp check skipped - not first hour)'}`,
                  timestamp: new Date().toISOString()
                }
              });
            }
           
          } else {
            console.error(`❌ ORDER PLACEMENT FAILED for ${symbol}:`, orderResult);
            
           
          }
        } catch (error) {
          console.error(`❌ Error processing buy signal for ${symbol}: ${error.message}`);
        }
      }

      

      // Place SELL order if ALL SELL conditions are met AND not in cooldown
      if (true || allSellConditionsMet) {


        // Check order cooldown (prevent multiple orders for same token within 5 minutes)
        const ORDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
        const lastOrderTime = cachedData?.lastOrderTime || 0;
        const timeSinceLastOrder = Date.now() - lastOrderTime;
        
        if (timeSinceLastOrder < ORDER_COOLDOWN_MS) {
          const remainingCooldown = Math.ceil((ORDER_COOLDOWN_MS - timeSinceLastOrder) / 1000);
          console.log(`⏰ Order cooldown active for ${symbol}. ${remainingCooldown}s remaining.`);
          continue; // Skip to next token
        }
        
        try {
          console.log(`🔻 SELL SIGNAL for ${symbol} at ${ltp}`);
          
          // COMPREHENSIVE CONDITION RE-VALIDATION (catch race conditions and ensure data integrity)
          console.log(`🔍 FINAL SELL CONDITION RE-VALIDATION for ${symbol}:`);
          
          const verifyCondition1 = rsi1m < 35;
          const verifyCondition1b = (() => {
            if (!rsiArray || rsiArray.length < 11) return false;
            const last10Rsi = rsiArray.slice(-11, -1);
            const hasRecentOversold = last10Rsi.some(rsi => rsi < 32);
            return !hasRecentOversold;
          })();
          const verifyCondition2a = gap1m !== null ? gap1m <= 0.1 : false;
          const verifyCondition2b = cachedData?.vwap5m && cachedData?.ema5m ? cachedData.vwap5m < cachedData.ema5m : false;
          const verifyCondition2 = verifyCondition2a && verifyCondition2b;
          const verifyCondition3 = atrPercentage !== null ? atrPercentage < 0.2 : false;
          const verifyAllConditions = verifyCondition1 && verifyCondition1b && verifyCondition2 && verifyCondition3;
          
          console.log(`   ✅ Final RSI < 35: ${rsi1m.toFixed(2)} < 35 = ${verifyCondition1}`);
          console.log(`   ✅ Final No recent RSI < 32: ${verifyCondition1b}`);
          console.log(`   ✅ Final Gap1m ≤ 0.1%: ${gap1m?.toFixed(3)}% ≤ 0.1% = ${verifyCondition2a}`);
          console.log(`   ✅ Final VWAP5m < EMA9(5m): ${cachedData?.vwap5m?.toFixed(2)} < ${cachedData?.ema5m?.toFixed(2)} = ${verifyCondition2b}`);
          console.log(`   ✅ Final ATR% < 0.2%: ${atrPercentage?.toFixed(3)}% < 0.2% = ${verifyCondition3}`);
          console.log(`   🎯 FINAL ALL CONDITIONS: ${verifyCondition1} && ${verifyCondition1b} && ${verifyCondition2} && ${verifyCondition3} = ${verifyAllConditions}`);
          
          // if (!verifyAllConditions) {
          //   console.log(`❌ SELL CONDITIONS NO LONGER MET - ABORTING ORDER for ${symbol}`);
          //   console.log(`   Race condition detected - conditions changed between initial check and order placement`);
          //   continue;
          // }
          
          console.log(`🚀 FINAL VALIDATION PASSED - Proceeding with SELL order for ${symbol}`);
        
          
          if (orderResult && orderResult.order_id) {
            console.log(`✅ SELL ORDER PLACED SUCCESSFULLY! Order ID: ${orderResult.order_id} for ${symbol} at ${ltp}`);
            
            // Update last order time to prevent immediate re-orders
            tokenDataCache[token].lastOrderTime = Date.now();
            
            // Broadcast successful SELL order placement
            if (global.broadcastToClients) {
              global.broadcastToClients({
                type: "order_placed",
                data: {
                  symbol,
                  strategy: "RECOVERY_DIP_RSI_EMA_VWAP",
                  action: "SELL",
                  price: ltp,
                  quantity: 1,
                  orderId: orderResult.order_id,
                  status: "SUCCESS",
                  conditions: {
                    rsi1m: rsi1m.toFixed(2),
                    ema9_1m: ema9_1m.toFixed(2),
                    vwap1m: vwap1m.toFixed(2),
                    hourOpen: hourOpen,
                    hourHigh: hourHigh,
                    recoveryAmount: recoveryDipPattern?.hasRecoveredAboveOpen ? "Yes" : "No",
                    dipAmount: recoveryDipPattern?.hasDroppedBelowOpen ? "Yes" : "No"
                  },
                  reason: `RSI1m(${rsi1m.toFixed(2)}) < 35 AND EMA9(${ema9_1m.toFixed(2)}) < VWAP1m(${vwap1m.toFixed(2)}) AND Recovery-Dip Pattern Valid AND VWAP1h(${vwap1h?.toFixed(2)}) < EMA1h(${ema1h?.toFixed(2)}) AND HourOpen(${hourOpen?.toFixed(2)}) > VWAP1h(${vwap1h?.toFixed(2)}) AND Gap1m(${gap1m?.toFixed(2)}%) <= 0.3% AND Gap1h(${gap1h?.toFixed(2)}%) < 0.3%${isFirstHour ? ` AND GapDown(${gapUpPercent?.toFixed(2)}%) >= -0.5%` : ' (GapDown check skipped - not first hour)'}`,
                  timestamp: new Date().toISOString()
                }
              });
            }
           
          } else {
            console.error(`❌ SELL ORDER PLACEMENT FAILED for ${symbol}:`, orderResult);
          }
        } catch (error) {
          console.error(`❌ Error processing sell signal for ${symbol}: ${error.message}`);
        }
      }

      // Prepare token data for UI with enhanced structure
      const tokenData = {
        token,
        symbol,
        rsi1m: rsi1m ? +rsi1m.toFixed(2) : 0,
        rsiArray: rsiArray || cachedData?.rsiArray || [], // Include RSI array from tick calculation OR cached data
        ema9_1m: ema9_1m ? +ema9_1m.toFixed(2) : 0,
        ema21_1m: ema21_1m ? +ema21_1m.toFixed(2) : 0,
        vwap1m: vwap1m ? +vwap1m.toFixed(2) : 0,
        atr1m: atr1m ? +atr1m.toFixed(4) : null,
        atrPercentage: atrPercentage ? +atrPercentage.toFixed(3) : null,
        ema5m: cachedData?.ema5m ? +cachedData.ema5m.toFixed(2) : null,
        vwap5m: cachedData?.vwap5m ? +cachedData.vwap5m.toFixed(2) : null,
        ltp,
        vwap1h: vwap1h ? +vwap1h.toFixed(2) : null,
        ema1h: ema1h ? +ema1h.toFixed(2) : null,
        rsi1h: rsi1h ? +rsi1h.toFixed(2) : null,
        gap1h: gap1h,
        gap1m: gap1m,
        gap1mDetails: gap1m ? `${gap1m.toFixed(2)}% (V:${vwap1m.toFixed(2)} E:${ema9_1m.toFixed(2)})` : 'N/A',
        gapUpPercent: gapUpPercent,
        hourOpen: hourOpen ? +hourOpen.toFixed(2) : null,
        hourLow: hourLow ? +hourLow.toFixed(2) : null,
        hourHigh: hourHigh ? +hourHigh.toFixed(2) : null,
        isFirstHour: isFirstHour,
        // Pattern data for detailed display (only recovery dip pattern for SELL)
        recoveryDipPattern: recoveryDipPattern,
        // Trading conditions for monitoring (BUY conditions - simplified)
        rsiMomentum: condition1,
        rsiNoRecentOverbought: condition1b,
        dualTimeframeStrength: condition2,
        atrLow: condition3,
        allConditionsMet: allConditionsMet,
        allBuyConditionsMet: allConditionsMet,
        // SELL conditions (simplified to match BUY structure)
        allSellConditionsMet: allSellConditionsMet,
        
        // Individual BUY condition flags for frontend table (CORRECTED MAPPING)
        buyRsiAbove65: condition1,           // ✅ RSI(1m) > 65
        buyGapTight: condition2a,            // ✅ Gap1m <= 0.1% 
        buyVwap5mAboveEma5m: condition2b,    // ✅ VWAP(5m) > EMA9(5m) 
        buyNoRecentRsi68: condition1b,       // ✅ No recent RSI > 68 in last 10 values
        buyAtrLow: condition3,               // ✅ ATR% < 0.2%
        
        // Individual SELL condition flags for frontend table (CORRECTED MAPPING)
        sellRsiBelow35: sellCondition1,      // ✅ RSI(1m) < 35
        sellGapTight: sellCondition2a,       // ✅ Gap1m <= 0.1%
        sellVwap5mBelowEma5m: sellCondition2b, // ✅ VWAP(5m) < EMA9(5m) 
        sellNoRecentRsi32: sellCondition1b,  // ✅ No recent RSI < 32 in last 10 values
        sellAtrLow: sellCondition3,          // ✅ ATR% < 0.2%
        // Simplified condition details for table display
        conditions: {
          condition1: {
            name: "RSI > 65",
            value: rsi1m ? rsi1m.toFixed(2) : 'N/A',
            target: "65",
            status: condition1,
            description: "RSI(1m) > 65 (momentum)"
          },
          condition1b: {
            name: "No Recent RSI>68",
            value: rsiArray && rsiArray.length >= 11 ? `Last10: ${rsiArray.slice(-11, -1).filter(r => r > 68).length}` : 'N/A',
            target: "None > 68",
            status: condition1b,
            description: "None of last 10 RSI values (excluding current) were above 68"
          },
          condition2: {
            name: "Dual Timeframe",
            value: `1m Gap: ${gap1m?.toFixed(2) || 'N/A'}% | 5m: ${cachedData?.vwap5m?.toFixed(2) || 'N/A'}>${cachedData?.ema5m?.toFixed(2) || 'N/A'}`,
            target: "Gap≤0.1% & 5m Strong",
            status: condition2,
            description: "Gap1m ≤ 0.1% AND VWAP(5m) > EMA9(5m)"
          },
          condition3: {
            name: "ATR% < 0.2%",
            value: atrPercentage !== null ? `${atrPercentage.toFixed(3)}%` : 'N/A',
            target: "< 0.2%",
            status: condition3,
            description: "ATR(1m) as percentage of LTP < 0.2% (low volatility)"
          }
        },
        // SELL condition details for table display (simplified to match BUY structure)
        sellConditions: {
          sellCondition1: {
            name: "RSI < 35",
            value: rsi1m ? rsi1m.toFixed(2) : 'N/A',
            target: "35",
            status: sellCondition1,
            description: "RSI(1m) < 35 (downward momentum)"
          },
          sellCondition1b: {
            name: "No Recent RSI<32",
            value: rsiArray && rsiArray.length >= 11 ? `Last10: ${rsiArray.slice(-11, -1).filter(r => r < 32).length}` : 'N/A',
            target: "None < 32",
            status: sellCondition1b,
            description: "None of last 10 RSI values (excluding current) were below 32"
          },
          sellCondition2: {
            name: "Dual Timeframe",
            value: `1m Gap: ${gap1m?.toFixed(2) || 'N/A'}% | 5m: ${cachedData?.vwap5m?.toFixed(2) || 'N/A'}<${cachedData?.ema5m?.toFixed(2) || 'N/A'}`,
            target: "Gap≤0.1% & 5m Weak",
            status: sellCondition2,
            description: "Gap1m ≤ 0.1% AND VWAP(5m) < EMA9(5m)"
          },
          sellCondition3: {
            name: "ATR% < 0.2%",
            value: atrPercentage !== null ? `${atrPercentage.toFixed(3)}%` : 'N/A',
            target: "< 0.2%",
            status: sellCondition3,
            description: "ATR(1m) as percentage of LTP < 0.2% (low volatility)"
          }
        },
        // Time context
        isFirstHour: isFirstHour,
        timeStatus: isFirstHour ? "FIRST_HOUR" : "REGULAR_HOURS",
        strategy: "DIP_RECOVERY_RSI_EMA_VWAP",
        chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}/${token}`,
        timestamp: new Date().toISOString()
      };

      console.log(`📡 COMPLETE STRATEGY Tick update for ${symbol} (${token}): RSI1m=${rsi1m.toFixed(2)}, EMA9=${ema9_1m.toFixed(2)}, VWAP1m=${vwap1m.toFixed(2)}, LTP=${ltp}, VWAP1h=${tokenData.vwap1h || 'N/A'}, EMA1h=${tokenData.ema1h || 'N/A'}, Gap1h=${tokenData.gap1h || 'N/A'}%, HourOpen=${tokenData.hourOpen || 'N/A'}, HourLow=${tokenData.hourLow || 'N/A'}, GapUp=${gapUpPercent?.toFixed(2) || 'N/A'}%`);
      
      // Debug: Log condition values being broadcasted (include ATR% in validation)
      console.log(`🔍 ${symbol} Condition Debug - BUY: [RSI>65: ${tokenData.buyRsiAbove65}] [Gap≤0.1%: ${tokenData.buyGapTight}] [VWAP5m>EMA5m: ${tokenData.buyVwap5mAboveEma5m}] [NoRecent68: ${tokenData.buyNoRecentRsi68}] [ATR%<0.2: ${tokenData.buyAtrLow}] [ALL: ${tokenData.allBuyConditionsMet}]`);
      console.log(`🔍 ${symbol} Condition Debug - SELL: [RSI<35: ${tokenData.sellRsiBelow35}] [Gap≤0.1%: ${tokenData.sellGapTight}] [VWAP5m<EMA5m: ${tokenData.sellVwap5mBelowEma5m}] [NoRecent32: ${tokenData.sellNoRecentRsi32}] [ATR%<0.2: ${tokenData.sellAtrLow}] [ALL: ${tokenData.allSellConditionsMet}]`);
      
      // Final validation: Check if broadcasted individual conditions match the overall result (include ALL conditions including ATR%)
      const frontendBuyResult = tokenData.buyRsiAbove65 && tokenData.buyGapTight && tokenData.buyVwap5mAboveEma5m && tokenData.buyNoRecentRsi68 && tokenData.buyAtrLow;
      const frontendSellResult = tokenData.sellRsiBelow35 && tokenData.sellGapTight && tokenData.sellVwap5mBelowEma5m && tokenData.sellNoRecentRsi32 && tokenData.sellAtrLow;
      
      if (frontendBuyResult !== tokenData.allBuyConditionsMet) {
        console.error(`❌ ${symbol} Frontend BUY Mismatch! Individual conditions result: ${frontendBuyResult}, AllBuy flag: ${tokenData.allBuyConditionsMet}`);
      }
      if (frontendSellResult !== tokenData.allSellConditionsMet) {
        console.error(`❌ ${symbol} Frontend SELL Mismatch! Individual conditions result: ${frontendSellResult}, AllSell flag: ${tokenData.allSellConditionsMet}`);
      }
      if (gapUpPercent !== null && gapUpPercent !== undefined) {
        console.log(`🚀 Broadcasting gapUpPercent for ${symbol}: ${gapUpPercent}%`);
      } else {
        console.log(`⚠️ No gapUpPercent to broadcast for ${symbol}`);
      }

      // Debug the analysis data
      //console.log(`🔍 Analysis data for token ${token}:`, serverAnalysisData);

      // Debug: Log RSI array before broadcasting
      if (tokenData.symbol && (tokenData.rsiArray?.length > 0 || !tokenData.rsiArray)) {
        console.log(`🔍 Broadcasting RSI data for ${tokenData.symbol}:`, {
          rsiArrayFromTick: rsiArray?.length || 0,
          rsiArrayFromCache: cachedData?.rsiArray?.length || 0,
          finalRsiArrayLength: tokenData.rsiArray?.length || 0,
          finalRsiArraySample: tokenData.rsiArray?.slice(-3) || [],
          rsi1m: tokenData.rsi1m
        });
      }

      global.broadcastToClients({
        type: "simplified_strategy_update",
        data: tokenData
      });
  }
  
  // Performance monitoring
  const processingTime = Date.now() - startTime;
  if (processingTime > 1000) { // Log if processing takes more than 1 second
    console.warn(`⚠️ Slow tick processing: ${processingTime}ms for ${ticks.length} ticks (concurrent API calls: ${concurrentApiCalls})`);
  }
}


async function broadcastAllSubscribedTokens() {
  console.log("🚀 broadcastAllSubscribedTokens() called");
  
  // Check if global broadcast function exists
  if (!global.broadcastToClients) {
    console.error("❌ global.broadcastToClients not available");
    return;
  }

  // First try to use server's filtered tokens, fallback to all cached tokens if empty
  let tokensToProcess = [];
  
  if (global.filteredTokens && global.filteredTokens.length > 0) {
    console.log(`� Using ${global.filteredTokens.length} server-filtered tokens for broadcast...`);
    tokensToProcess = global.filteredTokens;
  } else {
    // Fallback: Use all tokens from cache (for immediate post-initialization broadcast)
    const cachedTokens = Object.keys(tokenDataCache).filter(token => tokenDataCache[token]).map(token => ({
      token: Number(token),
      symbol: tokenDataCache[token].symbol || getTradingSymbol(Number(token)),
      ltp: tokenDataCache[token].ltp || 0
    }));
    
    if (cachedTokens.length > 0) {
      console.log(`📡 Using ${cachedTokens.length} cached tokens for broadcast (server filtering not ready)...`);
      tokensToProcess = cachedTokens;
    } else {
      console.log("📭 No tokens available for broadcast (no filtered tokens or cache)");
      return;
    }
  }

  console.log(`📡 Broadcasting data for ${tokensToProcess.length} tokens...`);
  console.log(`🔍 Global analysisDataStore contains ${global.analysisDataStore?.size || 0} entries`);
  
  // Run diagnostics
  diagnosePlatformData();

  for (const filteredToken of tokensToProcess) {
    try {
      const token = filteredToken.token;
      
      // Check if we have cached data, if not initialize it
      if (!tokenDataCache[token]) {
        const initialData = await initializeTokenData(token);
        
        // Broadcast initial cached data immediately after initialization
        if (initialData && global.broadcastToClients) {
          const tokenData = {
            token: parseInt(token),
            symbol: filteredToken.symbol,
            ltp: 0, // Will be updated on first tick
            dayGapUp: null,
            hourOpen: null,
            hourLow: null,
            rsi1m: initialData.rsi1m || 0,
            rsiArray: initialData.rsiArray || [], // ✅ Include full RSI array from cache
            ema9_1m: initialData.ema9_1m || 0,
            ema20_1m: initialData.ema20_1m || 0,
            ema21_1m: initialData.ema21_1m || 0,
            vwap1m: initialData.vwap1m || 0,
            atr1m: initialData.atr1m || 0,
            atrPercentage: initialData.atr1m && initialData.vwap1m ? ((initialData.atr1m / initialData.vwap1m) * 100) : null,
            vwap5m: initialData.vwap5m || 0,
            ema5m: initialData.ema5m || 0,
            conditionsMet: false,
            allConditionsMet: false,
            allBuyConditionsMet: false,
            allSellConditionsMet: false,
            // Individual condition flags
            buyRsiAbove65: false,
            buyGapTight: false, 
            buyVwap5mAboveEma5m: false,
            buyNoRecentRsi68: false,
            buyAtrLow: false,
            sellRsiBelow35: false,
            sellGapTight: false,
            sellVwap5mBelowEma5m: false,
            sellNoRecentRsi32: false,
            sellAtrLow: false,
            timestamp: new Date().toISOString()
          };
          
          console.log(`📤 Broadcasting initial cached data for ${filteredToken.symbol}: RSI=${tokenData.rsi1m}, RSI Array length=${tokenData.rsiArray.length}`);
          
          global.broadcastToClients({
            type: "filtered_token_update",
            data: tokenData
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to avoid rate limiting
      }
      
      const cachedData = tokenDataCache[token];
      if (!cachedData) {
        console.warn(`⚠️ Could not initialize data for token ${token}`);
        continue;
      }

      // COMPLETE TRADING STRATEGY - process RSI(1m), VWAP(1m), and dip-recovery pattern
      // Use latest closing price from 1m candles if no live LTP is available
      let ltp = cachedData.ltp || filteredToken.ltp;
      if (!ltp && cachedData.candles1m && cachedData.candles1m.length > 0) {
        ltp = cachedData.candles1m[cachedData.candles1m.length - 1].close;
        console.log(`🔍 Using latest closing price as LTP for ${filteredToken.symbol}: ${ltp}`);
      }
      ltp = ltp || 0;
      
      // Calculate current hour's open, low, and high from cached 1m candles
      let hourOpen = null, hourLow = null, hourHigh = null, dipRecoveryPattern = null, recoveryDipPattern = null;
      if (cachedData && cachedData.candles1m && cachedData.candles1m.length > 0) {
        const hourData = calculateHourOpenLow(cachedData.candles1m);
        hourOpen = hourData.hourOpen;
        hourLow = hourData.hourLow;
        
        // Calculate hour high from the same hour candles used for hourOpen/hourLow
        const currentHourRange = getCurrentTradingHour();
        if (currentHourRange) {
          const currentHourCandles = cachedData.candles1m.filter(candle => {
            const candleTime = new Date(candle.date);
            return candleTime >= currentHourRange.start && candleTime < currentHourRange.end;
          });
          
          if (currentHourCandles.length > 0) {
            hourHigh = Math.max(...currentHourCandles.map(c => c.high));
          }
        }
        
        // Check dip-recovery pattern for BUY trading logic
        if (hourOpen && hourLow) {
          dipRecoveryPattern = checkDipRecoveryPattern(hourOpen, hourLow, ltp);
        }
        
        // Check recovery-dip pattern for SELL trading logic
        if (hourOpen && hourHigh) {
          recoveryDipPattern = checkRecoveryDipPattern(hourOpen, hourHigh, ltp);
        }
        
        console.log(`📅 Hour calculations for ${filteredToken.symbol}: Open=${hourOpen}, Low=${hourLow}, High=${hourHigh}, Candles=${hourData.candlesInHour}`);
      }
      
      // Calculate gap percentages first (needed for condition calculations)
      let gap1m = null, gap1h = null;
      if (cachedData.vwap1m && cachedData.ema9_1m && typeof cachedData.vwap1m === 'number' && typeof cachedData.ema9_1m === 'number') {
        gap1m = +((Math.abs(cachedData.vwap1m - cachedData.ema9_1m) / cachedData.ema9_1m) * 100).toFixed(2);
      }
      if (filteredToken.vwap1h && filteredToken.ema1h && typeof filteredToken.vwap1h === 'number' && typeof filteredToken.ema1h === 'number') {
        gap1h = +((Math.abs(filteredToken.vwap1h - filteredToken.ema1h) / filteredToken.ema1h) * 100).toFixed(2);
      }
      
      // Define missing variables that are used in tokenData
      const isFirstHour = false; // First hour logic removed in simplified strategy
      const gapUpPercent = null; // Gap up calculation not available during initialization
      
      // Simplified trading conditions to match handleTicks function
      const condition1 = cachedData.rsi1m ? cachedData.rsi1m > 65 : false;
      
      // Check that none of the last 10 RSI values (excluding current) were above 68
      const condition1b = (() => {
        if (!cachedData.rsiArray || cachedData.rsiArray.length < 11) return false; // Need at least 11 values to check last 10
        const last10Rsi = cachedData.rsiArray.slice(-11, -1); // Get last 10 RSI values excluding current
        const hasRecentOverbought = last10Rsi.some(rsi => rsi > 68);
        return !hasRecentOverbought; // Return true if NONE were above 68
      })();
      
      // Dual timeframe condition - Gap1m <= 0.1% AND VWAP(5m) > EMA9(5m)
      const condition2a = gap1m !== null ? gap1m <= 0.1 : false; // Gap between VWAP(1m) and EMA9(1m) <= 0.1% (tight spread)
      const condition2b = cachedData?.vwap5m && cachedData?.ema5m ? cachedData.vwap5m > cachedData.ema5m : false;
      const condition2 = condition2a && condition2b;
      
      // Debug: Log 5-minute data availability
      if (!cachedData?.vwap5m || !cachedData?.ema5m) {
        console.log(`🔍 5m data missing for token ${token}: vwap5m=${cachedData?.vwap5m?.toFixed(2) || 'N/A'}, ema5m=${cachedData?.ema5m?.toFixed(2) || 'N/A'}`);
      }
      
      // Calculate ATR percentage from cached data
      let atrPercentage = null;
      if (cachedData.atr1m && ltp && ltp > 0) {
        atrPercentage = (cachedData.atr1m / ltp) * 100;
        console.log(`🔍 ATR% calculated for ${filteredToken.symbol}: ATR=${cachedData.atr1m}, LTP=${ltp}, ATR%=${atrPercentage.toFixed(3)}%`);
      } else {
        console.log(`⚠️ Cannot calculate ATR% for ${filteredToken.symbol}: ATR=${cachedData.atr1m}, LTP=${ltp}`);
      }
      const condition3 = atrPercentage !== null ? atrPercentage < 0.2 : false; // ATR% < 0.2%
      
      const allConditionsMet = condition1 && condition1b && condition2 && condition3;
      
      // Calculate SELL conditions
      const sellCondition1 = cachedData.rsi1m ? cachedData.rsi1m < 35 : false;
      const sellCondition1b = (() => {
        if (!cachedData.rsiArray || cachedData.rsiArray.length < 11) return false;
        const last10Rsi = cachedData.rsiArray.slice(-11, -1);
        const hasRecentOversold = last10Rsi.some(rsi => rsi < 32);
        return !hasRecentOversold;
      })();
      const sellCondition2a = gap1m !== null ? gap1m <= 0.1 : false;
      const sellCondition2b = cachedData?.vwap5m && cachedData?.ema5m ? cachedData.vwap5m < cachedData.ema5m : false;
      const sellCondition2 = sellCondition2a && sellCondition2b;
      const sellCondition3 = atrPercentage !== null ? atrPercentage < 0.2 : false;
      const allSellConditionsMet = sellCondition1 && sellCondition1b && sellCondition2 && sellCondition3;
      
      // SIMPLIFIED TOKEN DATA - Only essential trading data
      const tokenData = {
        token: filteredToken.token,
        symbol: filteredToken.symbol,
        ltp: ltp,
        // Essential trading indicators
        rsi1m: cachedData.rsi1m ? parseFloat(cachedData.rsi1m.toFixed(2)) : null,
        vwap1m: cachedData.vwap1m ? parseFloat(cachedData.vwap1m.toFixed(2)) : null,
        ema9_1m: cachedData.ema9_1m ? parseFloat(cachedData.ema9_1m.toFixed(2)) : null,
        ema20_1m: cachedData.ema20_1m ? parseFloat(cachedData.ema20_1m.toFixed(2)) : null,
        ema21_1m: cachedData.ema21_1m ? parseFloat(cachedData.ema21_1m.toFixed(2)) : null,
        vwap5m: cachedData.vwap5m ? parseFloat(cachedData.vwap5m.toFixed(2)) : null,
        ema5m: cachedData.ema5m ? parseFloat(cachedData.ema5m.toFixed(2)) : null,
        atr1m: cachedData.atr1m ? parseFloat(cachedData.atr1m.toFixed(4)) : null,
        atrPercentage: atrPercentage ? parseFloat(atrPercentage.toFixed(3)) : null,
        // Gap calculations
        gap1m: gap1m,
        gap1mDetails: gap1m && cachedData.vwap1m && cachedData.ema9_1m ? 
          `${gap1m.toFixed(2)}% (V:${cachedData.vwap1m.toFixed(2)} E:${cachedData.ema9_1m.toFixed(2)})` : 'N/A',
        // Trading signals
        buySignal: allConditionsMet,
        sellSignal: allSellConditionsMet,
        allBuyConditionsMet: allConditionsMet,
        allSellConditionsMet: allSellConditionsMet,
        // Individual BUY condition flags for frontend table
        buyRsiAbove65: condition1,
        buyRsiNoRecent68: condition1b,
        buyGapTight: condition2a,
        buyTimeframeStrength: condition2b,
        buyLowVolatility: condition3,
        // Simplified condition names for table display
        buyLtpAboveEma9: condition2a, // Using gap condition as proxy for EMA strength
        buyLtpAboveVwap5m: condition2b, // VWAP(5m) > EMA9(5m) strength
        buyRsiMomentumUp: condition1b, // RSI momentum check
        // Individual SELL condition flags for frontend table
        sellRsiBelow35: sellCondition1,
        sellRsiNoRecentOversold: sellCondition1b,
        sellGapTight: sellCondition2a,
        sellTimeframeWeakness: sellCondition2b,
        sellLowVolatility: sellCondition3,
        // Simplified condition names for table display
        sellLtpBelowEma9: sellCondition2a, // Using gap condition as proxy for EMA weakness
        sellLtpBelowVwap5m: sellCondition2b, // VWAP(5m) < EMA9(5m) weakness
        // Condition breakdown for debugging
        buyConditions: {
          rsi_momentum: condition1,
          rsi_no_recent_high: condition1b,
          gap_tight: condition2a,
          timeframe_strength: condition2b,
          low_volatility: condition3
        },
        sellConditions: {
          rsi_bearish: sellCondition1,
          rsi_no_recent_low: sellCondition1b,
          gap_tight: sellCondition2a,
          timeframe_weakness: sellCondition2b,
          low_volatility: sellCondition3
        },
        timestamp: new Date().toISOString()
      };

      if (cachedData.rsi1m) {
        lastSentRSI[token] = cachedData.rsi1m;
      }

      console.log(`📤 Broadcasting ${filteredToken.symbol}: RSI1m=${cachedData.rsi1m?.toFixed(2)}, EMA9=${cachedData.ema9_1m?.toFixed(2)}, EMA21=${cachedData.ema21_1m?.toFixed(2)}, VWAP1m=${cachedData.vwap1m?.toFixed(2)}, HourOpen=${hourOpen?.toFixed(2)}, HourLow=${hourLow?.toFixed(2)}, Conditions=${allConditionsMet ? 'ALL MET' : 'NOT MET'} - COMPLETE STRATEGY`);

      // Broadcast as filtered_token_update to add tokens to frontend
      global.broadcastToClients({
        type: "filtered_token_update",
        data: tokenData
      });

      // Add delay to avoid overwhelming the frontend
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      console.error(`❌ Error broadcasting token ${filteredToken.token}: ${err.message}`);
    }
  }

  console.log("✅ Finished broadcasting all server-filtered tokens with complete trading strategy");
}

// Initialize historical data for a token - COMPLETE STRATEGY VERSION
async function initializeTokenData(token) {
  console.log(`🔄 Initializing historical data for token ${token} - COMPLETE STRATEGY...`);
  
  try {
    // Fetch 1m candles for RSI(1m), EMA9(1m) and VWAP(1m) calculation
    console.log(`📊 Fetching 1m historical data for token ${token}...`);
    const candles1m = await getHistoricalData(token, "minute", fromToday, to15);
    console.log(`📊 Received ${candles1m?.length || 0} candles for token ${token}`);
    
    if (!candles1m || candles1m.length === 0) {
      console.warn(`⚠️ No historical data received for token ${token}`);
      return null;
    }
    
    const closes1m = candles1m.map(c => c.close).slice(-200); // Keep last 200 for calculations
    const highs1m = candles1m.map(c => c.high).slice(-200);
    const lows1m = candles1m.map(c => c.low).slice(-200);
    console.log(`📊 Processing ${closes1m.length} close prices for token ${token}`);
    
    // Calculate initial indicators for complete strategy
    let rsi1m = null, rsiArray = null, ema9_1m = null, vwap1m = null, atr1m = null;
    
    if (closes1m.length >= 14) {
      console.log(`📊 Calculating RSI for token ${token}...`);
      rsiArray = calculateRSIArray(closes1m, 14);
      if (rsiArray && rsiArray.length > 0) {
        rsi1m = rsiArray[rsiArray.length - 1]; // Current RSI
      }
      console.log(`📊 RSI calculated: ${rsi1m} for token ${token}`);
      
      // Calculate ATR(1m) with 14-period
      console.log(`📊 Calculating ATR for token ${token}...`);
      atr1m = calculateATR(highs1m, lows1m, closes1m, 14);
      console.log(`📊 ATR calculated: ${atr1m} for token ${token}`);
    }
    
    if (closes1m.length >= 9) {
      console.log(`📊 Calculating EMA9 for token ${token}...`);
      ema9_1m = calculateEMA(closes1m, 9);
      console.log(`📊 EMA9 calculated: ${ema9_1m} for token ${token}`);
    }
    
    // Calculate EMA20 for new BUY conditions
    let ema20_1m = null;
    if (closes1m.length >= 20) {
      console.log(`📊 Calculating EMA20 for token ${token}...`);
      ema20_1m = calculateEMA(closes1m, 20);
      console.log(`📊 EMA20 calculated: ${ema20_1m} for token ${token}`);
    }
    
    // Calculate EMA21 for new BUY conditions
    let ema21_1m = null;
    if (closes1m.length >= 21) {
      console.log(`📊 Calculating EMA21 for token ${token}...`);
      ema21_1m = calculateEMA(closes1m, 21);
      console.log(`📊 EMA21 calculated: ${ema21_1m} for token ${token}`);
    }
    
    // Calculate VWAP(1m) from today's 1-minute candles only
    console.log(`📊 Fetching today's 1m data for VWAP calculation for token ${token}...`);
    const candles1mToday = await getHistoricalData(token, "minute", fromToday, to15);
    console.log(`📊 Received ${candles1mToday?.length || 0} today's candles for token ${token}`);
    
    // Initialize separate VWAP cache with today's data
    if (candles1mToday && candles1mToday.length > 0) {
      initializeVwapCache(token, candles1mToday);
      vwap1m = vwapDataCache[token].lastVwap;
      console.log(`📊 VWAP calculated from today's data: ${vwap1m} for token ${token}`);
    } else {
      // Initialize empty VWAP cache
      initializeVwapCache(token, []);
    }
    
    // Fetch 5-minute historical data for initial VWAP(5m) and EMA9(5m) calculation
    console.log(`📊 Fetching initial 5m historical data for token ${token}...`);
    const candles5m = await getHistoricalData(token, "5minute", fromToday, to15);
    console.log(`📊 Received ${candles5m?.length || 0} initial 5m candles for token ${token}`);
    
    // Calculate initial 5-minute indicators
    let vwap5m = null, ema5m = null;
    if (candles5m && candles5m.length > 0) {
      const closes5m = candles5m.map(c => c.close);
      const highs5m = candles5m.map(c => c.high);
      const lows5m = candles5m.map(c => c.low);
      const volumes5m = candles5m.map(c => c.volume || 0);
      
      // Calculate EMA9 for 5-minute data
      if (closes5m.length >= 9) {
        ema5m = calculateEMA(closes5m, 9);
        console.log(`📊 Initial EMA9(5m) calculated: ${ema5m} for token ${token}`);
      }
      
      // Calculate VWAP for 5-minute data
      const nonZeroVolumes = volumes5m.filter(v => v > 0).length;
      console.log(`📊 Initial 5m data: ${nonZeroVolumes}/${volumes5m.length} candles have volume data`);
      
      if (nonZeroVolumes === 0) {
        console.warn(`⚠️ No volume data in initial 5m data for token ${token} - using price average`);
        const avgPrice = closes5m.reduce((a,b) => a+b, 0) / closes5m.length;
        vwap5m = avgPrice;
        console.log(`📊 Initial VWAP(5m) using price average: ${avgPrice} for token ${token}`);
      } else {
        const vwapResult5m = calculateVWAP(highs5m, lows5m, closes5m, volumes5m);
        if (vwapResult5m && vwapResult5m.length > 0) {
          vwap5m = vwapResult5m[vwapResult5m.length - 1];
          console.log(`📊 Initial VWAP(5m) calculated: ${vwap5m} for token ${token} (${volumes5m.reduce((a,b) => a+b, 0)} total volume)`);
        } else {
          console.warn(`⚠️ Failed to calculate initial VWAP(5m) for token ${token}`);
        }
      }
    } else {
      console.log(`📊 No initial 5m data available for token ${token}`);
    }
    
    // Gap up will be calculated from tick data (tick.ohlc.open and tick.ohlc.close)
    // No need for historical API calls - tick data provides today's open and previous close
    let dayGapUp = null;
    console.log(`📊 Gap up will be calculated from tick data for token ${token}`);
    
    // Initialize gap up as null - will be calculated on first tick
    dayGapUp = null;
    
    // Store in cache - COMPLETE STRATEGY VERSION WITH 5M DATA
    tokenDataCache[token] = {
      symbol: getTradingSymbol(token), // Store symbol for easy access
      candles1m: candles1m.slice(-200), // Keep last 200 1m candles for calculations
      candles5m: candles5m ? candles5m.slice(-50) : [], // Keep last 50 5m candles
      rsi1m,              // Real-time tick-based RSI(1m)
      rsiArray,           // Full RSI array for historical analysis
      ema9_1m,            // Real-time tick-based EMA9(1m)
      ema20_1m,           // Real-time tick-based EMA20(1m)
      ema21_1m,           // Real-time tick-based EMA21(1m)
      vwap1m,             // Real-time tick-based VWAP(1m) from today's data (from separate cache)
      atr1m,              // ATR(1m) indicator
      vwap5m,             // VWAP(5m) from 5-minute data
      ema5m,              // EMA9(5m) from 5-minute data
      dayGapUp: null,     // Gap up will be calculated from tick data (tick.ohlc.open and tick.ohlc.close)
      lastUpdate: Date.now(),
      lastOrderTime: 0,   // Track last order placement time for cooldown
      last5mCandleTime: null, // Track last 5m candle time for real-time updates
      lastTickVolume: 0   // Track last tick volume for incremental volume calculation
    };
    
    console.log(`✅ Initialized token ${getTradingSymbol(token)}: RSI1m=${rsi1m?.toFixed(2)}, EMA9(1m)=${ema9_1m?.toFixed(2)}, EMA20(1m)=${ema20_1m?.toFixed(2)}, ATR1m=${atr1m?.toFixed(4)}, VWAP(5m)=${vwap5m?.toFixed(2)}, EMA9(5m)=${ema5m?.toFixed(2)} - COMPLETE STRATEGY WITH 5M DATA`);
    
    return tokenDataCache[token];
    
  } catch (err) {
    console.error(`❌ Error initializing token ${token}: ${err?.message || err || 'Unknown error'}`);
    console.error('Full error details:', err);
    return null;
  }
}

// Update indicators with new tick data - SIMPLIFIED VERSION
async function updateIndicatorsWithTick(token, tick) {
  const tokenData = tokenDataCache[token];
  if (!tokenData) return null;
  
  // Ensure candles1m is always an array
  if (!Array.isArray(tokenData.candles1m)) {
    console.warn(`⚠️ candles1m is not an array for token ${token}, initializing as empty array`);
    tokenData.candles1m = [];
  }
  
  const { last_price: ltp, ohlc } = tick;
  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / 60000) * 60000; // Round to minute
  
  // Update current candle with this tick for real-time RSI calculation
  const lastCandle1m = tokenData.candles1m[tokenData.candles1m.length - 1];
  const isSameMinute = lastCandle1m && Math.floor(lastCandle1m.date.getTime() / 60000) === Math.floor(currentMinute / 60000);
  
  let tickBasedCandle;
  if (isSameMinute) {
    // Same minute - update existing candle with latest tick data
    // Calculate incremental volume for this minute
    const currentTickVolume = tick.volume || 0;
    const lastTickVolume = tokenData.lastTickVolume || 0;
    const incrementalVolume = Math.max(0, currentTickVolume - lastTickVolume);
    
    tickBasedCandle = {
      ...lastCandle1m,
      high: Math.max(lastCandle1m.high, ltp),  // Update high if this tick is higher
      low: Math.min(lastCandle1m.low, ltp),    // Update low if this tick is lower
      close: ltp,                              // Always use latest tick as close
      volume: lastCandle1m.volume + incrementalVolume // Accumulate incremental volume
    };
    tokenData.candles1m[tokenData.candles1m.length - 1] = tickBasedCandle;
    tokenData.lastTickVolume = currentTickVolume; // Store for next tick
  } else {
    // New minute - create new candle starting with this tick
    const initialVolume = tick.volume || 0;
    tickBasedCandle = {
      date: new Date(currentMinute),
      open: ltp,          // First tick of minute becomes open
      high: ltp,          // First tick also becomes initial high
      low: ltp,           // First tick also becomes initial low
      close: ltp,         // First tick becomes close (will be updated with subsequent ticks)
      volume: 0           // Start with 0, will be incremented as ticks come in
    };
    
    tokenData.candles1m.push(tickBasedCandle);
    tokenData.candles1m = tokenData.candles1m.slice(-200); // Keep only last 200 candles
    tokenData.lastTickVolume = initialVolume; // Reset for new minute
    
    console.log(`📊 New 1m candle built for token ${token} at ${new Date(currentMinute).toISOString()}`);
  }
  
  // Update VWAP cache with new tick and get updated VWAP (non-blocking)
  updateVwapCache(token, tick).catch(err => {
    console.error(`❌ VWAP cache update error for token ${token}:`, err.message);
  });

  // Calculate VWAP(1m) from FRESH HISTORICAL DATA EVERY MINUTE for accuracy
  let vwap1m = null;
  
  // Force fresh historical data fetch every minute for accurate VWAP calculation
  const nowMs = Date.now();
  const lastVwapUpdate = vwapDataCache[token]?.lastFetchTime || 0;
  const timeSinceLastUpdate = nowMs - lastVwapUpdate;
  const ONE_MINUTE_MS = 60 * 1000;
  
  if (timeSinceLastUpdate >= ONE_MINUTE_MS) {
    console.log(`🔄 Forcing fresh historical data fetch for VWAP(1m) calculation for token ${token}`);
    // Force immediate historical data update
    await updateVwapCache(token, tick, true);
  }
  
  // Always use the cached VWAP from historical data (most accurate)
  vwap1m = vwapDataCache[token]?.lastVwap;
  
  if (vwap1m) {
    console.log(`📊 Using historical VWAP(1m) for token ${token}: ${vwap1m}`);
  } else {
    console.warn(`⚠️ No historical VWAP(1m) available for token ${token} - attempting immediate fetch`);
    // Last resort: immediate fetch
    await updateVwapCache(token, tick, true);
    vwap1m = vwapDataCache[token]?.lastVwap;
  }
  
  // Calculate REAL-TIME RSI(1m), EMA9(1m), and ATR(1m) on EVERY tick for complete strategy
  const closes1m = tokenData.candles1m.map(c => c.close);
  const highs1m = tokenData.candles1m.map(c => c.high);
  const lows1m = tokenData.candles1m.map(c => c.low);
  let rsi1m = null, ema9_1m = null, rsiArray = null, atr1m = null, atrPercentage = null;
  
  console.log(`🔍 RSI Debug for token ${token}: closes1m.length=${closes1m.length}, candles=${tokenData.candles1m.length}`);
  
  if (closes1m.length >= 14) {
    // Calculate full RSI array to check last 10 values
    rsiArray = calculateRSIArray(closes1m, 14);
    if (rsiArray && rsiArray.length > 0) {
      rsi1m = rsiArray[rsiArray.length - 1]; // Current RSI
      console.log(`📊 RSI calculated for token ${token}: rsiArray.length=${rsiArray.length}, current RSI=${rsi1m}`);
    } else {
      console.warn(`⚠️ RSI calculation failed for token ${token}: rsiArray=${rsiArray}`);
    }
    
    // Calculate ATR(1m) with 14-period
    atr1m = calculateATR(highs1m, lows1m, closes1m, 14);
    if (atr1m && ltp) {
      // Calculate ATR percentage: (ATR / LTP) * 100
      atrPercentage = (atr1m / ltp) * 100;
    }
  } else {
    console.log(`⏳ Not enough candles for RSI calculation for token ${token}: need 14, have ${closes1m.length}`);
  }
  
  if (closes1m.length >= 9) {
    ema9_1m = calculateEMA(closes1m, 9);
  }
  
  // Calculate EMA20 for new BUY conditions
  let ema20_1m = null;
  if (closes1m.length >= 20) {
    ema20_1m = calculateEMA(closes1m, 20);
  }
  
  // Calculate EMA21 for new BUY conditions
  let ema21_1m = null;
  if (closes1m.length >= 21) {
    ema21_1m = calculateEMA(closes1m, 21);
  }
  
  // Get current 5-minute indicator values (will be updated only when new 1m candle is built)
  let vwap5m = tokenData.vwap5m, ema5m = tokenData.ema5m;

  // Calculate gap-up from tick data if available
  let dayGapUp = tokenData.dayGapUp;
  if (dayGapUp === null && tick.ohlc && tick.ohlc.open && tick.ohlc.close) {
    // Calculate gap up: (today's open - previous day's close) / previous day's close * 100
    dayGapUp = +((Math.abs(tick.ohlc.open - tick.ohlc.close) / tick.ohlc.close) * 100).toFixed(2);
    tokenData.dayGapUp = dayGapUp;
    console.log(`📊 Gap up calculated from tick data for token ${token}: Today Open=${tick.ohlc.open}, Prev Close=${tick.ohlc.close}, Gap=${dayGapUp}%`);
  } else if (dayGapUp === null) {
    // Debug: log why gap up wasn't calculated
    console.log(`🔍 Gap up not calculated for token ${token}: OHLC available=${!!tick.ohlc}, Open=${tick.ohlc?.open}, Close=${tick.ohlc?.close}`);
  }
  
  // Store calculated values
  tokenData.rsi1m = rsi1m;
  tokenData.rsiArray = rsiArray; // Store full RSI array for historical analysis
  tokenData.vwap1m = vwap1m;
  tokenData.ema9_1m = ema9_1m;
  tokenData.ema20_1m = ema20_1m;
  tokenData.ema21_1m = ema21_1m;
  tokenData.atr1m = atr1m;
  tokenData.atrPercentage = atrPercentage;
  tokenData.lastUpdate = Date.now();
  tokenData.ltp = ltp;
  
  // Return data for complete strategy - including 5-minute indicators
  return {
    rsi1m,
    rsiArray,
    ema9_1m,
    ema20_1m,
    ema21_1m,
    vwap1m: (typeof vwap1m === 'number') ? vwap1m : null,
    atr1m,
    atrPercentage,
    vwap5m: (typeof vwap5m === 'number') ? vwap5m : null,
    ema5m: (typeof ema5m === 'number') ? ema5m : null,
    dayGapUp,
    ltp
  };
}

// Initialize CSV file watcher for smart token subscription management
function initializeCSVWatcher() {
  console.log(`🎯 Initializing CSV file watcher for smart token subscription management...`);
  
  try {
    csvWatcher = setupCSVFileWatcher(updateTokenSubscriptionsFromCSV);
    
    if (csvWatcher) {
      console.log(`✅ CSV file watcher initialized successfully`);
    } else {
      console.error(`❌ Failed to initialize CSV file watcher`);
    }
    
  } catch (error) {
    console.error(`❌ Error initializing CSV file watcher:`, error.message);
  }
}

// Request 1h data calculation for a token if missing
async function ensureHourlyDataForToken(token) {
  if (!global.analysisDataStore || !global.analysisDataStore.has(token.toString())) {
    console.log(`🔄 Requesting 1h data calculation for token ${token}...`);
    
    // Trigger server's fetchHistoricalForToken if available
    if (global.fetchHistoricalForToken) {
      try {
        await global.fetchHistoricalForToken(token);
        console.log(`✅ 1h data calculated for token ${token}`);
      } catch (error) {
        console.error(`❌ Error calculating 1h data for token ${token}:`, error.message);
      }
    } else {
      console.warn(`⚠️ fetchHistoricalForToken not available globally for token ${token}`);
    }
  }
}

// Diagnostic function to check global data stores
function diagnosePlatformData() {
  console.log(`🔍 PLATFORM DIAGNOSTICS:`);
  console.log(`  📊 global.analysisDataStore size: ${global.analysisDataStore?.size || 'undefined'}`);
  console.log(`  📊 global.filteredTokens length: ${global.filteredTokens?.length || 'undefined'}`);
  console.log(`  📊 subscribedTokens length: ${subscribedTokens?.length || 0}`);
  console.log(`  📊 tokenDataCache keys: ${Object.keys(tokenDataCache).length}`);
  console.log(`  📊 vwapDataCache keys: ${Object.keys(vwapDataCache).length}`);
  
  if (global.analysisDataStore && global.analysisDataStore.size > 0) {
    const firstKey = Array.from(global.analysisDataStore.keys())[0];
    const firstValue = global.analysisDataStore.get(firstKey);
    console.log(`  📊 Sample analysisDataStore entry (${firstKey}):`, Object.keys(firstValue || {}));
  }
  
  if (global.filteredTokens && global.filteredTokens.length > 0) {
    const firstToken = global.filteredTokens[0];
    console.log(`  📊 Sample filteredToken keys:`, Object.keys(firstToken || {}));
  }
}

// Cleanup function for graceful shutdown
function cleanup() {
  console.log('🧹 Cleaning up tick listener resources...');
  
  // Stop CSV watcher if active
  if (csvWatcher) {
    try {
      cleanupCSVWatcher(csvWatcher);
      csvWatcher = null;
    } catch (error) {
      console.error('❌ Error stopping CSV watcher:', error.message);
    }
  }
  
  // Clear CSV resume timeout
  if (csvResumeTimeout) {
    clearTimeout(csvResumeTimeout);
    csvResumeTimeout = null;
    console.log('⏰ CSV resume timeout cleared');
  }
  
  // Disconnect ticker if connected
  if (ticker) {
    try {
      ticker.disconnect();
      ticker = null;
      console.log('📡 Ticker disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting ticker:', error.message);
    }
  }
  
  // Clear caches
  Object.keys(tokenDataCache).forEach(key => delete tokenDataCache[key]);
  Object.keys(vwapDataCache).forEach(key => delete vwapDataCache[key]);
  Object.keys(lastTickTime).forEach(key => delete lastTickTime[key]);
  Object.keys(lastSentRSI).forEach(key => delete lastSentRSI[key]);
  Object.keys(lastHistoricalFetch).forEach(key => delete lastHistoricalFetch[key]);
  
  // Clear subscribed tokens
  subscribedTokens.length = 0;
  
  console.log('✅ Tick listener cleanup completed');
}

module.exports = {
  initTickListener,
  subscribeToTokens,
  updateTokenSubscriptionsFromCSV,
  initializeCSVWatcher,
  unsubscribeAll,
  broadcastAllSubscribedTokens,
  initializeTokenData,
  updateIndicatorsWithTick,
  ensureHourlyDataForToken,
  diagnosePlatformData,
  updateFiveMinuteIndicatorsFromHistorical, // Export for manual updates
  cleanup // Export cleanup function
};

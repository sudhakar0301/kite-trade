const { KiteTicker } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
const { getKiteConnect } = require("../kite/connection");
const { calculateRSI, calculateVWAP, calculateEMA, calculateATR } = require("../strategy/indicators");
const { getHistoricalData } = require("../strategy/scanner");
const { from35, from15, fromToday, to15 } = require("../utils/fromAndToDate");
const instruments = require("../data/nse500.json");
const { placeBuyOrder, checkAndPlaceExitOrders } = require("../orders/orderManager");
const { checkVolumeCondition, initializeVolumeData } = require("./volumeAnalyzer");

// Import robust functions from tickListener.js
const { 
  initializeTokenData: initializeTokenDataFromOriginal, 
  updateIndicatorsWithTick: updateIndicatorsWithTickFromOriginal 
} = require("./tickListener");

const accessTokenPath = path.join(__dirname, "../access_token.txt");
const api_key = 'r1a7qo9w30bxsfax';
const access_token = fs.readFileSync(accessTokenPath, "utf8").trim();

let ticker = null;
let subscribedTokens = [];
const lastTickTime = {};
const lastSentRSI = {};
const TICK_THROTTLE_MS = 500;

// Cache for historical data and indicators - shared with imported functions
const tokenDataCache = {};

/**
 * SIMPLIFIED NEW TRADING STRATEGY:
 * 1. RSI(1m) > 70
 * 2. RSI(1m) > VWAP(1m)
 * 
 * If both conditions met, place buy order
 */

// 🔍 Get trading symbol from token
function getTradingSymbol(token) {
  const instrument = instruments.instruments.find(i => i.instrument_token == token);
  return instrument ? instrument.tradingsymbol : `TOKEN_${token}`;
}

function initTickListener() {
  if (ticker) {
    console.log("⚠️ New Ticker already initialized.");
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
    console.log("✅ New Ticker connected & subscribed.");
    
    // Start periodic exit order checking
    startExitOrderMonitoring();
  });

  ticker.on("ticks", handleTicks);
  ticker.on("noreconnect", () => console.log("❌ New Ticker won't reconnect."));
  ticker.on("disconnect", () => {
    console.log("🔌 New Ticker disconnected.");
    stopExitOrderMonitoring();
  });
}

// Exit order monitoring
let exitOrderInterval = null;

function startExitOrderMonitoring() {
  if (exitOrderInterval) {
    clearInterval(exitOrderInterval);
  }
  
  console.log("🎯 Starting exit order monitoring...");
  
  // Check for exit orders every 30 seconds
  exitOrderInterval = setInterval(async () => {
    try {
      console.log("🔄 Running periodic exit order check...");
      await checkAndPlaceExitOrders();
      console.log("✅ Periodic exit order check completed");
    } catch (error) {
      console.error(`❌ Error in exit order monitoring: ${error.message}`);
    }
  }, 30000); // 30 seconds
}

function stopExitOrderMonitoring() {
  if (exitOrderInterval) {
    clearInterval(exitOrderInterval);
    exitOrderInterval = null;
    console.log("🛑 Stopped exit order monitoring");
  }
}

// Manual function to trigger exit order check
async function triggerExitOrderCheck() {
  console.log("🔄 Manually triggering exit order check...");
  try {
    await checkAndPlaceExitOrders();
    console.log("✅ Manual exit order check completed");
  } catch (error) {
    console.error(`❌ Error in manual exit order check: ${error.message}`);
  }
}

// Function to check broadcasting status and order tracking
function checkOrderTrackingStatus() {
  console.log("📊 ORDER TRACKING STATUS:");
  console.log(`- global.broadcastToClients available: ${!!global.broadcastToClients}`);
  console.log(`- Exit order monitoring active: ${!!exitOrderInterval}`);
  console.log(`- Open orders tracked: ${Object.keys(require('../orders/orderManager').openOrdersTracker).length}`);
  console.log(`- Cooldown tracker entries: ${Object.keys(require('../orders/orderManager').cooldownTracker).length}`);
  
  if (global.broadcastToClients) {
    // Test broadcast
    global.broadcastToClients({
      type: "system_status",
      data: {
        message: "Order tracking system is operational",
        timestamp: new Date().toISOString()
      }
    });
    console.log("📡 Test broadcast sent");
  }
}

// Function to test column broadcasting
function testColumnBroadcast() {
  console.log("🧪 Testing column broadcast...");
  
  if (!global.broadcastToClients) {
    console.error("❌ global.broadcastToClients not available");
    return;
  }
  
  // Send test data with the new columns
  const testData = {
    token: "12345",
    symbol: "TEST_SYMBOL",
    rsi1m: 70.25,
    ema1m: 1234.56,
    vwap1m: 1230.45,
    ema1h: 1235.67,
    vwap1h: 1232.34,
    ltp: 1240.00,
    strategy: "NEW_HOURLY_STRATEGY",
    currentHourOpen: 1225.00,
    gapPercentage1h: 0.25,
    gapupPercentage: 1.85,
    prevDayClose: 1218.50,  // Yesterday's close
    currentDayOpen: 1241.00, // Today's open
    gapPercentage: 1.85,    // Gap percentage
    conditionsMet: 7,
    condition1: true,
    condition2: true,
    condition3: true,
    condition4: true,
    condition5: true,
    condition6: true,
    condition7: true,
    noOrderReason: "Test data",
    chartUrl: "https://kite.zerodha.com/chart/ext/tvc/NSE/TEST_SYMBOL/12345",
    timestamp: new Date().toISOString()
  };
  
  console.log("🔍 Sending test data with columns:", {
    prevDayClose: testData.prevDayClose,
    currentDayOpen: testData.currentDayOpen,
    gapPercentage: testData.gapPercentage
  });
  
  global.broadcastToClients({
    type: "new_strategy_tick_update",
    data: testData
  });
  
  console.log("📡 Test column data broadcast sent");
}

async function subscribeToTokens(tokens) {
  console.log(`🔄 NEW STRATEGY - subscribeToTokens called with ${tokens.length} tokens:`, tokens.slice(0, 5));
  
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
      await initializeTokenData(token);
      // Add small delay to avoid rate limiting
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

function unsubscribeAll() {
  if (ticker && ticker.connected() && subscribedTokens.length) {
    ticker.unsubscribe(subscribedTokens.map(Number));
    console.log(`🛑 Unsubscribed ${subscribedTokens.length} tokens`);
  }
  subscribedTokens = [];
  
  // Stop exit order monitoring when unsubscribing
  stopExitOrderMonitoring();
}

// Reuse the robust functions from tickListener.js
const initializeTokenData = initializeTokenDataFromOriginal;
const updateIndicatorsWithTick = updateIndicatorsWithTickFromOriginal;

async function handleTicks(ticks) {
  for (const tick of ticks) {
    const token = tick.instrument_token;
    const ltp = tick.last_price || 0;
    const nowTs = Date.now();

    // Throttle tick processing
    if (lastTickTime[token] && nowTs - lastTickTime[token] < TICK_THROTTLE_MS) continue;
    lastTickTime[token] = nowTs;

    // Initialize token data if not exists
    if (!tokenDataCache[token]) {
      await initializeTokenData(token);
    }

    // Update indicators with real-time tick data using robust function from tickListener.js
    const updatedData = await updateIndicatorsWithTick(token, tick);
    if (!updatedData) continue;

    const { indicators } = updatedData;
    const symbol = getTradingSymbol(token);

    // Only process if we have all required indicators
    if (indicators && indicators.rsi && indicators.ema12 && indicators.ema26 && indicators.vwap) {
      // NEW STRATEGY CONDITIONS
      const condition1 = indicators.ema12 > indicators.ema26; // EMA12 above EMA26 (bullish)
      const condition2 = indicators.rsi > 30 && indicators.rsi < 70; // RSI in normal range
      const condition3 = ltp > indicators.vwap; // Price above VWAP
      const condition4 = ltp < 5000; // Price filter

      const allConditionsMet = condition1 && condition2 && condition3 && condition4;

      console.log(`[${new Date().toISOString()}] ${symbol} - EMA12: ${indicators.ema12.toFixed(2)}, EMA26: ${indicators.ema26.toFixed(2)}, RSI: ${indicators.rsi.toFixed(2)}, VWAP: ${indicators.vwap.toFixed(2)}, LTP: ${ltp.toFixed(2)}, Signal: ${allConditionsMet ? 'BUY' : 'WAIT'}`);

      // Place order if conditions are met
      if (allConditionsMet) {
        try {
          console.log(`� BUY signal for ${symbol} at ${ltp}`);
          
          // Broadcast buy signal
          if (global.broadcastToClients) {
            global.broadcastToClients({
              type: "order_placed",
              data: {
                symbol,
                strategy: "NEW_STRATEGY",
                action: "BUY",
                price: ltp,
                reason: `EMA12(${indicators.ema12.toFixed(2)}) > EMA26(${indicators.ema26.toFixed(2)}), RSI(${indicators.rsi.toFixed(2)}) normal, Price(${ltp.toFixed(2)}) > VWAP(${indicators.vwap.toFixed(2)})`,
                timestamp: new Date().toISOString()
              }
            });
          }
        } catch (error) {
          console.error(`❌ Error processing buy signal for ${symbol}: ${error.message}`);
        }
      }

// Reuse the robust functions from tickListener.js
const initializeTokenData = initializeTokenDataFromOriginal;
const updateIndicatorsWithTick = updateIndicatorsWithTickFromOriginal;

async function handleTicks(ticks) {
  for (const tick of ticks) {
    const token = tick.instrument_token;
    const ltp = tick.last_price || 0;
    const nowTs = Date.now();

    // Throttle tick processing
    if (lastTickTime[token] && nowTs - lastTickTime[token] < TICK_THROTTLE_MS) continue;
    lastTickTime[token] = nowTs;

    // Initialize token data if not exists
    if (!tokenDataCache[token]) {
      await initializeTokenData(token);
    }

    // Update indicators with real-time tick data using robust function from tickListener.js
    // This function calculates DUAL RSI and DUAL VWAP (tick-based + candle-based)
    const updatedData = await updateIndicatorsWithTick(token, tick);
    if (!updatedData) continue;

    const symbol = getTradingSymbol(token);

    // Extract LIVE RSI and VWAP from updatedData (dual indicators)
    const rsi1m = updatedData.rsi1m || null;           // Live tick-based RSI
    const vwap1m = updatedData.vwap1m || null;         // Live tick-based VWAP
    const candleRsi1m = updatedData.candleRsi1m || null;   // Candle-completion-based RSI
    const candleVwap1m = updatedData.candleVwap1m || null; // Candle-completion-based VWAP

    // Only process if we have the required indicators
    if (rsi1m && vwap1m) {
      // SIMPLIFIED STRATEGY CONDITIONS
      const condition1 = rsi1m > 70;          // RSI(1m) > 70
      const condition2 = rsi1m > vwap1m;      // RSI(1m) > VWAP(1m)

      const allConditionsMet = condition1 && condition2;

      console.log(`[${new Date().toISOString()}] ${symbol} - RSI1m: ${rsi1m.toFixed(2)} [LIVE], VWAP1m: ${vwap1m.toFixed(2)} [LIVE], RSI_Candle: ${candleRsi1m?.toFixed(2) || 'N/A'}, VWAP_Candle: ${candleVwap1m?.toFixed(2) || 'N/A'}, LTP: ${ltp.toFixed(2)}, Signal: ${allConditionsMet ? 'BUY' : 'WAIT'}`);

      // Place order if conditions are met
      if (allConditionsMet) {
        try {
          console.log(`🚨 BUY signal for ${symbol} at ${ltp}`);
          
          // Broadcast buy signal
          if (global.broadcastToClients) {
            global.broadcastToClients({
              type: "order_placed",
              data: {
                symbol,
                strategy: "SIMPLIFIED_RSI_VWAP",
                action: "BUY",
                price: ltp,
                reason: `RSI1m(${rsi1m.toFixed(2)}) > 70 AND RSI1m > VWAP1m(${vwap1m.toFixed(2)})`,
                timestamp: new Date().toISOString()
              }
            });
          }
        } catch (error) {
          console.error(`❌ Error processing buy signal for ${symbol}: ${error.message}`);
        }
      }

      // Broadcast token data for UI with DUAL indicators
      const tokenDataForUI = {
        token,
        symbol,
        rsi1m: +rsi1m.toFixed(2),                    // Live tick-based RSI
        vwap1m: +vwap1m.toFixed(2),                  // Live tick-based VWAP
        candleRsi1m: candleRsi1m ? +candleRsi1m.toFixed(2) : null,   // Candle-based RSI
        candleVwap1m: candleVwap1m ? +candleVwap1m.toFixed(2) : null, // Candle-based VWAP
        ltp,
        strategy: "SIMPLIFIED_RSI_VWAP",
        condition1,
        condition2,
        signal: allConditionsMet ? 'BUY' : 'WAIT',
        timestamp: new Date().toISOString()
      };

      // Broadcast to UI
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: "simplified_strategy_update",
          data: tokenDataForUI
        });
      }
    } else {
      console.log(`⚠️ Missing indicators for ${symbol}: RSI1m=${rsi1m}, VWAP1m=${vwap1m}`);
    }
  }
}

async function broadcastAllSubscribedTokens() {
  console.log("🚀 NEW STRATEGY - broadcastAllSubscribedTokens() called");
  
  if (!global.broadcastToClients) {
    console.error("❌ global.broadcastToClients not available");
    return;
  }

  if (!global.filteredTokens || !global.filteredTokens.length) {
    console.log("📭 No filtered tokens from server to broadcast");
    return;
  }

  console.log(`📡 NEW STRATEGY - Broadcasting data for ${global.filteredTokens.length} server-filtered tokens...`);

  for (const filteredToken of global.filteredTokens) {
    try {
      const token = filteredToken.token;
      
      if (!tokenDataCache[token]) {
        await initializeTokenData(token);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const cachedData = tokenDataCache[token];
      if (!cachedData) {
        console.warn(`⚠️ Could not initialize data for token ${token}`);
        continue;
      }

      const tokenData = {
        ...filteredToken,
        strategy: "NEW_STRATEGY",
        ema12: cachedData.indicators?.ema12 ? parseFloat(cachedData.indicators.ema12.toFixed(2)) : null,
        ema26: cachedData.indicators?.ema26 ? parseFloat(cachedData.indicators.ema26.toFixed(2)) : null,
        rsi: cachedData.indicators?.rsi ? parseFloat(cachedData.indicators.rsi.toFixed(2)) : null,
        vwap: cachedData.indicators?.vwap ? parseFloat(cachedData.indicators.vwap.toFixed(2)) : null,
        ltp: cachedData.currentTick?.price || filteredToken.ltp || 0
      };

      global.broadcastToClients({
        type: "new_strategy_filtered_token_update",
        data: tokenData
      });

      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      console.error(`❌ Error broadcasting token ${filteredToken.token}: ${err.message}`);
    }
  }

  console.log("✅ NEW STRATEGY - Finished broadcasting all server-filtered tokens");
}

module.exports = {
  initTickListener,
  subscribeToTokens,
  unsubscribeAll,
  broadcastAllSubscribedTokens,
  initializeTokenData,
  updateIndicatorsWithTick,
  startExitOrderMonitoring,
  stopExitOrderMonitoring,
  triggerExitOrderCheck,
  checkOrderTrackingStatus,
  testColumnBroadcast
};

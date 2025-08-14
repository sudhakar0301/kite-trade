const { KiteTicker } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
const { placeBuyOrder, placeSellOrder } = require("../orders/orderManager");
// COMMENTED OUT - Indicator calculation imports (for future use)
// const { calculateRSIArray, calculateEMA, calculateMACD } = require("../strategy/indicators");
const { getHistoricalData } = require("../strategy/scanner");
const { from1, from15, to15, fromToday, to1, from35 } = require("../utils/fromAndToDate");
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
let hourlyUpdateTimer = null; // Timer for periodic hourly indicators updates
let historicalDataTimer = null; // Timer for periodic historical data fallback
let vwapVwmaTimer = null; // Timer for pure historical VWAP/VWMA calculation
let historicalCalculationTimer = null; // Timer for minute-based historical calculations

// Cache for historical data results (updated every minute)
const historicalDataCache = new Map();

// Global variables for pending order placement
global.pendingOrderFilename = null;
global.pendingOrderTokens = null;

// Simple order cooldown to prevent multiple orders for same token
const lastOrderTime = {};
const ORDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Track last tick time for each token to detect stale data
const lastTickTime = {};
const HISTORICAL_DATA_INTERVAL = 30 * 1000; // 30 seconds - send historical data if no live ticks
const HISTORICAL_UPDATE_INTERVAL = 60 * 1000; // 1 minute - how often to check for stale tokens

// Global order processing lock to ensure orders are placed one at a time
let isProcessingOrder = false;

// Central function to evaluate trading conditions and place orders using broadcasted values
async function evaluateAndPlaceOrders(token, symbol, broadcastData) {
  // Skip if already processing an order
  if (isProcessingOrder) {
    return;
  }

  // Check for order cooldown
  const now = Date.now();
  if (lastOrderTime[token] && (now - lastOrderTime[token]) < ORDER_COOLDOWN_MS) {
    return;
  }

  try {
    // Extract data from broadcast (this is the SAME data sent to UI)
    const {
      ltp,
      rsi1m, ema9_1m, ema21_1m, vwap_1m, atr_percent_1m,
      vwma10_1m, vwma20_1m, adx_1m, plus_di_1m, minus_di_1m,
      macd_1m, macd_signal_1m, macd_histogram_1m,
      rsiArray
    } = broadcastData;

    // Validate that we have all required historical data before proceeding
    if (!ltp || !rsi1m || !ema9_1m || !ema21_1m || !vwap_1m || !atr_percent_1m || 
        !vwma10_1m || !vwma20_1m || !adx_1m || !plus_di_1m || !minus_di_1m ||
        !macd_1m || !macd_signal_1m || !macd_histogram_1m) {
      console.log(`⚠️ ${symbol}: Skipping trading - missing historical data in broadcast`);
      console.log(`   Missing: LTP=${!ltp}, RSI1m=${!rsi1m}, EMA9=${!ema9_1m}, EMA21=${!ema21_1m}, VWAP=${!vwap_1m}, ATR%=${!atr_percent_1m}`);
      console.log(`   Missing: VWMA10=${!vwma10_1m}, VWMA20=${!vwma20_1m}, ADX=${!adx_1m}, +DI=${!plus_di_1m}, -DI=${!minus_di_1m}`);
      console.log(`   Missing: MACD=${!macd_1m}, Signal=${!macd_signal_1m}, Histogram=${!macd_histogram_1m}`);
      return;
    }

    // Additional validation - ensure values are valid numbers (not NaN, null, or undefined)
    const requiredValues = {
      ltp, rsi1m, ema9_1m, ema21_1m, vwap_1m, atr_percent_1m,
      vwma10_1m, vwma20_1m, adx_1m, plus_di_1m, minus_di_1m,
      macd_1m, macd_signal_1m, macd_histogram_1m
    };
    
    const invalidValues = Object.entries(requiredValues).filter(([key, value]) => 
      typeof value !== 'number' || isNaN(value)
    );
    
    if (invalidValues.length > 0) {
      console.log(`⚠️ ${symbol}: Skipping trading - invalid number values in broadcast:`);
      invalidValues.forEach(([key, value]) => {
        console.log(`   ${key}: ${value} (type: ${typeof value})`);
      });
      return;
    }

    // Validate RSI array has sufficient history
    if (!rsiArray || rsiArray.length < 20) {
      console.log(`⚠️ ${symbol}: Skipping trading - insufficient RSI history (${rsiArray?.length || 0} values)`);
     // return;
    }

    // Validate that we have fresh historical data for critical indicators
    const freshHistoricalData = global.historicalIndicators?.get(token);
    if (!freshHistoricalData) {
      console.log(`⚠️ ${symbol}: Skipping trading - no fresh historical data available (VWAP/ADX/MACD calculations)`);
      return;
    }

    // Ensure fresh historical data contains the key indicators we rely on
    const missingFreshData = [];
    if (!freshHistoricalData.vwap_1m) missingFreshData.push('VWAP');
    if (!freshHistoricalData.adx_1m) missingFreshData.push('ADX');
    if (!freshHistoricalData.macd_1m) missingFreshData.push('MACD');
    if (!freshHistoricalData.plus_di_1m) missingFreshData.push('+DI');
    if (!freshHistoricalData.minus_di_1m) missingFreshData.push('-DI');
    
    if (missingFreshData.length > 0) {
      console.log(`⚠️ ${symbol}: Skipping trading - missing fresh historical indicators: ${missingFreshData.join(', ')}`);
      return;
    }

    console.log(`✅ ${symbol}: All historical data validated - proceeding with trading evaluation`);
    console.log(`\n🎯 ${symbol}: Evaluating trading conditions using broadcasted values`);
    console.log(`   LTP: ${ltp.toFixed(2)}, RSI1m: ${rsi1m.toFixed(2)}, VWAP1m: ${vwap_1m.toFixed(2)}`);
    console.log(`   EMA9: ${ema9_1m.toFixed(2)}, EMA21: ${ema21_1m.toFixed(2)}, ATR%: ${atr_percent_1m.toFixed(3)}%`);
    console.log(`   ADX: ${adx_1m.toFixed(2)}, +DI: ${plus_di_1m.toFixed(2)}, -DI: ${minus_di_1m.toFixed(2)}`);
    console.log(`   MACD: ${macd_1m.toFixed(4)}, Signal: ${macd_signal_1m.toFixed(4)}, Hist: ${macd_histogram_1m.toFixed(4)}`);
    console.log(`   Fresh Data Source: VWAP=${freshHistoricalData.vwap_1m ? 'Historical' : 'Cache'}, ADX=${freshHistoricalData.adx_1m ? 'Historical' : 'Cache'}, MACD=${freshHistoricalData.macd_1m ? 'Historical' : 'Cache'}`);
    
    console.log(`\n📊 ${symbol}: RSI History Analysis (last 11 values): ${rsiArray.slice(-11).map(r => r.toFixed(1)).join(', ')}`);

    // ===========================
    // BUY CONDITIONS (using broadcasted values)
    // ===========================
    const buyCondition1 = rsi1m > 68;
    const buyCondition2 = rsi1m < 80;
    
    // Check that none of the last 10 RSI values were above 68
    const buyCondition3 = rsiArray.slice(-11, -1).every(rsi => rsi <= 68);
    
    const buyCondition4 = ema9_1m > vwap_1m;
    const buyCondition5 = ema21_1m > vwap_1m;
    const buyCondition6 = ema9_1m > ema21_1m;
    const buyCondition7 = atr_percent_1m > 0.2;
    const buyCondition8 = adx_1m > 25;
    const buyCondition9 = plus_di_1m > minus_di_1m;
    const buyCondition10 = macd_1m > macd_signal_1m;
    const buyCondition11 = macd_histogram_1m > 0;

    const allBuyConditionsMet = buyCondition1 && buyCondition2 && buyCondition3 && 
                               buyCondition4 && buyCondition5 && buyCondition6 && 
                               buyCondition7 && buyCondition8 && buyCondition9 && 
                               buyCondition10 && buyCondition11;

    // ===========================
    // SELL CONDITIONS (using broadcasted values)
    // ===========================
    const sellCondition1 = rsi1m < 35;
    const sellCondition2 = rsi1m > 20;
    
    // Check that none of the last 10 RSI values were below 32
    const sellCondition3 = rsiArray.slice(-11, -1).every(rsi => rsi >= 32);
    
    const sellCondition4 = ema9_1m < vwap_1m;
    const sellCondition5 = ema21_1m < vwap_1m;
    const sellCondition6 = ema9_1m < ema21_1m;
    const sellCondition7 = atr_percent_1m < 0.2;
    const sellCondition8 = adx_1m > 25;
    const sellCondition9 = minus_di_1m > plus_di_1m;
    const sellCondition10 = macd_1m < macd_signal_1m;
    const sellCondition11 = macd_histogram_1m < 0;

    const allSellConditionsMet = sellCondition1 && sellCondition2 && sellCondition3 && 
                                sellCondition4 && sellCondition5 && sellCondition6 && 
                                sellCondition7 && sellCondition8 && sellCondition9 && 
                                sellCondition10 && sellCondition11;

    // Log condition analysis
    console.log(`   📈 BUY Analysis: RSI(${buyCondition1}), RSI<80(${buyCondition2}), NoRecent68+(${buyCondition3}), EMA9>VWAP(${buyCondition4}), EMA21>VWAP(${buyCondition5}), EMA9>EMA21(${buyCondition6}), ATR>0.2(${buyCondition7}), ADX>25(${buyCondition8}), +DI>-DI(${buyCondition9}), MACD>Signal(${buyCondition10}), Hist>0(${buyCondition11})`);
    console.log(`   📉 SELL Analysis: RSI<35(${sellCondition1}), RSI>20(${sellCondition2}), NoRecent32-(${sellCondition3}), EMA9<VWAP(${sellCondition4}), EMA21<VWAP(${sellCondition5}), EMA9<EMA21(${sellCondition6}), ATR<0.2(${sellCondition7}), ADX>25(${sellCondition8}), -DI>+DI(${sellCondition9}), MACD<Signal(${sellCondition10}), Hist<0(${sellCondition11})`);

    // ===========================
    // SINGLE POINT OF ORDER PLACEMENT
    // ===========================
    if (allBuyConditionsMet || true) {
      console.log(`🟢 ${symbol}: BUY signal detected - All conditions met with broadcasted values`);
      
      isProcessingOrder = true;
      try {
        const buyResult = await placeBuyOrder({
          symbol: symbol,
          token: token,
          price: ltp,
          reason: `BUY: All conditions met using broadcasted data`
        });
        
        if (buyResult) {
          lastOrderTime[token] = now;
          console.log(`✅ ${symbol}: Buy order placed successfully: ${buyResult.order_id}`);
        } else {
          console.log(`❌ ${symbol}: Buy order failed`);
        }
      } catch (error) {
        console.error(`❌ ${symbol}: Error placing buy order: ${error.message}`);
      } finally {
        isProcessingOrder = false;
      }
    } else if (allSellConditionsMet) {
      console.log(`🔴 ${symbol}: SELL signal detected - All conditions met with broadcasted values`);
      
      isProcessingOrder = true;
      try {
        const sellResult = await placeSellOrder(token, symbol, ltp);
        
        if (sellResult) {
          lastOrderTime[token] = now;
          console.log(`✅ ${symbol}: Sell order placed successfully: ${sellResult.order_id}`);
        } else {
          console.log(`❌ ${symbol}: Sell order failed`);
        }
      } catch (error) {
        console.error(`❌ ${symbol}: Error placing sell order: ${error.message}`);
      } finally {
        isProcessingOrder = false;
      }
    } else {
      console.log(`⏸️ ${symbol}: No trading signals - waiting for conditions`);
    }

  } catch (error) {
    console.error(`❌ ${symbol}: Error in trading evaluation: ${error.message}`);
  }
}

// Import shared candle cache to prevent circular dependencies
const { candleCache, isNewServerSession, markServerInitialized, isCacheReadyForTrading } = require("../cache/sharedCache");

// Cache for last valid values to prevent columns from showing N/A during updates
const lastValidValues = new Map();

// Cache for fresh historical calculations (updated every minute)
const freshHistoricalResults = new Map();
const FRESH_CACHE_DURATION = 60 * 1000; // 1 minute

// Track when each token's fresh data was last calculated
const freshDataTimestamps = new Map();

// Candle cache system for real-time indicator calculation
const CACHE_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds
const MAX_CACHE_CANDLES = 500; // Increased to 500 for better indicator accuracy

const MIN_CANDLES_REQUIRED = 200; // Minimum candles needed for calculation (especially for ADX)

// Helper function to get cached fresh historical data (calls pure API only once per minute)
// Simple getter for timer-calculated historical data (no calculations here)
function getTimerHistoricalData(token) {
  return global.historicalIndicators?.get(token) || null;
}

// Helper function to get value with fallback to last valid value (prevents N/A during updates)
function getValueWithFallback(token, fieldName, newValue, liveValue = null) {
  const tokenKey = `${token}_${fieldName}`;
  
  // If we have a valid new value, use it and cache it
  if (newValue !== null && newValue !== undefined && !isNaN(newValue)) {
    lastValidValues.set(tokenKey, newValue);
    return newValue;
  }
  
  // If we have a valid live value, use it and cache it
  if (liveValue !== null && liveValue !== undefined && !isNaN(liveValue)) {
    lastValidValues.set(tokenKey, liveValue);
    return liveValue;
  }
  
  // Otherwise, return last valid value (prevents N/A)
  const lastValid = lastValidValues.get(tokenKey);
  if (lastValid !== undefined) {
    return lastValid;
  }
  
  // Only return null if we've never had a valid value
  return null;
}

// Function to get trading condition values for UI display
async function getTradingConditionValues(token) {
  try {
    // COMMENTED OUT - Live indicator calculation call (for future use)
    // const indicators = await calculateLiveIndicators(token);
    const indicators = null; // Disabled for optimization
    
    if (!indicators || !indicators.rsi1m || !indicators.ema9_1m || !indicators.ema21_1m || 
        !indicators.rsi1h || !indicators.rsi15m) {
      return null;
    }
    
    // Buy conditions: 1H RSI > 60, 15M RSI > 60, EMA9 > EMA21 on 1M, RSI 1M > 65
    const rsi1hBuy = indicators.rsi1h > 60;
    const rsi15mBuy = indicators.rsi15m > 60;
    const emaCrossoverBuy = indicators.ema9_1m > indicators.ema21_1m;
    const rsi1mBuy = indicators.rsi1m > 65;
    const buyCondition = rsi1hBuy && rsi15mBuy && emaCrossoverBuy && rsi1mBuy;
    
    // Sell conditions: 1H RSI < 40, 15M RSI < 35, EMA9 < EMA21 on 1M, RSI 1M < 40
    const rsi1hSell = indicators.rsi1h < 40;
    const rsi15mSell = indicators.rsi15m < 35;
    const emaCrossoverSell = indicators.ema9_1m < indicators.ema21_1m;
    const rsi1mSell = indicators.rsi1m < 40;
    const sellCondition = rsi1hSell && rsi15mSell && emaCrossoverSell && rsi1mSell;
    
    // Use historical data from timer (no calculations in tick processing)
    const freshVWAPVWMA = global.historicalIndicators?.get(token) || null;
    console.log(`🔍 [UI-DEBUG] ${getTradingSymbol(token)}: Using timer-calculated historical data:`, {
      vwap: freshVWAPVWMA?.vwap_1m,
      adx: freshVWAPVWMA?.adx_1m,
      macd: freshVWAPVWMA?.macd_1m,
      fromTimer: !!freshVWAPVWMA
    });
    
    return {
      // Match the expected format from TradingConditionsDisplay component
      fresh: {
        // Fresh historical indicators (VWAP, VWMA, ADX, MACD)
        vwap_1m: freshVWAPVWMA?.vwap_1m || null,
        vwma10_1m: freshVWAPVWMA?.vwma10_1m || null,
        vwma20_1m: freshVWAPVWMA?.vwma20_1m || null,
        adx_1m: freshVWAPVWMA?.adx_1m || null,
        plus_di_1m: freshVWAPVWMA?.plus_di_1m || null,
        minus_di_1m: freshVWAPVWMA?.minus_di_1m || null,
        macd_1m: freshVWAPVWMA?.macd_1m || null,
        macd_signal_1m: freshVWAPVWMA?.macd_signal_1m || null,
        macd_histogram_1m: freshVWAPVWMA?.macd_histogram_1m || null
      },
      live: {
        // Live indicators used in trading conditions
        rsi1h: indicators.rsi1h,
        rsi15m: indicators.rsi15m,
        rsi1m: indicators.rsi1m,
        ema9_1m: indicators.ema9_1m,
        ema21_1m: indicators.ema21_1m,
        obv_current: indicators.obv_current,
        obv_prev: indicators.obv_prev,
        atr_percent_1m: indicators.atr_percent_1m,
        ltp: indicators.ltp
      },
      // Trading condition evaluations
      tradingConditions: {
        buy: {
          rsi1hBuy: rsi1hBuy,
          rsi15mBuy: rsi15mBuy,
          emaCrossoverBuy: emaCrossoverBuy,
          rsi1mBuy: rsi1mBuy,
          overall: buyCondition
        },
        sell: {
          rsi1hSell: rsi1hSell,
          rsi15mSell: rsi15mSell,
          emaCrossoverSell: emaCrossoverSell,
          rsi1mSell: rsi1mSell,
          overall: sellCondition
        }
      }
    };
  } catch (error) {
    console.error(`❌ Error getting trading conditions for token ${token}:`, error.message);
    return null;
  }
}

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

// Calculate Volume Weighted Moving Average (VWMA)
// VWMA gives more weight to prices with higher volume, making it more responsive to significant price movements
function calculateVWMA(candles, period = 20) {
  if (!candles || candles.length < period) {
    return null;
  }
  
  const recentCandles = candles.slice(-period);
  let weightedSum = 0;
  let volumeSum = 0;
  
  for (const candle of recentCandles) {
    const price = candle.close || 0;
    const volume = candle.volume || 0;
    weightedSum += price * volume;
    volumeSum += volume;
  }
  
  return volumeSum > 0 ? weightedSum / volumeSum : null;
}

// Calculate VWMA Array - returns array of VWMA values for historical tracking
function calculateVWMAArray(candles, period = 20) {
  if (!candles || candles.length < period) {
    return [];
  }
  
  const vwmaArray = [];
  
  // Calculate VWMA for each possible window
  for (let i = period - 1; i < candles.length; i++) {
    const windowCandles = candles.slice(i - period + 1, i + 1);
    let weightedSum = 0;
    let volumeSum = 0;
    
    for (const candle of windowCandles) {
      const price = candle.close || 0;
      const volume = candle.volume || 0;
      weightedSum += price * volume;
      volumeSum += volume;
    }
    
    const vwma = volumeSum > 0 ? weightedSum / volumeSum : null;
    if (vwma !== null) {
      vwmaArray.push(vwma);
    }
  }
  
  return vwmaArray;
}

// Calculate VWAP (Volume Weighted Average Price) from today's start
// VWAP = Sum(Typical Price × Volume) / Sum(Volume) from market open today
function calculateVWAP(allCandles) {
  if (!allCandles || allCandles.length === 0) {
    return null;
  }
  
  // Filter for today's candles only
  const today = new Date();
  today.setDate(today.getDate() - 2);
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  const todaysCandles = allCandles.filter(candle => {
    let candleTime;
    if (candle.timestamp) {
      candleTime = candle.timestamp;
    } else if (candle.date) {
      candleTime = new Date(candle.date).getTime();
    } else {
      return false;
    }
    return candleTime >= todayStart;
  });
  
  if (todaysCandles.length === 0) {
    return null;
  }
  
  let totalPriceVolume = 0;
  let totalVolume = 0;
  
  for (const candle of todaysCandles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 0;
    totalPriceVolume += typicalPrice * volume;
    totalVolume += volume;
  }
  
  return totalVolume > 0 ? totalPriceVolume / totalVolume : null;
}

// Calculate VWAP Array - returns array of VWAP values calculated progressively through the day
function calculateVWAPArray(allCandles) {
  if (!allCandles || allCandles.length === 0) {
    return [];
  }
  
  // Filter for today's candles only
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  const todaysCandles = allCandles.filter(candle => {
    let candleTime;
    if (candle.timestamp) {
      candleTime = candle.timestamp;
    } else if (candle.date) {
      candleTime = new Date(candle.date).getTime();
    } else {
      return false;
    }
    return candleTime >= todayStart;
  });
  
  if (todaysCandles.length === 0) {
    return [];
  }
  
  const vwapArray = [];
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  
  // Calculate VWAP progressively for each minute from market start (more efficient)
  for (let i = 0; i < todaysCandles.length; i++) {
    const candle = todaysCandles[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 0;
    
    // Add to cumulative totals
    cumulativePriceVolume += typicalPrice * volume;
    cumulativeVolume += volume;
    
    // Calculate VWAP from market start to current minute
    const vwap = cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null;
    if (vwap !== null) {
      vwapArray.push(vwap);
    }
  }
  
  return vwapArray;
}

// Calculate ADX (Average Directional Index) with +DI and -DI arrays - Improved version
function calculateADX(candles, period = 14) {
  if (!candles || candles.length <= period) {
    console.log(`⚠️ ADX: Insufficient candles: ${candles?.length || 0} <= ${period}`);
    return [];
  }

  try {
    const plusDM = [];
    const minusDM = [];
    const TRs = [];

    for (let i = 1; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];

      if (!curr || !prev || typeof curr.high !== 'number' || typeof curr.low !== 'number' || 
          typeof curr.close !== 'number' || typeof prev.close !== 'number') {
        console.log(`⚠️ ADX: Invalid candle data at index ${i}`);
        continue;
      }

      const upMove = curr.high - prev.high;
      const downMove = prev.low - curr.low;

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      TRs.push(tr);
    }

    if (TRs.length < period) {
      console.log(`⚠️ ADX: Not enough valid TRs: ${TRs.length} < ${period}`);
      return [];
    }

    // Smooth functions: Wilder's smoothing (EMA-like)
    const smooth = (arr, period) => {
      const result = [];
      if (arr.length < period) return result;
      
      let sum = arr.slice(0, period).reduce((a, b) => a + b, 0);
      result[period - 1] = sum;

      for (let i = period; i < arr.length; i++) {
        sum = result[i - 1] - (result[i - 1] / period) + arr[i];
        result[i] = sum;
      }

      return result;
    };

    const smoothedTR = smooth(TRs, period);
    const smoothedPlusDM = smooth(plusDM, period);
    const smoothedMinusDM = smooth(minusDM, period);

    const plusDI = smoothedPlusDM.map((dm, i) =>
      i >= period - 1 && smoothedTR[i] !== 0 ? (100 * dm) / smoothedTR[i] : 0
    );
    const minusDI = smoothedMinusDM.map((dm, i) =>
      i >= period - 1 && smoothedTR[i] !== 0 ? (100 * dm) / smoothedTR[i] : 0
    );

    const DX = plusDI.map((pdi, i) => {
      const mdi = minusDI[i];
      const sum = pdi + mdi;
      const diff = Math.abs(pdi - mdi);
      return sum === 0 ? 0 : (100 * diff) / sum;
    });

    const ADX = [];
    if (DX.length >= 2 * period - 1) {
      let adxStart = DX.slice(period - 1, period - 1 + period).reduce((a, b) => a + b, 0) / period;
      ADX[2 * period - 2] = adxStart;

      for (let i = 2 * period - 1; i < DX.length; i++) {
        adxStart = ((ADX[i - 1] * (period - 1)) + DX[i]) / period;
        ADX[i] = adxStart;
      }
    }

    // Merge results
    const result = candles.map((c, i) => ({
      ...c,
      plusDI: plusDI[i] || null,
      minusDI: minusDI[i] || null,
      dx: DX[i] || null,
      adx: ADX[i] || null
    }));

    const lastResult = result[result.length - 1];
    console.log(`✅ ADX calculation completed: ${result.length} candles processed`);
    console.log(`✅ Last result sample: ADX=${lastResult?.adx?.toFixed(2)}, +DI=${lastResult?.plusDI?.toFixed(2)}, -DI=${lastResult?.minusDI?.toFixed(2)}`);
    
    return result;
  } catch (error) {
    console.error(`❌ Error in calculateADX: ${error.message}`);
    return [];
  }
}

// Calculate Simple Moving Average
function calculateSMA(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

// Calculate ATR (Average True Range) as percentage
function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) {
    return { atr: null, atrPercent: null };
  }

  const trueRanges = [];

  // Calculate True Range for each candle
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    const tr = Math.max(tr1, tr2, tr3);
    
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    return { atr: null, atrPercent: null };
  }

  // Calculate ATR (simple average of true ranges)
  const atr = calculateSMA(trueRanges.slice(-period));
  
  // Convert to percentage of current price
  const currentPrice = candles[candles.length - 1].close;
  const atrPercent = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  return { atr: atr, atrPercent: atrPercent };
}

// Calculate ATR array for last 5 values
function calculateATRArray(candles, period = 14) {
  if (!candles || candles.length < period + 5) {
    return [];
  }

  const atrArray = [];
  
  // Calculate ATR for sliding windows
  for (let i = period; i < candles.length; i++) {
    const windowCandles = candles.slice(i - period, i + 1);
    
    const trueRanges = [];
    for (let j = 1; j < windowCandles.length; j++) {
      const current = windowCandles[j];
      const previous = windowCandles[j - 1];
      
      const tr1 = current.high - current.low;
      const tr2 = Math.abs(current.high - previous.close);
      const tr3 = Math.abs(current.low - previous.close);
      const tr = Math.max(tr1, tr2, tr3);
      trueRanges.push(tr);
    }
    
    if (trueRanges.length > 0) {
      const atr = calculateSMA(trueRanges);
      atrArray.push(atr);
    }
  }

  // Return last 5 values
  return atrArray.slice(-5);
}

// Initialize cache for a token with historical data
async function initializeCacheForToken(token, symbol) {
  try {
    if (candleCache.has(token)) {
      return true; // Already initialized
    }

    //console.log(`🔄 Minimal cache initialization for ${symbol} (${token}) - NO API CALLS`);
    
    // OPTIMIZED: Initialize cache with minimal structure for tick processing only
    // Historical data will be fetched in batch when needed for candle body analysis
    candleCache.set(token, {
      historical: [], // Empty initially - will be populated by batch API calls when needed
      current: null,
      lastUpdate: Date.now(),
      symbol: symbol
    });

   // console.log(`✅ Minimal cache initialized for ${symbol} - ready for tick processing`);
    return true;
  } catch (error) {
    console.error(`❌ Error initializing cache for ${symbol}: ${error.message}`);
    return false;
  }
}

// Calculate VWAP for minute-based processing only (not on every tick)
function calculateMinuteVWAP(allCandles) {
  try {
    if (!allCandles || allCandles.length === 0) {
      return { vwap: null, vwapArray: [] };
    }

    const vwap = calculateVWAP(allCandles);
    const vwapArray = calculateVWAPArray(allCandles);
    
    return {
      vwap: vwap,
      vwapArray: vwapArray?.slice(-5) || [] // Return last 5 values for UI
    };
  } catch (error) {
    console.error(`❌ Error calculating minute VWAP: ${error.message}`);
    return { vwap: null, vwapArray: [] };
  }
}

// Calculate VWMA for minute-based processing only (pure historical)
function calculateMinuteVWMA(allCandles) {
  try {
    if (!allCandles || allCandles.length === 0) {
      return { vwma10: null, vwma20: null, vwma20Array: [] };
    }

    const vwma10 = calculateVWMA(allCandles, 10);
    const vwma20 = calculateVWMA(allCandles, 20);
    const vwma20Array = calculateVWMAArray(allCandles, 20);
    
    return {
      vwma10: vwma10,
      vwma20: vwma20,
      vwma20Array: vwma20Array?.slice(-5) || [] // Return last 5 values for UI
    };
  } catch (error) {
    console.error(`❌ Error calculating minute VWMA: ${error.message}`);
    return { vwma10: null, vwma20: null, vwma20Array: [] };
  }
}

// UNIFIED INDICATOR CALCULATION FUNCTION
// Function to get the exact trading condition values being used for buy/sell decisions
// This ensures UI shows the same values that trading conditions evaluate
function getTradingConditionValues(liveIndicators, freshVWAPVWMA) {
  return {
    // FRESH HISTORICAL INDICATORS (used for VWAP/VWMA/ADX/MACD based conditions)
    fresh: {
      vwap_1m: freshVWAPVWMA?.vwap_1m || null,
      vwma10_1m: freshVWAPVWMA?.vwma10_1m || null,
      vwma20_1m: freshVWAPVWMA?.vwma20_1m || null,
      adx_1m: freshVWAPVWMA?.adx_1m || null,
      plus_di_1m: freshVWAPVWMA?.plus_di_1m || null,
      minus_di_1m: freshVWAPVWMA?.minus_di_1m || null,
      macd_1m: freshVWAPVWMA?.macd_1m || null,
      macd_signal_1m: freshVWAPVWMA?.macd_signal_1m || null,
      macd_histogram_1m: freshVWAPVWMA?.macd_histogram_1m || null,
    },
    // LIVE INDICATORS (used for RSI/EMA/OBV based conditions)
    live: {
      rsi1h: liveIndicators?.rsi1h || null,
      rsi15m: liveIndicators?.rsi15m || null,  
      rsi1m: liveIndicators?.rsi1m || null,
      ema9_1m: liveIndicators?.ema9_1m || null,
      ema21_1m: liveIndicators?.ema21_1m || null,
      obv_current: liveIndicators?.obv_current || null,
      obv_prev: liveIndicators?.obv_prev || null,
      atr_percent_1m: liveIndicators?.atr_percent_1m || null,
      ltp: liveIndicators?.ltp || null
    }
  };
}

// COMMENTED OUT - This function will be used by BOTH UI and trading conditions to ensure consistency (for future use)
/*
async function calculateUnifiedIndicators(token) {
  try {
    const symbol = getTradingSymbol(token);
    console.log(`🔄 ${symbol}: Calculating unified indicators from fresh historical data`);
    
    // Get today's historical candles fresh from API
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString().split('T')[0];
    const now = new Date().toISOString().split('T')[0];
    
    const historicalCandles = await getHistoricalData(token, "minute", todayStart, now);
    
    if (!historicalCandles || historicalCandles.length === 0) {
      console.log(`⚠️ ${symbol}: No historical candles available for unified indicators`);
      return null;
    }
    
    console.log(`📊 ${symbol}: Got ${historicalCandles.length} historical candles for unified indicators`);
    
    // Extract OHLCV data
    const closes = historicalCandles.map(c => c.close);
    const highs = historicalCandles.map(c => c.high);
    const lows = historicalCandles.map(c => c.low);
    const volumes = historicalCandles.map(c => c.volume || 0);
    
    // Initialize all indicators as null
    let indicators = {
      // Basic price data
      ltp: closes[closes.length - 1],
      
      // RSI indicators
      rsi1m: null,
      rsiArray: [],
      
      // EMA indicators
      ema9_1m: null,
      ema21_1m: null,
      
      // VWAP/VWMA indicators
      vwap_1m: null,
      vwapArray: [],
      vwma10_1m: null,
      vwma20_1m: null,
      vwma20Array: [],
      
      // ADX indicators
      adx_1m: null,
      plus_di_1m: null,
      minus_di_1m: null,
      plusDIArray: [],
      minusDIArray: [],
      
      // MACD indicators
      macd_1m: null,
      macd_signal_1m: null,
      macd_histogram_1m: null,
      macdArray: [],
      signalArray: [],
      histogramArray: [],
      
      // ATR indicators
      atr_1m: null,
      atr_percent_1m: null,
      
      // Meta data
      candleCount: historicalCandles.length,
      todayCandleCount: historicalCandles.length,
      symbol: symbol,
      timestamp: new Date().toISOString()
    };
    
    // Calculate RSI (need at least 15 candles)
    if (closes.length >= 15) {
      const rsiArray = calculateRSIArray(closes, 14);
      if (rsiArray && rsiArray.length > 0) {
        indicators.rsi1m = rsiArray[rsiArray.length - 1];
        indicators.rsiArray = rsiArray.slice(-5); // Last 5 values
      }
    }
    
    // Calculate EMA (need at least 21 candles for EMA21)
    if (closes.length >= 21) {
      indicators.ema9_1m = calculateEMA(closes, 9);
      indicators.ema21_1m = calculateEMA(closes, 21);
    }
    
    // Calculate VWAP/VWMA
    if (historicalCandles.length >= 2) {
      indicators.vwap_1m = calculateVWAP(historicalCandles);
      indicators.vwapArray = (calculateVWAPArray(historicalCandles) || []).slice(-5);
      indicators.vwma10_1m = calculateVWMA(historicalCandles, 10);
      indicators.vwma20_1m = calculateVWMA(historicalCandles, 20);
      indicators.vwma20Array = (calculateVWMAArray(historicalCandles, 20) || []).slice(-5);
    }
    
    // Calculate ADX (need at least 200 candles for accuracy)
    if (historicalCandles.length >= 200) {
      console.log(`🔍 ${symbol}: Calculating ADX with ${historicalCandles.length} historical candles`);
      const adxResults = calculateADX(historicalCandles, 14);
      
      if (adxResults && adxResults.length > 0) {
        const validResults = adxResults.filter(r => r.adx !== null && r.plusDI !== null && r.minusDI !== null);
        
        if (validResults.length > 0) {
          const latest = validResults[validResults.length - 1];
          indicators.adx_1m = latest.adx;
          indicators.plus_di_1m = latest.plusDI;
          indicators.minus_di_1m = latest.minusDI;
          indicators.plusDIArray = validResults.slice(-5).map(r => r.plusDI);
          indicators.minusDIArray = validResults.slice(-5).map(r => r.minusDI);
        }
      }
    }
    
    // Calculate MACD (need at least 50 candles)
    if (closes.length >= 50) {
      console.log(`🔍 ${symbol}: Calculating MACD with ${closes.length} candles`);
      const macdResults = calculateMACD(closes, 12, 26, 9);
      
      if (macdResults && macdResults.length > 0) {
        const validResults = macdResults.filter(r => r.macd !== null && r.signal !== null && r.histogram !== null);
        
        if (validResults.length > 0) {
          const latest = validResults[validResults.length - 1];
          indicators.macd_1m = latest.macd;
          indicators.macd_signal_1m = latest.signal;
          indicators.macd_histogram_1m = latest.histogram;
          indicators.macdArray = validResults.slice(-5).map(r => r.macd);
          indicators.signalArray = validResults.slice(-5).map(r => r.signal);
          indicators.histogramArray = validResults.slice(-5).map(r => r.histogram);
        }
      }
    }
    
    // Calculate ATR (need at least 14 candles)
    if (historicalCandles.length >= 14) {
      const atr = calculateATR(highs, lows, closes, 14);
      if (atr && indicators.ltp) {
        indicators.atr_1m = atr;
        indicators.atr_percent_1m = (atr / indicators.ltp) * 100;
      }
    }
    
    console.log(`✅ ${symbol}: Unified indicators calculated - RSI=${indicators.rsi1m?.toFixed(2)}, MACD=${indicators.macd_1m?.toFixed(4)}, ADX=${indicators.adx_1m?.toFixed(2)}`);
    
    return indicators;
    
  } catch (error) {
    console.error(`❌ Error calculating unified indicators for token ${token}: ${error.message}`);
    return null;
  }
}
*/

// COMMENTED OUT - Function for fresh VWAP/VWMA/ADX/MACD calculations from historical data (for future use)
/*
// Calculate fresh VWAP, VWMA, ADX, and MACD from historical data each minute
async function calculateFreshVWAPVWMAADXMACD(token) {
  try {
    console.log(`� ${getTradingSymbol(token)}: Calculating fresh VWAP/VWMA from historical data`);
    
    // Get today's historical candles fresh from API
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString().split('T')[0];
    const now = new Date().toISOString().split('T')[0];
    
    const historicalCandles = await getHistoricalData(token, "minute", from15, to15);
    
    if (!historicalCandles || historicalCandles.length === 0) {
      console.log(`⚠️ ${getTradingSymbol(token)}: No historical candles available for VWAP/VWMA calculation`);
      return null;
    }
    
    console.log(`📊 ${getTradingSymbol(token)}: Got ${historicalCandles.length} historical candles for VWAP/VWMA`);
    
    // Calculate fresh VWAP from today's candles
    const vwap_1m = calculateVWAP(historicalCandles);
    const vwapArray = calculateVWAPArray(historicalCandles);
    
    // Calculate fresh VWMA from recent candles
    const vwma10_1m = calculateVWMA(historicalCandles, 10);
    const vwma20_1m = calculateVWMA(historicalCandles, 20);
    const vwma20Array = calculateVWMAArray(historicalCandles, 20);
    
    // Calculate fresh ADX from historical candles (need at least 200 for accuracy)
    let adx_1m = null, plus_di_1m = null, minus_di_1m = null;
    let plusDIArray = [], minusDIArray = [];
    
    if (historicalCandles.length >= 200) {
      console.log(`🔍 ${getTradingSymbol(token)}: Calculating fresh ADX with ${historicalCandles.length} historical candles`);
      const adxResults = calculateADX(historicalCandles, 14);
      
      if (adxResults && adxResults.length > 0) {
        // Get the latest complete ADX values (avoid null values from incomplete candles)
        const validResults = adxResults.filter(r => r.adx !== null && r.plusDI !== null && r.minusDI !== null);
        
        if (validResults.length > 0) {
          const latest = validResults[validResults.length - 1];
          adx_1m = latest.adx;
          plus_di_1m = latest.plusDI;
          minus_di_1m = latest.minusDI;
          
          // Get arrays for historical display (last 5 valid values)
          plusDIArray = validResults.slice(-5).map(r => r.plusDI);
          minusDIArray = validResults.slice(-5).map(r => r.minusDI);
          
          console.log(`✅ ${getTradingSymbol(token)}: Fresh ADX=${adx_1m?.toFixed(2)}, +DI=${plus_di_1m?.toFixed(2)}, -DI=${minus_di_1m?.toFixed(2)}`);
        } else {
          console.log(`⚠️ ${getTradingSymbol(token)}: No valid ADX results from historical calculation`);
        }
      }
    } else {
      console.log(`⚠️ ${getTradingSymbol(token)}: Need at least 200 candles for ADX calculation (${historicalCandles.length} available)`);
    }
    
    // Calculate fresh MACD from historical candles (need at least 50 for accuracy)
    let macd_1m = null, macd_signal_1m = null, macd_histogram_1m = null;
    let macdArray = [], signalArray = [], histogramArray = [];
    
    if (historicalCandles.length >= 50) {
      console.log(`🔍 ${getTradingSymbol(token)}: Calculating fresh MACD with ${historicalCandles.length} historical candles`);
      const closes = historicalCandles.map(candle => candle.close);
      const macdResults = calculateMACD(closes, 12, 26, 9);
      
      if (macdResults && macdResults.length > 0) {
        // Get the latest complete MACD values (avoid null values from incomplete calculations)
        const validResults = macdResults.filter(r => r.macd !== null && r.signal !== null && r.histogram !== null);
        
        if (validResults.length > 0) {
          const latest = validResults[validResults.length - 1];
          macd_1m = latest.macd;
          macd_signal_1m = latest.signal;
          macd_histogram_1m = latest.histogram;
          
          // Get arrays for historical display (last 5 valid values)
          macdArray = validResults.slice(-5).map(r => r.macd);
          signalArray = validResults.slice(-5).map(r => r.signal);
          histogramArray = validResults.slice(-5).map(r => r.histogram);
          
          console.log(`✅ ${getTradingSymbol(token)}: Fresh MACD=${macd_1m?.toFixed(4)}, Signal=${macd_signal_1m?.toFixed(4)}, Histogram=${macd_histogram_1m?.toFixed(4)}`);
        } else {
          console.log(`⚠️ ${getTradingSymbol(token)}: No valid MACD results from historical calculation`);
        }
      }
    } else {
      console.log(`⚠️ ${getTradingSymbol(token)}: Need at least 50 candles for MACD calculation (${historicalCandles.length} available)`);
    }
    
    const result = {
      vwap_1m,
      vwapArray: vwapArray?.slice(-5) || [],
      vwma10_1m,
      vwma20_1m,
      vwma20Array: vwma20Array?.slice(-5) || [],
      adx_1m,
      plus_di_1m,
      minus_di_1m,
      plusDIArray: plusDIArray?.slice(-5) || [],
      minusDIArray: minusDIArray?.slice(-5) || [],
      macd_1m,
      macd_signal_1m,
      macd_histogram_1m,
      macdArray: macdArray?.slice(-5) || [],
      signalArray: signalArray?.slice(-5) || [],
      histogramArray: histogramArray?.slice(-5) || [],
      lastUpdate: Date.now(),
      candleCount: historicalCandles.length
    };
    
    console.log(`✅ ${getTradingSymbol(token)}: Fresh VWAP=${vwap_1m?.toFixed(2)}, VWMA20=${vwma20_1m?.toFixed(2)} from ${historicalCandles.length} candles`);
    
    return result;
  } catch (error) {
    console.error(`❌ Error calculating fresh VWAP/VWMA for token ${token}: ${error.message}`);
    return null;
  }
}
*/

// COMMENTED OUT - Run fresh VWAP/VWMA calculations and order checks every minute (for future use)
/*
async function runMinutelyVWAPADXMACDChecks(specificTokens = null) {
  try {
    // Use specific tokens if provided, otherwise use all tokens in candleCache
    const tokensToProcess = specificTokens ? 
      specificTokens.filter(token => candleCache.has(token)) : 
      Array.from(candleCache.keys());
    
    console.log(\`📊 Starting \${specificTokens ? 'immediate' : 'minutely'} pure historical calculations for \${tokensToProcess.length} tokens\`);
    
    for (const token of tokensToProcess) {
      try {
        // Calculate pure historical data (VWAP, ADX, MACD) for trading conditions
        const symbol = getTradingSymbol(token);
        console.log(\`🔄 \${symbol}: Calculating pure historical indicators\`);
        
        // Call pure historical calculation (no cache)
        const historicalData = await calculateFreshVWAPVWMAADXMACD(token);
        
        if (historicalData) {
          console.log(\`✅ \${symbol}: Historical data calculated - VWAP=\${historicalData.vwap_1m?.toFixed(2)}, ADX=\${historicalData.adx_1m?.toFixed(2)}, MACD=\${historicalData.macd_1m?.toFixed(4)}\`);
          
          // Store in global for trading condition evaluation (simple approach)
          global.historicalIndicators = global.historicalIndicators || new Map();
          global.historicalIndicators.set(token, {
            ...historicalData,
            timestamp: Date.now()
          });
        }
        
        // Increased delay between token checks to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        
      } catch (error) {
        console.error(\`❌ Error in minutely historical calculation for token \${token}: \${error.message}\`);
      }
    }
    
    console.log(\`✅ Minutely pure historical calculations completed for \${tokensToProcess.length} tokens\`);
    
    // Mark server as initialized after first successful batch of calculations
    if (isNewServerSession() && tokensToProcess.length > 0) {
      console.log(\`🚀 First batch of fresh historical calculations completed - marking server as initialized\`);
      markServerInitialized();
    }
    
  } catch (error) {
    console.error(\`❌ Error in runMinutelyVWAPADXMACDChecks: \${error.message}\`);
  }
}
*/

// Check VWAP-based order conditions and place orders accordingly
async function checkVWAPOrderConditions(token, cache, currentPrice) {
  if (!cache || !cache.historical || cache.historical.length < 2) {
    return; // Need at least 2 candles for VWAP analysis
  }

  try {
    const symbol = cache.symbol;
    console.log(`🔍 VWAP Order Check for ${symbol}:`);
    
    // Use historical data calculated by timer (no API calls here)
    const freshData = global.historicalIndicators?.get(token);
    if (!freshData || !freshData.vwap_1m) {
      console.log(`⚠️ ${symbol}: No historical VWAP data available from timer`);
      return;
    }
    
    // Cache the fresh data for use in tick processing (avoid recalculating on every tick)
    freshHistoricalCache.set(token, {
      data: freshData,
      timestamp: Date.now()
    });
    console.log(`💾 Cached fresh historical data for ${symbol} (valid for 1 minute)`);
    
    const currentVWAP = freshData.vwap_1m;
    const vwapArray = freshData.vwapArray || [];
    const currentVWMA20 = freshData.vwma20_1m;
    
    if (!currentVWAP || !vwapArray || vwapArray.length < 2) {
      console.log(`⚠️ ${symbol}: Insufficient VWAP data for analysis`);
      return;
    }
    
    const previousVWAP = vwapArray[vwapArray.length - 2];
    const vwapTrend = currentVWAP > previousVWAP ? 'UP' : 'DOWN';
    const priceVsVWAP = currentPrice > currentVWAP ? 'ABOVE' : 'BELOW';
    
    console.log(`🔍 ${symbol}: VWAP=${currentVWAP.toFixed(2)}, Price=${currentPrice.toFixed(2)}, Trend=${vwapTrend}, Position=${priceVsVWAP}`);
    
    // Check order cooldown
    const now = Date.now();
    if (lastOrderTime[token] && (now - lastOrderTime[token]) < ORDER_COOLDOWN_MS) {
      const remainingTime = Math.ceil((ORDER_COOLDOWN_MS - (now - lastOrderTime[token])) / 1000);
      console.log(`⏰ ${symbol}: Order cooldown active (${remainingTime}s remaining)`);
      return;
    }
    
    // Prevent concurrent order processing
    if (isProcessingOrder) {
      console.log(`🔒 ${symbol}: Order processing in progress, skipping`);
      return;
    }
    
    // Get current indicators for comprehensive sell conditions
    // COMMENTED OUT - Live indicator calculation call (for future use)
    // const indicators = await calculateLiveIndicators(token);
    const indicators = null; // Disabled for optimization
    if (!indicators) {
      console.log(`⚠️ ${symbol}: No indicators available for order analysis`);
      return;
    }
    
    // Comprehensive SELL conditions (all on 1-minute timeframe)
    const macdBelowSignal = indicators.macd_1m < indicators.macd_signal_1m;
    const macdBelowZero = indicators.macd_1m < 0;
    const atrLow = indicators.atr_percent_1m < 0.2;
    const ema9BelowEma21 = indicators.ema9_1m < indicators.ema21_1m;
    const ema21BelowVwap = indicators.ema21_1m < currentVWAP;
    const negativeDirectionalMovement = (indicators.minus_di_1m > indicators.adx_1m && indicators.adx_1m > 25) || 
                                       (indicators.minus_di_1m > indicators.adx_1m);
    
    // Use fresh VWMA20 for EMA sandwich condition
    const emaSandwich = currentVWMA20 ? 
      (indicators.ema9_1m < currentVWMA20 && currentVWMA20 < indicators.ema21_1m) : false;
    
    const comprehensiveSellCondition = (false &&
      macdBelowSignal &&
      macdBelowZero &&
      atrLow &&
      ema9BelowEma21 &&
      ema21BelowVwap &&
      negativeDirectionalMovement &&
      emaSandwich
    );
    
    // Simple VWAP-based buy condition (keeping existing logic)
    const vwapBuyCondition = (
      priceVsVWAP === 'ABOVE' && false &&
      vwapTrend === 'UP' && 
      (currentPrice - currentVWAP) / currentVWAP > 0.001 // Price at least 0.1% above VWAP
    );
    
    console.log(`🔍 ${symbol} Sell Condition Analysis:`);
    console.log(`   MACD < Signal: ${indicators.macd_1m?.toFixed(4)} < ${indicators.macd_signal_1m?.toFixed(4)} = ${macdBelowSignal}`);
    console.log(`   MACD < 0: ${indicators.macd_1m?.toFixed(4)} < 0 = ${macdBelowZero}`);
    console.log(`   ATR% < 0.2: ${indicators.atr_percent_1m?.toFixed(2)}% < 0.2% = ${atrLow}`);
    console.log(`   EMA9 < EMA21: ${indicators.ema9_1m?.toFixed(2)} < ${indicators.ema21_1m?.toFixed(2)} = ${ema9BelowEma21}`);
    console.log(`   EMA21 < VWAP: ${indicators.ema21_1m?.toFixed(2)} < ${currentVWAP.toFixed(2)} = ${ema21BelowVwap}`);
    console.log(`   -DI Condition: -DI=${indicators.minus_di_1m?.toFixed(2)}, ADX=${indicators.adx_1m?.toFixed(2)} = ${negativeDirectionalMovement}`);
    console.log(`   EMA Sandwich: ${indicators.ema9_1m?.toFixed(2)} < ${currentVWMA20?.toFixed(2)} < ${indicators.ema21_1m?.toFixed(2)} = ${emaSandwich}`);
    
    // ===========================
    // REMOVED: DUPLICATE ORDER PLACEMENT
    // ===========================
    // Orders are now placed only in the centralized location using broadcasted values
    // This prevents duplicate orders and ensures consistency with UI display
    
    if (vwapBuyCondition) {
      console.log(`🟢 ${symbol}: VWAP BUY signal detected - Price above rising VWAP (ORDER PLACEMENT CENTRALIZED)`);
    } else if (comprehensiveSellCondition) {
      console.log(`🔴 ${symbol}: COMPREHENSIVE SELL signal detected - All technical conditions met (ORDER PLACEMENT CENTRALIZED)`);
    } else {
      console.log(`⚪ ${symbol}: No trading signal - conditions not met`);
    }
    
  } catch (error) {
    console.error(`❌ Error in VWAP order conditions for token ${token}: ${error.message}`);
  }
}

// Process tick and update candle cache
async function processTickForCache(tick) {
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

     // console.log(`📊 New candle completed for ${cache.symbol}: ${cache.current.close} (${cache.current.tickCount} ticks) - Cache: ${cache.historical.length} candles`);
    }

    // Start new candle
    cache.current = createCurrentCandle(tick, currentMinute);
   // console.log(`🕐 Started new candle for ${cache.symbol} at ${new Date(currentMinute).toLocaleTimeString()}`);
  } else {
    // Update current candle with new tick
    updateCurrentCandle(cache.current, tick);
  }

  cache.lastUpdate = Date.now();
  cache.ltp = tick.last_price;
  return cache;
}

// Send historical data for tokens that haven't received recent live ticks
async function sendHistoricalDataForStaleTokens() {
  if (!global.broadcastToClients || subscribedTokens.length === 0) {
    return;
  }

  const now = Date.now();
  const staleTokens = [];
  
  // Find tokens that haven't received live ticks recently
  subscribedTokens.forEach(token => {
    const lastTick = lastTickTime[token];
    if (!lastTick || (now - lastTick) > HISTORICAL_DATA_INTERVAL) {
      staleTokens.push(token);
    }
  });

  if (staleTokens.length === 0) {
    // Only log occasionally to avoid spam
    if (Math.random() < 0.1) { // 10% chance
      console.log(`📈 All ${subscribedTokens.length} tokens receiving live data - no historical fallback needed`);
    }
    return;
  }

  console.log(`📈 Sending historical data for ${staleTokens.length}/${subscribedTokens.length} stale tokens (no live ticks for >${HISTORICAL_DATA_INTERVAL/1000}s)`);

  let successCount = 0;
  let errorCount = 0;

  // Process stale tokens and send historical data
  for (const token of staleTokens) {
    try {
      const symbol = getTradingSymbol(token);
      
      // Initialize cache if not exists
      if (!candleCache.has(token)) {
        const initialized = await initializeCacheForToken(token, symbol);
        if (!initialized) {
          console.log(`⚠️ Skipping ${symbol} - cache initialization failed`);
          continue;
        }
      }

      // Calculate indicators using existing historical data
      // COMMENTED OUT - Live indicator calculation call (for future use)
      // const historicalIndicators = await calculateLiveIndicators(token);
      const historicalIndicators = null; // Disabled for optimization
      if (historicalIndicators) {
        // Get latest historical candle for LTP if no live price available
        const cache = candleCache.get(token);
        const latestCandle = cache.historical[cache.historical.length - 1];
        const historicalLTP = latestCandle ? latestCandle.close : null;

        // Calculate conditions same as live data
        const buyCondition = (() => {
          if (!historicalIndicators.rsi1h || !historicalIndicators.rsi15m || !historicalIndicators.rsi1m || 
              !historicalIndicators.ema9_1m || !historicalIndicators.ema21_1m) return false;
          
          const rsi1hBuy = historicalIndicators.rsi1h > 60;
          const rsi15mBuy = historicalIndicators.rsi15m > 60;
          const emaCrossoverBuy = historicalIndicators.ema9_1m > historicalIndicators.ema21_1m;
          const rsi1mBuy = historicalIndicators.rsi1m > 65;
          
          return rsi1hBuy && rsi15mBuy && emaCrossoverBuy && rsi1mBuy;
        })();
        
        const sellCondition = (() => {
          if (!historicalIndicators.rsi1h || !historicalIndicators.rsi15m || !historicalIndicators.rsi1m || 
              !historicalIndicators.ema9_1m || !historicalIndicators.ema21_1m) return false;
          
          const rsi1hSell = historicalIndicators.rsi1h < 40;
          const rsi15mSell = historicalIndicators.rsi15m < 35;
          const emaCrossoverSell = historicalIndicators.ema9_1m < historicalIndicators.ema21_1m;
          const rsi1mSell = historicalIndicators.rsi1m < 40;
          
          return rsi1hSell && rsi15mSell && emaCrossoverSell && rsi1mSell;
        })();

        const historicalData = {
          token,
          symbol,
          ...historicalIndicators,
          ltp: historicalLTP, // Use historical price
          
          // Add VWAP data from pure historical cache
          ...(vwapCache.has(token) ? {
            vwap_1m: vwapCache.get(token).vwap_1m,
            vwapArray: vwapCache.get(token).vwapArray
          } : {
            vwap_1m: null,
            vwapArray: []
          }),
          
          // Add VWMA data from pure historical cache
          ...(vwmaCache.has(token) ? {
            vwma10_1m: vwmaCache.get(token).vwma10_1m,
            vwma20_1m: vwmaCache.get(token).vwma20_1m,
            vwma20Array: vwmaCache.get(token).vwma20Array
          } : {
            vwma10_1m: null,
            vwma20_1m: null,
            vwma20Array: []
          }),
          
          buyCondition: buyCondition,
          sellCondition: sellCondition,
          timestamp: new Date().toISOString(),
          isHistorical: true // Flag to indicate this is historical data
        };

        // Send historical data to UI
        global.broadcastToClients({
          type: "simplified_strategy_update",
          data: historicalData
        });

        console.log(`📊 Sent historical data for ${symbol}: RSI=${historicalIndicators.rsi1m?.toFixed(2)}, MACD=${historicalIndicators.macd_1m?.toFixed(4)}, ADX=${historicalIndicators.adx_1m?.toFixed(2)}, ATR=${historicalIndicators.atr_1m?.toFixed(2)}, VWMA10=${historicalIndicators.vwma10_1m?.toFixed(2)}, LTP=${historicalLTP} [HISTORICAL - ${Math.round((now - (lastTickTime[token] || 0))/1000)}s since last tick]`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Error sending historical data for token ${token}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`✅ Historical data update completed: ${successCount} successful, ${errorCount} errors`);
}

// Calculate live indicators using cache + current candle + historical RSI
// COMMENTED OUT - Live indicator calculation function (for future use)
/*
async function calculateLiveIndicators(token) {
  // [Entire function implementation preserved in comment for future restoration]
  // [This function calculated RSI, EMA, MACD, ADX, ATR, VWAP, VWMA indicators from historical + live data]
  // [Function included ADX test samples, historical API calls for 1H/15M RSI, comprehensive indicator calculations]
  // [Used 200+ candles for ADX accuracy, 50+ for MACD, 14+ for RSI/ATR, handled live + historical candle combinations]
  
  console.log('calculateLiveIndicators function is currently disabled for optimization');
  return null;
}
*/


// Check ticker connection status
function checkTickerStatus() {
 // console.log("📊 Ticker Status Check:");
 // console.log(`  - Ticker exists: ${!!ticker}`);
  console.log(`  - Ticker connected: ${ticker ? ticker.connected() : 'N/A'}`);
  console.log(`  - Subscribed tokens: ${subscribedTokens.length}`);
 // console.log(`  - Sample tokens: ${subscribedTokens.slice(0, 5)}`);
  
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
      
      // Immediately calculate historical data for all subscribed tokens on connect
      // Use faster timing if server just restarted
      const isRestart = isNewServerSession();
      const delay = isRestart ? 500 : 2000; // Much faster on restart
      
      console.log(`🔄 Calculating immediate historical data for all ${subscribedTokens.length} tokens on connect (${isRestart ? 'server restart' : 'normal'} mode)`);
      // IMMEDIATE EXECUTION - NO TIMEOUT
      try {
        runMinutelyVWAPADXMACDChecks(subscribedTokens).catch(error => {
          console.error('❌ Error in immediate historical calculation on connect:', error);
        });
        console.log(`✅ Immediate historical calculation completed for all tokens on connect`);
      } catch (error) {
        console.error('❌ Error in immediate historical calculation on connect:', error);
      }
    } else {
      console.log("📡 Ticker connected but no tokens to subscribe to");
    }
  });

  ticker.on("ticks", (ticks) => {
   // console.log(`📊 Received ${ticks.length} ticks at ${new Date().toLocaleTimeString()}`);
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

  //console.log(`📊 Processing ${ticks.length} ticks at ${new Date().toLocaleTimeString()}`);

  // CHECK FOR PENDING ORDER PLACEMENT WHEN FIRST TICK ARRIVES
  if (global.pendingOrderFilename && global.pendingOrderTokens && global.pendingOrderTokens.length > 0) {
    console.log(`🎯 LIVE TICK DATA RECEIVED - Processing pending order placement`);
    console.log(`📊 DEBUG: Pending tokens (${global.pendingOrderTokens.length}): ${global.pendingOrderTokens.slice(0, 3)}... (showing first 3)`);
    console.log(`📊 DEBUG: Received tick tokens (${ticks.length}): ${ticks.slice(0, 3).map(t => t.instrument_token)}... (showing first 3)`);
    
    // Find the first tick that matches one of our pending tokens (convert both to strings for comparison)
    const matchingTick = ticks.find(tick => 
      global.pendingOrderTokens.includes(tick.instrument_token) || 
      global.pendingOrderTokens.includes(String(tick.instrument_token)) ||
      global.pendingOrderTokens.map(String).includes(String(tick.instrument_token))
    );
    
    if (matchingTick) {
      try {
        const { placeBuyOrder, placeSellOrder, canPlaceNewPosition, playOrderBlockedAudio } = require("../orders/orderManager");
        const filename = global.pendingOrderFilename;
        const filenameLC = filename.toLowerCase();
        const token = matchingTick.instrument_token;
        const symbol = getTradingSymbol(token);
        const livePrice = matchingTick.last_price;
        
        console.log(`🎯 Using LIVE TICK DATA from ${symbol}: ₹${livePrice} for order placement`);
        console.log(`📁 Analyzing filename: "${filename}"`);
        
        // REAL-TIME POSITION/ORDER CHECK - Make API call to verify current state
        console.log(`🔍 FILE DOWNLOADED - Making real-time API call to check positions and orders for ${symbol}...`);
        const canPlace = await canPlaceNewPosition(symbol);
        
        if (!canPlace.allowed) {
          // Play detailed audio about what's blocking the order
          const blockingReason = `Order blocked for ${symbol}. ${canPlace.reason}`;
          console.log(`🚫 ${blockingReason}`);
          await playOrderBlockedAudio(blockingReason);
          
          // Clear pending order data since we can't place it
          global.pendingOrderFilename = null;
          global.pendingOrderTokens = null;
          console.log(`❌ Cleared pending order data due to blocking conditions`);
          return;
        }
        
        // If we reach here, position check passed - proceed with order placement
        console.log(`✅ Real-time position check passed - proceeding with order placement for ${symbol}`);
        
        // Place order using live tick price
        if (filenameLC.includes('buy')) {
          console.log(`🟢 FILENAME CONTAINS 'buy' - Placing BUY order for ${symbol} at LIVE PRICE ₹${livePrice}`);
          await placeBuyOrder(token, symbol, livePrice);
        } else if (filenameLC.includes('sell')) {
          console.log(`🔴 FILENAME CONTAINS 'sell' - Placing SELL order for ${symbol} at LIVE PRICE ₹${livePrice}`);
          await placeSellOrder(token, symbol, livePrice);
        } else {
          console.log(`❓ Filename "${filename}" doesn't contain 'buy' or 'sell' - SKIPPING order placement`);
        }
        
        // Clear pending order data after processing
        global.pendingOrderFilename = null;
        global.pendingOrderTokens = null;
        console.log(`✅ Pending order placement completed using live tick data - cleared pending flags`);
        
      } catch (error) {
        console.error(`❌ Error in live tick order placement: ${error.message}`);
        
        // Play audio about the error
        try {
          const { playOrderBlockedAudio } = require("../orders/orderManager");
          await playOrderBlockedAudio(`Error placing order: ${error.message}`);
        } catch (audioError) {
          console.error(`❌ Error playing audio: ${audioError.message}`);
        }
        
        // Clear pending order data on error
        global.pendingOrderFilename = null;
        global.pendingOrderTokens = null;
      }
    } else {
      console.log(`⏳ NO MATCHING TOKENS FOUND - Will keep waiting for matching tick data`);
      console.log(`📊 DEBUG: First few pending tokens: ${global.pendingOrderTokens.slice(0, 5)}`);
      console.log(`📊 DEBUG: First few received tokens: ${ticks.slice(0, 5).map(t => `${t.instrument_token}(${getTradingSymbol(t.instrument_token)})`).join(', ')}`);
    }
  }

  // Process each tick for live indicator calculation
  const liveDataToBroadcast = [];
  
  for (const tick of ticks) {
    const token = tick.instrument_token;
    const symbol = getTradingSymbol(token);
    
    // Track last tick time for this token
    lastTickTime[token] = Date.now();
    
    // Initialize cache if not exists
    if (!candleCache.has(token)) {
      const initialized = await initializeCacheForToken(token, symbol);
      if (!initialized) {
        console.log(`⚠️ Skipping ${symbol} - cache initialization failed`);
        continue;
      }
    }
    
    // Process tick and update candle cache
    const cache = await processTickForCache(tick);
    if (!cache) {
      console.log(`⚠️ Skipping ${symbol} - cache processing failed`);
      continue;
    }
    
    // Calculate live indicators
    // COMMENTED OUT - Live indicator calculation call (for future use)
    // const liveIndicators = await calculateLiveIndicators(token);
    const liveIndicators = null; // Disabled for optimization
    if (liveIndicators) {
      // Buy conditions: 1H RSI > 60, 15M RSI > 60, EMA9 > EMA21 on 1M, RSI 1M > 65
      const buyCondition = (() => {
        if (!liveIndicators.rsi1h || !liveIndicators.rsi15m || !liveIndicators.rsi1m || 
            !liveIndicators.ema9_1m || !liveIndicators.ema21_1m) return false;
        
        const rsi1hBuy = liveIndicators.rsi1h > 60;
        const rsi15mBuy = liveIndicators.rsi15m > 60;
        const emaCrossoverBuy = liveIndicators.ema9_1m > liveIndicators.ema21_1m;
        const rsi1mBuy = liveIndicators.rsi1m > 65;
        
        return rsi1hBuy && rsi15mBuy && emaCrossoverBuy && rsi1mBuy;
      })();
      
      // Sell conditions: 1H RSI < 40, 15M RSI < 35, EMA9 < EMA21 on 1M, RSI 1M < 40
      const sellCondition = (() => {
        if (!liveIndicators.rsi1h || !liveIndicators.rsi15m || !liveIndicators.rsi1m || 
            !liveIndicators.ema9_1m || !liveIndicators.ema21_1m) return false;
        
        const rsi1hSell = liveIndicators.rsi1h < 40;
        const rsi15mSell = liveIndicators.rsi15m < 35;
        const emaCrossoverSell = liveIndicators.ema9_1m < liveIndicators.ema21_1m;
        const rsi1mSell = liveIndicators.rsi1m < 40;
        
        return rsi1hSell && rsi15mSell && emaCrossoverSell && rsi1mSell;
      })();
      
      // Get pure historical data calculated every minute (not on each tick)
      const freshVWAPVWMA = global.historicalIndicators?.get(token) || null;
      
      // Get the exact trading condition values that are being evaluated
      const tradingConditionValues = await getTradingConditionValues(token);
      
      const liveData = {
        token,
        symbol,
        
        // Core live indicators with fallback to prevent empty values
        ltp: getValueWithFallback(token, 'ltp', liveIndicators.ltp),
        rsi1m: getValueWithFallback(token, 'rsi1m', liveIndicators.rsi1m),
        rsi1h: getValueWithFallback(token, 'rsi1h', liveIndicators.rsi1h),
        rsi15m: getValueWithFallback(token, 'rsi15m', liveIndicators.rsi15m),
        ema9_1m: getValueWithFallback(token, 'ema9_1m', liveIndicators.ema9_1m),
        ema21_1m: getValueWithFallback(token, 'ema21_1m', liveIndicators.ema21_1m),
        atr_1m: getValueWithFallback(token, 'atr_1m', liveIndicators.atr_1m),
        atr_percent_1m: getValueWithFallback(token, 'atr_percent_1m', liveIndicators.atr_percent_1m),
        
        // Arrays - keep original logic for arrays
        rsiArray: liveIndicators.rsiArray || [],
        candleCount: liveIndicators.candleCount || 0,
        todayCandleCount: liveIndicators.todayCandleCount || 0,
        
        // Add fresh VWAP/VWMA/ADX data with fallback to prevent N/A values
        vwap_1m: getValueWithFallback(token, 'vwap_1m', freshVWAPVWMA?.vwap_1m),
        vwapArray: freshVWAPVWMA?.vwapArray || [],
        vwma10_1m: getValueWithFallback(token, 'vwma10_1m', freshVWAPVWMA?.vwma10_1m),
        vwma20_1m: getValueWithFallback(token, 'vwma20_1m', freshVWAPVWMA?.vwma20_1m),
        vwma20Array: freshVWAPVWMA?.vwma20Array || [],
        
        // Add fresh ADX data with fallback to live indicators and then last valid values
        adx_1m: getValueWithFallback(token, 'adx_1m', freshVWAPVWMA?.adx_1m, liveIndicators.adx_1m),
        plus_di_1m: getValueWithFallback(token, 'plus_di_1m', freshVWAPVWMA?.plus_di_1m, liveIndicators.plus_di_1m),
        minus_di_1m: getValueWithFallback(token, 'minus_di_1m', freshVWAPVWMA?.minus_di_1m, liveIndicators.minus_di_1m),
        plusDIArray: freshVWAPVWMA?.plusDIArray || [],
        minusDIArray: freshVWAPVWMA?.minusDIArray || [],
        
        // Add fresh MACD data with fallback to live indicators and then last valid values
        macd_1m: getValueWithFallback(token, 'macd_1m', freshVWAPVWMA?.macd_1m, liveIndicators.macd_1m),
        macd_signal_1m: getValueWithFallback(token, 'macd_signal_1m', freshVWAPVWMA?.macd_signal_1m, liveIndicators.macd_signal_1m),
        macd_histogram_1m: getValueWithFallback(token, 'macd_histogram_1m', freshVWAPVWMA?.macd_histogram_1m, liveIndicators.macd_histogram_1m),
        macdArray: freshVWAPVWMA?.macdArray || [],
        signalArray: freshVWAPVWMA?.signalArray || [],
        histogramArray: freshVWAPVWMA?.histogramArray || [],
        
        // Add condition flags for UI table
        buyCondition: buyCondition,
        sellCondition: sellCondition,
        
        // Add the exact trading condition values for UI display
        tradingConditionValues: tradingConditionValues,
        
        timestamp: new Date().toISOString()
      };
      
      liveDataToBroadcast.push(liveData);
      
      // ===========================
      // CENTRALIZED ORDER EVALUATION 
      // ===========================
      // Evaluate trading conditions using the SAME broadcasted data
      // This ensures perfect consistency between UI display and trading decisions
      await evaluateAndPlaceOrders(token, symbol, liveData);
      
      // Log indicator values with candle count info
      console.log(`📈 ${symbol}: RSI=${liveIndicators.rsi1m?.toFixed(2)}, EMA9=${liveIndicators.ema9_1m?.toFixed(2)}, EMA21=${liveIndicators.ema21_1m?.toFixed(2)}, VWMA10=${liveIndicators.vwma10_1m?.toFixed(2)}, VWMA20=${liveIndicators.vwma20_1m?.toFixed(2)}, LTP=${liveIndicators.ltp} [${liveIndicators.candleCount} candles, ${liveIndicators.todayCandleCount} today]`);
      
      // Show fresh calculated values in logs for ADX and MACD
      const finalADX = freshVWAPVWMA?.adx_1m || liveIndicators.adx_1m;
      const finalPlusDI = freshVWAPVWMA?.plus_di_1m || liveIndicators.plus_di_1m;
      const finalMinusDI = freshVWAPVWMA?.minus_di_1m || liveIndicators.minus_di_1m;
      const finalMACD = freshVWAPVWMA?.macd_1m || liveIndicators.macd_1m;
      const finalMACDSignal = freshVWAPVWMA?.macd_signal_1m || liveIndicators.macd_signal_1m;
      const finalMACDHist = freshVWAPVWMA?.macd_histogram_1m || liveIndicators.macd_histogram_1m;
      
      console.log(`� ${symbol} Advanced indicators: MACD=${finalMACD?.toFixed(4)}, Signal=${finalMACDSignal?.toFixed(4)}, Hist=${finalMACDHist?.toFixed(4)}, ADX=${finalADX?.toFixed(2)}, +DI=${finalPlusDI?.toFixed(2)}, -DI=${finalMinusDI?.toFixed(2)}, ATR=${liveIndicators.atr_1m?.toFixed(2)}, ATR%=${liveIndicators.atr_percent_1m?.toFixed(2)}`);
      
      // Show data source info
      if (freshVWAPVWMA?.adx_1m || freshVWAPVWMA?.macd_1m) {
        console.log(`🔄 ${symbol} Using fresh historical data: ADX=${freshVWAPVWMA?.adx_1m ? 'Historical' : 'Live'}, MACD=${freshVWAPVWMA?.macd_1m ? 'Historical' : 'Live'}`);
      }
      if (Math.random() < 0.02) { // 2% sampling rate
        console.log(`🔍 ${symbol} Accuracy Check:`, {
          totalCandles: liveIndicators.candleCount,
          todayCandles: liveIndicators.todayCandleCount,
          minRequired: MIN_CANDLES_REQUIRED,
          hasMinData: liveIndicators.candleCount >= MIN_CANDLES_REQUIRED,
          rsiValid: liveIndicators.rsi1m !== null && !isNaN(liveIndicators.rsi1m),
          emaValid: liveIndicators.ema9_1m !== null && !isNaN(liveIndicators.ema9_1m),
          vwma10Valid: liveIndicators.vwma10_1m !== null && !isNaN(liveIndicators.vwma10_1m),
          vwma20Valid: liveIndicators.vwma20_1m !== null && !isNaN(liveIndicators.vwma20_1m),
          macdValid: liveIndicators.macd_1m !== null && !isNaN(liveIndicators.macd_1m),
          adxValid: liveIndicators.adx_1m !== null && !isNaN(liveIndicators.adx_1m),
          atrValid: liveIndicators.atr_1m !== null && !isNaN(liveIndicators.atr_1m),
          atrPercentValid: liveIndicators.atr_percent_1m !== null && !isNaN(liveIndicators.atr_percent_1m)
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
      // COMMENTED OUT - Live indicator calculation call (for future use)
      // const liveIndicators = await calculateLiveIndicators(token);
      const liveIndicators = null; // Disabled for optimization
      
      if (liveIndicators && liveIndicators.rsi1m && liveIndicators.ema9_1m && liveIndicators.ema21_1m && 
          liveIndicators.rsi1h && liveIndicators.rsi15m) {
        
        // Get pure historical data calculated every minute (not on each tick)
        const freshVWAPVWMA = global.historicalIndicators?.get(token) || null;
        
        // *** CREATE THE EXACT SAME liveData OBJECT STRUCTURE AS BROADCASTED TO UI ***
        const actualBroadcastData = {
          token,
          symbol,
          ...liveIndicators,
          
          // Add fresh VWAP/VWMA/ADX data with fallback to prevent N/A values (SAME AS UI)
          vwap_1m: getValueWithFallback(token, 'vwap_1m', freshVWAPVWMA?.vwap_1m),
          vwma10_1m: getValueWithFallback(token, 'vwma10_1m', freshVWAPVWMA?.vwma10_1m),
          vwma20_1m: getValueWithFallback(token, 'vwma20_1m', freshVWAPVWMA?.vwma20_1m),
          
          // Add fresh ADX data with fallback to live indicators and then last valid values (SAME AS UI)
          adx_1m: getValueWithFallback(token, 'adx_1m', freshVWAPVWMA?.adx_1m, liveIndicators.adx_1m),
          plus_di_1m: getValueWithFallback(token, 'plus_di_1m', freshVWAPVWMA?.plus_di_1m, liveIndicators.plus_di_1m),
          minus_di_1m: getValueWithFallback(token, 'minus_di_1m', freshVWAPVWMA?.minus_di_1m, liveIndicators.minus_di_1m),
          
          // Add fresh MACD data with fallback to live indicators and then last valid values (SAME AS UI)
          macd_1m: getValueWithFallback(token, 'macd_1m', freshVWAPVWMA?.macd_1m, liveIndicators.macd_1m),
          macd_signal_1m: getValueWithFallback(token, 'macd_signal_1m', freshVWAPVWMA?.macd_signal_1m, liveIndicators.macd_signal_1m),
          macd_histogram_1m: getValueWithFallback(token, 'macd_histogram_1m', freshVWAPVWMA?.macd_histogram_1m, liveIndicators.macd_histogram_1m)
        };
        
        console.log(`🎯 [TRADING-CONDITIONS] ${symbol} - EXACT BROADCAST VALUES:`);
        console.log(`   LTP: ${actualBroadcastData.ltp?.toFixed(2) || 'N/A'}`);
        console.log(`   RSI 1M: ${actualBroadcastData.rsi1m?.toFixed(1) || 'N/A'}`);
        console.log(`   EMA9: ${actualBroadcastData.ema9_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   EMA21: ${actualBroadcastData.ema21_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   VWMA20: ${actualBroadcastData.vwma20_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   VWAP: ${actualBroadcastData.vwap_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   MACD: ${actualBroadcastData.macd_1m?.toFixed(4) || 'N/A'}`);
        console.log(`   Signal: ${actualBroadcastData.macd_signal_1m?.toFixed(4) || 'N/A'}`);
        console.log(`   ADX: ${actualBroadcastData.adx_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   +DI: ${actualBroadcastData.plus_di_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   -DI: ${actualBroadcastData.minus_di_1m?.toFixed(2) || 'N/A'}`);
        console.log(`   ATR%: ${actualBroadcastData.atr_percent_1m?.toFixed(2) || 'N/A'}`);
        
        // Removed condition evaluation - you can add trading conditions later as needed
      }
    }
  }
}

// Subscribe to new tokens after unsubscribing from all previous tokens
async function subscribeToTokens(tokens, filename = null) {
  const newTokens = [...new Set(tokens)]; // Remove duplicates
  console.log(`🔄 Full token replacement: ${newTokens.length} tokens in new file`);
  if (filename) {
    console.log(`📄 Source file: ${filename}`);
  }
  console.log(`📊 Current subscriptions: ${subscribedTokens.length} tokens`);
  
  // Unsubscribe from all previous tokens first
  if (subscribedTokens.length > 0) {
    console.log(`📡 Unsubscribing from all ${subscribedTokens.length} previous tokens`);
    unsubscribeAll();
  }
  
  // Clear all caches when doing full replacement
  candleCache.clear();
  lastValidValues.clear();
  freshHistoricalResults.clear();
  freshDataTimestamps.clear();
  Object.keys(lastOrderTime).forEach(key => delete lastOrderTime[key]);
  Object.keys(lastTickTime).forEach(key => delete lastTickTime[key]);
  console.log(`🗑️ Cleared all token-related caches`);

  // Broadcast update to UI
  if (global.broadcastToClients) {
    global.broadcastToClients({
      type: "token_subscription_update",
      message: "Full Token Replacement",
      totalTokens: newTokens.length,
      tokensAdded: newTokens,
      tokensRemoved: subscribedTokens,
      tokensSame: 0,
      csvFile: global.lastCSVFile || 'Unknown'
    });
  }

  if (ticker && ticker.connected()) {
    // Subscribe to all new tokens
    if (newTokens.length > 0) {
      const numericTokensToAdd = newTokens.map(Number);
      ticker.subscribe(numericTokensToAdd);
      ticker.setMode(ticker.modeFull, numericTokensToAdd);
      console.log(`📡 Subscribed to ${newTokens.length} new tokens in FULL mode`);
      
      // WAIT FOR LIVE TICK DATA BEFORE ORDER PLACEMENT
      console.log(`⏳ WAITING FOR LIVE TICK DATA - Will place order when first tick arrives from ${newTokens.length} newly subscribed tokens`);
      
      // Store filename for order placement when tick arrives
      if (filename) {
        global.pendingOrderFilename = filename;
        global.pendingOrderTokens = newTokens;
        console.log(`📁 Stored filename "${filename}" for order placement when live tick data arrives`);
      } else {
        console.log(`⚠️ No filename provided - cannot determine order type when ticks arrive`);
      }
      
      // COMMENTED OUT - Immediately calculate historical data for newly subscribed tokens
      // console.log(`🔄 Calculating immediate historical data for ${newTokens.length} newly added tokens`);
      // // IMMEDIATE EXECUTION - NO TIMEOUT
      //   try {
      //     await runMinutelyVWAPADXMACDChecks(newTokens);
      //     console.log(`✅ Immediate historical calculations completed for newly added tokens`);
      //   } catch (error) {
      //     console.error(`❌ Error in immediate historical calculations for new tokens: ${error.message}`);
      //   }
      // }, 100); // Very quick delay to allow subscription to complete
      // More aggressive timing if server just restarted
      const isRestart = isNewServerSession();
      const delay = isRestart ? 500 : 1000; // Faster on restart
      
      // COMMENTED OUT - Calculating immediate historical data (for future use)
      /*
      console.log(`🔄 Calculating immediate historical data for ${newTokens.length} new tokens (${isRestart ? 'server restart' : 'normal'} mode)`);
      // IMMEDIATE EXECUTION - NO TIMEOUT
        try {
          await runMinutelyVWAPADXMACDChecks(newTokens);
          console.log(`✅ Immediate historical calculation completed for new tokens`);
        } catch (error) {
          console.error('❌ Error in immediate historical calculation:', error);
        }
      }, delay);
      */ // Faster delay for server restart
    }
  } else {
    console.log("⚠️ Ticker not connected, token changes saved for when connection is ready");
    console.log(`🔌 Ticker state: exists=${!!ticker}, connected=${ticker ? ticker.connected() : 'N/A'}`);
  }
  
  // Update the global token list
  subscribedTokens = [...newTokens];
  console.log(`✅ Token update completed: ${subscribedTokens.length} total tokens now subscribed`);
}

// Handle CSV file updates - incremental token update
async function updateTokenSubscriptionsFromCSV(newTokenList, csvFilePath) {
  console.log(`🎯 Incremental token update triggered by CSV: ${csvFilePath}`);
  console.log(`📊 Processing ${Array.isArray(newTokenList) ? newTokenList.length : 'non-array'} tokens`);
  
    // Store CSV filename for UI display
    global.lastCSVFile = csvFilePath.split('\\').pop() || csvFilePath.split('/').pop();
    
    // Extract filename for order placement logic
    const filename = global.lastCSVFile;
    
    try {
      if (!Array.isArray(newTokenList)) {
        throw new Error('newTokenList must be an array');
      }

      // Check if this is the first CSV load or server restart
      const wasEmpty = subscribedTokens.length === 0;
      const isServerRestart = isNewServerSession();
      
      // Perform incremental update (only add new and remove obsolete tokens)
      await subscribeToTokens(newTokenList, filename);    // CANDLE BODY ANALYSIS - Analyze all tokens and place sell order for smallest body token if first load or server restart
    if ((wasEmpty && newTokenList.length > 0) || isServerRestart) {
      console.log(`� CANDLE BODY ANALYSIS - First CSV load or server restart detected - analyzing ${newTokenList.length} tokens for smallest body percentage`);
      // IMMEDIATE EXECUTION - NO TIMEOUT
        try {
          // Import the new scan-based analysis function  
          const { placeOrderBasedOnScanType } = require("../orders/orderManager");
          
          // Create token list with symbols for analysis
          const tokenListForAnalysis = newTokenList.map(token => {
            const instrument = instruments.find(inst => inst.instrument_token == token);
            return {
              token: token,
              symbol: instrument ? instrument.tradingsymbol : `Token_${token}`
            };
          }).filter(item => item.symbol !== `Token_${item.token}`); // Filter out tokens without symbols
          
          if (tokenListForAnalysis.length > 0) {
            console.log(`📊 CSV Analysis - Analyzing candle bodies for: ${tokenListForAnalysis.map(t => t.symbol).join(', ')}`);
            
            // REMOVED: Candle body analysis - using immediate filename-based orders instead
            
            console.log(`✅ CSV candle body analysis and order placement completed`);
          } else {
            console.log(`⚠️ No valid tokens found for CSV candle body analysis`);
          }
        } catch (error) {
          console.error(`❌ Error in CSV candle body analysis and order placement: ${error.message}`);
        }
    }
    
    // COMMENTED OUT - Force immediate historical calculations if this is first load or server restart
    // if ((wasEmpty && newTokenList.length > 0) || isServerRestart) {
    //   const delay = isServerRestart ? 200 : 1000; // Even faster on restart
    //   console.log(`🚀 First CSV load or server restart detected - forcing immediate historical calculations for ${newTokenList.length} tokens (delay: ${delay}ms)`);
    //   // IMMEDIATE EXECUTION - NO TIMEOUT
    //     try {
    //       await runMinutelyVWAPADXMACDChecks(newTokenList);
    //       console.log(`✅ Immediate historical calculations completed for CSV tokens`);
    //     } catch (error) {
    //       console.error(`❌ Error in immediate CSV historical calculations: ${error.message}`);
    //     }
    //   }, delay); // Much faster delay for server restart
    // }
    
    console.log(`✅ Incremental token update completed successfully`);
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
  
  // Initialize server state
  console.log(`🔄 Server restart detected - will recalculate everything fresh`);
  
  initTickListener();
  startCSVWatching();
  
  // Start periodic status checks
  setInterval(checkTickerStatus, 30000); // Check every 30 seconds
  
  // Start periodic historical data checks for stale tokens
  historicalDataTimer = setInterval(sendHistoricalDataForStaleTokens, HISTORICAL_UPDATE_INTERVAL);
  
  // Run fresh VWAP/VWMA/ADX/MACD calculations immediately on startup if tokens are available
  console.log("🚀 Setting up immediate fresh historical calculations on startup...");
  const isRestart = isNewServerSession();
  const delay = isRestart ? 1500 : 3000; // Faster on restart
  
  // Also try immediate calculation without any delay if we have tokens
  if (subscribedTokens.length > 0 && isRestart) {
    console.log(`⚡ Attempting immediate calculation without delay for ${subscribedTokens.length} tokens on server restart`);
    runMinutelyVWAPADXMACDChecks(subscribedTokens).catch(error => {
      console.error("❌ Error in immediate no-delay calculation:", error.message);
    });
  }
  
  // IMMEDIATE EXECUTION FOR STARTUP CALCULATIONS
  try {
    // Check if we have tokens to process
    if (subscribedTokens.length > 0) {
      console.log(`🔄 Running immediate fresh historical calculations for ${subscribedTokens.length} tokens on startup (${isRestart ? 'server restart' : 'normal'} mode)...`);
      runMinutelyVWAPADXMACDChecks(subscribedTokens).catch(error => {
        console.error("❌ Error in initial fresh historical calculations:", error.message);
      });
      console.log("✅ Initial fresh historical calculations completed on startup");
    } else {
      console.log("⏳ No tokens subscribed yet - historical calculations will run when first tokens are added");
    }
  } catch (error) {
    console.error("❌ Error in initial fresh historical calculations:", error.message);
  }
  
  // COMMENTED OUT - Start fresh VWAP/VWMA/ADX/MACD calculations and order checks every minute (for future use)
  // vwapVwmaTimer = setInterval(runMinutelyVWAPADXMACDChecks, 60000); // Every 1 minute
  
  console.log("✅ Conditional tick listener started - waiting for CSV tokens");
  console.log("🔍 Status checks will run every 30 seconds");
  console.log(`📈 Historical data fallback will check every ${HISTORICAL_UPDATE_INTERVAL/1000} seconds for tokens with no live ticks for >${HISTORICAL_DATA_INTERVAL/1000}s`);
  // console.log("📊 Fresh VWAP/VWMA/ADX/MACD calculations will run immediately on startup, then every 60 seconds"); // COMMENTED OUT
  // console.log("⚠️ Trading conditions will be blocked until first fresh historical calculations complete"); // COMMENTED OUT
  
  // Broadcast initial state to UI
  setTimeout(() => {
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: "token_subscription_update",
        message: "System Started",
        totalTokens: subscribedTokens.length,
        tokensAdded: [],
        tokensRemoved: [],
        tokensSame: subscribedTokens.length,
        csvFile: "Waiting for CSV file..."
      });
    }
  }, 2000); // Wait 2 seconds for WebSocket connections
}

// Stop everything
function stopTickListener() {
  console.log("🛑 Stopping tick listener...");
  unsubscribeAll();
  stopCSVWatching();
  
  // Clear pending order state
  global.pendingOrderFilename = null;
  global.pendingOrderTokens = null;
  console.log("🗑️ Cleared pending order state");
  
  // Clear historical data timer
  if (historicalDataTimer) {
    clearInterval(historicalDataTimer);
    historicalDataTimer = null;
  }
  
  // Clear VWAP/VWMA timer
  if (vwapVwmaTimer) {
    clearInterval(vwapVwmaTimer);
    vwapVwmaTimer = null;
  }
  
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

// Get current subscribed tokens
function getSubscribedTokens() {
  return [...subscribedTokens]; // Return a copy to prevent external modification
}

// Function to force immediate fresh historical calculations for all subscribed tokens
async function forceImmediateHistoricalCalculations() {
  try {
    if (subscribedTokens.length === 0) {
      console.log("⚠️ No tokens subscribed - cannot run historical calculations");
      return false;
    }
    
    console.log(`🚀 Forcing immediate fresh historical calculations for ${subscribedTokens.length} tokens...`);
    await runMinutelyVWAPADXMACDChecks(subscribedTokens);
    console.log("✅ Forced immediate historical calculations completed");
    return true;
  } catch (error) {
    console.error("❌ Error in forced immediate historical calculations:", error.message);
    return false;
  }
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
  cleanup,
  getSubscribedTokens,
  forceImmediateHistoricalCalculations // Export new function
};

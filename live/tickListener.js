const { KiteTicker } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
const { checkAndSellOnSubscription, placeBuyOrder, placeSellOrder } = require("../orders/orderManager");
const { calculateRSIArray, calculateEMA, calculateMACD } = require("../strategy/indicators");
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

// Simple order cooldown to prevent multiple orders for same token
const lastOrderTime = {};
const ORDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Track last tick time for each token to detect stale data
const lastTickTime = {};
const HISTORICAL_DATA_INTERVAL = 30 * 1000; // 30 seconds - send historical data if no live ticks
const HISTORICAL_UPDATE_INTERVAL = 60 * 1000; // 1 minute - how often to check for stale tokens

// Global order processing lock to ensure orders are placed one at a time
let isProcessingOrder = false;

// Import shared candle cache to prevent circular dependencies
const { candleCache } = require("../cache/sharedCache");

// Candle cache system for real-time indicator calculation
const CACHE_UPDATE_INTERVAL = 60000; // 1 minute in milliseconds
const MAX_CACHE_CANDLES = 500; // Increased to 500 for better indicator accuracy

const MIN_CANDLES_REQUIRED = 200; // Minimum candles needed for calculation (especially for ADX)

// Function to get trading condition values for UI display
async function getTradingConditionValues(token) {
  try {
    const indicators = await calculateLiveIndicators(token);
    
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
    
    // Get fresh VWAP/VWMA/ADX/MACD data for comparison
    const freshVWAPVWMA = await calculateFreshVWAPVWMAADXMACD(token);
    console.log(`🔍 [UI-DEBUG] ${getTradingSymbol(token)}: Fresh data for UI:`, {
      vwap: freshVWAPVWMA?.vwap_1m,
      adx: freshVWAPVWMA?.adx_1m,
      macd: freshVWAPVWMA?.macd_1m
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
      return; // Already initialized
    }

    console.log(`🔄 Initializing cache for ${symbol} (${token})`);
    
    // Fetch historical data for indicators (15 days for sufficient data)
    const historicalCandles = await getHistoricalData(token, "minute", from15, to15);
    if (!historicalCandles || historicalCandles.length < MIN_CANDLES_REQUIRED) {
      console.log(`⚠️ Not enough historical data for ${symbol}, got ${historicalCandles?.length || 0} candles, need at least ${MIN_CANDLES_REQUIRED}`);
      return false;
    }

    // Fetch today's data for initial setup (optional)
    const todaysCandles = await getHistoricalData(token, "minute", fromToday, to15);
    console.log(`📅 Fetched today's data for ${symbol}: ${todaysCandles?.length || 0} candles`);

    // Initialize cache with historical data only
    candleCache.set(token, {
      historical: historicalCandles.slice(-MAX_CACHE_CANDLES),
      current: null,
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

// This function will be used by BOTH UI and trading conditions to ensure consistency
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

// Update VWAP, VWMA, ADX, and MACD cache for all tokens using pure historical data
// Calculate fresh VWAP, VWMA, ADX, and MACD from historical data each minute
async function calculateFreshVWAPVWMAADXMACD(token) {
  try {
    console.log(`� ${getTradingSymbol(token)}: Calculating fresh VWAP/VWMA from historical data`);
    
    // Get today's historical candles fresh from API
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString().split('T')[0];
    const now = new Date().toISOString().split('T')[0];
    
    const historicalCandles = await getHistoricalData(token, "minute", todayStart, now);
    
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

// Run fresh VWAP/VWMA calculations and order checks every minute
async function runMinutelyVWAPADXMACDChecks() {
  try {
    console.log(`📊 Starting minutely VWAP/VWMA/ADX/MACD order checks for ${candleCache.size} tokens`);
    
    for (const [token, cache] of candleCache) {
      try {
        // Get current price from cache
        const currentPrice = cache.ltp || (cache.historical.length > 0 ? cache.historical[cache.historical.length - 1].close : null);
        
        if (!currentPrice) {
          console.log(`⚠️ No current price for token ${token}, skipping VWAP check`);
          continue;
        }
        
        // Run VWAP/ADX/MACD order conditions with fresh calculations
        await checkVWAPOrderConditions(token, cache, currentPrice);
        
        // Small delay between token checks to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error in minutely VWAP check for token ${token}: ${error.message}`);
      }
    }
    
    console.log(`✅ Minutely VWAP/VWMA/ADX/MACD order checks completed for ${candleCache.size} tokens`);
  } catch (error) {
    console.error(`❌ Error in runMinutelyVWAPADXMACDChecks: ${error.message}`);
  }
}

// Check VWAP-based order conditions and place orders accordingly
async function checkVWAPOrderConditions(token, cache, currentPrice) {
  if (!cache || !cache.historical || cache.historical.length < 2) {
    return; // Need at least 2 candles for VWAP analysis
  }

  try {
    const symbol = cache.symbol;
    console.log(`🔍 VWAP Order Check for ${symbol}:`);
    
    // Calculate fresh VWAP, VWMA, ADX, and MACD data from historical API
    const freshData = await calculateFreshVWAPVWMAADXMACD(token);
    if (!freshData || !freshData.vwap_1m) {
      console.log(`⚠️ ${symbol}: No fresh VWAP data available`);
      return;
    }
    
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
    const indicators = await calculateLiveIndicators(token);
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
    
    if (vwapBuyCondition) {
      console.log(`🟢 ${symbol}: VWAP BUY signal detected - Price above rising VWAP`);
      
      isProcessingOrder = true;
      try {
        const buyResult = await placeBuyOrder({
          symbol: symbol,
          token: token,
          price: currentPrice,
          quantity: 1,
          reason: `VWAP_BUY: Price ${currentPrice.toFixed(2)} above rising VWAP ${currentVWAP.toFixed(2)}`
        });
        
        if (buyResult.success) {
          lastOrderTime[token] = now;
          console.log(`✅ ${symbol}: VWAP buy order placed successfully`);
        } else {
          console.log(`❌ ${symbol}: VWAP buy order failed: ${buyResult.error}`);
        }
      } catch (error) {
        console.error(`❌ ${symbol}: Error placing VWAP buy order: ${error.message}`);
      } finally {
        isProcessingOrder = false;
      }
    } else if (comprehensiveSellCondition) {
      console.log(`🔴 ${symbol}: COMPREHENSIVE SELL signal detected - All technical conditions met`);
      
      isProcessingOrder = true;
      try {
        const sellResult = await placeSellOrder({
          symbol: symbol,
          token: token,
          price: currentPrice,
          quantity: 1,
          reason: `COMPREHENSIVE_SELL: MACD<Signal(${indicators.macd_1m?.toFixed(4)}<${indicators.macd_signal_1m?.toFixed(4)}), MACD<0(${macdBelowZero}), ATR%<0.2(${indicators.atr_percent_1m?.toFixed(2)}%), EMA9<EMA21(${ema9BelowEma21}), EMA21<VWAP(${ema21BelowVwap}), -DI>ADX(${negativeDirectionalMovement}), EMASandwich(${emaSandwich})`
        });
        
        if (sellResult.success) {
          lastOrderTime[token] = now;
          console.log(`✅ ${symbol}: Comprehensive sell order placed successfully`);
        } else {
          console.log(`❌ ${symbol}: Comprehensive sell order failed: ${sellResult.error}`);
        }
      } catch (error) {
        console.error(`❌ ${symbol}: Error placing comprehensive sell order: ${error.message}`);
      } finally {
        isProcessingOrder = false;
      }
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
      const historicalIndicators = await calculateLiveIndicators(token);
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
async function calculateLiveIndicators(token) {
  const cache = candleCache.get(token);
  if (!cache) return null;

  try {
    // Simple ADX test with sample data
    if (cache.symbol === 'RELIANCE') {
      console.log(`🧪 Testing ADX calculation for ${cache.symbol}`);
      const testCandles = [
        {high: 100, low: 95, close: 98},
        {high: 101, low: 96, close: 99},
        {high: 102, low: 97, close: 100},
        {high: 103, low: 98, close: 101},
        {high: 104, low: 99, close: 102}
      ];
      for (let i = 0; i < 50; i++) {
        testCandles.push({
          high: 100 + Math.random() * 10,
          low: 95 + Math.random() * 5,
          close: 97 + Math.random() * 8
        });
      }
      const testResult = calculateADX(testCandles, 14);
      console.log(`🧪 Test ADX result length: ${testResult.length}`);
      if (testResult.length > 0) {
        const last = testResult[testResult.length - 1];
        console.log(`🧪 Test ADX last values: ADX=${last.adx}, +DI=${last.plusDI}, -DI=${last.minusDI}`);
      }
    }

    // Combine historical + current candle for indicator calculation
    const allCandles = [...cache.historical];
    if (cache.current) {
      allCandles.push(cache.current);
    }

    // Extract OHLCV data for RSI/EMA calculations only
    const closes = allCandles.map(c => c.close);
    const highs = allCandles.map(c => c.high);
    const lows = allCandles.map(c => c.low);
    const volumes = allCandles.map(c => c.volume || 0);

    // Get today's candle count for reporting
    let todayCandleCount = 0;
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

    // Calculate RSI/EMA/MACD/ADX/ATR indicators - these need sufficient historical data
    let rsi = null, ema9 = null, ema21 = null;
    let macd = null, macdSignal = null, macdHistogram = null;
    let adx = null, plusDI = null, minusDI = null, atr = null, atrPercent = null;
    let rsiArr = [], macdArr = [], signalArr = [], histogramArr = [];
    let plusDIArr = [], minusDIArr = [], atrArr = [];
    
    if (allCandles.length >= MIN_CANDLES_REQUIRED) {
      // Calculate current RSI using all candles (including current live candle)
      const currentRsiArray = calculateRSIArray(closes, 14);
      rsi = currentRsiArray?.length ? currentRsiArray[currentRsiArray.length - 1] : null;
      
      // Calculate historical RSI array using only historical candles (excluding current live candle)
      const historicalCloses = cache.historical.map(c => c.close);
      rsiArr = historicalCloses.length >= 14 ? calculateRSIArray(historicalCloses, 14) : [];
      
      ema9 = calculateEMA(closes, 9);
      ema21 = calculateEMA(closes, 21);
      
      // Calculate MACD (12, 26, 9) - current values from all candles
      const macdResult = calculateMACD(closes, 12, 26, 9);
      macd = macdResult.macd;
      macdSignal = macdResult.signal;
      macdHistogram = macdResult.histogram;
      
      // Calculate historical MACD arrays using only historical candles
      const historicalMacdResult = historicalCloses.length >= 26 ? calculateMACD(historicalCloses, 12, 26, 9) : null;
      macdArr = historicalMacdResult?.macdArray || [];
      signalArr = historicalMacdResult?.signalArray || [];
      histogramArr = historicalMacdResult?.histogramArray || [];
      
      // Calculate ADX with +DI and -DI (requires at least 200 candles for accuracy)
      let plusDIArr = [], minusDIArr = [];
      
      if (allCandles.length >= 200) {
        console.log(`🔍 ${cache.symbol}: Calculating ADX with ${allCandles.length} candles`);
        // Use improved ADX calculation with sufficient historical data
        const adxResults = calculateADX(allCandles, 14);
        console.log(`🔍 ${cache.symbol}: ADX calculation returned ${adxResults?.length || 0} results`);
        
        if (adxResults && adxResults.length > 0) {
          const latest = adxResults[adxResults.length - 1];
         // console.log(`🔍 ${cache.symbol}: Raw latest ADX object:`, JSON.stringify(latest, null, 2));
          
          adx = latest.adx;
          plusDI = latest.plusDI;
          minusDI = latest.minusDI;
          
      //    console.log(`🔍 ${cache.symbol}: Extracted values - ADX: ${adx}, +DI: ${plusDI}, -DI: ${minusDI}`);
       //   console.log(`🔍 ${cache.symbol}: Latest ADX values - ADX: ${adx?.toFixed(2)}, +DI: ${plusDI?.toFixed(2)}, -DI: ${minusDI?.toFixed(2)}`);
          
          // Extract arrays for historical display (last 5 values)
          const validResults = adxResults.filter(r => r.adx !== null && r.plusDI !== null && r.minusDI !== null);
        //  console.log(`🔍 ${cache.symbol}: Valid results count: ${validResults.length}`);
          plusDIArr = validResults.slice(-5).map(r => r.plusDI);
          minusDIArr = validResults.slice(-5).map(r => r.minusDI);
          
        //  console.log(`🔍 ${cache.symbol}: ADX arrays - +DI: [${plusDIArr.map(v => v?.toFixed(2)).join(', ')}], -DI: [${minusDIArr.map(v => v?.toFixed(2)).join(', ')}]`);
        } else {
         // console.log(`⚠️ ${cache.symbol}: ADX calculation returned no valid results`);
        }
      } else {
        console.log(`⚠️ ${cache.symbol}: Need at least 200 candles for ADX calculation (${allCandles.length} available)`);
      }
      
      // Calculate ATR and ATR percentage using all candles
      const atrResult = calculateATR(allCandles, 14);
      atr = atrResult?.atr || null;
      atrPercent = atrResult?.atrPercent || null;
      
      // Calculate historical ATR array using only historical candles
      atrArr = cache.historical.length >= 14 ? calculateATRArray(cache.historical, 14) : [];
    } else {
      console.log(`⚠️ ${cache.symbol}: Not enough candles for indicators (${allCandles.length}/${MIN_CANDLES_REQUIRED})`);
    }

    // Calculate RSI 1H and 15M using historical API calls
    let rsi1h = null, rsi15m = null;
    
    try {
    //  console.log(`🔍 ${cache.symbol}: Starting RSI 1H/15M calculations...`);
      
      // Fetch 1-hour candles for RSI 1H calculation
    //  console.log(`🔍 ${cache.symbol}: Fetching 1H candles from ${from35} to ${to15}`);
      const hourlyCandles = await getHistoricalData(token, "60minute", from35, to15);
    //  console.log(`🔍 ${cache.symbol}: Got ${hourlyCandles?.length || 0} hourly candles`);
      
      if (hourlyCandles && hourlyCandles.length >= 15) { // Need at least 15 hourly candles for RSI(14)
        const hourlyCloses = hourlyCandles.map(c => c.close);
     //   console.log(`🔍 ${cache.symbol}: Hourly closes sample: ${hourlyCloses.slice(-3).join(', ')}`);
        const rsiArray1h = calculateRSIArray(hourlyCloses, 14);
        rsi1h = rsiArray1h && rsiArray1h.length > 0 ? rsiArray1h[rsiArray1h.length - 1] : null;
      //  console.log(`🔍 ${cache.symbol}: Calculated RSI 1H = ${rsi1h}`);
      } else {
        console.log(`⚠️ ${cache.symbol}: Not enough hourly candles: ${hourlyCandles?.length || 0}/15`);
      }
      
      // Fetch 15-minute candles for RSI 15M calculation
      console.log(`🔍 ${cache.symbol}: Fetching 15M candles from ${from15} to ${to15}`);
      const fifteenMinCandles = await getHistoricalData(token, "15minute", from15, to15);
      console.log(`🔍 ${cache.symbol}: Got ${fifteenMinCandles?.length || 0} 15-minute candles`);
      
      if (fifteenMinCandles && fifteenMinCandles.length >= 15) { // Need at least 15 candles for RSI(14)
        const fifteenMinCloses = fifteenMinCandles.map(c => c.close);
        console.log(`🔍 ${cache.symbol}: 15M closes sample: ${fifteenMinCloses.slice(-3).join(', ')}`);
        const rsiArray15m = calculateRSIArray(fifteenMinCloses, 14);
        rsi15m = rsiArray15m && rsiArray15m.length > 0 ? rsiArray15m[rsiArray15m.length - 1] : null;
        console.log(`🔍 ${cache.symbol}: Calculated RSI 15M = ${rsi15m}`);
      } else {
        console.log(`⚠️ ${cache.symbol}: Not enough 15M candles: ${fifteenMinCandles?.length || 0}/15`);
      }
    } catch (error) {
      console.error(`❌ ${cache.symbol}: Error fetching historical data for RSI calculations: ${error.message}`);
    }

    const result = {
      rsi1m: rsi,
      rsiArray: rsiArr?.slice(-5) || [],
      ema9_1m: ema9,
      ema21_1m: ema21,
      
      // MACD indicators
      macd_1m: macd,
      macd_signal_1m: macdSignal,
      macd_histogram_1m: macdHistogram,
      macdArray: macdArr?.slice(-5) || [],
      signalArray: signalArr?.slice(-5) || [],
      histogramArray: histogramArr?.slice(-5) || [],
      
      // ADX indicators
      adx_1m: adx,
      plus_di_1m: plusDI,
      minus_di_1m: minusDI,
      plusDIArray: plusDIArr?.slice(-5) || [],
      minusDIArray: minusDIArr?.slice(-5) || [],
      
      // ATR (both value and percentage)
      atr_1m: atr,
      atr_percent_1m: atrPercent,
      atrArray: atrArr?.slice(-5) || [],
      
      // RSI values from historical API calls (keep for internal calculations)
      rsi1h: rsi1h,
      rsi15m: rsi15m,
      
      ltp: cache.ltp || closes[closes.length - 1], // Use live LTP
      candleCount: allCandles.length,
      todayCandleCount: todayCandleCount
    };
    
    console.log(`🔍 ${cache.symbol}: Final result - MACD=${result.macd_1m?.toFixed(4)}, ADX=${result.adx_1m?.toFixed(2)}, +DI=${result.plus_di_1m?.toFixed(2)}, -DI=${result.minus_di_1m?.toFixed(2)}, ATR=${result.atr_1m?.toFixed(2)}, ATR%=${result.atr_percent_1m?.toFixed(2)}`);
    
    return result;
  } catch (error) {
    console.error(`❌ Error calculating live indicators for token ${token}: ${error.message}`);
    return null;
  }
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
    const liveIndicators = await calculateLiveIndicators(token);
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
      
      // Calculate fresh VWAP/VWMA/ADX/MACD for this broadcast
      const freshVWAPVWMA = await calculateFreshVWAPVWMAADXMACD(token);
      
      // Get the exact trading condition values that are being evaluated
      const tradingConditionValues = await getTradingConditionValues(token);
      
      const liveData = {
        token,
        symbol,
        ...liveIndicators,
        
        // Add fresh VWAP/VWMA/ADX data calculated from historical API
        vwap_1m: freshVWAPVWMA?.vwap_1m || null,
        vwapArray: freshVWAPVWMA?.vwapArray || [],
        vwma10_1m: freshVWAPVWMA?.vwma10_1m || null,
        vwma20_1m: freshVWAPVWMA?.vwma20_1m || null,
        vwma20Array: freshVWAPVWMA?.vwma20Array || [],
        
        // Add fresh ADX data from historical calculations
        adx_1m: freshVWAPVWMA?.adx_1m || liveIndicators.adx_1m || null,
        plus_di_1m: freshVWAPVWMA?.plus_di_1m || liveIndicators.plus_di_1m || null,
        minus_di_1m: freshVWAPVWMA?.minus_di_1m || liveIndicators.minus_di_1m || null,
        plusDIArray: freshVWAPVWMA?.plusDIArray || [],
        minusDIArray: freshVWAPVWMA?.minusDIArray || [],
        
        // Add fresh MACD data from historical calculations
        macd_1m: freshVWAPVWMA?.macd_1m || liveIndicators.macd_1m || null,
        macd_signal_1m: freshVWAPVWMA?.macd_signal_1m || liveIndicators.macd_signal_1m || null,
        macd_histogram_1m: freshVWAPVWMA?.macd_histogram_1m || liveIndicators.macd_histogram_1m || null,
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
      const liveIndicators = await calculateLiveIndicators(token);
      
      if (liveIndicators && liveIndicators.rsi1m && liveIndicators.ema9_1m && liveIndicators.ema21_1m && 
          liveIndicators.rsi1h && liveIndicators.rsi15m) {
        
        // Get fresh VWAP/VWMA/ADX/MACD data (same as broadcasted to UI)
        const freshVWAPVWMA = await calculateFreshVWAPVWMAADXMACD(token);
        
        // *** CREATE THE EXACT SAME liveData OBJECT STRUCTURE AS BROADCASTED TO UI ***
        const actualBroadcastData = {
          token,
          symbol,
          ...liveIndicators,
          
          // Add fresh VWAP/VWMA/ADX data calculated from historical API (SAME PRIORITY AS UI)
          vwap_1m: freshVWAPVWMA?.vwap_1m || null,
          vwma10_1m: freshVWAPVWMA?.vwma10_1m || null,
          vwma20_1m: freshVWAPVWMA?.vwma20_1m || null,
          
          // Add fresh ADX data from historical calculations (SAME PRIORITY AS UI)
          adx_1m: freshVWAPVWMA?.adx_1m || liveIndicators.adx_1m || null,
          plus_di_1m: freshVWAPVWMA?.plus_di_1m || liveIndicators.plus_di_1m || null,
          minus_di_1m: freshVWAPVWMA?.minus_di_1m || liveIndicators.minus_di_1m || null,
          
          // Add fresh MACD data from historical calculations (SAME PRIORITY AS UI)
          macd_1m: freshVWAPVWMA?.macd_1m || liveIndicators.macd_1m || null,
          macd_signal_1m: freshVWAPVWMA?.macd_signal_1m || liveIndicators.macd_signal_1m || null,
          macd_histogram_1m: freshVWAPVWMA?.macd_histogram_1m || liveIndicators.macd_histogram_1m || null
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

// Subscribe to new tokens and unsubscribe from removed tokens (incremental update)
async function subscribeToTokens(tokens) {
  const newTokens = [...new Set(tokens)]; // Remove duplicates
  console.log(`🔄 Incremental token update: ${newTokens.length} tokens in new file`);
  console.log(`📊 Current subscriptions: ${subscribedTokens.length} tokens`);
  
  // Find tokens to add and remove
  const currentTokens = new Set(subscribedTokens.map(String));
  const incomingTokens = new Set(newTokens.map(String));
  
  const tokensToAdd = newTokens.filter(token => !currentTokens.has(String(token)));
  const tokensToRemove = subscribedTokens.filter(token => !incomingTokens.has(String(token)));
  
  console.log(`➕ Tokens to ADD: ${tokensToAdd.length}`);
  console.log(`➖ Tokens to REMOVE: ${tokensToRemove.length}`);
  console.log(`🔄 Tokens staying SAME: ${subscribedTokens.length - tokensToRemove.length}`);
  
  if (tokensToAdd.length > 0) {
    console.log(`🎯 Adding tokens:`, tokensToAdd.slice(0, 10), tokensToAdd.length > 10 ? '...' : '');
  }
  if (tokensToRemove.length > 0) {
    console.log(`🗑️ Removing tokens:`, tokensToRemove.slice(0, 10), tokensToRemove.length > 10 ? '...' : '');
  }

  // Broadcast update to UI
  if (global.broadcastToClients) {
    global.broadcastToClients({
      type: "token_subscription_update",
      message: "Incremental Token Update",
      totalTokens: newTokens.length,
      tokensAdded: tokensToAdd,
      tokensRemoved: tokensToRemove,
      tokensSame: subscribedTokens.length - tokensToRemove.length,
      csvFile: global.lastCSVFile || 'Unknown'
    });
  }

  if (ticker && ticker.connected()) {
    // Unsubscribe from removed tokens
    if (tokensToRemove.length > 0) {
      const numericTokensToRemove = tokensToRemove.map(Number);
      ticker.unsubscribe(numericTokensToRemove);
      console.log(`📡 Unsubscribed from ${tokensToRemove.length} removed tokens`);
      
      // Clear cache for removed tokens
      tokensToRemove.forEach(token => {
        if (candleCache.has(token)) {
          candleCache.delete(token);
          console.log(`�️ Cleared cache for removed token: ${token}`);
        }
        // Clear order cooldowns for removed tokens
        if (lastOrderTime[token]) {
          delete lastOrderTime[token];
        }
        // Clear last tick time for removed tokens
        if (lastTickTime[token]) {
          delete lastTickTime[token];
        }
      });
    }

    // Subscribe to new tokens
    if (tokensToAdd.length > 0) {
      const numericTokensToAdd = tokensToAdd.map(Number);
      ticker.subscribe(numericTokensToAdd);
      ticker.setMode(ticker.modeFull, numericTokensToAdd);
      console.log(`📡 Subscribed to ${tokensToAdd.length} new tokens in FULL mode`);
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
  
  try {
    if (!Array.isArray(newTokenList)) {
      throw new Error('newTokenList must be an array');
    }

    // Perform incremental update (only add new and remove obsolete tokens)
    await subscribeToTokens(newTokenList);
    
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
  
  initTickListener();
  startCSVWatching();
  
  // Start periodic status checks
  setInterval(checkTickerStatus, 30000); // Check every 30 seconds
  
  // Start periodic historical data checks for stale tokens
  historicalDataTimer = setInterval(sendHistoricalDataForStaleTokens, HISTORICAL_UPDATE_INTERVAL);
  
  // Start fresh VWAP/VWMA/ADX/MACD calculations and order checks every minute
  vwapVwmaTimer = setInterval(runMinutelyVWAPADXMACDChecks, 60000); // Every 1 minute
  
  console.log("✅ Conditional tick listener started - waiting for CSV tokens");
  console.log("🔍 Status checks will run every 30 seconds");
  console.log(`📈 Historical data fallback will check every ${HISTORICAL_UPDATE_INTERVAL/1000} seconds for tokens with no live ticks for >${HISTORICAL_DATA_INTERVAL/1000}s`);
  console.log("📊 Fresh VWAP/VWMA/ADX/MACD calculations and order checks will run every 60 seconds");
  
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
  getSubscribedTokens
};

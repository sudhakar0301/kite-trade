const { KiteTicker } = require("kiteconnect");
const fs = require("fs");
const path = require("path");
const { checkAndSellOnSubscription, placeBuyOrder, placeSellOrder } = require("../orders/orderManager");
const { calculateRSIArray, calculateEMA } = require("../strategy/indicators");
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

// Calculate MACD (Moving Average Convergence Divergence) with arrays
function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!closes || closes.length < slowPeriod + signalPeriod) {
    return { macd: null, signal: null, histogram: null, macdArray: [], signalArray: [], histogramArray: [] };
  }

  // Calculate EMA for fast and slow periods
  const fastEMA = calculateEMAArray(closes, fastPeriod);
  const slowEMA = calculateEMAArray(closes, slowPeriod);
  
  if (!fastEMA || !slowEMA || fastEMA.length === 0 || slowEMA.length === 0) {
    return { macd: null, signal: null, histogram: null, macdArray: [], signalArray: [], histogramArray: [] };
  }

  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine = [];
  const minLength = Math.min(fastEMA.length, slowEMA.length);
  for (let i = 0; i < minLength; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }

  // Calculate signal line (EMA of MACD line)
  const signalLine = calculateEMAArray(macdLine, signalPeriod);
  
  if (!signalLine || signalLine.length === 0) {
    return { macd: null, signal: null, histogram: null, macdArray: [], signalArray: [], histogramArray: [] };
  }

  // Calculate histogram (MACD - Signal)
  const histogram = [];
  const signalLength = signalLine.length;
  for (let i = 0; i < signalLength; i++) {
    const macdIndex = macdLine.length - signalLength + i;
    histogram.push(macdLine[macdIndex] - signalLine[i]);
  }

  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1],
    macdArray: macdLine,
    signalArray: signalLine,
    histogramArray: histogram
  };
}

// Helper function to calculate EMA array
function calculateEMAArray(values, period) {
  if (!values || values.length < period) return null;
  
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is simple average
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  ema.push(sum / period);
  
  // Calculate subsequent EMAs
  for (let i = period; i < values.length; i++) {
    const currentEMA = (values[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
    ema.push(currentEMA);
  }
  
  return ema;
}

// Calculate ADX (Average Directional Index) with +DI and -DI arrays
function calculateADX(candles, period = 14) {
  if (!candles || candles.length < period * 2) {
    return { adx: null, plusDI: null, minusDI: null, adxArray: [], plusDIArray: [], minusDIArray: [] };
  }

  const trueRanges = [];
  const plusDMs = [];
  const minusDMs = [];

  // Calculate True Range, +DM, and -DM
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    // True Range
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    const tr = Math.max(tr1, tr2, tr3);
    trueRanges.push(tr);

    // Directional Movements
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    const plusDM = (upMove > downMove && upMove > 0) ? upMove : 0;
    const minusDM = (downMove > upMove && downMove > 0) ? downMove : 0;

    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  if (trueRanges.length < period) {
    return { adx: null, plusDI: null, minusDI: null, adxArray: [], plusDIArray: [], minusDIArray: [] };
  }

  // Calculate arrays for windowed calculations
  const adxArray = [];
  const plusDIArray = [];
  const minusDIArray = [];

  for (let i = period - 1; i < trueRanges.length; i++) {
    const windowTR = trueRanges.slice(i - period + 1, i + 1);
    const windowPlusDM = plusDMs.slice(i - period + 1, i + 1);
    const windowMinusDM = minusDMs.slice(i - period + 1, i + 1);

    const smoothTR = calculateSMA(windowTR);
    const smoothPlusDM = calculateSMA(windowPlusDM);
    const smoothMinusDM = calculateSMA(windowMinusDM);

    // Calculate DI values
    const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
    const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;

    // Calculate DX
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;

    adxArray.push(dx);
    plusDIArray.push(plusDI);
    minusDIArray.push(minusDI);
  }

  // Calculate smoothed averages for current values
  const smoothTR = calculateSMA(trueRanges.slice(-period));
  const smoothPlusDM = calculateSMA(plusDMs.slice(-period));
  const smoothMinusDM = calculateSMA(minusDMs.slice(-period));

  // Calculate DI values
  const plusDI = smoothTR > 0 ? (smoothPlusDM / smoothTR) * 100 : 0;
  const minusDI = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;

  // Calculate DX
  const diSum = plusDI + minusDI;
  const dx = diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0;

  return {
    adx: dx,
    plusDI: plusDI,
    minusDI: minusDI,
    adxArray: adxArray,
    plusDIArray: plusDIArray,
    minusDIArray: minusDIArray
  };
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

// Check VWAP-based order conditions and place orders accordingly
async function checkVWAPOrderConditions(token, cache, currentPrice) {
  if (!cache || !cache.historical || cache.historical.length < 2) {
    return; // Need at least 2 candles for VWAP analysis
  }

  try {
    const symbol = cache.symbol;
    console.log(`🔍 VWAP Order Check for ${symbol}:`);
    
    // Calculate current VWAP
    const allCandles = [...cache.historical];
    if (cache.current) {
      allCandles.push(cache.current);
    }
    
    const currentVWAP = calculateVWAP(allCandles);
    const vwapArray = calculateVWAPArray(allCandles);
    
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
    const emaSandwich = indicators.ema9_1m < indicators.vwma20_1m && indicators.vwma20_1m < indicators.ema21_1m;
    
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
    console.log(`   EMA Sandwich: ${indicators.ema9_1m?.toFixed(2)} < ${indicators.vwma20_1m?.toFixed(2)} < ${indicators.ema21_1m?.toFixed(2)} = ${emaSandwich}`);
    
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
      
      // Check VWAP-based order conditions after new minute candle is formed
      await checkVWAPOrderConditions(token, cache, tick.last_price);
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

    // Calculate RSI/EMA/VWMA/MACD/ADX/ATR indicators - these need sufficient historical data
    let rsi = null, ema9 = null, ema21 = null, vwma10 = null, vwma20 = null;
    let macd = null, macdSignal = null, macdHistogram = null;
    let adx = null, plusDI = null, minusDI = null, atr = null, atrPercent = null;
    let rsiArr = [], vwma20Arr = [], macdArr = [], signalArr = [], histogramArr = [];
    let plusDIArr = [], minusDIArr = [], atrArr = [];
    
    if (allCandles.length >= MIN_CANDLES_REQUIRED) {
      rsiArr = calculateRSIArray(closes, 14);
      rsi = rsiArr?.length ? rsiArr[rsiArr.length - 1] : null;
      ema9 = calculateEMA(closes, 9);
      ema21 = calculateEMA(closes, 21);
      
      // Calculate multiple VWMA periods (1-minute timeframe)
      vwma10 = calculateVWMA(allCandles, 10); // Short-term VWMA
      vwma20 = calculateVWMA(allCandles, 20); // Medium-term VWMA
      
      // Calculate VWMA20 array for trend analysis
      vwma20Arr = calculateVWMAArray(allCandles, 20);
      
      // Calculate MACD (12, 26, 9)
      const macdResult = calculateMACD(closes, 12, 26, 9);
      macd = macdResult.macd;
      macdSignal = macdResult.signal;
      macdHistogram = macdResult.histogram;
      
      // Get MACD arrays from the same result
      macdArr = macdResult.macdArray || [];
      signalArr = macdResult.signalArray || [];
      histogramArr = macdResult.histogramArray || [];
      
      // Calculate ADX with +DI and -DI
      const adxResult = calculateADX(allCandles, 14);
      adx = adxResult.adx;
      plusDI = adxResult.plusDI;
      minusDI = adxResult.minusDI;
      plusDIArr = adxResult.plusDIArray || [];
      minusDIArr = adxResult.minusDIArray || [];
      
      // Calculate ATR (both value and percentage)
      const atrResult = calculateATR(allCandles, 14);
      atr = atrResult.atr;
      atrPercent = atrResult.atrPercent;
      
      // Calculate ATR array
      atrArr = calculateATRArray(allCandles, 14);
    } else {
      console.log(`⚠️ ${cache.symbol}: Not enough candles for indicators (${allCandles.length}/${MIN_CANDLES_REQUIRED})`);
    }

    // Calculate VWAP (Volume Weighted Average Price) - purely historical, no tick updates
    let vwap = null, vwapArr = [];
    if (allCandles.length >= 1) {
      vwap = calculateVWAP(allCandles);
      vwapArr = calculateVWAPArray(allCandles);
    }

    // Calculate RSI 1H and 15M using historical API calls
    let rsi1h = null, rsi15m = null;
    
    try {
      console.log(`🔍 ${cache.symbol}: Starting RSI 1H/15M calculations...`);
      
      // Fetch 1-hour candles for RSI 1H calculation
      console.log(`🔍 ${cache.symbol}: Fetching 1H candles from ${from35} to ${to15}`);
      const hourlyCandles = await getHistoricalData(token, "60minute", from35, to15);
      console.log(`🔍 ${cache.symbol}: Got ${hourlyCandles?.length || 0} hourly candles`);
      
      if (hourlyCandles && hourlyCandles.length >= 15) { // Need at least 15 hourly candles for RSI(14)
        const hourlyCloses = hourlyCandles.map(c => c.close);
        console.log(`🔍 ${cache.symbol}: Hourly closes sample: ${hourlyCloses.slice(-3).join(', ')}`);
        const rsiArray1h = calculateRSIArray(hourlyCloses, 14);
        rsi1h = rsiArray1h && rsiArray1h.length > 0 ? rsiArray1h[rsiArray1h.length - 1] : null;
        console.log(`🔍 ${cache.symbol}: Calculated RSI 1H = ${rsi1h}`);
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
      vwma10_1m: vwma10, // 10-period Volume Weighted Moving Average
      vwma20_1m: vwma20, // 20-period Volume Weighted Moving Average
      vwma20Array: vwma20Arr?.slice(-5) || [], // Last 5 VWMA20 values for trend analysis
      
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
      
      // VWAP (Volume Weighted Average Price) - historical only
      vwap_1m: vwap,
      vwapArray: vwapArr?.slice(-5) || [],
      
      // RSI values from historical API calls (keep for internal calculations)
      rsi1h: rsi1h,
      rsi15m: rsi15m,
      
      ltp: cache.ltp || closes[closes.length - 1], // Use live LTP
      candleCount: allCandles.length,
      todayCandleCount: todayCandleCount
    };
    
    console.log(`🔍 ${cache.symbol}: Final result - MACD=${result.macd_1m?.toFixed(4)}, ADX=${result.adx_1m?.toFixed(2)}, ATR=${result.atr_1m?.toFixed(2)}, ATR%=${result.atr_percent_1m?.toFixed(2)}, VWMA20=${result.vwma20_1m?.toFixed(2)}, VWAP=${result.vwap_1m?.toFixed(2)}`);
    
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
      
      const liveData = {
        token,
        symbol,
        ...liveIndicators,
        
        // Add condition flags for UI table
        buyCondition: buyCondition,
        sellCondition: sellCondition,
        
        timestamp: new Date().toISOString()
      };
      
      liveDataToBroadcast.push(liveData);
      
      // Log indicator values with candle count info
      console.log(`📈 ${symbol}: RSI=${liveIndicators.rsi1m?.toFixed(2)}, EMA9=${liveIndicators.ema9_1m?.toFixed(2)}, EMA21=${liveIndicators.ema21_1m?.toFixed(2)}, VWMA10=${liveIndicators.vwma10_1m?.toFixed(2)}, VWMA20=${liveIndicators.vwma20_1m?.toFixed(2)}, LTP=${liveIndicators.ltp} [${liveIndicators.candleCount} candles, ${liveIndicators.todayCandleCount} today]`);
      console.log(`� ${symbol} Advanced indicators: MACD=${liveIndicators.macd_1m?.toFixed(4)}, Signal=${liveIndicators.macd_signal_1m?.toFixed(4)}, Hist=${liveIndicators.macd_histogram_1m?.toFixed(4)}, ADX=${liveIndicators.adx_1m?.toFixed(2)}, +DI=${liveIndicators.plus_di_1m?.toFixed(2)}, -DI=${liveIndicators.minus_di_1m?.toFixed(2)}, ATR=${liveIndicators.atr_1m?.toFixed(2)}, ATR%=${liveIndicators.atr_percent_1m?.toFixed(2)}`);
      
      // Detailed debugging for accuracy verification (random sampling to avoid spam)
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
      const indicators = await calculateLiveIndicators(token);
      
      if (indicators && indicators.rsi1m && indicators.ema9_1m && indicators.ema21_1m && 
          indicators.rsi1h && indicators.rsi15m) {
        
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
        
        if (sellCondition) {
          isProcessingOrder = true;
          console.log(`✅ SELL CONDITION MET for ${symbol}:`);
          console.log(`   RSI 1H: ${indicators.rsi1h.toFixed(2)} < 40 = ${rsi1hSell}`);
          console.log(`   RSI 15M: ${indicators.rsi15m.toFixed(2)} < 35 = ${rsi15mSell}`);
          console.log(`   EMA Crossover: ${indicators.ema9_1m.toFixed(2)} < ${indicators.ema21_1m.toFixed(2)} = ${emaCrossoverSell}`);
          console.log(`   RSI 1M: ${indicators.rsi1m.toFixed(2)} < 40 = ${rsi1mSell}`);
          
          try {
            // Use the existing sell order function
          //  await placeSellOrder(token, symbol, ltp);
            lastOrderTime[token] = Date.now();
          } catch (error) {
            console.error(`❌ Error processing sell order for ${symbol}: ${error.message}`);
          } finally {
            isProcessingOrder = false;
          }
        } else if (buyCondition) {
          isProcessingOrder = true;
          console.log(`📈 BUY CONDITION MET for ${symbol}:`);
          console.log(`   RSI 1H: ${indicators.rsi1h.toFixed(2)} > 60 = ${rsi1hBuy}`);
          console.log(`   RSI 15M: ${indicators.rsi15m.toFixed(2)} > 60 = ${rsi15mBuy}`);
          console.log(`   EMA Crossover: ${indicators.ema9_1m.toFixed(2)} > ${indicators.ema21_1m.toFixed(2)} = ${emaCrossoverBuy}`);
          console.log(`   RSI 1M: ${indicators.rsi1m.toFixed(2)} > 65 = ${rsi1mBuy}`);
          
          try {
            // Use the existing buy order function
            const orderData = {
              symbol: symbol,
              price: ltp,
              token: token
            };
         //   await placeBuyOrder(orderData);
            lastOrderTime[token] = Date.now();
          } catch (error) {
            console.error(`❌ Error processing buy order for ${symbol}: ${error.message}`);
          } finally {
            isProcessingOrder = false;
          }
        } else {
          // Only log occasionally to reduce spam
          if (Math.random() < 0.05) { // 5% chance to reduce spam
            console.log(`⏸️ No conditions met for ${symbol}:`);
            console.log(`   BUY: RSI1H>${indicators.rsi1h?.toFixed(2)}>60=${rsi1hBuy}, RSI15M>${indicators.rsi15m?.toFixed(2)}>60=${rsi15mBuy}, EMA9>EMA21=${emaCrossoverBuy}, RSI1M>${indicators.rsi1m?.toFixed(2)}>65=${rsi1mBuy}`);
            console.log(`   SELL: RSI1H<${indicators.rsi1h?.toFixed(2)}<40=${rsi1hSell}, RSI15M<${indicators.rsi15m?.toFixed(2)}<35=${rsi15mSell}, EMA9<EMA21=${emaCrossoverSell}, RSI1M<${indicators.rsi1m?.toFixed(2)}<40=${rsi1mSell}`);
          }
        }
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
  
  console.log("✅ Conditional tick listener started - waiting for CSV tokens");
  console.log("🔍 Status checks will run every 30 seconds");
  console.log(`📈 Historical data fallback will check every ${HISTORICAL_UPDATE_INTERVAL/1000} seconds for tokens with no live ticks for >${HISTORICAL_DATA_INTERVAL/1000}s`);
  
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

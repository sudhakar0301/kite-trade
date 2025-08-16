const cooldownTracker = {};
const ORDER_COOLDOWN_MS = 60000; // 1 minute cooldown between orders for same symbol
const SAME_ORDER_COOLDOWN_MS = 300000; // 5 minute cooldown for same order type

// Audio notification for order placement
function playOrderPlacedAudio() {
  try {
    // Windows-specific audio using PowerShell with text-to-speech
    const { exec } = require('child_process');
    
    // Method 1: Text-to-Speech announcement
    exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak(\'Order placed\')"', (ttsError) => {
      if (ttsError) {
        // Method 2: System sound with beep
        exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Ding.wav\').PlaySync();"', (soundError) => {
          if (soundError) {
            // Method 3: PowerShell beep with specific frequency
            exec('powershell -c "[console]::beep(800,500)"', (beepError) => {
              if (beepError) {
                console.log('\u0007'); // Final fallback to ASCII bell
              }
            });
          }
        });
      }
    });
    
    // Additional console notification with sound effect text
    console.log(`🔊 AUDIO ALERT: ORDER PLACED! 🔊`);
    
    // Reset the waiting timer since an order was placed
    resetWaitingTimer();
    
  } catch (error) {
    console.log(`⚠️ Audio notification failed: ${error.message}`);
    console.log('\u0007'); // Fallback to ASCII bell
  }
}

// Audio notification for waiting for orders
function playWaitingForOrderAudio() {
  try {
    // Windows-specific audio using PowerShell with text-to-speech
    const { exec } = require('child_process');
    
    // Method 1: Text-to-Speech announcement
    exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak(\'Waiting for order\')"', (ttsError) => {
      if (ttsError) {
        // Method 2: System sound
        exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Background.wav\').PlaySync();"', (soundError) => {
          if (soundError) {
            // Method 3: PowerShell double beep
            exec('powershell -c "[console]::beep(400,300); Start-Sleep -m 200; [console]::beep(500,300)"', (beepError) => {
              if (beepError) {
                console.log('\u0007\u0007'); // Final fallback to double ASCII bell
              }
            });
          }
        });
      }
    });
    
    // Additional console notification with waiting message
    console.log(`⏳ AUDIO ALERT: WAITING FOR ORDER... ⏳`);
    
  } catch (error) {
    console.log(`⚠️ Waiting audio notification failed: ${error.message}`);
    console.log('\u0007\u0007'); // Fallback to double ASCII bell
  }
}

// Audio notification for order blocking (why we can't place order)
function playOrderBlockedAudio(reason) {
  try {
    // Windows-specific audio using PowerShell with text-to-speech
    const { exec } = require('child_process');
    
    // Create a clear, concise reason for TTS
    let ttsMessage = 'Order blocked';
    if (reason.includes('position')) {
      ttsMessage = 'Order blocked - existing position';
    } else if (reason.includes('traded')) {
      ttsMessage = 'Order blocked - already traded today';
    } else if (reason.includes('cooldown')) {
      ttsMessage = 'Order blocked - cooldown active';
    } else if (reason.includes('funds')) {
      ttsMessage = 'Order blocked - insufficient funds';
    } else if (reason.includes('pending')) {
      ttsMessage = 'Order blocked - pending orders exist';
    }
    
    // Method 1: Text-to-Speech announcement with specific reason
    exec(`powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak('${ttsMessage}')"`, (ttsError) => {
      if (ttsError) {
        // Method 2: System warning sound
        exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Exclamation.wav\').PlaySync();"', (soundError) => {
          if (soundError) {
            // Method 3: PowerShell warning beep sequence
            exec('powershell -c "[console]::beep(300,200); Start-Sleep -m 100; [console]::beep(300,200); Start-Sleep -m 100; [console]::beep(300,200)"', (beepError) => {
              if (beepError) {
                console.log('\u0007\u0007\u0007'); // Final fallback to triple ASCII bell
              }
            });
          }
        });
      }
    });
    
    // Additional console notification with blocking reason
    console.log(`🚫 AUDIO ALERT: ORDER BLOCKED - ${reason.toUpperCase()} 🚫`);
    
  } catch (error) {
    console.log(`⚠️ Order blocked audio notification failed: ${error.message}`);
    console.log('\u0007\u0007\u0007'); // Fallback to triple ASCII bell
  }
}

// Audio notification specifically for TARGET order placement
function playTargetOrderAudio() {
  try {
    // Windows-specific audio using PowerShell with text-to-speech
    const { exec } = require('child_process');
    
    // Method 1: Text-to-Speech announcement
    exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak(\'Target order placed\')"', (ttsError) => {
      if (ttsError) {
        // Method 2: System sound with high-pitched beep for target
        exec('powershell -c "[console]::beep(1000,400)"', (beepError) => {
          if (beepError) {
            console.log('\u0007'); // Final fallback to ASCII bell
          }
        });
      }
    });
    
    // Additional console notification with target-specific message
    console.log(`🎯 AUDIO ALERT: TARGET ORDER PLACED! 🎯`);
    
    // Reset the waiting timer since an order was placed
    resetWaitingTimer();
    
  } catch (error) {
    console.log(`⚠️ Target order audio notification failed: ${error.message}`);
    console.log('\u0007'); // Fallback to ASCII bell
  }
}

// Audio notification specifically for STOP LOSS order placement
function playStopLossOrderAudio() {
  try {
    // Windows-specific audio using PowerShell with text-to-speech
    const { exec } = require('child_process');
    
    // Method 1: Text-to-Speech announcement
    exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak(\'Stop loss order placed\')"', (ttsError) => {
      if (ttsError) {
        // Method 2: System sound with low-pitched beep for stop loss
        exec('powershell -c "[console]::beep(500,400)"', (beepError) => {
          if (beepError) {
            console.log('\u0007'); // Final fallback to ASCII bell
          }
        });
      }
    });
    
    // Additional console notification with stop loss-specific message
    console.log(`🛑 AUDIO ALERT: STOP LOSS ORDER PLACED! 🛑`);
    
    // Reset the waiting timer since an order was placed
    resetWaitingTimer();
    
  } catch (error) {
    console.log(`⚠️ Stop loss order audio notification failed: ${error.message}`);
    console.log('\u0007'); // Fallback to ASCII bell
  }
}

// Timer management for waiting audio
let waitingTimer = null;
let lastOrderTimestamp = Date.now();
const WAITING_INTERVAL_MS = 60000; // 1 minute = 60,000 milliseconds

// Function to start the waiting timer
function startWaitingTimer() {
  try {
    // Clear any existing timer
    if (waitingTimer) {
      clearInterval(waitingTimer);
    }
    
    console.log(`⏰ Starting waiting timer - will play "waiting for order" audio every minute`);
    
    // Set up interval to check every minute
    waitingTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastOrder = now - lastOrderTimestamp;
      
      // If more than 1 minute has passed since last order, play waiting audio
      if (timeSinceLastOrder >= WAITING_INTERVAL_MS) {
        playWaitingForOrderAudio();
        console.log(`⏳ No orders placed in the last ${Math.floor(timeSinceLastOrder / 1000)} seconds - waiting for order...`);
      }
    }, WAITING_INTERVAL_MS); // Check every minute
    
  } catch (error) {
    console.error(`❌ Error starting waiting timer: ${error.message}`);
  }
}

// Function to reset the waiting timer (called when an order is placed)
function resetWaitingTimer() {
  try {
    lastOrderTimestamp = Date.now();
    console.log(`🔄 Order placed - waiting timer reset`);
  } catch (error) {
    console.error(`❌ Error resetting waiting timer: ${error.message}`);
  }
}

// Function to stop the waiting timer
function stopWaitingTimer() {
  try {
    if (waitingTimer) {
      clearInterval(waitingTimer);
      waitingTimer = null;
      console.log(`⏹️ Waiting timer stopped`);
    }
  } catch (error) {
    console.error(`❌ Error stopping waiting timer: ${error.message}`);
  }
}

// Initialize the waiting timer when the module loads
console.log(`🎵 Audio system initialized - starting waiting timer`);
startWaitingTimer();

// Import historical data functions for candle body analysis
const { getHistoricalData } = require("../strategy/scanner");
const { fromToday, to1 } = require("../utils/fromAndToDate");

// COMMENTED OUT - Other indicator functions
// const { getLatestADXData } = require("../strategy/indicators");
// const { from15, to15 } = require("../utils/fromAndToDate");
// const { calculateRSIArray, calculateVWAP, calculateEMA, calculateRSI } = require("../strategy/indicators");

// MIS trading window configuration
const MIS_CUTOFF_TIME = { hours: 15, minutes: 15 }; // 3:15 PM - standard MIS cutoff

// Track open orders and their exit orders
const openOrdersTracker = {}; // { symbol: { orderId, quantity, price, exitOrderId, timestamp } }

// DYNAMIC PROFIT/LOSS CALCULATION BASED ON USABLE FUNDS
const TARGET_PROFIT_PERCENTAGE = 0.25; // 0.25% of usable funds for target profit
const STOP_LOSS_PERCENTAGE = 0.1; // Half of target profit (0.125% of usable funds)

// PREDEFINED VALUES FOR IMMEDIATE SELL ORDERS
const PREDEFINED_QUANTITY = 1; // Fixed quantity for sell orders
const PREDEFINED_TARGET = 5000; // Fixed target profit

// Enhanced position tracking to prevent multiple positions
let currentPosition = null; // { symbol, type: 'LONG'|'SHORT', quantity, price, timestamp, targetOrderId, stopLossOrderId }

/**
 * Efficiently get historical data for multiple tokens in batch with rate limiting
 * @param {Array} tokenList - Array of {token, symbol} objects
 * @returns {Promise<Array>} - Array of historical data results
 */
async function getHistoricalDataBatch(tokenList) {
  try {
    console.log(`📊 Fetching historical data for ${tokenList.length} tokens in batch with rate limiting...`);
    
    // RATE LIMITED: Process tokens in smaller chunks to avoid "Too many requests"
    const CHUNK_SIZE = 3; // Process only 3 tokens at a time
    const DELAY_BETWEEN_CHUNKS = 1000; // 1 second delay between chunks
    
    const results = [];
    
    for (let i = 0; i < tokenList.length; i += CHUNK_SIZE) {
      const chunk = tokenList.slice(i, i + CHUNK_SIZE);
      console.log(`📊 Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(tokenList.length/CHUNK_SIZE)} (${chunk.length} tokens)`);
      
      // Create promises for current chunk
      const chunkPromises = chunk.map(({ token, symbol }) => 
        getHistoricalData(token, "minute", fromToday, to1)
          .then(candles => ({ token, symbol, candles }))
          .catch(error => {
            console.error(`❌ Error fetching historical data for ${symbol}: ${error.message}`);
            return { token, symbol, candles: null };
          })
      );
      
      // Execute current chunk
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
      
      // Add delay between chunks (except for the last chunk)
      if (i + CHUNK_SIZE < tokenList.length) {
        console.log(`⏱️ Waiting ${DELAY_BETWEEN_CHUNKS}ms before next chunk...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
      }
    }
    
    console.log(`✅ Rate-limited historical data batch fetch completed for ${results.length} tokens`);
    return results;
  } catch (error) {
    console.error(`❌ Error in batch historical data fetch: ${error.message}`);
    return [];
  }
}

/**
 * Analyze candle body from already fetched historical data using last 5 candles
 * @param {string|number} token - instrument token
 * @param {string} symbol - trading symbol
 * @param {Array} candles - historical candle data
 * @returns {Object|null} - { token, symbol, overallPercentage, firstOpen, lastClose, ltp } or null
 */
function analyzeCandleBodyFromData(token, symbol, candles) {
  try {
    if (!candles || candles.length < 5) {
      console.log(`⚠️ Insufficient candles for ${symbol}: ${candles?.length || 0} (need at least 5)`);
      return null;
    }
    
    // Get the last 5 candles
    const last5Candles = candles.slice(-5);
    
    // Get first candle's open and last candle's close from the 5-candle period
    const firstOpen = last5Candles[0].open;
    const lastClose = last5Candles[4].close;
    
    // Calculate overall percentage: (lastClose - firstOpen) / firstOpen * 100
    // This can be positive or negative
    const overallPercentage = ((lastClose - firstOpen) / firstOpen) * 100;
    
    console.log(`📊 ${symbol}: Last 5 candles analysis - First Open: ₹${firstOpen.toFixed(2)}, Last Close: ₹${lastClose.toFixed(2)}, Overall: ${overallPercentage.toFixed(3)}%`);
    
    return {
      token,
      symbol,
      overallPercentage,
      firstOpen,
      lastClose,
      high: last5Candles[4].high,
      low: last5Candles[4].low,
      ltp: lastClose // Use last close as LTP
    };
  } catch (error) {
    console.error(`❌ Error analyzing 5-candle data for ${symbol}: ${error.message}`);
    return null;
  }
}

/**
 * Analyze all tokens and find the best stock based on scan type
 * @param {Array} tokenList - Array of {token, symbol} objects
 * @param {string} scanType - 'BUY' or 'SELL' to determine selection logic
 * @returns {Promise<Object|null>} - Selected token with movement analysis
 */
async function findSmallestBodyToken(tokenList, scanType = 'UNKNOWN') {
  try {
    console.log(`🔍 ===== STOCK SELECTION LOGIC =====`);
    console.log(`📊 Total stocks in scan: ${tokenList.length}`);
    console.log(`📋 Scan Type: ${scanType}`);
    console.log(`📄 Stocks: ${tokenList.map(t => t.symbol).join(', ')}`);
    
    // SINGLE STOCK CASE: Place order immediately without analysis
    if (tokenList.length === 1) {
      const singleStock = tokenList[0];
      console.log(`🎯 SINGLE STOCK DETECTED: ${singleStock.symbol}`);
      console.log(`✅ Placing order immediately (no movement analysis needed)`);
      
      // For single stock, we still need to get current LTP for order placement
      let currentLTP = 0;
      
      // Try to get LTP from WebSocket data first
      if (global.currentLTP && global.currentLTP > 0) {
        currentLTP = global.currentLTP;
        console.log(`💰 Using WebSocket LTP: ₹${currentLTP}`);
      } else {
        // Fallback: Get latest candle data to get close price as LTP
        try {
          const historicalData = await getHistoricalDataBatch([singleStock]);
          if (historicalData.length > 0 && historicalData[0].candles && historicalData[0].candles.length > 0) {
            const latestCandle = historicalData[0].candles[historicalData[0].candles.length - 1];
            currentLTP = latestCandle.close;
            console.log(`💰 Using latest candle close as LTP: ₹${currentLTP}`);
          } else {
            console.log(`❌ Could not get LTP for single stock ${singleStock.symbol} - using default`);
            currentLTP = 100; // Fallback value
          }
        } catch (error) {
          console.log(`❌ Error getting LTP for single stock: ${error.message} - using default`);
          currentLTP = 100; // Fallback value
        }
      }
      
      // Return basic structure for single stock with valid LTP
      return {
        token: singleStock.token,
        symbol: singleStock.symbol,
        movementPercentage: 0,
        firstOpen: currentLTP,
        lastClose: currentLTP,
        ltp: currentLTP, // Use actual LTP
        reason: 'Single stock in scan - immediate order'
      };
    }
    
    // MULTIPLE STOCKS CASE: Analyze based on scan type
    console.log(`🔍 MULTIPLE STOCKS: Analyzing last 5-minute movement...`);
    
    if (scanType === 'BUY') {
      console.log(`� BUY SCAN STRATEGY: Select stock with minimum UPWARD movement`);
      console.log(`💡 Logic: Among stocks that moved up, pick the one with smallest gain`);
    } else if (scanType === 'SELL') {
      console.log(`📉 SELL SCAN STRATEGY: Select stock with minimum DOWNWARD movement`);
      console.log(`💡 Logic: Among stocks that moved down, pick the one with smallest loss`);
    } else {
      console.log(`❓ UNKNOWN SCAN TYPE: Using generic minimum movement strategy`);
    }
    
    // Get historical data for all tokens in batch
    const historicalResults = await getHistoricalDataBatch(tokenList);
    
    // Analyze 5-candle movement from the batch results
    const analysisResults = historicalResults.map(({ token, symbol, candles }) => 
      analyzeCandleBodyFromData(token, symbol, candles)
    );
    
    // Filter out null results
    const validResults = analysisResults.filter(result => result !== null);
    
    if (validResults.length === 0) {
      console.log(`❌ No valid 5-minute movement data found for any stocks`);
      return null;
    }
    
    // Show all movement analysis results for transparency
    console.log(`📊 ===== 5-MINUTE MOVEMENT ANALYSIS =====`);
    validResults.forEach(result => {
      const direction = result.overallPercentage >= 0 ? '📈 UP' : '📉 DOWN';
      console.log(`   ${result.symbol}: ${direction} ${result.overallPercentage.toFixed(3)}% (₹${result.firstOpen.toFixed(2)} → ₹${result.lastClose.toFixed(2)})`);
    });
    
    // Apply different selection logic based on scan type
    let selectedStock;
    let selectionReason;
    
    if (scanType === 'BUY') {
      // BUY SCAN: Find stocks that moved UP, pick the one with minimum upward movement
      const upwardStocks = validResults.filter(stock => stock.overallPercentage > 0);
      
      if (upwardStocks.length > 0) {
        selectedStock = upwardStocks.reduce((best, current) => 
          current.overallPercentage < best.overallPercentage ? current : best
        );
        selectionReason = `Minimum upward movement among ${upwardStocks.length} rising stocks`;
      } else {
        // If no stocks moved up, pick the one closest to zero (least negative)
        selectedStock = validResults.reduce((best, current) => 
          current.overallPercentage > best.overallPercentage ? current : best
        );
        selectionReason = `Closest to zero among declining stocks (best available for BUY)`;
      }
      
    } else if (scanType === 'SELL') {
      // SELL SCAN: Find stocks that moved DOWN, pick the one with minimum downward movement
      const downwardStocks = validResults.filter(stock => stock.overallPercentage < 0);
      
      if (downwardStocks.length > 0) {
        selectedStock = downwardStocks.reduce((best, current) => 
          current.overallPercentage > best.overallPercentage ? current : best
        );
        selectionReason = `Minimum downward movement among ${downwardStocks.length} declining stocks`;
      } else {
        // If no stocks moved down, pick the one closest to zero (smallest positive)
        selectedStock = validResults.reduce((best, current) => 
          current.overallPercentage < best.overallPercentage ? current : best
        );
        selectionReason = `Closest to zero among rising stocks (best available for SELL)`;
      }
      
    } else {
      // UNKNOWN: Use generic logic - minimum absolute movement
      selectedStock = validResults.reduce((best, current) => 
        Math.abs(current.overallPercentage) < Math.abs(best.overallPercentage) ? current : best
      );
      selectionReason = `Minimum absolute movement (most stable)`;
    }
    
    const direction = selectedStock.overallPercentage >= 0 ? 'upward' : 'downward';
    console.log(`🎯 ===== WINNER SELECTION =====`);
    console.log(`✅ SELECTED: ${selectedStock.symbol}`);
    console.log(`📊 REASON: ${selectionReason}`);
    console.log(`📈 MOVEMENT: ${direction} ${selectedStock.overallPercentage.toFixed(3)}%`);
    console.log(`� PRICE RANGE: ₹${selectedStock.firstOpen.toFixed(2)} → ₹${selectedStock.lastClose.toFixed(2)}`);
    console.log(`🎯 SCAN TYPE: ${scanType} scan optimized selection`);
    
    return {
      token: selectedStock.token,
      symbol: selectedStock.symbol,
      movementPercentage: selectedStock.overallPercentage,
      firstOpen: selectedStock.firstOpen,
      lastClose: selectedStock.lastClose,
      ltp: selectedStock.ltp,
      reason: selectionReason
    };
  } catch (error) {
    console.error(`❌ Error in stock selection analysis: ${error.message}`);
    return null;
  }
}

// Function to generate Zerodha Kite chart URL
function generateKiteChartURL(symbol, token) {
  try {
    // Zerodha Kite chart URL format: https://kite.zerodha.com/chart/ext/tvc/NSE/SYMBOL/TOKEN
    const chartURL = `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}/${token}`;
    return chartURL;
  } catch (error) {
    console.error(`❌ Error generating chart URL for ${symbol}: ${error.message}`);
    return null;
  }
}

// Cache for positions and margins to avoid frequent API calls
let positionsCache = null;
let marginsCache = null;
let lastPositionsFetch = 0;
let lastMarginsFetch = 0;
const CACHE_DURATION_MS = 30000; // 30 seconds cache

// Track traded symbols to prevent re-trading
let tradedSymbolsCache = new Set();
let lastTradedSymbolsFetch = 0;
const TRADED_SYMBOLS_CACHE_DURATION = 60000; // 1 minute cache for traded symbols

// COMMENTED OUT - Import enhanced candle cache from shared cache module  
// const { candleCache, isNewServerSession, isCacheReadyForTrading, markServerInitialized } = require("../cache/sharedCache");
// const { ema } = require("technicalindicators");

// COMMENTED OUT - Function to check if trading conditions should be evaluated
// function shouldEvaluateTradingConditions() {
//   // If server just restarted, wait for fresh historical data
//   if (isNewServerSession()) {
//     console.log(`🔄 Server restart detected - waiting for fresh historical data before trading`);
//     return false;
//   }
//   
//   // Check if cache is ready for trading decisions
//   if (!isCacheReadyForTrading()) {
//     console.log(`⏳ Cache not ready for trading - waiting for initialization`);
//     return false;
//   }
//   
//   return true;
// }

// Simplified function - always return true for immediate trading
function shouldEvaluateTradingConditions() {
  return true; // Always allow trading - no cache dependency
}

// COMMENTED OUT - Function to get live indicators from enhanced candle cache
// function getLiveIndicatorsFromCache(token) {
//   try {
//     // Check if we should evaluate trading conditions
//     if (!shouldEvaluateTradingConditions()) {
//       console.log(`🚫 Trading conditions evaluation blocked for token ${token} - cache not ready`);
//       return null;
//     }
//     
//     const cache = candleCache.get(token);
//     if (!cache || !cache.historical || cache.historical.length < 50) {
//       console.log(`⚠️ Insufficient cache data for token ${token} (${cache?.historical?.length || 0} historical candles)`);
//       return null;
//     }
//
//     // Combine historical + current candle for indicator calculation
//     const allCandles = [...cache.historical];
//     if (cache.current) {
//       allCandles.push(cache.current);
//     }
//
//     if (allCandles.length < 100) {
//       console.log(`⚠️ Insufficient total candles for indicators for token ${token} (${allCandles.length} total)`);
//       return null;
//     }
//
//     // Get today's candles for VWAP using dedicated today's historical data
//     let vwapCandles = [];
//     
//     // Use today's historical data if available
//     if (cache.todaysHistorical && cache.todaysHistorical.length > 0) {
//       vwapCandles = [...cache.todaysHistorical];
//       console.log(`📅 OrderManager: Using ${cache.todaysHistorical.length} today's historical candles for VWAP`);
//     } else {
//       // Fallback: Filter from all candles for today's data
//       const today = new Date();
//       today.setHours(0, 0, 0, 0);
//       const todayStart = today.getTime();
//       
//       vwapCandles = allCandles.filter(c => {
//         let candleTime;
//         if (c.timestamp) {
//           candleTime = c.timestamp;
//         } else if (c.date) {
//           candleTime = new Date(c.date).getTime();
//         } else {
//           return false;
//         }
//         return candleTime >= todayStart;
//       });
//       console.log(`⚠️ OrderManager Fallback: Filtered ${vwapCandles.length} today's candles from all data`);
//     }
//     
//     // Add current forming candle if exists
//     if (cache.current) {
//       vwapCandles.push(cache.current);
//     }
//
//     // Extract data arrays
//     const closes = allCandles.map(c => c.close);
//     const todayHighs = vwapCandles.map(c => c.high);
//     const todayLows = vwapCandles.map(c => c.low);
//     const todayCloses = vwapCandles.map(c => c.close);
//     const todayVolumes = vwapCandles.map(c => c.volume || 0);
//
//     // Calculate indicators
//     const rsiArr = calculateRSIArray(closes, 14);
//     const rsi = rsiArr?.length ? rsiArr[rsiArr.length - 1] : null;
//     const ema9 = calculateEMA(closes, 9);
//     const ema21 = calculateEMA(closes, 21);
//     
//     // Calculate VWAP using today's data (or all data if no today data)
//     const vwapArr = calculateVWAP(todayHighs, todayLows, todayCloses, todayVolumes);
//     const vwap = vwapArr?.length ? vwapArr[vwapArr.length - 1] : null;
//     const currentPrice = cache.ltp || cache.current?.close || closes[closes.length - 1];
//
//     return {
//       rsi,
//       rsiArray: rsiArr?.slice(-10) || [],
//       ema9,
//       ema21,
//       vwap,
//       
//       // Add hourly indicators from cache
//       hourlyEMA9: cache.hourlyEMA9,
//       hourlyVWAP: cache.hourlyVWAP,
//       currentHourOpen: cache.currentHourOpen,
//       
//       ltp: currentPrice,
//       totalCandles: allCandles.length,
//       todayCandles: vwapCandles.length,
//       symbol: cache.symbol
//     };
//   } catch (error) {
//     console.error(`❌ Error getting live indicators from cache for token ${token}:`, error.message);
//     return null;
//   }
// }

// Simplified function - return basic data without calculations
function getLiveIndicatorsFromCache(token) {
  return {
    ltp: null,
    symbol: null
  };
}

function isInCooldown(symbol) {
  const lastTime = cooldownTracker[symbol];
  return lastTime && Date.now() - lastTime.timestamp < ORDER_COOLDOWN_MS;
}

function isSameOrderInCooldown(symbol, orderType) {
  const lastOrder = cooldownTracker[symbol];
  return lastOrder && 
         lastOrder.orderType === orderType && 
         Date.now() - lastOrder.timestamp < SAME_ORDER_COOLDOWN_MS;
}

/**
 * Check if MIS (intraday) trading window is over
 * Returns true if current time is after MIS cutoff (typically 3:15 PM)
 */
function isMISTimeOver() {
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  
  // Convert current time and cutoff time to minutes for easy comparison
  const currentTimeInMinutes = currentHours * 60 + currentMinutes;
  const cutoffTimeInMinutes = MIS_CUTOFF_TIME.hours * 60 + MIS_CUTOFF_TIME.minutes;
  
  const isOver = currentTimeInMinutes >= cutoffTimeInMinutes;
  
  if (isOver) {
    console.log(`🕐 MIS trading window is over (current: ${currentHours}:${currentMinutes.toString().padStart(2, '0')}, cutoff: ${MIS_CUTOFF_TIME.hours}:${MIS_CUTOFF_TIME.minutes.toString().padStart(2, '0')})`);
  }
  
  return isOver;
}

/**
 * Get appropriate product type based on current time
 * Returns 'CNC' if MIS time is over, otherwise 'MIS'
 */
function getProductType() {
  return 'MIS';
}

async function hasAnyPosition() {
  try {
    const positions = await getPositions();
    if (!positions || !positions.day) return false;

    // Check if any MIS position exists with non-zero quantity
    const anyMISPosition = positions.day.find(pos => 
      pos.product === 'MIS' && 
      pos.quantity !== 0
    );

    if (anyMISPosition) {
      console.log(`📍 Found existing MIS position: ${anyMISPosition.tradingsymbol} - Qty: ${anyMISPosition.quantity}`);
    }

    return !!anyMISPosition;
  } catch (err) {
    console.error(`❌ Error checking MIS positions: ${err.message}`);

    return false;
  }
}

// Enhanced function to check if we can place a new position order
async function canPlaceNewPosition(symbol = null) {
  try {
    // If no symbol provided, cannot do symbol-specific checks
    if (!symbol) {
      console.log(`⚠️ No symbol provided for position check - allowing order`);
      return {
        allowed: true,
        reason: 'No symbol provided - check bypassed'
      };
    }
    
    // Check if we already have a tracked position for the SAME SYMBOL only
    if (currentPosition && currentPosition.symbol === symbol) {
      console.log(`🚫 Cannot place new position - already have position for ${symbol}: ${currentPosition.type}`);
      return {
        allowed: false,
        reason: `Already have open position for ${symbol} (${currentPosition.type})`
      };
    }

    // Check for symbol-specific positions via API (NOT all positions)
    const positions = await getPositions();
    if (positions && positions.day) {
      const symbolPosition = positions.day.find(pos => 
        pos.tradingsymbol === symbol && 
        pos.quantity !== 0
      );
      
      if (symbolPosition) {
        console.log(`🚫 Cannot place new position - existing position found for ${symbol} via API`);
        return {
          allowed: false,
          reason: `Existing position found for ${symbol} - quantity: ${symbolPosition.quantity}`
        };
      }
    }

    // Check if this specific symbol has been traded today
    const symbolTraded = await hasSymbolBeenTraded(symbol);
    if (symbolTraded) {
      //console.log(`🚫 Cannot place new position - ${symbol} already traded today`);
      return {
        allowed: true,
       // reason: `${symbol} already traded today - avoiding overtrading`
      };
    }

    // Check for pending orders for the SAME SYMBOL only
    if (global.kite) {
      const orders = await global.kite.getOrders();
      
      // Filter for orders that create new positions for the SAME SYMBOL
      const symbolOrders = orders.filter(order => {
        const isMarketOrder = order.order_type === 'MARKET';
        const isNewPosition = (order.transaction_type === 'BUY' || order.transaction_type === 'SELL');
        const isPending = ['OPEN', 'TRIGGER PENDING', 'PENDING'].includes(order.status);
        const isSameSymbol = order.tradingsymbol === symbol;
        
        return isMarketOrder && isNewPosition && isPending && isSameSymbol;
      });
      
      if (symbolOrders.length > 0) {
        const orderDetails = symbolOrders.map(order => 
          `${order.transaction_type} ${order.quantity}`
        ).join(', ');
        
        console.log(`🚫 Cannot place new position - ${symbolOrders.length} pending orders found for ${symbol}:`);
        symbolOrders.forEach(order => {
          console.log(`   📋 ${order.tradingsymbol}: ${order.transaction_type} ${order.quantity} @ ${order.order_type} (Status: ${order.status})`);
        });
        
        return {
          allowed: false,
          reason: `Pending order exists for ${symbol}: ${orderDetails}`
        };
      }
    }

    console.log(`✅ Position check passed - no blocking conditions found for ${symbol}`);
    return {
      allowed: true,
      reason: 'No blocking conditions found'
    };
  } catch (err) {
    console.error(`❌ Error checking if new position can be placed: ${err.message}`);
    return {
      allowed: false,
      reason: `Error checking positions: ${err.message}`
    };
  }
}

// Function to check if a symbol has been traded today (has positions or orders)
async function hasSymbolBeenTraded(symbol) {
  try {
    const now = Date.now();
    
    // Check cache first
    if ((now - lastTradedSymbolsFetch) < TRADED_SYMBOLS_CACHE_DURATION) {
      if (tradedSymbolsCache.has(symbol)) {
        console.log(`🔄 Symbol ${symbol} found in traded symbols cache`);
        return true;
      }
    } else {
      // Refresh cache
      tradedSymbolsCache.clear();
      lastTradedSymbolsFetch = now;
    }
    
    // Check current positions (both open and closed for the day)
    const positions = await getPositions();
    if (positions && positions.day) {
      const hasPosition = positions.day.find(pos => 
        pos.tradingsymbol === symbol && 
        (pos.quantity !== 0 || pos.buy_quantity > 0 || pos.sell_quantity > 0)
      );
      
      if (hasPosition) {
        console.log(`📍 Symbol ${symbol} has been traded today (found in positions)`);
        tradedSymbolsCache.add(symbol);
        return true;
      }
    }
    
    // Check today's orders
    if (global.kite) {
      const orders = await global.kite.getOrders();
      if (orders && orders.length > 0) {
        const todayOrders = orders.filter(order => {
          const orderDate = new Date(order.order_timestamp);
          const today = new Date();
          return orderDate.toDateString() === today.toDateString() && 
                 order.tradingsymbol === symbol;
        });
        
        if (todayOrders.length > 0) {
          console.log(`📍 Symbol ${symbol} has orders today (${todayOrders.length} orders)`);
          tradedSymbolsCache.add(symbol);
          return true;
        }
      }
    }
    
    return false;
  } catch (err) {
    console.error(`❌ Error checking if symbol ${symbol} has been traded: ${err.message}`);
    return false; // Default to allowing trade if we can't check
  }
}

// Function to check ADX/DI conditions for 15-minute timeframe
// async function checkADXConditions(token, orderType) {
//   try {
//     // Get 15-minute historical data
//     const candles15m = await getHistoricalData(token, "15minute", from15, to15);
    
//     if (!candles15m || candles15m.length < 30) { // Need at least 30 periods for reliable ADX
//       console.log(`⚠️ Insufficient 15m data for ADX calculation (${candles15m?.length || 0} candles)`);
//       return false;
//     }
    
//     const highs = candles15m.map(c => c.high);
//     const lows = candles15m.map(c => c.low);
//     const closes = candles15m.map(c => c.close);
    
//     // Calculate ADX and DI values
//     const adxData = getLatestADXData(highs, lows, closes, 14);
    
//     if (!adxData) {
//       console.log(`⚠️ Could not calculate ADX data for token ${token}`);
//       return false;
//     }
    
//     const { adx, pdi, mdi } = adxData;
    
//     console.log(`📊 ADX Data for token ${token}: ADX=${adx?.toFixed(2)}, +DI=${pdi?.toFixed(2)}, -DI=${mdi?.toFixed(2)}`);
    
//     if (orderType === 'BUY') {
//       // For BUY: Check if +DI > ADX
//       const condition = pdi > adx;
//       console.log(`📈 BUY ADX Check: +DI(${pdi?.toFixed(2)}) > ADX(${adx?.toFixed(2)}) = ${condition ? 'PASS' : 'FAIL'}`);
//       return condition;
//     } else if (orderType === 'SELL') {
//       // For SELL: Check if -DI > ADX
//       const condition = mdi > adx;
//       console.log(`📉 SELL ADX Check: -DI(${mdi?.toFixed(2)}) > ADX(${adx?.toFixed(2)}) = ${condition ? 'PASS' : 'FAIL'}`);
//       return condition;
//     }
    
//     return false;
//   } catch (error) {
//     console.error(`❌ Error checking ADX conditions for token ${token}:`, error.message);
//     return false; // Default to allowing trade if ADX check fails
//   }
// }

// COMMENTED OUT - All BUY order related functions
// async function placeBuyOrder(orderData) {
//  // console.log(orderData);
//
//  const { symbol, price, token } = orderData;
//  
//  console.log(`🔍 placeBuyOrder called with token: ${token}, symbol: ${symbol}, price: ${price}`);
//
//   try {
//     // Check if we should evaluate trading conditions (server restart/cache readiness)
//     if (!shouldEvaluateTradingConditions()) {
//       console.log(`🚫 BUY order blocked for ${symbol} - waiting for fresh data after server restart`);
//       return null;
//     }
//     
//     // Check if we can place a new position order
//     const canPlace = await canPlaceNewPosition();
//     if (!canPlace) {
//       console.log(`🚫 Cannot place BUY order for ${symbol} - position limit reached or pending orders exist`);
//       return null;
//     }
//
//     // Check if symbol has been traded today (prevent re-trading)
//     const hasBeenTraded = await hasSymbolBeenTraded(symbol);
//     if (hasBeenTraded) {
//       console.log(`🚫 Symbol ${symbol} has already been traded today, skipping BUY order`);
//       return null;
//     }
//
//     // ADX conditions already validated in tickListener before calling this function
//     // No need for double validation
//
//     // Get appropriate product type based on current time
//     const productType = getProductType();
//     console.log(`📊 Using product type: ${productType} for ${symbol}`);
//
//     // Get available funds and calculate quantity
//     const margins = await getAvailableFunds();
//     if (!margins || !margins.equity) {
//       console.log(`❌ Could not fetch available funds for ${symbol}`);
//       return null;
//     }
//
//     const availableFunds = margins.equity.available.live_balance;
//     const quantity = Math.floor(calculateQuantity(availableFunds, price));
//
//     if (quantity < 1) {
//       console.log(`💰 Insufficient funds for BUY order on ${symbol} (Calculated Qty: ${quantity}, Available: ${availableFunds}, Price: ${price})`);
//       return null;
//     }
//
//     const orderParams = {
//       exchange: 'NSE',
//       tradingsymbol: symbol,
//       transaction_type: 'BUY',
//       quantity: quantity, // Use calculated quantity with 4.5x leverage
//       product: productType, // Use calculated product type
//       order_type: 'MARKET'
//     };
//
//     if (global.kite) {
//       const order = await global.kite.placeOrder('regular', orderParams);
//       console.log(`✅ BUY Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType})`);
//       
//       // Track the order for exit order placement
//       cooldownTracker[symbol] = { 
//         orderType: 'BUY', 
//         timestamp: Date.now(), 
//         orderId: order.order_id,
//         quantity: quantity, // Use calculated quantity
//         price: price,
//         productType: productType // Use calculated product type
//       };
//       
//       // Clear position cache
//       positionsCache = null;
//       lastPositionsFetch = 0;
//       
//       // Automatically place target and stop loss orders
//       console.log(`🎯 Auto-placing target order for ${symbol} (No stop loss - manual handling)`);
//       setTimeout(async () => {
//         try {
//           const exitOrders = await placeTargetOrder(symbol, quantity, price, productType);
//           if (exitOrders) {
//             console.log(`✅ Target order placed for ${symbol}`);
//           }
//         } catch (error) {
//           console.error(`❌ Error placing target order for ${symbol}: ${error.message}`);
//         }
//       }, 2000); // 2 second delay to ensure buy order is processed
//       
//       // Broadcast order notification
//       if (global.broadcastToClients) {
//         console.log(`📡 Broadcasting BUY order for ${symbol}`);
//         
//         // Generate chart URL for UI
//         const chartURL = generateKiteChartURL(symbol, token);
//         
//         global.broadcastToClients({
//           type: "order_placed",
//           data: {
//             token,
//             symbol,
//             orderType: 'BUY',
//             price: price,
//             quantity: quantity, // Use calculated quantity
//             orderId: order.order_id,
//             productType: productType,
//             reason: `New Strategy Buy Order (${productType}) - Target: ₹${PROFIT_TARGET} (Stop Loss: Manual)`,
//             time: new Date().toLocaleTimeString(),
//             chartURL: chartURL, // Add chart URL for UI to open
//             openChart: true // Flag to indicate UI should open chart
//           }
//         });
//       } else {
//         console.warn(`⚠️ global.broadcastToClients not available for ${symbol}`);
//       }
//       
//       return order;
//     }
//   } catch (err) {
//     console.error(`❌ Error placing BUY order for ${symbol}: ${err.message}`);
//     return null;
//   }
// }

// SIMPLIFIED SELL ORDER - Place immediately upon subscription (no conditions)
async function placeSellOrder(token, symbol, ltp) {
  try {
    console.log(`� IMMEDIATE SELL ORDER for ${symbol} at LTP: ${ltp} (NO CONDITIONS CHECK)`);
    
    // 🚫 CRITICAL CHECK: Don't place new position orders if we already have a position
    const canPlace = await canPlaceNewPosition(symbol);
    if (!canPlace.allowed) {
      console.log(`🚫 BLOCKED: Cannot place new SELL order for ${symbol} - ${canPlace.reason}`);
      playOrderBlockedAudio(`Cannot place sell order for ${symbol}. ${canPlace.reason}`);
      return null;
    }
    
    // 🚫 CHECK: Don't place order if symbol has completed positions today (prevent re-trading)
    const hasBeenTraded = await hasSymbolBeenTraded(symbol);
    if (hasBeenTraded) {
      const blockReason = "already traded today (completed positions exist)";
      console.log(`🚫 BLOCKED: Symbol ${symbol} has ${blockReason}, skipping SELL order`);
      playOrderBlockedAudio(blockReason);
      return null;
    }
    
    // Get appropriate product type based on current time
    const productType = getProductType();
    console.log(`📊 Using product type: ${productType} for ${symbol}`);

    // Check cooldowns
    if (isInCooldown(symbol)) {
      const blockReason = "cooldown active";
      console.log(`⏳ Cooldown active for ${symbol}, skipping SELL order`);
      playOrderBlockedAudio(blockReason);
      return null;
    }

    if (isSameOrderInCooldown(symbol, 'SELL')) {
      const blockReason = "recent same order exists";
      console.log(`📝 Recent SELL order exists for ${symbol}, skipping`);
      playOrderBlockedAudio(blockReason);
      return null;
    }

    // Get available funds and calculate quantity for short selling
    const margins = await getAvailableFunds();
     if (!margins || !margins.equity) {
      const blockReason = "could not fetch available funds";
      console.log(`❌ Could not fetch available funds for ${symbol}`);
      playOrderBlockedAudio(blockReason);
      return null;
    }

    const availableFunds = margins.equity.available.live_balance;
    let quantity = Math.floor(calculateQuantity(availableFunds, ltp));
    
    // Validate quantity - NO MINIMUM QUANTITY ENFORCEMENT
    if (quantity < 1) {
      const blockReason = "insufficient funds";
      console.log(`❌ Insufficient leveraged funds to sell even 1 share of ${symbol} at ₹${ltp}`);
      console.log(`💰 Available funds: ₹${availableFunds}, Required for 1 share: ₹${ltp}`);
      playOrderBlockedAudio(blockReason);
      return null;
    }
    
    // Additional validation for order placement
    if (!quantity || quantity === 0 || isNaN(quantity)) {
      const blockReason = "invalid quantity calculated";
      console.log(`❌ Invalid quantity calculated for ${symbol}: ${quantity}`);
      console.log(`Debug: availableFunds=${availableFunds}, ltp=${ltp}, productType=${productType}`);
      playOrderBlockedAudio(blockReason);
      return null;
    }
    
    // Calculate dynamic profit and stop loss for order description
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    const dynamicStopLoss = calculateStopLoss(availableFunds);
    
    let orderReason = `IMMEDIATE Short Sell (${productType}) - Target: ₹${dynamicProfitTarget} (0.25%), Stop Loss: ₹${dynamicStopLoss} (0.125%)`;

    console.log(`💹 Placing IMMEDIATE short sell order for ${symbol}: ${quantity} shares (Available funds: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);
    console.log(`🎯 Dynamic Risk Management: Target=₹${dynamicProfitTarget} (0.25% of usable funds), Stop Loss=₹${dynamicStopLoss} (0.125% of usable funds)`);

    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity, // Use calculated quantity with 4.5x leverage
      product: productType, // Use calculated product type
      order_type: 'MARKET'
    };
    
    // Final validation before API call
    console.log(`🔍 Order validation: Symbol=${orderParams.tradingsymbol}, Quantity=${orderParams.quantity}, Type=${orderParams.transaction_type}, Product=${orderParams.product}`);
    
    if (!orderParams.quantity || orderParams.quantity <= 0) {
      const blockReason = "invalid order quantity";
      console.log(`❌ CRITICAL: Order quantity is invalid: ${orderParams.quantity}`);
      playOrderBlockedAudio(blockReason);
      return null;
    }

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`✅ IMMEDIATE SELL Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType}) - ${orderReason}`);
      
      // 🔊 PLAY AUDIO NOTIFICATION FOR ORDER PLACEMENT
      playOrderPlacedAudio();
      
      // Track the order
      cooldownTracker[symbol] = { 
        orderType: 'SELL', 
        timestamp: Date.now(), 
        orderId: order.order_id,
        quantity: quantity, // Use actual calculated quantity
        reason: orderReason,
        productType: productType
      };
      
      // Clear position cache to force refresh
      positionsCache = null;
      lastPositionsFetch = 0;
      
      // Automatically place target AND stop loss orders for short position  
      console.log(`🎯 Auto-placing SHORT TARGET and STOP LOSS orders for SHORT position ${symbol} (Dynamic Stop Loss based on 0.125% of usable funds)`);
      setTimeout(async () => {
        try {
          const exitOrders = await placeShortTargetAndStopLoss(symbol, quantity, ltp, productType, availableFunds);
          if (exitOrders.targetOrder) {
            console.log(`✅ SHORT TARGET and STOP LOSS orders placed for ${symbol} - Automatic risk management enabled`);
          }
        } catch (error) {
          console.error(`❌ Error placing SHORT TARGET and STOP LOSS orders for ${symbol}: ${error.message}`);
        }
      }, 2000); // 2 second delay to ensure sell order is processed
      
      // Broadcast order notification
      if (global.broadcastToClients) {
        // Generate chart URL for UI
        const chartURL = generateKiteChartURL(symbol, token);
        
        global.broadcastToClients({
          type: "order_placed",
          data: {
            token,
            symbol,
            orderType: 'SELL',
            price: ltp,
            quantity: quantity, // Use actual calculated quantity
            orderId: order.order_id,
            productType: productType,
            reason: orderReason,
            time: new Date().toLocaleTimeString(),
            chartURL: chartURL, // Add chart URL for UI to open
            openChart: true // Flag to indicate UI should open chart
          }
        });
      }
      
      return order;
    }
  } catch (err) {
    console.error(`❌ Error placing IMMEDIATE SELL order for ${symbol}: ${err.message}`);
    return null;
  }
}

// Function to get current positions
async function getPositions() {
  try {
    const now = Date.now();
    if (positionsCache && (now - lastPositionsFetch) < CACHE_DURATION_MS) {
      return positionsCache;
    }

    if (global.kite) {
      const positions = await global.kite.getPositions();
      positionsCache = positions;
      lastPositionsFetch = now;
      return positions;
    }
    return null;
  } catch (err) {
    console.error(`❌ Error fetching positions: ${err.message}`);
    return null;
  }
}

// Function to check if any MIS positions exist


// Function to get available funds
async function getAvailableFunds() {
  try {
    const now = Date.now();
    if (marginsCache && (now - lastMarginsFetch) < CACHE_DURATION_MS) {
      return marginsCache;
    }

    if (global.kite) {
      const margins = await global.kite.getMargins();
      marginsCache = margins;
      lastMarginsFetch = now;
      return margins;
    }
    return null;
  } catch (err) {
    console.error(`❌ Error fetching margins: ${err.message}`);
    return null;
  }
}

// Function to calculate quantity based on available funds and price
function calculateQuantity(availableFunds, price) {
  try {
    // Validate inputs
    if (!availableFunds || availableFunds <= 0) {
      console.log(`❌ Invalid available funds: ${availableFunds}`);
      return 0; // Return 0 instead of 1 to prevent order placement
    }
    
    if (!price || price <= 0) {
      console.log(`❌ Invalid price: ${price}`);
      return 0; // Return 0 instead of 1 to prevent order placement
    }
    
    // For intraday trading, use 4.5x leverage (based on product type)
    // Use 80% of leveraged funds to leave buffer for brokerage and margin
    const leverageMultiplier = 4.9;
    const leveragedFunds = availableFunds * leverageMultiplier;
    const usableFunds = leveragedFunds * 0.98; // Use 98% to leave margin buffer
    let quantity = Math.floor(usableFunds / price);

    // Return calculated quantity (can be 0 if insufficient funds)
    console.log(`💰 Quantity calculation: Available: ₹${availableFunds}, Leveraged (${leverageMultiplier}x): ₹${leveragedFunds.toFixed(2)}, Usable (98%): ₹${usableFunds.toFixed(2)}, Price: ₹${price}, Calculated Qty: ${quantity}`);

    return quantity;
  } catch (err) {
    console.error(`❌ Error calculating quantity: ${err.message}`);
    return 0; // Return 0 instead of default to prevent order placement
  }
}

// Function to calculate dynamic profit target based on usable funds
function calculateProfitTarget(availableFunds) {
  try {
    if (!availableFunds || availableFunds <= 0) {
      console.log(`❌ Invalid available funds for profit calculation: ${availableFunds}`);
      return 500; // Fallback minimum target
    }
    
    const leverageMultiplier = 4.9;
    const leveragedFunds = availableFunds * leverageMultiplier;
    const usableFunds = leveragedFunds * 0.98;
    
    // Calculate 0.25% of usable funds as target profit
    const rawProfitTarget = (usableFunds * TARGET_PROFIT_PERCENTAGE) / 100;
    const profitTarget = Math.round(rawProfitTarget); // Round to nearest rupee
    
    console.log(`🎯 Profit Target Calculation: Usable Funds: ₹${usableFunds.toFixed(2)}, Target (${TARGET_PROFIT_PERCENTAGE}%): ₹${profitTarget}`);
    
    return Math.max(profitTarget, 100); // Minimum ₹100 target
  } catch (err) {
    console.error(`❌ Error calculating profit target: ${err.message}`);
    return 500; // Safe fallback
  }
}

// Function to calculate dynamic stop loss based on usable funds  
function calculateStopLoss(availableFunds) {
  try {
    if (!availableFunds || availableFunds <= 0) {
      console.log(`❌ Invalid available funds for stop loss calculation: ${availableFunds}`);
      return 250; // Fallback minimum stop loss
    }
    
    const leverageMultiplier = 4.9;
    const leveragedFunds = availableFunds * leverageMultiplier;
    const usableFunds = leveragedFunds * 0.98;
    
    // Calculate 0.125% of usable funds as stop loss (half of target profit)
    const rawStopLoss = (usableFunds * STOP_LOSS_PERCENTAGE) / 100;
    const stopLoss = Math.round(rawStopLoss); // Round to nearest rupee
    
    console.log(`🛑 Stop Loss Calculation: Usable Funds: ₹${usableFunds.toFixed(2)}, Stop Loss (${STOP_LOSS_PERCENTAGE}%): ₹${stopLoss}`);
    
    return Math.max(stopLoss, 50); // Minimum ₹50 stop loss
  } catch (err) {
    console.error(`❌ Error calculating stop loss: ${err.message}`);
    return 250; // Safe fallback
  }
}

// Function to place exit order with profit target
async function placeExitOrder(symbol, quantity, buyPrice, productType = 'MIS', availableFunds) {
  try {
    // Calculate dynamic profit target based on available funds
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    const profitPerShare = dynamicProfitTarget / quantity; // Distribute profit across all shares
    const exitPrice = buyPrice + profitPerShare; // Calculate exit price for distributed profit
    
    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity, // Use actual quantity
      product: productType, // Use the same product type as the original buy order
      order_type: 'LIMIT',
      price: exitPrice.toFixed(2)
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`🎯 EXIT Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Exit Price: ${exitPrice.toFixed(2)}, Dynamic Target Profit: ₹${dynamicProfitTarget}, Product: ${productType})`);
      
      return {
        orderId: order.order_id,
        exitPrice: exitPrice,
        quantity: quantity, // Use actual quantity
        targetProfit: dynamicProfitTarget,
        productType: productType
      };
    }
    return null;
  } catch (err) {
    console.error(`❌ Error placing EXIT order for ${symbol}: ${err.message}`);
    return null;
  }
}

// Function to place target order with profit target
async function placeTargetOrder(symbol, quantity, buyPrice, productType = 'MIS', availableFunds) {
  try {
    // Calculate dynamic profit target based on available funds
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    const profitPerShare = dynamicProfitTarget / quantity; // Distribute profit across all shares
    const rawTargetPrice = buyPrice + profitPerShare;
    
    // Round to appropriate tick size for this symbol
    const tickSize = getTickSize(rawTargetPrice, symbol);
    const targetPrice = roundToTickSize(rawTargetPrice, tickSize);
    
    console.log(`💰 Price calculation for ${symbol}: Dynamic Target: ₹${dynamicProfitTarget}, Raw target: ₹${rawTargetPrice.toFixed(2)}, Tick size: ${tickSize}, Rounded target: ₹${targetPrice.toFixed(2)}`);
    
    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity, // Use actual quantity
      product: productType, // Use the same product type as the original buy order
      order_type: 'LIMIT',
      price: targetPrice.toFixed(2)
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`🎯 TARGET Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Target Price: ${targetPrice.toFixed(2)}, Dynamic Target Profit: ₹${dynamicProfitTarget}, Product: ${productType})`);
      
      // 🔊 PLAY SPECIFIC AUDIO NOTIFICATION FOR TARGET ORDER PLACEMENT
      playTargetOrderAudio();
      
      return {
        orderId: order.order_id,
        price: targetPrice,
        quantity: quantity, // Use actual quantity
        targetProfit: dynamicProfitTarget,
        productType: productType,
        orderType: 'TARGET'
      };
    }
    return null;
  } catch (err) {
    console.error(`❌ Error placing TARGET order for ${symbol}: ${err.message}`);
    return null;
  }
}

// Function to place stop loss order with fixed stop loss amount
async function placeStopLossOrder(symbol, quantity, buyPrice, productType = 'MIS', availableFunds) {
  try {
    // Calculate dynamic stop loss based on available funds
    const dynamicStopLoss = calculateStopLoss(availableFunds);
    const lossPerShare = dynamicStopLoss / quantity; // Distribute stop loss across all shares
    const rawStopPrice = buyPrice - lossPerShare; // Calculate stop price per share
    
    // Round to appropriate tick size for this symbol
    const tickSize = getTickSize(rawStopPrice, symbol);
    const stopPrice = roundToTickSize(rawStopPrice, tickSize);
    
    console.log(`💰 Stop loss calculation for ${symbol}: Dynamic Stop Loss: ₹${dynamicStopLoss}, Raw stop: ₹${rawStopPrice.toFixed(2)}, Tick size: ${tickSize}, Rounded stop: ₹${stopPrice.toFixed(2)}`);
    
    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity, // Use actual quantity
      product: productType, // Use the same product type as the original buy order
      order_type: 'SL-M', // Stop Loss Market order
      trigger_price: stopPrice.toFixed(2)
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`🛑 STOP LOSS Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Stop Price: ${stopPrice.toFixed(2)}, Dynamic Stop Loss: ₹${dynamicStopLoss}, Product: ${productType})`);
      
      // 🔊 PLAY SPECIFIC AUDIO NOTIFICATION FOR STOP LOSS ORDER PLACEMENT
      playStopLossOrderAudio();
      return {
        orderId: order.order_id,
        price: stopPrice,
        quantity: quantity, // Use actual quantity
        stopLoss: dynamicStopLoss,
        productType: productType,
        orderType: 'STOP_LOSS'
      };
    }
    return null;
  } catch (err) {
    console.error(`❌ Error placing STOP LOSS order for ${symbol}: ${err.message}`);
    return null;
  }
}

// Function to place both target and stop loss orders after a successful buy
async function placeTargetAndStopLoss(symbol, quantity, buyPrice, productType = 'MIS', availableFunds) {
  try {
    // Get available funds if not provided
    if (!availableFunds) {
      const margins = await getAvailableFunds();
      availableFunds = margins?.equity?.available?.live_balance || 10000; // Fallback
    }
    
    // Calculate dynamic values for logging
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    const dynamicStopLoss = calculateStopLoss(availableFunds);
    
    console.log(`📊 Placing TARGET and STOP LOSS orders for ${symbol} - Buy Price: ${buyPrice}, Quantity: ${quantity}, Dynamic Target: ₹${dynamicProfitTarget}, Dynamic Stop Loss: ₹${dynamicStopLoss}`);
    
    const results = {
      targetOrder: null,
      stopLossOrder: null
    };
    
    // Place target order with dynamic profit target
    const targetOrder = await placeTargetOrder(symbol, quantity, buyPrice, productType, availableFunds);
    if (targetOrder) {
      results.targetOrder = targetOrder;
      console.log(`✅ Target order placed successfully for ${symbol}`);
    }
    
    // Place stop loss order with dynamic stop loss
    const stopLossOrder = await placeStopLossOrder(symbol, quantity, buyPrice, productType, availableFunds);
    if (stopLossOrder) {
      results.stopLossOrder = stopLossOrder;
      console.log(`✅ Stop loss order placed successfully for ${symbol}`);
    }
    
    // Store the order tracking info and update current position
    if (targetOrder || stopLossOrder) {
      openOrdersTracker[symbol] = {
        buyOrderId: null, // Will be set from tickListener
        buyPrice: buyPrice,
        quantity: quantity, // Use actual quantity
        targetOrderId: targetOrder?.orderId || null,
        stopLossOrderId: stopLossOrder?.orderId || null,
        productType: productType,
        timestamp: Date.now()
      };
      
      // Update current position tracker
      currentPosition = {
        symbol: symbol,
        type: 'LONG',
        quantity: quantity, // Use actual quantity
        price: buyPrice,
        timestamp: Date.now(),
        targetOrderId: targetOrder?.orderId || null,
        stopLossOrderId: stopLossOrder?.orderId || null,
        productType: productType
      };
      
      console.log(`📍 Position tracked: ${symbol} LONG ${quantity} @ ${buyPrice}`);
    }
    
    return results;
  } catch (err) {
    console.error(`❌ Error placing TARGET and STOP LOSS orders for ${symbol}: ${err.message}`);
    return { targetOrder: null, stopLossOrder: null };
  }
}

// Function to place both target and stop loss orders for SHORT positions
async function placeShortTargetAndStopLoss(symbol, quantity, sellPrice, productType = 'MIS', availableFunds) {
  try {
    // Get available funds if not provided
    if (!availableFunds) {
      const margins = await getAvailableFunds();
      availableFunds = margins?.equity?.available?.live_balance || 10000; // Fallback
    }
    
    // Calculate dynamic values
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    const dynamicStopLoss = calculateStopLoss(availableFunds);
    
    console.log(`📊 Placing SHORT TARGET and STOP LOSS orders for ${symbol} - Sell Price: ${sellPrice}, Quantity: ${quantity}, Dynamic Target: ₹${dynamicProfitTarget}, Dynamic Stop Loss: ₹${dynamicStopLoss}`);
    
    const results = {
      targetOrder: null,
      stopLossOrder: null
    };
    
    // For short positions: target = buy at lower price, stop loss = buy at higher price
    // Calculate prices per share
    const profitPerShare = dynamicProfitTarget / quantity; // Distribute dynamic profit across all shares
    const lossPerShare = dynamicStopLoss / quantity; // Distribute dynamic stop loss across all shares
    const rawTargetPrice = sellPrice - profitPerShare; // Buy back at lower price for profit
    const rawStopPrice = sellPrice + lossPerShare; // Buy back at higher price for loss
    
    // Round to appropriate tick sizes
    const targetTickSize = getTickSize(rawTargetPrice, symbol);
    const stopTickSize = getTickSize(rawStopPrice, symbol);
    const targetPrice = roundToTickSize(rawTargetPrice, targetTickSize);
    const stopPrice = roundToTickSize(rawStopPrice, stopTickSize);
    
    console.log(`💰 Short position price calculation for ${symbol}:`);
    console.log(`   Target: ₹${rawTargetPrice.toFixed(2)} → ₹${targetPrice.toFixed(2)} (tick: ${targetTickSize})`);
    console.log(`   Stop: ₹${rawStopPrice.toFixed(2)} → ₹${stopPrice.toFixed(2)} (tick: ${stopTickSize})`);
    console.log(`   Dynamic Values: Target Profit=₹${dynamicProfitTarget}, Stop Loss=₹${dynamicStopLoss}`);
    
    // Place target order (buy back at lower price for profit)
    const targetOrderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'BUY',
      quantity: quantity, // Use actual quantity
      product: productType,
      order_type: 'LIMIT',
      price: targetPrice.toFixed(2)
    };

    if (global.kite) {
      const targetOrder = await global.kite.placeOrder('regular', targetOrderParams);
      console.log(`🎯 SHORT TARGET Order placed for ${symbol}: ${targetOrder.order_id} (Qty: ${quantity}, Target Price: ${targetPrice.toFixed(2)}, Dynamic Target Profit: ₹${dynamicProfitTarget})`);
      
      // 🔊 PLAY AUDIO NOTIFICATION FOR SHORT TARGET ORDER PLACEMENT
      playTargetOrderAudio();
      
      results.targetOrder = {
        orderId: targetOrder.order_id,
        price: targetPrice,
        quantity: quantity, // Use actual quantity
        targetProfit: dynamicProfitTarget,
        productType: productType,
        orderType: 'SHORT_TARGET'
      };
    }
    
    // Place stop loss order (buy back at higher price for loss)
    const stopOrderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'BUY',
      quantity: quantity, // Use actual quantity
      product: productType,
      order_type: 'SL-M',
      trigger_price: stopPrice.toFixed(2)
    };

    if (global.kite) {
      const stopOrder = await global.kite.placeOrder('regular', stopOrderParams);
      console.log(`🛑 SHORT STOP LOSS Order placed for ${symbol}: ${stopOrder.order_id} (Qty: ${quantity}, Stop Price: ${stopPrice.toFixed(2)}, Dynamic Stop Loss: ₹${dynamicStopLoss})`);
      
      // 🔊 PLAY SPECIFIC AUDIO NOTIFICATION FOR STOP LOSS ORDER PLACEMENT
      playStopLossOrderAudio();
      
      results.stopLossOrder = {
        orderId: stopOrder.order_id,
        price: stopPrice,
        quantity: quantity, // Use actual quantity
        stopLoss: dynamicStopLoss,
        productType: productType,
        orderType: 'SHORT_STOP_LOSS'
      };
    }
    
    // Store the order tracking info and update current position
    if (results.targetOrder || results.stopLossOrder) {
      openOrdersTracker[symbol] = {
        sellOrderId: null, // Will be set from tickListener
        sellPrice: sellPrice,
        quantity: quantity, // Use actual quantity
        targetOrderId: results.targetOrder?.orderId || null,
        stopLossOrderId: results.stopLossOrder?.orderId || null,
        productType: productType,
        timestamp: Date.now()
      };
      
      // Update current position tracker
      currentPosition = {
        symbol: symbol,
        type: 'SHORT',
        quantity: quantity,
        price: sellPrice,
        timestamp: Date.now(),
        targetOrderId: results.targetOrder?.orderId || null,
        stopLossOrderId: results.stopLossOrder?.orderId || null,
        productType: productType
      };
      
      console.log(`📍 Short position tracked: ${symbol} SHORT ${quantity} @ ${sellPrice}`);
    }
    
    return results;
  } catch (err) {
    console.error(`❌ Error placing short target and stop loss orders for ${symbol}: ${err.message}`);
    return {
      targetOrder: null,
      stopLossOrder: null
    };
  }
}

// Import instruments cache utility
const { getTickSizeFromCache, getTickSizeByToken } = require('../utils/instrumentsCache');

// Function to round price to appropriate tick size
function roundToTickSize(price, tickSize = 0.05) {
  // Common tick sizes: 0.05 for most stocks, 0.10 for some stocks
  const rounded = Math.round(price / tickSize) * tickSize;
  return parseFloat(rounded.toFixed(2));
}

// Function to get tick size from cached instruments data
function getTickSize(price, symbol = '', token = null) {
  try {
    // First try to get from cached instruments data
    if (global.instrumentsCache) {
      // Try by symbol first
      if (symbol) {
        const tickSize = getTickSizeFromCache(symbol, global.instrumentsCache);
        if (tickSize && tickSize > 0 && tickSize !== 0.05) { // Only use if not default
          console.log(`📊 Using cached tick size for ${symbol}: ${tickSize}`);
          return tickSize;
        }
      }
      
      // Try by token
      if (token) {
        const tickSize = getTickSizeByToken(token, global.instrumentsCache);
        if (tickSize && tickSize > 0 && tickSize !== 0.05) { // Only use if not default
          console.log(`📊 Using cached tick size for token ${token}: ${tickSize}`);
          return tickSize;
        }
      }
    }
    
    // Fallback to static mapping for known problematic stocks
    const knownTickSizes = {
      'LTIM': 0.50,
      'GODREJIND': 0.10,
      'BHARTIARTL': 0.10,
      'NESTLEIND': 0.50,
      'ULTRACEMCO': 0.50,
      'ASIANPAINT': 0.50,
      'LICI': 0.50,
      'DIVISLAB': 0.50,
      'DRREDDY': 0.50,
      'APOLLOHOSP': 0.50,
      'BRITANNIA': 0.50,
      'PIDILITIND': 0.50
    };
    
    if (knownTickSizes[symbol]) {
      console.log(`📊 Using known tick size for ${symbol}: ${knownTickSizes[symbol]}`);
      return knownTickSizes[symbol];
    }
    
    // General NSE tick size rules based on price
    if (price <= 0) return 0.05;
    
    if (price >= 10000) {
      return 0.25; // Stocks above ₹10,000
    } else if (price >= 5000) {
      return 0.25; // Stocks between ₹5,000-₹10,000
    } else if (price >= 1000) {
      return 0.05; // Stocks between ₹1,000-₹5,000
    } else {
      return 0.05; // Default for other price ranges
    }
  } catch (error) {
    console.error(`❌ Error in getTickSize for ${symbol}: ${error.message}`);
    return 0.05; // Safe default
  }
}

// Function to place only target order for short positions (manual stop loss handling)
async function placeShortTargetOrder(symbol, quantity, sellPrice, productType = 'MIS', availableFunds) {
  try {
    // Get available funds if not provided
    if (!availableFunds) {
      const margins = await getAvailableFunds();
      availableFunds = margins?.equity?.available?.live_balance || 10000; // Fallback
    }
    
    // Calculate dynamic profit target based on available funds
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    
    console.log(`📊 Placing SHORT TARGET order for ${symbol} - Sell Price: ${sellPrice}, Quantity: ${quantity}, Dynamic Target: ₹${dynamicProfitTarget} (Stop Loss: Manual)`);
    
    const results = {
      targetOrder: null
    };
    
    // For short positions: target = buy at lower price
    // Calculate target price: sellPrice - (profit per share)
    const profitPerShare = dynamicProfitTarget / quantity; // Distribute dynamic profit across all shares
    const rawTargetPrice = sellPrice - profitPerShare; // Buy back at lower price for profit
    
    // Round to appropriate tick size for this symbol
    const tickSize = getTickSize(rawTargetPrice, symbol);
    const targetPrice = roundToTickSize(rawTargetPrice, tickSize);
    
    console.log(`💰 Price calculation for ${symbol}: Dynamic Target: ₹${dynamicProfitTarget}, Raw target: ₹${rawTargetPrice.toFixed(2)}, Tick size: ${tickSize}, Rounded target: ₹${targetPrice.toFixed(2)}`);
    
    // Place target order (buy back at lower price for profit)
    const targetOrderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'BUY',
      quantity: quantity, // Use actual quantity
      product: productType,
      order_type: 'LIMIT',
      price: targetPrice.toFixed(2)
    };

    if (global.kite) {
      const targetOrder = await global.kite.placeOrder('regular', targetOrderParams);
      console.log(`🎯 SHORT TARGET Order placed for ${symbol}: ${targetOrder.order_id} (Qty: ${quantity}, Target Price: ${targetPrice.toFixed(2)}, Dynamic Target Profit: ₹${dynamicProfitTarget})`);
      
      // 🔊 PLAY AUDIO NOTIFICATION FOR SHORT TARGET ORDER PLACEMENT
      playTargetOrderAudio();
      
      results.targetOrder = {
        orderId: targetOrder.order_id,
        price: targetPrice,
        quantity: quantity, // Use actual quantity
        targetProfit: dynamicProfitTarget,
        productType: productType,
        orderType: 'SHORT_TARGET'
      };
    }
    
    // Store the order tracking info and update current position
    if (results.targetOrder) {
      openOrdersTracker[symbol] = {
        sellOrderId: null, // Will be set from tickListener
        sellPrice: sellPrice,
        quantity: quantity, // Use actual quantity
        targetOrderId: results.targetOrder?.orderId || null,
        stopLossOrderId: null, // Manual handling
        productType: productType,
        timestamp: Date.now()
      };
      
      // Update current position tracker
      currentPosition = {
        symbol: symbol,
        type: 'SHORT',
        quantity: quantity,
        price: sellPrice,
        timestamp: Date.now(),
        targetOrderId: results.targetOrder?.orderId || null,
        stopLossOrderId: null, // Manual handling
        productType: productType
      };
      
      console.log(`📍 Short position tracked: ${symbol} SHORT ${quantity} @ ${sellPrice} (Manual stop loss)`);
    }
    
    return results;
  } catch (err) {
    console.error(`❌ Error placing short target order for ${symbol}: ${err.message}`);
    return {
      targetOrder: null
    };
  }
}

// Legacy function for backward compatibility
function placeOrder(symbol) {
  if (isInCooldown(symbol)) {
    console.log(`⏳ Skipped ${symbol} — in cooldown.`);
    return;
  }

  console.log(`✅ Trade Executed for ${symbol}`);
  cooldownTracker[symbol] = { orderType: 'GENERIC', timestamp: Date.now() };

  // await global.kite.placeOrder(...)  // real API call here
}

// Function to reset position tracker when position is closed
function resetPosition(symbol) {
  try {
    if (currentPosition && currentPosition.symbol === symbol) {
      console.log(`🔄 Resetting position for ${symbol}: ${currentPosition.type} ${currentPosition.quantity} @ ${currentPosition.price}`);
      currentPosition = null;
    }
    
    // Also clean up order tracker
    if (openOrdersTracker[symbol]) {
      delete openOrdersTracker[symbol];
    }
    
    console.log(`✅ Position reset completed for ${symbol}`);
  } catch (err) {
    console.error(`❌ Error resetting position for ${symbol}: ${err.message}`);
  }
}

// Function to get current position status
function getCurrentPosition() {
  return currentPosition;
}

// Function to check if any position exists
function hasCurrentPosition() {
  return currentPosition !== null;
}

/**
 * Analyze all subscribed tokens and place sell order for the one with smallest body percentage
 * @param {Array} tokenList - Array of {token, symbol} objects
 * @returns {Promise<void>}
 */
async function analyzeAndPlaceSellOrder(tokenList) {
  try {
    // Find token with smallest body percentage (using SELL scan logic)
    const selectedToken = await findSmallestBodyToken(tokenList, 'SELL');
    
    if (!selectedToken) {
      console.log(`❌ No token selected for trading - analysis failed`);
      return;
    }
    
    console.log(`✅ STOCK: ${selectedToken.symbol}, REASON: ${selectedToken.reason}`);
    
    // Place sell order for the selected token
    await placeSellOrder(selectedToken.token, selectedToken.symbol, selectedToken.ltp);
    
  } catch (error) {
    console.error(`❌ Error in token analysis and order placement: ${error.message}`);
  }
}

/**
 * SIMPLIFIED: Place sell order immediately upon subscription (no indicator calculations)
 * @param {string|number} token - instrument token
 * @param {string} symbol - trading symbol
 * @returns {Promise<void>}
 */
async function checkAndSellOnSubscription(token, symbol) {
  try {
    console.log(`� IMMEDIATE SELL for ${symbol} - NO CONDITIONS CHECK`);
    
    // Get current LTP from WebSocket or use a default value
    const ltp = global.currentLTP || 100; // Use current LTP from WebSocket data
    
    // COMMENTED OUT - All indicator calculations and conditions
    // const indicators = getLiveIndicatorsFromCache(token);
    // if (!indicators) {
    //   console.log(`⚠️ No indicators available for ${symbol} from cache`);
    //   return;
    // }
    // 
    // const { rsi, ema9, ema21, vwap, ltp, totalCandles, todayCandles, rsiArray, hourlyEMA9, hourlyVWAP, currentHourOpen } = indicators;
    // 
    // console.log(`📊 ${symbol} Enhanced Cache Indicators (${totalCandles} total, ${todayCandles} today):`);
    // console.log(`   1M: RSI=${rsi?.toFixed(2)}, EMA9=${ema9?.toFixed(2)}, EMA21=${ema21?.toFixed(2)}, VWAP=${vwap?.toFixed(2)}, LTP=${ltp}`);
    // console.log(`   1H: EMA9=${hourlyEMA9?.toFixed(2)}, VWAP=${hourlyVWAP?.toFixed(2)}, HourOpen=${currentHourOpen?.toFixed(2)}`);
    // 
    // // NEW MULTI-TIMEFRAME SELL CONDITIONS - Calculate first
    // 
    // // 1-hour timeframe condition: Only check 1H Open > 1H VWAP
    // const hourly1hOpenAboveVWAP = currentHourOpen && hourlyVWAP ? 
    //   currentHourOpen > hourlyVWAP : false;
    // const hourlyCondition = hourly1hOpenAboveVWAP;
    // 
    // // 1-minute timeframe conditions
    // const minuteEMA9BelowVWAP = ema9 && vwap ? ema9 < vwap : false;
    // 
    // // RSI safety check - none of last 10 RSI values should be < 40
    // const rsiSafetyCheck = (() => {
    //   if (!rsiArray || rsiArray.length < 10) return false;
    //   const last10RSI = rsiArray.slice(-10);
    //   return !last10RSI.some(rsi => rsi < 40); // Return true if NO RSI < 40
    // })();
    // 
    // // Final sell condition: All must be true
    // const sellCondition = hourlyCondition && minuteEMA9BelowVWAP && rsiSafetyCheck;
    
    // SIMPLIFIED - Always place sell order (no conditions)
    const sellCondition = true;
    
    // Broadcast simple update for UI (no indicators)
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: "simplified_strategy_update",
        data: {
          token,
          symbol,
          ltp: ltp,
          sellCondition: sellCondition,
          timestamp: new Date().toISOString(),
          source: "orderManager_immediate_sell"
        }
      });
    }
    
    // IMMEDIATE SELL ORDER - No conditions check
    if (sellCondition) {
      console.log(`✅ IMMEDIATE SELL ORDER for ${symbol} - NO CONDITIONS REQUIRED`);
      
      // Place sell order immediately
      await placeSellOrder(token, symbol, ltp);
    }
  } catch (err) {
    console.error(`❌ Error in immediate sell for ${symbol}: ${err.message}`);
  }
}

// COMMENTED OUT - Check buy conditions and place buy order if conditions are met
// /**
//  * Check buy conditions and place buy order if conditions are met
//  * @param {string|number} token - instrument token
//  * @param {string} symbol - trading symbol
//  * @param {number} ltp - last traded price
//  * @returns {Promise<void>}
//  */
// async function checkAndBuyOnSubscription(token, symbol, ltp) {
//   try {
//     console.log(`🔍 Checking BUY conditions for ${symbol} at LTP: ${ltp}`);
//     
//     // Check if symbol has been traded today (prevent re-trading)
//     const hasBeenTraded = await hasSymbolBeenTraded(symbol);
//     if (hasBeenTraded) {
//       console.log(`🚫 Symbol ${symbol} has already been traded today, skipping BUY order`);
//       return null;
//     }
//
//     // Get appropriate product type based on current time
//     const productType = getProductType();
//     console.log(`📊 Using product type: ${productType} for BUY order on ${symbol}`);
//
//     // Check if ANY MIS positions exist (only relevant for MIS orders)
//     if (productType === 'MIS') {
//       const hasPosition = await hasAnyPosition();
//       if (hasPosition) {
//         console.log(`📊 Existing MIS positions found, skipping BUY order for ${symbol}`);
//         return null;
//       }
//     }
//
//     // Check cooldown
//     if (isCooldownActive(symbol)) {
//       console.log(`⏳ Cooldown active for ${symbol}, skipping BUY order`);
//       return null;
//     }
//
//     // Check if a recent order exists for this symbol
//     if (hasRecentOrder(symbol, 'BUY')) {
//       console.log(`📝 Recent BUY order exists for ${symbol}, skipping`);
//       return null;
//     }
//
//     // Calculate quantity based on available funds
//     const { quantity, availableFunds } = await calculateQuantity(ltp, productType);
//     if (quantity <= 0) {
//       console.log(`💰 Insufficient funds for BUY order on ${symbol} (Available: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);
//       return null;
//     }
//
//     console.log(`💹 Placing BUY order for ${symbol}: ${quantity} shares (Available funds: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);
//
//     // Place the buy order
//     const orderReason = "New Strategy Buy Order - Multi-timeframe Conditions Met";
//     const order = await placeOrder(token, "BUY", quantity, ltp, productType, orderReason, symbol);
//     
//     if (order && order.order_id) {
//       console.log(`✅ BUY Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType}) - ${orderReason}`);
//       
//       // Update cooldown tracker
//       const now = Date.now();
//       if (!cooldownTracker[symbol]) cooldownTracker[symbol] = {};
//       cooldownTracker[symbol].lastOrderTime = now;
//       cooldownTracker[symbol].lastBuyOrder = now;
//       
//       // Add to traded symbols cache
//       tradedSymbolsCache.add(symbol);
//       
//       // Track open order for potential exit strategies
//       openOrdersTracker[symbol] = {
//         orderId: order.order_id,
//         quantity: quantity,
//         price: ltp,
//         productType: productType,
//         side: 'BUY',
//         timestamp: now,
//         exitOrderId: null
//       };
//       
//       // Broadcast order to UI if available
//       if (global.broadcastToClients) {
//         console.log(`📡 Broadcasting BUY order for ${symbol}`);
//         
//         // Generate chart URL for UI
//         const chartURL = generateKiteChartURL(symbol, token);
//         
//         global.broadcastToClients({
//           type: "new_buy_order",
//           data: {
//             symbol: symbol,
//             token: token,
//             side: "BUY",
//             quantity: quantity,
//             price: ltp,
//             orderId: order.order_id,
//             productType: productType,
//             timestamp: new Date().toISOString(),
//             reason: `New Strategy Buy Order (${productType})`,
//             availableFunds: availableFunds,
//             chartURL: chartURL, // Add chart URL for UI to open
//             openChart: true // Flag to indicate UI should open chart
//           }
//         });
//       }
//       
//       return order;
//     } else {
//       console.log(`❌ Failed to place BUY order for ${symbol}`);
//       return null;
//     }
//   } catch (err) {
//     console.error(`❌ Error placing BUY order for ${symbol}: ${err.message}`);
//     return null;
//   }
// }

/**
 * Determine order type based on filename
 * @param {string} filename - CSV filename
 * @returns {string} - "BUY" or "SELL" or "UNKNOWN"
 */
function determineOrderTypeFromFilename(filename) {
  const lowerFilename = filename.toLowerCase();
  
  if (lowerFilename.includes('buy')) {
    return 'BUY';
  } else if (lowerFilename.includes('sell')) {
    return 'SELL';
  } else {
    return 'UNKNOWN';
  }
}

/**
 * Place order based on scan file type and candle body analysis
 * @param {Array} tokenList - Array of {token, symbol} objects
 * @param {string} filename - CSV filename to determine order type
 * @returns {Promise<void>}
 */
async function placeOrderBasedOnScanType(tokenList, filename) {
  try {
    // Validate filename parameter
    if (!filename || typeof filename !== 'string') {
      console.log(`❌ Invalid or missing filename parameter: ${filename}`);
      console.log(`🔄 Falling back to generic SELL order placement`);
      await analyzeAndPlaceSellOrder(tokenList);
      return;
    }
    
    const orderType = determineOrderTypeFromFilename(filename);
    console.log(`\n� ===== SCAN FILE ANALYSIS =====`);
    console.log(`📄 Scan file: ${filename}`);
    console.log(`🎯 Detected order type: ${orderType}`);
    console.log(`📊 Number of tokens in scan: ${tokenList.length}`);
    
    if (orderType === 'UNKNOWN') {
      console.log(`❌ Cannot determine order type from filename: ${filename}`);
      console.log(`💡 Filename should contain 'buy' or 'sell' to determine order type`);
      return;
    }
    
    console.log(`\n🔍 ===== MOVEMENT ANALYSIS =====`);
    if (orderType === 'BUY') {
      console.log(`📈 BUY SCAN: Select stock with minimum upward movement`);
      console.log(`💡 Logic: Among rising stocks, pick the one with smallest gain for safer entry`);
    } else if (orderType === 'SELL') {
      console.log(`📉 SELL SCAN: Select stock with minimum downward movement`);
      console.log(`💡 Logic: Among declining stocks, pick the one with smallest loss for better short entry`);
    }
    
    // Find token based on scan type-specific logic
    const selectedToken = await findSmallestBodyToken(tokenList, orderType);
    
    if (!selectedToken) {
      console.log(`❌ No token selected for trading - analysis failed for ${filename}`);
      return;
    }
    
    console.log(`\n🎯 ===== FINAL DECISION =====`);
    console.log(`✅ SELECTED STOCK: ${selectedToken.symbol}`);
    console.log(`📊 SELECTION REASON: selectedToken.reason`);
    console.log(`📋 ORDER TYPE: ${orderType} (based on filename: ${filename})`);
    console.log(`💰 ENTRY PRICE: ₹${selectedToken.ltp.toFixed(2)}`);
    console.log(`📈 CANDLE DATA: Open=₹${selectedToken.open.toFixed(2)}, Close=₹${selectedToken.close.toFixed(2)}`);
    
    // Place order based on scan type
    if (orderType === 'BUY') {
      console.log(`\n🟢 ===== PLACING BUY ORDER =====`);
      await placeBuyOrder(selectedToken.token, selectedToken.symbol, selectedToken.ltp);
    } else if (orderType === 'SELL') {
      console.log(`\n🔴 ===== PLACING SELL ORDER =====`);
      await placeSellOrder(selectedToken.token, selectedToken.symbol, selectedToken.ltp);
    }
    
  } catch (error) {
    console.error(`❌ Error in scan-based order placement: ${error.message}`);
  }
}

/**
 * SIMPLIFIED BUY ORDER - Place buy order immediately upon subscription
 * @param {string|number} token - instrument token
 * @param {string} symbol - trading symbol
 * @param {number} ltp - current LTP
 * @returns {Promise<void>}
 */
async function placeBuyOrder(token, symbol, ltp) {
  try {
    console.log(`🟢 IMMEDIATE BUY ORDER for ${symbol} at LTP: ${ltp} (NO CONDITIONS CHECK)`);
    
    // 🚫 CRITICAL CHECK: Don't place new position orders if we already have a position
    const canPlace = await canPlaceNewPosition(symbol);
    if (!canPlace.allowed) {
      console.log(`🚫 BLOCKED: Cannot place new BUY order for ${symbol} - ${canPlace.reason}`);
      playOrderBlockedAudio(`Cannot place buy order for ${symbol}. ${canPlace.reason}`);
      return null;
    }
    
    // Get appropriate product type based on current time
    const productType = getProductType();
    console.log(`📊 Using product type: ${productType} for ${symbol}`);

    // Check cooldowns
    if (isInCooldown(symbol)) {
      console.log(`⏳ Cooldown active for ${symbol}, skipping BUY order`);
      return null;
    }

    if (isSameOrderInCooldown(symbol, 'BUY')) {
      console.log(`� Recent BUY order exists for ${symbol}, skipping`);
      return null;
    }

    // Get available funds and calculate quantity
    const margins = await getAvailableFunds();
    if (!margins || !margins.equity) {
      console.log(`❌ Could not fetch available funds for ${symbol}`);
      return null;
    }

    const availableFunds = margins.equity.available.live_balance;
    let quantity = Math.floor(calculateQuantity(availableFunds, ltp));
    
    // Validate quantity - NO MINIMUM QUANTITY ENFORCEMENT
    if (quantity < 1) {
      console.log(`❌ Insufficient leveraged funds to buy even 1 share of ${symbol} at ₹${ltp}`);
      console.log(`💰 Available funds: ₹${availableFunds}, Required for 1 share: ₹${ltp}`);
      return null;
    }
    
    // Additional validation for order placement
    if (!quantity || quantity === 0 || isNaN(quantity)) {
      console.log(`❌ Invalid quantity calculated for ${symbol}: ${quantity}`);
      console.log(`Debug: availableFunds=${availableFunds}, ltp=${ltp}, productType=${productType}`);
      return null;
    }
    
    // Calculate dynamic profit and stop loss for order description
    const dynamicProfitTarget = calculateProfitTarget(availableFunds);
    const dynamicStopLoss = calculateStopLoss(availableFunds);
    
    let orderReason = `IMMEDIATE Buy Order (${productType}) - Target: ₹${dynamicProfitTarget} (0.25%), Stop Loss: ₹${dynamicStopLoss} (0.125%)`;

    console.log(`� Placing IMMEDIATE buy order for ${symbol}: ${quantity} shares (Available funds: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);
    console.log(`🎯 Dynamic Risk Management: Target=₹${dynamicProfitTarget} (0.25% of usable funds), Stop Loss=₹${dynamicStopLoss} (0.125% of usable funds)`);

    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'BUY',
      quantity: quantity,
      product: productType,
      order_type: 'MARKET'
    };
    
    // Final validation before API call
    console.log(`� Order validation: Symbol=${orderParams.tradingsymbol}, Quantity=${orderParams.quantity}, Type=${orderParams.transaction_type}, Product=${orderParams.product}`);
    
    if (!orderParams.quantity || orderParams.quantity <= 0) {
      console.log(`❌ CRITICAL: Order quantity is invalid: ${orderParams.quantity}`);
      return null;
    }

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`✅ IMMEDIATE BUY Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType}) - ${orderReason}`);
      
      // 🔊 PLAY AUDIO NOTIFICATION FOR ORDER PLACEMENT
      playOrderPlacedAudio();
      
      // Track the order
      cooldownTracker[symbol] = { 
        orderType: 'BUY', 
        timestamp: Date.now(), 
        orderId: order.order_id,
        quantity: quantity,
        reason: orderReason,
        productType: productType
      };
      
      // Clear position cache to force refresh
      positionsCache = null;
      lastPositionsFetch = 0;
      
      // Automatically place target AND stop loss orders
      console.log(`🎯 Auto-placing TARGET and STOP LOSS orders for LONG position ${symbol} (Dynamic Stop Loss based on 0.125% of usable funds)`);
      setTimeout(async () => {
        try {
          const exitOrders = await placeTargetAndStopLoss(symbol, quantity, ltp, productType, availableFunds);
          if (exitOrders) {
            console.log(`✅ TARGET and STOP LOSS orders placed for ${symbol} - Automatic risk management enabled`);
          }
        } catch (error) {
          console.error(`❌ Error placing TARGET and STOP LOSS orders for ${symbol}: ${error.message}`);
        }
      }, 2000); // 2 second delay to ensure buy order is processed
      
      // Broadcast order notification
      if (global.broadcastToClients) {
        // Generate chart URL for UI
        const chartURL = generateKiteChartURL(symbol, token);
        
        global.broadcastToClients({
          type: "order_placed",
          data: {
            token,
            symbol,
            orderType: 'BUY',
            price: ltp,
            quantity: quantity,
            orderId: order.order_id,
            productType: productType,
            reason: orderReason,
            time: new Date().toLocaleTimeString(),
            chartURL: chartURL,
            openChart: true
          }
        });
      }
      
      return order;
    }
  } catch (err) {
    console.error(`❌ Error placing IMMEDIATE BUY order for ${symbol}: ${err.message}`);
    return null;
  }
}

module.exports = {
  placeOrder,
  placeBuyOrder, // NEW - BUY order function for buy scan files
  placeSellOrder, // IMMEDIATE Short selling function (sell first, buy back later)
  placeExitOrder,
  placeTargetOrder,
  placeStopLossOrder,
  placeTargetAndStopLoss,
  placeShortTargetAndStopLoss,
  placeShortTargetOrder, // Target-only function for short positions
  hasSymbolBeenTraded,
  canPlaceNewPosition,
  resetPosition,
  getCurrentPosition,
  hasCurrentPosition,
  generateKiteChartURL,
  cooldownTracker,
  openOrdersTracker,
  getPositions,
  getAvailableFunds,
  calculateQuantity, // KEEP - Uses 4.5x leverage calculation
  isMISTimeOver,
  getProductType,
  checkAndSellOnSubscription, // IMMEDIATE sell orders (no conditions)
  // checkAndBuyOnSubscription, // COMMENTED OUT - Buy order conditions
  getLiveIndicatorsFromCache, // Simplified - no calculations
  shouldEvaluateTradingConditions, // Simplified - always returns true
  getHistoricalDataBatch, // NEW - Efficient batch historical data fetching
  analyzeCandleBodyFromData, // NEW - Analyze candle body from already fetched data
  findSmallestBodyToken, // NEW - Find token with smallest body percentage (uses batch approach)
  analyzeAndPlaceSellOrder, // NEW - Analyze all tokens and place order for smallest body
  placeOrderBasedOnScanType, // NEW - Place order based on scan file type (buy/sell)
  determineOrderTypeFromFilename, // NEW - Determine order type from filename
  // Audio and timer functions
  playOrderPlacedAudio, // Audio notification when order is placed
  playWaitingForOrderAudio, // Audio notification when waiting for order
  playOrderBlockedAudio, // Audio notification when order is blocked
  playTargetOrderAudio, // Specific audio for target order placement
  playStopLossOrderAudio, // Specific audio for stop loss order placement
  startWaitingTimer, // Start the waiting timer
  resetWaitingTimer, // Reset the waiting timer (called when order placed)
  stopWaitingTimer, // Stop the waiting timer
  // isNewServerSession: require("../cache/sharedCache").isNewServerSession, // COMMENTED OUT
  // markServerInitialized: require("../cache/sharedCache").markServerInitialized // COMMENTED OUT
};
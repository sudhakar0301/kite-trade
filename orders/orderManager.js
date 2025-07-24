const cooldownTracker = {};
const ORDER_COOLDOWN_MS = 60000; // 1 minute cooldown between orders for same symbol
const SAME_ORDER_COOLDOWN_MS = 300000; // 5 minute cooldown for same order type

// Import ADX calculation functions
const { getLatestADXData } = require("../strategy/indicators");
const { getHistoricalData } = require("../strategy/scanner");
const { from15, to15, fromToday, to1 } = require("../utils/fromAndToDate");
const { calculateRSIArray, calculateVWAP, calculateEMA, calculateRSI } = require("../strategy/indicators");

// MIS trading window configuration
const MIS_CUTOFF_TIME = { hours: 15, minutes: 15 }; // 3:15 PM - standard MIS cutoff

// Track open orders and their exit orders
const openOrdersTracker = {}; // { symbol: { orderId, quantity, price, exitOrderId, timestamp } }
const PROFIT_TARGET = 10000; // Fixed profit target of 10,000

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

// Import enhanced candle cache from shared cache module
const { candleCache } = require("../cache/sharedCache");
const { ema } = require("technicalindicators");

// Function to get live indicators from enhanced candle cache
function getLiveIndicatorsFromCache(token) {
  try {
    const cache = candleCache.get(token);
    if (!cache || !cache.historical || cache.historical.length < 50) {
      console.log(`⚠️ Insufficient cache data for token ${token} (${cache?.historical?.length || 0} historical candles)`);
      return null;
    }

    // Combine historical + current candle for indicator calculation
    const allCandles = [...cache.historical];
    if (cache.current) {
      allCandles.push(cache.current);
    }

    if (allCandles.length < 100) {
      console.log(`⚠️ Insufficient total candles for indicators for token ${token} (${allCandles.length} total)`);
      return null;
    }

    // Get today's candles for VWAP using dedicated today's historical data
    let vwapCandles = [];
    
    // Use today's historical data if available
    if (cache.todaysHistorical && cache.todaysHistorical.length > 0) {
      vwapCandles = [...cache.todaysHistorical];
      console.log(`📅 OrderManager: Using ${cache.todaysHistorical.length} today's historical candles for VWAP`);
    } else {
      // Fallback: Filter from all candles for today's data
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStart = today.getTime();
      
      vwapCandles = allCandles.filter(c => {
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
      console.log(`⚠️ OrderManager Fallback: Filtered ${vwapCandles.length} today's candles from all data`);
    }
    
    // Add current forming candle if exists
    if (cache.current) {
      vwapCandles.push(cache.current);
    }

    // Extract data arrays
    const closes = allCandles.map(c => c.close);
    const todayHighs = vwapCandles.map(c => c.high);
    const todayLows = vwapCandles.map(c => c.low);
    const todayCloses = vwapCandles.map(c => c.close);
    const todayVolumes = vwapCandles.map(c => c.volume || 0);

    // Calculate indicators
    const rsiArr = calculateRSIArray(closes, 14);
    const rsi = rsiArr?.length ? rsiArr[rsiArr.length - 1] : null;
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    
    // Calculate VWAP using today's data (or all data if no today data)
    const vwapArr = calculateVWAP(todayHighs, todayLows, todayCloses, todayVolumes);
    const vwap = vwapArr?.length ? vwapArr[vwapArr.length - 1] : null;
    const currentPrice = cache.ltp || cache.current?.close || closes[closes.length - 1];

    return {
      rsi,
      rsiArray: rsiArr?.slice(-10) || [],
      ema9,
      ema21,
      vwap,
      
      // Add hourly indicators from cache
      hourlyEMA9: cache.hourlyEMA9,
      hourlyVWAP: cache.hourlyVWAP,
      currentHourOpen: cache.currentHourOpen,
      
      ltp: currentPrice,
      totalCandles: allCandles.length,
      todayCandles: vwapCandles.length,
      symbol: cache.symbol
    };
  } catch (error) {
    console.error(`❌ Error getting live indicators from cache for token ${token}:`, error.message);
    return null;
  }
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

async function placeBuyOrder(orderData) {
 // console.log(orderData);

 const { symbol, price, token } = orderData;
 
 console.log(`🔍 placeBuyOrder called with token: ${token}, symbol: ${symbol}, price: ${price}`);

  try {
    // Check if symbol has been traded today (prevent re-trading)
    const hasBeenTraded = await hasSymbolBeenTraded(symbol);
    if (hasBeenTraded) {
      console.log(`🚫 Symbol ${symbol} has already been traded today, skipping BUY order`);
      return null;
    }

    // ADX conditions already validated in tickListener before calling this function
    // No need for double validation

    // Get appropriate product type based on current time
    const productType = getProductType();
    console.log(`📊 Using product type: ${productType} for ${symbol}`);

    // Check if ANY MIS positions exist (only relevant for MIS orders)
    if (productType === 'MIS') {
      const hasPosition = await hasAnyPosition();
      if (hasPosition) {
        console.log(`📊 Existing MIS positions found, skipping BUY order for ${symbol}`);
        return null;
      }
    }

    // Get available funds and calculate quantity
    const margins = await getAvailableFunds();
    if (!margins || !margins.equity) {
      console.log(`❌ Could not fetch available funds for ${symbol}`);
      return null;
    }

    const availableFunds = margins.equity.available.live_balance;
    const quantity = Math.floor(calculateQuantity(availableFunds, price));

    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'BUY',
      quantity: quantity,
      product: productType, // Use calculated product type
      order_type: 'MARKET'
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`✅ BUY Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType})`);
      
      // Track the order for exit order placement
      cooldownTracker[symbol] = { 
        orderType: 'BUY', 
        timestamp: Date.now(), 
        orderId: order.order_id,
        quantity: quantity,
        price: price,
        productType: productType // Use calculated product type
      };
      
      // Clear position cache
      positionsCache = null;
      lastPositionsFetch = 0;
      
      // Broadcast order notification
      if (global.broadcastToClients) {
        console.log(`📡 Broadcasting BUY order for ${symbol}`);
        global.broadcastToClients({
          type: "order_placed",
          data: {
            token,
            symbol,
            orderType: 'BUY',
            price: price,
            quantity: quantity, // Use calculated quantity, not hardcoded 1
            orderId: order.order_id,
            productType: productType,
            reason: `New Strategy Buy Order (${productType})`,
            time: new Date().toLocaleTimeString()
          }
        });
      } else {
        console.warn(`⚠️ global.broadcastToClients not available for ${symbol}`);
      }
      
      return order;
    }
  } catch (err) {
    console.error(`❌ Error placing BUY order for ${symbol}: ${err.message}`);
    return null;
  }
}

async function placeSellOrder(token, symbol, ltp) {
  try {
    // Check if symbol has been traded today (prevent re-trading)
    const hasBeenTraded = await hasSymbolBeenTraded(symbol);
    if (hasBeenTraded) {
      console.log(`🚫 Symbol ${symbol} has already been traded today, skipping SELL order`);
      return null;
    }

    // ADX conditions already validated in tickListener before calling this function
    // No need for double validation

    // Get appropriate product type based on current time
    const productType = getProductType();
    console.log(`📊 Using product type: ${productType} for ${symbol}`);

    // Check if ANY MIS positions exist (only relevant for MIS orders)
    if (productType === 'MIS') {
      const positionExists = await hasAnyPosition();
      if (positionExists) {
        console.log(`📊 Existing MIS positions found, skipping SELL order for ${symbol}`);
        return null;
      }
    }

    // Check cooldowns
    if (isInCooldown(symbol)) {
      console.log(`⏳ Cooldown active for ${symbol}, skipping SELL order`);
      return null;
    }

    if (isSameOrderInCooldown(symbol, 'SELL')) {
      console.log(`📝 Recent SELL order exists for ${symbol}, skipping`);
      return null;
    }

    // Check if we have existing positions
    // Since we already checked for any positions above, this is for calculating quantity only
    const margins = await getAvailableFunds();
     if (!margins || !margins.equity) {
      console.log(`❌ Could not fetch available funds for ${symbol}`);
      return null;
    }

    const availableFunds = margins.equity.available.live_balance;
    let quantity = Math.floor(calculateQuantity(availableFunds, ltp));
    let orderReason = `Short Sell New Position (${productType})`;

    console.log(`💹 Placing short sell order for ${symbol}: ${quantity} shares (Available funds: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);

    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity,
      product: 'MIS', // Use calculated product type
      order_type: 'MARKET'
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`✅ SELL Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType}) - ${orderReason}`);
      
      // Track the order
      cooldownTracker[symbol] = { 
        orderType: 'SELL', 
        timestamp: Date.now(), 
        orderId: order.order_id,
        quantity: quantity, // Use calculated quantity, not hardcoded 1
        reason: orderReason,
        productType: productType
      };
      
      // Clear position cache to force refresh
      positionsCache = null;
      lastPositionsFetch = 0;
      
      // Broadcast order notification
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: "order_placed",
          data: {
            token,
            symbol,
            orderType: 'SELL',
            price: ltp,
            quantity: quantity,
            orderId: order.order_id,
            productType: productType,
            reason: orderReason,
            time: new Date().toLocaleTimeString()
          }
        });
      }
      
      return order;
    }
  } catch (err) {
    console.error(`❌ Error placing SELL order for ${symbol}: ${err.message}`);
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
    // For intraday trading, use 4.5x leverage
    // Use 80% of leveraged funds to leave buffer for brokerage and margin
    const leveragedFunds = availableFunds * 4.5;
   // const usableFunds = leveragedFunds * 0.8;
    let quantity = Math.floor(leveragedFunds / price);

    // Ensure minimum quantity of 1
    if (quantity < 1) quantity = 1;
    
    console.log(`💰 Quantity calculation: Available: ₹${availableFunds}, Leveraged (4.5x): ₹${leveragedFunds.toFixed(2)}, Usable (80%): ₹${leveragedFunds.toFixed(2)}, Price: ₹${price}, Calculated Qty: ${quantity}`);
    
    return quantity;
  } catch (err) {
    console.error(`❌ Error calculating quantity: ${err.message}`);
    return quantity; // Default to 1 share
  }
}

// Function to place exit order with profit target
async function placeExitOrder(symbol, quantity, buyPrice, productType = 'MIS') {
  try {
    const exitPrice = buyPrice + (PROFIT_TARGET / quantity); // Calculate exit price for 10,000 profit
    
    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity,
      product: productType, // Use the same product type as the original buy order
      order_type: 'LIMIT',
      price: exitPrice.toFixed(2)
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`🎯 EXIT Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Exit Price: ${exitPrice.toFixed(2)}, Target Profit: ₹${PROFIT_TARGET}, Product: ${productType})`);
      
      return {
        orderId: order.order_id,
        exitPrice: exitPrice,
        quantity: quantity,
        targetProfit: PROFIT_TARGET,
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
async function placeTargetOrder(symbol, quantity, buyPrice, productType = 'MIS') {
  try {
    const targetPrice = buyPrice + (PROFIT_TARGET / quantity); // Calculate target price for 10,000 profit
    
    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity,
      product: productType, // Use the same product type as the original buy order
      order_type: 'LIMIT',
      price: targetPrice.toFixed(2)
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`🎯 TARGET Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Target Price: ${targetPrice.toFixed(2)}, Target Profit: ₹${PROFIT_TARGET}, Product: ${productType})`);
      
      return {
        orderId: order.order_id,
        price: targetPrice,
        quantity: quantity,
        targetProfit: PROFIT_TARGET,
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

// Function to place stop loss order
async function placeStopLossOrder(symbol, quantity, stopPrice, productType = 'MIS') {
  try {
    const orderParams = {
      exchange: 'NSE',
      tradingsymbol: symbol,
      transaction_type: 'SELL',
      quantity: quantity,
      product: productType, // Use the same product type as the original buy order
      order_type: 'SL-M', // Stop Loss Market order
      trigger_price: stopPrice.toFixed(2)
    };

    if (global.kite) {
      const order = await global.kite.placeOrder('regular', orderParams);
      console.log(`🛑 STOP LOSS Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Stop Price: ${stopPrice.toFixed(2)}, Product: ${productType})`);
      
      return {
        orderId: order.order_id,
        price: stopPrice,
        quantity: quantity,
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
async function placeTargetAndStopLoss(symbol, quantity, buyPrice, vwap1m, productType = 'MIS') {
  try {
    console.log(`📊 Placing TARGET and STOP LOSS orders for ${symbol} - Buy Price: ${buyPrice}, VWAP1m: ${vwap1m}, Quantity: ${quantity}`);
    
    const results = {
      targetOrder: null,
      stopLossOrder: null
    };
    
    // Place target order (profit of 10,000)
    const targetOrder = await placeTargetOrder(symbol, quantity, buyPrice, productType);
    if (targetOrder) {
      results.targetOrder = targetOrder;
      console.log(`✅ Target order placed successfully for ${symbol}`);
    }
    
    // Place stop loss order (if LTP goes below VWAP1m)
    const stopLossOrder = await placeStopLossOrder(symbol, quantity, vwap1m, productType);
    if (stopLossOrder) {
      results.stopLossOrder = stopLossOrder;
      console.log(`✅ Stop loss order placed successfully for ${symbol}`);
    }
    
    // Store the order tracking info
    if (targetOrder || stopLossOrder) {
      openOrdersTracker[symbol] = {
        buyOrderId: null, // Will be set from tickListener
        buyPrice: buyPrice,
        quantity: quantity,
        vwap1m: vwap1m,
        targetOrderId: targetOrder?.orderId || null,
        stopLossOrderId: stopLossOrder?.orderId || null,
        productType: productType,
        timestamp: Date.now()
      };
    }
    
    return results;
  } catch (err) {
    console.error(`❌ Error placing TARGET and STOP LOSS orders for ${symbol}: ${err.message}`);
    return { targetOrder: null, stopLossOrder: null };
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

/**
 * Calculate indicators and place sell order if conditions met using enhanced candle cache
 * @param {string|number} token - instrument token
 * @param {string} symbol - trading symbol
 * @returns {Promise<void>}
 */
async function checkAndSellOnSubscription(token, symbol) {
  try {
    console.log(`� Checking ${symbol} using enhanced candle cache...`);
    
    // Get live indicators from enhanced candle cache
    const indicators = getLiveIndicatorsFromCache(token);
    if (!indicators) {
      console.log(`⚠️ No indicators available for ${symbol} from cache`);
      return;
    }
    
    const { rsi, ema9, ema21, vwap, ltp, totalCandles, todayCandles, rsiArray, hourlyEMA9, hourlyVWAP, currentHourOpen } = indicators;
    
    console.log(`📊 ${symbol} Enhanced Cache Indicators (${totalCandles} total, ${todayCandles} today):`);
    console.log(`   1M: RSI=${rsi?.toFixed(2)}, EMA9=${ema9?.toFixed(2)}, EMA21=${ema21?.toFixed(2)}, VWAP=${vwap?.toFixed(2)}, LTP=${ltp}`);
    console.log(`   1H: EMA9=${hourlyEMA9?.toFixed(2)}, VWAP=${hourlyVWAP?.toFixed(2)}, HourOpen=${currentHourOpen?.toFixed(2)}`);
    
    // NEW MULTI-TIMEFRAME SELL CONDITIONS - Calculate first
    
    // 1-hour timeframe condition: Only check 1H Open > 1H VWAP
    const hourly1hOpenAboveVWAP = currentHourOpen && hourlyVWAP ? 
      currentHourOpen > hourlyVWAP : false;
    const hourlyCondition = hourly1hOpenAboveVWAP;
    
    // 1-minute timeframe conditions
    const minuteEMA9BelowVWAP = ema9 && vwap ? ema9 < vwap : false;
    
    // RSI safety check - none of last 10 RSI values should be < 40
    const rsiSafetyCheck = (() => {
      if (!rsiArray || rsiArray.length < 10) return false;
      const last10RSI = rsiArray.slice(-10);
      return !last10RSI.some(rsi => rsi < 40); // Return true if NO RSI < 40
    })();
    
    // Final sell condition: All must be true
    const sellCondition = hourlyCondition && minuteEMA9BelowVWAP && rsiSafetyCheck;
    
    // Broadcast comprehensive indicator values for UI
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: "simplified_strategy_update",
        data: {
          token,
          symbol,
          ltp: ltp,
          rsi1m: rsi,
          rsiArray: rsiArray || [],
          ema9_1m: ema9,
          ema21_1m: ema21,
          vwap1m: vwap,
          
          // Add hourly indicators to broadcast
          hourlyEMA9: hourlyEMA9,
          hourlyVWAP: hourlyVWAP,
          currentHourOpen: currentHourOpen,
          
          // Add individual condition flags for UI table
          hourly1hOpenAboveVWAP: hourly1hOpenAboveVWAP,
          hourlyCondition: hourlyCondition,
          minuteEMA9BelowVWAP: minuteEMA9BelowVWAP,
          rsiSafetyCheck: rsiSafetyCheck,
          sellCondition: sellCondition,
          
          timestamp: new Date().toISOString(),
          totalCandles: totalCandles,
          todayCandles: todayCandles,
          source: "orderManager_enhanced_cache"
        }
      });
    }
    // Place sell order if conditions met
    if (sellCondition) {
      console.log(`✅ NEW MULTI-TIMEFRAME SELL CONDITION MET for ${symbol}:`);
      console.log(`   📈 1H: Open(${currentHourOpen?.toFixed(2)}) > VWAP(${hourlyVWAP?.toFixed(2)}) → ${hourly1hOpenAboveVWAP}`);
      console.log(`   📉 1M: EMA9(${ema9?.toFixed(2)}) < VWAP(${vwap?.toFixed(2)}) → ${minuteEMA9BelowVWAP}`);
      console.log(`   🛡️ RSI Safety: No RSI<40 in last 10 → ${rsiSafetyCheck} (Current RSI: ${rsi?.toFixed(2)})`);
      
      // Uncomment the line below when ready to place actual orders
      // await placeSellOrder(token, symbol, ltp);
    } else {
      console.log(`❌ NEW MULTI-TIMEFRAME Sell condition NOT met for ${symbol}:`);
      console.log(`   Hourly=${hourlyCondition} (OpenVsVWAP=${hourly1hOpenAboveVWAP})`);
      console.log(`   Minute=${minuteEMA9BelowVWAP}, RSI_Safety=${rsiSafetyCheck}`);
    }
  } catch (err) {
    console.error(`❌ Error in checkAndSellOnSubscription for ${symbol}: ${err.message}`);
  }
}

/**
 * Check buy conditions and place buy order if conditions are met
 * @param {string|number} token - instrument token
 * @param {string} symbol - trading symbol
 * @param {number} ltp - last traded price
 * @returns {Promise<void>}
 */
async function checkAndBuyOnSubscription(token, symbol, ltp) {
  try {
    console.log(`🔍 Checking BUY conditions for ${symbol} at LTP: ${ltp}`);
    
    // Check if symbol has been traded today (prevent re-trading)
    const hasBeenTraded = await hasSymbolBeenTraded(symbol);
    if (hasBeenTraded) {
      console.log(`🚫 Symbol ${symbol} has already been traded today, skipping BUY order`);
      return null;
    }

    // Get appropriate product type based on current time
    const productType = getProductType();
    console.log(`📊 Using product type: ${productType} for BUY order on ${symbol}`);

    // Check if ANY MIS positions exist (only relevant for MIS orders)
    if (productType === 'MIS') {
      const hasPosition = await hasAnyPosition();
      if (hasPosition) {
        console.log(`📊 Existing MIS positions found, skipping BUY order for ${symbol}`);
        return null;
      }
    }

    // Check cooldown
    if (isCooldownActive(symbol)) {
      console.log(`⏳ Cooldown active for ${symbol}, skipping BUY order`);
      return null;
    }

    // Check if a recent order exists for this symbol
    if (hasRecentOrder(symbol, 'BUY')) {
      console.log(`📝 Recent BUY order exists for ${symbol}, skipping`);
      return null;
    }

    // Calculate quantity based on available funds
    const { quantity, availableFunds } = await calculateQuantity(ltp, productType);
    if (quantity <= 0) {
      console.log(`💰 Insufficient funds for BUY order on ${symbol} (Available: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);
      return null;
    }

    console.log(`💹 Placing BUY order for ${symbol}: ${quantity} shares (Available funds: ${availableFunds}, Price: ${ltp}, Product: ${productType})`);

    // Place the buy order
    const orderReason = "New Strategy Buy Order - Multi-timeframe Conditions Met";
    const order = await placeOrder(token, "BUY", quantity, ltp, productType, orderReason, symbol);
    
    if (order && order.order_id) {
      console.log(`✅ BUY Order placed for ${symbol}: ${order.order_id} (Qty: ${quantity}, Product: ${productType}) - ${orderReason}`);
      
      // Update cooldown tracker
      const now = Date.now();
      if (!cooldownTracker[symbol]) cooldownTracker[symbol] = {};
      cooldownTracker[symbol].lastOrderTime = now;
      cooldownTracker[symbol].lastBuyOrder = now;
      
      // Add to traded symbols cache
      tradedSymbolsCache.add(symbol);
      
      // Track open order for potential exit strategies
      openOrdersTracker[symbol] = {
        orderId: order.order_id,
        quantity: quantity,
        price: ltp,
        productType: productType,
        side: 'BUY',
        timestamp: now,
        exitOrderId: null
      };
      
      // Broadcast order to UI if available
      if (global.broadcastToClients) {
        console.log(`📡 Broadcasting BUY order for ${symbol}`);
        global.broadcastToClients({
          type: "new_buy_order",
          data: {
            symbol: symbol,
            token: token,
            side: "BUY",
            quantity: quantity,
            price: ltp,
            orderId: order.order_id,
            productType: productType,
            timestamp: new Date().toISOString(),
            reason: `New Strategy Buy Order (${productType})`,
            availableFunds: availableFunds
          }
        });
      }
      
      return order;
    } else {
      console.log(`❌ Failed to place BUY order for ${symbol}`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Error placing BUY order for ${symbol}: ${err.message}`);
    return null;
  }
}

module.exports = {
  placeOrder,
  placeBuyOrder,
  placeSellOrder,
  placeExitOrder,
  placeTargetOrder,
  placeStopLossOrder,
  placeTargetAndStopLoss,
  hasSymbolBeenTraded,
  cooldownTracker,
  openOrdersTracker,
  getPositions,
  getAvailableFunds,
  calculateQuantity,
  isMISTimeOver,
  getProductType,
  checkAndSellOnSubscription,
  checkAndBuyOnSubscription, // Export new buy function
  getLiveIndicatorsFromCache // Export new function
};
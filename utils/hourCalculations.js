/**
 * Utility functions for calculating hour open and low from 1-minute candles
 * These calculations can be   // Trading hour ranges (9:15-10:15, 10:15-11:15, etc.)
  const tradingHours = [
    { start: 9, startMin: 15, end: 10, endMin: 15 }, // 9:15-10:15
    { start: 10, startMin: 15, end: 11, endMin: 15 }, // 10:15-11:15
    { start: 11, startMin: 15, end: 12, endMin: 15 }, // 11:15-12:15
    { start: 12, startMin: 15, end: 13, endMin: 15 }, // 12:15-13:15
    { start: 13, startMin: 15, end: 14, endMin: 15 }, // 13:15-14:15
    { start: 14, startMin: 15, end: 15, endMin: 15 }, // 14:15-15:15
    { start: 15, startMin: 15, end: 23, endMin: 45 }  // 15:15-23:45
  ];ross different parts of the application
 */

/**
 * Get the current trading hour range based on Indian market hours + extended hours
 * Trading hours: 9:15 AM to 3:15 PM + extended hours to 11:45 PM
 * Hour boundaries: 9:15-10:15, 10:15-11:15, 11:15-12:15, 12:15-13:15, 13:15-14:15, 14:15-15:15, 15:15-23:45
 * @param {Date} currentTime - Current time
 * @returns {Object|null} - {start: Date, end: Date, hourIndex: number} or null if not in trading hours
 */
function getCurrentTradingHour(currentTime = new Date()) {
  const hour = currentTime.getHours();
  const minute = currentTime.getMinutes();
  
  // Create date for today's trading start (9:15 AM)
  const today = new Date(currentTime);
  today.setSeconds(0, 0);
  
  // Trading hour ranges (9:15-10:15, 10:15-11:15, etc.)
  const tradingHours = [
    { start: 9, startMin: 15, end: 10, endMin: 15, index: 0 }, // 9:15-10:15
    { start: 10, startMin: 15, end: 11, endMin: 15, index: 1 }, // 10:15-11:15
    { start: 11, startMin: 15, end: 12, endMin: 15, index: 2 }, // 11:15-12:15
    { start: 12, startMin: 15, end: 13, endMin: 15, index: 3 }, // 12:15-13:15
    { start: 13, startMin: 15, end: 14, endMin: 15, index: 4 }, // 13:15-14:15
    { start: 14, startMin: 15, end: 15, endMin: 15, index: 5 }, // 14:15-15:15
    { start: 15, startMin: 15, end: 23, endMin: 45, index: 6 }  // 15:15-23:45
  ];
  
  for (const range of tradingHours) {
    const startTime = new Date(today);
    startTime.setHours(range.start, range.startMin, 0, 0);
    
    const endTime = new Date(today);
    endTime.setHours(range.end, range.endMin, 0, 0);
    
    if (currentTime >= startTime && currentTime < endTime) {
      return {
        start: startTime,
        end: endTime,
        hourIndex: range.index,
        hourString: `${range.start.toString().padStart(2, '0')}:${range.startMin.toString().padStart(2, '0')}-${range.end.toString().padStart(2, '0')}:${range.endMin.toString().padStart(2, '0')}`
      };
    }
  }
  
  return null; // Not in trading hours
}

/**
 * Calculate current hour's open and low from 1-minute candles
 * Indian market trading hours: 9:15 AM to 3:15 PM + extended hours to 11:45 PM
 * Hour boundaries: 9:15-10:15, 10:15-11:15, 11:15-12:15, 12:15-13:15, 13:15-14:15, 14:15-15:15, 15:15-23:45
 * @param {Array} candles1m - Array of 1-minute candles with {date, open, high, low, close, volume}
 * @param {Date} [currentTime] - Current time for calculation (defaults to now)
 * @returns {Object} - {hourOpen: number|null, hourLow: number|null, candlesInHour: number}
 */
function calculateHourOpenLow(candles1m, currentTime = new Date()) {
  if (!candles1m || !Array.isArray(candles1m) || candles1m.length === 0) {
    return { hourOpen: null, hourLow: null, candlesInHour: 0 };
  }

  // Determine which trading hour we're currently in
  const currentHourRange = getCurrentTradingHour(currentTime);
  if (!currentHourRange) {
    return { hourOpen: null, hourLow: null, candlesInHour: 0 };
  }

  // Filter candles that belong to the current trading hour
  const currentHourCandles = candles1m.filter(candle => {
    const candleTime = new Date(candle.date);
    return candleTime >= currentHourRange.start && candleTime < currentHourRange.end;
  });

  if (currentHourCandles.length === 0) {
    return { hourOpen: null, hourLow: null, candlesInHour: 0 };
  }

  // Sort candles by time to ensure correct order
  currentHourCandles.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Hour open = open of the first candle in the hour (should be at X:15)
  const hourOpen = currentHourCandles[0].open;

  // Hour low = minimum low among all candles in the hour so far
  const hourLow = Math.min(...currentHourCandles.map(candle => candle.low));

  return {
    hourOpen,
    hourLow,
    candlesInHour: currentHourCandles.length,
    hourStartTime: currentHourRange.start,
    hourEndTime: currentHourRange.end,
    firstCandleTime: currentHourCandles[0].date,
    lastCandleTime: currentHourCandles[currentHourCandles.length - 1].date
  };
}

/**
 * Calculate hour open and low for a specific trading hour from 1-minute candles
 * @param {Array} candles1m - Array of 1-minute candles
 * @param {number} hourIndex - The trading hour index (0=9:15-10:15, 1=10:15-11:15, ..., 5=14:15-15:15, 6=15:15-23:45)
 * @param {Date} [targetDate] - The date to calculate for (defaults to today)
 * @returns {Object} - {hourOpen: number|null, hourLow: number|null, candlesInHour: number}
 */
function calculateSpecificHourOpenLow(candles1m, hourIndex, targetDate = new Date()) {
  if (!candles1m || !Array.isArray(candles1m) || candles1m.length === 0) {
    return { hourOpen: null, hourLow: null, candlesInHour: 0 };
  }

  // Trading hour ranges (9:15-10:15, 10:15-11:15, etc.)
  const tradingHours = [
    { start: 9, startMin: 15, end: 10, endMin: 15 }, // 9:15-10:15
    { start: 10, startMin: 15, end: 11, endMin: 15 }, // 10:15-11:15
    { start: 11, startMin: 15, end: 12, endMin: 15 }, // 11:15-12:15
    { start: 12, startMin: 15, end: 13, endMin: 15 }, // 12:15-13:15
    { start: 13, startMin: 15, end: 14, endMin: 15 }, // 13:15-14:15
    { start: 14, startMin: 15, end: 15, endMin: 15 }, // 14:15-15:15
    { start: 15, startMin: 15, end: 23, endMin: 45 }  // 15:15-23:45
  ];

  if (hourIndex < 0 || hourIndex >= tradingHours.length) {
    return { hourOpen: null, hourLow: null, candlesInHour: 0 };
  }

  const range = tradingHours[hourIndex];
  const today = new Date(targetDate);
  today.setSeconds(0, 0);

  const hourStart = new Date(today);
  hourStart.setHours(range.start, range.startMin, 0, 0);
  
  const hourEnd = new Date(today);
  hourEnd.setHours(range.end, range.endMin, 0, 0);

  // Filter candles that belong to this trading hour
  const hourCandles = candles1m.filter(candle => {
    const candleTime = new Date(candle.date);
    return candleTime >= hourStart && candleTime < hourEnd;
  });

  if (hourCandles.length === 0) {
    return { hourOpen: null, hourLow: null, candlesInHour: 0 };
  }

  // Sort candles by time to ensure correct order
  hourCandles.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Hour open = open of the first candle in the hour (should be at X:15)
  const hourOpen = hourCandles[0].open;

  // Hour low = minimum low among all candles in the hour
  const hourLow = Math.min(...hourCandles.map(candle => candle.low));

  return {
    hourOpen,
    hourLow,
    candlesInHour: hourCandles.length,
    hourStartTime: hourStart,
    hourEndTime: hourEnd,
    firstCandleTime: hourCandles[0].date,
    lastCandleTime: hourCandles[hourCandles.length - 1].date
  };
}

/**
 * Get all trading hours' open and low for a given day from 1-minute candles
 * @param {Array} candles1m - Array of 1-minute candles for the day
 * @param {Date} [targetDate] - The date to analyze (defaults to today)
 * @returns {Array} - Array of {hourIndex, hourString, hourOpen, hourLow, candlesInHour} objects
 */
function getAllHoursOpenLow(candles1m, targetDate = new Date()) {
  if (!candles1m || !Array.isArray(candles1m) || candles1m.length === 0) {
    return [];
  }

  const results = [];
  
  // Indian market trading hours: 9:15 AM to 3:15 PM + extended hours to 11:45 PM
  // 7 trading hours: 9:15-10:15, 10:15-11:15, 11:15-12:15, 12:15-13:15, 13:15-14:15, 14:15-15:15, 15:15-23:45
  const tradingHourLabels = [
    "09:15-10:15",
    "10:15-11:15", 
    "11:15-12:15",
    "12:15-13:15",
    "13:15-14:15",
    "14:15-15:15",
    "15:15-23:45"
  ];
  
  for (let hourIndex = 0; hourIndex < tradingHourLabels.length; hourIndex++) {
    const hourData = calculateSpecificHourOpenLow(candles1m, hourIndex, targetDate);
    
    results.push({
      hourIndex: hourIndex,
      hourString: tradingHourLabels[hourIndex],
      ...hourData
    });
  }
  
  return results;
}

/**
 * Check if current price has dipped below hour open and then recovered
 * This is useful for trading strategies that wait for a dip and recovery pattern
 * @param {number} hourOpen - The hour's opening price
 * @param {number} hourLow - The hour's lowest price so far
 * @param {number} currentPrice - Current live price (LTP)
 * @returns {Object} - {hasDippedBelowOpen: boolean, hasRecoveredAboveOpen: boolean, isValidPattern: boolean}
 */
function checkDipRecoveryPattern(hourOpen, hourLow, currentPrice) {
  if (!hourOpen || !hourLow || !currentPrice) {
    return {
      hasDippedBelowOpen: false,
      hasRecoveredAboveOpen: false,
      isValidPattern: false,
      reason: "Missing required prices"
    };
  }

  // Check if price has dipped below the hour open (hourLow < hourOpen)
  const hasDippedBelowOpen = hourLow < hourOpen;
  
  // Check if current price has recovered above the hour open (currentPrice > hourOpen)
  const hasRecoveredAboveOpen = currentPrice > hourOpen;
  
  // Valid pattern: must have dipped below open AND currently be above open
  const isValidPattern = hasDippedBelowOpen && hasRecoveredAboveOpen;

  return {
    hasDippedBelowOpen,
    hasRecoveredAboveOpen,
    isValidPattern,
    dipAmount: hasDippedBelowOpen ? hourOpen - hourLow : 0,
    dipPercentage: hasDippedBelowOpen ? ((hourOpen - hourLow) / hourOpen) * 100 : 0,
    recoveryAmount: hasRecoveredAboveOpen ? currentPrice - hourOpen : 0,
    recoveryPercentage: hasRecoveredAboveOpen ? ((currentPrice - hourOpen) / hourOpen) * 100 : 0,
    reason: isValidPattern ? "Valid dip-recovery pattern" : 
           !hasDippedBelowOpen ? "No dip below hour open detected" :
           !hasRecoveredAboveOpen ? "Price has not recovered above hour open" : "Unknown"
  };
}

/**
 * Check if current price has recovered above hour open and then dipped below
 * This is the opposite of dip-recovery pattern, useful for SELL strategies
 * @param {number} hourOpen - The hour's opening price
 * @param {number} hourHigh - The hour's highest price so far
 * @param {number} currentPrice - Current live price (LTP)
 * @returns {Object} - {hasRecoveredAboveOpen: boolean, hasDroppedBelowOpen: boolean, isValidPattern: boolean}
 */
function checkRecoveryDipPattern(hourOpen, hourHigh, currentPrice) {
  if (!hourOpen || !hourHigh || !currentPrice) {
    return {
      hasRecoveredAboveOpen: false,
      hasDroppedBelowOpen: false,
      isValidPattern: false,
      reason: "Missing required prices"
    };
  }

  // Check if price has recovered above the hour open (hourHigh > hourOpen)
  const hasRecoveredAboveOpen = hourHigh > hourOpen;
  
  // Check if current price has dropped below the hour open (currentPrice < hourOpen)
  const hasDroppedBelowOpen = currentPrice < hourOpen;
  
  // Valid pattern: must have recovered above open AND currently be below open
  const isValidPattern = hasRecoveredAboveOpen && hasDroppedBelowOpen;

  return {
    hasRecoveredAboveOpen,
    hasDroppedBelowOpen,
    isValidPattern,
    recoveryAmount: hasRecoveredAboveOpen ? hourHigh - hourOpen : 0,
    recoveryPercentage: hasRecoveredAboveOpen ? ((hourHigh - hourOpen) / hourOpen) * 100 : 0,
    dipAmount: hasDroppedBelowOpen ? hourOpen - currentPrice : 0,
    dipPercentage: hasDroppedBelowOpen ? ((hourOpen - currentPrice) / hourOpen) * 100 : 0,
    reason: isValidPattern ? "Valid recovery-dip pattern" : 
           !hasRecoveredAboveOpen ? "No recovery above hour open detected" :
           !hasDroppedBelowOpen ? "Price has not dropped below hour open" : "Unknown"
  };
}

module.exports = {
  getCurrentTradingHour,
  calculateHourOpenLow,
  calculateSpecificHourOpenLow,
  getAllHoursOpenLow,
  checkDipRecoveryPattern,
  checkRecoveryDipPattern
};

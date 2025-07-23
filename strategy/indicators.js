const { RSI, EMA, VWAP, OBV, ATR, ADX } = require("technicalindicators");

function calculateEMA(prices, period = 9) {
  if (!prices || prices.length < period) return null;
  
  const emaValues = EMA.calculate({
    values: prices,
    period: period
  });
  
  return emaValues.length > 0 ? emaValues[emaValues.length - 1] : null;
}

function calculateOBV(closes, volumes) {
  if (closes.length !== volumes.length || closes.length < 2) return null;
  
  const obv = [0];
  
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      obv.push(obv[i - 1] + volumes[i]);
    } else if (change < 0) {
      obv.push(obv[i - 1] - volumes[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  
  return obv;
}


function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  
  const rsiValues = RSI.calculate({
    values: prices,
    period: period
  });
  
  return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
}

function calculateRSIArray(prices, period = 14) {
  if (prices.length < period + 1) return null;
  
  const rsiValues = RSI.calculate({
    values: prices,
    period: period
  });
  
  return rsiValues;
}

function calculateVWAP(highs, lows, closes, volumes) {
  return VWAP.calculate({
    high: highs,
    low: lows,
    close: closes,
    volume: volumes
  });
  // Note: VWAP requires arrays of highs, lows, closes, and volumes
}


function calculateSMA(values, period = 5) {
  if (values.length < period) return 0;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function updateOBV(obvPrev, close, prevClose, volume) {
  if (close > prevClose) return obvPrev + volume;
  if (close < prevClose) return obvPrev - volume;
  return obvPrev;
}

function isOBVTrendingUp(obvList, period = 5) {
  if (obvList.length < period) return false;
  return obvList[obvList.length - 1] > obvList[0];
}

function isParabolicOBV(obv, window = 10) {
  if (obv.length < window + 1) return false;

  const deltas = [];
  for (let i = obv.length - window; i < obv.length; i++) {
    deltas.push(obv[i] - obv[i - 1]);
  }

  const totalGain = obv[obv.length - 1] - obv[obv.length - window - 1];
  const upMoves = deltas.filter(d => d > 0).length;
  const downMoves = deltas.filter(d => d < 0).length;

  let accelCount = 0;
  for (let i = 2; i < deltas.length; i++) {
    if (deltas[i] > deltas[i - 1] && deltas[i - 1] > deltas[i - 2]) {
      accelCount++;
    }
  }

  return (
    totalGain > 0 &&
    upMoves >= 7 &&
    downMoves <= 3 &&
    accelCount >= 2
  );
}
  
function isParabolicOBVDown(obv, window = 10) {
  if (obv.length < window + 1) return false;

  const deltas = [];
  for (let i = obv.length - window; i < obv.length; i++) {
    deltas.push(obv[i] - obv[i - 1]);
  }

  const totalDrop = obv[obv.length - 1] - obv[obv.length - window - 1];
  const downMoves = deltas.filter(d => d < 0).length;
  const upMoves = deltas.filter(d => d > 0).length;

  let accelCount = 0;
  for (let i = 2; i < deltas.length; i++) {
    if (deltas[i] < deltas[i - 1] && deltas[i - 1] < deltas[i - 2]) {
      accelCount++;
    }
  }

  return (
    totalDrop < 0 &&              // OBV is dropping overall
    downMoves >= 7 &&             // At least 7 of 10 OBV deltas are negative
    upMoves <= 3 &&               // Allow a few up candles
    accelCount >= 2               // At least 2 accelerating downward slopes
  );
}

function calculateATR(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || highs.length < period || 
      highs.length !== lows.length || highs.length !== closes.length) {
    return null;
  }
  
  // Additional validation: check for valid numeric values
  const hasInvalidData = highs.some(h => !Number.isFinite(h)) || 
                        lows.some(l => !Number.isFinite(l)) || 
                        closes.some(c => !Number.isFinite(c));
  
  if (hasInvalidData) {
    console.warn('ATR calculation: Invalid data detected in input arrays');
    return null;
  }
  
  // Ensure high >= low for each candle
  for (let i = 0; i < highs.length; i++) {
    if (highs[i] < lows[i]) {
      console.warn(`ATR calculation: Invalid candle at index ${i}: high=${highs[i]} < low=${lows[i]}`);
      return null;
    }
  }
  
  try {
    const atrValues = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: period
    });
    
    return atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
  } catch (error) {
    console.error('ATR calculation error:', error.message);
    return null;
  }
}

// Function to calculate ADX and DI values
function calculateADX(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || highs.length < period + 1) return null;
  
  try {
    const adxResult = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: period
    });
    
    return adxResult.length > 0 ? adxResult[adxResult.length - 1] : null;
  } catch (error) {
    console.error('Error calculating ADX:', error.message);
    return null;
  }
}

// Function to get the latest ADX data including +DI and -DI
function getLatestADXData(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || highs.length < period + 1) return null;
  
  try {
    const adxResult = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: period
    });
    
    if (adxResult.length > 0) {
      const latest = adxResult[adxResult.length - 1];
      return {
        adx: latest.adx,
        pdi: latest.pdi, // +DI (Positive Directional Indicator)
        mdi: latest.mdi  // -DI (Negative Directional Indicator)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error calculating ADX data:', error.message);
    return null;
  }
}


module.exports = {
  calculateRSI,
  calculateRSIArray,
  calculateEMA,
  calculateVWAP,
  calculateOBV,
  isParabolicOBV,
  isParabolicOBVDown,
  calculateSMA,
  updateOBV,
  isOBVTrendingUp,
  calculateATR,
  calculateADX,
  getLatestADXData
};
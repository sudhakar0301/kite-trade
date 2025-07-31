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

// Function to calculate ADX and DI values using improved algorithm
function calculateADX(highs, lows, closes, period = 14) {
  if (!highs || !lows || !closes || highs.length < 200) {
    console.log(`ADX calculation: Insufficient data. Need at least 200 candles, got ${highs ? highs.length : 0}`);
    return [];
  }
  
  const results = [];
  
  try {
    // Step 1: Calculate True Range (TR)
    const trValues = [];
    for (let i = 1; i < highs.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      trValues.push(Math.max(tr1, tr2, tr3));
    }
    
    // Step 2: Calculate +DM and -DM
    const plusDM = [];
    const minusDM = [];
    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      
      if (upMove > downMove && upMove > 0) {
        plusDM.push(upMove);
        minusDM.push(0);
      } else if (downMove > upMove && downMove > 0) {
        plusDM.push(0);
        minusDM.push(downMove);
      } else {
        plusDM.push(0);
        minusDM.push(0);
      }
    }
    
    // Helper function for Wilder's smoothing
    function wildersSmoothing(values, period, startIndex = 0) {
      const smoothed = [];
      
      // First value is simple average
      let sum = 0;
      for (let i = startIndex; i < startIndex + period && i < values.length; i++) {
        sum += values[i];
      }
      smoothed.push(sum / period);
      
      // Subsequent values use Wilder's smoothing: ((n-1) * previous + current) / n
      for (let i = startIndex + period; i < values.length; i++) {
        const prevSmoothed = smoothed[smoothed.length - 1];
        const newSmoothed = ((period - 1) * prevSmoothed + values[i]) / period;
        smoothed.push(newSmoothed);
      }
      
      return smoothed;
    }
    
    // Step 3: Calculate smoothed values
    const smoothedTR = wildersSmoothing(trValues, period);
    const smoothedPlusDM = wildersSmoothing(plusDM, period);
    const smoothedMinusDM = wildersSmoothing(minusDM, period);
    
    // Step 4: Calculate +DI and -DI
    const plusDI = [];
    const minusDI = [];
    for (let i = 0; i < smoothedTR.length; i++) {
      if (smoothedTR[i] !== 0) {
        plusDI.push((smoothedPlusDM[i] / smoothedTR[i]) * 100);
        minusDI.push((smoothedMinusDM[i] / smoothedTR[i]) * 100);
      } else {
        plusDI.push(0);
        minusDI.push(0);
      }
    }
    
    // Step 5: Calculate DX
    const dx = [];
    for (let i = 0; i < plusDI.length; i++) {
      const sum = plusDI[i] + minusDI[i];
      if (sum !== 0) {
        dx.push((Math.abs(plusDI[i] - minusDI[i]) / sum) * 100);
      } else {
        dx.push(0);
      }
    }
    
    // Step 6: Calculate ADX using Wilder's smoothing on DX
    const adxValues = wildersSmoothing(dx, period);
    
    // Build results array
    for (let i = 0; i < highs.length; i++) {
      if (i < period * 2) {
        // Not enough data for ADX calculation
        results.push({
          timestamp: Date.now(), // You might want to use actual timestamp
          open: 0,
          high: highs[i],
          low: lows[i],
          close: closes[i],
          volume: 0,
          oi: 0,
          tickCount: 1,
          plusDI: null,
          minusDI: null,
          dx: null,
          adx: null
        });
      } else {
        const adjustedIndex = i - period;
        const adxIndex = adjustedIndex - period;
        
        results.push({
          timestamp: Date.now(),
          open: 0,
          high: highs[i],
          low: lows[i],
          close: closes[i],
          volume: 0,
          oi: 0,
          tickCount: 1,
          plusDI: adjustedIndex < plusDI.length ? plusDI[adjustedIndex] : null,
          minusDI: adjustedIndex < minusDI.length ? minusDI[adjustedIndex] : null,
          dx: adjustedIndex < dx.length ? dx[adjustedIndex] : null,
          adx: adxIndex >= 0 && adxIndex < adxValues.length ? adxValues[adxIndex] : null
        });
      }
    }
    
    console.log(`✅ ADX calculation completed: ${results.length} candles processed`);
    if (results.length > 0) {
      const last = results[results.length - 1];
      console.log(`✅ Last result sample: ADX=${last.adx}, +DI=${last.plusDI}, -DI=${last.minusDI}`);
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Error in calculateADX:', error.message);
    return [];
  }
}

// Function to get the latest ADX data including +DI and -DI
function getLatestADXData(highs, lows, closes, period = 14) {
  const adxResults = calculateADX(highs, lows, closes, period);
  
  if (adxResults.length > 0) {
    const latest = adxResults[adxResults.length - 1];
    return {
      adx: latest.adx,
      pdi: latest.plusDI, // +DI (Positive Directional Indicator)
      mdi: latest.minusDI  // -DI (Negative Directional Indicator)
    };
  }
  
  return null;
}

// Helper to calculate EMA for MACD
function calculateEMAForMACD(values, period) {
  const k = 2 / (period + 1);
  const emaArray = [];
  let emaPrev;

  for (let i = 0; i < values.length; i++) {
    const price = values[i];

    if (i < period - 1) {
      emaArray.push(null); // Not enough data
    } else if (i === period - 1) {
      const sum = values.slice(0, period).reduce((a, b) => a + b, 0);
      emaPrev = sum / period;
      emaArray.push(emaPrev);
    } else {
      emaPrev = (price - emaPrev) * k + emaPrev;
      emaArray.push(emaPrev);
    }
  }

  return emaArray;
}

function calculateMACD(closes, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const shortEMA = calculateEMAForMACD(closes, shortPeriod);
  const longEMA = calculateEMAForMACD(closes, longPeriod);

  const macdLine = closes.map((_, i) => {
    if (shortEMA[i] != null && longEMA[i] != null) {
      return shortEMA[i] - longEMA[i];
    }
    return null;
  });

  const signalLine = calculateEMAForMACD(macdLine.filter(v => v !== null), signalPeriod);
  const fullSignalLine = macdLine.map((_, i) =>
    i >= (longPeriod - 1 + signalPeriod - 1) ? signalLine[i - (longPeriod - 1)] : null
  );

  const histogram = macdLine.map((macd, i) => {
    if (macd != null && fullSignalLine[i] != null) {
      return macd - fullSignalLine[i];
    }
    return null;
  });

  // Return structured result
  return closes.map((close, i) => ({
    close,
    macd: macdLine[i],
    signal: fullSignalLine[i],
    histogram: histogram[i]
  }));
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
  getLatestADXData,
  calculateMACD
};
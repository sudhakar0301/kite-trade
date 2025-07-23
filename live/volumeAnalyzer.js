/**
 * Volume Analyzer - Provides volume-based analysis functions
 */

// Simple stub implementation for volume condition checking
function checkVolumeCondition(token, candles, threshold = 1.5) {
  // Add validation for candles parameter
  if (!candles || !Array.isArray(candles) || candles.length < 2) {
    return {
      isValid: false,
      reason: `Insufficient candle data for volume analysis (need array with ≥2 candles, got ${candles ? (Array.isArray(candles) ? candles.length : typeof candles) : 'null/undefined'})`,
      avgVolume: 0,
      currentVolume: 0,
      volumeRatio: 0,
      lastMinuteVolume: 0,
      requiredVolume: 0,
      ratio: 0,
      volumeChecks: []
    };
  }
  
  // Get last few candles for average volume calculation
  const lastCandles = candles.slice(-10); // Last 10 candles
  const volumes = lastCandles.map(c => c && c.volume ? c.volume : 0).filter(v => v > 0);
  
  if (volumes.length < 2) {
    return {
      isValid: false,
      reason: 'Insufficient volume data (need ≥2 candles with volume)',
      avgVolume: 0,
      currentVolume: 0,
      volumeRatio: 0,
      lastMinuteVolume: 0,
      requiredVolume: 0,
      ratio: 0,
      volumeChecks: []
    };
  }
  
  const avgVolume = volumes.slice(0, -1).reduce((sum, vol) => sum + vol, 0) / (volumes.length - 1);
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;
  
  return {
    isValid: volumeRatio >= threshold,
    reason: volumeRatio >= threshold ? 
      `Volume above threshold: ${(volumeRatio * 100).toFixed(1)}% of avg` : 
      `Volume ratio ${volumeRatio.toFixed(2)} below threshold ${threshold}`,
    avgVolume,
    currentVolume,
    volumeRatio: +volumeRatio.toFixed(2),
    lastMinuteVolume: currentVolume,
    requiredVolume: avgVolume * threshold,
    ratio: volumeRatio,
    volumeChecks: volumes.map((vol, idx) => ({
      volume: vol,
      isValid: vol >= avgVolume * threshold
    }))
  };
}

// Simple stub implementation for volume data initialization
async function initializeVolumeData(token) {
  try {
    console.log(`📊 Volume data initialized for token ${token}`);
    return {
      token,
      avgVolume: 0,
      volumeProfile: [],
      initialized: true,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error(`❌ Error initializing volume data for token ${token}: ${error.message}`);
    return null;
  }
}

module.exports = {
  checkVolumeCondition,
  initializeVolumeData
};

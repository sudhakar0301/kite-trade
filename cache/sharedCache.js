// Shared candle cache that can be imported by both tickListener and orderManager
// This prevents circular dependency issues

const candleCache = new Map();

// Server restart detection and cache state management
let serverStartTime = Date.now();
let isServerRestarted = true; // Flag to indicate if server just restarted
let cacheInitialized = false; // Flag to track if cache has been properly initialized

// Function to check if server was restarted (new file detected)
function isNewServerSession() {
  return isServerRestarted;
}

// Function to mark server as initialized (called after initial cache population)
function markServerInitialized() {
  isServerRestarted = false;
  cacheInitialized = true;
  console.log(`🚀 Server marked as initialized at ${new Date().toLocaleTimeString()}`);
}

// Function to check if cache is ready for trading decisions
function isCacheReadyForTrading() {
  return cacheInitialized && !isServerRestarted;
}

// Function to force fresh calculations (when server restarts or new file detected)
function forceFreshCalculations() {
  isServerRestarted = true;
  cacheInitialized = false;
  candleCache.clear();
  if (global.historicalIndicators) {
    global.historicalIndicators.clear();
  }
  console.log(`🔄 Forced fresh calculations - all caches cleared`);
}

module.exports = {
  candleCache,
  isNewServerSession,
  markServerInitialized,
  isCacheReadyForTrading,
  forceFreshCalculations,
  serverStartTime
};

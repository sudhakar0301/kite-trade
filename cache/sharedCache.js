// Shared candle cache that can be imported by both tickListener and orderManager
// This prevents circular dependency issues

const candleCache = new Map();

module.exports = {
  candleCache
};

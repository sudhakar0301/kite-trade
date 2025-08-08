const fs = require('fs').promises;
const path = require('path');

// Cache file path
const INSTRUMENTS_CACHE_FILE = path.join(__dirname, '../data/instruments_tick_size.json');

/**
 * Get instruments data with tick sizes from cache or API
 * @param {Object} kite - Zerodha Kite instance
 * @returns {Promise<Object>} - Symbol to tick size mapping
 */
async function getInstrumentsWithTickSize(kite) {
  try {
    console.log(`📊 Loading instruments data with tick sizes...`);
    
    // Check if cache file exists and is recent (less than 1 day old)
    try {
      const stats = await fs.stat(INSTRUMENTS_CACHE_FILE);
      const fileAge = Date.now() - stats.mtime.getTime();
      const oneDayInMs = 24 * 60 * 60 * 1000;
      
      if (fileAge < oneDayInMs) {
        console.log(`📁 Loading tick sizes from cache file (${Math.round(fileAge / (60 * 60 * 1000))} hours old)`);
        const cacheData = await fs.readFile(INSTRUMENTS_CACHE_FILE, 'utf8');
        const instrumentsData = JSON.parse(cacheData);
        console.log(`✅ Loaded ${Object.keys(instrumentsData.symbolTickSizes).length} instruments from cache`);
        return instrumentsData;
      } else {
        console.log(`⚠️ Cache file is old (${Math.round(fileAge / oneDayInMs)} days), fetching fresh data`);
      }
    } catch (error) {
      console.log(`📁 No cache file found, fetching fresh instruments data`);
    }
    
    // Fetch fresh data from API
    console.log(`🌐 Fetching instruments data from Zerodha API...`);
    const instruments = await kite.getInstruments();
    
    if (!instruments || instruments.length === 0) {
      throw new Error('No instruments data received from API');
    }
    
    console.log(`📊 Processing ${instruments.length} instruments...`);
    
    // Create symbol to tick size mapping
    const symbolTickSizes = {};
    const tokenTickSizes = {};
    
    // Filter NSE equity instruments and extract tick sizes
    const nseEquityInstruments = instruments.filter(instrument => 
      instrument.exchange === 'NSE' && 
      instrument.segment === 'NSE' &&
      instrument.instrument_type === 'EQ'
    );
    
    console.log(`📈 Found ${nseEquityInstruments.length} NSE equity instruments`);
    
    nseEquityInstruments.forEach(instrument => {
      const symbol = instrument.tradingsymbol;
      const token = instrument.instrument_token;
      const tickSize = instrument.tick_size || 0.05; // Default to 0.05 if not available
      
      symbolTickSizes[symbol] = tickSize;
      tokenTickSizes[token] = {
        symbol: symbol,
        tickSize: tickSize,
        lotSize: instrument.lot_size || 1,
        name: instrument.name || symbol
      };
    });
    
    // Create comprehensive data object
    const instrumentsData = {
      lastUpdated: new Date().toISOString(),
      totalInstruments: nseEquityInstruments.length,
      symbolTickSizes: symbolTickSizes,
      tokenTickSizes: tokenTickSizes,
      metadata: {
        fetchedAt: Date.now(),
        source: 'Zerodha Kite API',
        exchange: 'NSE',
        instrumentType: 'EQ'
      }
    };
    
    // Save to cache file
    await saveInstrumentsCache(instrumentsData);
    
    console.log(`✅ Successfully cached ${Object.keys(symbolTickSizes).length} instrument tick sizes`);
    return instrumentsData;
    
  } catch (error) {
    console.error(`❌ Error fetching instruments data: ${error.message}`);
    
    // Try to return cached data as fallback
    try {
      console.log(`🔄 Attempting to use existing cache as fallback...`);
      const cacheData = await fs.readFile(INSTRUMENTS_CACHE_FILE, 'utf8');
      const instrumentsData = JSON.parse(cacheData);
      console.log(`⚠️ Using cached data as fallback (${Object.keys(instrumentsData.symbolTickSizes).length} instruments)`);
      return instrumentsData;
    } catch (cacheError) {
      console.error(`❌ No fallback cache available: ${cacheError.message}`);
      throw error;
    }
  }
}

/**
 * Save instruments data to cache file
 * @param {Object} instrumentsData - Instruments data to cache
 */
async function saveInstrumentsCache(instrumentsData) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(INSTRUMENTS_CACHE_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    
    // Save to file
    await fs.writeFile(
      INSTRUMENTS_CACHE_FILE, 
      JSON.stringify(instrumentsData, null, 2), 
      'utf8'
    );
    
    console.log(`💾 Instruments cache saved to: ${INSTRUMENTS_CACHE_FILE}`);
  } catch (error) {
    console.error(`❌ Error saving instruments cache: ${error.message}`);
  }
}

/**
 * Get tick size for a specific symbol
 * @param {string} symbol - Trading symbol
 * @param {Object} instrumentsData - Cached instruments data
 * @returns {number} - Tick size for the symbol
 */
function getTickSizeFromCache(symbol, instrumentsData) {
  try {
    if (!instrumentsData || !instrumentsData.symbolTickSizes) {
      console.log(`⚠️ No instruments data available for ${symbol}`);
      return 0.05; // Default fallback
    }
    
    const tickSize = instrumentsData.symbolTickSizes[symbol];
    if (tickSize && tickSize > 0) {
      console.log(`📊 Found tick size for ${symbol}: ${tickSize}`);
      return tickSize;
    }
    
    console.log(`⚠️ No tick size found for ${symbol}, using default 0.05`);
    return 0.05; // Default fallback
  } catch (error) {
    console.error(`❌ Error getting tick size for ${symbol}: ${error.message}`);
    return 0.05; // Default fallback
  }
}

/**
 * Get tick size by instrument token
 * @param {string|number} token - Instrument token
 * @param {Object} instrumentsData - Cached instruments data
 * @returns {number} - Tick size for the token
 */
function getTickSizeByToken(token, instrumentsData) {
  try {
    if (!instrumentsData || !instrumentsData.tokenTickSizes) {
      console.log(`⚠️ No token instruments data available for token ${token}`);
      return 0.05; // Default fallback
    }
    
    const tokenInfo = instrumentsData.tokenTickSizes[token];
    if (tokenInfo && tokenInfo.tickSize && tokenInfo.tickSize > 0) {
      console.log(`📊 Found tick size for token ${token} (${tokenInfo.symbol}): ${tokenInfo.tickSize}`);
      return tokenInfo.tickSize;
    }
    
    console.log(`⚠️ No tick size found for token ${token}, using default 0.05`);
    return 0.05; // Default fallback
  } catch (error) {
    console.error(`❌ Error getting tick size for token ${token}: ${error.message}`);
    return 0.05; // Default fallback
  }
}

/**
 * Initialize instruments cache on startup
 * @param {Object} kite - Zerodha Kite instance
 * @returns {Promise<Object>} - Cached instruments data
 */
async function initializeInstrumentsCache(kite) {
  try {
    console.log(`🚀 Initializing instruments cache...`);
    const instrumentsData = await getInstrumentsWithTickSize(kite);
    
    // Store in global for easy access
    global.instrumentsCache = instrumentsData;
    
    console.log(`✅ Instruments cache initialized with ${Object.keys(instrumentsData.symbolTickSizes).length} symbols`);
    return instrumentsData;
  } catch (error) {
    console.error(`❌ Failed to initialize instruments cache: ${error.message}`);
    return null;
  }
}

module.exports = {
  getInstrumentsWithTickSize,
  getTickSizeFromCache,
  getTickSizeByToken,
  initializeInstrumentsCache,
  saveInstrumentsCache
};

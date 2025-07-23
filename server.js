const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const csv = require('csv-parser');
const WebSocket = require('ws');
const { KiteConnect } = require('kiteconnect');


// Global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  console.error('💥 Stack:', error.stack);
  console.log('🛡️ Server continues running despite error...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('💥 Reason:', reason);
  console.log('🛡️ Server continues running despite rejection...');
});

// Import original tick listener with simplified strategy
const {
  initTickListener,
  subscribeToTokens,
  updateTokenSubscriptionsFromCSV,
  initializeCSVWatcher,
  unsubscribeAll,
  broadcastAllSubscribedTokens,
  cleanup
} = require('./live/tickListener');
const { initKiteConnect } = require('./kite/connection');
const instruments = require('./data/nse500.json');
const { calculateRSI, calculateVWAP, calculateEMA } = require('./strategy/indicators');
const { from35, from15, fromToday, to15 } = require('./utils/fromAndToDate');

const app = express();
const port = 5000;

const apiKey = 'r1a7qo9w30bxsfax';
const apiSecret = 'dg9xa47tsayepnnb2xhdk0vk081cec36';
const accessTokenPath = path.join(__dirname, 'access_token.txt');
const kc = new KiteConnect({ api_key: apiKey });
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
let clients = [];
let activeScanTimer = null;

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('🟢 WebSocket client connected');
  clients.push(ws);

  // Send existing token data to the newly connected client
  setTimeout(() => {
    console.log('📤 Sending existing token data to new WebSocket client...');
    try {
      broadcastAllSubscribedTokens();
      console.log('✅ Successfully sent existing token data to new client');
    } catch (error) {
      console.error('❌ Error sending initial data to new client:', error.message);
    }
  }, 1000); // Small delay to ensure connection is fully established

  ws.on('close', () => {
    console.log('🔴 WebSocket client disconnected');
    clients = clients.filter(c => c !== ws);
  });
});

global.broadcastToClients = (data) => {
  const payload = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
};

// Make broadcastAllSubscribedTokens available globally for token subscription manager
global.broadcastAllSubscribedTokens = broadcastAllSubscribedTokens;

const tokenStore = instruments?.instruments?.map(i => i.instrument_token) || [];
global.historicalDataStore = new Map();
global.analysisDataStore = new Map();
global.filteredTokens = [];

if (tokenStore.length === 0) {
  console.error('❌ No instruments found in nse500.json');
  process.exit(1);
}

console.log(`📊 Loaded ${tokenStore.length} instruments from nse500.json`);

let accessToken;
if (fs.existsSync(accessTokenPath)) {
  accessToken = fs.readFileSync(accessTokenPath, 'utf8').trim();
  kc.setAccessToken(accessToken);
  global.kite = kc;
  global.fetchHistoricalForToken = fetchHistoricalForToken; // Make function globally available
  initKiteConnect(accessToken);
  //initTickListener();
  initTickListener(); // Initialize original tick listener with simplified strategy
  
  // Initialize smart CSV file watcher with error handling
  try {
    initializeCSVWatcher();
    console.log('✅ CSV file watcher initialized successfully');
  } catch (csvWatcherError) {
    console.error('❌ Error initializing CSV file watcher:', csvWatcherError.message);
    console.log('🛡️ Server continues without CSV file watching capability');
  }
  console.log('🔐 Access token restored');

 // activeScanTimer = setInterval(scanAndUpdateAllTokens, 5 * 60 * 1000);
 // scanAndUpdateAllTokens();
  // watchCSVForSubscriptions(); // Replaced with smart CSV watcher
} else {
  console.log('🚫 No access token found. Visit /login to authenticate');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHistoricalForToken(token) {
  try {
    const to = to15;
    const [candles1hAll, candles15mAll, candles1hToday, candles15mToday] = await Promise.all([
      kc.getHistoricalData(token, '60minute', from35, to15),
      kc.getHistoricalData(token, '15minute', from15, to15),
      kc.getHistoricalData(token, '60minute', fromToday, to15),
      kc.getHistoricalData(token, '15minute', fromToday, to15)
    ]);

    global.historicalDataStore.set(token.toString(), {
      '60minute': candles1hAll,
      '15minute': candles15mAll,
      '60minute_today': candles1hToday,
      '15minute_today': candles15mToday,
    });

    const closes1h = candles1hAll.map(c => c.close).slice(-200);
    const ema1h = calculateEMA(closes1h, 9);
    const rsi1h = calculateRSI(closes1h, 14);

    const closes1hToday = candles1hToday.map(c => c.close);
    const highs1hToday = candles1hToday.map(c => c.high);
    const lows1hToday = candles1hToday.map(c => c.low);
    const volumes1hToday = candles1hToday.map(c => c.volume);
    const vwap1h = calculateVWAP(highs1hToday, lows1hToday, closes1hToday, volumes1hToday)?.at(-1);
    const gap1h = (vwap1h && ema1h) ? +(Math.abs((vwap1h - ema1h) / ema1h) * 100).toFixed(2) : 0;

    const closes15m = candles15mAll.map(c => c.close).slice(-200);
    const ema15m = calculateEMA(closes15m, 9);
    const rsi15m = calculateRSI(closes15m, 14);

    const closes15mToday = candles15mToday.map(c => c.close);
    const highs15mToday = candles15mToday.map(c => c.high);
    const lows15mToday = candles15mToday.map(c => c.low);
    const volumes15mToday = candles15mToday.map(c => c.volume);
    const vwap15m = calculateVWAP(highs15mToday, lows15mToday, closes15mToday, volumes15mToday)?.at(-1);
    const gap15m = (vwap15m && ema15m) ? +(Math.abs((vwap15m - ema15m) / ema15m) * 100).toFixed(2) : 0;

    const instrument = instruments.instruments.find(i => i.instrument_token == token);
    const symbol = instrument ? instrument.tradingsymbol : `TOKEN_${token}`;

    console.log(`📊 Token ${token} (${symbol}): EMA1h=${ema1h}, VWAP1h=${vwap1h}, RSI1h=${rsi1h}`);

    global.analysisDataStore.set(token.toString(), {
      rsi1h,
      ema1h,
      vwap1h,
      gap1h,
      rsi15m,
      ema15m,
      vwap15m,
      gap15m
    });

   // if (vwap1h > ema1h) {
      const filteredTokenData = {
        token,
        symbol,
        rsi1h: rsi1h ? +rsi1h.toFixed(2) : null,
        ema1h: ema1h ? +ema1h.toFixed(2) : null,
        vwap1h: vwap1h ? +vwap1h.toFixed(2) : null,
        gap1h: gap1h ? +gap1h.toFixed(2) : null,
        rsi15m: rsi15m ? +rsi15m.toFixed(2) : null,
        ema15m: ema15m ? +ema15m.toFixed(2) : null,
        vwap15m: vwap15m ? +vwap15m.toFixed(2) : null,
        gap15m: gap15m ? +gap15m.toFixed(2) : null,
        chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}/${token}`
      };

      // Check if token already exists in filteredTokens to avoid duplicates
      const existingIndex = global.filteredTokens.findIndex(ft => ft.token === token);
      if (existingIndex >= 0) {
        // Update existing entry
        global.filteredTokens[existingIndex] = filteredTokenData;
        console.log(`🔄 Updated existing token ${token} (${symbol}) in filteredTokens`);
      } else {
        // Add new entry
        global.filteredTokens.push(filteredTokenData);
        console.log(`🆕 Added new token ${token} (${symbol}) to filteredTokens`);
      }

      global.broadcastToClients({
        type: "filtered_token_update",
        data: filteredTokenData
      });
   // }

    console.log(`✅ Token ${token} processed`);
  } catch (err) {
    console.error(`❌ Token ${token} failed: ${err.message}`);
  }
}

async function scanAndUpdateAllTokens() {
  console.log(`🔄 Starting scan at ${new Date().toLocaleTimeString()}`);

  if (!tokenStore.length) {
    console.error('❌ No tokens available for scanning');
    return;
  }

  // Clear filteredTokens before manual scan to avoid duplicates
  global.filteredTokens = [];
  console.log(`🧹 Cleared filteredTokens for fresh manual scan`);
  
  for (const token of tokenStore) {
    await fetchHistoricalForToken(token);
    await delay(200);
  }

  console.log(`✅ Scan complete. Filtered tokens: ${global.filteredTokens.length}`);

  if (global.filteredTokens.length > 0) {
    const tokenNumbers = global.filteredTokens.map(t => t.token);
    subscribeToTokens(tokenNumbers); // Subscribe to filtered tokens
    console.log(`📡 Subscribed to ${tokenNumbers.length} filtered tokens`);

    setTimeout(() => {
      broadcastAllSubscribedTokens(); // Broadcast token data
    }, 1000);
  }

  global.broadcastToClients({
    type: "scan_complete",
    data: {
      totalTokens: tokenStore.length,
      filteredCount: global.filteredTokens.length,
      timestamp: new Date().toISOString()
    }
  });
}

// Smart CSV processor for token subscription management
// This function is called by the CSV watcher when a new CSV file is detected
async function processSmartCSVImport(filePath) {
  console.log(`🎯 Processing CSV file with smart token subscription: ${filePath}`);
  
  const tokens = [];
  let rowCount = 0;
  let successfulMatches = 0;
  let failedMatches = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        const symbol = row['Symbol']?.trim();
        if (!symbol) {
          console.log(`⚠️ Row ${rowCount}: Empty or missing Symbol column`);
          return;
        }

        const match = instruments.instruments.find(inst => inst.tradingsymbol === symbol && inst.exchange === 'NSE');
        if (match) {
          tokens.push(match.instrument_token);
          successfulMatches++;
          console.log(`✅ Row ${rowCount}: ${symbol} -> ${match.instrument_token}`);
        } else {
          failedMatches.push(symbol);
          console.log(`❌ Row ${rowCount}: No match found for symbol: ${symbol}`);
        }
      })
      .on('end', async () => {
        try {
          console.log(`📊 CSV Processing Summary:`);
          console.log(`  📄 Total rows processed: ${rowCount}`);
          console.log(`  ✅ Successful matches: ${successfulMatches}`);
          console.log(`  ❌ Failed matches: ${failedMatches.length}`);
          if (failedMatches.length > 0) {
            console.log(`  ❌ Failed symbols: [${failedMatches.slice(0, 5).join(', ')}${failedMatches.length > 5 ? '...' : ''}]`);
          }
          console.log(`📥 CSV matched ${tokens.length} tokens from NSE500. Processing with smart subscription...`);
          
          // Log current state before processing
          console.log(`📊 Current state before processing:`);
          console.log(`  📋 Current filteredTokens: ${global.filteredTokens?.length || 0}`);
          console.log(`  📊 Current analysisDataStore: ${global.analysisDataStore?.size || 0}`);
          console.log(`  📈 Current historicalDataStore: ${global.historicalDataStore?.size || 0}`);

          if (tokens.length > 0) {
            console.log(`📊 Processing ${tokens.length} tokens with smart caching...`);
            
            // Get current subscription comparison to identify new vs existing tokens
            const { compareTokenLists } = require('./utils/tokenSubscriptionManager');
            const currentTokens = global.filteredTokens ? global.filteredTokens.map(ft => ft.token) : [];
            const comparison = compareTokenLists(currentTokens, tokens);
            
            console.log(`📊 Token analysis:`);
            console.log(`  🔢 CSV tokens: [${tokens.slice(0, 5).join(', ')}${tokens.length > 5 ? '...' : ''}]`);
            console.log(`  🔢 Current tokens: [${currentTokens.slice(0, 5).join(', ')}${currentTokens.length > 5 ? '...' : ''}]`);
            console.log(`  🆕 New tokens: ${comparison.newTokens.length} [${comparison.newTokens.slice(0, 3).join(', ')}${comparison.newTokens.length > 3 ? '...' : ''}]`);
            console.log(`  🔄 Existing tokens: ${comparison.unchangedTokens.length} [${comparison.unchangedTokens.slice(0, 3).join(', ')}${comparison.unchangedTokens.length > 3 ? '...' : ''}]`);
            console.log(`  🗑️ Tokens to remove: ${comparison.removedTokens.length} [${comparison.removedTokens.slice(0, 3).join(', ')}${comparison.removedTokens.length > 3 ? '...' : ''}]`);
            
            // Step 1: Calculate fresh analysis data ONLY for genuinely new tokens
            if (comparison.newTokens.length > 0) {
              console.log(`📊 Calculating fresh 1h data for ${comparison.newTokens.length} new tokens...`);
              for (const token of comparison.newTokens) {
                try {
                  await fetchHistoricalForToken(token);
                  await delay(200);
                } catch (tokenError) {
                  console.error(`❌ Error processing new token ${token}:`, tokenError.message);
                }
              }
              console.log(`✅ Fresh analysis data calculated for ${comparison.newTokens.length} new tokens`);
            }
            
            // Step 2: For existing tokens, ensure they remain in global.filteredTokens (preserve cache and continue tick updates)
            if (comparison.unchangedTokens.length > 0) {
              console.log(`📋 Preserving ${comparison.unchangedTokens.length} existing tokens with cache for continued tick updates`);
              
              // Ensure all existing tokens are in global.filteredTokens
              for (const token of comparison.unchangedTokens) {
                const existingInFiltered = global.filteredTokens.find(ft => ft.token == token);
                if (!existingInFiltered) {
                  // Token has cache but not in filteredTokens - add it back
                  const cachedAnalysisData = global.analysisDataStore.get(token.toString());
                  if (cachedAnalysisData) {
                    const instrument = instruments.instruments.find(i => i.instrument_token == token);
                    const symbol = instrument ? instrument.tradingsymbol : `TOKEN_${token}`;
                    
                    const filteredTokenData = {
                      token,
                      symbol,
                      rsi1h: cachedAnalysisData.rsi1h ? +cachedAnalysisData.rsi1h.toFixed(2) : null,
                      ema1h: cachedAnalysisData.ema1h ? +cachedAnalysisData.ema1h.toFixed(2) : null,
                      vwap1h: cachedAnalysisData.vwap1h ? +cachedAnalysisData.vwap1h.toFixed(2) : null,
                      gap1h: cachedAnalysisData.gap1h ? +cachedAnalysisData.gap1h.toFixed(2) : null,
                      rsi15m: cachedAnalysisData.rsi15m ? +cachedAnalysisData.rsi15m.toFixed(2) : null,
                      ema15m: cachedAnalysisData.ema15m ? +cachedAnalysisData.ema15m.toFixed(2) : null,
                      vwap15m: cachedAnalysisData.vwap15m ? +cachedAnalysisData.vwap15m.toFixed(2) : null,
                      gap15m: cachedAnalysisData.gap15m ? +cachedAnalysisData.gap15m.toFixed(2) : null,
                      chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}/${token}`
                    };
                    
                    global.filteredTokens.push(filteredTokenData);
                    console.log(`📋 Restored cached data for existing token ${token} (${symbol})`);
                  } else {
                    console.warn(`⚠️ No cached data found for existing token ${token}, calculating fresh data...`);
                    try {
                      await fetchHistoricalForToken(token);
                      await delay(200);
                    } catch (tokenError) {
                      console.error(`❌ Error calculating data for existing token ${token}:`, tokenError.message);
                    }
                  }
                } else {
                  console.log(`✅ Existing token ${token} already in filteredTokens - will continue receiving tick updates`);
                }
              }
            }
            
            // Step 3: Remove tokens that are no longer needed (unsubscribe and clean cache)
            if (comparison.removedTokens.length > 0) {
              console.log(`🗑️ Cleaning up data for ${comparison.removedTokens.length} removed tokens...`);
              for (const token of comparison.removedTokens) {
                try {
                  // Remove from filteredTokens
                  const beforeCount = global.filteredTokens.length;
                  global.filteredTokens = global.filteredTokens.filter(ft => ft.token != token);
                  const afterCount = global.filteredTokens.length;
                  
                  // Remove from analysisDataStore cache
                  if (global.analysisDataStore.has(token.toString())) {
                    global.analysisDataStore.delete(token.toString());
                    console.log(`🧹 Removed cache for token ${token}`);
                  }
                  
                  // Remove from historicalDataStore cache
                  if (global.historicalDataStore.has(token.toString())) {
                    global.historicalDataStore.delete(token.toString());
                    console.log(`🧹 Removed historical data cache for token ${token}`);
                  }
                  
                  if (beforeCount > afterCount) {
                    console.log(`🗑️ Removed token ${token} from filteredTokens`);
                  }
                } catch (cleanupError) {
                  console.error(`❌ Error cleaning up token ${token}:`, cleanupError.message);
                }
              }
            }
            
            // Step 4: Update global.filteredTokens to include ALL tokens from CSV (both new and existing)
            // Ensure we have all tokens from the CSV in filteredTokens for proper tick processing
            const allTokensFromCSV = new Set(tokens.map(t => parseInt(t)));
            const currentFilteredTokens = new Set(global.filteredTokens.map(ft => ft.token));
            
            // Find any CSV tokens that are missing from filteredTokens
            const missingTokens = [...allTokensFromCSV].filter(token => !currentFilteredTokens.has(token));
            
            if (missingTokens.length > 0) {
              console.log(`🔍 Found ${missingTokens.length} CSV tokens missing from filteredTokens, adding them...`);
              for (const token of missingTokens) {
                const cachedAnalysisData = global.analysisDataStore.get(token.toString());
                if (cachedAnalysisData) {
                  const instrument = instruments.instruments.find(i => i.instrument_token == token);
                  const symbol = instrument ? instrument.tradingsymbol : `TOKEN_${token}`;
                  
                  const filteredTokenData = {
                    token,
                    symbol,
                    rsi1h: cachedAnalysisData.rsi1h ? +cachedAnalysisData.rsi1h.toFixed(2) : null,
                    ema1h: cachedAnalysisData.ema1h ? +cachedAnalysisData.ema1h.toFixed(2) : null,
                    vwap1h: cachedAnalysisData.vwap1h ? +cachedAnalysisData.vwap1h.toFixed(2) : null,
                    gap1h: cachedAnalysisData.gap1h ? +cachedAnalysisData.gap1h.toFixed(2) : null,
                    rsi15m: cachedAnalysisData.rsi15m ? +cachedAnalysisData.rsi15m.toFixed(2) : null,
                    ema15m: cachedAnalysisData.ema15m ? +cachedAnalysisData.ema15m.toFixed(2) : null,
                    vwap15m: cachedAnalysisData.vwap15m ? +cachedAnalysisData.vwap15m.toFixed(2) : null,
                    gap15m: cachedAnalysisData.gap15m ? +cachedAnalysisData.gap15m.toFixed(2) : null,
                    chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}/${token}`
                  };
                  
                  global.filteredTokens.push(filteredTokenData);
                  console.log(`📋 Added missing token ${token} (${symbol}) to filteredTokens`);
                } else {
                  console.warn(`⚠️ Missing token ${token} has no cached data - this should not happen`);
                }
              }
            }
            
            console.log(`✅ Smart data processing completed: ${global.filteredTokens.length} total tokens in cache`);
            console.log(`📊 Final token breakdown:`);
            console.log(`  🆕 New tokens added: ${comparison.newTokens.length}`);
            console.log(`  🔄 Existing tokens preserved: ${comparison.unchangedTokens.length}`);
            console.log(`  🗑️ Tokens removed: ${comparison.removedTokens.length}`);
            console.log(`  📊 Total active tokens: ${global.filteredTokens.length}`);
            
            // Verification: Ensure all CSV tokens are in filteredTokens
            const csvTokenSet = new Set(tokens.map(t => parseInt(t)));
            const filteredTokenSet = new Set(global.filteredTokens.map(ft => ft.token));
            const missingFromFiltered = [...csvTokenSet].filter(token => !filteredTokenSet.has(token));
            const extraInFiltered = [...filteredTokenSet].filter(token => !csvTokenSet.has(token));
            
            if (missingFromFiltered.length > 0) {
              console.warn(`⚠️ WARNING: ${missingFromFiltered.length} CSV tokens missing from filteredTokens: [${missingFromFiltered.slice(0, 3).join(', ')}]`);
            }
            if (extraInFiltered.length > 0) {
              console.warn(`⚠️ WARNING: ${extraInFiltered.length} extra tokens in filteredTokens not in CSV: [${extraInFiltered.slice(0, 3).join(', ')}]`);
            }
            if (missingFromFiltered.length === 0 && extraInFiltered.length === 0) {
              console.log(`✅ VERIFICATION PASSED: All CSV tokens are properly synchronized with filteredTokens`);
            }
            
            // Step 5: Use smart token subscription management (this handles the actual ticker subscriptions)
            try {
              console.log(`🔄 About to call updateTokenSubscriptionsFromCSV with ${tokens.length} tokens`);
              console.log(`🔍 Token sample being passed to subscription manager: [${tokens.slice(0, 5).join(', ')}]`);
              console.log(`🔍 Token types being passed: [${tokens.slice(0, 5).map(t => typeof t).join(', ')}]`);
              
              const result = await updateTokenSubscriptionsFromCSV(tokens, filePath);
              console.log(`✅ Smart subscription completed: Added ${result?.changes?.added || 0}, Removed ${result?.changes?.removed || 0}, Unchanged ${result?.changes?.unchanged || 0}`);
              
              // Additional verification: Log what tokens were actually processed
              if (result?.details) {
                console.log(`🔍 Subscription manager processed:`);
                console.log(`  🆕 New tokens: [${result.details.newTokens.slice(0, 3).join(', ')}${result.details.newTokens.length > 3 ? '...' : ''}]`);
                console.log(`  🔄 Unchanged tokens: [${result.details.unchangedTokens.slice(0, 3).join(', ')}${result.details.unchangedTokens.length > 3 ? '...' : ''}]`);
                console.log(`  🗑️ Removed tokens: [${result.details.removedTokens.slice(0, 3).join(', ')}${result.details.removedTokens.length > 3 ? '...' : ''}]`);
              }
              
              // Step 6: Broadcast all token data to frontend
              setTimeout(() => {
                try {
                  broadcastAllSubscribedTokens(); // Broadcast updated token data
                  console.log(`📡 Broadcasted data for ${global.filteredTokens.length} tokens to frontend`);
                } catch (broadcastError) {
                  console.error(`❌ Error broadcasting token data:`, broadcastError.message);
                }
              }, 1000);
              
              resolve(result);
            } catch (subscriptionError) {
              console.error(`❌ Error in smart subscription management:`, subscriptionError.message);
              resolve({ 
                changes: { added: 0, removed: 0, unchanged: 0 }, 
                error: subscriptionError.message 
              });
            }
          } else {
            console.warn(`⚠️ No valid tokens found in CSV: ${filePath}`);
            
            // If CSV is empty, unsubscribe all current tokens and clear cache
            if (global.filteredTokens.length > 0) {
              console.log(`🧹 CSV is empty - cleaning up all ${global.filteredTokens.length} existing tokens`);
              
              try {
                const result = await updateTokenSubscriptionsFromCSV([], filePath);
                global.filteredTokens = [];
                global.analysisDataStore.clear();
                global.historicalDataStore.clear();
                
                console.log(`✅ All tokens unsubscribed and cache cleared`);
                resolve(result);
              } catch (cleanupError) {
                console.error(`❌ Error cleaning up tokens:`, cleanupError.message);
                resolve({ changes: { added: 0, removed: 0, unchanged: 0 }, error: cleanupError.message });
              }
            } else {
              resolve({ changes: { added: 0, removed: 0, unchanged: 0 } });
            }
          }
        } catch (error) {
          console.error(`❌ Error processing smart CSV import:`, error.message);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error(`❌ Error reading CSV file ${filePath}:`, error.message);
        reject(error);
      });
  });
}

// Legacy CSV watcher function (kept for backward compatibility, but not used)
function watchCSVForSubscriptions() {
  const downloadsPath = path.join(os.homedir(), 'Downloads');
  fs.watch(downloadsPath, (eventType, filename) => {
    if (eventType === 'rename' && filename.endsWith('.csv')) {
      const filePath = path.join(downloadsPath, filename);
      setTimeout(() => processCSVImport(filePath), 2000);
    }
  });
  console.log(`👀 Watching for CSV files in ${downloadsPath}`);
}

// Legacy CSV processor function (kept for backward compatibility, but replaced by smart version)
function processCSVImport(filePath) {
  const tokens = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      const symbol = row['Symbol']?.trim();
      if (!symbol) return;

      const match = instruments.instruments.find(inst => inst.tradingsymbol === symbol && inst.exchange === 'NSE');
      if (match) {
        tokens.push(match.instrument_token);
      }
    })
    .on('end', async () => {
      console.log(`📥 CSV matched ${tokens.length} tokens from NSE500. Calculating analysis data...`);

     // if (activeScanTimer) clearInterval(activeScanTimer);
      unsubscribeAll();

      //scanAndUpdateAllTokens();
     // activeScanTimer = setInterval(scanAndUpdateAllTokens, 5 * 60 * 1000);

      if (tokens.length > 0) {
        console.log(tokens);
        
        // Calculate analysis data for CSV tokens
        console.log(`📊 Calculating VWAP1h and EMA1h for ${tokens.length} CSV tokens...`);
        global.filteredTokens = [];
        for (const token of tokens) {
          await fetchHistoricalForToken(token);
          await delay(200);
        }
        console.log(`✅ Analysis data calculated for ${tokens.length} tokens`);
        
        subscribeToTokens(tokens); // Subscribe to CSV tokens
        console.log(`✅ Subscribed to ${tokens.length} tokens from filtered CSV`);
        
        setTimeout(() => {
          broadcastAllSubscribedTokens(); // Broadcast token data
        }, 1000);
      }
    })
    .on('error', (err) => {
      console.error(`❌ CSV processing error: ${err.message}`);
    });
}


// Auth routes
app.get('/login', (req, res) => {
  const loginUrl = kc.getLoginURL();
  res.redirect(loginUrl);
});

app.get('/login/callback', async (req, res) => {
  const requestToken = req.query.request_token;
  try {
    const session = await kc.generateSession(requestToken, apiSecret);
    kc.setAccessToken(session.access_token);
    fs.writeFileSync(accessTokenPath, session.access_token);
    console.log('✅ Logged in! Access token saved');
    global.kite = kc;
    initKiteConnect(session.access_token);
    initTickListener(); // Initialize original tick listener with simplified strategy after login

    res.send('Login successful. You can close this window.');
  } catch (err) {
    console.error('❌ Login failed:', err.message);
    res.status(500).send('Login failed');
  }
});

app.get('/data/:token', (req, res) => {
  const token = req.params.token;
  const data = global.historicalDataStore.get(token);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

app.get('/analysis/:token', (req, res) => {
  const token = req.params.token;
  const data = global.analysisDataStore.get(token);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

app.get('/filtered', (req, res) => {
  res.json(global.filteredTokens);
});

// Test endpoint to send sample data to frontend
app.get('/test-data', (req, res) => {
  console.log('📤 Sending test data to frontend...');
  
  // Send test token data
  const testTokenData = {
    token: 12345,
    symbol: 'TEST-STOCK',
    rsi1h: 65.5,
    rsi15m: 72.3,
    rsi1m: 68.1,
    ltp: 250.50,
    ema1h: 248.20,
    vwap1h: 249.80,
    gap1h: 0.65,
    ema15m: 249.10,
    vwap15m: 250.30,
    gap15m: 0.48,
    ema5m: 250.10,
    vwap5m: 250.40,
    gap5m: 0.12,
    chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/TEST-STOCK/12345`
  };

  global.broadcastToClients({
    type: "filtered_token_update",
    data: testTokenData
  });

  res.json({ success: true, message: 'Test data sent to frontend' });
});

// Manual scan endpoint
app.get('/manual-scan', async (req, res) => {
  console.log('🔄 Manual scan triggered...');
  try {
    await scanAndUpdateAllTokens();
    res.json({ success: true, message: 'Manual scan completed' });
  } catch (err) {
    console.error('❌ Manual scan failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(port, () => {
  console.log(`🚀 Server + WebSocket running at http://localhost:${port}`);
  if (!fs.existsSync(accessTokenPath)) {
    console.log(`🔑 To authenticate, visit: http://localhost:${port}/login`);
  }
});

// Graceful shutdown handling
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('⚠️ Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Clear any active scan timer
  if (activeScanTimer) {
    clearInterval(activeScanTimer);
    activeScanTimer = null;
    console.log('⏹️ Stopped active scan timer');
  }
  
  // Close all WebSocket connections
  if (clients.length > 0) {
    console.log(`🔌 Closing ${clients.length} WebSocket connections...`);
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Server shutting down');
      }
    });
    clients = [];
  }
  
  // Stop tick listener and unsubscribe all tokens
  try {
    console.log('📉 Cleaning up tick listener...');
    cleanup(); // Call tick listener cleanup
    unsubscribeAll();
  } catch (error) {
    console.error('❌ Error during tick listener cleanup:', error.message);
  }
  
  // Close WebSocket server
  wss.close(() => {
    console.log('🔌 WebSocket server closed');
    
    // Close HTTP server
    server.close(() => {
      console.log('🌐 HTTP server closed');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
  });
  
  // Force exit after 10 seconds if graceful shutdown takes too long
  setTimeout(() => {
    console.error('⚠️ Graceful shutdown timeout. Forcing exit...');
    process.exit(1);
  }, 10000);
}

// Handle different signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

console.log('🛡️ Graceful shutdown handlers registered');

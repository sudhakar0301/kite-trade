const fs = require("fs");
const path = require("path");
const csv = require('csv-parser');
const os = require('os');

/**
 * Smart Token Subscription Manager
 * Handles selective token subscription/unsubscription when new CSV files are detected
 * Avoids unnecessary disruption to existing subscriptions
 */

/**
 * Compare two token arrays and categorize them
 * @param {Array} currentTokens - Currently subscribed tokens
 * @param {Array} newTokens - New tokens from CSV file
 * @returns {Object} - { newTokens, unchangedTokens, removedTokens }
 */
function compareTokenLists(currentTokens, newTokens) {
  console.log(`🔍 DEBUG compareTokenLists:`);
  console.log(`  📊 Current tokens received: ${currentTokens.length} tokens`);
  console.log(`  📊 Current tokens sample: [${currentTokens.slice(0, 5).join(', ')}${currentTokens.length > 5 ? '...' : ''}]`);
  console.log(`  📊 Current token types: [${currentTokens.slice(0, 3).map(t => typeof t).join(', ')}]`);
  console.log(`  📊 New tokens received: ${newTokens.length} tokens`);
  console.log(`  📊 New tokens sample: [${newTokens.slice(0, 5).join(', ')}${newTokens.length > 5 ? '...' : ''}]`);
  console.log(`  📊 New token types: [${newTokens.slice(0, 3).map(t => typeof t).join(', ')}]`);
  
  const currentSet = new Set(currentTokens.map(String));
  const newSet = new Set(newTokens.map(String));
  
  console.log(`  🔍 Current tokens as strings: [${Array.from(currentSet).slice(0, 5).join(', ')}${currentSet.size > 5 ? '...' : ''}]`);
  console.log(`  🔍 New tokens as strings: [${Array.from(newSet).slice(0, 5).join(', ')}${newSet.size > 5 ? '...' : ''}]`);
  
  const categorizedTokens = {
    newTokens: [], // Present in new file but not currently subscribed
    unchangedTokens: [], // Present in both current subscription and new file
    removedTokens: [] // Currently subscribed but not present in new file
  };
  
  // Find new tokens (in newSet but not in currentSet)
  for (const token of newSet) {
    if (!currentSet.has(token)) {
      categorizedTokens.newTokens.push(token);
    }
  }
  
  // Find unchanged tokens (in both sets)
  for (const token of currentSet) {
    if (newSet.has(token)) {
      categorizedTokens.unchangedTokens.push(token);
    }
  }
  
  // Find removed tokens (in currentSet but not in newSet)
  for (const token of currentSet) {
    if (!newSet.has(token)) {
      categorizedTokens.removedTokens.push(token);
    }
  }
  
  console.log(`🔍 DEBUG comparison results:`);
  console.log(`  🆕 New tokens: ${categorizedTokens.newTokens.length} [${categorizedTokens.newTokens.slice(0, 3).join(', ')}${categorizedTokens.newTokens.length > 3 ? '...' : ''}]`);
  console.log(`  🔄 Unchanged tokens: ${categorizedTokens.unchangedTokens.length} [${categorizedTokens.unchangedTokens.slice(0, 3).join(', ')}${categorizedTokens.unchangedTokens.length > 3 ? '...' : ''}]`);
  console.log(`  🗑️ Removed tokens: ${categorizedTokens.removedTokens.length} [${categorizedTokens.removedTokens.slice(0, 3).join(', ')}${categorizedTokens.removedTokens.length > 3 ? '...' : ''}]`);
  
  return categorizedTokens;
}

/**
 * Clean up cache data for removed tokens
 * @param {Array} tokensToRemove - Array of tokens to clean up
 * @param {Object} tokenDataCache - Main token data cache
 * @param {Object} vwapDataCache - VWAP data cache
 */
function cleanupTokenCache(tokensToRemove, tokenDataCache, vwapDataCache) {
  console.log(`🧹 Cleaning up cache for ${tokensToRemove.length} removed tokens...`);
  
  let cleanedCount = 0;
  for (const token of tokensToRemove) {
    // Clean up main token data cache
    if (tokenDataCache[token]) {
      delete tokenDataCache[token];
      cleanedCount++;
    }
    
    // Clean up VWAP cache
    if (vwapDataCache[token]) {
      delete vwapDataCache[token];
    }
  }
  
  console.log(`✅ Cleaned up cache for ${cleanedCount} tokens`);
}

/**
 * Update ticker subscriptions selectively
 * @param {Object} ticker - KiteTicker instance
 * @param {Array} tokensToAdd - New tokens to subscribe
 * @param {Array} tokensToRemove - Tokens to unsubscribe
 */
function updateTickerSubscriptions(ticker, tokensToAdd, tokensToRemove) {
  console.log(`🔄 updateTickerSubscriptions called with:`);
  console.log(`  🆕 Tokens to add: ${tokensToAdd.length}`);
  console.log(`  🗑️ Tokens to remove: ${tokensToRemove.length}`);
  console.log(`  📡 Ticker status: ${ticker ? (ticker.connected() ? 'CONNECTED' : 'DISCONNECTED') : 'NULL'}`);
  
  if (!ticker) {
    console.error("❌ Ticker is null/undefined");
    return;
  }
  
  if (!ticker.connected()) {
    console.warn("⚠️ Ticker not connected, skipping subscription updates");
    return;
  }
  
  // Unsubscribe removed tokens
  if (tokensToRemove.length > 0) {
    try {
      const numericTokensToRemove = tokensToRemove.map(Number);
      console.log(`🛑 UNSUBSCRIBING ${tokensToRemove.length} removed tokens:`);
      console.log(`🛑 Tokens to unsubscribe: [${numericTokensToRemove.slice(0, 5).join(', ')}${numericTokensToRemove.length > 5 ? '...' : ''}]`);
      console.log(`🛑 Full list of tokens being unsubscribed:`, numericTokensToRemove);
      
      ticker.unsubscribe(numericTokensToRemove);
      console.log(`✅ Successfully called ticker.unsubscribe() for ${tokensToRemove.length} tokens`);
      
      // Broadcast unsubscription to UI
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: "tokens_unsubscribed",
          data: {
            unsubscribedTokens: numericTokensToRemove,
            count: numericTokensToRemove.length,
            timestamp: new Date().toISOString()
          }
        });
        console.log(`📡 Broadcasted unsubscription of ${numericTokensToRemove.length} tokens to UI`);
      }
    } catch (error) {
      console.error(`❌ Error unsubscribing tokens:`, error.message);
      console.error(`❌ Error stack:`, error.stack);
    }
  } else {
    console.log(`ℹ️ No tokens to unsubscribe`);
  }
  
  // Subscribe to new tokens
  if (tokensToAdd.length > 0) {
    try {
      const numericTokensToAdd = tokensToAdd.map(Number);
      console.log(`📡 SUBSCRIBING to ${tokensToAdd.length} new tokens:`);
      console.log(`📡 Tokens to subscribe: [${numericTokensToAdd.slice(0, 5).join(', ')}${numericTokensToAdd.length > 5 ? '...' : ''}]`);
      console.log(`📡 Full token list to subscribe (${numericTokensToAdd.length} tokens):`, numericTokensToAdd);
      console.log(`🔍 Verifying all tokens are numeric:`, numericTokensToAdd.every(t => typeof t === 'number' && !isNaN(t)));
      
      ticker.subscribe(numericTokensToAdd);
      ticker.setMode(ticker.modeFull, numericTokensToAdd);
      
      console.log(`✅ Successfully called ticker.subscribe() and ticker.setMode() for ${tokensToAdd.length} new tokens`);
      console.log(`🔍 Sample subscribed tokens: [${numericTokensToAdd.slice(0, 5).join(', ')}${numericTokensToAdd.length > 5 ? '...' : ''}]`);
      
      // Broadcast new subscriptions to UI
      if (global.broadcastToClients) {
        global.broadcastToClients({
          type: "tokens_subscribed",
          data: {
            subscribedTokens: numericTokensToAdd,
            count: numericTokensToAdd.length,
            timestamp: new Date().toISOString()
          }
        });
        console.log(`📡 Broadcasted subscription of ${numericTokensToAdd.length} new tokens to UI`);
      }
    } catch (error) {
      console.error(`❌ Error subscribing to tokens:`, error.message);
      console.error(`❌ Error stack:`, error.stack);
      console.error(`❌ Failed tokens sample:`, tokensToAdd.slice(0, 5));
    }
  } else {
    console.log(`ℹ️ No new tokens to subscribe`);
  }
}

/**
 * Parse CSV file and extract tokens
 * @param {string} csvFilePath - Path to CSV file
 * @returns {Promise<Array>} - Array of tokens from CSV
 */
function parseTokensFromCSV(csvFilePath) {
  return new Promise((resolve, reject) => {
    const tokens = [];
    
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        // Assuming CSV has a 'token' or 'instrument_token' column
        // Adjust this based on your CSV structure
        const token = row.token || row.instrument_token || row.Token || row.InstrumentToken;
        if (token && !isNaN(token)) {
          tokens.push(String(token));
        }
      })
      .on('end', () => {
        console.log(`📊 Parsed ${tokens.length} tokens from CSV: ${csvFilePath}`);
        resolve(tokens);
      })
      .on('error', (error) => {
        console.error(`❌ Error parsing CSV file ${csvFilePath}:`, error.message);
        reject(error);
      });
  });
}

/**
 * Main function to update token subscriptions intelligently
 * @param {Array} currentSubscribedTokens - Currently subscribed tokens array
 * @param {Array} newTokenList - New token list from CSV
 * @param {Object} ticker - KiteTicker instance
 * @param {Object} tokenDataCache - Main token data cache
 * @param {Object} vwapDataCache - VWAP data cache
 * @param {Function} initializeTokenData - Function to initialize new token data
 * @returns {Promise<Object>} - Updated subscription info
 */
async function updateTokenSubscriptions(
  currentSubscribedTokens, 
  newTokenList, 
  ticker, 
  tokenDataCache, 
  vwapDataCache, 
  initializeTokenData
) {
  try {
    console.log(`🔄 Smart token subscription update starting...`);
    console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length}, New list: ${newTokenList.length}`);
    console.log(`📡 Ticker status: ${ticker ? (ticker.connected() ? 'CONNECTED' : 'DISCONNECTED') : 'NULL'}`);
    
    // Validate inputs
    if (!Array.isArray(currentSubscribedTokens)) {
      console.error(`❌ currentSubscribedTokens is not an array:`, typeof currentSubscribedTokens);
      return null;
    }
    
    if (!Array.isArray(newTokenList)) {
      console.error(`❌ newTokenList is not an array:`, typeof newTokenList);
      return null;
    }
    
    // Compare token lists
    const comparison = compareTokenLists(currentSubscribedTokens, newTokenList);
    
    console.log(`📈 Token comparison results:`);
    console.log(`  🆕 New tokens: ${comparison.newTokens.length}`);
    console.log(`  🔄 Unchanged tokens: ${comparison.unchangedTokens.length}`);
    console.log(`  🗑️ Removed tokens: ${comparison.removedTokens.length}`);
    
    if (comparison.newTokens.length > 0) {
      console.log(`  🆕 Sample new tokens:`, comparison.newTokens.slice(0, 3));
    }
    if (comparison.removedTokens.length > 0) {
      console.log(`  🗑️ Sample removed tokens:`, comparison.removedTokens.slice(0, 3));
    }
    
    // Update ticker subscriptions
    try {
      updateTickerSubscriptions(ticker, comparison.newTokens, comparison.removedTokens);
    } catch (tickerError) {
      console.error(`❌ Error updating ticker subscriptions:`, tickerError.message);
      // Continue with other operations
    }
    
    // Clean up cache for removed tokens
    try {
      cleanupTokenCache(comparison.removedTokens, tokenDataCache, vwapDataCache);
    } catch (cleanupError) {
      console.error(`❌ Error cleaning up token cache:`, cleanupError.message);
      // Continue with other operations
    }
    
    // Initialize data for new tokens
    if (comparison.newTokens.length > 0) {
      console.log(`📊 Initializing historical data for ${comparison.newTokens.length} new tokens...`);
      let successCount = 0;
      
      for (const token of comparison.newTokens) {
        try {
          console.log(`📈 Initializing token: ${token}`);
          await initializeTokenData(token);
          successCount++;
          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          console.error(`❌ Error initializing new token ${token}: ${err.message}`);
          // Continue with next token
        }
      }
      
      console.log(`✅ Successfully initialized ${successCount}/${comparison.newTokens.length} new tokens`);
    }
    
    // Update the subscribed tokens array
    // Convert all tokens to numbers for consistency with ticker subscriptions
    const updatedSubscribedTokens = [...comparison.unchangedTokens, ...comparison.newTokens].map(Number);
    
    console.log(`✅ Smart subscription update completed`);
    console.log(`📊 Final subscription count: ${updatedSubscribedTokens.length}`);
    
    // Broadcast comprehensive subscription update to UI
    if (global.broadcastToClients) {
      global.broadcastToClients({
        type: "subscription_update_complete",
        data: {
          totalSubscribed: updatedSubscribedTokens.length,
          changes: {
            added: comparison.newTokens.length,
            removed: comparison.removedTokens.length,
            unchanged: comparison.unchangedTokens.length
          },
          addedTokens: comparison.newTokens.map(Number),
          removedTokens: comparison.removedTokens.map(Number),
          allSubscribedTokens: updatedSubscribedTokens,
          timestamp: new Date().toISOString()
        }
      });
      console.log(`📡 Broadcasted comprehensive subscription update to UI`);
    }
    
    // Broadcast actual token data with historical calculations to frontend
    // Always broadcast if we have any subscribed tokens (new or unchanged)
    if (updatedSubscribedTokens.length > 0 && global.broadcastAllSubscribedTokens) {
      console.log(`📊 Broadcasting historical data for all ${updatedSubscribedTokens.length} subscribed tokens...`);
      setTimeout(() => {
        try {
          global.broadcastAllSubscribedTokens();
          console.log(`✅ Successfully broadcasted historical data for ${updatedSubscribedTokens.length} tokens`);
        } catch (broadcastError) {
          console.error(`❌ Error broadcasting historical token data:`, broadcastError.message);
        }
      }, 500); // Small delay to ensure all initialization is complete
    }
    
    return {
      updatedTokens: updatedSubscribedTokens,
      changes: {
        added: comparison.newTokens.length,
        removed: comparison.removedTokens.length,
        unchanged: comparison.unchangedTokens.length
      },
      details: comparison
    };
    
  } catch (error) {
    console.error(`❌ Critical error in updateTokenSubscriptions:`, error.message);
    console.error(`❌ Error stack:`, error.stack);
    
    // Return the current state to prevent complete failure
    return {
      updatedTokens: currentSubscribedTokens || [],
      changes: {
        added: 0,
        removed: 0,
        unchanged: currentSubscribedTokens?.length || 0
      },
      details: null,
      error: error.message
    };
  }
}

/**
 * Setup file watcher for Downloads folder to detect new CSV files
 * @param {Function} onNewCSVDetected - Callback function when new CSV is detected (receives tokens array and file path)
 * @returns {Object} - File watcher instance
 */
function setupCSVFileWatcher(onNewCSVDetected) {
  const downloadsPath = path.join(os.homedir(), 'Downloads');
  
  if (!fs.existsSync(downloadsPath)) {
    console.error(`❌ Downloads folder not found: ${downloadsPath}`);
    return null;
  }
  
  console.log(`👀 Setting up CSV file watcher for: ${downloadsPath}`);
  
  const chokidar = require('chokidar');
  
  const watcher = chokidar.watch(downloadsPath, {
    ignored: /[\/\\]\./,
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('add', async (filePath) => {
    if (path.extname(filePath).toLowerCase() === '.csv') {
      console.log(`📁 New CSV file detected: ${filePath}`);
      
      // Set a timeout for CSV processing to prevent hanging
      const csvProcessingTimeout = setTimeout(() => {
        console.error(`⏰ CSV processing timeout (60s) reached for: ${filePath}`);
      }, 60000); // 60 second timeout
      
      try {
        // Small delay to ensure file is fully written
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Parse tokens from the new CSV using server's format
        const newTokens = await parseTokensFromCSVWithSymbols(filePath);
        
        if (newTokens.length > 0) {
          console.log(`🎯 Calling CSV detection callback with ${newTokens.length} tokens`);
          try {
            await onNewCSVDetected(newTokens, filePath);
            console.log(`✅ CSV detection callback completed successfully`);
          } catch (callbackError) {
            console.error(`❌ Error in CSV detection callback:`, callbackError.message);
            console.error(`❌ Callback error stack:`, callbackError.stack);
            // Don't re-throw to prevent watcher from crashing
          }
        } else {
          console.warn(`⚠️ No valid tokens found in CSV: ${filePath}`);
        }
      } catch (error) {
        console.error(`❌ Error processing new CSV file ${filePath}:`, error.message);
        console.error(`❌ Processing error stack:`, error.stack);
        // Continue watching for other files
      } finally {
        // Clear the timeout
        clearTimeout(csvProcessingTimeout);
      }
    }
  });
  
  watcher.on('error', error => {
    console.error(`❌ File watcher error:`, error);
  });
  
  return watcher;
}

/**
 * Parse CSV file and extract tokens using the server's symbol matching logic
 * @param {string} csvFilePath - Path to CSV file
 * @returns {Promise<Array>} - Array of tokens from CSV
 */
function parseTokensFromCSVWithSymbols(csvFilePath) {
  return new Promise((resolve, reject) => {
    console.log(`📊 Starting to parse CSV file: ${csvFilePath}`);
    const tokens = [];
    
    try {
      // Check if file exists
      if (!fs.existsSync(csvFilePath)) {
        reject(new Error(`CSV file not found: ${csvFilePath}`));
        return;
      }
      
      // Get instruments data for symbol matching
      const instruments = require('../data/nse500.json');
      console.log(`📊 Loaded ${instruments.instruments?.length || 0} instruments for matching`);
      
      if (!instruments.instruments || instruments.instruments.length === 0) {
        reject(new Error('No instruments data available for symbol matching'));
        return;
      }
      
      let rowCount = 0;
      let matchCount = 0;
      let errorCount = 0;
      
      const readStream = fs.createReadStream(csvFilePath);
      
      readStream.on('error', (error) => {
        console.error(`❌ Error reading CSV file ${csvFilePath}:`, error.message);
        reject(error);
      });
      
      const csvParser = require('csv-parser')();
      
      csvParser.on('error', (error) => {
        console.error(`❌ Error parsing CSV content ${csvFilePath}:`, error.message);
        reject(error);
      });
      
      readStream
        .pipe(csvParser)
        .on('data', (row) => {
          try {
            rowCount++;
            
            // Use the same logic as the server's CSV processing
            const symbol = row['Symbol']?.trim();
            if (!symbol) {
              console.log(`⚠️ Row ${rowCount}: No Symbol column found in row:`, Object.keys(row));
              return;
            }

            const match = instruments.instruments.find(inst => 
              inst.tradingsymbol === symbol && inst.exchange === 'NSE'
            );
            if (match) {
              tokens.push(String(match.instrument_token));
              matchCount++;
              console.log(`✅ Row ${rowCount}: Matched ${symbol} -> ${match.instrument_token}`);
            } else {
              console.log(`❌ Row ${rowCount}: No match found for symbol: ${symbol}`);
            }
          } catch (rowError) {
            errorCount++;
            console.error(`❌ Error processing row ${rowCount}:`, rowError.message);
            // Continue processing other rows
          }
        })
        .on('end', () => {
          console.log(`📊 CSV parsing completed:`);
          console.log(`  📄 Total rows processed: ${rowCount}`);
          console.log(`  ✅ Successful matches: ${matchCount}`);
          console.log(`  ❌ Row errors: ${errorCount}`);
          console.log(`  📊 Parsed ${tokens.length} tokens from CSV using symbol matching: ${csvFilePath}`);
          resolve(tokens);
        })
        .on('error', (error) => {
          console.error(`❌ Error in CSV stream processing ${csvFilePath}:`, error.message);
          reject(error);
        });
        
    } catch (error) {
      console.error(`❌ Critical error in parseTokensFromCSVWithSymbols:`, error.message);
      reject(error);
    }
  });
}

/**
 * Cleanup function to properly close CSV file watcher
 * @param {Object} watcher - Chokidar watcher instance to close
 */
function cleanupCSVWatcher(watcher) {
  if (watcher) {
    try {
      watcher.close();
      console.log('📂 CSV file watcher stopped');
      return true;
    } catch (error) {
      console.error('❌ Error stopping CSV file watcher:', error.message);
      return false;
    }
  }
  return true;
}

module.exports = {
  compareTokenLists,
  cleanupTokenCache,
  updateTickerSubscriptions,
  parseTokensFromCSV,
  parseTokensFromCSVWithSymbols,
  updateTokenSubscriptions,
  setupCSVFileWatcher,
  cleanupCSVWatcher
};

const { compareTokenLists } = require('./utils/tokenSubscriptionManager');
const { parseTokensFromCSVWithSymbols } = require('./utils/tokenSubscriptionManager');
const path = require('path');

/**
 * Live Simulation Test - Tests the subscription logic as if it's running live
 * This simulates the actual workflow that would happen in production
 */

// Get instruments data
const instrumentsData = require('./data/nse500.json');
const instruments = instrumentsData.instruments;

// Create symbol to token mapping
const symbolToToken = {};
instruments.forEach(instrument => {
  if (instrument.tradingsymbol && instrument.instrument_token) {
    symbolToToken[instrument.tradingsymbol] = instrument.instrument_token.toString();
  }
});

// Simulate a live trading session with multiple CSV file changes
async function simulateLiveTradingSession() {
  console.log('🚀 LIVE TRADING SESSION SIMULATION');
  console.log('='.repeat(60));
  
  // Initial state - no subscriptions
  let currentSubscribedTokens = [];
  console.log('⏰ 09:00 AM - Market opening, no subscriptions yet');
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  // Scenario 1: Morning - Subscribe to initial batch
  console.log('\n⏰ 09:15 AM - Loading initial strategy tokens');
  const csv1 = await parseTokensFromCSVWithSymbols('./test_scenario_1_new_tokens.csv');
  const result1 = compareTokenLists(currentSubscribedTokens, csv1);
  currentSubscribedTokens = [...result1.unchangedTokens, ...result1.newTokens];
  console.log(`📈 Added ${result1.newTokens.length} new tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  // Scenario 2: Mid-morning - Partial strategy change
  console.log('\n⏰ 10:30 AM - Strategy adjustment - partial overlap');
  const csv2 = await parseTokensFromCSVWithSymbols('./test_scenario_2_partial_overlap.csv');
  const result2 = compareTokenLists(currentSubscribedTokens, csv2);
  currentSubscribedTokens = [...result2.unchangedTokens, ...result2.newTokens];
  console.log(`📈 Added ${result2.newTokens.length} new tokens`);
  console.log(`📉 Removed ${result2.removedTokens.length} tokens`);
  console.log(`🔄 Kept ${result2.unchangedTokens.length} unchanged tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  // Scenario 3: Noon - No change (same file loaded again)
  console.log('\n⏰ 12:00 PM - Same strategy file loaded again');
  const csv3 = await parseTokensFromCSVWithSymbols('./test_scenario_2_partial_overlap.csv');
  const result3 = compareTokenLists(currentSubscribedTokens, csv3);
  currentSubscribedTokens = [...result3.unchangedTokens, ...result3.newTokens];
  console.log(`📈 Added ${result3.newTokens.length} new tokens`);
  console.log(`📉 Removed ${result3.removedTokens.length} tokens`);
  console.log(`🔄 Kept ${result3.unchangedTokens.length} unchanged tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens (no change expected)`);
  
  // Scenario 4: Afternoon - Complete strategy overhaul
  console.log('\n⏰ 01:30 PM - Complete strategy overhaul');
  const csv4 = await parseTokensFromCSVWithSymbols('./test_scenario_4_complete_replacement.csv');
  const result4 = compareTokenLists(currentSubscribedTokens, csv4);
  currentSubscribedTokens = [...result4.unchangedTokens, ...result4.newTokens];
  console.log(`📈 Added ${result4.newTokens.length} new tokens`);
  console.log(`📉 Removed ${result4.removedTokens.length} tokens`);
  console.log(`🔄 Kept ${result4.unchangedTokens.length} unchanged tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  // Scenario 5: Late afternoon - Scale down
  console.log('\n⏰ 02:45 PM - Scaling down to fewer tokens');
  const csv5 = await parseTokensFromCSVWithSymbols('./test_scenario_5_subset.csv');
  const result5 = compareTokenLists(currentSubscribedTokens, csv5);
  currentSubscribedTokens = [...result5.unchangedTokens, ...result5.newTokens];
  console.log(`📈 Added ${result5.newTokens.length} new tokens`);
  console.log(`📉 Removed ${result5.removedTokens.length} tokens`);
  console.log(`🔄 Kept ${result5.unchangedTokens.length} unchanged tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  // Scenario 6: Before market close - Big expansion
  console.log('\n⏰ 03:00 PM - Large expansion for end-of-day scanning');
  const csv6 = await parseTokensFromCSVWithSymbols('./test_scenario_6_extended_set.csv');
  const result6 = compareTokenLists(currentSubscribedTokens, csv6);
  currentSubscribedTokens = [...result6.unchangedTokens, ...result6.newTokens];
  console.log(`📈 Added ${result6.newTokens.length} new tokens`);
  console.log(`📉 Removed ${result6.removedTokens.length} tokens`);
  console.log(`🔄 Kept ${result6.unchangedTokens.length} unchanged tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  // Scenario 7: Market close - Clean shutdown
  console.log('\n⏰ 03:30 PM - Market closing, unsubscribe all');
  const csv7 = await parseTokensFromCSVWithSymbols('./test_scenario_7_empty.csv');
  const result7 = compareTokenLists(currentSubscribedTokens, csv7);
  currentSubscribedTokens = [...result7.unchangedTokens, ...result7.newTokens];
  console.log(`📈 Added ${result7.newTokens.length} new tokens`);
  console.log(`📉 Removed ${result7.removedTokens.length} tokens`);
  console.log(`🔄 Kept ${result7.unchangedTokens.length} unchanged tokens`);
  console.log(`📊 Current subscriptions: ${currentSubscribedTokens.length} tokens`);
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 LIVE TRADING SESSION SUMMARY');
  console.log('='.repeat(60));
  
  // Calculate total operations
  const allResults = [result1, result2, result3, result4, result5, result6, result7];
  const totalOps = allResults.reduce((acc, result) => ({
    added: acc.added + result.newTokens.length,
    removed: acc.removed + result.removedTokens.length,
    unchanged: acc.unchanged + result.unchangedTokens.length
  }), { added: 0, removed: 0, unchanged: 0 });
  
  console.log(`🔢 Total operations during the session:`);
  console.log(`  🆕 Total subscriptions added: ${totalOps.added}`);
  console.log(`  🗑️ Total subscriptions removed: ${totalOps.removed}`);
  console.log(`  🔄 Total unchanged operations: ${totalOps.unchanged}`);
  console.log(`  ⚡ Total API calls saved by smart logic: ${totalOps.unchanged}`);
  
  // Efficiency calculation
  const totalPossibleOps = allResults.reduce((acc, result) => 
    acc + result.newTokens.length + result.removedTokens.length + result.unchangedTokens.length, 0);
  const actualOps = totalOps.added + totalOps.removed;
  const efficiency = ((totalPossibleOps - actualOps) / totalPossibleOps * 100).toFixed(1);
  
  console.log(`\n📈 EFFICIENCY METRICS:`);
  console.log(`  🎯 Total operations avoided: ${totalOps.unchanged}`);
  console.log(`  🎯 Efficiency gained: ${efficiency}% (by not re-subscribing unchanged tokens)`);
  console.log(`  🎯 Actual API calls needed: ${actualOps} out of ${totalPossibleOps} possible`);
  
  console.log(`\n✅ Session completed successfully!`);
  console.log(`🏁 Final state: ${currentSubscribedTokens.length} tokens subscribed (clean shutdown)`);
  
  return {
    success: true,
    totalOperations: totalOps,
    efficiency: efficiency,
    sessionResults: allResults
  };
}

// Run the live simulation
console.log('🎬 Starting live trading session simulation...\n');
simulateLiveTradingSession()
  .then(result => {
    console.log('\n🎉 Live simulation completed successfully!');
    console.log(`📊 Efficiency: ${result.efficiency}% API calls saved`);
  })
  .catch(error => {
    console.error('❌ Live simulation failed:', error.message);
  });

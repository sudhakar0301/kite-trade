const { compareTokenLists } = require('./utils/tokenSubscriptionManager');
const { parseTokensFromCSVWithSymbols } = require('./utils/tokenSubscriptionManager');
const path = require('path');

/**
 * Advanced test suite for token subscription logic
 * Tests realistic scenarios with actual token comparisons
 */

// Get instruments data
const instrumentsData = require('./data/nse500.json');
const instruments = instrumentsData.instruments;

// Create symbol to token mapping using tradingsymbol
const symbolToToken = {};
instruments.forEach(instrument => {
  if (instrument.tradingsymbol && instrument.instrument_token) {
    symbolToToken[instrument.tradingsymbol] = instrument.instrument_token.toString();
  }
});

console.log('📊 Available tokens mapping:', Object.keys(symbolToToken).length);
console.log('Sample mappings:', Object.entries(symbolToToken).slice(0, 5));

// Function to convert symbols to tokens
function convertSymbolsToTokens(symbols) {
  const result = symbols.map(symbol => symbolToToken[symbol]).filter(token => token);
  console.log(`🔄 Converting symbols [${symbols.join(', ')}] to tokens [${result.join(', ')}]`);
  return result;
}

// Realistic test scenarios with actual existing subscriptions
const advancedTestScenarios = [
  {
    name: "Scenario A: Fresh Start - All New Tokens",
    csvFile: "test_scenario_1_new_tokens.csv",
    currentTokens: [], // No existing subscriptions
    description: "Starting fresh with 5 new tokens"
  },
  {
    name: "Scenario B: Partial Overlap - Mixed New and Existing",
    csvFile: "test_scenario_2_partial_overlap.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY']), // 3 existing tokens
    description: "3 existing tokens, CSV has 2 existing + 3 new tokens"
  },
  {
    name: "Scenario C: Perfect Match - All Existing",
    csvFile: "test_scenario_3_all_existing.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "All 5 tokens already subscribed, no changes expected"
  },
  {
    name: "Scenario D: Complete Replacement",
    csvFile: "test_scenario_4_complete_replacement.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "Replace all 5 existing tokens with 5 completely different tokens"
  },
  {
    name: "Scenario E: Downsize - Removing Tokens",
    csvFile: "test_scenario_5_subset.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "From 5 tokens down to 2 tokens (should remove 3)"
  },
  {
    name: "Scenario F: Expansion - Adding More Tokens",
    csvFile: "test_scenario_6_extended_set.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY']), // Start with 3
    description: "From 3 tokens expand to 10 tokens (should add 7)"
  },
  {
    name: "Scenario G: Full Cleanup - Empty CSV",
    csvFile: "test_scenario_7_empty.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "Remove all subscriptions (unsubscribe everything)"
  }
];

async function runAdvancedTestScenario(scenario) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 ${scenario.name}`);
  console.log(`📝 ${scenario.description}`);
  console.log(`📁 CSV File: ${scenario.csvFile}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    // Parse tokens from CSV file
    console.log(`📊 Parsing tokens from CSV: ${scenario.csvFile}`);
    const csvPath = path.join(__dirname, scenario.csvFile);
    const newTokens = await parseTokensFromCSVWithSymbols(csvPath);
    
    console.log(`\n📈 INPUT STATE:`);
    console.log(`  🔍 Current subscribed tokens: ${scenario.currentTokens.length}`);
    console.log(`  🔍 Current tokens: [${scenario.currentTokens.slice(0, 10).join(', ')}${scenario.currentTokens.length > 10 ? '...' : ''}]`);
    console.log(`  🔍 New tokens from CSV: ${newTokens.length}`);
    console.log(`  🔍 New tokens: [${newTokens.slice(0, 10).join(', ')}${newTokens.length > 10 ? '...' : ''}]`);
    
    // Run comparison
    const comparison = compareTokenLists(scenario.currentTokens, newTokens);
    
    console.log(`\n📊 COMPARISON RESULTS:`);
    console.log(`  🆕 New tokens to subscribe: ${comparison.newTokens.length}`);
    if (comparison.newTokens.length > 0) {
      console.log(`     ${comparison.newTokens.length > 10 ? 
        `[${comparison.newTokens.slice(0, 10).join(', ')}...]` :
        `[${comparison.newTokens.join(', ')}]`}`);
    }
    console.log(`  🔄 Unchanged tokens: ${comparison.unchangedTokens.length}`);
    if (comparison.unchangedTokens.length > 0) {
      console.log(`     ${comparison.unchangedTokens.length > 10 ? 
        `[${comparison.unchangedTokens.slice(0, 10).join(', ')}...]` :
        `[${comparison.unchangedTokens.join(', ')}]`}`);
    }
    console.log(`  🗑️ Tokens to unsubscribe: ${comparison.removedTokens.length}`);
    if (comparison.removedTokens.length > 0) {
      console.log(`     ${comparison.removedTokens.length > 10 ? 
        `[${comparison.removedTokens.slice(0, 10).join(', ')}...]` :
        `[${comparison.removedTokens.join(', ')}]`}`);
    }
    
    // Advanced validation
    console.log(`\n✅ VALIDATION CHECKS:`);
    const current = scenario.currentTokens.length;
    const newCsv = newTokens.length;
    const unchanged = comparison.unchangedTokens.length;
    const toAdd = comparison.newTokens.length;
    const toRemove = comparison.removedTokens.length;
    
    // Check 1: Current tokens should equal unchanged + removed
    const check1 = (unchanged + toRemove) === current;
    console.log(`  ✓ Current tokens consistency: ${current} = ${unchanged} unchanged + ${toRemove} removed = ${unchanged + toRemove} ${check1 ? '✅' : '❌'}`);
    
    // Check 2: New CSV tokens should equal unchanged + toAdd
    const check2 = (unchanged + toAdd) === newCsv;
    console.log(`  ✓ New CSV tokens consistency: ${newCsv} = ${unchanged} unchanged + ${toAdd} new = ${unchanged + toAdd} ${check2 ? '✅' : '❌'}`);
    
    // Check 3: Final subscription count
    const finalCount = unchanged + toAdd;
    console.log(`  ✓ Final subscription count: ${finalCount} tokens`);
    
    // Check 4: No duplicates in each category
    const uniqueNew = new Set(comparison.newTokens).size === comparison.newTokens.length;
    const uniqueUnchanged = new Set(comparison.unchangedTokens).size === comparison.unchangedTokens.length;
    const uniqueRemoved = new Set(comparison.removedTokens).size === comparison.removedTokens.length;
    
    console.log(`  ✓ No duplicates in new tokens: ${uniqueNew ? '✅' : '❌'}`);
    console.log(`  ✓ No duplicates in unchanged tokens: ${uniqueUnchanged ? '✅' : '❌'}`);
    console.log(`  ✓ No duplicates in removed tokens: ${uniqueRemoved ? '✅' : '❌'}`);
    
    // Check 5: No overlaps between categories
    const newSet = new Set(comparison.newTokens);
    const unchangedSet = new Set(comparison.unchangedTokens);
    const removedSet = new Set(comparison.removedTokens);
    
    const noOverlapNewUnchanged = comparison.newTokens.every(token => !unchangedSet.has(token));
    const noOverlapNewRemoved = comparison.newTokens.every(token => !removedSet.has(token));
    const noOverlapUnchangedRemoved = comparison.unchangedTokens.every(token => !removedSet.has(token));
    
    console.log(`  ✓ No overlap new/unchanged: ${noOverlapNewUnchanged ? '✅' : '❌'}`);
    console.log(`  ✓ No overlap new/removed: ${noOverlapNewRemoved ? '✅' : '❌'}`);
    console.log(`  ✓ No overlap unchanged/removed: ${noOverlapUnchangedRemoved ? '✅' : '❌'}`);
    
    const allChecks = check1 && check2 && uniqueNew && uniqueUnchanged && uniqueRemoved && 
                      noOverlapNewUnchanged && noOverlapNewRemoved && noOverlapUnchangedRemoved;
    
    if (allChecks) {
      console.log(`  🎉 ${scenario.name}: ✅ ALL VALIDATION CHECKS PASSED`);
    } else {
      console.log(`  ❌ ${scenario.name}: VALIDATION FAILED`);
    }
    
    // Summary of changes
    console.log(`\n📋 CHANGE SUMMARY:`);
    console.log(`  📊 Before: ${current} tokens subscribed`);
    console.log(`  📊 After: ${finalCount} tokens subscribed`);
    console.log(`  📊 Net change: ${finalCount - current > 0 ? '+' : ''}${finalCount - current}`);
    console.log(`  🔄 Operations: +${toAdd} new, -${toRemove} removed, =${unchanged} unchanged`);
    
    return { 
      passed: allChecks, 
      comparison,
      metrics: {
        before: current,
        after: finalCount,
        netChange: finalCount - current,
        operations: { added: toAdd, removed: toRemove, unchanged: unchanged }
      }
    };
    
  } catch (error) {
    console.error(`❌ Error in scenario ${scenario.name}:`, error.message);
    return { passed: false, error: error.message };
  }
}

async function runAllAdvancedTests() {
  console.log(`🚀 Starting ADVANCED token subscription logic tests...`);
  console.log(`📋 Total scenarios to test: ${advancedTestScenarios.length}`);
  
  const results = [];
  let totalOperations = { added: 0, removed: 0, unchanged: 0 };
  
  for (const scenario of advancedTestScenarios) {
    const result = await runAdvancedTestScenario(scenario);
    results.push({ 
      scenario: scenario.name, 
      passed: result.passed,
      details: result
    });
    
    if (result.metrics) {
      totalOperations.added += result.metrics.operations.added;
      totalOperations.removed += result.metrics.operations.removed;
      totalOperations.unchanged += result.metrics.operations.unchanged;
    }
    
    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Comprehensive Summary
  console.log(`\n${'='.repeat(100)}`);
  console.log(`📊 COMPREHENSIVE TEST SUMMARY`);
  console.log(`${'='.repeat(100)}`);
  
  let passedCount = 0;
  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const metrics = result.details.metrics;
    const changeStr = metrics ? `(${metrics.before}→${metrics.after}, Δ${metrics.netChange})` : '';
    console.log(`${index + 1}. ${result.scenario}: ${status} ${changeStr}`);
    if (result.passed) passedCount++;
  });
  
  console.log(`\n🔢 TOTAL OPERATIONS ACROSS ALL TESTS:`);
  console.log(`  🆕 Total tokens added: ${totalOperations.added}`);
  console.log(`  🗑️ Total tokens removed: ${totalOperations.removed}`);
  console.log(`  🔄 Total tokens unchanged: ${totalOperations.unchanged}`);
  
  console.log(`\n🏆 FINAL RESULT: ${passedCount}/${results.length} tests passed`);
  
  if (passedCount === results.length) {
    console.log(`🎉 ALL ADVANCED TESTS PASSED! ✅`);
    console.log(`🔧 Token subscription logic is ROBUST and handles all scenarios correctly.`);
  } else {
    console.log(`⚠️  Some tests failed. Review the logic carefully. ❌`);
  }
  
  return results;
}

// Run the advanced tests
runAllAdvancedTests().catch(console.error);

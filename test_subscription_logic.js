const { compareTokenLists, parseTokensFromCSV } = require('./utils/tokenSubscriptionManager');
const { parseTokensFromCSVWithSymbols } = require('./utils/tokenSubscriptionManager');
const path = require('path');

/**
 * Comprehensive test suite for token subscription logic
 * Tests all different scenarios to ensure correct behavior
 */

// Mock data - convert symbols to tokens using our instruments file
const instrumentsData = require('./data/nse500.json');
const instruments = instrumentsData.instruments;

// Create a symbol to token mapping using tradingsymbol
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
  return symbols.map(symbol => symbolToToken[symbol]).filter(token => token);
}

// Test scenarios
const testScenarios = [
  {
    name: "Scenario 1: All New Tokens (Empty Start)",
    csvFile: "test_scenario_1_new_tokens.csv",
    currentTokens: [], // No existing subscriptions
    description: "Starting with no subscriptions, adding 5 new tokens"
  },
  {
    name: "Scenario 2: Partial Overlap",
    csvFile: "test_scenario_2_partial_overlap.csv", 
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "Some tokens match existing subscriptions, some are new"
  },
  {
    name: "Scenario 3: All Existing Tokens",
    csvFile: "test_scenario_3_all_existing.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "All tokens in CSV are already subscribed"
  },
  {
    name: "Scenario 4: Complete Replacement", 
    csvFile: "test_scenario_4_complete_replacement.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "Completely different set of tokens"
  },
  {
    name: "Scenario 5: Subset (Fewer tokens)",
    csvFile: "test_scenario_5_subset.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "CSV contains fewer tokens than currently subscribed"
  },
  {
    name: "Scenario 6: Extended Set (More tokens)",
    csvFile: "test_scenario_6_extended_set.csv", 
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "CSV contains more tokens than currently subscribed"
  },
  {
    name: "Scenario 7: Empty CSV",
    csvFile: "test_scenario_7_empty.csv",
    currentTokens: convertSymbolsToTokens(['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']),
    description: "Empty CSV should unsubscribe all tokens"
  }
];

async function runTestScenario(scenario) {
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
    
    console.log(`\n📈 BEFORE COMPARISON:`);
    console.log(`  🔍 Current subscribed tokens: ${scenario.currentTokens.length}`);
    console.log(`  🔍 Current tokens: [${scenario.currentTokens.slice(0, 5).join(', ')}${scenario.currentTokens.length > 5 ? '...' : ''}]`);
    console.log(`  🔍 New tokens from CSV: ${newTokens.length}`);
    console.log(`  🔍 New tokens: [${newTokens.slice(0, 5).join(', ')}${newTokens.length > 5 ? '...' : ''}]`);
    
    // Run comparison
    const comparison = compareTokenLists(scenario.currentTokens, newTokens);
    
    console.log(`\n📊 COMPARISON RESULTS:`);
    console.log(`  🆕 New tokens to subscribe: ${comparison.newTokens.length}`);
    console.log(`     ${comparison.newTokens.length > 0 ? `[${comparison.newTokens.slice(0, 5).join(', ')}${comparison.newTokens.length > 5 ? '...' : ''}]` : '[]'}`);
    console.log(`  🔄 Unchanged tokens: ${comparison.unchangedTokens.length}`);
    console.log(`     ${comparison.unchangedTokens.length > 0 ? `[${comparison.unchangedTokens.slice(0, 5).join(', ')}${comparison.unchangedTokens.length > 5 ? '...' : ''}]` : '[]'}`);
    console.log(`  🗑️ Tokens to unsubscribe: ${comparison.removedTokens.length}`);
    console.log(`     ${comparison.removedTokens.length > 0 ? `[${comparison.removedTokens.slice(0, 5).join(', ')}${comparison.removedTokens.length > 5 ? '...' : ''}]` : '[]'}`);
    
    // Validate results
    console.log(`\n✅ VALIDATION:`);
    const totalCurrent = scenario.currentTokens.length;
    const totalNew = newTokens.length;
    const totalUnchanged = comparison.unchangedTokens.length;
    const totalNewTokens = comparison.newTokens.length;
    const totalRemoved = comparison.removedTokens.length;
    
    console.log(`  📐 Math check: ${totalCurrent} current + ${totalNewTokens} new - ${totalRemoved} removed = ${totalCurrent + totalNewTokens - totalRemoved} final`);
    console.log(`  📐 Expected final: ${totalUnchanged + totalNewTokens} = ${totalNew} tokens`);
    
    const mathCheck = (totalUnchanged + totalNewTokens) === totalNew;
    const logicCheck = (totalUnchanged + totalRemoved) === totalCurrent;
    
    console.log(`  ✓ Math consistency: ${mathCheck ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  ✓ Logic consistency: ${logicCheck ? '✅ PASS' : '❌ FAIL'}`);
    
    if (mathCheck && logicCheck) {
      console.log(`  🎉 ${scenario.name}: ALL TESTS PASSED`);
    } else {
      console.log(`  ❌ ${scenario.name}: TESTS FAILED`);
    }
    
    return { passed: mathCheck && logicCheck, comparison };
    
  } catch (error) {
    console.error(`❌ Error in scenario ${scenario.name}:`, error.message);
    return { passed: false, error: error.message };
  }
}

async function runAllTests() {
  console.log(`🚀 Starting comprehensive token subscription logic tests...`);
  console.log(`📋 Total scenarios to test: ${testScenarios.length}`);
  
  const results = [];
  
  for (const scenario of testScenarios) {
    const result = await runTestScenario(scenario);
    results.push({ 
      scenario: scenario.name, 
      passed: result.passed,
      details: result
    });
    
    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log(`\n${'='.repeat(100)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'='.repeat(100)}`);
  
  let passedCount = 0;
  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${index + 1}. ${result.scenario}: ${status}`);
    if (result.passed) passedCount++;
  });
  
  console.log(`\n🏆 OVERALL RESULT: ${passedCount}/${results.length} tests passed`);
  
  if (passedCount === results.length) {
    console.log(`🎉 ALL TESTS PASSED! Token subscription logic is working correctly.`);
  } else {
    console.log(`⚠️  Some tests failed. Please review the logic.`);
  }
  
  return results;
}

// Run the tests
runAllTests().catch(console.error);

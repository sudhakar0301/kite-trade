/**
 * Auto Trade Condition Checker
 * Analyzes market data from Current Subscribed Stocks to determine if trading conditions are met
 */

/**
 * Checks if BUY conditions are met for auto-trading
 * @param {Object} tickData - Latest tick data with depth and market impact
 * @returns {Object} - Analysis result with condition checks
 */
export const checkBuyConditions = (tickData) => {
  if (!tickData || !tickData.depth) {
    return {
      canTrade: false,
      reason: 'No depth data available',
      conditions: {}
    };
  }

  const { depth, scan_type, last_price } = tickData;
  const { buy: bidLevels, sell: askLevels, marketImpact } = depth;

  // Only check BUY conditions for BUY_SCAN stocks
  if (scan_type !== 'BUY_SCAN') {
    return {
      canTrade: false,
      reason: 'Not a BUY_SCAN stock',
      conditions: {}
    };
  }

  // Calculate quantity for ₹500,000 investment
  const currentPrice = last_price || 1;
  const calculatedQuantity = Math.floor(500000 / currentPrice);
  
  if (calculatedQuantity === 0) {
    return {
      canTrade: false,
      reason: 'Invalid price for quantity calculation',
      conditions: {}
    };
  }

  // Condition 1: 2-Level Fill (≤2 levels)
  const ask1Qty = askLevels?.[0]?.quantity || 0;
  const ask2Qty = askLevels?.[1]?.quantity || 0;
  const twoLevelQty = ask1Qty + ask2Qty;
  const twoLevelFillCondition = twoLevelQty >= calculatedQuantity;

  // Condition 2: Slippage ≤ 0.05%
  const slippageCondition = marketImpact?.totalSlippage <= 0.05; // 0.05%

  // Condition 3: L3-7 Support > 3x
  const askSupport37 = askLevels?.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0) || 0;
  const supportRatio = calculatedQuantity > 0 ? askSupport37 / calculatedQuantity : 0;
  const supportCondition = supportRatio > 3.0;

  // Condition 4: L3-7 Imbalance ≥ 2.0
  const bid37 = bidLevels?.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0) || 0;
  const ask37 = askLevels?.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0) || 0;
  const imbalance37 = ask37 > 0 ? bid37 / ask37 : 0;
  const imbalanceCondition = imbalance37 >= 1.4; // Adjusted to 1.4 for BUY conditions (Bid/Ask imbalance)

  // Overall decision - all 4 conditions must pass
  const allConditionsMet = twoLevelFillCondition && slippageCondition && supportCondition && imbalanceCondition;

  const analysis = {
    canTrade: allConditionsMet,
    reason: allConditionsMet ? 'All BUY conditions passed' : 'One or more conditions failed',
    conditions: {
      condition1_twoLevelFill: {
        met: twoLevelFillCondition,
        ask1Qty: ask1Qty,
        ask2Qty: ask2Qty,
        twoLevelQty: twoLevelQty,
        required: calculatedQuantity,
        description: `2-Level Fill: ${twoLevelQty.toLocaleString()} >= ${calculatedQuantity.toLocaleString()} (₹5L qty)`
      },
      condition2_slippage: {
        met: slippageCondition,
        currentSlippage: marketImpact?.totalSlippage || 0,
        maxAllowed: 0.05,
        description: `Slippage: ${(marketImpact?.totalSlippage || 0).toFixed(4)}% <= 0.05%`
      },
      condition3_support: {
        met: supportCondition,
        supportQty: askSupport37,
        supportRatio: supportRatio,
        minRequired: 3.0,
        description: `L3-7 Support: ${supportRatio.toFixed(1)}x > 3.0x (${askSupport37.toLocaleString()} qty)`
      },
      condition4_imbalance: {
        met: imbalanceCondition,
        currentRatio: imbalance37,
        minRequired: 2.0,
        bid37: bid37,
        ask37: ask37,
        description: `L3-7 Imbalance: ${imbalance37.toFixed(2)} >= 2.0 (Bid/Ask)`
      }
    },
    executionMetrics: {
      symbol: tickData.symbol,
      scanType: scan_type,
      calculatedQuantity: calculatedQuantity,
      currentPrice: currentPrice,
      investmentAmount: 500000
    }
  };

  console.log('🔍 BUY Conditions Check:', analysis);
  return analysis;
};

/**
 * Checks if SELL conditions are met for auto-trading
 * @param {Object} tickData - Latest tick data with depth and market impact
 * @returns {Object} - Analysis result with condition checks
 */
export const checkSellConditions = (tickData) => {
  if (!tickData || !tickData.depth) {
    return {
      canTrade: false,
      reason: 'No depth data available',
      conditions: {}
    };
  }

  const { depth, scan_type, last_price } = tickData;
  const { buy: bidLevels, sell: askLevels, marketImpact } = depth;

  // Only check SELL conditions for SELL_SCAN stocks
  if (scan_type !== 'SELL_SCAN') {
    return {
      canTrade: false,
      reason: 'Not a SELL_SCAN stock',
      conditions: {}
    };
  }

  // Calculate quantity for ₹500,000 investment
  const currentPrice = last_price || 1;
  const calculatedQuantity = Math.floor(500000 / currentPrice);
  
  if (calculatedQuantity === 0) {
    return {
      canTrade: false,
      reason: 'Invalid price for quantity calculation',
      conditions: {}
    };
  }

  // Condition 1: 2-Level Fill (≤2 levels)
  const bid1Qty = bidLevels?.[0]?.quantity || 0;
  const bid2Qty = bidLevels?.[1]?.quantity || 0;
  const twoLevelQty = bid1Qty + bid2Qty;
  const twoLevelFillCondition = twoLevelQty >= calculatedQuantity;

  // Condition 2: Slippage ≤ 0.05%
  const slippageCondition = marketImpact?.totalSlippage <= 0.05; // 0.05%

  // Condition 3: L3-7 Support > 3x
  const bidSupport37 = bidLevels?.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0) || 0;
  const supportRatio = calculatedQuantity > 0 ? bidSupport37 / calculatedQuantity : 0;
  const supportCondition = supportRatio > 3.0;

  // Condition 4: L3-7 Imbalance ≥ 2.0
  const bid37 = bidLevels?.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0) || 0;
  const ask37 = askLevels?.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0) || 0;
  const imbalance37 = bid37 > 0 ? ask37 / bid37 : 0;
  const imbalanceCondition = imbalance37 >= 1.4; // Adjusted to 1.4 for SELL conditions (Ask/Bid imbalance)

  // Overall decision - all 4 conditions must pass
  const allConditionsMet = twoLevelFillCondition && slippageCondition && supportCondition && imbalanceCondition;

  const analysis = {
    canTrade: allConditionsMet,
    reason: allConditionsMet ? 'All SELL conditions passed' : 'One or more conditions failed',
    conditions: {
      condition1_twoLevelFill: {
        met: twoLevelFillCondition,
        bid1Qty: bid1Qty,
        bid2Qty: bid2Qty,
        twoLevelQty: twoLevelQty,
        required: calculatedQuantity,
        description: `2-Level Fill: ${twoLevelQty.toLocaleString()} >= ${calculatedQuantity.toLocaleString()} (₹5L qty)`
      },
      condition2_slippage: {
        met: slippageCondition,
        currentSlippage: marketImpact?.totalSlippage || 0,
        maxAllowed: 0.05,
        description: `Slippage: ${(marketImpact?.totalSlippage || 0).toFixed(4)}% <= 0.05%`
      },
      condition3_support: {
        met: supportCondition,
        supportQty: bidSupport37,
        supportRatio: supportRatio,
        minRequired: 3.0,
        description: `L3-7 Support: ${supportRatio.toFixed(1)}x > 3.0x (${bidSupport37.toLocaleString()} qty)`
      },
      condition4_imbalance: {
        met: imbalanceCondition,
        currentRatio: imbalance37,
        minRequired: 2.0,
        bid37: bid37,
        ask37: ask37,
        description: `L3-7 Imbalance: ${imbalance37.toFixed(2)} >= 2.0 (Ask/Bid)`
      }
    },
    executionMetrics: {
      symbol: tickData.symbol,
      scanType: scan_type,
      calculatedQuantity: calculatedQuantity,
      currentPrice: currentPrice,
      investmentAmount: 500000
    }
  };

  console.log('🔍 SELL Conditions Check:', analysis);
  return analysis;
};

/**
 * Main function to check trading conditions based on scan type
 * @param {Object} tickData - Latest tick data
 * @returns {Object} - Trading analysis result
 */
export const checkAutoTradeConditions = (tickData) => {
  if (!tickData) {
    return {
      canTrade: false,
      reason: 'No tick data provided',
      conditions: {}
    };
  }

  const { scan_type } = tickData;

  switch (scan_type) {
    case 'BUY_SCAN':
      return checkBuyConditions(tickData);
    case 'SELL_SCAN':
      return checkSellConditions(tickData);
    default:
      return {
        canTrade: false,
        reason: `Unknown scan type: ${scan_type}`,
        conditions: {}
      };
  }
};

/**
 * Placeholder functions for actual trading execution
 */
export const executeBuyOrder = (analysis) => {
  console.log('🟢 PLACEHOLDER: Execute BUY Order', {
    symbol: analysis.marketData.symbol,
    quantity: analysis.marketData.quantity,
    expectedPrice: analysis.marketData.avgExecutionPrice,
    conditions: analysis.conditions
  });
  
  // TODO: Implement actual buy order API call
  return {
    success: false,
    message: 'Buy order execution not implemented yet',
    analysis: analysis
  };
};

export const executeSellOrder = (analysis) => {
  console.log('🔴 PLACEHOLDER: Execute SELL Order', {
    symbol: analysis.marketData.symbol,
    quantity: analysis.marketData.quantity,
    expectedPrice: analysis.marketData.avgExecutionPrice,
    conditions: analysis.conditions
  });
  
  // TODO: Implement actual sell order API call
  return {
    success: false,
    message: 'Sell order execution not implemented yet',
    analysis: analysis
  };
};

/**
 * Analyzes all subscribed stocks and returns trading opportunities
 * @param {Object} tickData - All tick data from SubscribedStockTracker
 * @param {Array} subscribedSymbols - Array of subscribed symbols
 * @returns {Array} - Array of trading opportunities
 */
export const analyzeAllSubscribedStocks = (tickData, subscribedSymbols) => {
  const opportunities = [];

  subscribedSymbols.forEach(symbol => {
    // Extract symbol name for tickData lookup
    const symbolKey = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    const symbolHistory = tickData[symbolKey];
    
    if (!symbolHistory || symbolHistory.length === 0) {
      console.log(`⚠️ No tick data for symbol: ${symbol}`);
      return;
    }

    // Get latest tick
    const latestTick = symbolHistory[symbolHistory.length - 1];
    const analysis = checkAutoTradeConditions(latestTick);

    if (analysis.canTrade) {
      opportunities.push({
        symbol: symbol,
        symbolKey: symbolKey,
        analysis: analysis,
        timestamp: new Date().toISOString()
      });
    }
  });

  console.log(`📊 Found ${opportunities.length} trading opportunities out of ${subscribedSymbols.length} symbols`);
  return opportunities;
};
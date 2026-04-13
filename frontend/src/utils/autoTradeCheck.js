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

  // Get order quantity from market impact analysis
  const orderQuantity = marketImpact?.quantity || 0;
  
  if (orderQuantity === 0) {
    return {
      canTrade: false,
      reason: 'No order quantity available',
      conditions: {}
    };
  }

  // Layer 1: 2-Level Fill (Execution Feasibility)
  // Rule: (Ask1_qty + Ask2_qty) ≥ 1.3 × q
  const ask1Qty = askLevels?.[0]?.quantity || 0;
  const ask2Qty = askLevels?.[1]?.quantity || 0;
  const twoLevelQty = ask1Qty + ask2Qty;
  const twoLevelFillCondition = twoLevelQty >= (1.3 * orderQuantity);

  // Layer 2: Imbalance (Directional Pressure) 
  // Rule: (Bid_5 / Ask_5) ≥ 1.3
  const bid5TotalQty = bidLevels?.slice(0, 5)
    .reduce((sum, level) => sum + (level.quantity || 0), 0) || 0;
  const ask5TotalQty = askLevels?.slice(0, 5)
    .reduce((sum, level) => sum + (level.quantity || 0), 0) || 0;
  const imbalanceRatio = ask5TotalQty > 0 ? bid5TotalQty / ask5TotalQty : 0;
  const imbalanceCondition = imbalanceRatio >= 1.3;

  // Layer 3: Depth (Liquidity Buffer)
  // Rule: Depth_5 = ∑(Ask_i_qty) ≥ 1.5 × q
  const depthCondition = ask5TotalQty >= (1.5 * orderQuantity);

  // Layer 4: Slippage (Execution Cost Control)
  // Rule: (VWAP_2L - Ask1) / Ask1 ≤ 0.0005 (0.05%)
  const ask1Price = askLevels?.[0]?.price || 0;
  const ask2Price = askLevels?.[1]?.price || 0;
  
  // Calculate VWAP for 2 levels
  const level1Fill = Math.min(orderQuantity, ask1Qty);
  const level2Fill = Math.min(orderQuantity - level1Fill, ask2Qty);
  const totalFilled = level1Fill + level2Fill;
  
  const vwap2L = totalFilled > 0 ? 
    ((level1Fill * ask1Price) + (level2Fill * ask2Price)) / totalFilled : ask1Price;
    
  const slippagePercent = ask1Price > 0 ? (vwap2L - ask1Price) / ask1Price : 1;
  const slippageCondition = slippagePercent <= 0.0005; // 0.05%

  // Overall decision - all 4 layers must pass
  const allConditionsMet = twoLevelFillCondition && imbalanceCondition && depthCondition && slippageCondition;

  const analysis = {
    canTrade: allConditionsMet,
    reason: allConditionsMet ? 'All BUY execution layers passed' : 'One or more execution layers failed',
    conditions: {
      layer1_twoLevelFill: {
        met: twoLevelFillCondition,
        ask1Qty: ask1Qty,
        ask2Qty: ask2Qty,
        twoLevelQty: twoLevelQty,
        required: Math.round(1.3 * orderQuantity),
        description: `2-Level Fill: ${twoLevelQty.toLocaleString()} >= ${Math.round(1.3 * orderQuantity).toLocaleString()} (1.3×q)`
      },
      layer2_imbalance: {
        met: imbalanceCondition,
        currentRatio: imbalanceRatio,
        minRequired: 1.3,
        bid5Qty: bid5TotalQty,
        ask5Qty: ask5TotalQty,
        description: `Imbalance: ${imbalanceRatio.toFixed(2)} >= 1.3 (Bid5/Ask5)`
      },
      layer3_depth: {
        met: depthCondition,
        ask5TotalQty: ask5TotalQty,
        required: Math.round(1.5 * orderQuantity),
        description: `Depth Buffer: ${ask5TotalQty.toLocaleString()} >= ${Math.round(1.5 * orderQuantity).toLocaleString()} (1.5×q)`
      },
      layer4_slippage: {
        met: slippageCondition,
        currentSlippage: slippagePercent,
        maxAllowed: 0.0005,
        vwap2L: vwap2L,
        ask1Price: ask1Price,
        description: `Slippage: ${(slippagePercent * 100).toFixed(4)}% <= 0.05% (VWAP vs Ask1)`
      }
    },
    executionMetrics: {
      symbol: tickData.symbol,
      scanType: scan_type,
      orderQuantity: orderQuantity,
      ask1Price: ask1Price,
      ask2Price: ask2Price,
      vwap2L: vwap2L,
      estimatedSlippage: slippagePercent * 100
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

  // Get order quantity from market impact analysis
  const orderQuantity = marketImpact?.quantity || 0;
  
  if (orderQuantity === 0) {
    return {
      canTrade: false,
      reason: 'No order quantity available',
      conditions: {}
    };
  }

  // Layer 1: 2-Level Fill (Execution Feasibility)
  // Rule: (Bid1_qty + Bid2_qty) ≥ 1.3 × q
  const bid1Qty = bidLevels?.[0]?.quantity || 0;
  const bid2Qty = bidLevels?.[1]?.quantity || 0;
  const twoLevelQty = bid1Qty + bid2Qty;
  const twoLevelFillCondition = twoLevelQty >= (1.3 * orderQuantity);

  // Layer 2: Imbalance (Directional Pressure) 
  // Rule: (Ask_5 / Bid_5) ≥ 1.3 (for SELL - ask dominance)
  const bid5TotalQty = bidLevels?.slice(0, 5)
    .reduce((sum, level) => sum + (level.quantity || 0), 0) || 0;
  const ask5TotalQty = askLevels?.slice(0, 5)
    .reduce((sum, level) => sum + (level.quantity || 0), 0) || 0;
  const imbalanceRatio = bid5TotalQty > 0 ? ask5TotalQty / bid5TotalQty : 0;
  const imbalanceCondition = imbalanceRatio >= 1.3;

  // Layer 3: Depth (Liquidity Buffer)
  // Rule: Depth_5 = ∑(Bid_i_qty) ≥ 1.5 × q
  const depthCondition = bid5TotalQty >= (1.5 * orderQuantity);

  // Layer 4: Slippage (Execution Cost Control)
  // Rule: (Bid1 - VWAP_2L) / Bid1 ≤ 0.0005 (0.05%)
  const bid1Price = bidLevels?.[0]?.price || 0;
  const bid2Price = bidLevels?.[1]?.price || 0;
  
  // Calculate VWAP for 2 levels
  const level1Fill = Math.min(orderQuantity, bid1Qty);
  const level2Fill = Math.min(orderQuantity - level1Fill, bid2Qty);
  const totalFilled = level1Fill + level2Fill;
  
  const vwap2L = totalFilled > 0 ? 
    ((level1Fill * bid1Price) + (level2Fill * bid2Price)) / totalFilled : bid1Price;
    
  const slippagePercent = bid1Price > 0 ? (bid1Price - vwap2L) / bid1Price : 1;
  const slippageCondition = slippagePercent <= 0.0005; // 0.05%

  // Overall decision - all 4 layers must pass
  const allConditionsMet = twoLevelFillCondition && imbalanceCondition && depthCondition && slippageCondition;

  const analysis = {
    canTrade: allConditionsMet,
    reason: allConditionsMet ? 'All SELL execution layers passed' : 'One or more execution layers failed',
    conditions: {
      layer1_twoLevelFill: {
        met: twoLevelFillCondition,
        bid1Qty: bid1Qty,
        bid2Qty: bid2Qty,
        twoLevelQty: twoLevelQty,
        required: Math.round(1.3 * orderQuantity),
        description: `2-Level Fill: ${twoLevelQty.toLocaleString()} >= ${Math.round(1.3 * orderQuantity).toLocaleString()} (1.3×q)`
      },
      layer2_imbalance: {
        met: imbalanceCondition,
        currentRatio: imbalanceRatio,
        minRequired: 1.3,
        bid5Qty: bid5TotalQty,
        ask5Qty: ask5TotalQty,
        description: `Imbalance: ${imbalanceRatio.toFixed(2)} >= 1.3 (Ask5/Bid5)`
      },
      layer3_depth: {
        met: depthCondition,
        bid5TotalQty: bid5TotalQty,
        required: Math.round(1.5 * orderQuantity),
        description: `Depth Buffer: ${bid5TotalQty.toLocaleString()} >= ${Math.round(1.5 * orderQuantity).toLocaleString()} (1.5×q)`
      },
      layer4_slippage: {
        met: slippageCondition,
        currentSlippage: slippagePercent,
        maxAllowed: 0.0005,
        vwap2L: vwap2L,
        bid1Price: bid1Price,
        description: `Slippage: ${(slippagePercent * 100).toFixed(4)}% <= 0.05% (Bid1 vs VWAP)`
      }
    },
    executionMetrics: {
      symbol: tickData.symbol,
      scanType: scan_type,
      orderQuantity: orderQuantity,
      bid1Price: bid1Price,
      bid2Price: bid2Price,
      vwap2L: vwap2L,
      estimatedSlippage: slippagePercent * 100
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
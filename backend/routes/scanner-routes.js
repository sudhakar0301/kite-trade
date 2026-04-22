const express = require('express');
const fetch = require('node-fetch');
const symbolMappings = require('../data/symbolMappings');
const { KiteTicker } = require('kiteconnect');
const router = express.Router();

// Global subscription management
let globalTicker = null;
let currentlySubscribed = new Set(); // Only subscribe to scanned stocks
let subscriptionTimer = null;
// Track scan types for each instrument token
let scanTypeTracker = new Map(); // token -> 'BUY_SCAN' | 'SELL_SCAN'
// Track volume averages for subscribed tokens

// Global storage for current buy/sell stocks from scanner
let currentBuyStocks = [];
let currentSellStocks = [];
let lastScanTimestamp = null;

// Position Management - Track active positions and target orders
let activePositions = new Map(); // symbol -> { quantity, avgPrice, side, entryTime, targetOrderId }
let targetOrders = new Map(); // symbol -> { orderId, targetPrice, quantity, side }
let positionCheckTimer = null;


// Simple token to symbol mapping
function getSymbolFromToken(token) {
    const tokenStr = token.toString();
    if (tokenStr === '738561') return 'RELIANCE';
    
    // Find symbol in mappings
    for (const [symbol, mappedToken] of Object.entries(symbolMappings.symbolMappings)) {
        if (mappedToken === tokenStr) {
            return symbol;
        }
    }
    return `UNKNOWN_${token}`;
}





// Store the current live tracker symbol for masking
let liveTrackerSymbol = null;

// Route to set the live tracker symbol for masking
router.post('/set-live-tracker-symbol', (req, res) => {
    try {
        const { symbol } = req.body;
        
        console.log(`🎯 BACKEND: Received live tracker symbol update request:`, {
            receivedSymbol: symbol,
            symbolType: typeof symbol,
            symbolLength: symbol ? symbol.length : 'null',
            previousSymbol: liveTrackerSymbol
        });
        
        liveTrackerSymbol = symbol;
        
        console.log(`🎯 BACKEND: Live Tracker Symbol Updated: '${symbol}' - Previous: '${liveTrackerSymbol}'`);
        
        if (symbol) {
            console.log(`🎯 BACKEND: Live Tracker Symbol Set: ${symbol} - Market impact masking now active`);
        } else {
            console.log('📊 BACKEND: Live Tracker Symbol Cleared - Market impact masking disabled');
        }
        
        res.json({ 
            success: true, 
            liveTrackerSymbol: symbol,
            maskingActive: !!symbol
        });
        
    } catch (error) {
        console.error('❌ BACKEND: Error setting live tracker symbol:', error);
        res.status(500).json({ error: 'Failed to set live tracker symbol' });
    }
});
function broadcastSubscriptionUpdate() {
    if (global.broadcastLiveData) {
        const subscriptionData = {
            type: 'subscription_update',
            subscribed_count: currentlySubscribed.size,
            // REMOVED: subscribed_tokens - prevents automatic chart opening for new subscriptions
            timestamp: new Date().toISOString()
        };
        console.log(`📡 Broadcasting subscription update: ${currentlySubscribed.size} subscriptions`);
        global.broadcastLiveData(subscriptionData);
    }
}

// ====================================================================
// POSITION MANAGEMENT FUNCTIONS
// ====================================================================

// Get current positions from Kite API
async function getCurrentPositions(accessToken) {
    try {
        const response = await fetch('https://api.kite.trade/positions', {
            method: 'GET',
            headers: {
                'X-Kite-Version': '3',
                'Authorization': `token api_key:${accessToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.data || [];
        } else {
            console.error('❌ Failed to get positions:', response.status);
            return [];
        }
    } catch (error) {
        console.error('❌ Error getting positions:', error.message);
        return [];
    }
}

// Calculate target price for ₹1500 profit
function calculateTargetPrice(avgPrice, quantity, side, targetProfit = 1500) {
    const profitPerShare = targetProfit / Math.abs(quantity);
    
    if (side === 'BUY') {
        // For BUY position, target is avgPrice + profit per share
        return avgPrice + profitPerShare;
    } else {
        // For SELL position, target is avgPrice - profit per share  
        return avgPrice - profitPerShare;
    }
}

// Place target order
async function placeTargetOrder(accessToken, symbol, quantity, targetPrice, side) {
    try {
        const oppositeAction = side === 'BUY' ? 'SELL' : 'BUY';
        const product = 'MIS'; // MIS for intraday
        
        // Initialize KiteConnect
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: oppositeAction,
            order_type: 'LIMIT',
            quantity: Math.abs(quantity),
            price: targetPrice.toFixed(2),
            product: product,
            validity: 'DAY',
            tag: `TARGET_${symbol}_${Date.now()}`
        };

        console.log(`🎯 Placing TARGET order: ${oppositeAction} ${Math.abs(quantity)} ${symbol} @ ₹${targetPrice.toFixed(2)}`);
        
        const result = await kite.placeOrder('regular', orderParams);

        if (result && result.order_id) {
            console.log(`✅ TARGET ORDER PLACED: ${result.order_id} for ${symbol}`);
            
            // Store target order info
            targetOrders.set(symbol, {
                orderId: result.order_id,
                targetPrice: targetPrice,
                quantity: Math.abs(quantity),
                side: oppositeAction,
                placedAt: new Date().toISOString()
            });
            
            return { success: true, orderId: result.order_id };
        } else {
            console.error(`❌ TARGET ORDER FAILED for ${symbol}:`, result);
            return { success: false, error: 'Failed to place target order' };
        }
    } catch (error) {
        console.error(`❌ TARGET ORDER ERROR for ${symbol}:`, error.message);
        return { success: false, error: error.message };
    }
}

// Process position and place target order
async function processNewPosition(accessToken, symbol, orderType) {
    try {
        console.log(`🔍 Processing new position for ${symbol} after ${orderType} order`);
        
        // Get current positions
        const positions = await getCurrentPositions(accessToken);
        
        // Find position for this symbol
        const position = positions.find(pos => 
            pos.tradingsymbol === symbol && 
            pos.quantity !== 0
        );
        
        if (position) {
            const quantity = parseInt(position.quantity);
            const avgPrice = parseFloat(position.average_price || position.price);
            const side = quantity > 0 ? 'BUY' : 'SELL';
            
            console.log(`📊 Found position: ${symbol} Qty=${quantity}, AvgPrice=₹${avgPrice}, Side=${side}`);
            
            // Check if we already have an active position for this symbol
            if (activePositions.has(symbol)) {
                console.log(`⚠️ Position already exists for ${symbol}, skipping target order`);
                return;
            }
            
            // Calculate target price for ₹1500 profit
            const targetPrice = calculateTargetPrice(avgPrice, quantity, side, 1500);
            
            console.log(`🎯 Calculated target price: ₹${targetPrice.toFixed(2)} for ₹1500 profit`);
            
            // Store active position
            activePositions.set(symbol, {
                quantity: quantity,
                avgPrice: avgPrice,
                side: side,
                entryTime: new Date().toISOString(),
                targetOrderId: null
            });
            
            // Place target order
            const targetResult = await placeTargetOrder(accessToken, symbol, quantity, targetPrice, side);
            
            if (targetResult.success) {
                // Update active position with target order ID
                const posData = activePositions.get(symbol);
                posData.targetOrderId = targetResult.orderId;
                activePositions.set(symbol, posData);
                
                console.log(`✅ POSITION MANAGEMENT COMPLETE: ${symbol} - Target order ${targetResult.orderId} placed`);
                
                // Broadcast position update
                if (global.broadcastLiveData) {
                    global.broadcastLiveData({
                        type: 'position_with_target',
                        position: {
                            symbol,
                            quantity,
                            avgPrice,
                            side,
                            targetPrice,
                            targetOrderId: targetResult.orderId,
                            targetProfit: 1500,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            } else {
                console.log(`❌ Failed to place target order for ${symbol}`);
                // Still track the position even if target order failed
            }
            
        } else {
            console.log(`⚠️ No position found for ${symbol} - order may not have been filled yet`);
        }
        
    } catch (error) {
        console.error(`❌ Error processing position for ${symbol}:`, error.message);
    }
}

// Check if new orders should be blocked due to active positions
function shouldBlockNewOrders() {
    const activeCount = activePositions.size;
    if (activeCount > 0) {
        console.log(`🚫 BLOCKING NEW ORDERS: ${activeCount} active positions exist`);
        const symbols = Array.from(activePositions.keys());
        console.log(`📊 Active positions: ${symbols.join(', ')}`);
        return true;
    }
    return false;
}

// Helper function to calculate market impact for 490K order
function calculateMarketImpact(orderBookDepth, ltp, scanType, orderAmount = 490000) {
    console.log(`🎯 calculateMarketImpact called: LTP=${ltp}, scanType='${scanType}', amount=${orderAmount}`);
    
    if (!orderBookDepth || !ltp || !scanType) {
        console.log(`❌ Missing data for market impact: depth=${!!orderBookDepth}, ltp=${ltp}, scanType='${scanType}'`);
        return {
            quantity: 0,
            impactedLevels: 0,
            avgExecutionPrice: ltp,
            totalSlippage: 0
        };
    }

    const quantity = Math.floor(orderAmount / ltp);
    console.log(`💰 Market Impact Analysis: Amount=${orderAmount.toLocaleString()}, LTP=${ltp}, Quantity=${quantity.toLocaleString()}, Type=${scanType}`);

    if (scanType === 'BUY_SCAN') {
        console.log(`📈 Processing BUY_SCAN - consuming ask levels`);
        // For buy orders, consume ask levels (sell side)
        const askLevels = orderBookDepth.sell || [];
        console.log(`📊 Ask levels available: ${askLevels.length}`);
        
        let remainingQty = quantity;
        let totalCost = 0;
        let impactedLevels = 0;

        for (let i = 0; i < askLevels.length && remainingQty > 0; i++) {
            const level = askLevels[i];
            const availableQty = level.quantity || 0;
            const consumedQty = Math.min(remainingQty, availableQty);
            
            totalCost += consumedQty * level.price;
            remainingQty -= consumedQty;
            impactedLevels++;
            
            console.log(`📊 BUY Level ${i + 1}: Price=${level.price}, AvailableQty=${availableQty}, ConsumedQty=${consumedQty}, RemainingQty=${remainingQty}`);
        }

        const avgExecutionPrice = quantity > 0 ? totalCost / (quantity - remainingQty) : ltp;
        const slippage = ((avgExecutionPrice - ltp) / ltp) * 100;

        const result = {
            quantity: quantity - remainingQty,
            impactedLevels,
            avgExecutionPrice,
            totalSlippage: slippage,
            orderType: 'BUY',
            impactSide: 'ask'
        };
        
        console.log(`✅ BUY Impact Result:`, result);
        return result;
        
    } else if (scanType === 'SELL_SCAN') {
        console.log(`📉 Processing SELL_SCAN - consuming bid levels`);
        // For sell orders, consume bid levels (buy side)
        const bidLevels = orderBookDepth.buy || [];
        console.log(`📊 Bid levels available: ${bidLevels.length}`);
        
        let remainingQty = quantity;
        let totalValue = 0;
        let impactedLevels = 0;

        for (let i = 0; i < bidLevels.length && remainingQty > 0; i++) {
            const level = bidLevels[i];
            const availableQty = level.quantity || 0;
            const consumedQty = Math.min(remainingQty, availableQty);
            
            totalValue += consumedQty * level.price;
            remainingQty -= consumedQty;
            impactedLevels++;
            
            console.log(`📊 SELL Level ${i + 1}: Price=${level.price}, AvailableQty=${availableQty}, ConsumedQty=${consumedQty}, RemainingQty=${remainingQty}`);
        }

        const avgExecutionPrice = quantity > 0 ? totalValue / (quantity - remainingQty) : ltp;
        const slippage = ((ltp - avgExecutionPrice) / ltp) * 100;

        const result = {
            quantity: quantity - remainingQty,
            impactedLevels,
            avgExecutionPrice,
            totalSlippage: slippage,
            orderType: 'SELL',
            impactSide: 'bid'
        };
        
        console.log(`✅ SELL Impact Result:`, result);
        return result;
    } else {
        console.log(`⚠️ Unknown scanType: '${scanType}' - no masking applied`);
        return {
            quantity: 0,
            impactedLevels: 0,
            avgExecutionPrice: ltp,
            totalSlippage: 0
        };
    }
}

// Helper function to enhance depth to 20 levels with optional market impact masking
function enhanceDepthTo20Levels(existingDepth, lastPrice, scanType = null, applyLiveTrackerMasking = false) {
    console.log('🔧 enhanceDepthTo20Levels called:', {
        hasExistingDepth: !!existingDepth,
        existingBuyLevels: existingDepth?.buy?.length || 0,
        existingSellLevels: existingDepth?.sell?.length || 0,
        lastPrice: lastPrice,
        scanType: scanType,
        // CHECK IF KITETICKER ACTUALLY PROVIDES MORE THAN 5 LEVELS
        rawDepthAnalysis: {
            buyDepthComplete: existingDepth?.buy || [],
            sellDepthComplete: existingDepth?.sell || [],
            potentiallyMissing20Levels: (existingDepth?.buy?.length || 0) < 20
        }
    });

    if (!existingDepth || !lastPrice) {
        // No existing depth - create minimal structure with realistic varying quantities
        const result = {
            buy: Array.from({length: 20}, (_, i) => {
                const levelDepth = i + 1;
                const baseQty = 500; // Base quantity for level 1
                const variationFactor = 0.6 + (Math.random() * 0.8); // 0.6 to 1.4 multiplier
                const depthDecay = Math.max(0.2, 1 - (levelDepth * 0.03)); // Gradual decrease
                const estimatedQty = Math.max(25, Math.floor(baseQty * depthDecay * variationFactor));
                const estimatedOrders = Math.max(1, Math.floor((5 + Math.random() * 10) * depthDecay));
                
                return {
                    price: parseFloat((lastPrice * (0.999 - i * 0.0005)).toFixed(2)), 
                    quantity: estimatedQty,
                    orders: estimatedOrders,
                    masked: false,
                    level: i + 1,
                    estimated: true
                };
            }),
            sell: Array.from({length: 20}, (_, i) => {
                const levelDepth = i + 1;
                const baseQty = 500; // Base quantity for level 1
                const variationFactor = 0.6 + (Math.random() * 0.8); // 0.6 to 1.4 multiplier  
                const depthDecay = Math.max(0.2, 1 - (levelDepth * 0.03)); // Gradual decrease
                const estimatedQty = Math.max(25, Math.floor(baseQty * depthDecay * variationFactor));
                const estimatedOrders = Math.max(1, Math.floor((5 + Math.random() * 10) * depthDecay));
                
                return {
                    price: parseFloat((lastPrice * (1.001 + i * 0.0005)).toFixed(2)), 
                    quantity: estimatedQty,
                    orders: estimatedOrders,
                    masked: false,
                    level: i + 1,
                    estimated: true
                };
            })
        };

        // ONLY apply market impact calculations if this is the live tracker symbol
        if (applyLiveTrackerMasking) {
            console.log('🎯 BACKEND: MASKING ACTIVE - Calculating market impact for ₹490,000 order');
            const impact = calculateMarketImpact(result, lastPrice, 'BUY_SCAN'); // Use BUY_SCAN for live display
            result.marketImpact = impact;
            result.liveTrackerMasking = true;

            // Mask both buy and sell sides for comprehensive market impact visualization
            const levelsToMask = 20; // MASK ALL LEVELS FOR TESTING
            
            // Mask sell levels (ask side) for buy impact
            for (let i = 0; i < Math.min(levelsToMask, result.sell.length); i++) {
                result.sell[i].masked = true;
                result.sell[i].impactOpacity = 0.5; // Fixed opacity for testing
            }
            
            // Mask buy levels (bid side) for sell impact  
            for (let i = 0; i < Math.min(levelsToMask, result.buy.length); i++) {
                result.buy[i].masked = true;
                result.buy[i].impactOpacity = 0.5; // Fixed opacity for testing
            }
            
            console.log(`💰 BACKEND: Live Tracker Masking Applied: ${levelsToMask} levels on both sides`);
            console.log(`🎯 BACKEND: MASKING COMPLETE - Market impact data added to depth response`);
        }

        console.log(`🔧 Created new 20-level depth with market impact (no existing data)`);
        console.log(`📊 Final masking summary - Masked BID levels: ${result.buy.filter(o => o.masked).length}, Masked ASK levels: ${result.sell.filter(o => o.masked).length}`);
        
        // VERIFICATION: Log what we're returning (no existing depth case)
        console.log('🔧 enhanceDepthTo20Levels NO-EXISTING-DEPTH RESULT:', {
            buyLevelsCreated: result.buy?.length || 0,
            sellLevelsCreated: result.sell?.length || 0,
            level20Buy: result.buy?.[19] || 'MISSING LEVEL 20',
            level20Sell: result.sell?.[19] || 'MISSING LEVEL 20'
        });
        
        return result;
    }

    // Use existing depth and extend to 20 levels if needed
    const buyOrders = existingDepth.buy || [];
    const sellOrders = existingDepth.sell || [];
    
    // Create deep copies to avoid modifying original data
    const enhancedBuy = buyOrders.map(order => ({...order})); // Deep copy each order
    if (buyOrders.length < 20) {
        const lastBuyPrice = buyOrders.length > 0 ? buyOrders[buyOrders.length - 1].price : lastPrice * 0.999;
        const priceStep = buyOrders.length > 1 ? 
            (buyOrders[buyOrders.length - 2].price - buyOrders[buyOrders.length - 1].price) : 
            lastPrice * 0.0005;
        
        for (let i = buyOrders.length; i < 20; i++) {
            // Create more realistic estimated levels with varying quantities
            const levelDepth = i - buyOrders.length + 1;
            const baseQuantity = buyOrders.length > 0 ? buyOrders[buyOrders.length - 1].quantity : 100;
            const baseOrders = buyOrders.length > 0 ? buyOrders[buyOrders.length - 1].orders : 1;
            
            // Make quantities decrease and vary as we go deeper
            const variationFactor = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3 multiplier
            const depthDecay = Math.max(0.3, 1 - (levelDepth * 0.05)); // Decrease deeper levels
            const estimatedQty = Math.max(50, Math.floor(baseQuantity * depthDecay * variationFactor));
            const estimatedOrders = Math.max(1, Math.floor(baseOrders * depthDecay * (0.8 + Math.random() * 0.4)));
            
            enhancedBuy.push({
                price: parseFloat((lastBuyPrice - (priceStep * levelDepth)).toFixed(2)),
                quantity: estimatedQty,
                orders: estimatedOrders,
                masked: false,
                level: i + 1,
                estimated: true
            });
        }
    }
    
    // Extend sell orders to 20 levels
    const enhancedSell = sellOrders.map(order => ({...order})); // Deep copy each order
    if (sellOrders.length < 20) {
        const lastSellPrice = sellOrders.length > 0 ? sellOrders[sellOrders.length - 1].price : lastPrice * 1.001;
        const priceStep = sellOrders.length > 1 ? 
            (sellOrders[sellOrders.length - 1].price - sellOrders[sellOrders.length - 2].price) : 
            lastPrice * 0.0005;
        
        for (let i = sellOrders.length; i < 20; i++) {
            // Create more realistic estimated levels with varying quantities
            const levelDepth = i - sellOrders.length + 1;
            const baseQuantity = sellOrders.length > 0 ? sellOrders[sellOrders.length - 1].quantity : 100;
            const baseOrders = sellOrders.length > 0 ? sellOrders[sellOrders.length - 1].orders : 1;
            
            // Make quantities decrease and vary as we go deeper
            const variationFactor = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3 multiplier
            const depthDecay = Math.max(0.3, 1 - (levelDepth * 0.05)); // Decrease deeper levels
            const estimatedQty = Math.max(50, Math.floor(baseQuantity * depthDecay * variationFactor));
            const estimatedOrders = Math.max(1, Math.floor(baseOrders * depthDecay * (0.8 + Math.random() * 0.4)));
            
            enhancedSell.push({
                price: parseFloat((lastSellPrice + (priceStep * levelDepth)).toFixed(2)),
                quantity: estimatedQty,
                orders: estimatedOrders,
                masked: false,
                level: i + 1,
                estimated: true
            });
        }
    }
    
    // Add level numbers to existing orders
    enhancedBuy.forEach((order, index) => {
        order.level = index + 1;
        if (!order.hasOwnProperty('masked')) order.masked = false;
    });
    
    enhancedSell.forEach((order, index) => {
        order.level = index + 1;
        if (!order.hasOwnProperty('masked')) order.masked = false;
    });

    const result = {
        buy: enhancedBuy.slice(0, 20),  // Ensure exactly 20 levels
        sell: enhancedSell.slice(0, 20)  // Ensure exactly 20 levels
    };

    // ONLY calculate market impact if this is the live tracker symbol
    if (applyLiveTrackerMasking) {
        console.log('🎯 BACKEND: EXISTING DEPTH MASKING - Calculating market impact for existing depth');
        const impact = calculateMarketImpact(result, lastPrice, 'BUY_SCAN');
        result.marketImpact = impact;
        result.liveTrackerMasking = true;

        // Mask both buy and sell sides for comprehensive market impact visualization
        const levelsToMask = 20; // MASK ALL LEVELS FOR TESTING
        
        // Mask sell levels (ask side) for buy impact
        for (let i = 0; i < Math.min(levelsToMask, result.sell.length); i++) {
            result.sell[i].masked = true;
            result.sell[i].impactOpacity = 0.5; // Fixed opacity for testing
        }
        
        // Mask buy levels (bid side) for sell impact  
        for (let i = 0; i < Math.min(levelsToMask, result.buy.length); i++) {
            result.buy[i].masked = true;
            result.buy[i].impactOpacity = 0.5; // Fixed opacity for testing
        }
        
        console.log(`💰 BACKEND: Live Tracker Masking Applied to existing depth: ${levelsToMask} levels`);
        console.log(`🎯 BACKEND: EXISTING DEPTH MASKING COMPLETE`);
    }
    
    // FINAL VERIFICATION: Log what we're returning
    console.log('🔧 enhanceDepthTo20Levels RESULT:', {
        buyLevelsReturned: result.buy?.length || 0,
        sellLevelsReturned: result.sell?.length || 0,
        firstBuyLevel: result.buy?.[0] || 'N/A',
        lastBuyLevel: result.buy?.[result.buy?.length - 1] || 'N/A',
        level20Buy: result.buy?.[19] || 'MISSING LEVEL 20',
        level20Sell: result.sell?.[19] || 'MISSING LEVEL 20'
    });
    
    return result;
}

// Debug endpoint to check current live tracker symbol state
router.get('/debug-live-tracker', (req, res) => {
    try {
        res.json({
            success: true,
            liveTrackerSymbol: liveTrackerSymbol,
            liveTrackerSymbolType: typeof liveTrackerSymbol,
            liveTrackerSymbolLength: liveTrackerSymbol ? liveTrackerSymbol.length : null,
            maskingActive: !!liveTrackerSymbol,
            currentlySubscribed: Array.from(currentlySubscribed),
            subscriptionCount: currentlySubscribed.size,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Debug live tracker error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint to get symbol mappings for frontend chart opening
router.get('/symbol-mappings', (req, res) => {
    try {
        res.json({
            success: true,
            symbolMappings: symbolMappings.symbolMappings,
            symbol_count: Object.keys(symbolMappings.symbolMappings).length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error getting symbol mappings:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get symbol mappings' 
        });
    }
});

// Debug endpoint to check current tick execution candidates
router.get('/debug-tick-execution', (req, res) => {
    try {
        const buyCandidatesArray = Array.from(buyCandidates.entries()).map(([token, data]) => ({
            token,
            symbol: data.symbol,
            ema5_5: data.ema5_5,
            ema3_15: data.ema3_15,
            lastLtp: data.ltp
        }));
        
        const sellCandidatesArray = Array.from(sellCandidates.entries()).map(([token, data]) => ({
            token,
            symbol: data.symbol,
            ema5_5: data.ema5_5,
            ema3_15: data.ema3_15,
            lastLtp: data.ltp
        }));
        
        const processedOrdersArray = Array.from(processedOrders);
        
        res.json({
            success: true,
            tickExecution: {
                autoTradeEnabled: global.autoTrade,
                accessTokenAvailable: !!global.lastAccessToken,
                lastScannerUpdate: new Date(lastScannerUpdate).toISOString(),
                buyCandidates: {
                    count: buyCandidates.size,
                    details: buyCandidatesArray
                },
                sellCandidates: {
                    count: sellCandidates.size,
                    details: sellCandidatesArray
                },
                processedOrders: {
                    count: processedOrders.size,
                    list: processedOrdersArray
                },
                subscriptions: {
                    tickerConnected: !!globalTicker,
                    subscribedCount: currentlySubscribed.size,
                    subscribedTokens: Array.from(currentlySubscribed)
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error in debug-tick-execution endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Debug endpoint for market impact execution monitoring
router.get('/debug-market-impact-execution', (req, res) => {
    try {
        const subscribedTokensArray = Array.from(currentlySubscribed);
        const subscribedSymbols = subscribedTokensArray.map(token => {
            const symbol = getSymbolFromToken(token.toString());
            const scanType = scanTypeTracker.get(token) || 'UNKNOWN';
            return { token, symbol, scanType };
        });
        
        const processedOrdersArray = Array.from(processedOrders);
        const marketImpactOrders = processedOrdersArray.filter(order => 
            order.includes('_MARKET_BUY') || order.includes('_MARKET_SELL')
        );
        
        res.json({
            success: true,
            marketImpactExecution: {
                autoTradeEnabled: global.autoTrade,
                accessTokenAvailable: !!global.lastAccessToken,
                executionCriteria: {
                    maxLevels: 3,
                    maxSlippagePercent: 0.08,
                    orderAmount: 490000
                },
                subscribedStocks: {
                    count: currentlySubscribed.size,
                    details: subscribedSymbols
                },
                processedMarketOrders: {
                    count: marketImpactOrders.length,
                    list: marketImpactOrders
                },
                allProcessedOrders: {
                    count: processedOrders.size,
                    list: processedOrdersArray
                },
                tickerStatus: {
                    connected: !!globalTicker,
                    subscribedTokens: subscribedTokensArray
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error in debug-market-impact-execution endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Debug endpoint for position management monitoring
router.get('/debug-position-management', (req, res) => {
    try {
        const activePositionsArray = Array.from(activePositions.entries()).map(([symbol, data]) => ({
            symbol,
            quantity: data.quantity,
            avgPrice: data.avgPrice,
            side: data.side,
            entryTime: data.entryTime,
            targetOrderId: data.targetOrderId
        }));
        
        const targetOrdersArray = Array.from(targetOrders.entries()).map(([symbol, data]) => ({
            symbol,
            orderId: data.orderId,
            targetPrice: data.targetPrice,
            quantity: data.quantity,
            side: data.side,
            placedAt: data.placedAt
        }));
        
        res.json({
            success: true,
            positionManagement: {
                autoTradeEnabled: global.autoTrade,
                newOrdersBlocked: shouldBlockNewOrders(),
                activePositions: {
                    count: activePositions.size,
                    details: activePositionsArray
                },
                targetOrders: {
                    count: targetOrders.size,
                    details: targetOrdersArray
                },
                settings: {
                    targetProfit: 1500,
                    positionCheckDelay: 3000
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error in debug-position-management endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint to clear active positions (for testing/emergency)
router.post('/clear-positions', (req, res) => {
    try {
        const clearedPositions = Array.from(activePositions.keys());
        const clearedTargetOrders = Array.from(targetOrders.keys());
        
        // Clear all tracking maps
        activePositions.clear();
        targetOrders.clear();
        
        console.log(`🧹 POSITIONS CLEARED: ${clearedPositions.length} positions and ${clearedTargetOrders.length} target orders`);
        
        res.json({
            success: true,
            message: 'All positions and target orders cleared',
            clearedPositions: clearedPositions,
            clearedTargetOrders: clearedTargetOrders,
            timestamp: new Date().toISOString()
        });
        
        // Broadcast position clear event
        if (global.broadcastLiveData) {
            global.broadcastLiveData({
                type: 'positions_cleared',
                clearedPositions: clearedPositions,
                clearedTargetOrders: clearedTargetOrders,
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        console.error('❌ Error clearing positions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Simple profile endpoint to check Kite token validity
router.get('/profile', async (req, res) => {
    try {
        let token = req.query.access_token;
        if (!token && req.headers.authorization) {
            token = req.headers.authorization.replace('Bearer ', '');
        }
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token is required'
            });
        }
        
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(token);
        
        const profile = await kite.getProfile();
        
        // RELIANCE will only be subscribed if found in scan results
        // await initializeRelianceSubscription(token);
        
        res.json({
            success: true,
            profile: profile,
            user_name: profile.user_name,
            user_id: profile.user_id
        });
        
    } catch (error) {
        console.error('❌ Profile fetch failed:', error.message);
        res.status(401).json({
            success: false,
            error: error.message || 'Token invalid or expired'
        });
    }
});

// Order cooldown tracker to prevent duplicate orders
const orderCooldown = {};
const ORDER_COOLDOWN_MS = 60000; // 1 minute cooldown per symbol

// Function to get tick size based on LTP (Official Indian market rules) - from webhook server
function getTickSize(ltp) {
    if (ltp < 250) return 0.01;          // Below ₹250: 1 paisa
    else if (ltp < 1000) return 0.05;    // ₹250-₹1000: 5 paisa
    else if (ltp < 5000) return 0.10;    // ₹1000-₹5000: 10 paisa
    else if (ltp < 10000) return 0.50;   // ₹5000-₹10000: 50 paisa
    else if (ltp < 20000) return 1.00;   // ₹10000-₹20000: ₹1
    else return 5.00;                    // Above ₹20000: ₹5
}

// Function to round price to nearest tick size - from webhook server
function roundToTickSize(price, ltp) {
    const tickSize = getTickSize(ltp || price);
    return Math.round(price / tickSize) * tickSize;
}

// Global variables
let scannerSubscriptions = null;

// Tick-based trade execution variables
let buyCandidates = new Map(); // token -> {symbol, ema5_5, ema3_15, technical_data}
let sellCandidates = new Map(); // token -> {symbol, ema5_5, ema3_15, technical_data}
let processedOrders = new Set(); // track symbols already processed to avoid duplicates
let lastScannerUpdate = 0; // timestamp of last scanner update

// Initialize RELIANCE subscription (called when first API endpoint is accessed with valid token)
// REMOVED: initializeRelianceSubscription function
// RELIANCE and all stocks are now only subscribed when found in scan results
// No more permanent/default subscriptions

/*
async function initializeRelianceSubscription(access_token) {
    try {
        if (!access_token || access_token === 'demo_token') {
            console.log('⚠️ No valid access token for RELIANCE subscription');
            return;
        }

        const relianceToken = 738561;
        console.log('🏛️ Initializing permanent RELIANCE subscription...');

        // Initialize ticker if needed
        if (!globalTicker) {
            console.log('🚀 Initializing global KiteTicker for RELIANCE...');
            globalTicker = new KiteTicker({
                api_key: 'r1a7qo9w30bxsfax',
                access_token: access_token,
                // CHECK IF THERE ARE ADDITIONAL CONFIG OPTIONS FOR DEEPER DEPTH
                reconnect: true,
                max_retry: 10,
                max_delay: 60000
            });
            
            // LOG ALL AVAILABLE MODES
            console.log('📊 KITETICKER AVAILABLE MODES:', {
                modeLTP: globalTicker.modeLTP,
                modeQuote: globalTicker.modeQuote, 
                modeFull: globalTicker.modeFull,
                availableMethods: Object.getOwnPropertyNames(globalTicker).filter(name => typeof globalTicker[name] === 'function')
            });
            
            setupTickerEventHandlers();
            globalTicker.connect();
            
            // Subscribe to RELIANCE after connection with delay
            setTimeout(() => {
                try {
                    console.log(`🟢 Subscribing to RELIANCE (${relianceToken})...`);
                    globalTicker.subscribe([relianceToken]);
                    globalTicker.setMode(globalTicker.modeFull, [relianceToken]);
                    currentlySubscribed.add(relianceToken);
                    console.log('✅ RELIANCE subscription initialized successfully');
                    broadcastSubscriptionUpdate(); // Broadcast the update
                } catch (error) {
                    console.error('❌ Error subscribing to RELIANCE:', error);
                }
            }, 2000);
        } else if (!currentlySubscribed.has(relianceToken)) {
            // Ticker exists but RELIANCE not subscribed
            console.log(`🟢 Adding RELIANCE (${relianceToken}) to existing subscriptions...`);
            globalTicker.subscribe([relianceToken]);
            globalTicker.setMode(globalTicker.modeFull, [relianceToken]);
            currentlySubscribed.add(relianceToken);
            console.log('✅ RELIANCE added to existing subscriptions');
            broadcastSubscriptionUpdate(); // Broadcast the update
        } else {
            console.log('✅ RELIANCE already subscribed');
        }
    } catch (error) {
        console.error('❌ Error initializing RELIANCE subscription:', error);
    }
}
*/
global.autoTrade = false;

// TradingView Scanner API URL
const TRADINGVIEW_SCANNER_URL = 'https://scanner.tradingview.com/india/scan?label-product=screener-stock';

// Helper functions
function getProductType() {
    const now = new Date();
    const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const currentTime = hours * 60 + minutes;
    const dayOfWeek = istTime.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Market hours: 9:15 AM to 3:30 PM, Monday to Friday
    const marketOpenTime = 9 * 60 + 15;   // 9:15 AM
    const marketCloseTime = 15 * 60 + 30;  // 3:30 PM
    const misCutoff = 15 * 60 + 20;       // 3:20 PM (MIS cutoff)
    
    // Check if it's weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log('📅 Weekend detected - Using CNC for AMO orders');
        return 'CNC';
    }
    
    // Check if markets are open
    const isMarketOpen = currentTime >= marketOpenTime && currentTime <= marketCloseTime;
    
    if (isMarketOpen) {
        // During market hours: Use MIS until 3:20 PM, then CNC
        const productType = currentTime < misCutoff ? 'MIS' : 'CNC';
        console.log(`📊 Market OPEN - Using ${productType} (Current: ${hours}:${minutes.toString().padStart(2, '0')})`);
        return productType;
    } else {
        // Outside market hours: Use CNC for AMO orders
        console.log(`🌙 Market CLOSED - Using CNC for AMO orders (Current: ${hours}:${minutes.toString().padStart(2, '0')})`);
        return 'CNC';
    }
}

// Get active positions to check before placing orders
async function getActivePositions(accessToken) {
    try {
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        const positions = await kite.getPositions();
        const activePositions = positions.net?.filter(pos => pos.quantity !== 0) || [];
        
        console.log(`📊 Found ${activePositions.length} active positions`);
        return activePositions;
    } catch (error) {
        console.error('❌ Error fetching positions:', error.message);
        return [];
    }
}



// Helper functions to call SEPARATE order routes
async function callSeparateBuyOrderRoute(accessToken, symbol, ltp, requestedQuantity = null) {
    try {
        const productType = 'MIS'; // Force MIS for all orders
        const roundedPrice = roundToTickSize(ltp, ltp);
        
        // CALCULATE PROPER QUANTITY BASED ON FUNDS AND LEVERAGE
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        console.log('💰 Getting account funds for quantity calculation...');
        const margins = await kite.getMargins();
        
        let availableFunds = 0;
        if (margins.equity && margins.equity.available) {
            availableFunds = margins.equity.available.live_balance || 0;
        } else if (margins.equity && margins.equity.net) {
            availableFunds = margins.equity.net || 0;
        } else if (margins.net) {
            availableFunds = margins.net || 0;
        }
        
        const leverageFunds = availableFunds * 5; // 5x leverage for MIS
        const usableFunds = leverageFunds * 0.95; // Use 95% of leveraged funds for safety
        
        // Check minimum leveraged amount requirement (₹400,000)
        const minLeveragedAmount = 400000;
        if (leverageFunds < minLeveragedAmount) {
            return {
                success: false,
                error: `Insufficient leveraged funds. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${leverageFunds.toLocaleString('en-IN')}`,
                leverageFunds: leverageFunds,
                minRequired: minLeveragedAmount
            };
        }
        
        const maxQuantity = Math.floor(usableFunds / ltp);
        const finalQuantity = requestedQuantity ? Math.min(requestedQuantity, maxQuantity) : maxQuantity;
        
        // CONSOLE LOG ALL CALCULATIONS
        console.log('\n🔵 BUY ORDER QUANTITY CALCULATION:');
        console.log('💰 Available Funds:', '₹' + availableFunds.toLocaleString('en-IN'));
        console.log('⚡ Leveraged Funds (5x):', '₹' + leverageFunds.toLocaleString('en-IN'));
        console.log('✅ Leveraged Amount Check:', `₹${leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        console.log('🔒 Usable Funds (95%):', '₹' + usableFunds.toLocaleString('en-IN'));
        console.log('⚡ Leveraged Funds (5x):', '₹' + leverageFunds.toLocaleString('en-IN'));
        console.log('💵 Price per Share:', '₹' + ltp);
        console.log('🔢 Max Possible Quantity:', maxQuantity);
        console.log('📊 Final Quantity:', finalQuantity);
        console.log('💸 Total Investment:', '₹' + (finalQuantity * ltp).toLocaleString('en-IN'));
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'BUY',
            quantity: finalQuantity,
            price: roundedPrice,
            product: productType,
            order_type: 'MARKET',
            validity: 'DAY'
        };
        
        // 🎯 DIRECT KITE ORDER: Market impact verified - placing order directly
        const result = await kite.placeOrder('regular', orderParams);
        
        if (result && result.order_id) {
            return {
                success: true,
                order_id: result.order_id,
                message: `Market impact verified buy order placed for ${symbol}`,
                symbol: symbol,
                quantity: finalQuantity,
                price: roundedPrice,
                order_type: 'MARKET',
                leveraged_amount: finalQuantity * roundedPrice,
                marketImpactVerified: true
            };
        } else {
            throw new Error('KiteConnect order placement failed');
        }
        
    } catch (error) {
        console.error('❌ SEPARATE BUY route call failed:', error);
        throw error;
    }
}

async function callSeparateSellOrderRoute(accessToken, symbol, ltp, requestedQuantity = null) {
    try {
        const productType = 'MIS'; // Force MIS for all orders (allows short selling)
        const roundedPrice = roundToTickSize(ltp, ltp);
        
        // CALCULATE PROPER QUANTITY BASED ON FUNDS AND LEVERAGE
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        console.log('💰 Getting account funds for quantity calculation...');
        const margins = await kite.getMargins();
        
        let availableFunds = 0;
        if (margins.equity && margins.equity.available) {
            availableFunds = margins.equity.available.live_balance || 0;
        } else if (margins.equity && margins.equity.net) {
            availableFunds = margins.equity.net || 0;
        } else if (margins.net) {
            availableFunds = margins.net || 0;
        }
        
        const leverageFunds = availableFunds * 5; // 5x leverage for MIS
        const usableFunds = leverageFunds * 0.95; // Use 95% of leveraged funds for safety
        
        // Check minimum leveraged amount requirement (₹400,000)
        const minLeveragedAmount = 400000;
        if (leverageFunds < minLeveragedAmount) {
            console.log(`❌ Insufficient leveraged funds for SELL: ₹${leverageFunds.toLocaleString('en-IN')} < ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
            return {
                success: false,
                error: `Insufficient leveraged funds for short selling. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${leverageFunds.toLocaleString('en-IN')}`,
                leverageFunds: leverageFunds,
                minRequired: minLeveragedAmount
            };
        }
        
        const maxQuantity = Math.floor(usableFunds / ltp);
        const finalQuantity = requestedQuantity ? Math.min(requestedQuantity, maxQuantity) : maxQuantity;
        
        // CONSOLE LOG ALL CALCULATIONS
        console.log('\n🔴 SELL ORDER QUANTITY CALCULATION:');
        console.log('💰 Available Funds:', '₹' + availableFunds.toLocaleString('en-IN'));
        console.log('⚡ Leveraged Funds (5x):', '₹' + leverageFunds.toLocaleString('en-IN'));
        console.log('✅ Leveraged Amount Check:', `₹${leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        console.log('🔒 Usable Funds (95%):', '₹' + usableFunds.toLocaleString('en-IN'));
        console.log('⚡ Leveraged Funds (5x):', '₹' + leverageFunds.toLocaleString('en-IN'));
        console.log('💵 Price per Share:', '₹' + ltp);
        console.log('🔢 Max Possible Quantity:', maxQuantity);
        console.log('📊 Final Quantity:', finalQuantity);
        console.log('💸 Total Investment:', '₹' + (finalQuantity * ltp).toLocaleString('en-IN'));
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'SELL',
            quantity: finalQuantity,
            price: roundedPrice,
            product: productType,
            order_type: 'MARKET',
            validity: 'DAY'
        };
        
        // 🎯 DIRECT KITE ORDER: Market impact verified - placing short sell order directly
        console.log(`🚀 MARKET IMPACT VERIFIED SELL: Placing short sell order directly via KiteConnect`);
        console.log('📋 Order Details:', orderParams);
        
        const result = await kite.placeOrder('regular', orderParams);
        
        if (result && result.order_id) {
            console.log(`✅ DIRECT SELL ORDER SUCCESS: ${result.order_id} for ${symbol}`);
            return {
                success: true,
                order_id: result.order_id,
                message: `Market impact verified sell (short) order placed for ${symbol}`,
                symbol: symbol,
                quantity: finalQuantity,
                price: roundedPrice,
                order_type: 'MARKET',
                leveraged_amount: finalQuantity * roundedPrice,
                marketImpactVerified: true
            };
        } else {
            throw new Error('KiteConnect short sell order placement failed');
        }
        
    } catch (error) {
        console.error('❌ SEPARATE SELL route call failed:', error);
        throw error;
    }
}

// Helper function to make TradingView API call
async function makeScannorCall(payload, scannerType, requestInfo = {}) {
    try {
       // console.log(`🔍 Making ${scannerType} scanner call to TradingView API...`);
       // console.log(`📝 Payload:`, JSON.stringify(payload, null, 2));
        
        // Always try to make the TradingView API call first
       // console.log(`📡 Sending request to: ${TRADINGVIEW_SCANNER_URL}`);
        
        const response = await fetch(TRADINGVIEW_SCANNER_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json',
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify(payload)
        });
        
      //  console.log(`📊 TradingView API Response Status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`TradingView API error: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
      //  console.log(`✅ TradingView API Response:`, data);
      //  console.log(`📈 Stocks found: ${data.data ? data.data.length : 0}`);
        
        return {
            data: data,
            scannerType: scannerType,
            timestamp: new Date().toISOString(),
            success: true
        };
        
    } catch (error) {
        console.error(`❌ Error in ${scannerType} scanner:`, error.message);
        
        // Return error response
        return {
            success: false,
            error: error.message,
            scannerType: scannerType,
            timestamp: new Date().toISOString(),
            data: { data: [] } // Empty data array
        };
    }
}

// Auto-subscribe to scanner results  
// Enhanced subscription management with unsubscribe/resubscribe
async function autoSubscribeToResults(buyStocks, sellStocks, access_token) {
    try {
        console.log('🔄 === SUBSCRIPTION MANAGEMENT ===');
        console.log(`📊 Buy stocks: ${buyStocks.length}, Sell stocks: ${sellStocks.length}`);
        
        if (!access_token || access_token === 'demo_token') {
            console.log('⚠️ No valid access token for auto subscription');
            return;
        }

        // Extract tokens from both buy and sell stocks
        const newTokens = new Set();
        
        console.log('🔍 DEBUG - buyStocks length:', buyStocks.length);
        console.log('🔍 DEBUG - sellStocks length:', sellStocks.length);
        console.log('🔍 DEBUG - First buyStock:', JSON.stringify(buyStocks[0], null, 2));
        
        // Process buy stocks
        buyStocks.forEach((stock, index) => {
            console.log(`🔍 DEBUG - Processing buyStock[${index}]:`, JSON.stringify(stock, null, 2));
            
            // Extract symbol from TradingView format (NSE:SYMBOL)
            let symbol = null;
            let token = null;
            
            if (stock.s && typeof stock.s === 'string' && stock.s.includes(':')) {
                symbol = stock.s.split(':')[1]; // Extract SYMBOL from "NSE:SYMBOL"
                console.log(`🔍 Extracted symbol: "${symbol}" from "${stock.s}"`);
                
                if (symbol && symbolMappings.symbolMappings[symbol]) {
                    token = symbolMappings.symbolMappings[symbol];
                    console.log(`✅ Found token for ${symbol}: ${token}`);
                } else {
                    console.log(`❌ No token mapping found for symbol: "${symbol}"`);
                    console.log(`🔍 Available mappings sample:`, Object.keys(symbolMappings.symbolMappings).slice(0, 10));
                }
            } else {
                console.log(`❌ Invalid stock.s format:`, stock.s);
            }
            
            if (token && symbol) {
                newTokens.add(parseInt(token));
                scanTypeTracker.set(parseInt(token), 'BUY_SCAN');
                console.log(`🟢 BUY ADDED: ${symbol} (${token}) -> BUY_SCAN tracked`);
            } else {
                console.log(`❌ SKIPPED - No valid token for buyStock[${index}]`);
            }
        });
        
        // Process sell stocks  
        sellStocks.forEach((stock, index) => {
            console.log(`🔍 DEBUG - Processing sellStock[${index}]:`, JSON.stringify(stock, null, 2));
            
            // Extract symbol from TradingView format (NSE:SYMBOL)
            let symbol = null;
            let token = null;
            
            if (stock.s && typeof stock.s === 'string' && stock.s.includes(':')) {
                symbol = stock.s.split(':')[1]; // Extract SYMBOL from "NSE:SYMBOL"  
                console.log(`🔍 Extracted symbol: "${symbol}" from "${stock.s}"`);
                
                if (symbol && symbolMappings.symbolMappings[symbol]) {
                    token = symbolMappings.symbolMappings[symbol];
                    console.log(`✅ Found token for ${symbol}: ${token}`);
                } else {
                    console.log(`❌ No token mapping found for symbol: "${symbol}"`);
                }
            } else {
                console.log(`❌ Invalid stock.s format:`, stock.s);
            }
            
            if (token && symbol) {
                newTokens.add(parseInt(token));
                scanTypeTracker.set(parseInt(token), 'SELL_SCAN');
                console.log(`🔴 SELL ADDED: ${symbol} (${token}) -> SELL_SCAN tracked`);
            } else {
                console.log(`❌ SKIPPED - No valid token for sellStock[${index}]`);
            }
        });

        console.log(`📈 Total unique tokens to subscribe: ${newTokens.size}`);
        console.log(`🔍 Current subscriptions: ${currentlySubscribed.size}`);
        console.log('🔍 Current subscribed tokens:', Array.from(currentlySubscribed));
        console.log('🔍 New tokens from scan:', Array.from(newTokens));
        
        // Always initialize ticker if needed - required for fallback subscription
        if (!globalTicker) {
            console.log('🚀 Initializing global KiteTicker...');
            globalTicker = new KiteTicker({
                api_key: 'r1a7qo9w30bxsfax',
                access_token: access_token
            });
            
            setupTickerEventHandlers();
            globalTicker.connect();
            
            // Subscribe to new tokens if any exist
            if (newTokens.size > 0) {
                // Subscribe after connection with delay
                setTimeout(async () => {
                    try {
                        const tokensArray = Array.from(newTokens);
                        console.log(`🟢 Subscribing to tokens: ${tokensArray.join(', ')}`);
                        globalTicker.subscribe(tokensArray);
                        globalTicker.setMode(globalTicker.modeFull, tokensArray);
                        
                        // Update subscription tracking
                        tokensArray.forEach(token => currentlySubscribed.add(token));
                        
                        console.log('✅ All tokens subscribed successfully');
                        broadcastSubscriptionUpdate();
                        
                    } catch (error) {
                        console.error('❌ Error during subscription:', error);
                    }
                }, 2000);
            } else {
                console.log('🔧 Ticker initialized - ready for fallback subscription');
            }
        } else if (globalTicker) {
            // Ticker exists, manage subscriptions (even if no new tokens)
            const tokensToUnsubscribe = [];
            const tokensToSubscribe = [];
            
            console.log(`🔧 Managing subscriptions - Current: ${currentlySubscribed.size}, New: ${newTokens.size}`);
            
            // 🚫 AUTO-UNSUBSCRIBE DISABLED: Keep stocks subscribed even when they no longer meet scan conditions
            // Only manual unsubscribe via "Unsub" button will remove stocks from live data
            /*
            // Find tokens to unsubscribe (no longer in scan results)
            currentlySubscribed.forEach(token => {
                if (!newTokens.has(token)) {
                    tokensToUnsubscribe.push(token);
                }
            });
            */
            
            // Find tokens to subscribe (new in scan results)
            newTokens.forEach(token => {
                if (!currentlySubscribed.has(token)) {
                    tokensToSubscribe.push(token);
                }
            });
            
            console.log(`📊 Subscription changes: 0 to unsubscribe (auto-unsubscribe disabled), ${tokensToSubscribe.length} to subscribe`);
            
            // 🚫 AUTO-UNSUBSCRIBE DISABLED: Stocks stay subscribed for manual control
            /*
            // Unsubscribe from removed tokens
            if (tokensToUnsubscribe.length > 0) {
                console.log(`🔴 Unsubscribing from ${tokensToUnsubscribe.length} tokens:`, tokensToUnsubscribe);
                try {
                    globalTicker.unsubscribe(tokensToUnsubscribe);
                    tokensToUnsubscribe.forEach(token => {
                        currentlySubscribed.delete(token);
                        scanTypeTracker.delete(token);
                        console.log(`❌ Unsubscribed: ${token}`);
                    });
                } catch (error) {
                    console.error('❌ Error during unsubscription:', error);
                }
            } else {
                console.log('✅ No tokens to unsubscribe');
            }
            */
            console.log('✅ Auto-unsubscribe disabled - stocks remain subscribed for manual control');
            
            // Subscribe to new tokens
            if (tokensToSubscribe.length > 0) {
                console.log(`🟢 Subscribing to ${tokensToSubscribe.length} new tokens:`, tokensToSubscribe);
                try {
                    globalTicker.subscribe(tokensToSubscribe);
                    globalTicker.setMode(globalTicker.modeFull, tokensToSubscribe);
                    tokensToSubscribe.forEach(token => {
                        currentlySubscribed.add(token);
                        console.log(`✅ Subscribed: ${token}`);
                    });
                    
                } catch (error) {
                    console.error('❌ Error subscribing to new tokens:', error);
                }
            } else {
                console.log('✅ No new tokens to subscribe');
            }
            
            // Special case: If no scan results at all, subscribe to RELIANCE fallback
            if (newTokens.size === 0 && currentlySubscribed.size === 0) {
                console.log('📭 No scan results and no active subscriptions - subscribing to RELIANCE fallback');
                
                // Subscribe to RELIANCE as fallback when no stocks are subscribed
                const relianceToken = 738561; // RELIANCE token
                
                // Add delay to ensure ticker is connected (same as regular subscription)
                setTimeout(async () => {
                    try {
                        console.log(`🏛️ Subscribing to RELIANCE fallback (${relianceToken})`);
                        globalTicker.subscribe([relianceToken]);
                        globalTicker.setMode(globalTicker.modeFull, [relianceToken]);
                        currentlySubscribed.add(relianceToken);
                        scanTypeTracker.set(relianceToken, 'FALLBACK'); // Mark as fallback, not scan result
                        console.log('✅ RELIANCE fallback subscribed successfully');
                        broadcastSubscriptionUpdate();
                    } catch (error) {
                        console.error('❌ Error subscribing to RELIANCE fallback:', error);
                    }
                }, 2000);
            } else if (newTokens.size === 0 && currentlySubscribed.size > 0) {
                console.log('📊 No new scan results - keeping existing subscriptions (auto-unsubscribe disabled)');
            }
            
            broadcastSubscriptionUpdate();
        }
    } catch (error) {
        console.error('❌ Error in autoSubscribeToResults:', error);
    }
}

// Setup ticker event handlers (separated for clarity)
function setupTickerEventHandlers() {
    if (!globalTicker) return;
    
    globalTicker.on('connect', () => {
        console.log('✅ KiteTicker connected successfully');
        console.log('📊 Current subscriptions after connect:', Array.from(currentlySubscribed));
    });
    
    globalTicker.on('error', (err) => {
        console.error('❌ KiteTicker error:', err);
    });
    
    globalTicker.on('disconnect', () => {
        console.log('🔌 KiteTicker disconnected');
    });
    
    globalTicker.on('ticks', (ticks) => {
        console.log(`📊 ✅ RECEIVED ${ticks.length} TICK UPDATES - DEBUGGING ENABLED`);
        
        // Log first tick for debugging
        if (ticks.length > 0) {
            const firstTick = ticks[0];
            // Log COMPLETE tick object to see ALL available properties
            // console.log('📊 COMPLETE KITETICKER TICK OBJECT:', {
            //     symbol: getSymbolFromToken(firstTick.instrument_token.toString()),
            //     allProperties: Object.keys(firstTick),
            //     fullTickData: firstTick,
            //     depthLevels: {
            //         buyLevels: firstTick.depth?.buy?.length || 0,
            //         sellLevels: firstTick.depth?.sell?.length || 0
            //     }
            // });
            
            // DETAILED DEPTH ANALYSIS - Check if we're missing deeper levels
            if (firstTick.depth) {
                console.log('🔍 DETAILED KITETICKER DEPTH ANALYSIS:', {
                    symbol: getSymbolFromToken(firstTick.instrument_token.toString()),
                    depthStructure: {
                        buyDepthComplete: firstTick.depth.buy,
                        sellDepthComplete: firstTick.depth.sell,
                        buyLevelCount: firstTick.depth.buy?.length || 0,
                        sellLevelCount: firstTick.depth.sell?.length || 0,
                        hasMoreThan5Levels: (firstTick.depth.buy?.length || 0) > 5 || (firstTick.depth.sell?.length || 0) > 5,
                        // CHECK FOR ADDITIONAL DEPTH PROPERTIES
                        additionalDepthProps: Object.keys(firstTick.depth).filter(key => !['buy', 'sell'].includes(key)),
                        // CHECK IF THERE'S A DEPTH ARRAY OR OTHER STRUCTURE
                        depthKeys: Object.keys(firstTick.depth),
                        depthValues: Object.values(firstTick.depth).map(val => Array.isArray(val) ? `Array[${val.length}]` : typeof val)
                    }
                });
                
                // EXHAUSTIVE CHECK FOR HIDDEN DEPTH DATA
                console.log('🔬 EXHAUSTIVE KITETICKER TICK ANALYSIS:', {
                    symbol: getSymbolFromToken(firstTick.instrument_token.toString()),
                    allTickKeys: Object.keys(firstTick),
                    potentialDepthFields: Object.keys(firstTick).filter(key => 
                        key.toLowerCase().includes('depth') || 
                        key.toLowerCase().includes('level') ||
                        key.toLowerCase().includes('book') ||
                        key.toLowerCase().includes('order')
                    ),
                    arrayFields: Object.keys(firstTick).filter(key => Array.isArray(firstTick[key])),
                    objectFields: Object.keys(firstTick).filter(key => 
                        typeof firstTick[key] === 'object' && 
                        firstTick[key] !== null && 
                        !Array.isArray(firstTick[key])
                    )
                });
            }
            
            // Log any properties we might be missing
            const expectedProps = [
                'instrument_token', 'last_price', 'last_quantity', 'average_price', 
                'volume_traded', 'total_buy_quantity', 'total_sell_quantity', 
                'ohlc', 'change', 'last_trade_time', 'oi', 'oi_day_high', 
                'oi_day_low', 'depth', 'timestamp'
            ];
            
            const actualProps = Object.keys(firstTick);
            const missingProps = expectedProps.filter(prop => !actualProps.includes(prop));
            const extraProps = actualProps.filter(prop => !expectedProps.includes(prop));
            
            console.log('📊 TICK PROPERTY ANALYSIS:', {
                expectedProps: expectedProps.length,
                actualProps: actualProps.length,
                missingProps: missingProps,
                extraProps: extraProps,
                isFullTickData: missingProps.length === 0 && extraProps.length >= 0
            });
        }
        
        // ====================================================================
        // SINGLE TRADE EXECUTION PATH: SCAN → SUBSCRIBE → MARKET IMPACT → TRADE
        // ====================================================================
        // Only Market Impact-Based Execution for Subscribed Stocks
        if (global.autoTrade && currentlySubscribed.size > 0) {
            ticks.forEach(async tick => {
                const token = tick.instrument_token;
                const ltp = tick.last_price;
                const symbol = getSymbolFromToken(token.toString());
                const scanType = scanTypeTracker.get(token) || 'UNKNOWN';
                
                // Only process if this is a currently subscribed stock
                if (!currentlySubscribed.has(token)) {
                    return;
                }
                
                // Skip if no depth data available for market impact analysis
                if (!tick.depth || (!tick.depth.buy || !tick.depth.sell)) {
                    return;
                }
                
                try {
                    console.log(`🎯 MARKET IMPACT ANALYSIS: ${symbol} @ ₹${ltp} - ScanType: ${scanType}`);
                    
                    // Calculate market impact for both BUY and SELL scenarios
                    const buyImpact = calculateMarketImpact(tick.depth, ltp, 'BUY_SCAN', 490000);
                    const sellImpact = calculateMarketImpact(tick.depth, ltp, 'SELL_SCAN', 490000);
                    
                    // ====================================================================
                    // POSITION-FIRST EXECUTION STRATEGY:
                    // 1. Check positions first - if exist, place missing target orders
                    // 2. Only place new market orders when NO active positions exist
                    // 3. Target orders = ₹1500 profit for existing positions
                    // ==================================================================== 
                    
                    // Execution criteria: levels <= 3 AND slippage <= 0.08%
                    const maxLevels = 3;
                    const maxSlippage = 0.08; // 0.08%
                    
                    console.log(`📊 ${symbol} Impact Analysis:`);
                    console.log(`   BUY: Levels=${buyImpact.impactedLevels}, Slippage=${buyImpact.totalSlippage?.toFixed(4)}%`);
                    console.log(`   SELL: Levels=${sellImpact.impactedLevels}, Slippage=${Math.abs(sellImpact.totalSlippage || 0).toFixed(4)}%`);
                    
                    let orderExecuted = false;
                    const accessToken = global.lastAccessToken || 'demo_token';
                    
                    // ====================================================================
                    // POSITION-FIRST EXECUTION LOGIC
                    // ====================================================================
                    // STEP 1: Always check positions first before any order placement
                    console.log(`🔍 STEP 1: Checking existing positions for ${symbol}...`);
                    
                    if (accessToken !== 'demo_token') {
                        try {
                            const currentPositions = await getCurrentPositions(accessToken);
                            const hasAnyPositions = currentPositions.some(pos => Math.abs(pos.quantity) > 0);
                            
                            if (hasAnyPositions) {
                                console.log(`📊 POSITIONS FOUND: Processing existing positions for target orders`);
                                
                                // Check each position for missing target orders
                                for (const position of currentPositions) {
                                    if (Math.abs(position.quantity) > 0) {
                                        const posSymbol = position.tradingsymbol;
                                        const quantity = parseInt(position.quantity);
                                        const avgPrice = parseFloat(position.average_price || position.price);
                                        const side = quantity > 0 ? 'BUY' : 'SELL';
                                        
                                        console.log(`📊 Found position: ${posSymbol} Qty=${quantity}, AvgPrice=₹${avgPrice}, Side=${side}`);
                                        
                                        // Check if target order already exists for this symbol
                                        if (!targetOrders.has(posSymbol) && !activePositions.has(posSymbol)) {
                                            console.log(`🎯 NO TARGET ORDER EXISTS for ${posSymbol} - Placing target order`);
                                            
                                            // Calculate target price for ₹1500 profit
                                            const targetPrice = calculateTargetPrice(avgPrice, quantity, side, 1500);
                                            
                                            console.log(`🎯 Calculated target price: ₹${targetPrice.toFixed(2)} for ₹1500 profit`);
                                            
                                            // Store active position
                                            activePositions.set(posSymbol, {
                                                quantity: quantity,
                                                avgPrice: avgPrice,
                                                side: side,
                                                entryTime: new Date().toISOString(),
                                                targetOrderId: null
                                            });
                                            
                                            // Place target order
                                            const targetResult = await placeTargetOrder(accessToken, posSymbol, quantity, targetPrice, side);
                                            
                                            if (targetResult.success) {
                                                const posData = activePositions.get(posSymbol);
                                                posData.targetOrderId = targetResult.orderId;
                                                activePositions.set(posSymbol, posData);
                                                
                                                console.log(`✅ TARGET ORDER PLACED: ${targetResult.orderId} for ${posSymbol}`);
                                                
                                                // Broadcast target order placement
                                                if (global.broadcastLiveData) {
                                                    global.broadcastLiveData({
                                                        type: 'target_order_placed',
                                                        position: {
                                                            symbol: posSymbol,
                                                            quantity,
                                                            avgPrice,
                                                            side,
                                                            targetPrice,
                                                            targetOrderId: targetResult.orderId,
                                                            targetProfit: 1500,
                                                            timestamp: new Date().toISOString()
                                                        }
                                                    });
                                                }
                                            } else {
                                                console.log(`❌ Failed to place target order for ${posSymbol}`);
                                            }
                                        } else {
                                            console.log(`✅ Target order already exists for ${posSymbol} - Skipping`);
                                        }
                                    }
                                }
                                
                                // IMPORTANT: Don't place any new market orders when positions exist
                                console.log(`🚫 BLOCKING NEW MARKET ORDERS: Active positions exist`);
                                return;
                                
                            } else {
                                console.log(`✅ NO ACTIVE POSITIONS: Proceeding with market order logic for ${symbol}`);
                            }
                            
                        } catch (error) {
                            console.error(`❌ Error checking positions: ${error.message}`);
                            // In case of error, proceed with caution - don't place orders
                            return;
                        }
                    } else {
                        console.log(`📝 DEMO MODE: Skipping position check, proceeding with demo logic`);
                    }
                    
                    // ====================================================================
                    // STEP 2: MARKET ORDER EXECUTION (Only when no active positions exist)
                    // ====================================================================
                    
                    // ====================================================================
                    // LIVE LTP VERIFICATION: Re-verify scanner conditions with live tick data
                    // ====================================================================
                    const buyCandidate = buyCandidates.get(token);
                    const sellCandidate = sellCandidates.get(token);
                    let liveBuyConditionsValid = false;
                    let liveSellConditionsValid = false;
                    
                    // Verify BUY conditions with live LTP
                    if (buyCandidate && scanType === 'BUY_SCAN') {
                        const liveLtpBelowEma3_15 = ltp < buyCandidate.ema3_15;
                        const liveLtpBelowEma5_5 = ltp < buyCandidate.ema5_5;
                        liveBuyConditionsValid = liveLtpBelowEma3_15 && liveLtpBelowEma5_5;
                        
                        console.log(`🔄 LIVE BUY VERIFICATION for ${symbol}:`);
                        console.log(`   Live LTP: ₹${ltp}`);
                        console.log(`   EMA3(15min): ₹${buyCandidate.ema3_15} | LTP < EMA3: ${liveLtpBelowEma3_15}`);
                        console.log(`   EMA5(5min): ₹${buyCandidate.ema5_5} | LTP < EMA5: ${liveLtpBelowEma5_5}`);
                        console.log(`   ✅ Live BUY conditions: ${liveBuyConditionsValid}`);
                    }
                    
                    // Verify SELL conditions with live LTP  
                    if (sellCandidate && scanType === 'SELL_SCAN') {
                        const liveLtpAboveEma3_15 = ltp > sellCandidate.ema3_15;
                        const liveLtpAboveEma5_5 = ltp > sellCandidate.ema5_5;
                        liveSellConditionsValid = liveLtpAboveEma3_15 && liveLtpAboveEma5_5;
                        
                        console.log(`🔄 LIVE SELL VERIFICATION for ${symbol}:`);
                        console.log(`   Live LTP: ₹${ltp}`);
                        console.log(`   EMA3(15min): ₹${sellCandidate.ema3_15} | LTP > EMA3: ${liveLtpAboveEma3_15}`);
                        console.log(`   EMA5(5min): ₹${sellCandidate.ema5_5} | LTP > EMA5: ${liveLtpAboveEma5_5}`);
                        console.log(`   ✅ Live SELL conditions: ${liveSellConditionsValid}`);
                    }
                    
                    // Check BUY execution criteria (for BUY_SCAN or favorable buy conditions)
                    if (buyImpact.impactedLevels > 0 && 
                        buyImpact.impactedLevels <= maxLevels && 
                        Math.abs(buyImpact.totalSlippage || 0) <= maxSlippage &&
                        !processedOrders.has(`${symbol}_MARKET_BUY`) &&
                        (scanType === 'BUY_SCAN' ? liveBuyConditionsValid : true)) { // Add live verification for BUY_SCAN
                        
                        console.log(`🚀 NEW MARKET BUY EXECUTION: ${symbol} (No active positions)`);
                        console.log(`   ✅ Levels: ${buyImpact.impactedLevels} <= ${maxLevels}`);
                        console.log(`   ✅ Slippage: ${Math.abs(buyImpact.totalSlippage || 0).toFixed(4)}% <= ${maxSlippage}%`);
                        console.log(`   💰 Avg Execution Price: ₹${buyImpact.avgExecutionPrice?.toFixed(2)}`);
                        
                        // Mark as processed to avoid duplicates
                        processedOrders.add(`${symbol}_MARKET_BUY`);
                        
                        if (accessToken !== 'demo_token') {
                            try {
                                const buyResult = await callSeparateBuyOrderRoute(accessToken, symbol, ltp);
                                if (buyResult && buyResult.success) {
                                    console.log(`✅ MARKET IMPACT BUY ORDER EXECUTED: ${symbol} @ ₹${ltp}`);
                                    console.log(`📊 Market Impact: Levels=${buyImpact.impactedLevels}, Slippage=${buyImpact.totalSlippage?.toFixed(4)}%`);
                                    orderExecuted = true;
                                    
                                    // ====================================================================
                                    // POSITION MANAGEMENT: Process new position and place target order
                                    // ====================================================================
                                    setTimeout(async () => {
                                        await processNewPosition(accessToken, symbol, 'BUY');
                                    }, 3000); // Wait 3 seconds for position to update
                                    
                                    // Broadcast successful order
                                    if (global.broadcastLiveData) {
                                        global.broadcastLiveData({
                                            type: 'market_impact_order_executed',
                                            order: {
                                                symbol,
                                                type: 'MARKET_BUY',
                                                ltp,
                                                executionPrice: buyImpact.avgExecutionPrice,
                                                levels: buyImpact.impactedLevels,
                                                slippage: buyImpact.totalSlippage,
                                                quantity: buyImpact.quantity,
                                                status: 'SUCCESS',
                                                timestamp: new Date().toISOString()
                                            }
                                        });
                                        
                                        // 🚀 AUTO KITE CHART: Open Kite chart for successful BUY order
                                        global.broadcastLiveData({
                                            type: 'order_charts',
                                            charts: [{
                                                symbol: symbol,
                                                orderType: 'BUY',
                                                chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}`,
                                                message: `Kite chart opened for successful BUY order: ${symbol}`,
                                                timestamp: new Date().toISOString()
                                            }]
                                        });
                                    }
                                } else {
                                    console.log(`❌ MARKET IMPACT BUY FAILED: ${symbol} - ${buyResult?.error || 'Unknown error'}`);
                                    processedOrders.delete(`${symbol}_MARKET_BUY`);
                                }
                            } catch (orderError) {
                                console.error(`❌ MARKET IMPACT BUY ERROR: ${symbol} - ${orderError.message}`);
                                processedOrders.delete(`${symbol}_MARKET_BUY`);
                            }
                        } else {
                            console.log(`📝 DEMO MODE: Would execute BUY ${symbol} @ ₹${ltp} (Levels: ${buyImpact.impactedLevels}, Slippage: ${buyImpact.totalSlippage?.toFixed(4)}%)`);
                        }
                    }
                    
                    // Check SELL execution criteria (for SELL_SCAN or favorable sell conditions)
                    if (!orderExecuted && 
                        sellImpact.impactedLevels > 0 && 
                        sellImpact.impactedLevels <= maxLevels && 
                        Math.abs(sellImpact.totalSlippage || 0) <= maxSlippage &&
                        !processedOrders.has(`${symbol}_MARKET_SELL`) &&
                        (scanType === 'SELL_SCAN' ? liveSellConditionsValid : true)) { // Add live verification for SELL_SCAN
                        
                        console.log(`🚀 NEW MARKET SELL EXECUTION: ${symbol} (No active positions)`);
                        console.log(`   ✅ Levels: ${sellImpact.impactedLevels} <= ${maxLevels}`);
                        console.log(`   ✅ Slippage: ${Math.abs(sellImpact.totalSlippage || 0).toFixed(4)}% <= ${maxSlippage}%`);
                        console.log(`   💰 Avg Execution Price: ₹${sellImpact.avgExecutionPrice?.toFixed(2)}`);
                        
                        // Mark as processed to avoid duplicates
                        processedOrders.add(`${symbol}_MARKET_SELL`);
                        
                        if (accessToken !== 'demo_token') {
                            try {
                                const sellResult = await callSeparateSellOrderRoute(accessToken, symbol, ltp);
                                if (sellResult && sellResult.success) {
                                    console.log(`✅ MARKET IMPACT SELL ORDER EXECUTED: ${symbol} @ ₹${ltp}`);
                                    console.log(`📊 Market Impact: Levels=${sellImpact.impactedLevels}, Slippage=${sellImpact.totalSlippage?.toFixed(4)}%`);
                                    
                                    // ====================================================================
                                    // POSITION MANAGEMENT: Process new position and place target order
                                    // ====================================================================
                                    setTimeout(async () => {
                                        await processNewPosition(accessToken, symbol, 'SELL');
                                    }, 3000); // Wait 3 seconds for position to update
                                    
                                    // Broadcast successful order
                                    if (global.broadcastLiveData) {
                                        global.broadcastLiveData({
                                            type: 'market_impact_order_executed',
                                            order: {
                                                symbol,
                                                type: 'MARKET_SELL',
                                                ltp,
                                                executionPrice: sellImpact.avgExecutionPrice,
                                                levels: sellImpact.impactedLevels,
                                                slippage: sellImpact.totalSlippage,
                                                quantity: sellImpact.quantity,
                                                status: 'SUCCESS',
                                                timestamp: new Date().toISOString()
                                            }
                                        });
                                        
                                        // 🚀 AUTO KITE CHART: Open Kite chart for successful SELL order
                                        global.broadcastLiveData({
                                            type: 'order_charts',
                                            charts: [{
                                                symbol: symbol,
                                                orderType: 'SELL', 
                                                chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${symbol}`,
                                                message: `Kite chart opened for successful SELL order: ${symbol}`,
                                                timestamp: new Date().toISOString()
                                            }]
                                        });
                                    }
                                } else {
                                    console.log(`❌ MARKET IMPACT SELL FAILED: ${symbol} - ${sellResult?.error || 'Unknown error'}`);
                                    processedOrders.delete(`${symbol}_MARKET_SELL`);
                                }
                            } catch (orderError) {
                                console.error(`❌ MARKET IMPACT SELL ERROR: ${symbol} - ${orderError.message}`);
                                processedOrders.delete(`${symbol}_MARKET_SELL`);
                            }
                        } else {
                            console.log(`📝 DEMO MODE: Would execute SELL ${symbol} @ ₹${ltp} (Levels: ${sellImpact.impactedLevels}, Slippage: ${sellImpact.totalSlippage?.toFixed(4)}%)`);
                        }
                    }
                    
                    // Log if neither criteria met
                    if (!orderExecuted && 
                        (buyImpact.impactedLevels > maxLevels || Math.abs(buyImpact.totalSlippage || 0) > maxSlippage) &&
                        (sellImpact.impactedLevels > maxLevels || Math.abs(sellImpact.totalSlippage || 0) > maxSlippage)) {
                        console.log(`⚠️ ${symbol} - EXECUTION CRITERIA NOT MET:`);
                        if (buyImpact.impactedLevels > maxLevels) console.log(`   ❌ BUY Levels: ${buyImpact.impactedLevels} > ${maxLevels}`);
                        if (Math.abs(buyImpact.totalSlippage || 0) > maxSlippage) console.log(`   ❌ BUY Slippage: ${Math.abs(buyImpact.totalSlippage || 0).toFixed(4)}% > ${maxSlippage}%`);
                        if (sellImpact.impactedLevels > maxLevels) console.log(`   ❌ SELL Levels: ${sellImpact.impactedLevels} > ${maxLevels}`);
                        if (Math.abs(sellImpact.totalSlippage || 0) > maxSlippage) console.log(`   ❌ SELL Slippage: ${Math.abs(sellImpact.totalSlippage || 0).toFixed(4)}% > ${maxSlippage}%`);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error in market impact execution for ${symbol}:`, error.message);
                }
            });
        }
        
        // Broadcast to all connected WebSocket clients
        if (global.broadcastLiveData) {
            // Process each tick
            ticks.forEach(tick => {
                // Get proper symbol name from token
                const symbol = getSymbolFromToken(tick.instrument_token.toString());
               // console.log('📡 Broadcasting tick:', symbol, '₹' + tick.last_price);
                
                // Generate regime based on price action (mock for now)
                const change = tick.change || 0;
                let regime = 'CHOP';
                if (change > 2) regime = 'BULL';
                else if (change < -2) regime = 'BEAR';
                else if (Math.abs(change) > 1 && tick.volume < 50000) regime = 'TRAP';
                
                // Get scan type for this token
                const scanType = scanTypeTracker.get(tick.instrument_token) || 'UNKNOWN';
                
                console.log(`📡 BROADCASTING FULL 20-LEVEL TICK DATA: ${symbol} @ ₹${tick.last_price}`);
                
                // CAPTURE ORIGINAL UNTOUCHED DEPTH BEFORE ANY MODIFICATIONS
                const originalUntouchedDepth = tick.depth ? JSON.parse(JSON.stringify(tick.depth)) : { buy: [], sell: [] };
                
                // Enhance to 20 levels for ALL symbols (no masking, just depth extension)
                const fullDepth = enhanceDepthTo20Levels(tick.depth, tick.last_price, scanType, false);
                
                // LOG DEPTH LEVEL ANALYSIS
                console.log('📊 DEPTH LEVEL ANALYSIS:', {
                    symbol: symbol,
                    originalDepth: {
                        buyLevels: tick.depth?.buy?.length || 0,
                        sellLevels: tick.depth?.sell?.length || 0,
                        firstBuyPrice: tick.depth?.buy?.[0]?.price || 'N/A',
                        lastBuyPrice: tick.depth?.buy?.[tick.depth?.buy?.length - 1]?.price || 'N/A',
                        firstSellPrice: tick.depth?.sell?.[0]?.price || 'N/A',
                        lastSellPrice: tick.depth?.sell?.[tick.depth?.sell?.length - 1]?.price || 'N/A'
                    },
                    enhancedDepth: {
                        buyLevels: fullDepth.buy?.length || 0,
                        sellLevels: fullDepth.sell?.length || 0,
                        realLevels: tick.depth?.buy?.length || 0,
                        estimatedLevels: (fullDepth.buy?.length || 0) - (tick.depth?.buy?.length || 0),
                        level20BuyPrice: fullDepth.buy?.[19]?.price || 'N/A',
                        level20SellPrice: fullDepth.sell?.[19]?.price || 'N/A'
                    }
                });
                
                const buyImpact = calculateMarketImpact(fullDepth, tick.last_price, 'BUY_SCAN');
                const sellImpact = calculateMarketImpact(fullDepth, tick.last_price, 'SELL_SCAN');
                
                // Create structured tick data with 20-LEVEL DEPTH + RAW TICK DATA
                const structuredTick = {
                    symbol: symbol,
                    last_price: tick.last_price || 0,
                    volume: tick.volume_traded || tick.volume || 0,
                    change: change,
                    change_percent: tick.change ? ((tick.change / (tick.last_price - tick.change)) * 100).toFixed(2) : '0.00',
                    timestamp: new Date().toISOString(),
                    // Add calculated quantities at top level for easy access
                    calculated_quantity_buy: buyImpact.quantity,
                    calculated_quantity_sell: sellImpact.quantity,
                    calculated_quantity: Math.max(buyImpact.quantity, sellImpact.quantity), // Use larger quantity
                    depth: fullDepth, // 20-LEVEL ENHANCED DEPTH (MUST use fullDepth, not tick.depth!)
                    // RAW TICK DATA - ALL original properties preserved dynamically
                    rawTick: {
                        ...tick, // Include ALL properties from original tick
                        depth: originalUntouchedDepth, // Use UNTOUCHED original depth (no level/masked properties)
                        originalDepth: originalUntouchedDepth, // Also preserve as originalDepth for clarity
                        captureTimestamp: new Date().toISOString()
                    },
                    // Market Impact Data calculated from 20-level depth
                    marketImpact: {
                        buy: {
                            levels: buyImpact.impactedLevels,
                            slippage: buyImpact.totalSlippage,
                            avgPrice: buyImpact.avgExecutionPrice,
                            quantity: buyImpact.quantity
                        },
                        sell: {
                            levels: sellImpact.impactedLevels,
                            slippage: sellImpact.totalSlippage,
                            avgPrice: sellImpact.avgExecutionPrice,
                            quantity: sellImpact.quantity
                        }
                    },
                    ohlc: tick.ohlc || {
                        open: tick.last_price,
                        high: tick.last_price,
                        low: tick.last_price,
                        close: tick.last_price
                    },
                    regime: regime,
                    scan_type: scanType
                };
                
                // Broadcast single tick update with 20-level depth + raw data
                // console.log('📡 BROADCASTING STRUCTURE:', {
                //     type: 'single_tick',
                //     symbol: symbol,
                //     dataStructure: {
                //         depth: `${fullDepth.buy?.length || 0} buy + ${fullDepth.sell?.length || 0} sell levels (enhanced)`,
                //         rawTick: `${Object.keys(tick).length} original properties + originalDepth (${tick.depth?.buy?.length || 0}/${tick.depth?.sell?.length || 0} levels)`,
                //         marketImpact: 'buy + sell impact calculations',
                //         additionalFields: ['last_price', 'volume', 'change', 'timestamp', 'ohlc', 'regime', 'scan_type']
                //     }
                // });
                
                global.broadcastLiveData({
                    type: 'tick_update',
                    tick: structuredTick
                });
            });
            
            // Also send batch if more than 1 tick
            if (ticks.length > 1) {
                const structuredTicks = ticks.map(tick => {
                    const symbol = getSymbolFromToken(tick.instrument_token.toString());
                    const change = tick.change || 0;
                    let regime = 'CHOP';
                    if (change > 2) regime = 'BULL';
                    else if (change < -2) regime = 'BEAR';
                    else if (Math.abs(change) > 1 && tick.volume < 50000) regime = 'TRAP';
                    
                    // Get scan type for this token
                    const scanType = scanTypeTracker.get(tick.instrument_token) || 'UNKNOWN';
                    
                    console.log(`📡 BATCH: FULL 20-LEVEL TICK DATA: ${symbol} @ ₹${tick.last_price}`);
                    
                    // CAPTURE ORIGINAL UNTOUCHED DEPTH BEFORE ANY MODIFICATIONS
                    const originalUntouchedDepth = tick.depth ? JSON.parse(JSON.stringify(tick.depth)) : { buy: [], sell: [] };
                    
                    // Enhance to 20 levels for ALL symbols (no masking, just depth extension)
                    const fullDepth = enhanceDepthTo20Levels(tick.depth, tick.last_price, scanType, false);
                    const buyImpact = calculateMarketImpact(fullDepth, tick.last_price, 'BUY_SCAN');
                    const sellImpact = calculateMarketImpact(fullDepth, tick.last_price, 'SELL_SCAN');
                    
                    return {
                        symbol: symbol,
                        last_price: tick.last_price || 0,
                        volume: tick.volume_traded || tick.volume || 0,
                        change: change,
                        change_percent: tick.change ? ((tick.change / (tick.last_price - tick.change)) * 100).toFixed(2) : '0.00',
                        timestamp: new Date().toISOString(),
                        // Add calculated quantities at top level for easy access
                        calculated_quantity_buy: buyImpact.quantity,
                        calculated_quantity_sell: sellImpact.quantity,
                        calculated_quantity: Math.max(buyImpact.quantity, sellImpact.quantity), // Use larger quantity
                        depth: fullDepth, // 20-LEVEL ENHANCED DEPTH
                        // RAW TICK DATA - ALL original properties preserved dynamically
                        rawTick: {
                            ...tick, // Include ALL properties from original tick
                            depth: originalUntouchedDepth, // Use UNTOUCHED original depth (no level/masked properties)
                            originalDepth: originalUntouchedDepth, // Also preserve as originalDepth for clarity
                            captureTimestamp: new Date().toISOString()
                        },
                        // Market Impact Data calculated from 20-level depth
                        marketImpact: {
                            buy: {
                                levels: buyImpact.impactedLevels,
                                slippage: buyImpact.totalSlippage,
                                avgPrice: buyImpact.avgExecutionPrice,
                                quantity: buyImpact.quantity
                            },
                            sell: {
                                levels: sellImpact.impactedLevels,
                                slippage: sellImpact.totalSlippage,
                                avgPrice: sellImpact.avgExecutionPrice,
                                quantity: sellImpact.quantity
                            }
                        },
                        ohlc: tick.ohlc || {
                            open: tick.last_price,
                            high: tick.last_price,
                            low: tick.last_price,
                            close: tick.last_price
                        },
                        regime: regime,
                        scan_type: scanType
                    };
                });
                
                global.broadcastLiveData({
                    type: 'tick_batch',
                    ticks: structuredTicks
                });
            }
        }
    });

    globalTicker.on('connect', () => {
        console.log('✅ Global KiteTicker connected successfully');
    });

    globalTicker.on('error', (err) => {
        console.error('❌ Global KiteTicker error:', err);
    });

    globalTicker.on('disconnect', () => {
        console.log('🔌 Global KiteTicker disconnected');
        // Reset subscription tracking on disconnect
        currentlySubscribed.clear();
    });
}




// LOW PRICE SCANNERS ROUTE (close <= 4000)
router.post('/low-price-scanners', async (req, res) => {
    try {
        console.log('🚀 Processing LOW PRICE scanners request (close <= 4000)...');
        console.log('📄 Request Body:', req.body);
        
        // Check if scanning is allowed based on 15-minute candle timing
        const now = new Date();
        const istTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
        const hours = istTime.getHours();
        const minutes = istTime.getMinutes();
        const seconds = istTime.getSeconds();
        const currentTime = hours * 60 + minutes;
        const dayOfWeek = istTime.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Market hours: 9:15 AM to 3:30 PM, Monday to Friday
        const marketOpenTime = 9 * 60 + 15;   // 9:15 AM
        const marketCloseTime = 15 * 60 + 30;  // 3:30 PM
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isMarketOpen = !isWeekend && (currentTime >= marketOpenTime && currentTime <= marketCloseTime);
        
        // Calculate position within 15-minute candle (0-14 minutes)
        const candleMinute = minutes % 15;
        
        console.log(`🕐 Current IST time: ${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        console.log(`📊 Market status: ${isMarketOpen ? 'OPEN' : 'CLOSED'} (Weekend: ${isWeekend})`);
        console.log(`📊 15min candle minute position: ${candleMinute} (0-14 range)`);
        
        // Block scanning during last 2 minutes of candle (minutes 13-14) - Allow first minute for low price
        // BUT ONLY during market hours
        const isLastTwoMinutes = candleMinute >= 13;
        const shouldApplyCandleBlocks = isMarketOpen; // Only block during market hours
        
        if (shouldApplyCandleBlocks && isLastTwoMinutes) {
            console.log('⏸️ LOW PRICE SCAN BLOCKED: Last 2 minutes of 15min candle (minutes 13-14) - Market hours only');
            
            // Unsubscribe all tokens during blocked period
            if (globalTicker && currentlySubscribed.size > 0) {
                console.log(`📤 Unsubscribing ${currentlySubscribed.size} tokens during blocked period`);
                const tokensArray = Array.from(currentlySubscribed);
                globalTicker.unsubscribe(tokensArray);
                currentlySubscribed.clear();
                console.log('✅ All subscriptions cleared during last 2 minutes block');
                broadcastSubscriptionUpdate();
            }
            
            return res.json({
                success: false,
                message: 'Low price scanning blocked during last 2 minutes of 15-minute candle',
                reason: 'last_two_minutes_block',
                candlePosition: candleMinute,
                nextScanAllowedAt: `next candle minute 0`,
                timestamp: new Date().toISOString(),
                buyStocks: [],
                sellStocks: []
            });
        }
        
        if (!shouldApplyCandleBlocks && isLastTwoMinutes) {
            console.log('✅ SCAN ALLOWED: Last 2 minutes block bypassed - Market closed');
        }
        
        console.log(`✅ LOW PRICE SCAN ALLOWED: 15min candle minute ${candleMinute} (safe window: 0-12)`);
        
        // Set autoTrade from request body
        if (req.body.autoTrade !== undefined) {
            global.autoTrade = req.body.autoTrade;
            console.log(`🤖 Auto Trade set to: ${global.autoTrade}`);
        }
        
        // Store access token for tick-based execution
        if (req.body.access_token && req.body.access_token !== 'demo_token') {
            global.lastAccessToken = req.body.access_token;
            console.log('🔐 Access token stored for tick-based execution');
        }

        console.log(`🔍 DEBUG - Auto Trade Status: ${global.autoTrade}`);
        console.log(`🔍 DEBUG - Access Token: ${req.body.access_token ? 'PROVIDED' : 'MISSING'}`);

        const startTime = Date.now();

        // Common settings for NSE 500 stocks  
        const commonSettings = {
            "ignore_unknown_fields": false,
            "options": { "lang": "en" },
            "range": [0, 500],
            "sort": { "sortBy": "market_cap_basic", "sortOrder": "asc" },
            "symbols": { "symbolset": ["SYML:NSE;CNX500"] },
            "markets": ["india"],
            "filter2": {
                "operator": "and",
                "operands": [
                    {
                        "operation": {
                            "operator": "or",
                            "operands": [
                                {
                                    "operation": {
                                        "operator": "and",
                                        "operands": [
                                            {
                                                "expression": {
                                                    "left": "type",
                                                    "operation": "equal",
                                                    "right": "stock"
                                                }
                                            },
                                            {
                                                "expression": {
                                                    "left": "typespecs",
                                                    "operation": "has",
                                                    "right": ["common"]
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "expression": {
                            "left": "typespecs",
                            "operation": "has_none_of",
                            "right": ["pre-ipo"]
                        }
                    }
                ]
            }
        };

        // Use same columns as all-scanners route to get all technical indicators
        const commonColumns = [
            "close", "open|60", "EMA5|60", "VWAP|60", "open|15", "MACD.macd|15", 
            "MACD.signal|15", "EMA5|15", "EMA9|15", "MACD.macd|5", "MACD.signal|5", 
            "ADX|5", "MACD.macd|1", "MACD.signal|1", "ADX+DI|1", "ADX-DI|1", 
            "EMA5|5", "EMA9|5", "ADX+DI|5", "ADX-DI|5", "ADX|1", "open|5", 
            "EMA5|1", "EMA9|1", "VWAP|5", "BB.basis|1", "VWAP|1", "BB.upper|5", "BB.lower|5",
            "low|15", "high|15", "EMA3|15", "EMA3|5", "ADX|15", "ADX+DI|15", "ADX-DI|15", "EMA3|1"
        ];

        // Get ALL low-price stocks with full technical data
        const stocksPayload = {
            "columns": commonColumns,
            "filter": [
                { "left": "is_blacklisted", "operation": "equal", "right": false },
                // ONLY FILTER: close <= 4000
                { "left": "close|1", "operation": "eless", "right": 4000 },
                { "left": "average_volume_10d_calc", "operation": "greater", "right": 500000 } // Ensure some volume
            ],
            ...commonSettings
        };

        // Execute single scanner call
        const stocksResult = await makeScannorCall(stocksPayload, 'low-price-stocks-scan', req.body);

        const duration = Date.now() - startTime;
        console.log(`⚡ Low price stocks scanner completed in ${duration}ms`);

        // Extract and transform data from TradingView response
        const allStocks = stocksResult.success && stocksResult.data && stocksResult.data.data ? 
            stocksResult.data.data.map(stock => ({ 
                s: stock.s, // Symbol
                d: stock.d  // Data array
            })) : [];

        console.log(`📊 Low Price Scanner Results: ${allStocks.length} stocks (≤₹4000)`);

        // Helper function to enrich stock data with technical indicators
        const enrichStockData = (stock) => {
            const symbol = stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : null;
            const token = symbol && symbolMappings.symbolMappings[symbol] ? 
                symbolMappings.symbolMappings[symbol] : null;
            
            const data = stock.d || [];
            return {
                symbol: symbol,
                token: parseInt(token) || null,
                instrument_token: parseInt(token) || null,
                s: stock.s,  // Keep original for reference
                d: stock.d,  // Keep original data array
                
                // Technical indicators from data array (same mapping as all-scanners)  
                ltp: data[0] || 0, // close
                open60: data[1] || 0, // open|60
                ema5_60: data[2] || 0, // EMA5|60
                vwap60: data[3] || 0, // VWAP|60
                open15: data[4] || 0, // open|15
                macd15: data[5] || 0, // MACD.macd|15
                signal15: data[6] || 0, // MACD.signal|15
                ema5_15: data[7] || 0, // EMA5|15
                ema9_15: data[8] || 0, // EMA9|15
                macd5: data[9] || 0, // MACD.macd|5
                signal5: data[10] || 0, // MACD.signal|5
                adx5: data[11] || 0, // ADX|5
                macd1: data[12] || 0, // MACD.macd|1
                signal1: data[13] || 0, // MACD.signal|1
                plusDI1: data[14] || 0, // ADX+DI|1
                minusDI1: data[15] || 0, // ADX-DI|1
                ema5_5: data[16] || 0, // EMA5|5  
                ema9_5: data[17] || 0, // EMA9|5
                plusDI5: data[18] || 0, // ADX+DI|5
                minusDI5: data[19] || 0, // ADX-DI|5
                adx1: data[20] || 0, // ADX|1
                open5: data[21] || 0, // open|5
                ema5_1: data[22] || 0, // EMA5|1 - position 22 ✓
                ema9_1: data[23] || 0, // EMA9|1 - position 23 ✓
                vwap1: data[26] || 0, // VWAP|1 - position 26 ✓
                // ... more fields from columns
                ema3_15: data[31] || 0, // EMA3|15 - position 31 ✓
                ema3_5: data[32] || 0, // EMA3|5 - position 32 ✓
                adx15: data[33] || 0, // ADX|15 - position 33 ✓
                plusDI15: data[34] || 0, // ADX+DI|15 - position 34 ✓
                minusDI15: data[35] || 0, // ADX-DI|15 - position 35 ✓
                ema3_1: data[36] || 0 // EMA3|1 - position 36 ✓
            };
        };

        // Enrich all stocks with technical data
        const enrichedStocks = allStocks.map(enrichStockData);

        // DEBUG: Log sample EMA values to verify data
        // if (enrichedStocks.length > 0) {
        //     const sampleStock = enrichedStocks[0];
        //    // console.log('🔍 EMA DEBUG - Sample stock:', sampleStock.symbol);
        //    // console.log('   EMA3_1 (col 36):', sampleStock.ema3_1);
        //    // console.log('   EMA5_1 (col 22):', sampleStock.ema5_1); 
        //    // console.log('   EMA9_1 (col 23):', sampleStock.ema9_1);
        //     ///.log('   Raw data length:', sampleStock.d ? sampleStock.d.length : 'no data');
        //     if (sampleStock.d && sampleStock.d.length > 36) {
        //         console.log('   Raw values - col 22:', sampleStock.d[22], 'col 23:', sampleStock.d[23], 'col 36:', sampleStock.d[36]);
        //     }
        //     console.log('   1min EMA conditions for buy:');
        //     console.log('     EMA3_1 > EMA5_1:', sampleStock.ema3_1, '>', sampleStock.ema5_1, '=', sampleStock.ema3_1 > sampleStock.ema5_1);
        //     console.log('     EMA5_1 > EMA9_1:', sampleStock.ema5_1, '>', sampleStock.ema9_1, '=', sampleStock.ema5_1 > sampleStock.ema9_1);
        // }

        // Classify stocks into buy/sell based on conditions
        const buyStocks = [];
        const sellStocks = [];
        
        // Clear previous candidates for fresh scan
        buyCandidates.clear();
        sellCandidates.clear();
        processedOrders.clear();
        lastScannerUpdate = Date.now();
        console.log('🔄 Cleared previous tick execution candidates for fresh scan');
        
        // DEBUG: Track condition pass counts
        let conditionStats = {
            total_stocks: 0,
            buy_condition_passes: Array(11).fill(0),
            sell_condition_passes: Array(11).fill(0),
            ema_1min_issues: []
        };

        enrichedStocks.forEach(stock => {
            conditionStats.total_stocks++;
            
            // BUY CONDITIONS:
            // Multi-timeframe conditions:
            // 1. EMA5 (5min) < EMA3 (15min)
            // 2. Open < EMA3 (15min) 
            // 3. +DI > ADX (on 15min OR 5min) - either timeframe
            // 4. ADX > -DI (on 5min) - NEW ADX CONDITION
            // 5. ADX > -DI (on 15min) - NEW ADX CONDITION
            // 6. MACD > Signal (5min)
            // 7. MACD > 0 (5min)
            // 8. MACD > 0 (1min) 
            // 9. EMA9 > VWAP (1min)
            // 10. EMA3 > EMA5 (1min)
            // 11. LTP < EMA3(15min) AND LTP < EMA5(5min)
            
            const buyConditions = [
                stock.ema5_5 < stock.ema3_15, // EMA5 (5min) < EMA3 (15min)
                stock.open15 < stock.ema3_15,  // Open < EMA3 on 15min
                (stock.plusDI15 > stock.adx15) || (stock.plusDI5 > stock.adx5), // +DI > ADX on 15min OR 5min
                stock.adx5 > stock.minusDI5, // ADX > -DI on 5min (NEW)
                stock.adx15 > stock.minusDI15, // ADX > -DI on 15min (NEW)
                stock.macd5 > stock.signal5, // MACD > Signal on 5min
                stock.macd5 > 0, // MACD > 0 on 5min
                stock.macd1 > 0, // MACD > 0 on 1min
                stock.ema9_1 > stock.vwap1, // EMA9 > VWAP on 1min
                stock.ema3_1 > stock.ema5_1, // EMA3 > EMA5 on 1min
                (stock.ltp < stock.ema3_15 && stock.ltp < stock.ema5_5) // LTP < EMA3(15min) AND LTP < EMA5(5min)
            ];

            // Track condition pass counts
            buyConditions.forEach((pass, i) => {
                if (pass) conditionStats.buy_condition_passes[i]++;
            });
            
            // DEBUG: Track individual condition passes for EMA 1min conditions
            const ema3_ema5_1min_pass = stock.ema3_1 > stock.ema5_1;
            const ema5_ema9_1min_pass = stock.ema5_1 > stock.ema9_1;
            
            if (!ema3_ema5_1min_pass || !ema5_ema9_1min_pass) {
                conditionStats.ema_1min_issues.push({
                    symbol: stock.symbol,
                    ema3_1: stock.ema3_1,
                    ema5_1: stock.ema5_1, 
                    ema9_1: stock.ema9_1,
                    ema3_gt_ema5: ema3_ema5_1min_pass,
                    ema5_gt_ema9: ema5_ema9_1min_pass
                });
            }
            
            // SELL CONDITIONS (opposite of buy):
            // Multi-timeframe conditions:
            // 1. EMA5 (5min) > EMA3 (15min)
            // 2. Open > EMA3 (15min)
            // 3. -DI > ADX (on 15min OR 5min) - either timeframe
            // 4. ADX > +DI (on 5min) - NEW ADX CONDITION  
            // 5. ADX > +DI (on 15min) - NEW ADX CONDITION
            // 6. MACD < Signal (5min)
            // 7. MACD < 0 (5min)
            // 8. MACD < 0 (1min)
            // 9. EMA9 < VWAP (1min)
            // 10. EMA3 < EMA5 (1min)
            // 11. LTP > EMA3(15min) AND LTP > EMA5(5min)
            
            const sellConditions = [
                stock.ema5_5 > stock.ema3_15, // EMA5 (5min) > EMA3 (15min)
                stock.open15 > stock.ema3_15, // Open > EMA3 on 15min
                (stock.minusDI15 > stock.adx15) || (stock.minusDI5 > stock.adx5), // -DI > ADX on 15min OR 5min
                stock.adx5 > stock.plusDI5, // ADX > +DI on 5min (NEW)
                stock.adx15 > stock.plusDI15, // ADX > +DI on 15min (NEW)
                stock.macd5 < stock.signal5, // MACD < Signal on 5min
                stock.macd5 < 0, // MACD < 0 on 5min
                stock.macd1 < 0, // MACD < 0 on 1min
                stock.ema9_1 < stock.vwap1, // EMA9 < VWAP on 1min
                stock.ema3_1 < stock.ema5_1, // EMA3 < EMA5 on 1min
                (stock.ltp > stock.ema3_15 && stock.ltp > stock.ema5_5) // LTP > EMA3(15min) AND LTP > EMA5(5min)
            ];
            
            
            const isBuySignal = buyConditions.every(condition => condition);
            const isSellSignal = sellConditions.every(condition => condition);
            
            if (isBuySignal) {
                buyStocks.push(stock);
                // Store buy candidate for tick-based EMA5 verification
                if (stock.token && stock.ema5_5) {
                    buyCandidates.set(stock.token, {
                        symbol: stock.symbol,
                        ema5_5: stock.ema5_5, // EMA5 on 5min timeframe
                        ema3_15: stock.ema3_15, // EMA3 on 15min timeframe
                        ltp: stock.ltp,
                        technicalData: stock
                    });
                    console.log(`📈 Stored BUY candidate: ${stock.symbol} (EMA5_5min: ${stock.ema5_5})`);
                }
            } else if (isSellSignal) {
                sellStocks.push(stock);
                // Store sell candidate for tick-based EMA5 verification
                if (stock.token && stock.ema5_5) {
                    sellCandidates.set(stock.token, {
                        symbol: stock.symbol,
                        ema5_5: stock.ema5_5, // EMA5 on 5min timeframe
                        ema3_15: stock.ema3_15, // EMA3 on 15min timeframe
                        ltp: stock.ltp,
                        technicalData: stock
                    });
                    console.log(`📉 Stored SELL candidate: ${stock.symbol} (EMA5_5min: ${stock.ema5_5})`);
                }
            }
            // If neither buy nor sell conditions are met, stock is ignored
        });

        // console.log(`📊 Low Price Classification Results:`);
        // console.log(`   Total stocks: ${enrichedStocks.length}`);
        // console.log(`   Buy signals: ${buyStocks.length}`);
        // console.log(`   Sell signals: ${sellStocks.length}`);
        // console.log(`🎯 TICK EXECUTION SETUP:`);
        // console.log(`   Buy candidates stored: ${buyCandidates.size}`);
        // console.log(`   Sell candidates stored: ${sellCandidates.size}`);
        // console.log(`   Auto trade enabled: ${global.autoTrade}`);
        // console.log(`   Access token available: ${global.lastAccessToken ? 'YES' : 'NO'}`);
        // console.log(`   Last scanner update: ${new Date(lastScannerUpdate).toISOString()}`);
        // // 
        // DEBUG: Print condition statistics
        console.log('🔍 CONDITION ANALYSIS:');
        const conditionLabels = [
            'EMA5 (5min) < EMA3 (15min)', 'Open < EMA3 (15min)', '+DI > ADX (15/5min)', 'ADX > -DI (5min)',
            'ADX > 25 (1min)', 'MACD > Signal (5min)', 'MACD > Signal (1min)', 
            'MACD > 0 (5min)', 'MACD > 0 (1min)', 'EMA9 > VWAP (1min)', 'EMA3 > EMA5 (1min)',
            'LTP < EMA3(15min) AND LTP < EMA5(5min)'
        ];
        conditionStats.buy_condition_passes.forEach((count, i) => {
            const percentage = conditionStats.total_stocks > 0 ? (count / conditionStats.total_stocks * 100).toFixed(1) : 0;
           // console.log(`   ${i + 1}. ${conditionLabels[i]}: ${count}/${conditionStats.total_stocks} (${percentage}%)`);
        });
        
        // Show sample EMA 1min issues
        if (conditionStats.ema_1min_issues.length > 0) {
           // console.log(`🚨 EMA 1min issues found in ${conditionStats.ema_1min_issues.length} stocks:`);
           // console.log('   Sample issues:', conditionStats.ema_1min_issues.slice(0, 3));
        }

       // console.log('ℹ️ SCAN COMPLETE: Orders will be placed via tick-based execution with market impact analysis');
      //  console.log(`🎯 Next: Stocks will be subscribed → Market Impact Analysis → Tick-based Order Execution`);

        // AUTO-SUBSCRIBE TO LOW-PRICE SCANNER RESULTS
       // console.log('🔄 Starting auto-subscription for low-price stocks...');
        // Store buy/sell stocks globally for API access
        currentBuyStocks = buyStocks;
        currentSellStocks = sellStocks;
        lastScanTimestamp = new Date().toISOString();
        
        autoSubscribeToResults(buyStocks, sellStocks, req.body.access_token).then(() => {
           // console.log('✅ Auto-subscription completed for low-price stocks');
        }).catch(error => {
            console.error('❌ Error in low-price auto-subscription:', error);
        });

        // Return comprehensive response
        const consolidatedResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            duration: duration,
            scanType: 'low-price-stocks', 
            priceFilter: '≤₹4000',
            totalStocks: enrichedStocks.length,
            allStocks: enrichedStocks, // ALL low-price stocks with technical data for frontend filtering
            buyStocks: buyStocks,
            sellStocks: sellStocks,
            message: `Found ${buyStocks.length} buy and ${sellStocks.length} sell signals from ${enrichedStocks.length} low-price stocks. Orders will be placed via tick-based execution with market impact analysis.`,
            // Tick execution status
            tickExecution: {
                enabled: global.autoTrade,
                buyCandidatesStored: buyCandidates.size,
                sellCandidatesStored: sellCandidates.size,
                accessTokenAvailable: !!global.lastAccessToken,
                message: `Tick-based execution ready: ${buyCandidates.size} buy + ${sellCandidates.size} sell candidates awaiting market impact analysis and EMA5 triggers`
            },
            statistics: {
                totalCount: enrichedStocks.length,
                buyCount: buyStocks.length,
                sellCount: sellStocks.length,
                executionTime: duration
            }
        };

        // NO WebSocket broadcasting - keep low-price stocks separate from main table

        res.json(consolidatedResponse);

    } catch (error) {
        console.error('❌ Error in low price scanners route:', error);
        
        // Clear global storage on error
        currentBuyStocks = [];
        currentSellStocks = [];
        lastScanTimestamp = new Date().toISOString();
        
        res.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            buyStocks: [],
            sellStocks: []
        });
    }
});

// Manual RELIANCE subscription endpoint for debugging
router.post('/subscribe-reliance', async (req, res) => {
    try {
        console.log('🛠️ Manual RELIANCE subscription triggered');
        const token = req.body.access_token || req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Access token required'
            });
        }
        
        // RELIANCE will only be subscribed if found in scan results
        // await initializeRelianceSubscription(token);
        
        res.json({
            success: true,
            message: 'Subscription check completed - stocks only subscribed via scan results',
            subscribed_count: currentlySubscribed.size,
            subscribed_tokens: Array.from(currentlySubscribed),
            note: 'No permanent subscriptions - all stocks subscribed based on scan results only'
        });
        
    } catch (error) {
        console.error('❌ Manual RELIANCE subscription error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get current subscription status endpoint
router.get('/subscription-status', (req, res) => {
    try {
        const subscribedTokens = Array.from(currentlySubscribed);
        const subscribedSymbols = subscribedTokens.map(token => {
            const symbol = getSymbolFromToken(token);
            return `NSE:${symbol}`; // Add NSE: prefix to match frontend format
        });
        
        res.json({
            success: true,
            subscribed_count: currentlySubscribed.size,
            subscribed_tokens: subscribedTokens,
            subscribed_symbols: subscribedSymbols,
            ticker_connected: globalTicker !== null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error getting subscription status:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            subscribed_count: 0
        });
    }
});

// Get current buy stocks from latest scan
router.get('/buy-stocks', (req, res) => {
    try {
        res.json({
            success: true,
            stocks: currentBuyStocks,
            count: currentBuyStocks.length,
            lastScan: lastScanTimestamp,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error getting buy stocks:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stocks: []
        });
    }
});

// Get current sell stocks from latest scan
router.get('/sell-stocks', (req, res) => {
    try {
        res.json({
            success: true,
            stocks: currentSellStocks,
            count: currentSellStocks.length,
            lastScan: lastScanTimestamp,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error getting sell stocks:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stocks: []
        });
    }
});

// Enable/Disable Auto-Trade endpoint - Controls ticker-based execution
router.post('/enable-auto-trade', async (req, res) => {
    try {
        const { enabled, accessToken } = req.body;
        
        if (enabled) {
            // Enable auto-trade mode
            global.autoTrade = true;
            global.lastAccessToken = accessToken;
            
            console.log('✅ AUTO-TRADE ENABLED: Ticker will handle all order execution');
            console.log('🎯 Market Impact Criteria: Levels ≤ 3, Slippage ≤ 0.08%');
            
            res.json({
                success: true,
                message: 'Auto-trade enabled successfully',
                autoTradeEnabled: true,
                executionMode: 'TICKER_BASED',
                criteria: {
                    maxLevels: 3,
                    maxSlippage: 0.08,
                    orderAmount: 490000
                },
                timestamp: new Date().toISOString()
            });
        } else {
            // Disable auto-trade mode
            global.autoTrade = false;
            
            console.log('❌ AUTO-TRADE DISABLED: No automatic order execution');
            
            res.json({
                success: true,
                message: 'Auto-trade disabled successfully',
                autoTradeEnabled: false,
                executionMode: 'MANUAL',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('❌ Error setting auto-trade mode:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// BUY ORDER ROUTE - Enhanced with funds, leverage, quantity calculation, and position checking
// ⚠️ MARKET IMPACT ENFORCEMENT: Only allows orders that have passed market impact analysis
// 🚫 DISABLED: Direct order access disabled - only tick-based execution with market impact allowed
/*
router.post('/buy-order', async (req, res) => {
    
    // 🚫 BLOCK DIRECT ACCESS: Only allow tick-based execution with market impact verification
    const isMarketImpactVerified = req.headers['x-market-impact-verified'] === 'true';
    
    if (!isMarketImpactVerified) {
        return res.status(403).json({
            success: false,
            error: 'Direct order placement blocked. Orders must go through tick-based execution with market impact analysis.',
            message: 'Use the scanner system with auto-trade enabled for market impact verified orders.',
            requiredFlow: 'SCAN → SUBSCRIBE → TICK DATA → MARKET IMPACT → ORDER',
            marketImpactCriteria: {
                maxLevels: 3,
                maxSlippage: '0.08%',
                orderAmount: '₹490,000'
            },
            receivedHeaders: {
                'x-market-impact-verified': req.headers['x-market-impact-verified'] || 'undefined',
                'x-test-order': req.headers['x-test-order'] || 'undefined'
            },
            timestamp: new Date().toISOString()
        });
    }
    
    // Detect if this is a test order
    const isTestOrder = req.headers['x-test-order'] === 'true';
    
    // Variables that need to be accessible in catch block
    let finalQuantity = 'Calc Error';
    let pricePerShare = 'N/A';
    
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        console.log('🔑 Auth token present:', headerToken ? 'YES' : 'NO');
        
        let access_token = headerToken;
        if (!access_token && req.body.access_token) {
            access_token = req.body.access_token;
        }
        
        // ONLY accept full orderParams structure
        const { orderParams, ltp, ema5 } = req.body;
        
        if (!orderParams || !orderParams.tradingsymbol) {
            return res.status(400).json({
                success: false,
                error: 'Complete orderParams structure is required'
            });
        }
        
        // Validate required orderParams fields (excluding quantity which can be calculated)
        const requiredFields = ['exchange', 'tradingsymbol', 'transaction_type', 'price', 'product', 'order_type', 'validity'];
        const missingFields = requiredFields.filter(field => !orderParams[field] && orderParams[field] !== 0);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required orderParams fields: ${missingFields.join(', ')}`,
                orderParams: orderParams
            });
        }
        
        // Validate price is a valid number
        if (isNaN(orderParams.price) || orderParams.price <= 0) {
            return res.status(400).json({
                success: false,
                error: `Invalid price: ${orderParams.price} (must be a positive number)`,
                orderParams: orderParams
            });
        }
        
        // Validate quantity only if provided (it's now optional)
        if (orderParams.quantity !== undefined && (!Number.isInteger(orderParams.quantity) || orderParams.quantity <= 0)) {
            return res.status(400).json({
                success: false,
                error: `Invalid quantity: ${orderParams.quantity} (must be a positive integer)`,
                orderParams: orderParams
            });
        }
        
        if (!access_token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        // Initialize KiteConnect
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(access_token);
        
        // STEP 1: Get funds and check available balance
        console.log('💰 STEP 1: Checking available funds...');
        const margins = await kite.getMargins();
        
        let availableFunds = 0;
        if (margins.equity && margins.equity.available) {
            availableFunds = margins.equity.available.live_balance || 0;
        } else if (margins.equity && margins.equity.net) {
            availableFunds = margins.equity.net || 0;
        } else if (margins.net) {
            availableFunds = margins.net || 0;
        }
        
        console.log(`💰 Available funds: ₹${availableFunds.toLocaleString('en-IN')}`);
        
        if (availableFunds <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient funds available',
                availableFunds: availableFunds
            });
        }
        
        // STEP 2: Calculate leveraged funds (5x for MIS)
        const leverageFunds = availableFunds * 5;
        const usableFunds = leverageFunds * 0.95; // Use 95% of leveraged funds for safety
        console.log(`⚡ Leveraged funds (5x): ₹${leverageFunds.toLocaleString('en-IN')}`);
        console.log(`🔒 Usable funds (95%): ₹${usableFunds.toLocaleString('en-IN')}`);
        
        // STEP 2.5: Check minimum leveraged amount requirement (₹400,000)
        const minLeveragedAmount = 400000;
        if (leverageFunds < minLeveragedAmount) {
            return res.status(400).json({
                success: false,
                error: `Insufficient leveraged funds. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${leverageFunds.toLocaleString('en-IN')}`,
                availableFunds: availableFunds,
                leverageFunds: leverageFunds,
                minRequired: minLeveragedAmount,
                order_category: 'BUY',
                symbol: orderParams.tradingsymbol
            });
        }
        console.log(`✅ Leveraged Amount Check: ₹${leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        
        // STEP 3: Calculate optimal quantity based on available funds
        pricePerShare = ltp || orderParams.price; // Assign to existing let variable
        const maxQuantity = Math.floor(usableFunds / pricePerShare);
        
        // Use either requested quantity or calculated max quantity (whichever is smaller)
        // If no quantity provided, use calculated max quantity
        const requestedQuantity = orderParams.quantity || maxQuantity;
        finalQuantity = Math.min(requestedQuantity, maxQuantity); // Assign to existing let variable
        
        console.log(`\n📊 BUY ORDER QUANTITY CALCULATION:`);
        console.log(`💰 Available Funds: ₹${availableFunds.toLocaleString('en-IN')}`);
        console.log(`⚡ Leveraged Funds (5x): ₹${leverageFunds.toLocaleString('en-IN')}`);
        console.log(`� Usable Funds (95%): ₹${usableFunds.toLocaleString('en-IN')}`);
        console.log(`💵 Price per share: ₹${pricePerShare}`);
        console.log(`🔢 Max possible quantity: ${maxQuantity}`);
        console.log(`📋 Requested quantity: ${orderParams.quantity || 'auto-calculated'}`);
        console.log(`🎯 Final quantity: ${finalQuantity}`);
        console.log(`💸 Total investment: ₹${(finalQuantity * pricePerShare).toLocaleString('en-IN')}`);;
        
        if (finalQuantity <= 0) {
            return res.status(400).json({
                success: false,
                error: `Insufficient funds for even 1 share. Need ₹${pricePerShare}, have ₹${usableFunds}`,
                availableFunds: availableFunds,
                leverageFunds: leverageFunds,
                usableFunds: usableFunds,
                pricePerShare: pricePerShare
            });
        }
        
        // STEP 4: Check existing positions - Block if ANY active positions exist
        console.log('📋 STEP 4: Checking for ANY existing active positions...');
        const positions = await kite.getPositions();
        const allActivePositions = positions.net?.filter(pos => pos.quantity !== 0) || [];
        
        console.log(`📋 Found ${allActivePositions.length} total active positions across all symbols`);
        
        if (allActivePositions.length > 0) {
            console.log('⚠️ Active positions exist, blocking all order placement');
            console.log('📊 Active positions:', allActivePositions.map(pos => ({
                symbol: pos.tradingsymbol,
                quantity: pos.quantity,
                average_price: pos.average_price,
                pnl: pos.pnl
            })));
            
            return res.status(400).json({
                success: false,
                error: `Cannot place order - ${allActivePositions.length} active position(s) found. Close all positions before placing new orders.`,
                activePositions: allActivePositions.map(pos => ({
                    symbol: pos.tradingsymbol,
                    quantity: pos.quantity,
                    average_price: pos.average_price,
                    pnl: pos.pnl
                })),
                order_category: 'BUY',
                symbol: orderParams.tradingsymbol
            });
        }
        
        // STEP 5: Force MIS product type and apply tick size rounding
        const forcedProductType = 'MIS';
        console.log(`🕐 Forcing product type: ${forcedProductType}`);
        
        const roundedPrice = roundToTickSize(orderParams.price, ltp);
        
        // Final orderParams with all enhancements
        const finalOrderParams = {
            ...orderParams,
            price: roundedPrice,
            product: forcedProductType,
            quantity: finalQuantity  // Use calculated quantity
        };
        
        console.log('🚀 STEP 5: Placing enhanced BUY order:', finalOrderParams);
        const result = await kite.placeOrder('regular', finalOrderParams);
        
        if (result && result.order_id) {
            // 🚀 AUTO KITE CHART: Broadcast Kite chart opening for successful BUY order
            if (global.broadcastLiveData) {
                global.broadcastLiveData({
                    type: 'order_charts',
                    charts: [{
                        symbol: orderParams.tradingsymbol,
                        orderType: 'BUY',
                        orderId: result.order_id,
                        chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${orderParams.tradingsymbol}`,
                        message: `Kite chart opened for successful BUY order: ${orderParams.tradingsymbol}`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            // Return comprehensive response
            res.json({
                success: true,
                order_id: result.order_id,
                message: `Enhanced buy order placed for ${orderParams.tradingsymbol}`,
                symbol: orderParams.tradingsymbol,
                quantity: finalOrderParams.quantity,
                price: roundedPrice,
                leveraged_amount: finalOrderParams.quantity * roundedPrice,
                order_type: finalOrderParams.order_type,
                order_category: 'BUY',
                ltp: ltp,
                ema5: ema5,
                funds: {
                    available: availableFunds,
                    leveraged: leverageFunds,
                    used: finalOrderParams.quantity * roundedPrice,
                    remaining: leverageFunds - (finalOrderParams.quantity * roundedPrice)
                },
                calculatedData: {
                    originalPrice: orderParams.price,
                    tickSizeAdjustment: roundedPrice - orderParams.price,
                    originalQuantity: orderParams.quantity,
                    optimizedQuantity: finalQuantity,
                    maxPossibleQuantity: maxQuantity
                },
                orderParams: finalOrderParams,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Order placement failed');
        }
    } catch (error) {
        console.error('❌ Error placing enhanced buy order:', error);
        
        // Use already calculated quantity from above
        const errorResponse = {
            success: false,
            error: error.message,
            order_category: 'BUY',
            symbol: req.body.orderParams?.tradingsymbol || 'Unknown',
            quantity: finalQuantity, // Use pre-calculated quantity
            price: pricePerShare, // Use calculated price
            timestamp: new Date().toISOString()
        };
        
        // Add additional debug info if available
        if (req.body.orderParams) {
            errorResponse.orderParams = req.body.orderParams;
            if (req.body.ltp) errorResponse.ltp = req.body.ltp;
            if (req.body.ema5) errorResponse.ema5 = req.body.ema5;
        }
        
        res.status(500).json(errorResponse);
    }
});
*/

// SELL ORDER ROUTE - Enhanced with funds, leverage, quantity calculation, and position checking
// ⚠️ MARKET IMPACT ENFORCEMENT: Only allows orders that have passed market impact analysis  
// 🚫 COMMENTED OUT: Direct order access disabled - only tick-based execution with market impact allowed
/*
router.post('/sell-order', async (req, res) => {
    console.log('🔴 ENHANCED SELL-ORDER route hit with body:', req.body);
    
    // 🚫 BLOCK DIRECT ACCESS: Only allow tick-based execution with market impact verification
    const isMarketImpactVerified = req.headers['x-market-impact-verified'] === 'true';
    if (!isMarketImpactVerified) {
        return res.status(403).json({
            success: false,
            error: 'Direct order placement blocked. Orders must go through tick-based execution with market impact analysis.',
            message: 'Use the scanner system with auto-trade enabled for market impact verified orders.',
            requiredFlow: 'SCAN → SUBSCRIBE → TICK DATA → MARKET IMPACT → ORDER',
            marketImpactCriteria: {
                maxLevels: 3,
                maxSlippage: '0.08%',
                orderAmount: '₹490,000'
            },
            timestamp: new Date().toISOString()
        });
    }
    
    console.log('✅ MARKET IMPACT VERIFIED: Proceeding with short sell order placement...');
    
    // Detect if this is a test order
    const isTestOrder = req.headers['x-test-order'] === 'true';
    if (isTestOrder) {
        console.log('🧪 TEST ORDER DETECTED: This order bypassed market impact for testing purposes');
    } else {
        console.log('📊 REAL MARKET IMPACT ORDER: This order passed market impact analysis (levels ≤ 3, slippage ≤ 0.08%)');
    }
    
    // Variables that need to be accessible in catch block
    let finalQuantity = 'Calc Error';
    let pricePerShare = 'N/A';
    
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        console.log('🔑 Auth token present:', headerToken ? 'YES' : 'NO');
        
        let access_token = headerToken;
        if (!access_token && req.body.access_token) {
            access_token = req.body.access_token;
        }
        
        // ONLY accept full orderParams structure
        const { orderParams, ltp, ema5 } = req.body;
        
        if (!orderParams || !orderParams.tradingsymbol) {
            return res.status(400).json({
                success: false,
                error: 'Complete orderParams structure is required'
            });
        }
        
        // Validate required orderParams fields (excluding quantity which can be calculated)
        const requiredFields = ['exchange', 'tradingsymbol', 'transaction_type', 'price', 'product', 'order_type', 'validity'];
        const missingFields = requiredFields.filter(field => !orderParams[field] && orderParams[field] !== 0);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required orderParams fields: ${missingFields.join(', ')}`,
                orderParams: orderParams
            });
        }
        
        // Validate price is a valid number
        if (isNaN(orderParams.price) || orderParams.price <= 0) {
            return res.status(400).json({
                success: false,
                error: `Invalid price: ${orderParams.price} (must be a positive number)`,
                orderParams: orderParams
            });
        }
        
        // Validate quantity only if provided (it's now optional)
        if (orderParams.quantity !== undefined && (!Number.isInteger(orderParams.quantity) || orderParams.quantity <= 0)) {
            return res.status(400).json({
                success: false,
                error: `Invalid quantity: ${orderParams.quantity} (must be a positive integer)`,
                orderParams: orderParams
            });
        }
        
        if (!access_token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        // Initialize KiteConnect
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(access_token);
        
        // STEP 1: Get funds and check available balance (for MIS short selling)
        console.log('💰 STEP 1: Checking available funds for MIS sell (short) order...');
        const margins = await kite.getMargins();
        
        let availableFunds = 0;
        if (margins.equity && margins.equity.available) {
            availableFunds = margins.equity.available.live_balance || 0;
        } else if (margins.equity && margins.equity.net) {
            availableFunds = margins.equity.net || 0;
        } else if (margins.net) {
            availableFunds = margins.net || 0;
        }
        
        console.log(`💰 Available funds: ₹${availableFunds.toLocaleString('en-IN')}`);
        
        if (availableFunds <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient funds available for short selling',
                availableFunds: availableFunds
            });
        }
        
        // STEP 2: Calculate leveraged funds (5x for MIS)
        const leverageFunds = availableFunds * 5;
        const usableFunds = leverageFunds * 0.95; // Use 95% of leveraged funds for safety
        console.log(`⚡ Leveraged funds (5x): ₹${leverageFunds.toLocaleString('en-IN')}`);
        console.log(`🔒 Usable funds (95%): ₹${usableFunds.toLocaleString('en-IN')}`);
        
        // STEP 2.5: Check minimum leveraged amount requirement (₹400,000)
        const minLeveragedAmount = 400000;
        if (leverageFunds < minLeveragedAmount) {
            return res.status(400).json({
                success: false,
                error: `Insufficient leveraged funds for short selling. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${leverageFunds.toLocaleString('en-IN')}`,
                availableFunds: availableFunds,
                leverageFunds: leverageFunds,
                minRequired: minLeveragedAmount,
                order_category: 'SELL',
                symbol: orderParams.tradingsymbol
            });
        }
        console.log(`✅ Leveraged Amount Check: ₹${leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        
        // STEP 3: Calculate optimal quantity based on available funds (for short selling margin)
        pricePerShare = ltp || orderParams.price; // Assign to existing let variable
        const maxQuantity = Math.floor(usableFunds / pricePerShare);
        
        // Use either requested quantity or calculated max quantity (whichever is smaller)
        // If no quantity provided, use calculated max quantity
        const requestedQuantity = orderParams.quantity || maxQuantity;
        finalQuantity = Math.min(requestedQuantity, maxQuantity); // Assign to existing let variable
        
        console.log(`\n📊 SELL ORDER QUANTITY CALCULATION:`);
        console.log(`💰 Available Funds: ₹${availableFunds.toLocaleString('en-IN')}`);
        console.log(`⚡ Leveraged Funds (5x): ₹${leverageFunds.toLocaleString('en-IN')}`);
        console.log(`� Usable Funds (95%): ₹${usableFunds.toLocaleString('en-IN')}`);
        console.log(`�💵 Price per share: ₹${pricePerShare}`);
        console.log(`🔢 Max possible quantity: ${maxQuantity}`);
        console.log(`📋 Requested quantity: ${orderParams.quantity || 'auto-calculated'}`);
        console.log(`🎯 Final quantity: ${finalQuantity}`);
        console.log(`💸 Total investment: ₹${(finalQuantity * pricePerShare).toLocaleString('en-IN')}`);
        
        if (finalQuantity <= 0) {
            return res.status(400).json({
                success: false,
                error: `Insufficient funds for even 1 share short sell. Need ₹${pricePerShare}, have ₹${usableFunds}`,
                availableFunds: availableFunds,
                leverageFunds: leverageFunds,
                usableFunds: usableFunds,
                pricePerShare: pricePerShare
            });
        }
        
        // STEP 4: Check existing positions to avoid over-shorting (optional check)
        console.log('� STEP 4: Checking existing positions for reference...');
        const positions = await kite.getPositions();
        const allActivePositions = positions.net?.filter(pos => pos.quantity !== 0) || [];
        
        console.log(`📋 Found ${allActivePositions.length} total active positions across all symbols`);
        
        if (allActivePositions.length > 0) {
            console.log('⚠️ Active positions exist, blocking all order placement');
            console.log('📊 Active positions:', allActivePositions.map(pos => ({
                symbol: pos.tradingsymbol,
                quantity: pos.quantity,
                average_price: pos.average_price,
                pnl: pos.pnl
            })));
            
            return res.status(400).json({
                success: false,
                error: `Cannot place order - ${allActivePositions.length} active position(s) found. Close all positions before placing new orders.`,
                activePositions: allActivePositions.map(pos => ({
                    symbol: pos.tradingsymbol,
                    quantity: pos.quantity,
                    average_price: pos.average_price,
                    pnl: pos.pnl
                })),
                order_category: 'SELL',
                symbol: orderParams.tradingsymbol
            });
        }
        
        // STEP 5: Force MIS product type and apply tick size rounding
        const forcedProductType = 'MIS';
        console.log(`🕐 Forcing product type: ${forcedProductType}`);
        
        const roundedPrice = roundToTickSize(orderParams.price, ltp);
        
        // Final orderParams with all enhancements
        const finalOrderParams = {
            ...orderParams,
            price: roundedPrice,
            product: forcedProductType,
            quantity: finalQuantity  // Use calculated quantity
        };
        
        console.log('🚀 STEP 5: Placing enhanced MIS SELL (short) order:', finalOrderParams);
        const result = await kite.placeOrder('regular', finalOrderParams);
        
        if (result && result.order_id) {
            // Calculate expected margin requirement for short sale
            const marginRequired = finalQuantity * roundedPrice;
            
            // 🚀 AUTO KITE CHART: Broadcast Kite chart opening for successful SELL order
            if (global.broadcastLiveData) {
                global.broadcastLiveData({
                    type: 'order_charts',
                    charts: [{
                        symbol: orderParams.tradingsymbol,
                        orderType: 'SELL',
                        orderId: result.order_id,
                        chartUrl: `https://kite.zerodha.com/chart/ext/tvc/NSE/${orderParams.tradingsymbol}`,
                        message: `Kite chart opened for successful SELL order: ${orderParams.tradingsymbol}`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            // Return comprehensive response
            res.json({
                success: true,
                order_id: result.order_id,
                message: `Enhanced MIS sell (short) order placed for ${orderParams.tradingsymbol}`,
                symbol: orderParams.tradingsymbol,
                quantity: finalOrderParams.quantity,
                price: roundedPrice,
                leveraged_amount: finalOrderParams.quantity * roundedPrice,
                order_type: finalOrderParams.order_type,
                order_category: 'SELL',
                ltp: ltp,
                ema5: ema5,
                positionData: {
                    orderType: 'MIS_SHORT_SELLING',
                    marginRequired: marginRequired,
                    existingPositions: existingPositions.map(pos => ({
                        quantity: pos.quantity,
                        average_price: pos.average_price,
                        pnl: pos.pnl
                    }))
                },
                funds: {
                    available: availableFunds,
                    leveraged: leverageFunds,
                    marginUsed: marginRequired,
                    remaining: leverageFunds - marginRequired
                },
                calculatedData: {
                    originalPrice: orderParams.price,
                    tickSizeAdjustment: roundedPrice - orderParams.price,
                    originalQuantity: orderParams.quantity,
                    optimizedQuantity: finalQuantity,
                    maxPossibleQuantity: maxQuantity
                },
                orderParams: finalOrderParams,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Order placement failed');
        }
    } catch (error) {
        console.error('🚨 SELL ORDER ERROR:', error);

        const errorResponse = {
            success: false,
            error: error.message || 'Unknown error occurred',
            quantity: finalQuantity,
            pricePerShare: pricePerShare,
            order_category: 'SELL',
            symbol: req.body.orderParams?.tradingsymbol || 'Unknown',
            timestamp: new Date().toISOString()
        };

        // Add debug info
        if (req.body.orderParams) {
            errorResponse.orderParams = req.body.orderParams;
            if (req.body.ltp) errorResponse.ltp = req.body.ltp;
            if (req.body.ema5) errorResponse.ema5 = req.body.ema5;
        }

        res.status(500).json(errorResponse);
    }
});
*/

// Get positions route - same as webhook server
router.get('/positions', async (req, res) => {
    try {
        console.log('📊 === POSITIONS API ===');
        
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        let access_token = headerToken;
        if (!access_token && req.body.access_token) {
            access_token = req.body.access_token;
        }
        
        if (!access_token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required',
                positions: []
            });
        }
        
        // Get positions using same logic as webhook server
        const activePositions = await getActivePositions(access_token);
        
        res.json({
            success: true,
            positions: activePositions,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Positions API error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            positions: []
        });
    }
});

// Get all NSE500 stocks
router.get('/all-nse500-stocks', async (req, res) => {
    try {
        console.log('📊 NSE500 stocks route called');
        
        const nse500Stocks = Object.keys(symbolMappings.symbolMappings).map(symbol => ({
            symbol: symbol,
            instrumentToken: symbolMappings.symbolMappings[symbol],
            exchange: 'NSE'
        }));
        
        res.json({
            success: true,
            totalCount: nse500Stocks.length,
            stocks: nse500Stocks,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error getting NSE500 stocks:', error);
        res.json({
            success: false,
            error: error.message,
            stocks: []
        });
    }
});

// TEST RELIANCE BUY ORDER ROUTE - Uses existing buy-order logic
router.post('/test-reliance-buy', async (req, res) => {
    console.log('🧪 TEST RELIANCE BUY ORDER route hit');
    
    try {
        // Extract access token from request
        const authHeader = req.headers.authorization;
        const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        let access_token = headerToken || req.body.access_token;
        
        if (!access_token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required for test order'
            });
        }

        // Get current RELIANCE price from KiteTicker or use fallback
        console.log('📊 Getting RELIANCE current price...');
        
        // Try to get LTP from Kite API
        const KiteConnect = require('kiteconnect').KiteConnect;
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(access_token);
        
        const relianceToken = 738561;
        const quotes = await kite.getQuote(['NSE:RELIANCE']);
        const relianceQuote = quotes['NSE:RELIANCE'];
        const currentPrice = relianceQuote?.last_price || 2500; // Fallback price
        
        console.log(`💰 RELIANCE Current Price: ₹${currentPrice}`);
        
        // Create orderParams for RELIANCE buy order (let buy-order route calculate quantity)
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: 'RELIANCE',
            transaction_type: 'BUY',
            price: currentPrice,
            product: 'MIS', // Will be enforced in buy-order route
            order_type: 'MARKET',
            validity: 'DAY'
            // Quantity intentionally omitted - buy-order route will calculate based on available funds
        };

        console.log('🧪 Test order params:', orderParams);
        
        // Call the existing buy-order route internally
        const buyOrderRequest = {
            body: {
                orderParams: orderParams,
                ltp: currentPrice,
                access_token: access_token
            },
            headers: {
                authorization: authHeader
            }
        };
        
        // Create a mock response object to capture buy-order route response
        let buyOrderResponse = null;
        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    buyOrderResponse = { statusCode: code, ...data };
                    return mockRes;
                }
            }),
            json: (data) => {
                buyOrderResponse = { statusCode: 200, ...data };
                return mockRes;
            }
        };
        
        // Call the existing buy order route logic
        console.log('📞 Placing test order directly via KiteConnect...');
        
        console.log('⚠️ TEST ORDER: Direct KiteConnect placement for testing purposes');
        
        const result = await kite.placeOrder('regular', orderParams);
        
        if (result && result.order_id) {
            console.log('✅ Test RELIANCE buy order placed:', result);
            
            // Return test-specific response with additional context
            res.json({
                success: true,
                message: '🧪 RELIANCE Test Buy Order Executed',
                testType: 'RELIANCE_BUY_ORDER',
                symbol: 'RELIANCE',
                currentPrice: currentPrice,
                order_id: result.order_id,
                orderResult: {
                    success: true,
                    order_id: result.order_id,
                    symbol: 'RELIANCE',
                    quantity: finalQuantity,
                    price: currentPrice,
                    order_type: 'MARKET'
                },
                executedAt: new Date().toISOString(),
                note: 'This was a test order using direct KiteConnect with auto-calculated quantity'
            });
        } else {
            throw new Error('KiteConnect test order placement failed');
        }
        
    } catch (error) {
        console.error('❌ Error in test RELIANCE buy:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            testType: 'RELIANCE_BUY_ORDER',
            message: 'Test order failed'
        });
    }
});

// MANUAL UNSUBSCRIBE ENDPOINT
router.post('/unsubscribe', async (req, res) => {
    try {
        console.log('🔴 Manual unsubscribe request received:', req.body);
        
        const { symbols } = req.body;
        
        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbols array provided',
                message: 'Please provide a symbols array with symbol names to unsubscribe'
            });
        }
        
        if (!globalTicker) {
            return res.status(400).json({
                success: false,
                error: 'No active ticker connection',
                message: 'Ticker is not initialized. Cannot unsubscribe.'
            });
        }
        
        // Convert symbols to tokens
        const tokensToUnsubscribe = [];
        const unsubscribeResults = [];
        
        symbols.forEach(symbol => {
            const token = symbolMappings.symbolMappings[symbol];
            if (token) {
                const tokenInt = parseInt(token);
                if (currentlySubscribed.has(tokenInt)) {
                    tokensToUnsubscribe.push(tokenInt);
                    unsubscribeResults.push({
                        symbol: symbol,
                        token: tokenInt,
                        status: 'unsubscribed'
                    });
                } else {
                    unsubscribeResults.push({
                        symbol: symbol,
                        token: tokenInt,
                        status: 'not_subscribed'
                    });
                }
            } else {
                unsubscribeResults.push({
                    symbol: symbol,
                    token: null,
                    status: 'token_not_found'
                });
            }
        });
        
        console.log(`🔴 Unsubscribing from ${tokensToUnsubscribe.length} tokens:`, tokensToUnsubscribe);
        
        // Perform unsubscription
        if (tokensToUnsubscribe.length > 0) {
            globalTicker.unsubscribe(tokensToUnsubscribe);
            
            // Remove from tracking
            tokensToUnsubscribe.forEach(token => {
                currentlySubscribed.delete(token);
                scanTypeTracker.delete(token);
                console.log(`❌ Unsubscribed: ${token}`);
            });
            
            console.log(`✅ Successfully unsubscribed from ${tokensToUnsubscribe.length} symbols`);
            console.log(`📊 Remaining subscriptions: ${currentlySubscribed.size}`);
            
            // Broadcast subscription update
            broadcastSubscriptionUpdate();
        }
        
        res.json({
            success: true,
            message: `Unsubscribe operation completed`,
            unsubscribedCount: tokensToUnsubscribe.length,
            remainingSubscriptions: currentlySubscribed.size,
            results: unsubscribeResults,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in manual unsubscribe:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to unsubscribe from symbols'
        });
    }
});

// Check if we're in RELIANCE fallback mode (only RELIANCE subscribed)
router.get('/fallback-status', (req, res) => {
    try {
        const isRelianceFallback = currentlySubscribed.size === 1 && 
                                  currentlySubscribed.has(738561) && 
                                  scanTypeTracker.get(738561) === 'FALLBACK';
        
        res.json({
            success: true,
            isRelianceFallback: isRelianceFallback,
            currentSubscriptions: currentlySubscribed.size,
            relianceSubscribed: currentlySubscribed.has(738561),
            relianceScanType: scanTypeTracker.get(738561),
            subscriptionDetails: Array.from(currentlySubscribed).map(token => ({
                token: token,
                symbol: getSymbolFromToken(token),
                scanType: scanTypeTracker.get(token)
            })),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error checking fallback status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// RELIANCE Buy/Sell endpoints for fallback mode
router.post('/reliance-buy-scan', async (req, res) => {
    try {
        console.log('🏛️ RELIANCE Buy Scan requested');
        
        // Check if RELIANCE is currently subscribed
        const isRelianceSubscribed = currentlySubscribed.has(738561);
        
        if (!isRelianceSubscribed) {
            return res.status(400).json({
                success: false,
                error: 'RELIANCE buy scan only available when RELIANCE is subscribed',
                currentState: 'RELIANCE not subscribed'
            });
        }
        
        // Update RELIANCE scan type to BUY_SCAN
        scanTypeTracker.set(738561, 'BUY_SCAN');
        console.log('🟢 RELIANCE marked as BUY_SCAN symbol');
        
        // Broadcast subscription update
        broadcastSubscriptionUpdate();
        
        res.json({
            success: true,
            message: 'RELIANCE set as Buy Scan symbol',
            symbol: 'RELIANCE',
            token: 738561,
            scanType: 'BUY_SCAN',
            note: 'Orders will only be placed if ALL 13 buy conditions are met',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in RELIANCE buy scan:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/reliance-sell-scan', async (req, res) => {
    try {
        console.log('🏛️ RELIANCE Sell Scan requested');
        
        // Check if RELIANCE is currently subscribed
        const isRelianceSubscribed = currentlySubscribed.has(738561);
        
        if (!isRelianceSubscribed) {
            return res.status(400).json({
                success: false,
                error: 'RELIANCE sell scan only available when RELIANCE is subscribed',
                currentState: 'RELIANCE not subscribed'
            });
        }
        
        // Update RELIANCE scan type to SELL_SCAN
        scanTypeTracker.set(738561, 'SELL_SCAN');
        console.log('🔴 RELIANCE marked as SELL_SCAN symbol');
        
        // Broadcast subscription update
        broadcastSubscriptionUpdate();
        
        res.json({
            success: true,
            message: 'RELIANCE set as Sell Scan symbol',
            symbol: 'RELIANCE',
            token: 738561,
            scanType: 'SELL_SCAN',
            note: 'Orders will only be placed if ALL 13 sell conditions are met',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in RELIANCE sell scan:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
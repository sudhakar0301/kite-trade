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
            subscribed_tokens: Array.from(currentlySubscribed),
            timestamp: new Date().toISOString()
        };
        console.log(`📡 Broadcasting subscription update: ${currentlySubscribed.size} subscriptions`);
        global.broadcastLiveData(subscriptionData);
    }
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
   

    if (!existingDepth || !lastPrice) {
        // No existing depth - create full 20 level structure
        const result = {
            buy: Array.from({length: 20}, (_, i) => ({
                price: lastPrice * (0.999 - i * 0.0005), 
                quantity: 1000 + i * 100,
                orders: Math.floor(Math.random() * 10) + 1,
                masked: false,
                level: i + 1
            })),
            sell: Array.from({length: 20}, (_, i) => ({
                price: lastPrice * (1.001 + i * 0.0005), 
                quantity: 1000 + i * 100,
                orders: Math.floor(Math.random() * 10) + 1,
                masked: false,
                level: i + 1
            }))
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
        return result;
    }

    // Use existing depth and extend to 20 levels if needed
    const buyOrders = existingDepth.buy || [];
    const sellOrders = existingDepth.sell || [];
    
    // Extend buy orders to 20 levels
    const enhancedBuy = [...buyOrders];
    if (buyOrders.length < 20) {
        const lastBuyPrice = buyOrders.length > 0 ? buyOrders[buyOrders.length - 1].price : lastPrice * 0.999;
        const priceStep = buyOrders.length > 1 ? 
            (buyOrders[buyOrders.length - 2].price - buyOrders[buyOrders.length - 1].price) : 
            lastPrice * 0.0005;
        
        for (let i = buyOrders.length; i < 20; i++) {
            enhancedBuy.push({
                price: lastBuyPrice - (priceStep * (i - buyOrders.length + 1)),
                quantity: Math.floor(800 + Math.random() * 400),
                orders: Math.floor(Math.random() * 8) + 1,
                masked: false,
                level: i + 1
            });
        }
    }
    
    // Extend sell orders to 20 levels
    const enhancedSell = [...sellOrders];
    if (sellOrders.length < 20) {
        const lastSellPrice = sellOrders.length > 0 ? sellOrders[sellOrders.length - 1].price : lastPrice * 1.001;
        const priceStep = sellOrders.length > 1 ? 
            (sellOrders[sellOrders.length - 1].price - sellOrders[sellOrders.length - 2].price) : 
            lastPrice * 0.0005;
        
        for (let i = sellOrders.length; i < 20; i++) {
            enhancedSell.push({
                price: lastSellPrice + (priceStep * (i - sellOrders.length + 1)),
                quantity: Math.floor(800 + Math.random() * 400),
                orders: Math.floor(Math.random() * 8) + 1,
                masked: false,
                level: i + 1
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
                access_token: access_token
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
        const maxQuantity = Math.floor(usableFunds / ltp);
        const finalQuantity = requestedQuantity ? Math.min(requestedQuantity, maxQuantity) : maxQuantity;
        
        // CONSOLE LOG ALL CALCULATIONS
        console.log('\n🔵 BUY ORDER QUANTITY CALCULATION:');
        console.log('💰 Available Funds:', '₹' + availableFunds.toLocaleString('en-IN'));
        console.log('⚡ Leveraged Funds (5x):', '₹' + leverageFunds.toLocaleString('en-IN'));
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
            order_type: 'LIMIT',
            validity: 'DAY'
        };
        
        // Call the SEPARATE /api/buy-order route
        console.log(`📞 Making HTTP call to SEPARATE route: POST /api/buy-order`);
        const response = await fetch('http://localhost:5000/api/buy-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                orderParams: orderParams,
                ltp: ltp
            })
        });
        
        const result = await response.json();
        console.log('📈 SEPARATE BUY route response:', result);
        return result;
        
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
        const maxQuantity = Math.floor(usableFunds / ltp);
        const finalQuantity = requestedQuantity ? Math.min(requestedQuantity, maxQuantity) : maxQuantity;
        
        // CONSOLE LOG ALL CALCULATIONS
        console.log('\n🔴 SELL ORDER QUANTITY CALCULATION:');
        console.log('💰 Available Funds:', '₹' + availableFunds.toLocaleString('en-IN'));
        console.log('⚡ Leveraged Funds (5x):', '₹' + leverageFunds.toLocaleString('en-IN'));
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
            order_type: 'LIMIT',
            validity: 'DAY'
        };
        
        // Call the SEPARATE /api/sell-order route
        console.log(`📞 Making HTTP call to SEPARATE route: POST /api/sell-order`);
        const response = await fetch('http://localhost:5000/api/sell-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                orderParams: orderParams,
                ltp: ltp
            })
        });
        
        const result = await response.json();
        console.log('📉 SEPARATE SELL route response:', result);
        return result;
        
    } catch (error) {
        console.error('❌ SEPARATE SELL route call failed:', error);
        throw error;
    }
}

// Helper function to make TradingView API call
async function makeScannorCall(payload, scannerType, requestInfo = {}) {
    try {
        console.log(`🔍 Making ${scannerType} scanner call to TradingView API...`);
        console.log(`📝 Payload:`, JSON.stringify(payload, null, 2));
        
        // Always try to make the TradingView API call first
        console.log(`📡 Sending request to: ${TRADINGVIEW_SCANNER_URL}`);
        
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
        
        console.log(`📊 TradingView API Response Status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`TradingView API error: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`✅ TradingView API Response:`, data);
        console.log(`📈 Stocks found: ${data.data ? data.data.length : 0}`);
        
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
        
        // Initialize ticker if needed
        if (!globalTicker && newTokens.size > 0) {
            console.log('🚀 Initializing global KiteTicker...');
            globalTicker = new KiteTicker({
                api_key: 'r1a7qo9w30bxsfax',
                access_token: access_token
            });
            
            setupTickerEventHandlers();
            globalTicker.connect();
            
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
            
        } else if (globalTicker && newTokens.size > 0) {
            // Ticker exists, manage subscriptions
            const tokensToUnsubscribe = [];
            const tokensToSubscribe = [];
            
            // Find tokens to unsubscribe (no longer in scan results)
            currentlySubscribed.forEach(token => {
                if (!newTokens.has(token)) {
                    tokensToUnsubscribe.push(token);
                }
            });
            
            // Find tokens to subscribe (new in scan results)
            newTokens.forEach(token => {
                if (!currentlySubscribed.has(token)) {
                    tokensToSubscribe.push(token);
                }
            });
            
            // Unsubscribe from removed tokens
            if (tokensToUnsubscribe.length > 0) {
                console.log(`🔴 Unsubscribing from ${tokensToUnsubscribe.length} tokens`);
                try {
                    globalTicker.unsubscribe(tokensToUnsubscribe);
                    tokensToUnsubscribe.forEach(token => {
                        currentlySubscribed.delete(token);
                        scanTypeTracker.delete(token);
                    });
                } catch (error) {
                    console.error('❌ Error during unsubscription:', error);
                }
            }
            
            // Subscribe to new tokens
            if (tokensToSubscribe.length > 0) {
                console.log(`🟢 Subscribing to ${tokensToSubscribe.length} new tokens`);
                try {
                    globalTicker.subscribe(tokensToSubscribe);
                    globalTicker.setMode(globalTicker.modeFull, tokensToSubscribe);
                    tokensToSubscribe.forEach(token => currentlySubscribed.add(token));
                    
                } catch (error) {
                    console.error('❌ Error subscribing to new tokens:', error);
                }
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
     //   console.log(`📊 Received ${ticks.length} tick updates`);
        
        // Log first tick for debugging
        if (ticks.length > 0) {
            const firstTick = ticks[0];
            // console.log('📊 First tick details:', {
            //     instrument_token: firstTick.instrument_token,
            //     last_price: firstTick.last_price,
            //     volume: firstTick.volume_traded || firstTick.volume
            // });
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
                
                // Check if this symbol should have live tracker masking applied
                let isLiveTrackerSymbol = liveTrackerSymbol && symbol === liveTrackerSymbol;
                
                // Handle NSE: prefix mismatch - try both formats
                if (!isLiveTrackerSymbol && liveTrackerSymbol) {
                    const symbolWithoutNSE = symbol.replace('NSE:', '');
                    const trackerWithoutNSE = liveTrackerSymbol.replace('NSE:', '');
                    const symbolWithNSE = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
                    const trackerWithNSE = liveTrackerSymbol.startsWith('NSE:') ? liveTrackerSymbol : `NSE:${liveTrackerSymbol}`;
                    
                    isLiveTrackerSymbol = symbolWithoutNSE === trackerWithoutNSE || 
                                         symbolWithNSE === trackerWithNSE ||
                                         symbol === trackerWithoutNSE ||
                                         symbolWithoutNSE === liveTrackerSymbol;
                    
                    if (isLiveTrackerSymbol) {
                        console.log(`✅ Symbol match found via format conversion: '${symbol}' matches '${liveTrackerSymbol}'`);
                    }
                }
                
                // FORCE MASKING DEBUG - Apply masking to RELIANCE for testing
                if (symbol === 'RELIANCE' || symbol === 'NSE:RELIANCE' || symbol.replace('NSE:', '') === 'RELIANCE') {
                    console.log(`🔧 BACKEND: FORCE DEBUG - Applying masking to RELIANCE for testing`);
                    isLiveTrackerSymbol = true;
                }
                
                // TEMPORARY DEBUG: Force masking on ALL symbols to test display
                console.log(`🔧 BACKEND: DEBUG MASKING - Force applying masking to ${symbol} for testing display`);
                isLiveTrackerSymbol = true;
                
                // Only log when masking is applied or for RELIANCE testing
                if (isLiveTrackerSymbol) {
                    console.log(`🎯 BACKEND: MASKING WILL BE APPLIED - Processing ${symbol} with market impact masking`);
                }
                // Create structured tick data matching frontend expectations
                const structuredTick = {
                    symbol: symbol,
                    last_price: tick.last_price || 0,
                    volume: tick.volume_traded || tick.volume || Math.floor(50000 + Math.random() * 100000),
                    change: change,
                    change_percent: tick.change ? ((tick.change / (tick.last_price - tick.change)) * 100).toFixed(2) : '0.00',
                    timestamp: new Date().toISOString(),
                    depth: enhanceDepthTo20Levels(tick.depth, tick.last_price, scanType, isLiveTrackerSymbol),
                    ohlc: tick.ohlc || {
                        open: tick.last_price,
                        high: tick.last_price * 1.01,
                        low: tick.last_price * 0.99,
                        close: tick.last_price
                    },
                    regime: regime,
                    scan_type: scanType,
                    liveTrackerMasking: isLiveTrackerSymbol
                };
                
                // Broadcast single tick update
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
                    
                    // Check if this symbol should have live tracker masking applied
                    let isLiveTrackerSymbol = liveTrackerSymbol && symbol === liveTrackerSymbol;
                    
                    // Handle NSE: prefix mismatch - try both formats
                    if (!isLiveTrackerSymbol && liveTrackerSymbol) {
                        const symbolWithoutNSE = symbol.replace('NSE:', '');
                        const trackerWithoutNSE = liveTrackerSymbol.replace('NSE:', '');
                        const symbolWithNSE = symbol.startsWith('NSE:') ? symbol : `NSE:${symbol}`;
                        const trackerWithNSE = liveTrackerSymbol.startsWith('NSE:') ? liveTrackerSymbol : `NSE:${liveTrackerSymbol}`;
                        
                        isLiveTrackerSymbol = symbolWithoutNSE === trackerWithoutNSE || 
                                             symbolWithNSE === trackerWithNSE ||
                                             symbol === trackerWithoutNSE ||
                                             symbolWithoutNSE === liveTrackerSymbol;
                        
                        if (isLiveTrackerSymbol) {
                            console.log(`✅ Batch Symbol match found: '${symbol}' matches '${liveTrackerSymbol}'`);
                        }
                    }
                    
                    // FORCE MASKING DEBUG - Apply masking to RELIANCE for testing
                    if (symbol === 'RELIANCE' || symbol === 'NSE:RELIANCE' || symbol.replace('NSE:', '') === 'RELIANCE') {
                        console.log(`🔧 BATCH: FORCE DEBUG - Applying masking to RELIANCE for testing`);
                        isLiveTrackerSymbol = true;
                    }
                    
                    // TEMPORARY DEBUG: Force masking on ALL symbols to test display
                    console.log(`🔧 BATCH: DEBUG MASKING - Force applying masking to ${symbol} for testing display`);
                    isLiveTrackerSymbol = true;
                    
                    // Only log when masking is applied
                    if (isLiveTrackerSymbol) {
                        console.log(`🎯 BATCH: MASKING APPLIED - Processing ${symbol} with market impact masking`);
                    }
                    
                    return {
                        symbol: symbol,
                        last_price: tick.last_price || 0,
                        volume: tick.volume_traded || tick.volume || Math.floor(50000 + Math.random() * 100000),
                        change: change,
                        change_percent: tick.change ? ((tick.change / (tick.last_price - tick.change)) * 100).toFixed(2) : '0.00',
                        timestamp: new Date().toISOString(),
                        depth: enhanceDepthTo20Levels(tick.depth, tick.last_price, scanType, isLiveTrackerSymbol),
                        ohlc: tick.ohlc || {
                            open: tick.last_price,
                            high: tick.last_price * 1.01,
                            low: tick.last_price * 0.99,
                            close: tick.last_price
                        },
                        regime: regime,
                        scan_type: scanType,
                        liveTrackerMasking: isLiveTrackerSymbol
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

// CONSOLIDATED ALL SCANNERS ROUTE
router.post('/all-scanners', async (req, res) => {
    try {
        console.log('🚀 Processing CONSOLIDATED all scanners request...');
        console.log('📄 Request Body:', req.body);
        
        // Set autoTrade from request body
        if (req.body.autoTrade !== undefined) {
            global.autoTrade = req.body.autoTrade;
            console.log(`🤖 Auto Trade set to: ${global.autoTrade}`);
        }

        console.log(`🔍 DEBUG - Auto Trade Status: ${global.autoTrade}`);
        console.log(`🔍 DEBUG - Access Token: ${req.body.access_token ? 'PROVIDED' : 'MISSING'}`);

        const startTime = Date.now();

        // Common scanner settings
        const commonColumns = [
            "close", "open|60", "EMA5|60", "VWAP|60", "open|15", "MACD.macd|15", 
            "MACD.signal|15", "EMA5|15", "EMA9|15", "MACD.macd|5", "MACD.signal|5", 
            "ADX|5", "MACD.macd|1", "MACD.signal|1", "ADX+DI|1", "ADX-DI|1", 
            "EMA5|5", "EMA9|5", "ADX+DI|5", "ADX-DI|5", "ADX|1", "open|5", 
            "EMA5|1", "EMA9|1", "VWAP|5", "BB.basis|1", "VWAP|1", "BB.upper|5", "BB.lower|5",
            "low|15", "high|15", "EMA3|15"
        ];

        const commonSettings = {
            "ignore_unknown_fields": false,
            "options": { "lang": "en" },
            "range": [0, 100],
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

        // Buy scan payload - sophisticated TradingView filters
        const buyPayload = {
            "columns": commonColumns,
            "filter": [
                { "left": "is_blacklisted", "operation": "equal", "right": false },
                // Price and volume filters
                // { "left": "close|1", "operation": "greater", "right": 100 },
                // { "left": "close|1", "operation": "less", "right": 4000 },
                
                // MACD conditions - 5min timeframe
                { "left": "MACD.macd|5", "operation": "greater", "right": "MACD.signal|5" }, // MACD > Signal on 5min
                
                // ADX condition - 5min timeframe  
                { "left": "ADX|5", "operation": "greater", "right": 25 }, // ADX > 25 on 5min
                
                // Additional technical conditions
                { "left": "MACD.macd|1", "operation": "greater", "right": 0 },
                { "left": "EMA5|1", "operation": "greater", "right": "EMA9|1" },
                { "left": "ADX|1", "operation": "greater", "right": "ADX-DI|1" },
                { "left": "EMA5|1", "operation": "greater", "right": "VWAP|1" },
                { "left": "MACD.macd|15", "operation": "greater", "right": 0 },
                { "left": "EMA5|5", "operation": "greater", "right": "EMA9|5" },
                { "left": "EMA3|15", "operation": "greater", "right": "EMA5|5" },
                { "left": "open|15", "operation": "less", "right": "EMA3|15" }, // Open < EMA3 on 15min
                 { "left": "ADX|1", "operation": "greater", "right": 25 },
            ],
            ...commonSettings
        };

        // Sell scan payload - sophisticated TradingView filters
        const sellPayload = {
            "columns": commonColumns,
            "filter": [
                { "left": "is_blacklisted", "operation": "equal", "right": false },
                // Price and volume filters
               // { "left": "close|1", "operation": "greater", "right": 100 },
              //  { "left": "close|1", "operation": "less", "right": 4000 },
                
                // MACD conditions - 5min timeframe
                { "left": "MACD.macd|5", "operation": "less", "right": "MACD.signal|5" }, // MACD < Signal on 5min
                
                // ADX condition - 5min timeframe
                { "left": "ADX|5", "operation": "greater", "right": 25 }, // ADX > 25 on 5min
                
                // Additional technical conditions
                { "left": "MACD.macd|1", "operation": "less", "right": 0 },
                { "left": "EMA5|1", "operation": "less", "right": "EMA9|1" },
                { "left": "ADX|1", "operation": "greater", "right": "ADX+DI|1" },
                { "left": "ADX|1", "operation": "greater", "right": 25 },
                { "left": "EMA5|1", "operation": "less", "right": "VWAP|1" },
                { "left": "MACD.macd|15", "operation": "less", "right": "MACD.signal|15" },
                { "left": "MACD.macd|15", "operation": "less", "right": 0 },
                { "left": "EMA5|5", "operation": "less", "right": "EMA9|5" },
                { "left": "EMA5|5", "operation": "greater", "right": "EMA3|15" },
                { "left": "open|15", "operation": "greater", "right": "EMA3|15" } // Open > EMA3 on 15min
            ],
            ...commonSettings
        };

        // Execute both scanners in parallel
        const [buyResult, sellResult] = await Promise.all([
            makeScannorCall(buyPayload, 'buy-scan', req.body),
            makeScannorCall(sellPayload, 'sell-scan', req.body)
        ]);

        const duration = Date.now() - startTime;
        console.log(`⚡ Both scanners completed in ${duration}ms`);

        // Extract and transform data from TradingView response
        const buyStocks = buyResult.success && buyResult.data && buyResult.data.data ? 
            buyResult.data.data.map(stock => ({ 
                s: stock.s, // symbol
                d: stock.d  // data array
            })) : [];

        const sellStocks = sellResult.success && sellResult.data && sellResult.data.data ? 
            sellResult.data.data.map(stock => ({ 
                s: stock.s, // symbol  
                d: stock.d  // data array
            })) : [];

        console.log(`📊 Scanner Results:`);
        console.log(`   Buy Scanner: ${buyStocks.length} stocks`);
        console.log(`   Sell Scanner: ${sellStocks.length} stocks`);

        // Helper function to enrich stock data 
        const enrichStockData = (stock) => {
            const symbol = stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : null;
            const token = symbol && symbolMappings.symbolMappings[symbol] ? 
                symbolMappings.symbolMappings[symbol] : null;
            
            // Transform TradingView data structure to what frontend expects
            const transformedStock = {
                symbol: symbol,
                token: parseInt(token) || null,
                instrument_token: parseInt(token) || null,
                s: stock.s,  // Keep original for reference
                d: stock.d,  // Keep original data array
                
                // Extract common values from data array if available
                ltp: stock.d && stock.d[0] ? parseFloat(stock.d[0]) : 0,
                volume: stock.d && stock.d[1] ? parseInt(stock.d[1]) : 0,
                change_percent: stock.d && stock.d[2] ? parseFloat(stock.d[2]) : 0
            };
            
            return transformedStock;
        };

        // Enrich scanner results with basic stock data
        const enrichedBuyStocks = buyStocks.map(enrichStockData);
        const enrichedSellStocks = sellStocks.map(enrichStockData);

        console.log(`📊 Scanner Results Processed:`);
        console.log(`   Buy stocks: ${enrichedBuyStocks.length}`);
        console.log(`   Sell stocks: ${enrichedSellStocks.length}`);

        // AUTO-SUBSCRIBE TO SCANNER RESULTS
        console.log('🔄 Starting auto-subscription...');
        autoSubscribeToResults(buyStocks, sellStocks, req.body.access_token).then(() => {
            console.log('✅ Auto-subscription completed');
        }).catch(error => {
            console.error('❌ Error in auto-subscription:', error);
        });

        // Return enriched scanner data
        const consolidatedResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            duration: duration,
            totalStocks: enrichedBuyStocks.length + enrichedSellStocks.length,
            buyStocks: enrichedBuyStocks,
            sellStocks: enrichedSellStocks,
            message: 'Scanner completed. Frontend will handle auto trading via separate routes.',
            statistics: {
                buyCount: enrichedBuyStocks.length,
                sellCount: enrichedSellStocks.length,
                totalCount: enrichedBuyStocks.length + enrichedSellStocks.length,
                executionTime: duration
            }
        };

        // Send initial results via WebSocket too
        if (global.broadcastLiveData) {
            global.broadcastLiveData({
                type: 'scanner_results',
                buySignals: enrichedBuyStocks,
                sellSignals: enrichedSellStocks,
                timestamp: new Date().toISOString()
            });
        }

        // RELIANCE will only be subscribed if found in scan results
        // await initializeRelianceSubscription(req.body.access_token);

        res.json(consolidatedResponse);

    } catch (error) {
        console.error('❌ Error in consolidated all scanners route:', error);
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
        res.json({
            success: true,
            subscribed_count: currentlySubscribed.size,
            subscribed_tokens: Array.from(currentlySubscribed),
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

// BUY ORDER ROUTE - Enhanced with funds, leverage, quantity calculation, and position checking
router.post('/buy-order', async (req, res) => {
    console.log('🔵 ENHANCED BUY-ORDER route hit with body:', req.body);
    
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

// SELL ORDER ROUTE - Enhanced with funds, leverage, quantity calculation, and position checking
router.post('/sell-order', async (req, res) => {
    console.log('🔴 ENHANCED SELL-ORDER route hit with body:', req.body);
    
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

module.exports = router;
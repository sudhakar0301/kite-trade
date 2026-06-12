const express = require('express');
const fetch = require('node-fetch');
const symbolMappings = require('../data/symbolMappings');
const { KiteTicker, KiteConnect } = require('kiteconnect');
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

// Auto Trading Control - Main orders only allowed when active
let autoTradingActive = false; // 🔒 SAFETY: Default to disabled

// 💰 GLOBAL FUNDS MANAGEMENT - Single source of truth for all trading operations
let globalAvailableFunds = 0;
let globalLeverageFunds = 0;
let globalUsableFunds = 0;
let globalFundsLastUpdated = null;
let globalFundsError = null;

// Tick backpressure controls: keep API routes responsive under heavy tick load.
let tickHandlerBusy = false;
let lastTickHandledAt = 0;
let droppedTickBatches = 0;
const TICK_PROCESS_INTERVAL_MS = 400;
const ENABLE_VERBOSE_TICK_LOGS = false;
const ENABLE_VERBOSE_SCAN_LOGS = false;
const ENABLE_VERBOSE_MARKET_IMPACT_LOGS = false;
const ENABLE_TICK_BATCH_BROADCAST = false;

// Target-order dedupe guards (across all placement paths)
const targetOrderPlacementInFlight = new Set();
const recentTargetOrderPlacements = new Map(); // key -> { ts, orderId }
const TARGET_ORDER_DEDUPE_WINDOW_MS = 15000;

// Centralized target-profit basis: for ~₹4,80,000 leveraged funds, target ~₹1,300 profit.
const TARGET_PROFIT_BASE_LEVERAGE = 480000;
const TARGET_PROFIT_BASE_AMOUNT = 1300;
const TARGET_PROFIT_RATIO = TARGET_PROFIT_BASE_AMOUNT / TARGET_PROFIT_BASE_LEVERAGE;
const TARGET_PROFIT_PERCENT = TARGET_PROFIT_RATIO * 100;

// Tick precheck throttling: avoid repeated positions/orders/margins calls on rapid ticks.
const orderPrecheckInFlight = new Set(); // key: symbol_scanType
const orderPrecheckLastRunAt = new Map(); // key -> epoch ms
const ORDER_PRECHECK_COOLDOWN_MS = 30000;

// Function to update global funds from Kite margins API
async function updateGlobalFunds(accessToken) {
    try {
        if (!accessToken || accessToken === 'demo_token') {
            console.log('⚠️ No valid access token for global funds update');
            return false;
        }

        console.log('💰 Updating global funds from Kite margins API...');
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        const margins = await kite.getMargins();
        
        let availableFunds = 0;
        if (margins.equity && margins.equity.available) {
            availableFunds = margins.equity.available.live_balance || 0;
        } else if (margins.equity && margins.equity.net) {
            availableFunds = margins.equity.net || 0;
        } else if (margins.net) {
            availableFunds = margins.net || 0;
        }
        
        // Calculate leveraged funds (5x for MIS) and usable funds (95% of leveraged)
        const leverageFunds = availableFunds * 5;
        const usableFunds = leverageFunds * 0.95;
        
        // Update global variables
        globalAvailableFunds = availableFunds;
        globalLeverageFunds = leverageFunds;
        globalUsableFunds = usableFunds;
        globalFundsLastUpdated = new Date();
        globalFundsError = null;
        
        console.log(`💰 Global funds updated successfully:`);
        console.log(`   - Available: ₹${globalAvailableFunds.toLocaleString('en-IN')}`);
        console.log(`   - Leveraged (5x): ₹${globalLeverageFunds.toLocaleString('en-IN')}`);
        console.log(`   - Usable (95%): ₹${globalUsableFunds.toLocaleString('en-IN')}`);
        
        return true;
        
    } catch (error) {
        console.log('❌ Global funds update failed:', error.message);
        globalFundsError = error.message;
        return false;
    }
}

// Function to get current global funds (with validation)
function getGlobalFunds() {
    return {
        availableFunds: globalAvailableFunds,
        leverageFunds: globalLeverageFunds, 
        usableFunds: globalUsableFunds,
        lastUpdated: globalFundsLastUpdated,
        error: globalFundsError
    };
}

function getEffectiveLeverageFunds() {
    return Number(globalLeverageFunds) > 0 ? Number(globalLeverageFunds) : TARGET_PROFIT_BASE_LEVERAGE;
}

function calculateProfitTargetFromInvestment(investment) {
    const safeInvestment = Math.max(0, Number(investment) || 0);
    const leverageFunds = getEffectiveLeverageFunds();

    // Scales target profit linearly with effective position investment.
    const targetProfitAmount = safeInvestment * TARGET_PROFIT_RATIO;

    return {
        leverageFunds,
        targetProfitAmount,
        targetProfitPercent: TARGET_PROFIT_PERCENT
    };
}

// Safety lock: once a target order exists/gets placed, stop new main-order flow.
function disableAutoTradingAfterTargetOrder(context = 'target_order_placed', details = {}) {
    if (!autoTradingActive) {
        return;
    }

    autoTradingActive = false;
    console.log(`🔒 AUTO TRADING AUTO-DISABLED (${context})`);

    if (global.broadcastLiveData) {
        global.broadcastLiveData({
            type: 'auto_trading_status',
            autoTradingActive: false,
            mainOrdersAllowed: false,
            targetOrdersAllowed: true,
            reason: context,
            details,
            timestamp: new Date().toISOString()
        });
    }
}

    // LOW PRICE CROSSOVER ROUTE: EMA3|1 crosses above EMA3|5
    router.post('/stocks-crossover', async (req, res) => {
        try {
            console.log('🚀 Processing CROSSOVER scanner request (EMA3|1 crosses above EMA3|5)...');

            // Keep global funds fresh to match low-price scanner behavior
            await updateGlobalFunds(req.body.access_token);

            const crossoverPayload = buildLowPriceScannerPayload([
                { "left": "EMA3|1", "operation": "crosses_above", "right": "EMA3|5" }
            ]);

            const scannerResult = await makeScannorCall(crossoverPayload, 'low-price-crossover-scan', req.body);
            const allStocks = extractTradingViewStocks(scannerResult);
            const enrichedStocks = allStocks.map(enrichLowPriceStockData);

            // Final guard condition in app code
            const crossoverStocks = enrichedStocks.filter(stock => stock.ema3_1 > stock.ema3_5);

            currentBuyStocks = crossoverStocks;
            currentSellStocks = [];
            lastScanTimestamp = new Date().toISOString();

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                scanType: 'low-price-crossover',
                condition: 'ema3_1 crosses above ema3_5',
                totalScanned: enrichedStocks.length,
                crossoverCount: crossoverStocks.length,
                crossoverStocks: crossoverStocks
            });
        } catch (error) {
            console.error('❌ Error in stocks-crossover route:', error);
            res.json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                crossoverStocks: []
            });
        }
    });

    // LOW PRICE CROSSDOWN ROUTE: EMA3|1 crosses below EMA3|5
    router.post('/stocks-crossdown', async (req, res) => {
        try {
            console.log('🚀 Processing CROSSDOWN scanner request (EMA3|1 crosses below EMA3|5)...');

            // Keep global funds fresh to match low-price scanner behavior
            await updateGlobalFunds(req.body.access_token);

            const crossdownPayload = buildLowPriceScannerPayload([
                { "left": "EMA3|1", "operation": "crosses_below", "right": "EMA3|5" }
            ]);

            const scannerResult = await makeScannorCall(crossdownPayload, 'low-price-crossdown-scan', req.body);
            const allStocks = extractTradingViewStocks(scannerResult);
            const enrichedStocks = allStocks.map(enrichLowPriceStockData);

            // Final guard condition in app code
            const crossdownStocks = enrichedStocks.filter(stock => stock.ema3_1 < stock.ema3_5);

            currentBuyStocks = [];
            currentSellStocks = crossdownStocks;
            lastScanTimestamp = new Date().toISOString();

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                scanType: 'low-price-crossdown',
                condition: 'ema3_1 crosses below ema3_5',
                totalScanned: enrichedStocks.length,
                crossdownCount: crossdownStocks.length,
                crossdownStocks: crossdownStocks
            });
        } catch (error) {
            console.error('❌ Error in stocks-crossdown route:', error);
            res.json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                crossdownStocks: []
            });
        }
    });

    // LOW PRICE CROSSOVER ROUTE: EMA3|1 crosses above EMA3|5
    router.post('/stocks-crossover-vwma9', async (req, res) => {
        try {
            console.log('🚀 Processing CROSSOVER scanner request (EMA3|1 crosses above EMA3|5)...');

            // Keep global funds fresh to match low-price scanner behavior
            await updateGlobalFunds(req.body.access_token);

            const crossoverVwmaPayload = buildCrossOnlyScannerPayload([
                { "left": "EMA3|1", "operation": "crosses_above", "right": "EMA3|5" }
            ]);

            const scannerResult = await makeScannorCall(crossoverVwmaPayload, 'low-price-crossover-vwma9-scan', req.body);
            const allStocks = extractTradingViewStocks(scannerResult);
            const enrichedStocks = allStocks.map(enrichCrossOnlyStockData);

            // Final guard condition in app code
            const crossoverStocks = enrichedStocks.filter(stock => Number(stock.ema3_1 || 0) > Number(stock.ema3_5 || 0));

            lastScanTimestamp = new Date().toISOString();

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                scanType: 'low-price-crossover-vwma9',
                condition: 'ema3_1 crosses above ema3_5',
                totalScanned: enrichedStocks.length,
                crossoverCount: crossoverStocks.length,
                crossoverStocks: crossoverStocks
            });
        } catch (error) {
            console.error('❌ Error in stocks-crossover-vwma9 route:', error);
            res.json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                crossoverStocks: []
            });
        }
    });

    // LOW PRICE CROSSDOWN ROUTE: EMA3|1 crosses below EMA3|5
    router.post('/stocks-crossdown-vwma9', async (req, res) => {
        try {
            console.log('🚀 Processing CROSSDOWN scanner request (EMA3|1 crosses below EMA3|5)...');

            // Keep global funds fresh to match low-price scanner behavior
            await updateGlobalFunds(req.body.access_token);

            const crossdownVwmaPayload = buildCrossOnlyScannerPayload([
                { "left": "EMA3|1", "operation": "crosses_below", "right": "EMA3|5" }
            ]);

            const scannerResult = await makeScannorCall(crossdownVwmaPayload, 'low-price-crossdown-vwma9-scan', req.body);
            const allStocks = extractTradingViewStocks(scannerResult);
            const enrichedStocks = allStocks.map(enrichCrossOnlyStockData);

            // Final guard condition in app code
            const crossdownStocks = enrichedStocks.filter(stock => Number(stock.ema3_1 || 0) < Number(stock.ema3_5 || 0));

            lastScanTimestamp = new Date().toISOString();

            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                scanType: 'low-price-crossdown-vwma9',
                condition: 'ema3_1 crosses below ema3_5',
                totalScanned: enrichedStocks.length,
                crossdownCount: crossdownStocks.length,
                crossdownStocks: crossdownStocks
            });
        } catch (error) {
            console.error('❌ Error in stocks-crossdown-vwma9 route:', error);
            res.json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                crossdownStocks: []
            });
        }
    });



    // Shared scanner config/helpers reused by low-price and crossover/crossdown routes
    function getLowPriceScannerCommonSettings() {
        return {
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
    }

    function getLowPriceScannerCommonColumns() {
        return [
            "close", "open|60", "EMA5|60", "VWAP|60", "open|15", "MACD.macd|15",
            "MACD.signal|15", "EMA5|15", "EMA9|15", "MACD.macd|5", "MACD.signal|5",
            "ADX|5", "MACD.macd|1", "MACD.signal|1", "ADX+DI|1", "ADX-DI|1",
            "EMA5|5", "EMA9|5", "ADX+DI|5", "ADX-DI|5", "ADX|1", "open|5",
            "EMA5|1", "EMA9|1", "VWAP|5", "BB.basis|1", "VWAP|1", "BB.upper|5", "BB.lower|5",
            "low|15", "high|15", "EMA3|15", "EMA3|5", "ADX|15", "ADX+DI|15", "ADX-DI|15", "EMA3|1", "VWMA|9", "RSI|5", "RSI|1"
        ];
    }

    function buildLowPriceBaseFilters() {
        return [
            { "left": "is_blacklisted", "operation": "equal", "right": false },
            { "left": "close|1", "operation": "greater", "right": 100 },
            { "left": "close|1", "operation": "eless", "right": 4000 },
            { "left": "average_volume_10d_calc", "operation": "greater", "right": 500000 }
        ];
    }

    function buildLowPriceScannerPayload(extraFilters = []) {
        return {
            "columns": getLowPriceScannerCommonColumns(),
            "filter": [...buildLowPriceBaseFilters(), ...extraFilters],
            ...getLowPriceScannerCommonSettings()
        };
    }

    function getCrossOnlyScannerColumns() {
        return ["close", "EMA3|1", "EMA3|5", "RSI|1", "RSI|5"];
    }

    function buildCrossOnlyScannerPayload(extraFilters = []) {
        return {
            "columns": getCrossOnlyScannerColumns(),
            "filter": [...extraFilters],
            ...getLowPriceScannerCommonSettings()
        };
    }

    function enrichCrossOnlyStockData(stock) {
        const symbol = stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : null;
        const token = symbol && symbolMappings.symbolMappings[symbol] ? symbolMappings.symbolMappings[symbol] : null;
        const data = stock.d || [];

        return {
            symbol: symbol,
            token: parseInt(token) || null,
            instrument_token: parseInt(token) || null,
            s: stock.s,
            d: stock.d,
            ltp: data[0] || 0,
            ema3_1: data[1] || 0,
            ema3_5: data[2] || 0,
            rsi1: data[3] || 0,
            rsi5: data[4] || 0
        };
    }

    function extractTradingViewStocks(scannerResult) {
        return scannerResult.success && scannerResult.data && scannerResult.data.data
            ? scannerResult.data.data.map(stock => ({ s: stock.s, d: stock.d }))
            : [];
    }

    function enrichLowPriceStockData(stock) {
        const symbol = stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : null;
        const token = symbol && symbolMappings.symbolMappings[symbol] ? symbolMappings.symbolMappings[symbol] : null;

        const data = stock.d || [];
        return {
            symbol: symbol,
            token: parseInt(token) || null,
            instrument_token: parseInt(token) || null,
            s: stock.s,
            d: stock.d,
            ltp: data[0] || 0,
            open60: data[1] || 0,
            ema5_60: data[2] || 0,
            vwap60: data[3] || 0,
            open15: data[4] || 0,
            macd15: data[5] || 0,
            signal15: data[6] || 0,
            ema5_15: data[7] || 0,
            ema9_15: data[8] || 0,
            macd5: data[9] || 0,
            signal5: data[10] || 0,
            adx5: data[11] || 0,
            macd1: data[12] || 0,
            signal1: data[13] || 0,
            plusDI1: data[14] || 0,
            minusDI1: data[15] || 0,
            ema5_5: data[16] || 0,
            ema9_5: data[17] || 0,
            plusDI5: data[18] || 0,
            minusDI5: data[19] || 0,
            adx1: data[20] || 0,
            open5: data[21] || 0,
            ema5_1: data[22] || 0,
            ema9_1: data[23] || 0,
            vwap1: data[26] || 0,
            ubb_5: data[27] || 0,
            lbb_5: data[28] || 0,
            ema3_15: data[31] || 0,
            ema3_5: data[32] || 0,
            adx15: data[33] || 0,
            plusDI15: data[34] || 0,
            minusDI15: data[35] || 0,
            ema3_1: data[36] || 0,
            vwma_9: data[37] || 0,
            rsi5: data[38] || 0,
            rsi1: data[39] || 0
        };
    }

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

// Route to enable/disable auto trading
router.post('/set-auto-trading', (req, res) => {
    try {
        const { enabled } = req.body;
        
        console.log(`🔒 AUTO TRADING: ${enabled ? 'ENABLING' : 'DISABLING'} auto trading`);
        
        autoTradingActive = Boolean(enabled);
        
        console.log(`🔒 AUTO TRADING: Status updated to ${autoTradingActive ? 'ENABLED' : 'DISABLED'}`);
        
        res.json({ 
            success: true, 
            autoTradingActive: autoTradingActive,
            message: `Auto trading ${autoTradingActive ? 'enabled' : 'disabled'}. ${autoTradingActive ? 'Main orders now allowed.' : 'Main orders blocked - target orders still allowed.'}`
        });
        
    } catch (error) {
        console.error('❌ Error setting auto trading status:', error);
        res.status(500).json({ error: 'Failed to set auto trading status' });
    }
});

// Route to get auto trading status
router.get('/auto-trading-status', (req, res) => {
    try {
        res.json({ 
            success: true,
            autoTradingActive: autoTradingActive,
            status: autoTradingActive ? 'enabled' : 'disabled',
            mainOrdersAllowed: autoTradingActive,
            targetOrdersAllowed: true
        });
    } catch (error) {
        console.error('❌ Error getting auto trading status:', error);
        res.status(500).json({ error: 'Failed to get auto trading status' });
    }
});

// Route to get global funds
router.get('/get-margins', async (req, res) => {
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
        
        // Update global funds first
        const fundsUpdated = await updateGlobalFunds(token);
        const globalFunds = getGlobalFunds();
        
        res.json({
            success: true,
            globalFunds: globalFunds,
            fundsUpdated: fundsUpdated,
            availableFunds: globalFunds.availableFunds,
            leverageFunds: globalFunds.leverageFunds,
            usableFunds: globalFunds.usableFunds,
            lastUpdated: globalFunds.lastUpdated,
            error: globalFunds.error
        });
        
    } catch (error) {
        console.error('❌ Error getting global funds:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

function broadcastSubscriptionUpdate() {
    if (global.broadcastLiveData) {
        // Convert tokens back to symbols for frontend
        const subscribedSymbols = Array.from(currentlySubscribed).map(token => {
            return getSymbolFromToken(token);
        }).filter(symbol => symbol !== 'Unknown'); // Filter out unknown symbols
        
        const subscriptionData = {
            type: 'subscription_update',
            subscribed_count: currentlySubscribed.size,
            subscribed_symbols: subscribedSymbols, // ✅ RE-ADDED: Include actual symbols for frontend state sync
            subscribed_tokens: Array.from(currentlySubscribed), // Include tokens for debugging
            timestamp: new Date().toISOString()
        };
        console.log(`📡 Broadcasting subscription update: ${currentlySubscribed.size} subscriptions, symbols: [${subscribedSymbols.join(', ')}]`);
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

// Calculate target price using centralized leveraged-funds profit basis
function calculateTargetPrice(avgPrice, quantity, side) {
    const safeQty = Math.abs(parseInt(quantity || 0));
    const safeAvgPrice = Number(avgPrice || 0);
    if (safeQty <= 0 || !Number.isFinite(safeAvgPrice) || safeAvgPrice <= 0) {
        return Number(safeAvgPrice || 0);
    }

    const investment = safeAvgPrice * safeQty;
    const { targetProfitAmount, targetProfitPercent, leverageFunds } = calculateProfitTargetFromInvestment(investment);
    const profitPerShare = targetProfitAmount / safeQty;
    
    console.log(`💰 Investment Calculation: ₹${safeAvgPrice} × ${safeQty} = ₹${investment.toLocaleString('en-IN')}`);
    console.log(`🎯 Target Profit (${targetProfitPercent.toFixed(4)}%): ₹${targetProfitAmount.toFixed(2)} (₹${profitPerShare.toFixed(2)} per share) [Leverage basis: ₹${leverageFunds.toLocaleString('en-IN')} -> ₹${TARGET_PROFIT_BASE_AMOUNT}]`);
    
    let rawTargetPrice;
    if (side === 'BUY') {
        // For BUY position, SELL at higher price for profit
        rawTargetPrice = safeAvgPrice + profitPerShare;
        console.log(`📈 BUY position: Raw target SELL at ₹${rawTargetPrice.toFixed(2)} (+₹${profitPerShare.toFixed(2)})`);
    } else {
        // For SELL position, BUY back at lower price for profit  
        rawTargetPrice = safeAvgPrice - profitPerShare;
        console.log(`📉 SELL position: Raw target BUY at ₹${rawTargetPrice.toFixed(2)} (-₹${profitPerShare.toFixed(2)})`);
    }
    
    // Round to proper tick size
    const targetPrice = roundToTickSize(rawTargetPrice, safeAvgPrice);
    const actualProfitPerShare = Math.abs(targetPrice - safeAvgPrice);
    const actualTotalProfit = actualProfitPerShare * safeQty;
    
    console.log(`🎯 Final target price after tick size rounding: ₹${targetPrice.toFixed(2)}`);
    console.log(`💰 Expected total profit: ₹${actualTotalProfit.toFixed(2)} (₹${actualProfitPerShare.toFixed(2)} per share)`);
    
    return targetPrice;
}

// Place target order
async function placeTargetOrder(accessToken, symbol, quantity, targetPrice, side) {
    let targetKey = null;
    try {
        // side is already the correct target side we want (no need to flip)
        const targetAction = side; // Use the side parameter directly
        const product = 'MIS'; // MIS for intraday
        const normalizedQty = Math.abs(parseInt(quantity || 0));
        const roundedTargetPrice = Number(targetPrice || 0).toFixed(2);
        targetKey = `${symbol}|${targetAction}|${normalizedQty}|${roundedTargetPrice}`;

        if (normalizedQty <= 0 || !Number.isFinite(Number(roundedTargetPrice))) {
            return { success: false, error: 'Invalid target order quantity/price' };
        }

        if (targetOrderPlacementInFlight.has(targetKey)) {
            console.log(`⏸️ Target placement already in-flight for ${targetKey} - skipping duplicate attempt`);
            return { success: true, skippedDuplicate: true, reason: 'in_flight_duplicate' };
        }

        const recent = recentTargetOrderPlacements.get(targetKey);
        if (recent && (Date.now() - recent.ts) < TARGET_ORDER_DEDUPE_WINDOW_MS) {
            console.log(`⏸️ Target placement deduped by recent window for ${targetKey} (${Date.now() - recent.ts}ms)`);
            return { success: true, skippedDuplicate: true, reason: 'recent_duplicate', orderId: recent.orderId || null };
        }

        targetOrderPlacementInFlight.add(targetKey);
        
        // Initialize KiteConnect
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);

        // Broker-side dedupe: if matching open target exists, do not place another.
        const existingOrders = await kite.getOrders();
        const matchingOpenTarget = (existingOrders || []).find(order =>
            order.tradingsymbol === symbol &&
            order.transaction_type === targetAction &&
            Math.abs(parseInt(order.quantity || 0)) === normalizedQty &&
            (order.status === 'OPEN' || order.status === 'TRIGGER PENDING' || order.status === 'MODIFY_PENDING') &&
            (String(order.tag || '').startsWith('TGT_') || Number(order.price || 0).toFixed(2) === roundedTargetPrice)
        );

        if (matchingOpenTarget) {
            targetOrders.set(symbol, {
                orderId: matchingOpenTarget.order_id,
                targetPrice: parseFloat(matchingOpenTarget.price || roundedTargetPrice),
                quantity: normalizedQty,
                side: targetAction,
                placedAt: matchingOpenTarget.order_timestamp || new Date().toISOString()
            });
            recentTargetOrderPlacements.set(targetKey, { ts: Date.now(), orderId: matchingOpenTarget.order_id });
            disableAutoTradingAfterTargetOrder('target_order_detected_existing', {
                symbol,
                targetOrderId: matchingOpenTarget.order_id
            });
            console.log(`✅ Matching open target already exists for ${symbol}: ${matchingOpenTarget.order_id} - deduped`);
            return { success: true, orderId: matchingOpenTarget.order_id, alreadyExists: true };
        }
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: targetAction, // Use targetAction directly
            order_type: 'LIMIT',
            quantity: normalizedQty,
            price: roundedTargetPrice,
            product: product,
            validity: 'DAY',
            tag: `TGT_${symbol.substring(0, 8)}` // Shortened tag to fit 20 char limit
        };

        console.log(`🎯 Placing TARGET order: ${targetAction} ${normalizedQty} ${symbol} @ ₹${roundedTargetPrice}`);
        
        const result = await kite.placeOrder('regular', orderParams);

        if (result && result.order_id) {
            console.log(`✅ TARGET ORDER PLACED: ${result.order_id} for ${symbol}`);
            
            // Store target order info
            targetOrders.set(symbol, {
                orderId: result.order_id,
                targetPrice: Number(roundedTargetPrice),
                quantity: normalizedQty,
                side: targetAction,
                placedAt: new Date().toISOString()
            });

            recentTargetOrderPlacements.set(targetKey, { ts: Date.now(), orderId: result.order_id });
            disableAutoTradingAfterTargetOrder('target_order_placed', {
                symbol,
                targetOrderId: result.order_id
            });
            
            return { success: true, orderId: result.order_id };
        } else {
            console.error(`❌ TARGET ORDER FAILED for ${symbol}:`, result);
            return { success: false, error: 'Failed to place target order' };
        }
    } catch (error) {
        console.error(`❌ TARGET ORDER ERROR for ${symbol}:`, error.message);
        return { success: false, error: error.message };
    } finally {
        if (targetKey) {
            targetOrderPlacementInFlight.delete(targetKey);
        }
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
            const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
            
            console.log(`📊 Found position: ${symbol} Qty=${quantity}, AvgPrice=₹${avgPrice}, Side=${side}`);
            
            // Check if we already have an active position for this symbol
            if (activePositions.has(symbol)) {
                console.log(`⚠️ Position already exists for ${symbol}, skipping target order`);
                return;
            }
            
            // Calculate target price using centralized leveraged-funds profit basis
            const targetPrice = calculateTargetPrice(avgPrice, quantity, side);
            
            console.log(`🎯 Calculated target price: ₹${targetPrice.toFixed(2)} using centralized leverage-based profit target`);
            
            // Store active position
            activePositions.set(symbol, {
                quantity: quantity,
                avgPrice: avgPrice,
                side: side,
                entryTime: new Date().toISOString(),
                targetOrderId: null
            });
            
            // Place target order
            const targetResult = await placeTargetOrder(accessToken, symbol, quantity, targetPrice, targetSide);
            
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
                            targetProfit: calculateProfitTargetFromInvestment(avgPrice * Math.abs(quantity)).targetProfitAmount,
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

// 🎯 POSITION & ORDER CHECK - backend reconciliation for missing target orders
async function checkPositionsAndOrders(accessToken) {
    try {
        console.log('🔍 === POSITION & ORDER CHECK (TARGET RECONCILIATION) ===');
        console.log(`🔑 Using access token: ${accessToken ? accessToken.substring(0, 10) + '...' : 'undefined'}`);
        
        // STEP 1: Get current active positions
        console.log('📡 Fetching positions from Zerodha API...');
        const positions = await getActivePositions(accessToken);
        const activePositionsFiltered = positions.filter(pos => pos.quantity !== 0);
        
        // STEP 2: Get open orders 
        console.log('📋 Fetching open orders from Zerodha API...');
        const openOrders = await getOpenOrders(accessToken);
        
        // LOG CURRENT STATE
        if (activePositionsFiltered.length === 0) {
            // � ADDITIONAL CHECK: Also check for open orders (limit orders)
            if (openOrders.length > 0) {
                console.log(`🚫 No positions BUT ${openOrders.length} open order(s) found - MAIN ORDERS BLOCKED`);
                console.log('📋 Open orders:', openOrders.map(order => ({
                    symbol: order.tradingsymbol,
                    order_id: order.order_id,
                    transaction_type: order.transaction_type,
                    order_type: order.order_type,
                    status: order.status,
                    price: order.price,
                    quantity: order.quantity
                })));
                return { 
                    allowMainOrders: false, 
                    positionsFound: false, 
                    openOrdersFound: true,
                    autoTradingActive: autoTradingActive, 
                    reason: 'Open orders exist - wait for execution or cancel them first',
                    openOrdersCount: openOrders.length
                };
            }
            
            // 🔒 FINAL CHECK: Auto trading must also be enabled for main orders
            if (autoTradingActive) {
                console.log('✅ No active positions + No open orders + Auto trading enabled - MAIN ORDERS ALLOWED');
                return { allowMainOrders: true, positionsFound: false, openOrdersFound: false, autoTradingActive: true };
            } else {
                console.log('🔒 No active positions + No open orders BUT Auto trading disabled - MAIN ORDERS BLOCKED');
                return { allowMainOrders: false, positionsFound: false, openOrdersFound: false, autoTradingActive: false, reason: 'Auto trading disabled' };
            }
        }
        
        console.log(`📊 Found ${activePositionsFiltered.length} active positions:`, 
            activePositionsFiltered.map(pos => ({
                symbol: pos.tradingsymbol,
                quantity: pos.quantity,
                avg_price: pos.average_price,
                side: parseInt(pos.quantity) > 0 ? 'BUY' : 'SELL'
            }))
        );
        
        console.log(`📋 Found ${openOrders.length} open orders:`, 
            openOrders.map(order => ({
                symbol: order.tradingsymbol,
                order_id: order.order_id,
                transaction_type: order.transaction_type,
                status: order.status,
                price: order.price,
                quantity: order.quantity
            }))
        );
        
        // STEP 3: Reconcile missing targets for active positions
        for (const position of activePositionsFiltered) {
            const symbol = position.tradingsymbol;
            const quantity = parseInt(position.quantity);
            const avgPrice = parseFloat(position.average_price);
            const positionSide = quantity > 0 ? 'BUY' : 'SELL';
            const targetSide = positionSide === 'BUY' ? 'SELL' : 'BUY';
            
            console.log(`🎯 Checking ${symbol}: Qty=${quantity}, AvgPrice=₹${avgPrice}, Side=${positionSide}, Need=${targetSide}`);
            
            // Check if target order already exists (same symbol, opposite side, same quantity)
            const existingTargetOrder = openOrders.find(order => 
                order.tradingsymbol === symbol && 
                order.transaction_type === targetSide &&
                Math.abs(parseInt(order.quantity)) === Math.abs(quantity) &&
                (order.status === 'OPEN' || order.status === 'TRIGGER PENDING')
            );
            
            if (existingTargetOrder) {
                console.log(`✅ Target order exists for ${symbol}: ${existingTargetOrder.order_id} (${targetSide} ${existingTargetOrder.quantity} @ ₹${existingTargetOrder.price})`);
            } else {
                console.log(`🎯 No target order found for ${symbol} - placing missing target from backend`);

                const targetPrice = calculateTargetPrice(avgPrice, Math.abs(quantity), positionSide);
                const targetResult = await placeTargetOrder(accessToken, symbol, Math.abs(quantity), targetPrice, targetSide);

                if (targetResult.success) {
                    console.log(`✅ Missing target order placed for ${symbol}: ${targetResult.orderId}`);
                    if (global.broadcastLiveData) {
                        global.broadcastLiveData({
                            type: 'target_order_placed',
                            position: {
                                symbol,
                                quantity,
                                avgPrice,
                                side: positionSide,
                                targetSide,
                                targetPrice,
                                targetOrderId: targetResult.orderId,
                                targetProfit: calculateProfitTargetFromInvestment(avgPrice * Math.abs(quantity)).targetProfitAmount,
                                timestamp: new Date().toISOString()
                            }
                        });
                    }
                } else {
                    console.log(`❌ Failed to place missing target for ${symbol}: ${targetResult.error}`);
                }
            }
        }
        
        console.log('🎯 Position & order check complete - backend target reconciliation applied');
        return { 
            allowMainOrders: false, 
            positionsFound: true, 
            openOrdersFound: openOrders.length > 0,
            processedPositions: activePositionsFiltered.length, 
            openOrdersCount: openOrders.length,
            autoTradingActive: autoTradingActive, 
            reason: 'Active positions exist' 
        };
        
    } catch (error) {
        console.error('❌ Error in position & order check:', error.message);
        return { 
            allowMainOrders: false, 
            positionsFound: false, 
            openOrdersFound: false,
            autoTradingActive: autoTradingActive, 
            error: error.message, 
            reason: 'API Error' 
        };
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

// Helper function to calculate market impact for derived funds-based order amount
function calculateMarketImpact(orderBookDepth, ltp, scanType, orderAmount = null) {
    const effectiveOrderAmount = Number(orderAmount) > 0 ? Number(orderAmount) : Number(globalUsableFunds || 0);
    if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
        console.log(`🎯 calculateMarketImpact called: LTP=${ltp}, scanType='${scanType}', amount=${effectiveOrderAmount}`);
    }
    
    if (!orderBookDepth || !ltp || !scanType) {
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`❌ Missing data for market impact: depth=${!!orderBookDepth}, ltp=${ltp}, scanType='${scanType}'`);
        }
        return {
            quantity: 0,
            impactedLevels: 0,
            avgExecutionPrice: ltp,
            totalSlippage: 0
        };
    }

    const quantity = Math.floor(effectiveOrderAmount / ltp);
    if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
        console.log(`💰 Market Impact Analysis: Amount=${effectiveOrderAmount.toLocaleString('en-IN')}, LTP=${ltp}, Quantity=${quantity.toLocaleString('en-IN')}, Type=${scanType}`);
    }

    if (scanType === 'BUY_SCAN') {
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`📈 Processing BUY_SCAN - consuming ask levels`);
        }
        // For buy orders, consume ask levels (sell side)
        const askLevels = orderBookDepth.sell || [];
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`📊 Ask levels available: ${askLevels.length}`);
        }
        
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
            
            if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
                console.log(`📊 BUY Level ${i + 1}: Price=${level.price}, AvailableQty=${availableQty}, ConsumedQty=${consumedQty}, RemainingQty=${remainingQty}`);
            }
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
        
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`✅ BUY Impact Result:`, result);
        }
        return result;
        
    } else if (scanType === 'SELL_SCAN') {
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`📉 Processing SELL_SCAN - consuming bid levels`);
        }
        // For sell orders, consume bid levels (buy side)
        const bidLevels = orderBookDepth.buy || [];
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`📊 Bid levels available: ${bidLevels.length}`);
        }
        
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
            
            if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
                console.log(`📊 SELL Level ${i + 1}: Price=${level.price}, AvailableQty=${availableQty}, ConsumedQty=${consumedQty}, RemainingQty=${remainingQty}`);
            }
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
        
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`✅ SELL Impact Result:`, result);
        }
        return result;
    } else {
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`⚠️ Unknown scanType: '${scanType}' - no masking applied`);
        }
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
    if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
        console.log('🔧 enhanceDepthTo20Levels called:', {
            hasExistingDepth: !!existingDepth,
            existingBuyLevels: existingDepth?.buy?.length || 0,
            existingSellLevels: existingDepth?.sell?.length || 0,
            lastPrice: lastPrice,
            scanType: scanType,
            rawDepthAnalysis: {
                buyDepthComplete: existingDepth?.buy || [],
                sellDepthComplete: existingDepth?.sell || [],
                potentiallyMissing20Levels: (existingDepth?.buy?.length || 0) < 20
            }
        });
    }

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
            if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
                console.log('🎯 BACKEND: MASKING ACTIVE - Calculating market impact for live tracker');
            }
            const impact = calculateMarketImpact(result, lastPrice, 'BUY_SCAN', globalUsableFunds); // Use BUY_SCAN for live display
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
            
            if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
                console.log(`💰 BACKEND: Live Tracker Masking Applied: ${levelsToMask} levels on both sides`);
                console.log(`🎯 BACKEND: MASKING COMPLETE - Market impact data added to depth response`);
            }
        }

        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`🔧 Created new 20-level depth with market impact (no existing data)`);
            console.log(`📊 Final masking summary - Masked BID levels: ${result.buy.filter(o => o.masked).length}, Masked ASK levels: ${result.sell.filter(o => o.masked).length}`);
            console.log('🔧 enhanceDepthTo20Levels NO-EXISTING-DEPTH RESULT:', {
                buyLevelsCreated: result.buy?.length || 0,
                sellLevelsCreated: result.sell?.length || 0,
                level20Buy: result.buy?.[19] || 'MISSING LEVEL 20',
                level20Sell: result.sell?.[19] || 'MISSING LEVEL 20'
            });
        }
        
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
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log('🎯 BACKEND: EXISTING DEPTH MASKING - Calculating market impact for existing depth');
        }
        const impact = calculateMarketImpact(result, lastPrice, 'BUY_SCAN', globalUsableFunds);
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
        
        if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
            console.log(`💰 BACKEND: Live Tracker Masking Applied to existing depth: ${levelsToMask} levels`);
            console.log(`🎯 BACKEND: EXISTING DEPTH MASKING COMPLETE`);
        }
    }
    
    // FINAL VERIFICATION: Log what we're returning
    if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
        console.log('🔧 enhanceDepthTo20Levels RESULT:', {
            buyLevelsReturned: result.buy?.length || 0,
            sellLevelsReturned: result.sell?.length || 0,
            firstBuyLevel: result.buy?.[0] || 'N/A',
            lastBuyLevel: result.buy?.[result.buy?.length - 1] || 'N/A',
            level20Buy: result.buy?.[19] || 'MISSING LEVEL 20',
            level20Sell: result.sell?.[19] || 'MISSING LEVEL 20'
        });
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
                    orderAmount: globalUsableFunds
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
                    targetProfitBaseline: TARGET_PROFIT_BASE_AMOUNT,
                    targetProfitPercent: TARGET_PROFIT_PERCENT,
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
        
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(token);
        
        const profile = await kite.getProfile();
        
        // Initialize KiteTicker for signal stock subscriptions (without RELIANCE)
        await initializeKiteTicker(token);
        
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
let executedSignals = new Set(); // track executed signals to prevent repeated tick-based orders
let lastSignalExecutionTime = {}; // track last execution time per signal to prevent spam

// Helper function to create signal key
function createSignalKey(symbol, signalType) {
    return `${symbol}_${signalType}`;
}

// Helper function to check if signal was recently executed
function wasSignalRecentlyExecuted(symbol, signalType, cooldownMinutes = 5) {
    const signalKey = createSignalKey(symbol, signalType);
    const lastExecution = lastSignalExecutionTime[signalKey];
    
    if (!lastExecution) return false;
    
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const timeSinceExecution = Date.now() - lastExecution;
    
    return timeSinceExecution < cooldownMs;
}

// Helper function to mark signal as executed
function markSignalAsExecuted(symbol, signalType) {
    const signalKey = createSignalKey(symbol, signalType);
    executedSignals.add(signalKey);
    lastSignalExecutionTime[signalKey] = Date.now();
    console.log(`🔒 Signal marked as executed: ${signalKey} at ${new Date().toLocaleTimeString()}`);
}
let lastScannerUpdate = 0; // timestamp of last scanner update

// Initialize KiteTicker for signal stock subscriptions (without RELIANCE dependency)
async function initializeKiteTicker(access_token) {
    try {
        if (!access_token) {
            console.log('⚠️ No valid access token for KiteTicker initialization');
            return;
        }

        if (!globalTicker) {
            console.log('🚀 Initializing global KiteTicker for signal stocks...');
            globalTicker = new KiteTicker({
                api_key: 'r1a7qo9w30bxsfax',
                access_token: access_token,
                reconnect: true,
                max_retry: 10,
                max_delay: 60000
            });
            
            console.log('📊 KITETICKER AVAILABLE MODES:', {
                modeLTP: globalTicker.modeLTP,
                modeQuote: globalTicker.modeQuote, 
                modeFull: globalTicker.modeFull,
                availableMethods: Object.getOwnPropertyNames(globalTicker).filter(name => typeof globalTicker[name] === 'function')
            });
            
            setupTickerEventHandlers();
            globalTicker.connect();
            console.log('✅ KiteTicker initialized and ready for signal stock subscriptions');
        } else {
            console.log('✅ KiteTicker already initialized');
        }
    } catch (error) {
        console.error('❌ Error initializing KiteTicker:', error);
    }
}

// Initialize RELIANCE subscription (called when first API endpoint is accessed with valid token)
// REMOVED: initializeRelianceSubscription function
// NO DEFAULT SUBSCRIPTIONS: All stocks are only subscribed when found in scan results

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
// POSITIONS AND ORDERS FUNCTIONS - RESTORED
async function getActivePositions(accessToken) {
    try {
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

// Get open orders from Zerodha
async function getOpenOrders(accessToken) {
    try {
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        const orders = await kite.getOrders();
        // Filter for OPEN, TRIGGER PENDING, or MODIFY_PENDING orders
        const openOrders = orders?.filter(order => 
            order.status === 'OPEN' || 
            order.status === 'TRIGGER PENDING' || 
            order.status === 'MODIFY_PENDING'
        ) || [];
        
        console.log(`📋 Found ${openOrders.length} open orders`);
        return openOrders;
    } catch (error) {
        console.error('❌ Error fetching open orders:', error.message);
        return [];
    }
}

// Single precheck snapshot: call positions + open-orders + funds once per trigger.
async function getTradePrecheckSnapshot(accessToken, options = {}) {
    const { refreshFunds = false, context = 'generic' } = options;

    if (!accessToken || accessToken === 'demo_token') {
        return {
            activePositions: [],
            openOrders: [],
            globalFunds: getGlobalFunds(),
            fundsUpdated: false
        };
    }

    let fundsUpdated = false;
    if (refreshFunds) {
        fundsUpdated = await updateGlobalFunds(accessToken);
    }

    const [activePositions, openOrders] = await Promise.all([
        getActivePositions(accessToken),
        getOpenOrders(accessToken)
    ]);

    const snapshot = {
        activePositions: Array.isArray(activePositions) ? activePositions : [],
        openOrders: Array.isArray(openOrders) ? openOrders : [],
        globalFunds: getGlobalFunds(),
        fundsUpdated
    };

    console.log(`📌 Precheck snapshot (${context}): positions=${snapshot.activePositions.length}, openOrders=${snapshot.openOrders.length}, usable=₹${Number(snapshot.globalFunds.usableFunds || 0).toLocaleString('en-IN')}`);
    return snapshot;
}



// Helper functions to call SEPARATE order routes
async function callSeparateBuyOrderRoute(accessToken, symbol, ltp, requestedQuantity = null) {
    try {
        const productType = 'MIS'; // Force MIS for all orders
        const roundedPrice = roundToTickSize(ltp, ltp);
        
        // Use global funds instead of calculating locally
        const globalFunds = getGlobalFunds();
        const usableFunds = globalFunds.usableFunds;
        
        // Check minimum leveraged amount requirement (₹50,000 - reduced from 400,000)
        const minLeveragedAmount = 50000;
        if (globalFunds.leverageFunds < minLeveragedAmount) {
            return {
                success: false,
                error: `Insufficient leveraged funds. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`,
                availableFunds: globalFunds.availableFunds,
                leverageFunds: globalFunds.leverageFunds,
                minRequired: minLeveragedAmount,
                order_category: 'BUY',
                symbol: symbol
            };
        }
        
        const maxQuantity = Math.floor(usableFunds / ltp);
        const finalQuantity = requestedQuantity ? Math.min(requestedQuantity, maxQuantity) : maxQuantity;
        
        // CONSOLE LOG ALL CALCULATIONS
        console.log('\n🔵 BUY ORDER QUANTITY CALCULATION (GLOBAL FUNDS):');
        console.log('💰 Global Available Funds:', '₹' + globalFunds.availableFunds.toLocaleString('en-IN'));
        console.log('⚡ Global Leveraged Funds (5x):', '₹' + globalFunds.leverageFunds.toLocaleString('en-IN'));
        console.log('✅ Leveraged Amount Check:', `₹${globalFunds.leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        console.log('🔒 Global Usable Funds (95%):', '₹' + usableFunds.toLocaleString('en-IN'));
        console.log('💵 Price per Share:', '₹' + ltp);
        console.log('🔢 Max Possible Quantity:', maxQuantity);
        console.log('📊 Final Quantity:', finalQuantity);
        console.log('💸 Total Investment:', '₹' + (finalQuantity * ltp).toLocaleString('en-IN'));
        
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'BUY',
            quantity: finalQuantity,
            product: productType,
            order_type: 'MARKET',
            market_protection: -1,
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
        
        // Use global funds instead of calculating locally
        const globalFunds = getGlobalFunds();
        const usableFunds = globalFunds.usableFunds;
        
        // Check minimum leveraged amount requirement (₹50,000 - reduced from 400,000)
        const minLeveragedAmount = 50000;
        if (globalFunds.leverageFunds < minLeveragedAmount) {
            console.log(`❌ Insufficient leveraged funds for SELL: ₹${globalFunds.leverageFunds.toLocaleString('en-IN')} < ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
            return {
                success: false,
                error: `Insufficient leveraged funds for short selling. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`,
                availableFunds: globalFunds.availableFunds,
                leverageFunds: globalFunds.leverageFunds,
                minRequired: minLeveragedAmount,
                order_category: 'SELL',
                symbol: symbol
            };
        }
        
        const maxQuantity = Math.floor(usableFunds / ltp);
        const finalQuantity = requestedQuantity ? Math.min(requestedQuantity, maxQuantity) : maxQuantity;
        
        // CONSOLE LOG ALL CALCULATIONS
        console.log('\n🔴 SELL ORDER QUANTITY CALCULATION (GLOBAL FUNDS):');
        console.log('💰 Global Available Funds:', '₹' + globalFunds.availableFunds.toLocaleString('en-IN'));
        console.log('⚡ Global Leveraged Funds (5x):', '₹' + globalFunds.leverageFunds.toLocaleString('en-IN'));
        console.log('✅ Leveraged Amount Check:', `₹${globalFunds.leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        console.log('🔒 Global Usable Funds (95%):', '₹' + usableFunds.toLocaleString('en-IN'));
        console.log('💵 Price per Share:', '₹' + ltp);
        console.log('🔢 Max Possible Quantity:', maxQuantity);
        console.log('📊 Final Quantity:', finalQuantity);
        console.log('💸 Total Investment:', '₹' + (finalQuantity * ltp).toLocaleString('en-IN'));
        
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(accessToken);
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'SELL',
            quantity: finalQuantity,
            price: roundedPrice,
            product: productType,
            order_type: 'MARKET',
            market_protection: -1,
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
        
        if (ENABLE_VERBOSE_SCAN_LOGS) {
            console.log('🔍 DEBUG - buyStocks length:', buyStocks.length);
            console.log('🔍 DEBUG - sellStocks length:', sellStocks.length);
            console.log('🔍 DEBUG - First buyStock:', JSON.stringify(buyStocks[0], null, 2));
        }
        
        // Process buy stocks
        buyStocks.forEach((stock, index) => {
            if (ENABLE_VERBOSE_SCAN_LOGS) {
                console.log(`🔍 DEBUG - Processing buyStock[${index}]:`, JSON.stringify(stock, null, 2));
            }
            
            // Extract symbol from TradingView format (NSE:SYMBOL)
            let symbol = null;
            let token = null;
            
            if (stock.s && typeof stock.s === 'string' && stock.s.includes(':')) {
                symbol = stock.s.split(':')[1]; // Extract SYMBOL from "NSE:SYMBOL"
                if (ENABLE_VERBOSE_SCAN_LOGS) {
                    console.log(`🔍 Extracted symbol: "${symbol}" from "${stock.s}"`);
                }
                
                if (symbol && symbolMappings.symbolMappings[symbol]) {
                    token = symbolMappings.symbolMappings[symbol];
                    if (ENABLE_VERBOSE_SCAN_LOGS) {
                        console.log(`✅ Found token for ${symbol}: ${token}`);
                    }
                } else {
                    if (ENABLE_VERBOSE_SCAN_LOGS) {
                        console.log(`❌ No token mapping found for symbol: "${symbol}"`);
                        console.log(`🔍 Available mappings sample:`, Object.keys(symbolMappings.symbolMappings).slice(0, 10));
                    }
                }
            } else {
                if (ENABLE_VERBOSE_SCAN_LOGS) {
                    console.log(`❌ Invalid stock.s format:`, stock.s);
                }
            }
            
            if (token && symbol) {
                newTokens.add(parseInt(token));
                scanTypeTracker.set(parseInt(token), 'BUY_SCAN');
                console.log(`🟢 BUY ADDED: ${symbol} (${token}) -> BUY_SCAN tracked`);
            } else {
                if (ENABLE_VERBOSE_SCAN_LOGS) {
                    console.log(`❌ SKIPPED - No valid token for buyStock[${index}]`);
                }
            }
        });
        
        // Process sell stocks  
        sellStocks.forEach((stock, index) => {
            if (ENABLE_VERBOSE_SCAN_LOGS) {
                console.log(`🔍 DEBUG - Processing sellStock[${index}]:`, JSON.stringify(stock, null, 2));
            }
            
            // Extract symbol from TradingView format (NSE:SYMBOL)
            let symbol = null;
            let token = null;
            
            if (stock.s && typeof stock.s === 'string' && stock.s.includes(':')) {
                symbol = stock.s.split(':')[1]; // Extract SYMBOL from "NSE:SYMBOL"  
                if (ENABLE_VERBOSE_SCAN_LOGS) {
                    console.log(`🔍 Extracted symbol: "${symbol}" from "${stock.s}"`);
                }
                
                if (symbol && symbolMappings.symbolMappings[symbol]) {
                    token = symbolMappings.symbolMappings[symbol];
                    if (ENABLE_VERBOSE_SCAN_LOGS) {
                        console.log(`✅ Found token for ${symbol}: ${token}`);
                    }
                } else {
                    if (ENABLE_VERBOSE_SCAN_LOGS) {
                        console.log(`❌ No token mapping found for symbol: "${symbol}"`);
                    }
                }
            } else {
                if (ENABLE_VERBOSE_SCAN_LOGS) {
                    console.log(`❌ Invalid stock.s format:`, stock.s);
                }
            }
            
            if (token && symbol) {
                newTokens.add(parseInt(token));
                scanTypeTracker.set(parseInt(token), 'SELL_SCAN');
                console.log(`🔴 SELL ADDED: ${symbol} (${token}) -> SELL_SCAN tracked`);
            } else {
                if (ENABLE_VERBOSE_SCAN_LOGS) {
                    console.log(`❌ SKIPPED - No valid token for sellStock[${index}]`);
                }
            }
        });

        console.log(`📈 Total unique tokens to subscribe: ${newTokens.size}`);
        console.log(`🔍 Current subscriptions: ${currentlySubscribed.size}`);
        console.log('🔍 Current subscribed tokens:', Array.from(currentlySubscribed));
        console.log('🔍 New tokens from scan:', Array.from(newTokens));
        
        // Always initialize ticker if needed - required for dynamic subscriptions
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
                console.log('🔧 Ticker initialized - ready for dynamic subscriptions');
            }
        } else if (globalTicker) {
            // Ticker exists, manage subscriptions (even if no new tokens)
            const tokensToUnsubscribe = [];
            const tokensToSubscribe = [];
            
            console.log(`🔧 Managing subscriptions - Current: ${currentlySubscribed.size}, New: ${newTokens.size}`);
            
            // ✅ AUTO-UNSUBSCRIBE ENABLED: Remove stocks no longer in scan conditions
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
            
            console.log(`📊 Subscription changes: ${tokensToUnsubscribe.length} to unsubscribe, ${tokensToSubscribe.length} to subscribe`);
            
            // ✅ AUTO-UNSUBSCRIBE ENABLED: Clean up old subscriptions
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
            
            // ✅ NO DEFAULT SUBSCRIPTIONS: If no scan results, keep subscriptions empty
            if (newTokens.size === 0 && currentlySubscribed.size === 0) {
                console.log('📭 No scan results and no active subscriptions - keeping empty (no fallback)');
            } else if (newTokens.size === 0 && currentlySubscribed.size > 0) {
                // ✅ AUTO-UNSUBSCRIBE: No scan results means unsubscribe from all
                console.log(`📊 No scan results - unsubscribing from all ${currentlySubscribed.size} existing subscriptions`);
                try {
                    const allSubscribedTokens = Array.from(currentlySubscribed);
                    globalTicker.unsubscribe(allSubscribedTokens);
                    
                    // Clear all tracking
                    allSubscribedTokens.forEach(token => {
                        currentlySubscribed.delete(token);
                        scanTypeTracker.delete(token);
                        console.log(`❌ Unsubscribed (no scan results): ${token}`);
                    });
                    
                    broadcastSubscriptionUpdate();
                } catch (error) {
                    console.error('❌ Error unsubscribing all tokens:', error);
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
    
    globalTicker.on('ticks', async (ticks) => {
        if (!Array.isArray(ticks) || ticks.length === 0) {
            return;
        }

        const now = Date.now();
        if (tickHandlerBusy) {
            droppedTickBatches++;
            return;
        }

        if (now - lastTickHandledAt < TICK_PROCESS_INTERVAL_MS) {
            droppedTickBatches++;
            return;
        }

        tickHandlerBusy = true;
        lastTickHandledAt = now;

        try {
            if (ENABLE_VERBOSE_TICK_LOGS) {
                console.log(`📊 ✅ RECEIVED ${ticks.length} TICK UPDATES (dropped=${droppedTickBatches})`);
            }
        
        // Log first tick for debugging
        if (ENABLE_VERBOSE_TICK_LOGS && ticks.length > 0) {
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
                    if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
                        console.log(`🎯 MARKET IMPACT ANALYSIS: ${symbol} @ ₹${ltp} - ScanType: ${scanType}`);
                    }
                    
                    // Calculate market impact for both BUY and SELL scenarios using derived usable funds
                    const buyImpact = calculateMarketImpact(tick.depth, ltp, 'BUY_SCAN', globalUsableFunds);
                    const sellImpact = calculateMarketImpact(tick.depth, ltp, 'SELL_SCAN', globalUsableFunds);
                    
                    // ====================================================================
                    // POSITION-FIRST EXECUTION STRATEGY:
                    // 1. Check positions first - if exist, place missing target orders
                    // 2. Only place new market orders when NO active positions exist
                    // 3. Target orders = centralized leverage-based profit target for existing positions
                    // ==================================================================== 
                    
                    // Execution criteria (both BUY and SELL): impactedLevels must be <= 2 and slippage <= 0.08%
                    const maxLevels = 2;
                    const maxSlippage = 0.08; // 0.08%

                    // Early gate: only run expensive position/open-order checks when a market order is
                    // actually close to execution eligibility by impact + scan-type + duplicate guards.
                    if (!autoTradingActive) {
                        return;
                    }

                    const potentialBuyByImpact =
                        scanType === 'BUY_SCAN' &&
                        buyImpact.impactedLevels <= maxLevels &&
                        Math.abs(buyImpact.totalSlippage || 0) <= maxSlippage &&
                        !processedOrders.has(`${symbol}_MARKET_BUY`);

                    const potentialSellByImpact =
                        scanType === 'SELL_SCAN' &&
                        sellImpact.impactedLevels <= maxLevels &&
                        Math.abs(sellImpact.totalSlippage || 0) <= maxSlippage &&
                        !processedOrders.has(`${symbol}_MARKET_SELL`);

                    if (!potentialBuyByImpact && !potentialSellByImpact) {
                        return;
                    }
                    
                    if (ENABLE_VERBOSE_MARKET_IMPACT_LOGS) {
                        console.log(`📊 ${symbol} Impact Analysis:`);
                        console.log(`   BUY: Levels=${buyImpact.impactedLevels}, Slippage=${buyImpact.totalSlippage?.toFixed(4)}%`);
                        console.log(`   SELL: Levels=${sellImpact.impactedLevels}, Slippage=${Math.abs(sellImpact.totalSlippage || 0).toFixed(4)}%`);
                    }
                    
                    let orderExecuted = false;
                    const accessToken = global.lastAccessToken || 'demo_token';
                    
                    // ====================================================================
                    // POSITION-FIRST EXECUTION LOGIC
                    // ====================================================================
                    // STEP 1: Always check positions first before any order placement
                    console.log(`🔍 STEP 1: Checking existing positions for ${symbol}...`);
                    
                    if (accessToken !== 'demo_token') {
                        const precheckKey = `${symbol}_${scanType}`;
                        const now = Date.now();
                        const lastRunAt = orderPrecheckLastRunAt.get(precheckKey) || 0;

                        if (orderPrecheckInFlight.has(precheckKey)) {
                            console.log(`⏸️ Skipping precheck for ${precheckKey} - precheck already in flight`);
                            return;
                        }

                        if (now - lastRunAt < ORDER_PRECHECK_COOLDOWN_MS) {
                            const remainingMs = ORDER_PRECHECK_COOLDOWN_MS - (now - lastRunAt);
                            console.log(`⏸️ Skipping precheck for ${precheckKey} - cooldown ${Math.ceil(remainingMs / 1000)}s remaining`);
                            return;
                        }

                        orderPrecheckInFlight.add(precheckKey);
                        orderPrecheckLastRunAt.set(precheckKey, now);

                        try {
                            const orderPrecheck = await getTradePrecheckSnapshot(accessToken, {
                                refreshFunds: true,
                                context: `tick-order-attempt-${symbol}`
                            });
                            const currentPositions = orderPrecheck.activePositions;
                            const openOrders = orderPrecheck.openOrders;
                            const hasAnyPositions = currentPositions.some(pos => Math.abs(pos.quantity) > 0);
                            const hasOpenOrders = Array.isArray(openOrders) && openOrders.length > 0;
                            
                            if (hasAnyPositions) {
                                console.log(`📊 POSITIONS FOUND: Processing existing positions for target orders`);
                                
                                // Check each position for missing target orders
                                for (const position of currentPositions) {
                                    if (Math.abs(position.quantity) > 0) {
                                        const posSymbol = position.tradingsymbol;
                                        const quantity = parseInt(position.quantity);
                                        const avgPrice = parseFloat(position.average_price || position.price);
                                        const side = quantity > 0 ? 'BUY' : 'SELL';
                                        const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
                                        
                                        console.log(`📊 Found position: ${posSymbol} Qty=${quantity}, AvgPrice=₹${avgPrice}, Side=${side}`);

                                        // Broker-side guard: if a target order already exists, never place another one.
                                        const existingTargetOrder = openOrders.find(order =>
                                            order.tradingsymbol === posSymbol &&
                                            (order.status === 'OPEN' || order.status === 'TRIGGER PENDING') &&
                                            (
                                                // Preferred match: tagged target order
                                                String(order.tag || '').startsWith('TGT_') ||
                                                // Fallback match: opposite-side order for same position quantity
                                                (
                                                    order.transaction_type === targetSide &&
                                                    Math.abs(parseInt(order.quantity || 0)) === Math.abs(quantity)
                                                )
                                            )
                                        );

                                        if (existingTargetOrder) {
                                            // Keep local maps synchronized so later ticks also skip placement.
                                            if (!activePositions.has(posSymbol)) {
                                                activePositions.set(posSymbol, {
                                                    quantity: quantity,
                                                    avgPrice: avgPrice,
                                                    side: side,
                                                    entryTime: new Date().toISOString(),
                                                    targetOrderId: existingTargetOrder.order_id
                                                });
                                            }

                                            if (!targetOrders.has(posSymbol)) {
                                                targetOrders.set(posSymbol, {
                                                    orderId: existingTargetOrder.order_id,
                                                    targetPrice: parseFloat(existingTargetOrder.price || 0),
                                                    quantity: Math.abs(parseInt(existingTargetOrder.quantity || quantity)),
                                                    side: existingTargetOrder.transaction_type,
                                                    placedAt: existingTargetOrder.order_timestamp || new Date().toISOString()
                                                });
                                            }

                                            console.log(`✅ Existing target order found for ${posSymbol}: ${existingTargetOrder.order_id} - skipping new target placement`);
                                            continue;
                                        }
                                        
                                        const trackedTarget = targetOrders.get(posSymbol);
                                        const trackedTargetStillOpen = trackedTarget && openOrders.some(order =>
                                            order.order_id === trackedTarget.orderId &&
                                            (order.status === 'OPEN' || order.status === 'TRIGGER PENDING' || order.status === 'MODIFY_PENDING')
                                        );

                                        // If local map says target exists but broker says otherwise, clear stale map entry.
                                        if (trackedTarget && !trackedTargetStillOpen) {
                                            targetOrders.delete(posSymbol);
                                            console.log(`♻️ Cleared stale target-order map entry for ${posSymbol}: ${trackedTarget.orderId}`);
                                        }

                                        // Place target order whenever broker has no live target and local map has no active target.
                                        if (!existingTargetOrder && !targetOrders.has(posSymbol)) {
                                            console.log(`🎯 NO TARGET ORDER EXISTS for ${posSymbol} - Placing target order`);
                                            
                                            // Calculate target price using centralized leveraged-funds profit basis
                                            const targetPrice = calculateTargetPrice(avgPrice, quantity, side);
                                            
                                            console.log(`🎯 Calculated target price: ₹${targetPrice.toFixed(2)} using centralized leverage-based profit target`);
                                            
                                            // Store active position
                                            activePositions.set(posSymbol, {
                                                quantity: quantity,
                                                avgPrice: avgPrice,
                                                side: side,
                                                entryTime: new Date().toISOString(),
                                                targetOrderId: null
                                            });
                                            
                                            // Place target order
                                            const targetResult = await placeTargetOrder(accessToken, posSymbol, quantity, targetPrice, targetSide);
                                            
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
                                                            targetProfit: calculateProfitTargetFromInvestment(avgPrice * Math.abs(quantity)).targetProfitAmount,
                                                            timestamp: new Date().toISOString()
                                                        }
                                                    });
                                                }
                                            } else {
                                                console.log(`❌ Failed to place target order for ${posSymbol}`);
                                            }
                                        } else {
                                            console.log(`✅ Target order already exists/tracked for ${posSymbol} - Skipping`);
                                        }
                                    }
                                }
                                
                                // IMPORTANT: Don't place any new market orders when positions exist
                                console.log(`🚫 BLOCKING NEW MARKET ORDERS: Active positions exist`);
                                return;
                                
                            } else if (hasOpenOrders) {
                                // No active positions, but there are pending/open orders.
                                // Do not place new market orders until these are resolved.
                                console.log(`🚫 BLOCKING NEW MARKET ORDERS: ${openOrders.length} open order(s) exist`);
                                return;

                            } else {
                                console.log(`✅ NO ACTIVE POSITIONS: Proceeding with market order logic for ${symbol}`);
                            }
                            
                        } catch (error) {
                            console.error(`❌ Error checking positions: ${error.message}`);
                            // In case of error, proceed with caution - don't place orders
                            return;
                        } finally {
                            orderPrecheckInFlight.delete(precheckKey);
                        }
                    } else {
                        console.log(`📝 DEMO MODE: Skipping position check, proceeding with demo logic`);
                    }
                    
                    // ====================================================================
                    // STEP 2: ENHANCED MARKET ORDER EXECUTION (Only when no active positions exist)
                    // ====================================================================
                    
                    // ✅ FIRST: Check if auto trading is enabled
                    if (!autoTradingActive) {
                        console.log(`🚫 AUTO TRADING DISABLED: Skipping execution for ${symbol}`);
                        return;
                    }
                    
                    console.log(`✅ AUTO TRADING ENABLED: Proceeding with enhanced execution criteria for ${symbol}`);
                    
                    // ====================================================================
                    // ENHANCED LIVE LTP VERIFICATION: Enhanced scanner conditions with live tick data
                    // ====================================================================
                    const buyCandidate = buyCandidates.get(token);
                    const sellCandidate = sellCandidates.get(token);
                    let liveBuyConditionsValid = false;
                    let liveSellConditionsValid = false;
                    
                    // 🔵 ENHANCED BUY CONDITIONS: ltp < ema3(15min) AND ltp > ema5(5min)
                    if (buyCandidate && scanType === 'BUY_SCAN') {
                        const liveLtpBelowEma3_15 = ltp < buyCandidate.ema3_15;  // LTP < EMA3 (15min)
                        const liveLtpAboveEma5_5 = ltp > buyCandidate.ema5_5;   // LTP > EMA5 (5min)
                        liveBuyConditionsValid = liveLtpBelowEma3_15 && liveLtpAboveEma5_5;
                        
                        console.log(`🔄 ENHANCED BUY VERIFICATION for ${symbol}:`);
                        console.log(`   Live LTP: ₹${ltp}`);
                        console.log(`   EMA3(15min): ₹${buyCandidate.ema3_15} | LTP < EMA3(15min): ${liveLtpBelowEma3_15}`);
                        console.log(`   EMA5(5min): ₹${buyCandidate.ema5_5} | LTP > EMA5(5min): ${liveLtpAboveEma5_5}`);
                        console.log(`   ✅ Enhanced BUY conditions: ${liveBuyConditionsValid}`);
                    }
                    
                    // 🔴 ENHANCED SELL CONDITIONS: ltp < ema5(5min) AND ltp > ema3(15min)
                    if (sellCandidate && scanType === 'SELL_SCAN') {
                        const liveLtpBelowEma5_5 = ltp < sellCandidate.ema5_5;   // LTP < EMA5 (5min)
                        const liveLtpAboveEma3_15 = ltp > sellCandidate.ema3_15; // LTP > EMA3 (15min)
                        liveSellConditionsValid = liveLtpBelowEma5_5 && liveLtpAboveEma3_15;
                        
                        console.log(`🔄 ENHANCED SELL VERIFICATION for ${symbol}:`);
                        console.log(`   Live LTP: ₹${ltp}`);
                        console.log(`   EMA5(5min): ₹${sellCandidate.ema5_5} | LTP < EMA5(5min): ${liveLtpBelowEma5_5}`);
                        console.log(`   EMA3(15min): ₹${sellCandidate.ema3_15} | LTP > EMA3(15min): ${liveLtpAboveEma3_15}`);
                        console.log(`   ✅ Enhanced SELL conditions: ${liveSellConditionsValid}`);
                    }
                    
                    // 📊 ENHANCED EXECUTION CRITERIA: levels <= 2 AND slippage <= 0.08%
                    // maxLevels and maxSlippage already declared above
                    
                    // 🔵 CHECK ENHANCED BUY EXECUTION CRITERIA
                    if (buyImpact.impactedLevels <= maxLevels &&
                        Math.abs(buyImpact.totalSlippage || 0) <= maxSlippage &&
                        !processedOrders.has(`${symbol}_MARKET_BUY`) &&
                        (scanType === 'BUY_SCAN' ? liveBuyConditionsValid : false)) { // Enhanced BUY verification required
                        
                        console.log(`🚀 ✅ ENHANCED BUY EXECUTION CRITERIA MET: ${symbol}`);
                        console.log(`   ✅ Auto Trading: ${autoTradingActive}`);
                        console.log(`   ✅ LTP < EMA3(15min): ${ltp} < ${buyCandidate.ema3_15}`);
                        console.log(`   ✅ LTP > EMA5(5min): ${ltp} > ${buyCandidate.ema5_5}`);
                        console.log(`   ✅ Levels: ${buyImpact.impactedLevels} <= ${maxLevels}`);
                        console.log(`   ✅ Slippage: ${Math.abs(buyImpact.totalSlippage || 0).toFixed(4)}% <= ${maxSlippage}%`);
                        console.log(`   💰 Live LTP: ₹${ltp}`);
                        
                        // Mark as processed to avoid duplicates
                        processedOrders.add(`${symbol}_MARKET_BUY`);
                        
                        // 🎯 EXECUTE BUY ORDER: Enhanced criteria verified
                        if (accessToken !== 'demo_token') {
                            try {
                                console.log(`🚀 EXECUTING ENHANCED BUY ORDER: ${symbol} @ ₹${ltp}`);
                                const buyResult = await callSeparateBuyOrderRoute(accessToken, symbol, ltp);
                                
                                if (buyResult.success) {
                                    console.log(`✅ ENHANCED BUY ORDER SUCCESS: ${buyResult.order_id} for ${symbol}`);
                                    orderExecuted = true;
                                    
                                    // Process position after order placement
                                    setTimeout(() => {
                                        processNewPosition(accessToken, symbol, 'BUY');
                                    }, 3000);
                                    
                                    // Broadcast order execution
                                    if (global.broadcastLiveData) {
                                        global.broadcastLiveData({
                                            type: 'enhanced_buy_order_executed',
                                            symbol: symbol,
                                            ltp: ltp,
                                            order_id: buyResult.order_id,
                                            criteria: {
                                                autoTrading: autoTradingActive,
                                                ltpBelowEma3_15min: ltp < buyCandidate.ema3_15,
                                                ltpAboveEma5_5min: ltp > buyCandidate.ema5_5,
                                                levelsImpacted: buyImpact.impactedLevels,
                                                slippage: Math.abs(buyImpact.totalSlippage || 0).toFixed(4) + '%'
                                            },
                                            timestamp: new Date().toISOString()
                                        });
                                    }
                                } else {
                                    console.log(`❌ Enhanced BUY order failed: ${buyResult.error}`);
                                }
                            } catch (error) {
                                console.error(`❌ Error executing enhanced BUY order for ${symbol}:`, error.message);
                            }
                        } else {
                            console.log(`📋 DEMO MODE: Enhanced BUY criteria met for ${symbol} @ ₹${ltp}`);
                        }
                    }
                    
                    // 🔴 CHECK SELL EXECUTION CRITERIA (existing logic with enhanced levels)
                    if (!orderExecuted && 
                        sellImpact.impactedLevels <= maxLevels &&
                        Math.abs(sellImpact.totalSlippage || 0) <= maxSlippage &&
                        !processedOrders.has(`${symbol}_MARKET_SELL`) &&
                        (scanType === 'SELL_SCAN' ? liveSellConditionsValid : false)) {
                        
                        console.log(`🚀 ✅ ENHANCED SELL EXECUTION CRITERIA MET: ${symbol}`);
                        console.log(`   ✅ Auto Trading: ${autoTradingActive}`);
                        console.log(`   ✅ Levels: ${sellImpact.impactedLevels} <= ${maxLevels}`);
                        console.log(`   ✅ Slippage: ${Math.abs(sellImpact.totalSlippage || 0).toFixed(4)}% <= ${maxSlippage}%`);
                        console.log(`   💰 Live LTP: ₹${ltp}`);
                        
                        // Mark as processed to avoid duplicates
                        processedOrders.add(`${symbol}_MARKET_SELL`);
                        
                        // 🎯 EXECUTE SELL ORDER: Enhanced criteria verified
                        if (accessToken !== 'demo_token') {
                            try {
                                console.log(`🚀 EXECUTING ENHANCED SELL ORDER: ${symbol} @ ₹${ltp}`);
                                const sellResult = await callSeparateSellOrderRoute(accessToken, symbol, ltp);
                                
                                if (sellResult.success) {
                                    console.log(`✅ ENHANCED SELL ORDER SUCCESS: ${sellResult.order_id} for ${symbol}`);
                                    orderExecuted = true;
                                    
                                    // Process position after order placement
                                    setTimeout(() => {
                                        processNewPosition(accessToken, symbol, 'SELL');
                                    }, 3000);
                                    
                                    // Broadcast order execution
                                    if (global.broadcastLiveData) {
                                        global.broadcastLiveData({
                                            type: 'enhanced_sell_order_executed',
                                            symbol: symbol,
                                            ltp: ltp,
                                            order_id: sellResult.order_id,
                                            criteria: {
                                                autoTrading: autoTradingActive,
                                                levelsImpacted: sellImpact.impactedLevels,
                                                slippage: Math.abs(sellImpact.totalSlippage || 0).toFixed(4) + '%'
                                            },
                                            timestamp: new Date().toISOString()
                                        });
                                    }
                                } else {
                                    console.log(`❌ Enhanced SELL order failed: ${sellResult.error}`);
                                }
                            } catch (error) {
                                console.error(`❌ Error executing enhanced SELL order for ${symbol}:`, error.message);
                            }
                        } else {
                            console.log(`📋 DEMO MODE: Enhanced SELL criteria met for ${symbol} @ ₹${ltp}`);
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
                
                if (ENABLE_VERBOSE_TICK_LOGS) {
                    console.log(`📡 BROADCASTING FULL 20-LEVEL TICK DATA: ${symbol} @ ₹${tick.last_price}`);
                }
                
                // CAPTURE ORIGINAL UNTOUCHED DEPTH BEFORE ANY MODIFICATIONS
                const originalUntouchedDepth = tick.depth ? JSON.parse(JSON.stringify(tick.depth)) : { buy: [], sell: [] };
                
                // Enhance to 20 levels for ALL symbols (no masking, just depth extension)
                const fullDepth = enhanceDepthTo20Levels(tick.depth, tick.last_price, scanType, false);
                
                // LOG DEPTH LEVEL ANALYSIS
                if (ENABLE_VERBOSE_TICK_LOGS) {
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
                }
                
                const buyImpact = calculateMarketImpact(fullDepth, tick.last_price, 'BUY_SCAN', globalUsableFunds);
                const sellImpact = calculateMarketImpact(fullDepth, tick.last_price, 'SELL_SCAN', globalUsableFunds);
                
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
            if (ENABLE_TICK_BATCH_BROADCAST && ticks.length > 1) {
                const structuredTicks = ticks.map(tick => {
                    const symbol = getSymbolFromToken(tick.instrument_token.toString());
                    const change = tick.change || 0;
                    let regime = 'CHOP';
                    if (change > 2) regime = 'BULL';
                    else if (change < -2) regime = 'BEAR';
                    else if (Math.abs(change) > 1 && tick.volume < 50000) regime = 'TRAP';
                    
                    // Get scan type for this token
                    const scanType = scanTypeTracker.get(tick.instrument_token) || 'UNKNOWN';
                    
                    if (ENABLE_VERBOSE_TICK_LOGS) {
                        console.log(`📡 BATCH: FULL 20-LEVEL TICK DATA: ${symbol} @ ₹${tick.last_price}`);
                    }
                    
                    // CAPTURE ORIGINAL UNTOUCHED DEPTH BEFORE ANY MODIFICATIONS
                    const originalUntouchedDepth = tick.depth ? JSON.parse(JSON.stringify(tick.depth)) : { buy: [], sell: [] };
                    
                    // Enhance to 20 levels for ALL symbols (no masking, just depth extension)
                    const fullDepth = enhanceDepthTo20Levels(tick.depth, tick.last_price, scanType, false);
                    const buyImpact = calculateMarketImpact(fullDepth, tick.last_price, 'BUY_SCAN', globalUsableFunds);
                    const sellImpact = calculateMarketImpact(fullDepth, tick.last_price, 'SELL_SCAN', globalUsableFunds);
                    
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
        } finally {
            tickHandlerBusy = false;
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
        
        console.log(`✅ LOW PRICE SCAN ALLOWED: 15min candle minute ${candleMinute} (no blocking window)`);
        
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

        const effectiveAccessToken = (req.body.access_token && req.body.access_token !== 'demo_token')
            ? req.body.access_token
            : (global.lastAccessToken && global.lastAccessToken !== 'demo_token' ? global.lastAccessToken : null);
        console.log(`🔐 Scan precheck token source: ${req.body.access_token ? 'request' : (effectiveAccessToken ? 'stored' : 'none')}`);

        const startTime = Date.now();

        // Precheck once per scan route: positions + open orders + funds
        const scanPrecheck = await getTradePrecheckSnapshot(effectiveAccessToken || 'demo_token', {
            refreshFunds: true,
            context: 'low-price-scan'
        });
        const precheckActivePositions = (scanPrecheck.activePositions || []).filter(pos => Math.abs(Number(pos.quantity || 0)) > 0);
        const precheckOpenOrders = scanPrecheck.openOrders || [];
        const mainOrdersAllowedInScan = Boolean(autoTradingActive && global.autoTrade && precheckActivePositions.length === 0 && precheckOpenOrders.length === 0);
        console.log(`🛡️ Scan precheck gate: positions=${precheckActivePositions.length}, openOrders=${precheckOpenOrders.length}, mainOrdersAllowed=${mainOrdersAllowedInScan}`);

        if (!scanPrecheck.fundsUpdated) {
            console.log('⚠️ Failed to refresh global funds in scan precheck, proceeding with existing values');
        }

        const globalFunds = scanPrecheck.globalFunds;
        console.log(`💰 Using global funds: Available=₹${globalFunds.availableFunds.toLocaleString('en-IN')}, Leveraged=₹${globalFunds.leverageFunds.toLocaleString('en-IN')}, Usable=₹${globalFunds.usableFunds.toLocaleString('en-IN')}`);

        const stocksPayload = buildLowPriceScannerPayload();
        const stocksResult = await makeScannorCall(stocksPayload, 'low-price-stocks-scan', req.body);

        const duration = Date.now() - startTime;
        console.log(`⚡ Low price stocks scanner completed in ${duration}ms`);

        // Extract and transform data from TradingView response
        const allStocks = extractTradingViewStocks(stocksResult);

        console.log(`📊 Low Price Scanner Results: ${allStocks.length} stocks (≤₹4000)`);

        // 💰 Use global funds for quantity pre-calculation (already declared earlier)
        let fundsCalculationError = null;
        
        if (globalFunds.error) {
            console.log('⚠️ Global funds have error:', globalFunds.error);
            fundsCalculationError = globalFunds.error;
        }
        
        console.log(`💰 Using global funds for quantity calculation:`);
        console.log(`   - Available: ₹${globalFunds.availableFunds.toLocaleString('en-IN')}`);
        console.log(`   - Leveraged (5x): ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`);
        console.log(`   - Usable (95%): ₹${globalFunds.usableFunds.toLocaleString('en-IN')}`);
        console.log(`   - Last Updated: ${globalFunds.lastUpdated}`);
                
        // Enhanced scanner processing with pre-calculated quantities
        
        // Enrich all stocks with technical data
        const enrichedStocks = allStocks.map(enrichLowPriceStockData);
        const pureCrossoverStocks = [];
        const pureCrossdownStocks = [];
        const separateCrossoverStocks = [];
        const separateCrossdownStocks = [];

        console.log('ℹ️ Intersection checks disabled: using only buy/sell condition signals');

    
        // Classify stocks into buy/sell based on conditions
        const buyStocks = [];
        const sellStocks = [];
        
        // Clear previous candidates for fresh scan
        buyCandidates.clear();
        sellCandidates.clear();
        processedOrders.clear();
        
        // 🔒 RESET EXECUTION TRACKING: Clear old executed signals for fresh scan
        console.log(`🔄 Clearing ${executedSignals.size} previous executed signals for fresh scan`);
        executedSignals.clear();
        // Keep lastSignalExecutionTime for cooldown tracking but don't clear it
        
        lastScannerUpdate = Date.now();
        console.log('🔄 Cleared previous candidates + executed signals for fresh scan - FUNDS CALCULATED MODE');
        
        // DEBUG: Track condition pass counts
        let conditionStats = {
            total_stocks: 0,
            buy_condition_passes: Array(14).fill(0),
            sell_condition_passes: Array(14).fill(0),
            ema_1min_issues: [],
            orders_attempted: 0,
            orders_successful: 0,
            orders_failed: 0
        };

        const shouldApplyUiFilters = Boolean(req.body?.applyUiFilters);
        const requestedBuyFilters = req.body?.appliedFilters?.buy || {};
        const requestedSellFilters = req.body?.appliedFilters?.sell || {};

        const buyFilterIdToConditionIndexes = {
            macdAboveSignal5m: [0],
            macdAboveZero5m: [1],
            adxAbove25_5m: [2],
            plusDiAbove25_5m: [3],
            plusDiAboveAdx_5m: [4],
            minusDiBelow15_5m: [5],
            ema3AboveEma5_5m: [6],
            rsiAbove60_5m: [7],
            macdAboveSignal1m: [8],
            adxAbove25_1m: [9],
            plusDiAbove25_1m: [10],
            minusDiBelow15_1m: [11],
            rsiAbove65_1m: [12],
            ema3AboveEma5_1m: [13]
        };

        const sellFilterIdToConditionIndexes = {
            macdBelowSignal5mSell: [0],
            macdBelowZero5mSell: [1],
            adxAbove25_5mSell: [2],
            minusDiAbove25_5mSell: [3],
            minusDiAboveAdx_5mSell: [4],
            plusDiBelow15_5mSell: [5],
            ema3BelowEma5_5mSell: [6],
            rsiBelow40_5mSell: [7],
            macdBelowSignal1mSell: [8],
            adxAbove25_1mSell: [9],
            minusDiAbove25_1mSell: [10],
            plusDiBelow15_1mSell: [11],
            rsiBelow35_1mSell: [12],
            ema3BelowEma5_1mSell: [13]
        };

        const buyFilterOrder = [
            'macdAboveSignal5m',
            'macdAboveZero5m',
            'adxAbove25_5m',
            'plusDiAbove25_5m',
            'plusDiAboveAdx_5m',
            'minusDiBelow15_5m',
            'ema3AboveEma5_5m',
            'rsiAbove60_5m',
            'macdAboveSignal1m',
            'adxAbove25_1m',
            'plusDiAbove25_1m',
            'minusDiBelow15_1m',
            'rsiAbove65_1m',
            'ema3AboveEma5_1m'
        ];

        const sellFilterOrder = [
            'macdBelowSignal5mSell',
            'macdBelowZero5mSell',
            'adxAbove25_5mSell',
            'minusDiAbove25_5mSell',
            'minusDiAboveAdx_5mSell',
            'plusDiBelow15_5mSell',
            'ema3BelowEma5_5mSell',
            'rsiBelow40_5mSell',
            'macdBelowSignal1mSell',
            'adxAbove25_1mSell',
            'minusDiAbove25_1mSell',
            'plusDiBelow15_1mSell',
            'rsiBelow35_1mSell',
            'ema3BelowEma5_1mSell'
        ];

        const hasCompactBuyIndexes = Array.isArray(req.body?.enabledBuyFilterIndexes);
        const hasCompactSellIndexes = Array.isArray(req.body?.enabledSellFilterIndexes);

        const activeBuyFilterIds = hasCompactBuyIndexes
            ? req.body.enabledBuyFilterIndexes
                .map((index) => buyFilterOrder[index])
                .filter(Boolean)
            : Object.entries(requestedBuyFilters)
                .filter(([, enabled]) => enabled === true)
                .map(([id]) => id);

        const activeSellFilterIds = hasCompactSellIndexes
            ? req.body.enabledSellFilterIndexes
                .map((index) => sellFilterOrder[index])
                .filter(Boolean)
            : Object.entries(requestedSellFilters)
                .filter(([, enabled]) => enabled === true)
                .map(([id]) => id);

        const evaluateWithSelectedFilters = (conditions, activeFilterIds, filterMap) => {
            if (!shouldApplyUiFilters) {
                return conditions.every(condition => condition);
            }

            const activeIndexes = activeFilterIds
                .flatMap((filterId) => filterMap[filterId] || []);

            if (activeIndexes.length === 0) {
                return true;
            }

            return activeIndexes.every((index) => conditions[index]);
        };

        if (shouldApplyUiFilters) {
            console.log(`🎛️ Applying UI filters on backend: buy=${activeBuyFilterIds.length}, sell=${activeSellFilterIds.length}`);
        }

        enrichedStocks.forEach(async (stock) => {
            conditionStats.total_stocks++;
            
            // BUY CONDITIONS (combined):
            // 5m conditions:
            // 1) MACD > Signal
            // 2) MACD > 0
            // 3) ADX > 25
            // 4) +DI > 25
            // 5) +DI > ADX
            // 6) -DI < 15
            // 7) EMA3 > EMA5
            // 8) RSI > 60
            // 1m conditions:
            // 9) MACD > Signal
            // 10) ADX > 20
            // 11) +DI > 25
            // 12) -DI < 15
            // 13) RSI > 65
            // 14) EMA3 > EMA5
            
            const buyConditions = [
                stock.macd5 > stock.signal5, // MACD(5m) > Signal(5m)
                stock.macd5 > 0,             // MACD(5m) > 0
                stock.adx5 > 20,             // ADX(5m) > 20
                stock.plusDI5 > 25,          // +DI(5m) > 25
                stock.plusDI5 > stock.adx5,  // +DI(5m) > ADX(5m)
                stock.minusDI5 < 15,         // -DI(5m) < 15
                stock.ema3_5 > stock.ema5_5, // EMA3(5m) > EMA5(5m)
                stock.rsi5 > 60,             // RSI(5m) > 60
                stock.macd1 > stock.signal1, // MACD(1m) > Signal(1m)
                stock.adx1 > 20,             // ADX(1m) > 20
                stock.plusDI1 > 25,          // +DI(1m) > 25
                stock.minusDI1 < 15,         // -DI(1m) < 15
                stock.rsi1 > 65,             // RSI(1m) > 65
                stock.ema3_1 > stock.ema5_1  // EMA3(1m) > EMA5(1m)
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
            
            // SELL CONDITIONS (opposite of combined BUY conditions)
            const sellConditions = [
                stock.macd5 < stock.signal5, // MACD(5m) < Signal(5m)
                stock.macd5 < 0,             // MACD(5m) < 0
                stock.adx5 > 20,             // ADX(5m) > 20
                stock.minusDI5 > 25,         // -DI(5m) > 25
                stock.minusDI5 > stock.adx5, // -DI(5m) > ADX(5m)
                stock.plusDI5 < 15,          // +DI(5m) < 15
                stock.ema3_5 < stock.ema5_5, // EMA3(5m) < EMA5(5m)
                stock.rsi5 < 40,             // RSI(5m) < 40
                stock.macd1 < stock.signal1, // MACD(1m) < Signal(1m)
                stock.adx1 > 20,             // ADX(1m) > 20
                stock.minusDI1 > 25,         // -DI(1m) > 25
                stock.plusDI1 < 15,          // +DI(1m) < 15
                stock.rsi1 < 35,             // RSI(1m) < 35
                stock.ema3_1 < stock.ema5_1  // EMA3(1m) < EMA5(1m)
            ];
            
            
            const isBuySignal = evaluateWithSelectedFilters(
                buyConditions,
                activeBuyFilterIds,
                buyFilterIdToConditionIndexes
            );

            const isSellSignal = evaluateWithSelectedFilters(
                sellConditions,
                activeSellFilterIds,
                sellFilterIdToConditionIndexes
            );
            
            if (isBuySignal) {
                // 💰 Pre-calculate quantity based on global funds
                let preCalculatedQuantity = 0;
                let maxPossibleQuantity = 0;
                let quantityCalculationError = null;
                
                if (globalFunds.usableFunds > 0 && stock.ltp > 0) {
                    try {
                        maxPossibleQuantity = Math.floor(globalFunds.usableFunds / stock.ltp);
                        // Use calculated quantity derived from usable leveraged funds
                        preCalculatedQuantity = Math.max(0, maxPossibleQuantity);
                    } catch (qtyError) {
                        quantityCalculationError = qtyError.message;
                        console.log(`⚠️ Quantity calculation error for ${stock.symbol}:`, qtyError.message);
                    }
                }
                
                // Add pre-calculated data to stock
                stock.preCalculated = {
                    quantity: preCalculatedQuantity,
                    maxQuantity: maxPossibleQuantity,
                    investment: preCalculatedQuantity * stock.ltp,
                    fundsAvailable: globalFunds.availableFunds,
                    leveragedFunds: globalFunds.leverageFunds,
                    usableFunds: globalFunds.usableFunds,
                    quantityError: quantityCalculationError,
                    calculatedAt: new Date().toISOString()
                };
                
                buyStocks.push(stock);
                
                // 🚫 REMOVED: Direct order execution - Orders handled by frontend routes only
                console.log(`📋 BUY SIGNAL: ${stock.symbol} @ ₹${stock.ltp} (Qty: ${preCalculatedQuantity}, Investment: ₹${(preCalculatedQuantity * stock.ltp).toFixed(2)}) - Frontend execution`);
                stock.orderExecuted = false; // No backend execution
                
                // NO LONGER STORING FOR TICK-BASED EXECUTION - Direct execution only
                // buyCandidates.set() removed
            }

            if (isSellSignal) {
                // 💰 Pre-calculate quantity for SELL orders based on global funds
                let preCalculatedQuantity = 0;
                let maxPossibleQuantity = 0;
                let quantityCalculationError = null;
                
                if (globalFunds.usableFunds > 0 && stock.ltp > 0) {
                    try {
                        maxPossibleQuantity = Math.floor(globalFunds.usableFunds / stock.ltp);
                        // Use calculated quantity derived from usable leveraged funds
                        preCalculatedQuantity = Math.max(0, maxPossibleQuantity);
                    } catch (qtyError) {
                        quantityCalculationError = qtyError.message;
                        console.log(`⚠️ Quantity calculation error for ${stock.symbol}:`, qtyError.message);
                    }
                }
                
                // Add pre-calculated data to stock
                stock.preCalculated = {
                    quantity: preCalculatedQuantity,
                    maxQuantity: maxPossibleQuantity,
                    investment: preCalculatedQuantity * stock.ltp,
                    fundsAvailable: globalFunds.availableFunds,
                    leveragedFunds: globalFunds.leverageFunds,
                    usableFunds: globalFunds.usableFunds,
                    quantityError: quantityCalculationError,
                    calculatedAt: new Date().toISOString()
                };
                
                sellStocks.push(stock);
                
                // 🚫 REMOVED: Direct order execution - Orders handled by frontend routes only  
                console.log(`📋 SELL SIGNAL: ${stock.symbol} @ ₹${stock.ltp} (Qty: ${preCalculatedQuantity}, Investment: ₹${(preCalculatedQuantity * stock.ltp).toFixed(2)}) - Frontend execution`);
                stock.orderExecuted = false; // No backend execution
                
                // NO LONGER STORING FOR TICK-BASED EXECUTION - Direct execution only
                // sellCandidates.set() removed
                // Track order statistics
                if (stock.orderExecuted === true) {
                    conditionStats.orders_successful++;
                } else if (stock.orderExecuted === false && stock.orderError) {
                    conditionStats.orders_failed++;
                }
                if (stock.orderExecuted !== undefined) {
                    conditionStats.orders_attempted++;
                }
            }
            // If neither buy nor sell conditions are met, stock is ignored
        });
        // DEBUG: Print condition statistics
        console.log('🔍 CONDITION ANALYSIS:');
        const conditionLabels = [
            'MACD (5m) > Signal (5m)',
            'MACD (5m) > 0',
            'ADX (5m) > 25',
            '+DI (5m) > 25',
            '-DI (5m) < 15',
            'EMA3 (5m) > EMA5 (5m)',
            'RSI (5m) > 60',
            'MACD (1m) > Signal (1m)',
            'ADX (1m) > 25',
            '+DI (1m) > 25',
            '-DI (1m) < 15',
            'RSI (1m) > 65',
            'EMA3 (1m) > EMA5 (1m)'
        ];
       
    

       // console.log('ℹ️ SCAN COMPLETE: Direct order execution completed');
        console.log(`🎯 SCAN RESULTS: ${buyStocks.length} buy signals, ${sellStocks.length} sell signals`);
        console.log(`📊 ORDER EXECUTION: Attempted=${conditionStats.orders_attempted}, Success=${conditionStats.orders_successful}, Failed=${conditionStats.orders_failed}`);

        // NO AUTO-SUBSCRIPTION - Direct execution mode
        // Store buy/sell stocks globally for API access (if needed)
        currentBuyStocks = buyStocks;
        currentSellStocks = sellStocks;
        lastScanTimestamp = new Date().toISOString();
        
        // ✅ RE-ENABLED: Auto-subscription to manage unsubscribing old symbols
        console.log(`🔄 Managing subscriptions for ${buyStocks.length} buy + ${sellStocks.length} sell signals...`);
        
        // ✅ FORCE CLEANUP: If no signals, ensure complete cleanup
        if (buyStocks.length === 0 && sellStocks.length === 0 && currentlySubscribed.size > 0) {
            console.log('🧹 FORCE CLEANUP: No signals detected, clearing all subscriptions immediately');
            console.log(`   - Current subscriptions: ${currentlySubscribed.size}`);
            console.log(`   - Ticker exists: ${globalTicker ? 'YES' : 'NO'}`);
            try {
                const allTokens = Array.from(currentlySubscribed);
                console.log(`   - Tokens to clear: [${allTokens.join(', ')}]`);
                
                if (globalTicker && allTokens.length > 0) {
                    console.log('   - Calling globalTicker.unsubscribe()...');
                    globalTicker.unsubscribe(allTokens);
                } else if (!globalTicker) {
                    console.log('   - No ticker connection, clearing tracking only');
                } else {
                    console.log('   - No tokens to unsubscribe from ticker');
                }
                
                currentlySubscribed.clear();
                scanTypeTracker.clear();
                console.log(`✅ Force cleared ${allTokens.length} subscriptions`);
                console.log(`   - Remaining subscriptions: ${currentlySubscribed.size}`);
                broadcastSubscriptionUpdate();
            } catch (error) {
                console.error('❌ Error in force cleanup:', error);
            }
        } else {
            console.log(`🔍 No force cleanup needed: buyStocks=${buyStocks.length}, sellStocks=${sellStocks.length}, subscriptions=${currentlySubscribed.size}`);
        }
        
        await autoSubscribeToResults(buyStocks, sellStocks, req.body.access_token);
        
        console.log(`✅ SCAN COMPLETE - Direct execution with subscription management`);

        // 🎯 POSITION & ORDER CHECK: Check after every scan (includes target reconciliation)
        console.log(`🔍 Access token check: ${global.lastAccessToken ? 'Available' : 'Missing'}, Token: ${global.lastAccessToken || 'undefined'}`);
        if (global.lastAccessToken && global.lastAccessToken !== 'demo_token') {
            console.log('🔄 Scheduling position & order check in 1 second...');
            setTimeout(async () => {
                try {
                    console.log('⏰ Starting position & order reconciliation...');
                    const checkResult = await checkPositionsAndOrders(global.lastAccessToken);
                    console.log('📊 Position check result:', checkResult);
                } catch (error) {
                    console.error('❌ Position & order check failed:', error.message);
                }
            }, 1000); // Delay to ensure scan response is sent
        } else {
            console.log('⚠️ Position & order check skipped - no valid access token');
        }

        // Prepare simplified data for UI tables
        const buyTableData = buyStocks.map(stock => ({
            symbol: stock.symbol,
            ltp: stock.ltp,
            ema3_5: stock.ema3_5,
            triggerMet: stock.ltp < stock.ema3_5,
            orderExecuted: stock.orderExecuted || false,
            orderError: stock.orderError || null,
            token: symbolMappings.symbolMappings[stock.symbol] || null
        }));
        
        const sellTableData = sellStocks.map(stock => ({
            symbol: stock.symbol,
            ltp: stock.ltp,
            orderExecuted: stock.orderExecuted || false,
            orderError: stock.orderError || null,
            token: symbolMappings.symbolMappings[stock.symbol] || null
        }));

        const crossoverTableData = pureCrossoverStocks.map(stock => ({
            symbol: stock.symbol,
            ltp: stock.ltp,
            ema3_1: stock.ema3_1,
            vwma_9: stock.vwma_9,
            token: symbolMappings.symbolMappings[stock.symbol] || null
        }));

        const crossdownTableData = pureCrossdownStocks.map(stock => ({
            symbol: stock.symbol,
            ltp: stock.ltp,
            ema3_1: stock.ema3_1,
            vwma_9: stock.vwma_9,
            token: symbolMappings.symbolMappings[stock.symbol] || null
        }));

        const separateCrossoverTableData = separateCrossoverStocks.map(stock => ({
            symbol: stock.symbol,
            ltp: stock.ltp,
            ema3_1: stock.ema3_1,
            ema3_5: stock.ema3_5,
            token: symbolMappings.symbolMappings[stock.symbol] || null
        }));

        const separateCrossdownTableData = separateCrossdownStocks.map(stock => ({
            symbol: stock.symbol,
            ltp: stock.ltp,
            ema3_1: stock.ema3_1,
            ema3_5: stock.ema3_5,
            token: symbolMappings.symbolMappings[stock.symbol] || null
        }));

        // Return comprehensive response for new UI structure
        const consolidatedResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            duration: duration,
            scanType: 'low-price-stocks-direct', 
            priceFilter: '≤₹4000',
            executionMode: 'direct', // No subscription, direct execution
            autoTrade: global.autoTrade,
            mainOrdersAllowed: mainOrdersAllowedInScan,
            positionsFound: precheckActivePositions.length > 0,
            openOrdersFound: precheckOpenOrders.length > 0,
            
            // NEW: Simplified table data for UI
            buyTable: buyTableData,
            sellTable: sellTableData,
            crossoverTable: crossoverTableData,
            crossdownTable: crossdownTableData,
            separateCrossoverTable: separateCrossoverTableData,
            separateCrossdownTable: separateCrossdownTableData,
            buyWithoutIntersectionTable: [],
            sellWithoutIntersectionTable: [],
            
            // Legacy data (for compatibility)
            totalStocks: enrichedStocks.length,
            buyStocks: buyStocks,
            sellStocks: sellStocks,
            crossoverStocks: pureCrossoverStocks,
            crossdownStocks: pureCrossdownStocks,
            separateCrossoverStocks: separateCrossoverStocks,
            separateCrossdownStocks: separateCrossdownStocks,
            allStocks: enrichedStocks,
            
            message: `Found ${buyStocks.length} buy and ${sellStocks.length} sell signals from ${enrichedStocks.length} low-price stocks. Crossover/crossdown scans are available via separate routes. ${conditionStats.orders_attempted} orders attempted, ${conditionStats.orders_successful} successful.`,
            
            // ORDER EXECUTION STATUS (replaces tick execution)
            orderExecution: {
                enabled: global.autoTrade,
                mainOrdersAllowed: mainOrdersAllowedInScan,
                attempted: conditionStats.orders_attempted,
                successful: conditionStats.orders_successful,
                failed: conditionStats.orders_failed,
                mode: 'direct_scan_execution',
                message: global.autoTrade ? 
                    `Direct execution: ${conditionStats.orders_successful}/${conditionStats.orders_attempted} orders successful` :
                    'Scan-only mode: Set autoTrade=true to execute orders'
            },

            precheck: {
                called: true,
                tokenSource: req.body.access_token ? 'request' : (effectiveAccessToken ? 'stored' : 'none'),
                fundsUpdated: scanPrecheck.fundsUpdated,
                positionsCount: precheckActivePositions.length,
                openOrdersCount: precheckOpenOrders.length
            },

            filterSync: {
                applyUiFilters: shouldApplyUiFilters,
                buyActiveFilterIds: activeBuyFilterIds,
                sellActiveFilterIds: activeSellFilterIds
            },
            
            statistics: {
                totalCount: enrichedStocks.length,
                buyCount: buyStocks.length,
                sellCount: sellStocks.length,
                ordersAttempted: conditionStats.orders_attempted,
                ordersSuccessful: conditionStats.orders_successful,
                ordersFailed: conditionStats.orders_failed,
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



// Get current subscription status endpoint
router.get('/subscription-status', (req, res) => {
    try {
        const subscribedTokens = Array.from(currentlySubscribed);
        const subscribedSymbols = subscribedTokens.map(token => {
            const symbol = getSymbolFromToken(token);
            return `NSE:${symbol}`; // Add NSE: prefix to match frontend format
        });
        
        // 🎯 NEW: Include signal stock information
        const signalStocks = {
            buySignals: currentBuyStocks.map(stock => ({
                symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
                ltp: stock.ltp || stock.d?.[0] || 0,
                volume: stock.volume || stock.d?.[1] || 0,
                signalType: 'BUY'
            })),
            sellSignals: currentSellStocks.map(stock => ({
                symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s), 
                ltp: stock.ltp || stock.d?.[0] || 0,
                volume: stock.volume || stock.d?.[1] || 0,
                signalType: 'SELL'
            }))
        };
        
        // 🔍 Create signal type mapping from scanTypeTracker
        const signalTypeMap = {};
        scanTypeTracker.forEach((signalType, token) => {
            const symbol = getSymbolFromToken(token);
            signalTypeMap[symbol] = signalType;
        });
        
        res.json({
            success: true,
            subscribed_count: currentlySubscribed.size,
            subscribed_tokens: subscribedTokens,
            subscribed_symbols: subscribedSymbols,
            signal_stocks: signalStocks, // NEW: Signal stock data
            signal_type_map: signalTypeMap, // NEW: Token to signal type mapping
            ticker_connected: globalTicker !== null,
            last_scan_timestamp: lastScanTimestamp,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Error getting subscription status:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            subscribed_count: 0,
            signal_stocks: { buySignals: [], sellSignals: [] },
            signal_type_map: {}
        });
    }
});

// Subscribe signal stocks to KiteTicker for tick-driven execution
router.post('/subscribe-signal-stocks', async (req, res) => {
    try {
        const { stocks } = req.body;
        
        console.log('🎯 SUBSCRIBE-SIGNAL-STOCKS route called with:', {
            stocksCount: stocks ? stocks.length : 0,
            stocks: stocks ? stocks.map(s => ({ symbol: s.symbol, signalType: s.signalType })) : []
        });
        
        if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No stocks provided for subscription'
            });
        }
        
        // Extract instrument tokens for subscription
        const tokensToSubscribe = [];
        const symbolTokenMap = new Map();
        
        for (const stock of stocks) {
            const cleanSymbol = stock.symbol.replace('NSE:', '').replace('BSE:', '');
            const token = symbolMappings.symbolMappings[cleanSymbol];
            
            if (token) {
                const tokenNum = parseInt(token);
                tokensToSubscribe.push(tokenNum);
                symbolTokenMap.set(tokenNum, cleanSymbol);
                
                // Track signal type for this token
                scanTypeTracker.set(tokenNum, stock.signalType === 'BUY' ? 'BUY_SCAN' : 'SELL_SCAN');
                
                console.log(`📍 Mapped ${cleanSymbol} → Token ${token} (${stock.signalType} signal)`);
            } else {
                console.log(`⚠️ No token found for symbol: ${cleanSymbol}`);
            }
        }
        
        if (tokensToSubscribe.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid tokens found for provided symbols'
            });
        }
        
        // Add tokens to subscription set
        const newSubscriptions = [];
        tokensToSubscribe.forEach(token => {
            if (!currentlySubscribed.has(token)) {
                currentlySubscribed.add(token);
                newSubscriptions.push(token);
            }
        });
        
        console.log(`📡 Signal stock subscription results:`);
        console.log(`   - Total tokens to subscribe: ${tokensToSubscribe.length}`);
        console.log(`   - New subscriptions: ${newSubscriptions.length}`);
        console.log(`   - Already subscribed: ${tokensToSubscribe.length - newSubscriptions.length}`);
        console.log(`   - Total subscribed count: ${currentlySubscribed.size}`);
        
        // Initialize KiteTicker if needed
        if (!globalTicker && global.initializeKiteTicker) {
            console.log('🔌 Initializing KiteTicker for signal stock subscriptions...');
            try {
                await global.initializeKiteTicker();
                console.log('✅ KiteTicker initialized successfully');
            } catch (tickerError) {
                console.error('❌ Failed to initialize KiteTicker:', tickerError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to initialize KiteTicker',
                    details: tickerError.message
                });
            }
        }
        
        // Subscribe to tokens if ticker is available
        if (globalTicker && newSubscriptions.length > 0) {
            try {
                globalTicker.subscribe(newSubscriptions);
                console.log(`✅ Subscribed ${newSubscriptions.length} new signal stocks to KiteTicker`);
            } catch (subscribeError) {
                console.error('❌ KiteTicker subscription error:', subscribeError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to subscribe stocks to KiteTicker',
                    details: subscribeError.message
                });
            }
        }
        
        // Broadcast subscription update
        broadcastSubscriptionUpdate();
        
        // Store signal stocks for reference
        const signalStocksByType = stocks.reduce((acc, stock) => {
            if (stock.signalType === 'BUY') {
                acc.buySignals.push(stock);
            } else {
                acc.sellSignals.push(stock);
            }
            return acc;
        }, { buySignals: [], sellSignals: [] });
        
        // Update current signal stocks (for tick handler reference)
        currentBuyStocks = signalStocksByType.buySignals;
        currentSellStocks = signalStocksByType.sellSignals;
        lastScanTimestamp = new Date().toISOString();
        
        // ✅ RE-ENABLED: Auto-subscription management for manual signal subscriptions
        console.log(`🔄 Managing subscriptions for ${signalStocksByType.buySignals.length} buy + ${signalStocksByType.sellSignals.length} sell signals...`);
        await autoSubscribeToResults(signalStocksByType.buySignals, signalStocksByType.sellSignals, req.body.access_token);
        
        console.log('🎯 Signal stocks subscription completed successfully');
        console.log(`   - Buy signals: ${signalStocksByType.buySignals.length}`);
        console.log(`   - Sell signals: ${signalStocksByType.sellSignals.length}`);
        
        res.json({
            success: true,
            subscribed_count: tokensToSubscribe.length,
            new_subscriptions: newSubscriptions.length,
            total_subscriptions: currentlySubscribed.size,
            buy_signals: signalStocksByType.buySignals.length,
            sell_signals: signalStocksByType.sellSignals.length,
            ticker_connected: !!globalTicker,
            message: `Subscribed ${tokensToSubscribe.length} signal stocks for tick-driven execution`
        });
        
    } catch (error) {
        console.error('❌ Error subscribing signal stocks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to subscribe signal stocks',
            details: error.message
        });
    }
});


// BUY ORDER ROUTE - Enhanced with funds, leverage, quantity calculation, and position checking
// ⚠️ MARKET IMPACT ENFORCEMENT: Only allows orders that have passed market impact analysis
// ✅ ENABLED: Direct route access for frontend execution
router.post('/buy-order', async (req, res) => {
    console.log('🔵 BUY-ORDER route called with body:', req.body);
    
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
        
        // 🔄 ACCEPT SIMPLE FORMAT: symbol, ltp, access_token from frontend
        const { symbol, ltp, orderParams: existingOrderParams, isTargetOrder } = req.body;
        
        // 🔒 SIGNAL EXECUTION TRACKING: Prevent repeated orders for same signal
        if (!isTargetOrder && symbol) {
            const signalKey = createSignalKey(symbol, 'BUY');
            
            // Check if this signal was recently executed
            if (wasSignalRecentlyExecuted(symbol, 'BUY', 5)) { // 5 minute cooldown
                console.log(`🚫 BUY signal execution blocked for ${symbol} - Recently executed (5min cooldown)`);
                return res.status(429).json({
                    success: false,
                    error: `BUY signal for ${symbol} was recently executed. Cooldown: 5 minutes`,
                    signalKey: signalKey,
                    lastExecution: new Date(lastSignalExecutionTime[signalKey]).toLocaleTimeString(),
                    cooldownRemaining: Math.max(0, 5 * 60 * 1000 - (Date.now() - lastSignalExecutionTime[signalKey]))
                });
            }
            
            console.log(`✅ BUY signal execution allowed for ${symbol} - No recent execution found`);
        }
        
        // 🔒 AUTO TRADING CHECK: Main orders only allowed when auto trading is active
        if (!isTargetOrder && !autoTradingActive) {
            return res.status(403).json({
                success: false,
                error: '🔒 AUTO TRADING DISABLED - Main orders blocked. Enable auto trading first or use target orders.',
                autoTradingActive: autoTradingActive,
                orderType: 'MAIN_BUY',
                suggestion: 'Enable auto trading or set isTargetOrder: true for target orders'
            });
        }
        
        if (!symbol || !ltp) {
            return res.status(400).json({
                success: false,
                error: 'Symbol and LTP are required for BUY order'
            });
        }

        // Outside MIS window, short-circuit main orders before heavy checks to avoid retry storms.
        if (!isTargetOrder) {
            const productTypeNow = getProductType();
            if (productTypeNow !== 'MIS') {
                if (symbol) {
                    markSignalAsExecuted(symbol, 'BUY');
                }
                return res.status(409).json({
                    success: false,
                    error: 'Main BUY order blocked: MIS window closed (post 3:25 PM).',
                    order_category: 'BUY',
                    symbol,
                    productTypeNow,
                    suggestion: 'Wait for market hours or place non-main/manual order flow that supports CNC.'
                });
            }
        }
        
        console.log(`🎯 Processing BUY order for ${symbol} at LTP ₹${ltp}`);
        console.log(`🔧 Order type: ${isTargetOrder ? `TARGET ORDER (${TARGET_PROFIT_PERCENT.toFixed(4)}% leverage-based target)` : 'MAIN ORDER'}`);
        console.log(`🔒 Auto trading status: ${autoTradingActive ? 'ENABLED' : 'DISABLED'}`);
        
        if (!isTargetOrder) {
            console.log(`🔒 Main order requires: Auto trading ENABLED = ${autoTradingActive}`);
        } else {
            console.log(`🎯 Target order: Always allowed regardless of auto trading status`);
        }
        
        // 🛡️ POSITION-BASED ORDER BLOCKING: Check positions first
        if (!isTargetOrder && access_token && access_token !== 'demo_token') {
            console.log('🔍 Checking positions before allowing MAIN BUY order...');
            
            try {
                const positions = await getActivePositions(access_token);
                const activePositions = positions.filter(pos => pos.quantity !== 0);
                
                if (activePositions.length > 0) {
                    console.log(`⛔ MAIN ORDER BLOCKED - Found ${activePositions.length} active positions:`, 
                        activePositions.map(pos => ({
                            symbol: pos.tradingsymbol,
                            quantity: pos.quantity
                        }))
                    );
                    
                    return res.status(403).json({
                        success: false,
                        error: 'Main orders blocked - active positions exist',
                        message: 'Cannot place new main orders while positions are open. Only target orders for existing positions are allowed.',
                        activePositions: activePositions.map(pos => ({
                            symbol: pos.tradingsymbol,
                            quantity: pos.quantity,
                            side: parseInt(pos.quantity) > 0 ? 'BUY' : 'SELL'
                        }))
                    });
                }
                
                console.log('✅ No active positions - MAIN ORDER ALLOWED');
                
            } catch (positionError) {
                console.log('⛔ Position check failed - blocking main order for safety:', positionError.message);
                return res.status(503).json({
                    success: false,
                    error: 'Position check failed - main order blocked for safety',
                    details: positionError.message,
                    order_category: 'BUY',
                    symbol: symbol
                });
            }
        } else if (isTargetOrder) {
            console.log('🎯 TARGET ORDER - bypassing position check');
        } else {
            console.log('🔧 Demo mode or missing token - bypassing position check');
        }
        // 🏗️ BUILD ORDER PARAMS if not provided  
        const orderParams = existingOrderParams || {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'BUY',
            price: ltp,
            product: 'MIS',
            order_type: 'MARKET',  // ✅ Changed from LIMIT to MARKET (Zerodha API requirement)
            market_protection: -1,
            validity: 'DAY'
        };
        
        // 🚦 STEP 1: SMART POSITION MANAGEMENT - Check positions FIRST before any financial calculations
        console.log('🔍 STEP 1: Checking existing positions...');
        const allActivePositions = await getActivePositions(access_token);
        const activePositionsFiltered = allActivePositions.filter(pos => pos.quantity !== 0);
        
        console.log(`📋 Found ${activePositionsFiltered.length} active positions across all symbols`);
        if (activePositionsFiltered.length > 0) {
            console.log('📊 Active positions details:', activePositionsFiltered.map(pos => ({
                symbol: pos.tradingsymbol,
                quantity: pos.quantity,
                avg_price: pos.average_price
            })));
        }
        
        if (activePositionsFiltered.length > 0) {
            console.log('⚠️ Active positions exist - checking order type');
            console.log('🔧 isTargetOrder flag:', isTargetOrder);
            
            if (isTargetOrder) {
                // ✅ ALLOW TARGET ORDERS for existing positions
                console.log('🎯 Target order request - processing for existing position');
                const positionForSymbol = activePositionsFiltered.find(pos => pos.tradingsymbol === orderParams.tradingsymbol);
                if (!positionForSymbol) {
                    return res.status(400).json({
                        success: false,
                        error: `No position found for ${orderParams.tradingsymbol} to place target order`,
                        activePositions: activePositionsFiltered.map(pos => pos.tradingsymbol)
                    });
                }
                
                // Calculate target order using centralized leveraged-funds profit basis
                const avgPrice = parseFloat(positionForSymbol.average_price);
                const quantity = parseInt(positionForSymbol.quantity);
                const side = quantity > 0 ? 'BUY' : 'SELL';
                const targetPrice = calculateTargetPrice(avgPrice, Math.abs(quantity), side);
                
                console.log(`🎯 Placing target order: ${orderParams.tradingsymbol} at ₹${targetPrice.toFixed(2)} using centralized leverage-based profit target`);
                
                // Place target order (opposite side)
                const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
                const targetResult = await placeTargetOrder(access_token, orderParams.tradingsymbol, Math.abs(quantity), targetPrice, targetSide);
                
                if (targetResult.success) {
                    // 📊 AUTO KITE CHART: Open chart for successful target order
                    if (global.broadcastLiveData) {
                        const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                        global.broadcastLiveData({
                            type: 'order_charts',
                            charts: [{
                                symbol: orderParams.tradingsymbol,
                                token: parseInt(token) || null,
                                orderType: 'TARGET',
                                orderId: targetResult.orderId,
                                message: `Kite chart opened for target order: ${orderParams.tradingsymbol}`,
                                timestamp: new Date().toISOString()
                            }]
                        });
                    }
                    
                    return res.json({
                        success: true,
                        order_id: targetResult.orderId,
                        message: `Target order placed for ${orderParams.tradingsymbol} - leverage-based profit target`,
                        symbol: orderParams.tradingsymbol,
                        orderType: 'TARGET',
                        targetPrice: targetPrice,
                        expectedProfit: `${TARGET_PROFIT_PERCENT.toFixed(4)}%`,
                        openChart: true,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: `Failed to place target order: ${targetResult.error}`
                    });
                }
            } else {
                // ❌ BLOCK NEW MAIN ORDERS when positions exist
                console.log('🚫 BLOCKING MAIN BUY ORDER - Active positions exist');
                console.log('📊 Active positions:', activePositionsFiltered.map(pos => ({
                    symbol: pos.tradingsymbol,
                    quantity: pos.quantity,
                    average_price: pos.average_price,
                    pnl: pos.pnl
                })));
                
                return res.status(400).json({
                    success: false,
                    error: `🚫 MAIN ORDER BLOCKED - ${activePositionsFiltered.length} active position(s) found. Close positions first or use isTargetOrder: true for target orders.`,
                    activePositions: activePositionsFiltered.map(pos => ({
                        symbol: pos.tradingsymbol,
                        quantity: pos.quantity,
                        average_price: pos.average_price,
                        pnl: pos.pnl
                    })),
                    order_category: 'BUY',
                    symbol: orderParams.tradingsymbol,
                    suggestion: 'Set isTargetOrder: true to place target orders for existing positions',
                    blockedReason: 'Active positions exist - cannot place new main orders'
                });
            }
        }
        
        // ✅ NO POSITIONS - PROCEED WITH MAIN ORDER
        console.log('✅ No active positions found, proceeding with main BUY order');
        
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
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(access_token);
        
        // STEP 1: Use global funds instead of recalculating
        console.log('💰 STEP 1: Using global funds...');
        const globalFunds = getGlobalFunds();
        
        console.log(`💰 Global funds: Available=₹${globalFunds.availableFunds.toLocaleString('en-IN')}, Leveraged=₹${globalFunds.leverageFunds.toLocaleString('en-IN')}, Usable=₹${globalFunds.usableFunds.toLocaleString('en-IN')}`);
        
        if (globalFunds.availableFunds <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient funds available',
                availableFunds: globalFunds.availableFunds
            });
        }
        
        // STEP 2.5: Check minimum leveraged amount requirement (₹50,000 - reduced from 400,000)
        const minLeveragedAmount = 50000;
        if (globalFunds.leverageFunds < minLeveragedAmount) {
            return res.status(400).json({
                success: false,
                error: `Insufficient leveraged funds. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`,
                availableFunds: globalFunds.availableFunds,
                leverageFunds: globalFunds.leverageFunds,
                minRequired: minLeveragedAmount,
                order_category: 'BUY',
                symbol: orderParams.tradingsymbol
            });
        }
        console.log(`✅ Leveraged Amount Check: ₹${globalFunds.leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        
        // STEP 3: Calculate optimal quantity based on available funds
        pricePerShare = ltp || orderParams.price; // Assign to existing let variable
        const maxQuantity = Math.floor(globalFunds.usableFunds / pricePerShare);
        
        // Use either requested quantity or calculated max quantity (whichever is smaller)
        // If no quantity provided, use calculated max quantity
        const requestedQuantity = orderParams.quantity || maxQuantity;
        finalQuantity = Math.min(requestedQuantity, maxQuantity); // Assign to existing let variable
        
        console.log(`\n📊 BUY ORDER QUANTITY CALCULATION:`);
        console.log(`💰 Available Funds: ₹${globalFunds.availableFunds.toLocaleString('en-IN')}`);
        console.log(`⚡ Leveraged Funds (5x): ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`);
        console.log(`🔒 Usable Funds (95%): ₹${globalFunds.usableFunds.toLocaleString('en-IN')}`);
        console.log(`💵 Price per share: ₹${pricePerShare}`);
        console.log(`🔢 Max possible quantity: ${maxQuantity}`);
        console.log(`📋 Requested quantity: ${orderParams.quantity || 'auto-calculated'}`);
        console.log(`🎯 Final quantity: ${finalQuantity}`);
        console.log(`💸 Total investment: ₹${(finalQuantity * pricePerShare).toLocaleString('en-IN')}`);;
        
        // Use calculated quantity for main orders (no test override)
        
        if (finalQuantity <= 0) {
            return res.status(400).json({
                success: false,
                error: `Insufficient funds for even 1 share. Need ₹${pricePerShare}, have ₹${globalFunds.usableFunds}`,
                availableFunds: globalFunds.availableFunds,
                leverageFunds: globalFunds.leverageFunds,
                usableFunds: globalFunds.usableFunds,
                pricePerShare: pricePerShare
            });
        }

        if (!access_token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        // Initialize KiteConnect for order placement
        const kiteOrderPlacement = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kiteOrderPlacement.setAccessToken(access_token);
        
        // STEP 4: Force MIS product type and apply tick size rounding
        console.log('� STEP 4: SMART POSITION MANAGEMENT - Check positions and decide action');
        const positions = await kiteOrderPlacement.getPositions();
        const currentActivePositions = positions.net?.filter(pos => pos.quantity !== 0) || [];
        
        console.log(`📋 Found ${currentActivePositions.length} total active positions across all symbols`);
        
        if (currentActivePositions.length > 0) {
            console.log('⚠️ Active positions exist - checking order type');
            
            if (isTargetOrder) {
                // ✅ ALLOW TARGET ORDERS for existing positions
                console.log('🎯 Target order request - processing for existing position');
                const positionForSymbol = currentActivePositions.find(pos => pos.tradingsymbol === orderParams.tradingsymbol);
                if (!positionForSymbol) {
                    return res.status(400).json({
                        success: false,
                        error: `No position found for ${orderParams.tradingsymbol} to place target order`,
                        activePositions: currentActivePositions.map(pos => pos.tradingsymbol)
                    });
                }
                
                // Calculate target order using centralized leveraged-funds profit basis
                const avgPrice = parseFloat(positionForSymbol.average_price);
                const quantity = parseInt(positionForSymbol.quantity);
                const side = quantity > 0 ? 'BUY' : 'SELL';
                const targetPrice = calculateTargetPrice(avgPrice, Math.abs(quantity), side);
                
                console.log(`🎯 Placing target order: ${orderParams.tradingsymbol} at ₹${targetPrice.toFixed(2)} using centralized leverage-based profit target`);
                
                // Place target order (opposite side)
                const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
                const targetResult = await placeTargetOrder(access_token, orderParams.tradingsymbol, Math.abs(quantity), targetPrice, targetSide);
                
                if (targetResult.success) {
                    // 📊 AUTO KITE CHART: Open chart for successful target order
                    if (global.broadcastLiveData) {
                        const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                        global.broadcastLiveData({
                            type: 'order_charts',
                            charts: [{
                                symbol: orderParams.tradingsymbol,
                                token: parseInt(token) || null,
                                orderType: 'TARGET',
                                orderId: targetResult.orderId,
                                message: `Kite chart opened for target order: ${orderParams.tradingsymbol}`,
                                timestamp: new Date().toISOString()
                            }]
                        });
                    }
                    
                    return res.json({
                        success: true,
                        order_id: targetResult.orderId,
                        message: `Target order placed for ${orderParams.tradingsymbol} - leverage-based profit target`,
                        symbol: orderParams.tradingsymbol,
                        orderType: 'TARGET',
                        targetPrice: targetPrice,
                        expectedProfit: `${TARGET_PROFIT_PERCENT.toFixed(4)}%`,
                        openChart: true,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: `Failed to place target order: ${targetResult.error}`
                    });
                }
            } else {
                // ❌ BLOCK NEW MAIN ORDERS when positions exist
                console.log('🚫 Main order blocked - positions exist');
                return res.status(400).json({
                    success: false,
                    error: `Cannot place main order - ${currentActivePositions.length} active position(s) found. Close positions or use isTargetOrder: true for target orders.`,
                    activePositions: currentActivePositions.map(pos => ({
                        symbol: pos.tradingsymbol,
                        quantity: pos.quantity,
                        average_price: pos.average_price,
                        pnl: pos.pnl
                    })),
                    order_category: 'BUY',
                    symbol: orderParams.tradingsymbol,
                    suggestion: 'Set isTargetOrder: true to place target orders for existing positions'
                });
            }
        }
        
        // ✅ NO POSITIONS - CHECK FOR OPEN ORDERS BEFORE PROCEEDING
        console.log('✅ No active positions found - checking for open orders before proceeding');
        
        // STEP 4.5: Check for open orders (limit orders)
        const openOrders = await kiteOrderPlacement.getOrders();
        const pendingOrders = openOrders.filter(order => 
            order.status === 'OPEN' || order.status === 'TRIGGER PENDING'
        );
        
        if (pendingOrders.length > 0) {
            console.log(`🚫 BLOCKING MAIN BUY ORDER - ${pendingOrders.length} pending order(s) found`);
            console.log('📋 Pending orders:', pendingOrders.map(order => ({
                symbol: order.tradingsymbol,
                order_id: order.order_id,
                transaction_type: order.transaction_type,
                order_type: order.order_type,
                status: order.status,
                price: order.price,
                quantity: order.quantity
            })));
            
            return res.status(400).json({
                success: false,
                error: `🚫 MAIN ORDER BLOCKED - ${pendingOrders.length} pending order(s) found. Wait for execution or cancel them first.`,
                pendingOrders: pendingOrders.map(order => ({
                    symbol: order.tradingsymbol,
                    order_id: order.order_id,
                    transaction_type: order.transaction_type,
                    status: order.status,
                    price: order.price,
                    quantity: order.quantity
                })),
                order_category: 'BUY',
                symbol: orderParams.tradingsymbol,
                suggestion: 'Cancel pending orders or wait for execution before placing new main orders'
            });
        }
        
        console.log('✅ No active positions + No pending orders found, proceeding with main BUY order');
        
        // STEP 5: Force MIS product type and apply tick size rounding
        const forcedProductType = 'MIS';
        console.log(`🕐 Forcing product type: ${forcedProductType}`);
        
        const roundedPrice = roundToTickSize(orderParams.price, ltp);
        
        // Final orderParams with all enhancements
        const finalOrderParams = {
            ...orderParams,
            price: roundedPrice,
            product: forcedProductType,
            quantity: finalQuantity,  // Use calculated quantity
            ...(String(orderParams.order_type || '').toUpperCase() === 'MARKET' ? { market_protection: -1 } : {})
        };
        
        console.log('🚀 STEP 5: Placing enhanced BUY order:', finalOrderParams);
        const result = await kiteOrderPlacement.placeOrder('regular', finalOrderParams);
        
        if (result && result.order_id) {
            // � AUTO KITE CHART: Open chart for successful main BUY order
            if (global.broadcastLiveData) {
                const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                global.broadcastLiveData({
                    type: 'order_charts',
                    charts: [{
                        symbol: orderParams.tradingsymbol,
                        token: parseInt(token) || null,
                        orderType: 'MAIN_BUY',
                        orderId: result.order_id,
                        message: `Kite chart opened for successful main BUY order: ${orderParams.tradingsymbol}`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            // 🔒 MARK SIGNAL AS EXECUTED: Prevent repeated attempts
            if (!isTargetOrder && symbol) {
                markSignalAsExecuted(symbol, 'BUY');
                console.log(`🔒 BUY signal marked as executed for ${symbol} - 5 minute cooldown active`);
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
                funds: {
                    available: globalFunds.availableFunds,
                    leveraged: globalFunds.leverageFunds,
                    used: finalOrderParams.quantity * roundedPrice,
                    remaining: globalFunds.leverageFunds - (finalOrderParams.quantity * roundedPrice)
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
            
            // 🎯 AUTO TARGET ORDER: Place centralized leverage-based target after successful main BUY order
            console.log(`🎯 Setting up leverage-based profit target for ${orderParams.tradingsymbol} after 3 seconds...`);
            setTimeout(async () => {
                try {
                    const newPositions = await getActivePositions(access_token);
                    const newPosition = newPositions.find(pos => pos.tradingsymbol === orderParams.tradingsymbol && pos.quantity !== 0);
                    
                    if (newPosition) {
                        const avgPrice = parseFloat(newPosition.average_price);
                        const quantity = Math.abs(parseInt(newPosition.quantity));
                        const side = parseInt(newPosition.quantity) > 0 ? 'BUY' : 'SELL';
                        const targetPrice = calculateTargetPrice(avgPrice, quantity, side);
                        
                        console.log(`📊 Position found: Qty=${quantity}, AvgPrice=₹${avgPrice}, Target=₹${targetPrice.toFixed(2)}`);
                        
                        // Place target order (opposite side for profit)
                        const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
                        const targetResult = await placeTargetOrder(access_token, orderParams.tradingsymbol, quantity, targetPrice, targetSide);
                        
                        if (targetResult.success) {
                            console.log(`✅ Leverage-based profit target placed: Order ID ${targetResult.orderId}`);
                            
                            // Calculate investment and profit details for frontend display
                            const investment = avgPrice * quantity;
                            const { targetProfitAmount, targetProfitPercent } = calculateProfitTargetFromInvestment(investment);
                            const actualProfitPerShare = Math.abs(targetPrice - avgPrice);
                            const actualTotalProfit = actualProfitPerShare * quantity;
                            
                            // 📊 AUTO KITE CHART: Open chart for successful target order
                            if (global.broadcastLiveData) {
                                const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                                global.broadcastLiveData({
                                    type: 'order_charts',
                                    charts: [{
                                        symbol: orderParams.tradingsymbol,
                                        token: parseInt(token) || null,
                                        orderType: 'AUTO_TARGET',
                                        orderId: targetResult.orderId,
                                        message: `Target order placed - leverage-based profit target for ${orderParams.tradingsymbol}`,
                                        timestamp: new Date().toISOString()
                                    }]
                                });
                                
                                // 🎯 TARGET ORDER DETAILS: Send investment and profit info
                                global.broadcastLiveData({
                                    type: 'target_order_placed',
                                    targetOrder: {
                                        symbol: orderParams.tradingsymbol,
                                        orderId: targetResult.orderId,
                                        avgPrice: avgPrice,
                                        quantity: quantity,
                                        investment: investment,
                                        targetPrice: targetPrice,
                                        expectedProfit: actualTotalProfit,
                                        profitPercentage: targetProfitPercent,
                                        side: side,
                                        targetSide: targetSide,
                                        placedAt: new Date().toISOString(),
                                        timestamp: new Date().toLocaleTimeString()
                                    }
                                });
                            }
                        }
                    } else {
                        console.log(`⚠️ No position found for ${orderParams.tradingsymbol} after BUY order`);
                    }
                } catch (targetError) {
                    console.error(`❌ Target order setup failed for ${orderParams.tradingsymbol}:`, targetError.message);
                }
            }, 3000); // Wait 3 seconds for position to update
            
        } else {
            throw new Error('Order placement failed');
        }
    } catch (error) {
        console.error('❌ Error placing enhanced buy order:', error);

        const isMisCutoffError = String(error?.message || '').includes('Intraday orders (MIS) are allowed only till 3.25 PM');
        if (isMisCutoffError && req.body?.symbol && !req.body?.isTargetOrder) {
            markSignalAsExecuted(req.body.symbol, 'BUY');
        }
        
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
        
        res.status(isMisCutoffError ? 409 : 500).json(errorResponse);
    }
});

// SELL ORDER ROUTE - Enhanced with funds, leverage, quantity calculation, and position checking
// ✅ ENABLED: Direct route access for frontend execution
router.post('/sell-order', async (req, res) => {
    console.log('🔴 SELL-ORDER route called with body:', req.body);
    
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
        
        // 🔄 ACCEPT SIMPLE FORMAT: symbol, ltp, access_token from frontend
        const { symbol, ltp, orderParams: existingOrderParams, isTargetOrder } = req.body;
        
        // 🔒 SIGNAL EXECUTION TRACKING: Prevent repeated orders for same signal
        if (!isTargetOrder && symbol) {
            const signalKey = createSignalKey(symbol, 'SELL');
            
            // Check if this signal was recently executed
            if (wasSignalRecentlyExecuted(symbol, 'SELL', 5)) { // 5 minute cooldown
                console.log(`🚫 SELL signal execution blocked for ${symbol} - Recently executed (5min cooldown)`);
                return res.status(429).json({
                    success: false,
                    error: `SELL signal for ${symbol} was recently executed. Cooldown: 5 minutes`,
                    signalKey: signalKey,
                    lastExecution: new Date(lastSignalExecutionTime[signalKey]).toLocaleTimeString(),
                    cooldownRemaining: Math.max(0, 5 * 60 * 1000 - (Date.now() - lastSignalExecutionTime[signalKey]))
                });
            }
            
            console.log(`✅ SELL signal execution allowed for ${symbol} - No recent execution found`);
        }
        
        // 🔒 AUTO TRADING CHECK: Main orders only allowed when auto trading is active
        if (!isTargetOrder && !autoTradingActive) {
            return res.status(403).json({
                success: false,
                error: '🔒 AUTO TRADING DISABLED - Main orders blocked. Enable auto trading first or use target orders.',
                autoTradingActive: autoTradingActive,
                orderType: 'MAIN_SELL',
                suggestion: 'Enable auto trading or set isTargetOrder: true for target orders'
            });
        }
        
        if (!symbol || !ltp) {
            return res.status(400).json({
                success: false,
                error: 'Symbol and LTP are required for SELL order'
            });
        }

        // Outside MIS window, short-circuit main orders before heavy checks to avoid retry storms.
        if (!isTargetOrder) {
            const productTypeNow = getProductType();
            if (productTypeNow !== 'MIS') {
                if (symbol) {
                    markSignalAsExecuted(symbol, 'SELL');
                }
                return res.status(409).json({
                    success: false,
                    error: 'Main SELL order blocked: MIS window closed (post 3:25 PM).',
                    order_category: 'SELL',
                    symbol,
                    productTypeNow,
                    suggestion: 'Wait for market hours or place non-main/manual order flow that supports CNC.'
                });
            }
        }
        
        console.log(`🎯 Processing SELL order for ${symbol} at LTP ₹${ltp}`);
        console.log(`🔧 Order type: ${isTargetOrder ? `TARGET ORDER (${TARGET_PROFIT_PERCENT.toFixed(4)}% leverage-based target)` : 'MAIN ORDER'}`);
        console.log(`🔒 Auto trading status: ${autoTradingActive ? 'ENABLED' : 'DISABLED'}`);
        
        if (!isTargetOrder) {
            console.log(`🔒 Main order requires: Auto trading ENABLED = ${autoTradingActive}`);
        } else {
            console.log(`🎯 Target order: Always allowed regardless of auto trading status`);
        }
        
        // 🛡️ POSITION-BASED ORDER BLOCKING: Check positions first
        if (!isTargetOrder && access_token && access_token !== 'demo_token') {
            console.log('🔍 Checking positions before allowing MAIN SELL order...');
            
            try {
                const positions = await getActivePositions(access_token);
                const activePositions = positions.filter(pos => pos.quantity !== 0);
                
                if (activePositions.length > 0) {
                    console.log(`⛔ MAIN ORDER BLOCKED - Found ${activePositions.length} active positions:`, 
                        activePositions.map(pos => ({
                            symbol: pos.tradingsymbol,
                            quantity: pos.quantity
                        }))
                    );
                    
                    return res.status(403).json({
                        success: false,
                        error: 'Main orders blocked - active positions exist',
                        message: 'Cannot place new main orders while positions are open. Only target orders for existing positions are allowed.',
                        activePositions: activePositions.map(pos => ({
                            symbol: pos.tradingsymbol,
                            quantity: pos.quantity,
                            side: parseInt(pos.quantity) > 0 ? 'BUY' : 'SELL'
                        }))
                    });
                }
                
                console.log('✅ No active positions - MAIN ORDER ALLOWED');
                
            } catch (positionError) {
                console.log('⛔ Position check failed - blocking main order for safety:', positionError.message);
                return res.status(503).json({
                    success: false,
                    error: 'Position check failed - main order blocked for safety',
                    details: positionError.message,
                    order_category: 'SELL',
                    symbol: symbol
                });
            }
        } else if (isTargetOrder) {
            console.log('🎯 TARGET ORDER - bypassing position check');
        } else {
            console.log('🔧 Demo mode or missing token - bypassing position check');
        }
        // 🏗️ BUILD ORDER PARAMS if not provided
        const orderParams = existingOrderParams || {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'SELL',
            price: ltp,
            product: 'MIS', 
            order_type: 'MARKET',  // ✅ Changed from LIMIT to MARKET (Zerodha API requirement)
            market_protection: -1,
            validity: 'DAY'
        };
        
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
        const kite = new KiteConnect({ api_key: 'r1a7qo9w30bxsfax' });
        kite.setAccessToken(access_token);
        
        // 🚦 STEP 1: SMART POSITION MANAGEMENT - Check positions FIRST before any financial calculations
        console.log('🔍 STEP 1: Checking existing positions...');
        const allActivePositions = await getActivePositions(access_token);
        const activePositionsFiltered = allActivePositions.filter(pos => pos.quantity !== 0);
        
        console.log(`📋 Found ${activePositionsFiltered.length} active positions across all symbols`);
        if (activePositionsFiltered.length > 0) {
            console.log('📊 Active positions details:', activePositionsFiltered.map(pos => ({
                symbol: pos.tradingsymbol,
                quantity: pos.quantity,
                avg_price: pos.average_price
            })));
        }
        
        if (activePositionsFiltered.length > 0) {
            console.log('⚠️ Active positions exist - checking order type');
            console.log('🔧 isTargetOrder flag:', isTargetOrder);
            
            if (isTargetOrder) {
                // ✅ ALLOW TARGET ORDERS for existing positions
                console.log('🎯 Target order request - processing for existing position');
                const positionForSymbol = activePositionsFiltered.find(pos => pos.tradingsymbol === orderParams.tradingsymbol);
                if (!positionForSymbol) {
                    return res.status(400).json({
                        success: false,
                        error: `No position found for ${orderParams.tradingsymbol} to place target order`,
                        activePositions: activePositionsFiltered.map(pos => pos.tradingsymbol)
                    });
                }
                
                // Calculate target order using centralized leveraged-funds profit basis
                const avgPrice = parseFloat(positionForSymbol.average_price);
                const quantity = parseInt(positionForSymbol.quantity);
                const side = quantity > 0 ? 'BUY' : 'SELL';
                const targetPrice = calculateTargetPrice(avgPrice, Math.abs(quantity), side);
                
                console.log(`🎯 Placing target order: ${orderParams.tradingsymbol} at ₹${targetPrice.toFixed(2)} using centralized leverage-based profit target`);
                
                // Place target order (opposite side)
                const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
                const targetResult = await placeTargetOrder(access_token, orderParams.tradingsymbol, Math.abs(quantity), targetPrice, targetSide);
                
                if (targetResult.success) {
                    // 📊 AUTO KITE CHART: Open chart for successful target order  
                    if (global.broadcastLiveData) {
                        const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                        global.broadcastLiveData({
                            type: 'order_charts',
                            charts: [{
                                symbol: orderParams.tradingsymbol,
                                token: parseInt(token) || null,
                                orderType: 'TARGET',
                                orderId: targetResult.orderId,
                                message: `Kite chart opened for target order: ${orderParams.tradingsymbol}`,
                                timestamp: new Date().toISOString()
                            }]
                        });
                    }
                    
                    return res.json({
                        success: true,
                        order_id: targetResult.orderId,
                        message: `Target order placed for ${orderParams.tradingsymbol} - leverage-based profit target`,
                        symbol: orderParams.tradingsymbol,
                        orderType: 'TARGET',
                        targetPrice: targetPrice,
                        expectedProfit: `${TARGET_PROFIT_PERCENT.toFixed(4)}%`,
                        openChart: true,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: targetResult.error,
                        symbol: orderParams.tradingsymbol
                    });
                }
            } else {
                // ❌ BLOCK MAIN ORDERS if positions exist for other symbols
                console.log('🚫 BLOCKING MAIN SELL ORDER - Active positions found');
                return res.status(400).json({
                    success: false,
                    error: `🚫 MAIN ORDER BLOCKED - ${activePositionsFiltered.length} active position(s) found. Close positions first or use isTargetOrder: true for target orders.`,
                    activePositions: activePositionsFiltered.map(pos => ({
                        symbol: pos.tradingsymbol,
                        quantity: pos.quantity,
                        average_price: pos.average_price,
                        pnl: pos.pnl
                    })),
                    order_category: 'SELL',
                    symbol: orderParams.tradingsymbol,
                    suggestion: 'Set isTargetOrder: true to place target orders for existing positions',
                    blockedReason: 'Active positions exist - cannot place new main orders'
                });
            }
        }
        
        // ✅ NO POSITIONS - CHECK FOR OPEN ORDERS BEFORE PROCEEDING
        console.log('✅ No active positions found - checking for open orders before proceeding');
        
        // STEP 1.5: Check for open orders (limit orders) 
        const openOrders = await kite.getOrders();
        const pendingOrders = openOrders.filter(order => 
            order.status === 'OPEN' || order.status === 'TRIGGER PENDING'
        );
        
        if (pendingOrders.length > 0) {
            console.log(`🚫 BLOCKING MAIN SELL ORDER - ${pendingOrders.length} pending order(s) found`);
            console.log('📋 Pending orders:', pendingOrders.map(order => ({
                symbol: order.tradingsymbol,
                order_id: order.order_id,
                transaction_type: order.transaction_type,
                order_type: order.order_type,
                status: order.status,
                price: order.price,
                quantity: order.quantity
            })));
            
            return res.status(400).json({
                success: false,
                error: `🚫 MAIN ORDER BLOCKED - ${pendingOrders.length} pending order(s) found. Wait for execution or cancel them first.`,
                pendingOrders: pendingOrders.map(order => ({
                    symbol: order.tradingsymbol,
                    order_id: order.order_id,
                    transaction_type: order.transaction_type,
                    status: order.status,
                    price: order.price,
                    quantity: order.quantity
                })),
                order_category: 'SELL',
                symbol: orderParams.tradingsymbol,
                suggestion: 'Cancel pending orders or wait for execution before placing new main orders'
            });
        }
        
        console.log('✅ No active positions + No pending orders found, proceeding with main SELL order');
        
        // STEP 2: Use global funds instead of recalculating (for MIS short selling)
        console.log('💰 STEP 2: Using global funds for MIS sell (short) order...');
        const globalFunds = getGlobalFunds();
        
        console.log(`💰 Global funds: Available=₹${globalFunds.availableFunds.toLocaleString('en-IN')}, Leveraged=₹${globalFunds.leverageFunds.toLocaleString('en-IN')}, Usable=₹${globalFunds.usableFunds.toLocaleString('en-IN')}`);
        
        if (globalFunds.availableFunds <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient funds available for short selling',
                availableFunds: globalFunds.availableFunds
            });
        }
        
        // STEP 2.5: Check minimum leveraged amount requirement (₹50,000 - reduced from 400,000)
        const minLeveragedAmount = 50000;
        if (globalFunds.leverageFunds < minLeveragedAmount) {
            return res.status(400).json({
                success: false,
                error: `Insufficient leveraged funds for short selling. Need ₹${minLeveragedAmount.toLocaleString('en-IN')}, have ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`,
                availableFunds: globalFunds.availableFunds,
                leverageFunds: globalFunds.leverageFunds,
                minRequired: minLeveragedAmount,
                order_category: 'SELL',
                symbol: orderParams.tradingsymbol
            });
        }
        console.log(`✅ Leveraged Amount Check: ₹${globalFunds.leverageFunds.toLocaleString('en-IN')} > ₹${minLeveragedAmount.toLocaleString('en-IN')}`);
        
        // STEP 3: Calculate optimal quantity based on global funds (for short selling margin)
        pricePerShare = ltp || orderParams.price; // Assign to existing let variable
        const maxQuantity = Math.floor(globalFunds.usableFunds / pricePerShare);
        
        // Use either requested quantity or calculated max quantity (whichever is smaller)
        // If no quantity provided, use calculated max quantity
        const requestedQuantity = orderParams.quantity || maxQuantity;
        finalQuantity = Math.min(requestedQuantity, maxQuantity); // Assign to existing let variable
        
        console.log(`\n📊 SELL ORDER QUANTITY CALCULATION (GLOBAL FUNDS):`);
        console.log(`💰 Global Available Funds: ₹${globalFunds.availableFunds.toLocaleString('en-IN')}`);
        console.log(`⚡ Global Leveraged Funds (5x): ₹${globalFunds.leverageFunds.toLocaleString('en-IN')}`);
        console.log(`🔒 Global Usable Funds (95%): ₹${globalFunds.usableFunds.toLocaleString('en-IN')}`);
        console.log(`💵 Price per share: ₹${pricePerShare}`);
        console.log(`🔢 Max possible quantity: ${maxQuantity}`);
        console.log(`📋 Requested quantity: ${orderParams.quantity || 'auto-calculated'}`);
        console.log(`🎯 Final quantity: ${finalQuantity}`);
        console.log(`💸 Total investment: ₹${(finalQuantity * pricePerShare).toLocaleString('en-IN')}`);
        
        // Use calculated quantity for main orders (no test override)
        
        if (finalQuantity <= 0) {
            return res.status(400).json({
                success: false,
                error: `Insufficient funds for even 1 share short sell. Need ₹${pricePerShare}, have ₹${globalFunds.usableFunds}`,
                availableFunds: globalFunds.availableFunds,
                leverageFunds: globalFunds.leverageFunds,
                usableFunds: globalFunds.usableFunds,
                pricePerShare: pricePerShare
            });
        }
        
        // ✅ PROCEED WITH SELL ORDER (Frontend handles position management)
        console.log('✅ Processing main SELL order (position checks handled by frontend)');
        
        // Validate price is a valid number
        const forcedProductType = 'MIS';
        console.log(`🕐 Forcing product type: ${forcedProductType}`);
        
        const roundedPrice = roundToTickSize(orderParams.price, ltp);
        
        // Final orderParams with all enhancements
        const finalOrderParams = {
            ...orderParams,
            price: roundedPrice,
            product: forcedProductType,
            quantity: finalQuantity,  // Use calculated quantity
            ...(String(orderParams.order_type || '').toUpperCase() === 'MARKET' ? { market_protection: -1 } : {})
        };
        
        console.log('🚀 STEP 5: Placing enhanced MIS SELL (short) order:', finalOrderParams);
        const result = await kite.placeOrder('regular', finalOrderParams);
        
        if (result && result.order_id) {
            // Calculate expected margin requirement for short sale
            const marginRequired = finalQuantity * roundedPrice;
            
            // � AUTO KITE CHART: Open chart for successful main SELL order
            if (global.broadcastLiveData) {
                const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                global.broadcastLiveData({
                    type: 'order_charts',
                    charts: [{
                        symbol: orderParams.tradingsymbol,
                        token: parseInt(token) || null,
                        orderType: 'MAIN_SELL',
                        orderId: result.order_id,
                        message: `Kite chart opened for successful main SELL order: ${orderParams.tradingsymbol}`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            // 🔒 MARK SIGNAL AS EXECUTED: Prevent repeated attempts
            if (!isTargetOrder && symbol) {
                markSignalAsExecuted(symbol, 'SELL');
                console.log(`🔒 SELL signal marked as executed for ${symbol} - 5 minute cooldown active`);
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
                positionData: {
                    orderType: 'MIS_SHORT_SELLING',
                    marginRequired: marginRequired,
                    existingPositions: activePositionsFiltered.map(pos => ({
                        quantity: pos.quantity,
                        average_price: pos.average_price,
                        pnl: pos.pnl
                    }))
                },
                funds: {
                    available: globalFunds.availableFunds,
                    leveraged: globalFunds.leverageFunds,
                    marginUsed: marginRequired,
                    remaining: globalFunds.leverageFunds - marginRequired
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
            
            // 🎯 AUTO TARGET ORDER: Place centralized leverage-based target after successful main SELL order
            console.log(`🎯 Setting up leverage-based profit target for ${orderParams.tradingsymbol} after 3 seconds...`);
            setTimeout(async () => {
                try {
                    const newPositions = await kiteOrderPlacement.getPositions();
                    const allNewPositions = newPositions.net || [];
                    const newPosition = allNewPositions.find(pos => pos.tradingsymbol === orderParams.tradingsymbol && pos.quantity !== 0);
                    
                    if (newPosition) {
                        const avgPrice = parseFloat(newPosition.average_price);
                        const quantity = Math.abs(parseInt(newPosition.quantity));
                        const side = parseInt(newPosition.quantity) > 0 ? 'BUY' : 'SELL';
                        const targetPrice = calculateTargetPrice(avgPrice, quantity, side);
                        
                        console.log(`📊 Position found: Qty=${quantity}, AvgPrice=₹${avgPrice}, Target=₹${targetPrice.toFixed(2)}`);
                        
                        // Place target order (opposite side for profit)
                        const targetSide = side === 'BUY' ? 'SELL' : 'BUY';
                        const targetResult = await placeTargetOrder(access_token, orderParams.tradingsymbol, quantity, targetPrice, targetSide);
                        
                        if (targetResult.success) {
                            console.log(`✅ Leverage-based profit target placed: Order ID ${targetResult.orderId}`);
                            
                            // Calculate investment and profit details for frontend display
                            const investment = avgPrice * quantity;
                            const { targetProfitAmount, targetProfitPercent } = calculateProfitTargetFromInvestment(investment);
                            const actualProfitPerShare = Math.abs(targetPrice - avgPrice);
                            const actualTotalProfit = actualProfitPerShare * quantity;
                            
                            // 📊 AUTO KITE CHART: Open chart for successful target order
                            if (global.broadcastLiveData) {
                                const token = symbolMappings.symbolMappings[orderParams.tradingsymbol] || null;
                                global.broadcastLiveData({
                                    type: 'order_charts',
                                    charts: [{
                                        symbol: orderParams.tradingsymbol,
                                        token: parseInt(token) || null,
                                        orderType: 'AUTO_TARGET',
                                        orderId: targetResult.orderId,
                                        message: `Target order placed - leverage-based profit target for ${orderParams.tradingsymbol}`,
                                        timestamp: new Date().toISOString()
                                    }]
                                });
                                
                                // 🎯 TARGET ORDER DETAILS: Send investment and profit info
                                global.broadcastLiveData({
                                    type: 'target_order_placed',
                                    targetOrder: {
                                        symbol: orderParams.tradingsymbol,
                                        orderId: targetResult.orderId,
                                        avgPrice: avgPrice,
                                        quantity: quantity,
                                        investment: investment,
                                        targetPrice: targetPrice,
                                        expectedProfit: actualTotalProfit,
                                        profitPercentage: targetProfitPercent,
                                        side: side,
                                        targetSide: targetSide,
                                        placedAt: new Date().toISOString(),
                                        timestamp: new Date().toLocaleTimeString()
                                    }
                                });
                            }
                        }
                    } else {
                        console.log(`⚠️ No position found for ${orderParams.tradingsymbol} after SELL order`);
                    }
                } catch (targetError) {
                    console.error(`❌ Target order setup failed for ${orderParams.tradingsymbol}:`, targetError.message);
                }
            }, 3000); // Wait 3 seconds for position to update
            
        } else {
            throw new Error('Order placement failed');
        }
    } catch (error) {
        console.error('🚨 SELL ORDER ERROR:', error);

        const isMisCutoffError = String(error?.message || '').includes('Intraday orders (MIS) are allowed only till 3.25 PM');
        if (isMisCutoffError && req.body?.symbol && !req.body?.isTargetOrder) {
            markSignalAsExecuted(req.body.symbol, 'SELL');
        }

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

        res.status(isMisCutoffError ? 409 : 500).json(errorResponse);
    }
});

// Get positions route - same as webhook server
// POSITIONS API - RESTORED
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

// ORDERS API - RESTORED
router.get('/orders', async (req, res) => {
    try {
        console.log('📋 === ORDERS API ===');
        
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
                orders: []
            });
        }
        
        // Get open orders using new function
        const openOrders = await getOpenOrders(access_token);
        
        res.json({
            success: true,
            orders: openOrders,
            count: openOrders.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Orders API error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            orders: []
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



// MANUAL UNSUBSCRIBE ENDPOINT
// GENERAL SUBSCRIBE ROUTE - For any symbols (used by auto-subscribe)
router.post('/subscribe', async (req, res) => {
    try {
        console.log('🟢 Manual subscribe request received:', req.body);
        
        const { symbols } = req.body;
        
        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid symbols array provided',
                message: 'Please provide a symbols array with symbol names to subscribe'
            });
        }
        
        // Convert symbols to tokens
        const tokensToSubscribe = [];
        const subscribeResults = [];
        
        symbols.forEach(symbol => {
            const token = symbolMappings.symbolMappings[symbol];
            if (token) {
                const tokenInt = parseInt(token);
                if (!currentlySubscribed.has(tokenInt)) {
                    tokensToSubscribe.push(tokenInt);
                    currentlySubscribed.add(tokenInt);
                    subscribeResults.push({
                        symbol: symbol,
                        token: tokenInt,
                        status: 'subscribed'
                    });
                } else {
                    subscribeResults.push({
                        symbol: symbol,
                        token: tokenInt,
                        status: 'already_subscribed'
                    });
                }
            } else {
                subscribeResults.push({
                    symbol: symbol,
                    token: null,
                    status: 'token_not_found'
                });
            }
        });
        
        console.log(`🟢 Subscribing to ${tokensToSubscribe.length} new tokens:`, tokensToSubscribe);
        
        // Initialize KiteTicker if needed
        if (!globalTicker && global.initializeKiteTicker) {
            console.log('🔌 Initializing KiteTicker for subscriptions...');
            try {
                await global.initializeKiteTicker();
                console.log('✅ KiteTicker initialized successfully');
            } catch (tickerError) {
                console.error('❌ Failed to initialize KiteTicker:', tickerError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to initialize KiteTicker',
                    details: tickerError.message
                });
            }
        }
        
        // Perform subscription
        if (tokensToSubscribe.length > 0 && globalTicker) {
            globalTicker.subscribe(tokensToSubscribe);
            console.log(`✅ Successfully subscribed to ${tokensToSubscribe.length} new symbols`);
            console.log(`📊 Total subscriptions: ${currentlySubscribed.size}`);
            
            // Broadcast subscription update
            broadcastSubscriptionUpdate();
        } else if (tokensToSubscribe.length > 0 && !globalTicker) {
            console.warn('⚠️ No active ticker connection, but tokens were added to subscription set');
        }
        
        res.json({
            success: true,
            message: `Subscribe operation completed`,
            subscribedCount: tokensToSubscribe.length,
            totalSubscriptions: currentlySubscribed.size,
            results: subscribeResults,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error in manual subscribe:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to subscribe to symbols'
        });
    }
});

// Clear all subscriptions (manual cleanup)
router.post('/clear-all-subscriptions', async (req, res) => {
    try {
        console.log('🧹 MANUAL CLEAR: Clearing all subscriptions...');
        
        const clearedCount = currentlySubscribed.size;
        
        if (globalTicker && currentlySubscribed.size > 0) {
            const allTokens = Array.from(currentlySubscribed);
            globalTicker.unsubscribe(allTokens);
            console.log(`🔴 Unsubscribed from ${allTokens.length} tokens`);
        }
        
        // Clear all tracking
        currentlySubscribed.clear();
        scanTypeTracker.clear();
        
        // Clear global storage
        currentBuyStocks = [];
        currentSellStocks = [];
        
        console.log('✅ All subscriptions cleared');
        broadcastSubscriptionUpdate();
        
        res.json({
            success: true,
            message: `Cleared ${clearedCount} subscriptions`,
            cleared_count: clearedCount,
            remaining_subscriptions: currentlySubscribed.size
        });
        
    } catch (error) {
        console.error('❌ Error clearing all subscriptions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

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




// TARGET BUY ORDER ROUTE - For SELL positions (negative quantity)
router.post('/target-buy-order', async (req, res) => {
    console.log('🎯🔵 TARGET-BUY-ORDER route called with body:', req.body);
    
    try {
        const authHeader = req.headers.authorization;
        const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        let access_token = headerToken || req.body.access_token;
        
        const { symbol, avgPrice, quantity } = req.body;
        
        if (!symbol || !avgPrice || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Symbol, avgPrice, and quantity are required for target BUY order'
            });
        }
        
        console.log(`🎯 Processing TARGET BUY order for ${symbol}: AvgPrice=₹${avgPrice}, Qty=${Math.abs(quantity)}`);
        
        // Calculate target price using centralized leveraged-funds profit basis (for SELL position, BUY back lower)
        const targetPrice = calculateTargetPrice(avgPrice, Math.abs(quantity), 'SELL');
        
        // Place target BUY order
        const result = await placeTargetOrder(access_token, symbol, Math.abs(quantity), targetPrice, 'BUY');
        
        if (result.success) {
            console.log(`✅ TARGET BUY order placed: ${result.orderId}`);
            
            // 📊 CHART OPENING: Let frontend handle chart opening with correct URL format
            if (global.broadcastLiveData) {
                const token = symbolMappings.symbolMappings[symbol] || null;
                global.broadcastLiveData({
                    type: 'order_charts',
                    charts: [{
                        symbol: symbol,
                        token: parseInt(token) || null,
                        orderType: 'TARGET_BUY',
                        orderId: result.orderId,
                        message: `Target BUY order placed for ${symbol}`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            res.json({
                success: true,
                order_id: result.orderId,
                symbol: symbol,
                transaction_type: 'BUY',
                quantity: Math.abs(quantity),
                price: targetPrice.toFixed(2),
                message: 'Target BUY order placed successfully',
                timestamp: new Date().toISOString(),
                openChart: true // Signal frontend to open chart
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Failed to place target BUY order'
            });
        }
        
    } catch (error) {
        console.error('❌ Error in target BUY order:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// TARGET SELL ORDER ROUTE - For BUY positions (positive quantity)  
router.post('/target-sell-order', async (req, res) => {
    console.log('🎯🔴 TARGET-SELL-ORDER route called with body:', req.body);
    
    try {
        const authHeader = req.headers.authorization;
        const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        
        let access_token = headerToken || req.body.access_token;
        
        const { symbol, avgPrice, quantity } = req.body;
        
        if (!symbol || !avgPrice || !quantity) {
            return res.status(400).json({
                success: false,
                error: 'Symbol, avgPrice, and quantity are required for target SELL order'
            });
        }
        
        console.log(`🎯 Processing TARGET SELL order for ${symbol}: AvgPrice=₹${avgPrice}, Qty=${Math.abs(quantity)}`);
        
        // Calculate target price using centralized leveraged-funds profit basis (for BUY position, SELL higher)
        const targetPrice = calculateTargetPrice(avgPrice, Math.abs(quantity), 'BUY');
        
        // Place target SELL order
        const result = await placeTargetOrder(access_token, symbol, Math.abs(quantity), targetPrice, 'SELL');
        
        if (result.success) {
            console.log(`✅ TARGET SELL order placed: ${result.orderId}`);
            
            // 📊 CHART OPENING: Let frontend handle chart opening with correct URL format
            if (global.broadcastLiveData) {
                const token = symbolMappings.symbolMappings[symbol] || null;
                global.broadcastLiveData({
                    type: 'order_charts',
                    charts: [{
                        symbol: symbol,
                        token: parseInt(token) || null,
                        orderType: 'TARGET_SELL',
                        orderId: result.orderId,
                        message: `Target SELL order placed for ${symbol}`,
                        timestamp: new Date().toISOString()
                    }]
                });
            }
            
            res.json({
                success: true,
                order_id: result.orderId,
                symbol: symbol,
                transaction_type: 'SELL',
                quantity: Math.abs(quantity),
                price: targetPrice.toFixed(2),
                message: 'Target SELL order placed successfully',
                timestamp: new Date().toISOString(),
                openChart: true // Signal frontend to open chart
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Failed to place target SELL order'
            });
        }
        
    } catch (error) {
        console.error('❌ Error in target SELL order:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;

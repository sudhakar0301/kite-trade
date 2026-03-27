const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

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
global.autoTrade = false;

// Symbol mappings (sample - add more as needed)
const symbolMappings = {
  'RELIANCE': '738561',
  'TCS': '2953217', 
  'HDFCBANK': '341249',
  'INFY': '408065',
  'ICICIBANK': '1270529',
  'HINDUNILVR': '356865',
  'KOTAKBANK': '492033',
  'ITC': '424961',
  'SBIN': '779521',
  'BHARTIARTL': '2714625'
};

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

// Updated auto trading function that uses SEPARATE order routes
async function executeAutoTradingViaSeparateRoutes(buyStocks, sellStocks, accessToken) {
    const results = { buyOrders: [], sellOrders: [], errors: [], activePositions: [] };
    
    console.log('🤖 executeAutoTradingViaSeparateRoutes called with:');
    console.log(`   - buyStocks: ${buyStocks.length} stocks`);
    console.log(`   - sellStocks: ${sellStocks.length} stocks`);
    console.log(`   - accessToken: ${accessToken ? 'PROVIDED' : 'MISSING'}`);
    
    if (!accessToken || accessToken === 'demo_token') {
        console.log('⚠️ Invalid access token for auto trading');
        results.errors.push('Invalid or missing access token');
        return results;
    }
    
    console.log('🤖 Auto trading enabled - Processing orders via SEPARATE routes...');
    
    try {
        // First check active positions - key logic from webhook server
        console.log('🔍 Checking active positions...');
        const activePositions = await getActivePositions(accessToken);
        results.activePositions = activePositions;
        
        if (activePositions.length > 0) {
            console.log(`⚠️ ${activePositions.length} active positions found. Skipping new orders.`);
            results.errors.push(`Skipped: ${activePositions.length} active positions exist`);
            return results;
        }
        
        console.log('✅ No active positions. Proceeding with order placement via SEPARATE routes.');
        
        // Place only ONE order at a time - prefer buy orders first
        if (buyStocks.length > 0) {
            console.log('📈 Processing BUY signal via SEPARATE /api/buy-order route...');
            const stock = buyStocks[0]; // Take first buy signal
            try {
                const symbol = stock.s.replace('NSE:', '');
                const ltp = stock.d[0];
                
                console.log(`🎯 Calling SEPARATE route /api/buy-order for ${symbol} at ₹${ltp}`);
                const orderResult = await callSeparateBuyOrderRoute(accessToken, symbol, ltp, 1);
                if (orderResult && orderResult.success) {
                    results.buyOrders.push(orderResult);
                    console.log('✅ BUY order placed via SEPARATE route:', symbol);
                } else {
                    console.log('❌ BUY order failed via SEPARATE route:', symbol);
                    results.errors.push(`BUY order failed for ${symbol}`);
                }
            } catch (error) {
                console.error(`❌ BUY order error via SEPARATE route for ${stock.s}:`, error.message);
                results.errors.push(`BUY ${stock.s}: ${error.message}`);
            }
        } else if (sellStocks.length > 0) {
            console.log('📉 Processing SELL signal via SEPARATE /api/sell-order route...');
            const stock = sellStocks[0]; // Take first sell signal if no buy signals
            try {
                const symbol = stock.s.replace('NSE:', '');
                const ltp = stock.d[0];
                
                console.log(`🎯 Calling SEPARATE route /api/sell-order for ${symbol} at ₹${ltp}`);
                const orderResult = await callSeparateSellOrderRoute(accessToken, symbol, ltp, 1);
                if (orderResult && orderResult.success) {
                    results.sellOrders.push(orderResult);
                    console.log('✅ SELL order placed via SEPARATE route:', symbol);
                } else {
                    console.log('❌ SELL order failed via SEPARATE route:', symbol);
                    results.errors.push(`SELL order failed for ${symbol}`);
                }
            } catch (error) {
                console.error(`❌ SELL order error via SEPARATE route for ${stock.s}:`, error.message);
                results.errors.push(`SELL ${stock.s}: ${error.message}`);
            }
        } else {
            console.log('⚠️ No buy or sell stocks found for auto trading');
            results.errors.push('No buy or sell signals available');
        }
        
    } catch (error) {
        console.error('❌ Auto trading execution failed:', error);
        results.errors.push(`System error: ${error.message}`);
    }
    
    console.log(`🎯 Auto trading via SEPARATE routes complete - Orders: ${results.buyOrders.length + results.sellOrders.length}, Errors: ${results.errors.length}`);
    return results;
}

// Helper functions to call SEPARATE order routes
async function callSeparateBuyOrderRoute(accessToken, symbol, ltp, quantity = 1) {
    try {
        const productType = getProductType();
        const roundedPrice = roundToTickSize(ltp, ltp);
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'BUY',
            quantity: quantity,
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

async function callSeparateSellOrderRoute(accessToken, symbol, ltp, quantity = 1) {
    try {
        const productType = getProductType();
        const roundedPrice = roundToTickSize(ltp, ltp);
        
        const orderParams = {
            exchange: 'NSE',
            tradingsymbol: symbol,
            transaction_type: 'SELL',
            quantity: quantity,
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
async function autoSubscribeToResults(buyStocks, sellStocks, access_token) {
    try {
        if (!access_token) {
            console.log('⚠️ No access token provided for auto-subscription');
            return;
        }

        const allStocks = [...buyStocks, ...sellStocks];
        console.log(`🎯 Auto-subscribing to ${allStocks.length} stocks...`);
        
        // Note: Scanner subscriptions would be initialized here in full implementation
        console.log(`✅ Would subscribe to ${allStocks.length} stocks for live data`);
        
    } catch (error) {
        console.log('⚠️ Auto-subscription failed:', error.message);
    }
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
                { "left": "close|1", "operation": "greater", "right": 100 },
                { "left": "close|1", "operation": "less", "right": 4000 },
                { "left": "close|1", "operation": "less", "right": "EMA3|15" },
                { "left": "MACD.macd|1", "operation": "greater", "right": 0 },
                { "left": "EMA5|1", "operation": "greater", "right": "EMA9|1" },
                { "left": "ADX|1", "operation": "greater", "right": 25 },
                { "left": "ADX+DI|1", "operation": "greater", "right": 25 },
                { "left": "ADX|1", "operation": "greater", "right": "ADX-DI|1" },
                { "left": "EMA5|1", "operation": "greater", "right": "VWAP|1" },
                { "left": "MACD.macd|15", "operation": "greater", "right": 0 },
                { "left": "EMA5|5", "operation": "greater", "right": "EMA9|5" },
                { "left": "EMA3|15", "operation": "greater", "right": "EMA5|5" }
            ],
            ...commonSettings
        };

        // Sell scan payload - sophisticated TradingView filters
        const sellPayload = {
            "columns": commonColumns,
            "filter": [
                { "left": "is_blacklisted", "operation": "equal", "right": false },
                { "left": "close|1", "operation": "greater", "right": 100 },
                { "left": "close|1", "operation": "less", "right": 4000 },
                { "left": "MACD.macd|1", "operation": "less", "right": 0 },
                { "left": "EMA5|1", "operation": "less", "right": "EMA9|1" },
                { "left": "ADX|1", "operation": "greater", "right": 25 },
                { "left": "ADX|1", "operation": "greater", "right": "ADX+DI|1" },
                { "left": "EMA5|1", "operation": "less", "right": "VWAP|1" },
                { "left": "ADX-DI|1", "operation": "greater", "right": 25 },
                { "left": "MACD.macd|5", "operation": "less", "right": "MACD.signal|5" },
                { "left": "MACD.macd|15", "operation": "less", "right": "MACD.signal|15" },
                { "left": "MACD.macd|15", "operation": "less", "right": 0 },
                { "left": "EMA5|5", "operation": "less", "right": "EMA9|5" },
                { "left": "EMA5|5", "operation": "greater", "right": "EMA3|15" }
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

        // AUTO-SUBSCRIBE TO SCANNER RESULTS (but NO auto trading in backend)
        await autoSubscribeToResults(buyStocks, sellStocks, req.body.access_token);

        // Return ONLY scanner data - Frontend handles auto trading via separate routes
        const consolidatedResponse = {
            success: true,
            timestamp: new Date().toISOString(),
            duration: duration,
            totalStocks: buyStocks.length + sellStocks.length,
            buyStocks: buyStocks,
            sellStocks: sellStocks,
            message: 'Scanner completed. Frontend will handle auto trading via separate /api/buy-order and /api/sell-order routes.',
            statistics: {
                buyCount: buyStocks.length,
                sellCount: sellStocks.length,
                totalCount: buyStocks.length + sellStocks.length,
                executionTime: duration
            }
        };

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

// BUY ORDER ROUTE - Following webhook server pattern
router.post('/buy-order', async (req, res) => {
    console.log('🔵 BUY-ORDER route hit with body:', req.body);
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
        
        // Validate all required orderParams fields
        const requiredFields = ['exchange', 'tradingsymbol', 'transaction_type', 'quantity', 'price', 'product', 'order_type', 'validity'];
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
        
        // Validate quantity is a valid integer
        if (!Number.isInteger(orderParams.quantity) || orderParams.quantity <= 0) {
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
        
        // Apply tick size rounding to price
        const roundedPrice = roundToTickSize(orderParams.price, ltp);
        
        // Final orderParams with tick-size adjusted price
        const finalOrderParams = {
            ...orderParams,
            price: roundedPrice
        };
        
        console.log('🚀 Placing BUY order:', finalOrderParams);
        const result = await kite.placeOrder('regular', finalOrderParams);
        
        if (result && result.order_id) {
            // Return full payload structure
            res.json({
                success: true,
                order_id: result.order_id,
                message: `Buy order placed for ${orderParams.tradingsymbol}`,
                symbol: orderParams.tradingsymbol,
                quantity: finalOrderParams.quantity,
                price: roundedPrice,
                leveraged_amount: finalOrderParams.quantity * roundedPrice,
                order_type: finalOrderParams.order_type,
                order_category: 'BUY',
                ltp: ltp,
                ema5: ema5,
                calculatedData: {
                    originalPrice: orderParams.price,
                    tickSizeAdjustment: roundedPrice - orderParams.price
                },
                orderParams: finalOrderParams,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Order placement failed');
        }
    } catch (error) {
        console.error('❌ Error placing buy order:', error);
        
        // Include orderParams in error response for debugging
        const errorResponse = {
            success: false,
            error: error.message,
            order_category: 'BUY',
            timestamp: new Date().toISOString()
        };
        
        // Add orderParams to error response if available
        if (req.body.orderParams) {
            errorResponse.orderParams = req.body.orderParams;
            errorResponse.symbol = req.body.orderParams.tradingsymbol;
            errorResponse.quantity = req.body.orderParams.quantity;
            errorResponse.price = req.body.orderParams.price;
            errorResponse.leveraged_amount = req.body.orderParams.quantity * req.body.orderParams.price;
            errorResponse.order_type = req.body.orderParams.order_type;
            if (req.body.ltp) errorResponse.ltp = req.body.ltp;
            if (req.body.ema5) errorResponse.ema5 = req.body.ema5;
        }
        
        res.status(500).json(errorResponse);
    }
});

// SELL ORDER ROUTE - Following webhook server pattern
router.post('/sell-order', async (req, res) => {
    console.log('🔴 SELL-ORDER route hit with body:', req.body);
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
        
        // Validate all required orderParams fields
        const requiredFields = ['exchange', 'tradingsymbol', 'transaction_type', 'quantity', 'price', 'product', 'order_type', 'validity'];
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
        
        // Validate quantity is a valid integer
        if (!Number.isInteger(orderParams.quantity) || orderParams.quantity <= 0) {
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
        
        // Apply tick size rounding to price
        const roundedPrice = roundToTickSize(orderParams.price, ltp);
        
        // Final orderParams with tick-size adjusted price
        const finalOrderParams = {
            ...orderParams,
            price: roundedPrice
        };
        
        console.log('🚀 Placing SELL order:', finalOrderParams);
        const result = await kite.placeOrder('regular', finalOrderParams);
        
        if (result && result.order_id) {
            // Return full payload structure
            res.json({
                success: true,
                order_id: result.order_id,
                message: `Sell order placed for ${orderParams.tradingsymbol}`,
                symbol: orderParams.tradingsymbol,
                quantity: finalOrderParams.quantity,
                price: roundedPrice,
                leveraged_amount: finalOrderParams.quantity * roundedPrice,
                order_type: finalOrderParams.order_type,
                order_category: 'SELL',
                ltp: ltp,
                ema5: ema5,
                calculatedData: {
                    originalPrice: orderParams.price,
                    tickSizeAdjustment: roundedPrice - orderParams.price
                },
                orderParams: finalOrderParams,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Order placement failed');
        }
    } catch (error) {
        console.error('❌ Error placing sell order:', error);
        
        // Include orderParams in error response for debugging
        const errorResponse = {
            success: false,
            error: error.message,
            order_category: 'SELL',
            timestamp: new Date().toISOString()
        };
        
        // Add orderParams to error response if available
        if (req.body.orderParams) {
            errorResponse.orderParams = req.body.orderParams;
            errorResponse.symbol = req.body.orderParams.tradingsymbol;
            errorResponse.quantity = req.body.orderParams.quantity;
            errorResponse.price = req.body.orderParams.price;
            errorResponse.leveraged_amount = req.body.orderParams.quantity * req.body.orderParams.price;
            errorResponse.order_type = req.body.orderParams.order_type;
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
        
        const nse500Stocks = Object.keys(symbolMappings).map(symbol => ({
            symbol: symbol,
            instrumentToken: symbolMappings[symbol],
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
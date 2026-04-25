import React, { useState, useEffect, useCallback, useRef } from 'react';
import TradingDashboard from './components/TradingDashboard';
import WebSocketManager from './utils/WebSocketManager';
import TradingControlPanel from './components/TradingControlPanel';
// import TickAnalysisTable from './components/TickAnalysisTable';
import OrderExecutionPanel from './components/OrderExecutionPanel';
import SubscribedStockTracker from './components/SubscribedStockTracker';
import ScanResultsTables from './components/ScanResultsTables'; // NEW: Scan results tables
import PositionsOrdersTable from './components/PositionsOrdersTable'; // NEW: Positions and Orders display
import TargetOrderDetails from './components/TargetOrderDetails'; // NEW: Target order details display
// import AlgorithmTutorial from './components/AlgorithmTutorial';
import {
  AppContainer,
  ControlPanelWrapper,
  ContentWrapper,
  MainContent,
  ScannerSection,
  ScanBlockNotification,
  ScanBlockHeader,
  ScanBlockDetails,
  ScanBlockTiming
} from './App.styles';
import './App.css';



function App() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [tickData, setTickData] = useState({}); // Real-time tick data for SubscribedStockTracker
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [buySignals, setBuySignals] = useState([]);
  const [sellSignals, setSellSignals] = useState([]);
  const [crossoverBuyStocks, setCrossoverBuyStocks] = useState([]);
  const [crossbelowSellStocks, setCrossbelowSellStocks] = useState([]);
  const [allStocks, setAllStocks] = useState([]); // All low-price stocks for frontend filtering
  const [intersectionSummary, setIntersectionSummary] = useState(null); // Intersection results summary
  const [finalBuyHistory, setFinalBuyHistory] = useState([]); // Historical final buy signals with timestamps
  const [finalSellHistory, setFinalSellHistory] = useState([]); // Historical final sell signals with timestamps
  const [symbolMappings, setSymbolMappings] = useState({});
  const [lastUpdate, setLastUpdate] = useState('Never');
  const [orderNotification, setOrderNotification] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [kiteLoginStatus, setKiteLoginStatus] = useState('checking');
  const [accessToken, setAccessToken] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [scanBlockInfo, setScanBlockInfo] = useState({
    isBlocked: false,
    reason: null,
    message: null,
    candlePosition: null,
    nextScanAllowedAt: null
  });
  const [pollCountdown, setPollCountdown] = useState(0);
  const [pollInterval, setPollInterval] = useState(15); // Default 15 seconds
  const [orderExecutions, setOrderExecutions] = useState([]); // Track order attempts and results
  const [orderPanelOpen, setOrderPanelOpen] = useState(false); // Show/hide order panel
  const [lastSpokenMessage, setLastSpokenMessage] = useState('');
  const [lastSpeakTime, setLastSpeakTime] = useState(0);
  const [realSubscriptionCount, setRealSubscriptionCount] = useState(0);
  
  // NEW: Scan results table data
  const [scanResults, setScanResults] = useState({
    buyTable: [],
    sellTable: [],
    executionMode: 'direct',
    autoTrade: false,
    lastScanTime: null
  });

  // NEW: Positions and Orders data
  const [positionsData, setPositionsData] = useState([]);
  const [ordersData, setOrdersData] = useState([]);
  const [positionsOrdersLoading, setPositionsOrdersLoading] = useState(false);
  const [positionsOrdersError, setPositionsOrdersError] = useState(null);
  const [lastPositionsOrdersUpdate, setLastPositionsOrdersUpdate] = useState(null);

  // NEW: Target Order Details
  const [targetOrderDetails, setTargetOrderDetails] = useState([]);
  const [showTargetOrderDetails, setShowTargetOrderDetails] = useState(false);

  // NEW: Signal Stocks Tracking for Tick-Driven Execution
  const [signalStocks, setSignalStocks] = useState({
    buySignals: [],
    sellSignals: [],
    lastUpdate: null
  });

  // Debug state changes
  useEffect(() => {
    console.log('🚨 [STATE] orderPanelOpen changed to:', orderPanelOpen);
  }, [orderPanelOpen]);

  useEffect(() => {
    console.log('🚨 [STATE] orderExecutions changed, count:', orderExecutions.length);
    orderExecutions.forEach((order, index) => {
      console.log(`  ${index + 1}. ${order.symbol} ${order.type} ${order.status}`);
    });
  }, [orderExecutions]);

  // Fetch initial auto trading status from backend
  useEffect(() => {
    const fetchAutoTradingStatus = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/auto-trading-status', {
          headers: {
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          }
        });
        
        const result = await response.json();
        
        if (result.success) {
          setAutoTradingEnabled(result.autoTradingActive);
          console.log(`🔒 Initial auto trading status loaded: ${result.autoTradingActive ? 'ENABLED' : 'DISABLED'}`);
        }
      } catch (error) {
        console.error('❌ Error fetching auto trading status:', error);
      }
    };
    
    fetchAutoTradingStatus();
  }, []); // Run once on mount

  // Function to identify target orders from positions and orders data
  const identifyTargetOrders = useCallback((positions, orders) => {
    const targetOrders = [];
    
    // Filter out positions with zero quantity
    const activePositions = positions.filter(pos => pos.quantity !== 0);
    
    activePositions.forEach(position => {
      const positionSymbol = position.tradingsymbol;
      const positionQuantity = parseInt(position.quantity);
      const positionSide = positionQuantity > 0 ? 'BUY' : 'SELL';
      const avgPrice = parseFloat(position.average_price || position.price || 0);
      
      // Look for orders in opposite direction (target orders)
      const targetSide = positionSide === 'BUY' ? 'SELL' : 'BUY';
      
      const matchingOrders = orders.filter(order => 
        order.tradingsymbol === positionSymbol && 
        order.transaction_type === targetSide &&
        order.status === 'OPEN'
      );
      
      matchingOrders.forEach(order => {
        const orderPrice = parseFloat(order.price || 0);
        const orderQuantity = parseInt(order.quantity || 0);
        const investment = avgPrice * Math.abs(positionQuantity);
        
        // Calculate expected profit based on price difference
        const pricePerShare = Math.abs(orderPrice - avgPrice);
        const expectedProfit = pricePerShare * orderQuantity;
        const profitPercentage = investment > 0 ? (expectedProfit / investment) * 100 : 0;
        
        const targetOrder = {
          symbol: positionSymbol,
          orderId: order.order_id,
          avgPrice: avgPrice,
          quantity: orderQuantity,
          investment: investment,
          targetPrice: orderPrice,
          expectedProfit: expectedProfit,
          profitPercentage: profitPercentage.toFixed(2),
          side: positionSide,
          targetSide: targetSide,
          placedAt: order.order_timestamp || new Date().toISOString(),
          timestamp: new Date(order.order_timestamp || Date.now()).toLocaleTimeString(),
          status: order.status,
          orderType: order.order_type
        };
        
        targetOrders.push(targetOrder);
      });
    });
    
    return targetOrders;
  }, []);

  // Fetch positions and orders data
  const fetchPositionsAndOrders = useCallback(async () => {
    setPositionsOrdersLoading(true);
    setPositionsOrdersError(null);
    
    try {
      // Fetch both positions and orders in parallel
      const [positionsRes, ordersRes] = await Promise.all([
        fetch('http://localhost:5000/api/positions', {
          headers: {
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          }
        }),
        fetch('http://localhost:5000/api/orders', {
          headers: {
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          }
        })
      ]);
      
      let positions = [];
      let orders = [];
      
      if (positionsRes.ok) {
        const posData = await positionsRes.json();
        positions = posData.positions || [];
      }
      
      if (ordersRes.ok) {
        const ordData = await ordersRes.json();
        orders = ordData.orders || [];
      }
      
      setPositionsData(positions);
      setOrdersData(orders);
      setLastPositionsOrdersUpdate(new Date().toLocaleTimeString());
      
      // Match positions with orders to identify target orders
      const matchedTargetOrders = identifyTargetOrders(positions, orders);
      
      if (matchedTargetOrders.length > 0) {
        setTargetOrderDetails(prevDetails => {
          // Merge identified target orders with existing ones from WebSocket
          // Remove any existing orders that are no longer open
          const activeOrderIds = orders.filter(o => o.status === 'OPEN').map(o => o.order_id);
          const activeExistingOrders = prevDetails.filter(order => 
            !order.orderId || activeOrderIds.includes(order.orderId) || 
            (Date.now() - new Date(order.placedAt).getTime()) < 300000 // Keep recent orders for 5 minutes
          );
          
          // Add newly identified target orders if they don't already exist
          const mergedOrders = [...activeExistingOrders];
          matchedTargetOrders.forEach(newOrder => {
            const existingIndex = mergedOrders.findIndex(order => order.orderId === newOrder.orderId);
            if (existingIndex >= 0) {
              // Update existing order with fresh data
              mergedOrders[existingIndex] = newOrder;
            } else {
              // Add new identified target order
              mergedOrders.push(newOrder);
            }
          });
          
          // Sort by timestamp (newest first) and keep last 10
          return mergedOrders
            .sort((a, b) => new Date(b.placedAt || b.timestamp) - new Date(a.placedAt || a.timestamp))
            .slice(0, 10);
        });
        
        setShowTargetOrderDetails(true);
        console.log(`🎯 Found ${matchedTargetOrders.length} target orders from positions/orders matching:`, 
          matchedTargetOrders.map(t => `${t.symbol}:${t.orderId}(${t.status})`));
      }
    } catch (err) {
      console.error('Error fetching positions/orders:', err);
      setPositionsOrdersError('Failed to fetch data. Make sure the backend is running.');
    } finally {
      setPositionsOrdersLoading(false);
    }
  }, [accessToken]);

  // Auto-refresh positions and orders every 5 seconds
  useEffect(() => {
    if (accessToken) {
      fetchPositionsAndOrders();
      
      const interval = setInterval(fetchPositionsAndOrders, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchPositionsAndOrders, accessToken]);

  // Refs
  const pollIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const hasInitialLoaded = useRef(false);

  // Refs for WebSocket handler to access current values (avoiding stale closure)
  const autoTradingEnabledRef = useRef(autoTradingEnabled);
  const kiteLoginStatusRef = useRef(kiteLoginStatus);
  const signalStocksRef = useRef(signalStocks);
  const executeAutoTradingRef = useRef(null);

  // Update refs when values change
  useEffect(() => {
    autoTradingEnabledRef.current = autoTradingEnabled;
  }, [autoTradingEnabled]);

  useEffect(() => {
    kiteLoginStatusRef.current = kiteLoginStatus;
  }, [kiteLoginStatus]);

  useEffect(() => {
    signalStocksRef.current = signalStocks;
  }, [signalStocks]);



  // Handle updating order executions from external components
  const handleUpdateOrderExecutions = useCallback((updateFn) => {
    console.log('🔧 [STATE] handleUpdateOrderExecutions called');
    setOrderExecutions(prev => {
      const updated = updateFn(prev);
      console.log('🔧 [STATE] Order executions updated:', prev.length, '→', updated.length);
      return updated;
    });
  }, []);

  // Load symbol mappings from backend API
  useEffect(() => {
    const loadSymbolMappings = async () => {
      try {
        console.log('🔍 Loading symbol mappings from backend...');
        const response = await fetch('http://localhost:5000/api/symbol-mappings');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.symbolMappings) {
            setSymbolMappings(data.symbolMappings);
            console.log('✅ Symbol mappings loaded:', Object.keys(data.symbolMappings).length, 'symbols');
            console.log('📊 Sample symbols:', Object.keys(data.symbolMappings).slice(0, 10));
          } else {
            console.error('❌ Invalid response format from symbol mappings API');
          }
        } else {
          console.error('❌ Failed to fetch symbol mappings, status:', response.status);
        }
      } catch (error) {
        console.error('❌ Error loading symbol mappings:', error);
      }
    };

    loadSymbolMappings();
  }, []);

  // Helper function to open named chart tabs
  const openNamedChart = useCallback((symbol, chartType = 'main') => {
    // Fallback mappings only if backend failed
    const fallbackMappings = {
      'RELIANCE': '738561',
      'TCS': '2953217',
      'INFY': '408065',
      'HDFCBANK': '341249',
      'ICICIBANK': '1270529'
    };
    
    // Use loaded mappings or fallback
    const mappingsToUse = Object.keys(symbolMappings).length > 0 ? symbolMappings : fallbackMappings;
    const mappingCount = Object.keys(mappingsToUse).length;
    
    console.log(`🔍 Chart request for symbol: "${symbol}" using ${mappingCount} mappings`);
    
    const cleanSymbol = symbol.replace('NSE:', '').replace('BSE:', '');
    const token = mappingsToUse[cleanSymbol];
    
    console.log(`   Clean symbol: "${cleanSymbol}" → Token: ${token || 'NOT FOUND'}`);
    
    // Always use Kite chart URL format with token (use default token if not found)
    const finalToken = token || '0'; // Use '0' as fallback if no token found
    const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${finalToken}`;
    const tabName = 'kite-chart-tab'; // Use same simple tab name as StockResultsTable
    
    console.log(`🚀 Opening ${chartType} Kite chart for ${cleanSymbol}`);
    
    try {
      const newTab = window.open(chartUrl, tabName);
      if (newTab) {
        newTab.focus();
        console.log(`✅ Kite chart opened in tab: ${tabName}`);
      } else {
        console.error('❌ Kite chart blocked by popup blocker');
        alert(`📊 Chart blocked!\nSymbol: ${cleanSymbol}\nEnable popups to open Kite charts.`);
      }
    } catch (error) {
      console.error('❌ Error opening Kite chart:', error);
      alert(`📊 No chart available for ${cleanSymbol}\nChart failed to open.\nSymbol mappings loaded: ${mappingCount}`);
    }
  }, [symbolMappings]);

  // Check Kite login status
  useEffect(() => {
    const checkKiteStatus = async () => {
      console.log('🔍 Checking Kite login status...');
      
      const token = localStorage.getItem('kite_access_token');
      console.log('   - Token in localStorage:', token ? 'present' : 'missing');
      
      if (token && token !== 'demo_token') {
        // Always set the token first, regardless of API status
        setAccessToken(token);
        
        try {
          // Call backend profile endpoint to verify token
          const response = await fetch(`http://localhost:5000/api/profile?access_token=${encodeURIComponent(token)}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.status === 404) {
            console.log('📊 Backend server not running - using cached token');
            setKiteLoginStatus('logged-in'); // Assume valid if we have token but server is down
            return;
          }
          
          const profileData = await response.json();
          console.log('🔍 Profile API response:', profileData);
          
          if (response.ok && profileData.success && profileData.user_name) {
            setKiteLoginStatus('logged-in');
            console.log('✅ Kite login confirmed - User:', profileData.user_name);
          } else {
            console.log('❌ Kite token invalid/expired. Error:', profileData.error);
            setKiteLoginStatus('not-logged-in');
          }
        } catch (error) {
          console.error('❌ Kite status check failed (network/server error):', error.message);
          // Don't remove token on network errors, assume it's still valid
          setKiteLoginStatus('logged-in'); // Optimistic assumption when server is down
          console.log('📊 Assuming token is still valid (server unreachable)');
        }
      } else {
        console.log('❌ No valid token found');
        setKiteLoginStatus('not-logged-in');
      }
    };
    
    checkKiteStatus();
  }, []);

  // Kite login function
  const openKiteLogin = useCallback(() => {
    console.log('🔐 Opening Kite login...');
    
    // Open OAuth login in new window
    const loginWindow = window.open(
      'http://localhost:5000/oauth/login',
      'kiteLogin',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );
    
    // Listen for messages from the login window
    const handleMessage = (event) => {
      if (event.origin !== 'http://localhost:5000') return;
      
      if (event.data.type === 'KITE_LOGIN_SUCCESS') {
        console.log('✅ Received login success message');
        setAccessToken(event.data.access_token);
        setKiteLoginStatus('logged-in');
        localStorage.setItem('kite_access_token', event.data.access_token);
        localStorage.setItem('kite_login_time', Date.now().toString());
        
        // Remove event listener
        window.removeEventListener('message', handleMessage);
        
        // Close login window if still open
        if (loginWindow) {
          loginWindow.close();
        }
      } else if (event.data.type === 'KITE_LOGIN_ERROR') {
        console.error('❌ Login error:', event.data.error);
        setKiteLoginStatus('not-logged-in');
        
        // Remove event listener  
        window.removeEventListener('message', handleMessage);
      }
    };
    
    // Add message listener
    window.addEventListener('message', handleMessage);
    
    // Backup: Poll for access token in localStorage in case postMessage fails
    const checkLogin = setInterval(() => {
      const storedToken = localStorage.getItem('kite_access_token');
      const loginTime = localStorage.getItem('kite_login_time');
      
      if (storedToken && loginTime && (Date.now() - parseInt(loginTime)) < 30000) {
        console.log('✅ Found access token in localStorage (backup polling)');
        setAccessToken(storedToken);
        setKiteLoginStatus('logged-in');
        clearInterval(checkLogin);
        
        // Remove event listener
        window.removeEventListener('message', handleMessage);
        
        // Close login window if still open
        if (loginWindow && !loginWindow.closed) {
          loginWindow.close();
        }
      }
    }, 2000);
    
    // Stop checking after 5 minutes
    setTimeout(() => {
      clearInterval(checkLogin);
      window.removeEventListener('message', handleMessage);
    }, 300000);
    
    // Handle window closed manually
    const checkClosed = setInterval(() => {
      if (loginWindow.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 1000);
  }, []); // No dependencies needed for openKiteLogin

  // Speech synthesis function with duplicate prevention
  const speak = useCallback((text) => {
    if (voiceEnabled && 'speechSynthesis' in window) {
      const now = Date.now();
      // Prevent duplicate messages within 2 seconds
      if (text === lastSpokenMessage && (now - lastSpeakTime) < 2000) {
        console.log('🔇 Prevented duplicate voice alert:', text);
        return;
      }
      
      setLastSpokenMessage(text);
      setLastSpeakTime(now);
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Get available voices and select a female voice
      const voices = speechSynthesis.getVoices();
      
      // Find female voice (look for common female voice names or gender indicators)
      const femaleVoice = voices.find(voice => 
        voice.name.toLowerCase().includes('female') ||
        voice.name.toLowerCase().includes('woman') ||
        voice.name.toLowerCase().includes('zira') ||
        voice.name.toLowerCase().includes('eva') ||
        voice.name.toLowerCase().includes('susan') ||
        voice.name.toLowerCase().includes('hazel') ||
        voice.name.toLowerCase().includes('anna') ||
        voice.name.toLowerCase().includes('catherine') ||
        voice.name.toLowerCase().includes('samantha') ||
        voice.gender === 'female'
      ) || voices.find(voice => voice.lang.startsWith('en') && !voice.name.toLowerCase().includes('male'));
      
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      
      // Set additional voice properties for better quality
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1.2; // Higher pitch for female voice
      utterance.volume = 0.8; // Comfortable volume
      
      speechSynthesis.speak(utterance);
    }
  }, [voiceEnabled, lastSpokenMessage, lastSpeakTime]);

  // Auto trading via DIRECT ORDER ROUTES with POSITION MANAGEMENT
  const executeAutoTradingViaSeparateRoutes = useCallback(async (buyStocks, sellStocks) => {
    console.log('🎯 [AUTO-TRADE] === DIRECT ORDER EXECUTION WITH PRE-CALCULATED QUANTITIES ===');
    console.log('🎯 [AUTO-TRADE] autoTradingEnabled:', autoTradingEnabled);
    console.log('🎯 [AUTO-TRADE] buyStocks count:', buyStocks.length);
    console.log('🎯 [AUTO-TRADE] sellStocks count:', sellStocks.length);
    
    // Log pre-calculated data for each stock
    buyStocks.forEach(stock => {
      if (stock.preCalculated) {
        console.log(`💰 [BUY] ${stock.symbol}: Qty=${stock.preCalculated.quantity}, Investment=₹${stock.preCalculated.investment.toFixed(2)}, Funds=₹${stock.preCalculated.usableFunds.toLocaleString('en-IN')}`);
      } else {
        console.log(`⚠️ [BUY] ${stock.symbol}: No pre-calculated data available`);
      }
    });
    
    sellStocks.forEach(stock => {
      if (stock.preCalculated) {
        console.log(`💰 [SELL] ${stock.symbol}: Qty=${stock.preCalculated.quantity}, Investment=₹${stock.preCalculated.investment.toFixed(2)}, Funds=₹${stock.preCalculated.usableFunds.toLocaleString('en-IN')}`);
      } else {
        console.log(`⚠️ [SELL] ${stock.symbol}: No pre-calculated data available`);
      }
    });
    
    // Check if auto trading is enabled first
    if (!autoTradingEnabled) {
      console.log('⚠️ [AUTO-TRADE] Auto trading is DISABLED - skipping order attempts');
      return;
    }
    
    const token = accessToken || localStorage.getItem('kite_access_token');
    if (!token || token === 'demo_token') {
      console.log('⚠️ No valid access token for auto trading');
      return;
    }

    console.log(`🤖 Executing auto trading with PRE-CALCULATED quantities:`);
    console.log(`   - Buy stocks: ${buyStocks.length}`);
    console.log(`   - Sell stocks: ${sellStocks.length}`);

    try {
      // 🚦 STEP 1: CHECK EXISTING POSITIONS FIRST
      console.log('🔍 Step 1: Checking existing positions...');
      const positionsResponse = await fetch('http://localhost:5000/api/positions', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!positionsResponse.ok) {
        throw new Error(`Failed to fetch positions: ${positionsResponse.status}`);
      }

      const positionsData = await positionsResponse.json();
      const activePositions = positionsData.positions || [];
      const activePositionsFiltered = activePositions.filter(pos => pos.quantity !== 0);
      
      console.log(`📊 Found ${activePositionsFiltered.length} active positions:`, activePositionsFiltered.map(pos => pos.tradingsymbol));

      let successfulOrders = 0;
      let failedOrders = 0;
      let blockedOrders = 0;

      // 🎯 LIMIT TRADING: Only trade the FIRST stock from each category to avoid overwhelming orders
      const maxOrdersPerType = 1;
      const buyStocksToTrade = buyStocks.slice(0, maxOrdersPerType);
      const sellStocksToTrade = sellStocks.slice(0, maxOrdersPerType);
      
      console.log(`🎯 CONTROLLED TRADING: Selected ${buyStocksToTrade.length} BUY + ${sellStocksToTrade.length} SELL from ${buyStocks.length + sellStocks.length} total signals`);

      // 🚦 DECISION LOGIC: Positions exist vs no positions
      if (activePositionsFiltered.length > 0) {
        console.log('⚠️ POSITIONS EXIST - Using intelligent order logic');
        
        // For each stock, check if we have a position for that symbol
        for (const stock of buyStocksToTrade) {
          const hasPositionForSymbol = activePositionsFiltered.some(pos => pos.tradingsymbol === stock.symbol);
          
          if (hasPositionForSymbol) {
            // ✅ ALLOW TARGET ORDER for existing position
            console.log(`🎯 Placing TARGET order for existing position: ${stock.symbol}`);
            const result = await executeOrder('BUY', stock, token, true); // isTargetOrder: true
            if (result.success) successfulOrders++; else failedOrders++;
          } else {
            // ❌ BLOCK ORDER for different symbol
            console.log(`🚫 BLOCKING BUY order for ${stock.symbol} - position exists for other symbols`);
            blockedOrders++;
          }
        }

        for (const stock of sellStocksToTrade) {
          const hasPositionForSymbol = activePositionsFiltered.some(pos => pos.tradingsymbol === stock.symbol);
          
          if (hasPositionForSymbol) {
            // ✅ ALLOW TARGET ORDER for existing position
            console.log(`🎯 Placing TARGET order for existing position: ${stock.symbol}`);
            const result = await executeOrder('SELL', stock, token, true); // isTargetOrder: true
            if (result.success) successfulOrders++; else failedOrders++;
          } else {
            // ❌ BLOCK ORDER for different symbol
            console.log(`🚫 BLOCKING SELL order for ${stock.symbol} - position exists for other symbols`);
            blockedOrders++;
          }
        }
      } else {
        // ✅ NO POSITIONS - EXECUTE MAIN ORDERS NORMALLY
        console.log('✅ NO POSITIONS EXIST - Executing main orders normally');
        
        // Execute BUY orders (LIMITED)
        for (const stock of buyStocksToTrade) {
          const result = await executeOrder('BUY', stock, token, false); // isTargetOrder: false
          if (result.success) successfulOrders++; else failedOrders++;
        }

        // Execute SELL orders
        for (const stock of sellStocksToTrade) {
          const result = await executeOrder('SELL', stock, token, false); // isTargetOrder: false
          if (result.success) successfulOrders++; else failedOrders++;
        }
      }

      // Show completion notification
      const totalAttempts = buyStocksToTrade.length + sellStocksToTrade.length;
      
      console.log(`🎯 [AUTO-TRADE] EXECUTION COMPLETE:`);
      console.log(`   - Signal-based orders: ${successfulOrders}/${totalAttempts} successful, ${blockedOrders} blocked`);
      console.log(`   - Total successful orders: ${successfulOrders}`);
      
      if (successfulOrders > 0 && voiceEnabled) {
        speak(`${successfulOrders} orders executed successfully`);
      }
      
    } catch (error) {
      console.error('❌ [AUTO-TRADE] Execution failed:', error);
      if (voiceEnabled) {
        speak('Auto trading execution failed');
      }
    }
  }, [autoTradingEnabled, accessToken, voiceEnabled, speak, openNamedChart]);

  // Update executeAutoTradingRef when function changes
  useEffect(() => {
    executeAutoTradingRef.current = executeAutoTradingViaSeparateRoutes;
  }, [executeAutoTradingViaSeparateRoutes]);

  // 🎯 SUBSCRIBE SIGNAL STOCKS TO KITETICKER
  const subscribeToSignalStocks = useCallback(async (buyStocks, sellStocks) => {
    try {
      const token = accessToken || localStorage.getItem('kite_access_token');
      if (!token || token === 'demo_token') {
        console.log('⚠️ No valid access token for stock subscription');
        return;
      }

      const allSignalStocks = [...buyStocks, ...sellStocks];
      if (allSignalStocks.length === 0) {
        console.log('📊 No signal stocks to subscribe');
        return;
      }

      console.log(`📡 Subscribing ${allSignalStocks.length} signal stocks to KiteTicker...`);
      console.log('   - Buy signals:', buyStocks.map(s => s.symbol || s.s));
      console.log('   - Sell signals:', sellStocks.map(s => s.symbol || s.s));

      // Update signal stocks state for tick handler
      setSignalStocks({
        buySignals: buyStocks,
        sellSignals: sellStocks,
        lastUpdate: new Date().toISOString()
      });

      // Call backend to subscribe stocks
      const subscribeResponse = await fetch('http://localhost:5000/api/subscribe-signal-stocks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stocks: allSignalStocks.map(stock => ({
            symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
            ltp: stock.ltp || stock.d?.[0] || 0,
            signalType: buyStocks.includes(stock) ? 'BUY' : 'SELL'
          }))
        })
      });

      if (subscribeResponse.ok) {
        const subscribeResult = await subscribeResponse.json();
        console.log('✅ Signal stocks subscription successful:', subscribeResult.subscribed_count || 0, 'stocks');
        
        if (voiceEnabled && subscribeResult.subscribed_count > 0) {
          speak(`Subscribed ${subscribeResult.subscribed_count} signal stocks for tick monitoring`);
        }
      } else {
        console.log('⚠️ Signal stocks subscription failed:', subscribeResponse.status);
      }

    } catch (error) {
      console.error('❌ Error subscribing signal stocks:', error);
    }
  }, [accessToken, voiceEnabled, speak]);

  // 🔍 CHECK IF STOCK HAS ACTIVE SIGNALS
  const hasSignalForStock = useCallback((tickSymbol) => {
    const cleanSymbol = tickSymbol.replace('NSE:', '').replace('BSE:', '');
    
    const hasBuySignal = signalStocks.buySignals.some(stock => {
      const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
      return stockSymbol === cleanSymbol;
    });
    
    const hasSellSignal = signalStocks.sellSignals.some(stock => {
      const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
      return stockSymbol === cleanSymbol;
    });
    
    return hasBuySignal || hasSellSignal;
  }, [signalStocks]);

  // 📊 GET SIGNAL STOCKS FOR EXECUTION
  const getSignalStocks = useCallback((signalType, tickSymbol) => {
    const cleanSymbol = tickSymbol.replace('NSE:', '').replace('BSE:', '');
    const targetSignals = signalType === 'buy' ? signalStocks.buySignals : signalStocks.sellSignals;
    
    return targetSignals.filter(stock => {
      const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
      return stockSymbol === cleanSymbol;
    });
  }, [signalStocks]);

  // 🎯 POSITION & ORDER CHECK WITH DEDICATED TARGET ROUTES
  const checkPositionsAndOrdersFromFrontend = useCallback(async () => {
    try {
      const token = accessToken || localStorage.getItem('kite_access_token');
      if (!token || token === 'demo_token') {
        console.log('⚠️ No valid access token for position & order check');
        return;
      }

      console.log('🔍 === FRONTEND POSITION & ORDER CHECK WITH DEDICATED TARGET ROUTES ===');
      
      // STEP 1: Get current active positions
      console.log('📡 Fetching positions from backend API...');
      const positionsResponse = await fetch('http://localhost:5000/api/positions', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      let activePositions = [];
      if (positionsResponse.ok) {
        const positionsData = await positionsResponse.json();
        activePositions = positionsData.positions?.filter(pos => pos.quantity !== 0) || [];
      } else {
        console.log('⚠️ Could not fetch positions');
        return;
      }
      
      // STEP 2: Get open orders
      console.log('📋 Fetching open orders from backend API...');
      const ordersResponse = await fetch('http://localhost:5000/api/orders', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      let openOrders = [];
      if (ordersResponse.ok) {
        const ordersData = await ordersResponse.json();
        openOrders = ordersData.orders || [];
      } else {
        console.log('⚠️ Could not fetch orders');
        return;
      }
      
      // STEP 3: Analyze and place missing target orders
      if (activePositions.length === 0) {
        console.log('✅ No active positions found - no target orders needed');
        return;
      }

      console.log(`📊 Found ${activePositions.length} active positions:`, 
        activePositions.map(pos => ({
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
      
      // STEP 4: Check each position for missing target orders and place them
      for (const position of activePositions) {
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
          console.log(`✅ Target order already exists for ${symbol}: ${existingTargetOrder.order_id} (${targetSide} ${existingTargetOrder.quantity} @ ₹${existingTargetOrder.price})`);
          continue;
        }
        
        // STEP 5: Place missing target order using dedicated route
        console.log(`🆕 No target order found for ${symbol} - PLACING TARGET ORDER FROM FRONTEND`);
        
        try {
          // Determine which dedicated route to use
          const targetRoute = targetSide === 'SELL' ? 'target-sell-order' : 'target-buy-order';
          
          // Create target order data for dedicated route
          const targetOrderData = {
            symbol: symbol,
            avgPrice: avgPrice,
            quantity: quantity, // Keep original quantity (positive or negative)
            access_token: token
          };
          
          console.log(`📤 Calling dedicated route /${targetRoute} for ${symbol}: AvgPrice=₹${avgPrice}, Qty=${quantity}`);
          
          const targetResponse = await fetch(`http://localhost:5000/api/${targetRoute}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(targetOrderData)
          });
          
          const targetResult = await targetResponse.json();
          
          if (targetResult.success) {
            console.log(`✅ Frontend placed target order for ${symbol}: ${targetResult.order_id || 'Order ID pending'}`);
            
            // 📊 OPEN NAMED CHART for successful target order
            if (targetResult.openChart) {
              console.log(`🚀 Opening named chart for target order: ${symbol}`);
              openNamedChart(symbol, 'target-order');
            }
            
            if (voiceEnabled) {
              speak(`Target order placed for ${symbol}`);
            }
          } else {
            console.log(`❌ Failed to place target order for ${symbol}:`, targetResult.error);
          }
          
        } catch (targetError) {
          console.error(`❌ Error placing target order for ${symbol}:`, targetError.message);
        }
      }
      
      console.log('🎯 Frontend position & order check complete - DEDICATED TARGET ROUTES USED');
      
    } catch (error) {
      console.error('❌ Error in frontend position & order check:', error.message);
    }
  }, [accessToken, voiceEnabled, speak, openNamedChart]);

  // Helper function to execute individual orders
  const executeOrder = useCallback(async (type, stock, token, isTargetOrder) => {
    try {
      const orderTypeText = isTargetOrder ? 'TARGET' : 'MAIN';
      const preCalcInfo = stock.preCalculated ? `Qty=${stock.preCalculated.quantity}, Investment=₹${stock.preCalculated.investment.toFixed(2)}` : 'No pre-calc data';
      console.log(`${type === 'BUY' ? '🔵' : '🔴'} Attempting ${orderTypeText} ${type} order for ${stock.symbol} @ ₹${stock.ltp} (${preCalcInfo})`);
      
      // Prepare order data with pre-calculated quantities
      const orderData = {
        symbol: stock.symbol,
        ltp: stock.ltp,
        access_token: token,
        isTargetOrder: isTargetOrder
      };
      
      // Add pre-calculated data if available (backend will use this for optimization)
      if (stock.preCalculated && !isTargetOrder) {
        orderData.preCalculatedData = {
          quantity: stock.preCalculated.quantity,
          maxQuantity: stock.preCalculated.maxQuantity,
          investment: stock.preCalculated.investment,
          fundsAvailable: stock.preCalculated.fundsAvailable,
          leveragedFunds: stock.preCalculated.leveragedFunds,
          usableFunds: stock.preCalculated.usableFunds,
          calculatedAt: stock.preCalculated.calculatedAt
        };
        console.log(`💰 Including pre-calculated data: Qty=${stock.preCalculated.quantity}, Funds=₹${stock.preCalculated.usableFunds.toLocaleString('en-IN')}`);
      }
      
      const response = await fetch(`http://localhost:5000/api/${type.toLowerCase()}-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(orderData)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ ${orderTypeText} ${type} order successful: ${stock.symbol} - Order ID: ${result.order_id}`);
        
        // Open chart for successful orders
        openNamedChart(stock.symbol);
        
        return { success: true, orderId: result.order_id };
      } else {
        console.log(`❌ ${orderTypeText} ${type} order failed: ${stock.symbol} - ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error(`❌ ${type} order error for ${stock.symbol}:`, error);
      return { success: false, error: error.message };
    }
  }, [openNamedChart]);

  // Scanner data fetch function
  const fetchScannerData = useCallback(async () => {
    try {
      // STEP 1: Call low-price-scanners route only (all-scanners route is commented out)
      console.log('🔍 Step 1: Fetching low price scanner data with buy/sell classification...');
      
      const lowPriceResponse = await fetch('http://localhost:5000/api/low-price-scanners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          autoTrade: autoTradingEnabled, // Use actual auto trade setting for direct execution
          access_token: accessToken || localStorage.getItem('kite_access_token')
        })
      });
      
      if (lowPriceResponse.ok) {
        const lowPriceData = await lowPriceResponse.json();
        
        console.log('📊 Low price scanner response received:');
        console.log('   - Full data:', lowPriceData);
        
        // Check if low price scanning was blocked due to timing constraints
        if (lowPriceData.success === false && lowPriceData.reason === 'last_two_minutes_block') {
          console.log('⏸️ LOW PRICE SCANNER BLOCKED:', lowPriceData.message);
          setBuySignals([]);
          setSellSignals([]);
          
          // Set scan blocking state for UI display
          setScanBlockInfo({
            isBlocked: true,
            reason: lowPriceData.reason,
            message: lowPriceData.message,
            candlePosition: lowPriceData.candlePosition,
            nextScanAllowedAt: lowPriceData.nextScanAllowedAt
          });
          
          return; // Exit early, don't process signals
        }
        
        // Clear scan blocking state if scan was successful
        setScanBlockInfo({
          isBlocked: false,
          reason: null,
          message: null,
          candlePosition: null,
          nextScanAllowedAt: null
        });
        
        // Store all stocks for frontend filtering
        setAllStocks(lowPriceData.allStocks || []);
        console.log(`📊 All stocks for filtering: ${lowPriceData.allStocks?.length || 0}`);
        
        // Extract buy/sell classified results from low price scanner
        const buyStocks = lowPriceData.buyStocks || [];
        const sellStocks = lowPriceData.sellStocks || [];
        
        console.log('📊 Low price scanner classification results:');
        console.log(`   - Buy signals: ${buyStocks.length}`);
        console.log(`   - Sell signals: ${sellStocks.length}`);
        console.log(`   - Total stocks scanned: ${lowPriceData.totalStocks || 0}`);
        
        // Map buy stocks to TradingDashboard format
        const currentTimestamp = new Date().toISOString();
        const currentTime = new Date().toLocaleString();
        
        const formattedBuyStocks = buyStocks.map(stock => ({
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0, // close price
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          // Technical indicators for enhanced display
          open15: stock.open15 || stock.d?.[4] || 0, // open|15
          ema3_15: stock.ema3_15 || stock.d?.[30] || 0, // EMA3|15
          macd5: stock.macd5 || stock.d?.[9] || 0, // MACD|5
          signal5: stock.signal5 || stock.d?.[10] || 0, // Signal|5
          adx5: stock.adx5 || stock.d?.[11] || 0, // ADX|5
          signalStrength: stock.signalStrength || 75, // Default strength for buy signals
          timestamp: currentTimestamp,
          timeFormatted: currentTime
        }));
        
        setBuySignals(formattedBuyStocks);
        
        // Preserve buy signals in history (keep last 50 entries)
        if (formattedBuyStocks.length > 0) {
          setFinalBuyHistory(prev => {
            const newHistory = [...formattedBuyStocks, ...prev];
            return newHistory.slice(0, 50); // Keep last 50 entries
          });
        }
        
        // Map sell stocks to TradingDashboard format  
        const formattedSellStocks = sellStocks.map(stock => ({
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0, // close price
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          // Technical indicators for enhanced display
          open15: stock.open15 || stock.d?.[4] || 0, // open|15
          ema3_15: stock.ema3_15 || stock.d?.[30] || 0, // EMA3|15
          macd5: stock.macd5 || stock.d?.[9] || 0, // MACD|5
          signal5: stock.signal5 || stock.d?.[10] || 0, // Signal|5
          adx5: stock.adx5 || stock.d?.[11] || 0, // ADX|5
          signalStrength: stock.signalStrength || 75, // Default strength for sell signals
          timestamp: currentTimestamp,
          timeFormatted: currentTime
        }));
        
        setSellSignals(formattedSellStocks);
        
        // Preserve sell signals in history (keep last 50 entries)
        if (formattedSellStocks.length > 0) {
          setFinalSellHistory(prev => {
            const newHistory = [...formattedSellStocks, ...prev];
            return newHistory.slice(0, 50); // Keep last 50 entries
          });
        }
        
        // Extract crossover data if available
        const crossoverData = lowPriceData.crossover || {};
        const rawCrossoverBuyStocks = crossoverData.buyResults?.rawCrossoverStocks || [];
        const rawCrossbelowSellStocks = crossoverData.sellResults?.rawCrossbelowStocks || [];
        
        console.log('📊 Crossover scanner results:');
        console.log(`   - Crossover buy stocks: ${rawCrossoverBuyStocks.length}`);
        console.log(`   - Crossbelow sell stocks: ${rawCrossbelowSellStocks.length}`);
        
        // Map crossover stocks to display format
        setCrossoverBuyStocks(rawCrossoverBuyStocks.map(stock => ({
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0,
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          ema3_1: stock.ema3_1 || stock.d?.[22] || 0, // EMA3|1
          ema5_1: stock.ema5_1 || stock.d?.[23] || 0, // EMA5|1
          signalStrength: 80 // Crossover strength
        })));
        
        setCrossbelowSellStocks(rawCrossbelowSellStocks.map(stock => ({
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0,
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          ema3_1: stock.ema3_1 || stock.d?.[22] || 0, // EMA3|1
          ema5_1: stock.ema5_1 || stock.d?.[23] || 0, // EMA5|1
          signalStrength: 80 // Crossbelow strength
        })));
        
        // Extract intersection summary for display
        const intersectionData = {
          originalBuy: crossoverData.buyResults?.originalPrimaryCount || 0,
          finalBuy: crossoverData.buyResults?.finalMatchedCount || buyStocks.length,
          originalSell: crossoverData.sellResults?.originalPrimaryCount || 0,
          finalSell: crossoverData.sellResults?.finalMatchedCount || sellStocks.length,
          crossoverBuy: rawCrossoverBuyStocks.length,
          crossoverBuyMatched: crossoverData.buyResults?.finalMatchedCount || buyStocks.length,
          crossbelowSell: rawCrossbelowSellStocks.length,
          crossbelowSellMatched: crossoverData.sellResults?.finalMatchedCount || sellStocks.length
        };
        setIntersectionSummary(intersectionData);
        
        // NEW: Handle scan results for new UI tables
        if (lowPriceData.buyTable || lowPriceData.sellTable) {
          console.log('📊 NEW: Updating scan results tables');
          console.log(`   - Buy table entries: ${lowPriceData.buyTable?.length || 0}`);
          console.log(`   - Sell table entries: ${lowPriceData.sellTable?.length || 0}`);
          console.log(`   - Execution mode: ${lowPriceData.executionMode || 'unknown'}`);
          console.log(`   - Auto trade: ${lowPriceData.autoTrade}`);
          
          setScanResults({
            buyTable: lowPriceData.buyTable || [],
            sellTable: lowPriceData.sellTable || [],
            executionMode: lowPriceData.executionMode || 'direct',
            autoTrade: lowPriceData.autoTrade || false,
            lastScanTime: new Date().toISOString(),
            orderExecution: lowPriceData.orderExecution || {}
          });
        } else {
          console.log('⚠️ No buyTable/sellTable found in response, using legacy format');
        }
        
        console.log('📊 Intersection Summary:', intersectionData);
        
        setLastUpdate(new Date().toLocaleTimeString());
        
        // 🎯 NEW ARCHITECTURE: STEP 2 - Subscribe signal stocks (no direct execution)
        console.log(`📡 Step 2: Subscribing signal stocks for tick-driven execution...`);
        console.log(`   - Buy signals found: ${buyStocks.length}`);
        console.log(`   - Sell signals found: ${sellStocks.length}`);
        console.log(`   - Auto trading enabled: ${autoTradingEnabled}`);
        console.log(`   - Kite login status: ${kiteLoginStatus}`);
        
        if (buyStocks.length > 0 || sellStocks.length > 0) {
          console.log('📡 Subscribing signal stocks to KiteTicker for tick-driven execution...');
          await subscribeToSignalStocks(buyStocks, sellStocks);
          console.log('✅ Signal stocks subscription completed - waiting for tick updates to trigger trades');
        } else {
          console.log('⚠️ No signal stocks to subscribe - clearing previous signals');
          setSignalStocks({ buySignals: [], sellSignals: [], lastUpdate: null });
        }
        
        // Voice alert for low-price scanner results
        if (voiceEnabled && (buyStocks.length > 0 || sellStocks.length > 0)) {
          speak(`Low price scanner found ${buyStocks.length} buy signals and ${sellStocks.length} sell signals from stocks under ₹4000`);
        }
        
        // 🔄 STEP 3: FRONTEND POSITION & ORDER CHECK WITH DEDICATED TARGET ROUTES
        console.log('🔄 Step 3: Running position & order check with dedicated target routes from frontend...');
        setTimeout(() => {
          checkPositionsAndOrdersFromFrontend();
        }, 2000); // Delay to ensure scan/orders are processed
      }
    } catch (error) {
      console.error('Failed to fetch scanner data:', error);
      // Set empty arrays on error
      setBuySignals([]);
      setSellSignals([]);
    }
  }, [voiceEnabled, autoTradingEnabled, speak, accessToken, kiteLoginStatus, subscribeToSignalStocks, checkPositionsAndOrdersFromFrontend]);

  // Initialize WebSocket connection
  useEffect(() => {
    console.log('🔧 WebSocket useEffect running - creating new connection');
    const websocket = new WebSocketManager('ws://localhost:5000');
    
    // Store reference to prevent garbage collection
    window.debugWebSocket = websocket;

    websocket.onConnect = () => {
      setSocketConnected(true);
      console.log('🔗 WebSocket connected - State updated');
      // No auto-fetch here - let polling handle it
    };

    websocket.onDisconnect = () => {
      setSocketConnected(false);
      console.log('🔌 WebSocket disconnected - State updated');
    };

    websocket.onMessage = async (data) => {
      console.log('📡 WebSocket received:', data.type, data);
      
      if (data.type === 'scanner_results') {
        setBuySignals(data.buySignals || []);
        setSellSignals(data.sellSignals || []);
        setLastUpdate(new Date().toLocaleTimeString());
      } else if (data.type === 'tick_update') {
        // Handle real-time tick updates with market impact
        console.log('📊 Tick update received for:', data.tick?.symbol);
        if (data.tick && data.tick.symbol) {
          const symbol = data.tick.symbol;
          const tickUpdate = {
            ...data.tick,
            timestamp: data.tick.timestamp || new Date().toISOString()
          };
          
          // Update tickData state - maintain array of ticks per symbol (latest last)
          setTickData(prevTickData => {
            const symbolHistory = prevTickData[symbol] || [];
            // Keep last 10 ticks per symbol to avoid memory bloat
            const updatedHistory = [...symbolHistory, tickUpdate].slice(-10);
            
            console.log(`📊 Updated tick history for ${symbol}:`, updatedHistory.length, 'ticks');
            console.log(`📊 Latest market impact:`, tickUpdate.marketImpact);
            
            return {
              ...prevTickData,
              [symbol]: updatedHistory
            };
          });

          // 🎯 NEW: TICK-DRIVEN TRADE EXECUTION - SINGLE TRIGGER POINT
          // Only execute if auto trading is enabled and user is logged in
          const currentAutoTradingEnabled = autoTradingEnabledRef.current;
          const currentKiteLoginStatus = kiteLoginStatusRef.current;
          const currentSignalStocks = signalStocksRef.current;
          const executeFunction = executeAutoTradingRef.current;
          
          console.log(`🎯 [TICK-DEBUG] Tick received for ${symbol}:`, {
            autoTradingEnabled: currentAutoTradingEnabled,
            kiteLoginStatus: currentKiteLoginStatus,
            buySignalsCount: currentSignalStocks.buySignals.length,
            sellSignalsCount: currentSignalStocks.sellSignals.length,
            hasExecuteFunction: !!executeFunction
          });
          
          if (currentAutoTradingEnabled && currentKiteLoginStatus === 'logged-in' && executeFunction) {
            // Check if this symbol has active signals
            const cleanSymbol = symbol.replace('NSE:', '').replace('BSE:', '');
            console.log(`🔍 [TICK-TRADE] Checking signals for cleaned symbol: ${cleanSymbol}`);
            
            const hasBuySignal = currentSignalStocks.buySignals.some(stock => {
              const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
              const match = stockSymbol === cleanSymbol;
              if (match) console.log(`✅ [TICK-TRADE] Found BUY signal match: ${stockSymbol}`);
              return match;
            });
            
            const hasSellSignal = currentSignalStocks.sellSignals.some(stock => {
              const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
              const match = stockSymbol === cleanSymbol;
              if (match) console.log(`✅ [TICK-TRADE] Found SELL signal match: ${stockSymbol}`);
              return match;
            });
            
            console.log(`🔍 [TICK-TRADE] Signal check for ${cleanSymbol}:`, { hasBuySignal, hasSellSignal });
            
            if (hasBuySignal || hasSellSignal) {
              console.log(`🚀 [TICK-TRADE] *** EXECUTING ORDERS FOR ${symbol} *** - triggering execution`);
              
              const buySignalStocks = hasBuySignal ? currentSignalStocks.buySignals.filter(stock => {
                const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
                return stockSymbol === cleanSymbol;
              }) : [];
              
              const sellSignalStocks = hasSellSignal ? currentSignalStocks.sellSignals.filter(stock => {
                const stockSymbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
                return stockSymbol === cleanSymbol;
              }) : [];
              
              console.log(`🎯 [TICK-TRADE] Filtered stocks for execution:`, {
                symbol: cleanSymbol,
                buyStocks: buySignalStocks.length,
                sellStocks: sellSignalStocks.length,
                buyDetails: buySignalStocks.map(s => ({ symbol: s.symbol, ltp: s.ltp })),
                sellDetails: sellSignalStocks.map(s => ({ symbol: s.symbol, ltp: s.ltp }))
              });
              
              // 🚀 DIRECT EXECUTION: Call the frontend route executor immediately
              try {
                console.log(`🚀 [TICK-TRADE] CALLING executeAutoTradingViaSeparateRoutes() for ${symbol} via REF`);
                await executeFunction(buySignalStocks, sellSignalStocks);
                console.log(`✅ [TICK-TRADE] Execution completed successfully for ${symbol}`);
              } catch (error) {
                console.error(`❌ [TICK-TRADE] Execution failed for ${symbol}:`, error);
              }
            } else {
              console.log(`⚪ [TICK-TRADE] No signals found for ${cleanSymbol} - skipping execution`);
            }
          } else {
            const blockingReasons = [];
            if (!currentAutoTradingEnabled) blockingReasons.push('Auto trading disabled');
            if (currentKiteLoginStatus !== 'logged-in') blockingReasons.push('Not logged in');
            if (!executeFunction) blockingReasons.push('Execute function not available');
            
            console.log(`⚠️ [TICK-TRADE] Execution blocked for ${symbol}:`, {
              autoTradingEnabled: currentAutoTradingEnabled,
              kiteLoginStatus: currentKiteLoginStatus,
              hasExecuteFunction: !!executeFunction,
              reasons: blockingReasons
            });
          }
        }
      } else if (data.type === 'order_charts') {
        // Auto-open charts for successful orders
        console.log('📊 Auto-opening charts for successful orders:', data.charts);
        if (data.charts && Array.isArray(data.charts)) {
          const chartCount = data.charts.length;
          
          // Voice notification about charts opening
          if (voiceEnabled && chartCount > 0) {
            speak(`Opening ${chartCount} chart${chartCount > 1 ? 's' : ''} for successful orders`);
          }
          
          // Visual notification
          setOrderNotification({
            type: 'success',   
            title: '📊 Charts Auto-Opening',
            message: `Opening ${chartCount} chart${chartCount > 1 ? 's' : ''} for successful orders`,
            details: data.charts.map(c => `${c.type} ${c.symbol}`).join(', '),
            timestamp: new Date().toLocaleTimeString()
          });
          
          // Clear notification after 5 seconds
          setTimeout(() => setOrderNotification(null), 5000);
          
          data.charts.forEach((chart, index) => {
            // Small delay between opening multiple tabs to avoid popup blocking
            setTimeout(() => {
              // Construct chart URL from symbol and token sent by backend
              const cleanSymbol = chart.symbol.replace('NSE:', '').replace('BSE:', '');
              const token = chart.token || '0'; // Use token from backend or fallback to '0'
              const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${token}`;
              
              console.log(`🚀 Opening chart for ${chart.orderType} ${chart.symbol} with token ${token}`);
              console.log(`📊 Chart URL: ${chartUrl}`);
              
              const newTab = window.open(chartUrl, 'kite-chart-tab');
              if (newTab) {
                newTab.focus();
                console.log(`✅ Chart opened successfully for ${chart.symbol}`);
              } else {
                console.error('❌ Chart blocked by popup blocker');
              }
            }, index * 500); // 500ms delay between each tab
          });
        }
      } else if (data.type === 'target_order_placed') {
        // Handle target order details for display
        console.log('🎯 Target order placed:', data.targetOrder);
        
        setTargetOrderDetails(prevDetails => {
          // Check if this target order already exists (avoid duplicates)
          const existingIndex = prevDetails.findIndex(order => order.orderId === data.targetOrder.orderId);
          
          let newDetails;
          if (existingIndex >= 0) {
            // Update existing target order
            newDetails = [...prevDetails];
            newDetails[existingIndex] = data.targetOrder;
          } else {
            // Add new target order, keep only last 10 target orders
            newDetails = [data.targetOrder, ...prevDetails].slice(0, 10);
          }
          
          return newDetails;
        });
        
        // Show the target order details section
        setShowTargetOrderDetails(true);
        
        // Voice notification
        if (voiceEnabled) {
          const profit = Math.round(data.targetOrder.expectedProfit);
          speak(`Target order placed for ${data.targetOrder.symbol}. Expected profit ${profit} rupees`);
        }
        
        // Visual notification
        setOrderNotification({
          type: 'success',   
          title: '🎯 Target Order Placed',
          message: `Target order placed for ${data.targetOrder.symbol}`,
          details: `Expected profit: ₹${data.targetOrder.expectedProfit.toFixed(2)} (0.3%)`,
          timestamp: new Date().toLocaleTimeString()
        });
        
        // Clear notification after 5 seconds
        setTimeout(() => setOrderNotification(null), 5000);
        
      } else if (data.type === 'subscription_update') {
        // Update real subscription count from backend
        console.log('📡 Subscription update received:', data.subscribed_count);
        setRealSubscriptionCount(data.subscribed_count || 0);
      }
    };

    websocket.connect();

    // Get initial subscription status
    const fetchInitialSubscriptionStatus = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/subscription-status');
        if (response.ok) {
          const data = await response.json();
          console.log('📊 Initial subscription status:', data);
          setRealSubscriptionCount(data.subscribed_count || 0);
        }
      } catch (error) {
        console.log('ℹ️ Backend not ready for subscription status check:', error.message);
        // Silent fail - backend might not be ready yet
      }
    };

    fetchInitialSubscriptionStatus();

    return () => {
      websocket.disconnect();
    };
  }, []); // FIXED: Removed problematic function dependencies that were causing multiple WebSocket connections

  // Auto-polling with countdown management
  useEffect(() => {
    console.log('🔄 Setting up scanner polling...');
    
    // Clear any existing intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    // Single initial fetch if not already loaded
    if (!hasInitialLoaded.current) {
      const initialTimeout = setTimeout(() => {
        console.log('🚀 Initial scanner fetch on page load');
        hasInitialLoaded.current = true;
        setIsPolling(true);
        fetchScannerData();
        
        // Start countdown for next poll
        setPollCountdown(pollInterval);
        countdownIntervalRef.current = setInterval(() => {
          setPollCountdown((prev) => {
            if (prev <= 1) {
              return pollInterval; // Reset to selected interval
            }
            return prev - 1;
          });
        }, 1000);
      }, 2000);
      
      // Store timeout to clear if needed
      const timeoutRef = initialTimeout;
      
      // Then poll at selected interval
      pollIntervalRef.current = setInterval(() => {
        console.log(`⏰ Scheduled scanner poll (${pollInterval}s interval)`);
        fetchScannerData();
        setPollCountdown(pollInterval); // Reset countdown
      }, pollInterval * 1000);

      return () => {
        console.log('🧹 Cleaning up scanner polling');
        setIsPolling(false);
        setPollCountdown(0);
        clearTimeout(timeoutRef);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    } else {
      // If already loaded, just set up polling
      setIsPolling(true);
      setPollCountdown(pollInterval);
      
      pollIntervalRef.current = setInterval(() => {
        console.log(`⏰ Scheduled scanner poll (${pollInterval}s interval)`);
        fetchScannerData();
        setPollCountdown(pollInterval); // Reset countdown
      }, pollInterval * 1000);
      
      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        setPollCountdown((prev) => {
          if (prev <= 1) {
            return pollInterval; // Reset to selected interval
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => {
        setIsPolling(false);
        setPollCountdown(0);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    }
  }, [pollInterval, fetchScannerData]); // Add fetchScannerData dependency to get latest version

  // 🔄 PERIODIC POSITION & ORDER MONITORING WITH DEDICATED TARGET ROUTES
  useEffect(() => {
    let positionCheckInterval;
    
    if (kiteLoginStatus === 'logged-in') {
      console.log('🔄 Setting up position & order monitoring with dedicated target routes (30s interval)...');
      
      // Start after initial delay
      const startPositionMonitoring = setTimeout(() => {
        console.log('🎯 Starting position & order monitoring with dedicated target routes...');
        checkPositionsAndOrdersFromFrontend();
        
        // Set up recurring position check every 30 seconds with dedicated target routes
        positionCheckInterval = setInterval(() => {
          console.log('⏰ Scheduled position & order check with dedicated target routes');
          checkPositionsAndOrdersFromFrontend();
        }, 30000); // 30 seconds
        
      }, 5000); // Initial 5 second delay
      
      return () => {
        clearTimeout(startPositionMonitoring);
        if (positionCheckInterval) {
          clearInterval(positionCheckInterval);
          console.log('🛑 Position & order monitoring stopped');
        }
      };
    } else {
      console.log('⚠️ Position & order monitoring skipped - not logged in');
    }
  }, [kiteLoginStatus, checkPositionsAndOrdersFromFrontend]);

  const startPolling = useCallback(() => {
    console.log(`🔄 Starting scanner polling with ${pollInterval}s interval...`);
    console.log('📊 Tick data should start flowing when symbols are scanned and subscribed via KiteTicker');
    
    // Clear any existing intervals
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    
    setIsPolling(true);
    fetchScannerData();
    
    // Start countdown
    setPollCountdown(pollInterval);
    countdownIntervalRef.current = setInterval(() => {
      setPollCountdown((prev) => {
        if (prev <= 1) {
          return pollInterval; // Reset to selected interval
        }
        return prev - 1;
      });
    }, 1000);
    
    // Set up polling interval
    pollIntervalRef.current = setInterval(() => {
      console.log(`⏰ Scheduled scanner poll (${pollInterval}s interval)`);
      fetchScannerData();
      setPollCountdown(pollInterval); // Reset countdown
    }, pollInterval * 1000);
  }, [pollInterval, fetchScannerData]);

  const togglePolling = useCallback(() => {
    if (isPolling) {
      console.log('⏹️ Stopping polling');
      setIsPolling(false);
      setPollCountdown(0);
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      speak('Polling stopped');
    } else {
      console.log('▶️ Starting polling');
      startPolling();
      speak('Polling started');
    }
  }, [isPolling, startPolling, speak]);

  const toggleAutoTrading = useCallback(async () => {
    const newState = !autoTradingEnabled;
    
    try {
      // 🔄 SYNC WITH BACKEND: Update server's autoTradingActive flag
      const response = await fetch('http://localhost:5000/api/set-auto-trading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        body: JSON.stringify({ enabled: newState })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setAutoTradingEnabled(newState);
        speak(newState ? 'Auto trading enabled' : 'Auto trading disabled');
        console.log(`🔒 Auto trading ${newState ? 'ENABLED' : 'DISABLED'} - Backend synchronized`);
      } else {
        console.error('❌ Failed to sync auto trading with backend:', result.error);
        speak('Auto trading sync failed');
      }
    } catch (error) {
      console.error('❌ Error syncing auto trading with backend:', error);
      speak('Auto trading sync error');
    }
  }, [autoTradingEnabled, speak, accessToken]);

  // Clear order notification
  const clearOrderNotification = useCallback(() => {
    setOrderNotification(null);
  }, []);

  // Memoize inline callback functions
  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled(!voiceEnabled);
  }, [voiceEnabled]);

  const handleOpenOrderPanel = useCallback(() => {
    console.log('🎯 [PANEL] onOpenOrderPanel called from TradingControlPanel');
    setOrderPanelOpen(true);
    console.log('🎯 [PANEL] orderPanelOpen state updated to:', true);
  }, []);

  const handleChangePollInterval = useCallback((interval) => {
    setPollInterval(interval);
  }, []);

  return (
    <AppContainer>
      <ContentWrapper>
  
      <MainContent>
        {/* Algorithm Tutorial - Commented out */}
        {/* <AlgorithmTutorial /> */}
        
        {/* LIVE STOCK TRACKER: Showing Subscribed Signal Stocks with Real-time Ticks */}
        <SubscribedStockTracker 
          tickData={tickData}
          onOpenChart={openNamedChart}
          subscribedCount={realSubscriptionCount}
          buySignalsCount={signalStocks.buySignals.length}
          sellSignalsCount={signalStocks.sellSignals.length}
          pollCountdown={pollCountdown}
        />
        
        {/* TEMPORARILY HIDDEN: Scan Results Tables */}
        {/* 
        <ScanResultsTables 
          buyStocks={scanResults.buyTable}
          sellStocks={scanResults.sellTable}
          autoTrade={scanResults.autoTrade}
          onSymbolClick={openNamedChart}
        />
        */}
        
        {/* NEW: Positions and Orders Tables */}
        <PositionsOrdersTable 
          positions={positionsData}
          orders={ordersData}
          loading={positionsOrdersLoading}
          error={positionsOrdersError}
          lastUpdated={lastPositionsOrdersUpdate}
          onRefresh={fetchPositionsAndOrders}
        />
        
        {/* NEW: Target Order Details */}
        <TargetOrderDetails 
          targetOrders={targetOrderDetails}
          isVisible={showTargetOrderDetails}
          onClose={() => setShowTargetOrderDetails(false)}
        />
        
        {/* TEMPORARILY HIDDEN: Live Stock Tracker (now shown above) */}
        {/* 
        <SubscribedStockTracker 
          tickData={tickData}
          onOpenChart={openNamedChart}
          subscribedCount={realSubscriptionCount}
          buySignalsCount={buySignals.length}
          sellSignalsCount={sellSignals.length}
          pollCountdown={pollCountdown}
        />
        */}
        
        {/* Trading Dashboard with Scan Stocks Table */}
        <ScannerSection>
          {/* Scan Blocking Notification */}
          {scanBlockInfo.isBlocked && (
            <ScanBlockNotification>
              <ScanBlockHeader>
                ⏸️ Scanner Temporarily Blocked
              </ScanBlockHeader>
              <ScanBlockDetails>
                {scanBlockInfo.message}
              </ScanBlockDetails>
              <ScanBlockTiming>
                Current 15min candle position: minute {scanBlockInfo.candlePosition} • Next scan allowed: {scanBlockInfo.nextScanAllowedAt}
              </ScanBlockTiming>
            </ScanBlockNotification>
          )}
          
          <TradingDashboard 
            allStocks={allStocks}
            onOpenChart={openNamedChart}
            crossoverBuyStocks={crossoverBuyStocks}
            crossbelowSellStocks={crossbelowSellStocks}
            finalBuyStocks={buySignals}
            finalSellStocks={sellSignals}
            intersectionSummary={intersectionSummary}
          />
        </ScannerSection>
      </MainContent>
      
      {/* TEMPORARILY HIDDEN: Order Execution Panel */}
      {/* 
      <OrderExecutionPanel 
        isOpen={orderPanelOpen}
        orderExecutions={orderExecutions}
        onClose={handleCloseOrderPanel}
        onClear={handleClearOrderExecutions}
      />
      */}
      </ContentWrapper>
      
      <ControlPanelWrapper>
        <TradingControlPanel
          autoTradingEnabled={autoTradingEnabled}
          onToggleAutoTrading={toggleAutoTrading}
          buySignals={buySignals}
          sellSignals={sellSignals}
          orderNotification={orderNotification}
          onClearOrderNotification={clearOrderNotification}
          kiteLoginStatus={kiteLoginStatus}
          onKiteLogin={openKiteLogin}
          lastUpdate={lastUpdate}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleToggleVoice}
          isPolling={isPolling}
          pollCountdown={pollCountdown}
          onTogglePolling={togglePolling}
          orderExecutions={orderExecutions}
          onUpdateOrderExecutions={handleUpdateOrderExecutions}
          onOpenOrderPanel={handleOpenOrderPanel}
          accessToken={accessToken}
          pollInterval={pollInterval}
          onChangePollInterval={handleChangePollInterval}
          subscribedStocksCount={realSubscriptionCount}
        />
      </ControlPanelWrapper>
    </AppContainer>
  );
}

export default App;
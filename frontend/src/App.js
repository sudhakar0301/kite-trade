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
import SignalFilterPlayground from './components/SignalFilterPlayground';
// import AlgorithmTutorial from './components/AlgorithmTutorial';
import {
  AppContainer,
  ContentWrapper,
  MainContent,
  ScannerSection,
  SectionCard,
  TopSectionsGrid,
  SectionHeader,
  SectionTitle,
  SectionSubTitle,
  SectionBody,
  ScanBlockNotification,
  ScanBlockHeader,
  ScanBlockDetails,
  ScanBlockTiming
} from './App.styles';
import './App.css';



function App() {
  const renderChartCell = (row, keyPrefix = 'chart-row') => (
    <button
      key={`${keyPrefix}-${row.symbol || row.token || 'na'}`}
      type="button"
      onClick={() => openNamedChart({ symbol: row.symbol, token: row.token }, keyPrefix)}
      disabled={!row.symbol && !row.token}
      style={{
        background: 'rgba(59, 130, 246, 0.2)',
        border: '1px solid rgba(59, 130, 246, 0.5)',
        color: '#bfdbfe',
        borderRadius: '6px',
        padding: '4px 8px',
        fontSize: '11px',
        fontWeight: 700,
        cursor: (!row.symbol && !row.token) ? 'not-allowed' : 'pointer',
        opacity: (!row.symbol && !row.token) ? 0.6 : 1
      }}
    >
      Open
    </button>
  );

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
  const [uiFilterStockSource, setUiFilterStockSource] = useState('intersected'); // 'intersected' | 'lowPrice'
  const [lowPriceSourceStocks, setLowPriceSourceStocks] = useState({ buy: [], sell: [] });
  const [intersectedSourceStocks, setIntersectedSourceStocks] = useState({ buy: [], sell: [] });
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
  const [scannerMargins, setScannerMargins] = useState({
    availableFunds: 0,
    leverageFunds: 0,
    usableFunds: 0
  });
  const [scannerSubscriptionData, setScannerSubscriptionData] = useState({
    subscribedSymbols: [],
    signalStocks: { buySignals: [], sellSignals: [] }
  });
  
  // NEW: Scan results table data
  const [scanResults, setScanResults] = useState({
    buyTable: [],
    sellTable: [],
    crossoverTable: [],
    crossdownTable: [],
    buyWithoutIntersectionTable: [],
    sellWithoutIntersectionTable: [],
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
  const [buyFilterChecks, setBuyFilterChecks] = useState(() => ({
    emaTrendAllTf: true,
    ema5_5BelowEma3_15: true,
    macdSignalAllTf: true,
    macdAboveZero: true,
    minusDiLow: true,
    adxStrongAnyTf: true,
    adxStrong5m: true,
    plusDiStrong: true,
    plusDiOverAdx5Or15: true,
    plusDiOverAdx1m: true,
    adxOverMinusDi1m: true,
    ema5OverVwap1m: true,
    ema3BandBuy: true
  }));
  const [sellFilterChecks, setSellFilterChecks] = useState(() => ({
    emaTrendAllTfSell: true,
    ema5_5AboveEma3_15: true,
    macdSignalAllTfSell: true,
    macdBelowZero: true,
    plusDiLow: true,
    adxStrongAnyTfSell: true,
    adxStrong5mSell: true,
    minusDiStrong: true,
    minusDiOverAdx5Or15: true,
    minusDiOverAdx1m: true,
    adxOverPlusDi1m: true,
    ema5BelowVwap1m: true,
    ema3BandSell: true
  }));

  const handleBuyChecksChange = useCallback((nextChecks) => {
    setBuyFilterChecks(nextChecks || {});
  }, []);

  const handleSellChecksChange = useCallback((nextChecks) => {
    setSellFilterChecks(nextChecks || {});
  }, []);

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

  // Force auto trading OFF on initial load.
  // This ensures trading is enabled only via explicit user toggle click.
  useEffect(() => {
    const forceAutoTradingDisabled = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/set-auto-trading', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ enabled: false })
        });

        const result = await response.json();

        if (result.success) {
          setAutoTradingEnabled(false);
          console.log('🔒 Auto trading initialized to DISABLED on app load');
        } else {
          console.error('❌ Failed to initialize auto trading state:', result.error);
          setAutoTradingEnabled(false);
        }
      } catch (error) {
        console.error('❌ Error initializing auto trading state:', error);
        setAutoTradingEnabled(false);
      }
    };

    forceAutoTradingDisabled();
  }, []);

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
      // Fetch positions, orders, and funds in parallel
      const [positionsRes, ordersRes, marginsRes] = await Promise.all([
        fetch('http://localhost:5000/api/positions', {
          headers: {
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          }
        }),
        fetch('http://localhost:5000/api/orders', {
          headers: {
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          }
        }),
        fetch('http://localhost:5000/api/get-margins', {
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

      if (marginsRes.ok) {
        const marginsData = await marginsRes.json();
        const usableFunds = Number(marginsData?.usableFunds || 0);
        const availableFunds = Number(marginsData?.availableFunds || 0);
        const leverageFunds = Number(marginsData?.leverageFunds || 0);
        console.log(`💰 Precheck funds loaded: Available=₹${availableFunds.toLocaleString('en-IN')}, Leveraged=₹${leverageFunds.toLocaleString('en-IN')}, Usable=₹${usableFunds.toLocaleString('en-IN')}`);
      } else {
        console.warn('⚠️ Could not fetch funds during positions/orders refresh');
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

  // Do not auto-call positions/orders/margins on login.
  // Keep this data on-demand only to avoid repeated precheck API calls.

  // Refs
  const pollIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const hasInitialLoaded = useRef(false);
  const tickTradeInFlightRef = useRef(false);
  const lastTickTradeAttemptRef = useRef({});
  const TICK_TRADE_COOLDOWN_MS = 10000;
  const mainOrdersAllowedRef = useRef(false);

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
  const openNamedChart = useCallback((symbolOrStock, chartType = 'main') => {
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
    
    const inputSymbol = typeof symbolOrStock === 'string'
      ? symbolOrStock
      : (symbolOrStock?.symbol || symbolOrStock?.s || '');
    const cleanSymbol = String(inputSymbol).replace('NSE:', '').replace('BSE:', '');
    const directToken =
      symbolOrStock && typeof symbolOrStock === 'object'
        ? (symbolOrStock.instrument_token || symbolOrStock.token || symbolOrStock.instrumentToken)
        : null;
    const mappedToken = mappingsToUse[cleanSymbol];
    const finalToken = String(directToken || mappedToken || '').trim();

    console.log(`🔍 Chart request for symbol: "${inputSymbol}" using ${mappingCount} mappings`);
    
    console.log(`   Clean symbol: "${cleanSymbol}" → Token: ${finalToken || 'NOT FOUND'}`);

    if (!finalToken) {
      alert(`📊 Token not found for ${cleanSymbol}. Unable to open chart.`);
      return;
    }

    // Always use Kite chart URL format with resolved token
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

    if (!mainOrdersAllowedRef.current) {
      console.log('⛔ [AUTO-TRADE] Main-order attempts suppressed by scan precheck (active positions/open orders/disabled gate)');
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
      let successfulOrders = 0;
      let failedOrders = 0;
      let blockedOrders = 0;

      // 🎯 LIMIT TRADING: Only trade the FIRST stock from each category to avoid overwhelming orders
      const maxOrdersPerType = 1;
      const buyStocksToTrade = buyStocks.slice(0, maxOrdersPerType);
      const sellStocksToTrade = sellStocks.slice(0, maxOrdersPerType);
      
      console.log(`🎯 CONTROLLED TRADING: Selected ${buyStocksToTrade.length} BUY + ${sellStocksToTrade.length} SELL from ${buyStocks.length + sellStocks.length} total signals`);

      // Submit only direct main-order attempts; backend owns target-order and final precheck policy.
      for (const stock of buyStocksToTrade) {
        const result = await executeOrder('BUY', stock, token, false);
        if (result.success) successfulOrders++; else failedOrders++;
      }

      for (const stock of sellStocksToTrade) {
        const result = await executeOrder('SELL', stock, token, false);
        if (result.success) successfulOrders++; else failedOrders++;
      }

      // Show completion notification
      const totalAttempts = buyStocksToTrade.length + sellStocksToTrade.length;
      
      console.log(`🎯 [AUTO-TRADE] EXECUTION COMPLETE:`);
      console.log(`   - Signal-based orders: ${successfulOrders}/${totalAttempts} successful, ${blockedOrders} blocked`);
      console.log(`   - Total successful orders: ${successfulOrders}`);
      
      if (successfulOrders > 0 && voiceEnabled) {
        speak(`${successfulOrders} orders executed successfully`);
      }

      // Do not auto-refresh positions/orders/margins here.
      
    } catch (error) {
      console.error('❌ [AUTO-TRADE] Execution failed:', error);
      if (voiceEnabled) {
        speak('Auto trading execution failed');
      }
    }
  }, [autoTradingEnabled, accessToken, voiceEnabled, speak, openNamedChart, fetchPositionsAndOrders]);

  // Update executeAutoTradingRef when function changes
  useEffect(() => {
    executeAutoTradingRef.current = executeAutoTradingViaSeparateRoutes;
  }, [executeAutoTradingViaSeparateRoutes]);

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

      // STEP 2.5: Get latest funds snapshot (mandatory precheck)
      console.log('💰 Fetching funds from backend API...');
      const marginsResponse = await fetch('http://localhost:5000/api/get-margins', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (marginsResponse.ok) {
        const marginsData = await marginsResponse.json();
        console.log(`💰 Funds precheck: Available=₹${Number(marginsData.availableFunds || 0).toLocaleString('en-IN')}, Leveraged=₹${Number(marginsData.leverageFunds || 0).toLocaleString('en-IN')}, Usable=₹${Number(marginsData.usableFunds || 0).toLocaleString('en-IN')}`);
      } else {
        console.log('⚠️ Could not fetch funds');
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

      console.log(`🔎 Order submission for ${stock.symbol}: delegating precheck to backend order route`);
      
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

        const errorText = String(result.error || '').toLowerCase();
        if (!isTargetOrder && (
          errorText.includes('active positions exist') ||
          errorText.includes('main order blocked') ||
          errorText.includes('pending order') ||
          errorText.includes('open order')
        )) {
          mainOrdersAllowedRef.current = false;
          console.log('🛡️ [AUTO-TRADE] Main-order attempts suppressed until next scan precheck update');
        }

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
      // STEP 1: Call main low-price scan + separate crossover/crossdown routes in parallel
      console.log('🔍 Step 1: Fetching low price scanner data + separate crossover/crossdown scans...');

      const scannerRequestBody = {
        autoTrade: autoTradingEnabled,
        access_token: accessToken || localStorage.getItem('kite_access_token'),
        applyUiFilters: true,
        appliedFilters: {
          buy: buyFilterChecks,
          sell: sellFilterChecks
        }
      };

      const [lowPriceResponse, crossoverResponse, crossdownResponse] = await Promise.all([
        fetch('http://localhost:5000/api/low-price-scanners', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(scannerRequestBody)
        }),
        fetch('http://localhost:5000/api/stocks-crossover-vwma9', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(scannerRequestBody)
        }),
        fetch('http://localhost:5000/api/stocks-crossdown-vwma9', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(scannerRequestBody)
        })
      ]);

      if (lowPriceResponse.ok) {
        const [lowPriceData, crossoverData, crossdownData] = await Promise.all([
          lowPriceResponse.json(),
          crossoverResponse.ok ? crossoverResponse.json() : Promise.resolve({ crossoverStocks: [] }),
          crossdownResponse.ok ? crossdownResponse.json() : Promise.resolve({ crossdownStocks: [] })
        ]);
        
        console.log('📊 Low price scanner response received:');
        console.log('   - Full data:', lowPriceData);
        
        // Use separate route outputs for crossover/crossdown tables
        const rawCrossoverBuyStocks = crossoverData.crossoverStocks || [];
        const rawCrossbelowSellStocks = crossdownData.crossdownStocks || [];

        console.log('📊 Separate crossover route results:');
        console.log(`   - Crossover(VWMA9) stocks: ${rawCrossoverBuyStocks.length}`);
        console.log(`   - Crossdown(VWMA9) stocks: ${rawCrossbelowSellStocks.length}`);

        // Check if low price scanning was blocked due to timing constraints
        if (lowPriceData.success === false && lowPriceData.reason === 'last_two_minutes_block') {
          console.log('⏸️ LOW PRICE SCANNER BLOCKED:', lowPriceData.message);
          setBuySignals([]);
          setSellSignals([]);
          setCrossoverBuyStocks(rawCrossoverBuyStocks);
          setCrossbelowSellStocks(rawCrossbelowSellStocks);
          setScanResults(prev => ({
            ...prev,
            buyTable: [],
            sellTable: [],
            crossoverTable: rawCrossoverBuyStocks,
            crossdownTable: rawCrossbelowSellStocks,
            lastScanTime: new Date().toISOString()
          }));
          
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
          // Keep all backend-provided technical fields intact for UI filtering.
          ...stock,
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0,
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          signalStrength: stock.signalStrength || 75,
          timestamp: currentTimestamp,
          timeFormatted: currentTime
        }));
        
        // Keep low-price scan outputs as one possible source for UI filtering.
        const lowPriceBuyStocks = formattedBuyStocks;
        
        // Map sell stocks to TradingDashboard format  
        const formattedSellStocks = sellStocks.map(stock => ({
          // Keep all backend-provided technical fields intact for UI filtering.
          ...stock,
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0,
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          signalStrength: stock.signalStrength || 75,
          timestamp: currentTimestamp,
          timeFormatted: currentTime
        }));
        
        const lowPriceSellStocks = formattedSellStocks;
        
        // Map crossover stocks to display format (from separate VWMA routes)
        const mappedCrossoverStocks = rawCrossoverBuyStocks.map(stock => ({
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0,
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          ema3_1: stock.ema3_1 || stock.d?.[1] || 0, // EMA3|1
          vwma_5: stock.vwma_5 || stock.d?.[2] || 0, // VWMA|5
          token: stock.token || null,
          signalStrength: 80 // Crossover strength
        }));

        const mappedCrossdownStocks = rawCrossbelowSellStocks.map(stock => ({
          symbol: stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s),
          ltp: stock.ltp || stock.d?.[0] || 0,
          volume: stock.volume || stock.d?.[1] || 0,
          change_percent: stock.change_percent || 0,
          ema3_1: stock.ema3_1 || stock.d?.[1] || 0, // EMA3|1
          vwma_5: stock.vwma_5 || stock.d?.[2] || 0, // VWMA|5
          token: stock.token || null,
          signalStrength: 80 // Crossbelow strength
        }));

        setCrossoverBuyStocks(mappedCrossoverStocks);
        setCrossbelowSellStocks(mappedCrossdownStocks);

        // Build intersection sets: low-price buy ∩ crossover, low-price sell ∩ crossdown.
        const toKey = (row) => String(row?.token || row?.instrument_token || row?.symbol || '').toUpperCase();
        const crossoverKeys = new Set(mappedCrossoverStocks.map(toKey).filter(Boolean));
        const crossdownKeys = new Set(mappedCrossdownStocks.map(toKey).filter(Boolean));

        const intersectedBuyStocks = lowPriceBuyStocks.filter((row) => crossoverKeys.has(toKey(row)));
        const intersectedSellStocks = lowPriceSellStocks.filter((row) => crossdownKeys.has(toKey(row)));

        setLowPriceSourceStocks({ buy: lowPriceBuyStocks, sell: lowPriceSellStocks });
        setIntersectedSourceStocks({ buy: intersectedBuyStocks, sell: intersectedSellStocks });

        const activeBuyStocks = uiFilterStockSource === 'intersected' ? intersectedBuyStocks : lowPriceBuyStocks;
        const activeSellStocks = uiFilterStockSource === 'intersected' ? intersectedSellStocks : lowPriceSellStocks;

        setBuySignals(activeBuyStocks);
        setSellSignals(activeSellStocks);

        // Preserve active source signals in history (keep last 50 entries)
        if (activeBuyStocks.length > 0) {
          setFinalBuyHistory(prev => {
            const newHistory = [...activeBuyStocks, ...prev];
            return newHistory.slice(0, 50);
          });
        }

        if (activeSellStocks.length > 0) {
          setFinalSellHistory(prev => {
            const newHistory = [...activeSellStocks, ...prev];
            return newHistory.slice(0, 50);
          });
        }
        
        // Extract intersection summary for display
        const intersectionData = {
          lowPriceBuy: lowPriceBuyStocks.length,
          lowPriceSell: lowPriceSellStocks.length,
          crossoverBuy: rawCrossoverBuyStocks.length,
          crossbelowSell: rawCrossbelowSellStocks.length,
          intersectedBuy: intersectedBuyStocks.length,
          intersectedSell: intersectedSellStocks.length,
          activeSource: uiFilterStockSource,
          finalBuy: activeBuyStocks.length,
          finalSell: activeSellStocks.length
        };
        setIntersectionSummary(intersectionData);
        
        // NEW: Handle scan results for new UI tables
        if (lowPriceData.buyTable || lowPriceData.sellTable) {
          console.log('📊 NEW: Updating scan results tables');
          console.log(`   - Buy table entries: ${lowPriceData.buyTable?.length || 0}`);
          console.log(`   - Sell table entries: ${lowPriceData.sellTable?.length || 0}`);
          console.log(`   - Execution mode: ${lowPriceData.executionMode || 'unknown'}`);
          console.log(`   - Auto trade: ${lowPriceData.autoTrade}`);
          
          const scanMainOrdersAllowed = Boolean(
            lowPriceData.mainOrdersAllowed ?? lowPriceData.orderExecution?.mainOrdersAllowed ?? false
          );
          mainOrdersAllowedRef.current = scanMainOrdersAllowed;
          console.log(`🛡️ [SCAN GATE] mainOrdersAllowed=${scanMainOrdersAllowed}, positionsFound=${Boolean(lowPriceData.positionsFound)}, openOrdersFound=${Boolean(lowPriceData.openOrdersFound)}`);

          setScanResults({
            buyTable: lowPriceData.buyTable || [],
            sellTable: lowPriceData.sellTable || [],
            crossoverTable: mappedCrossoverStocks,
            crossdownTable: mappedCrossdownStocks,
            buyWithoutIntersectionTable: lowPriceData.buyWithoutIntersectionTable || [],
            sellWithoutIntersectionTable: lowPriceData.sellWithoutIntersectionTable || [],
            executionMode: lowPriceData.executionMode || 'direct',
            autoTrade: lowPriceData.autoTrade || false,
            mainOrdersAllowed: scanMainOrdersAllowed,
            lastScanTime: new Date().toISOString(),
            orderExecution: lowPriceData.orderExecution || {}
          });
        } else {
          console.log('⚠️ No buyTable/sellTable found in response, using legacy format');
        }
        
        console.log('📊 Intersection Summary:', intersectionData);
        
        setLastUpdate(new Date().toLocaleTimeString());

        // Shared scanner-time refresh: subscription + positions/orders/margins (once per scan).
        try {
          const token = accessToken || localStorage.getItem('kite_access_token');
          const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

          const [subscriptionRes, positionsRes, ordersRes, marginsRes] = await Promise.all([
            fetch('http://localhost:5000/api/subscription-status'),
            fetch('http://localhost:5000/api/positions', { headers: authHeaders }),
            fetch('http://localhost:5000/api/orders', { headers: authHeaders }),
            fetch('http://localhost:5000/api/get-margins', { headers: authHeaders })
          ]);

          if (subscriptionRes.ok) {
            const subscriptionData = await subscriptionRes.json();
            setRealSubscriptionCount(subscriptionData.subscribed_count || 0);
            setScannerSubscriptionData({
              subscribedSymbols: subscriptionData.subscribed_symbols || [],
              signalStocks: subscriptionData.signal_stocks || { buySignals: [], sellSignals: [] }
            });
          }

          if (positionsRes.ok) {
            const positionsPayload = await positionsRes.json();
            setPositionsData(positionsPayload.positions || []);
            setLastPositionsOrdersUpdate(new Date().toLocaleTimeString());
          }

          if (ordersRes.ok) {
            const ordersPayload = await ordersRes.json();
            setOrdersData(ordersPayload.orders || []);
            setLastPositionsOrdersUpdate(new Date().toLocaleTimeString());
          }

          if (marginsRes.ok) {
            const marginsPayload = await marginsRes.json();
            setScannerMargins({
              availableFunds: Number(marginsPayload?.availableFunds || 0),
              leverageFunds: Number(marginsPayload?.leverageFunds || 0),
              usableFunds: Number(marginsPayload?.usableFunds || 0)
            });
          }
        } catch (sharedFetchError) {
          console.warn('⚠️ Scanner-shared refresh failed:', sharedFetchError.message);
        }
        
        // 🎯 STEP 2: Sync local signal state (backend already handled subscribe/unsubscribe after scan)
        console.log(`📡 Step 2: Syncing signal stocks from scan results...`);
        console.log(`   - Buy signals found: ${buyStocks.length}`);
        console.log(`   - Sell signals found: ${sellStocks.length}`);
        console.log(`   - Auto trading enabled: ${autoTradingEnabled}`);
        console.log(`   - Kite login status: ${kiteLoginStatus}`);

        setSignalStocks({
          buySignals: activeBuyStocks,
          sellSignals: activeSellStocks,
          lastUpdate: new Date().toISOString()
        });

        if (activeBuyStocks.length > 0 || activeSellStocks.length > 0) {
          console.log('✅ Signal stocks synced locally - backend subscription already reconciled after scan');
        } else {
          console.log('⚠️ No signal stocks from scan - local signal state cleared');
        }
        
        // Voice alert for low-price scanner results
        if (voiceEnabled && (activeBuyStocks.length > 0 || activeSellStocks.length > 0)) {
          speak(`Scanner found ${activeBuyStocks.length} buy signals and ${activeSellStocks.length} sell signals`);
        }
        
        // No additional frontend precheck calls here. Backend performs the order-attempt precheck.
      }
    } catch (error) {
      console.error('Failed to fetch scanner data:', error);
      // Set empty arrays on error
      setBuySignals([]);
      setSellSignals([]);
    }
  }, [
    voiceEnabled,
    autoTradingEnabled,
    speak,
    accessToken,
    kiteLoginStatus,
    buyFilterChecks,
    sellFilterChecks,
    uiFilterStockSource
  ]);

  useEffect(() => {
    const activeBuyStocks = uiFilterStockSource === 'intersected'
      ? (intersectedSourceStocks.buy || [])
      : (lowPriceSourceStocks.buy || []);
    const activeSellStocks = uiFilterStockSource === 'intersected'
      ? (intersectedSourceStocks.sell || [])
      : (lowPriceSourceStocks.sell || []);

    setBuySignals(activeBuyStocks);
    setSellSignals(activeSellStocks);
    setSignalStocks((prev) => ({
      ...prev,
      buySignals: activeBuyStocks,
      sellSignals: activeSellStocks,
      lastUpdate: new Date().toISOString()
    }));
  }, [uiFilterStockSource, lowPriceSourceStocks, intersectedSourceStocks]);

  useEffect(() => {
    if (!hasInitialLoaded.current) {
      return;
    }

    fetchScannerData();
  }, [buyFilterChecks, sellFilterChecks, fetchScannerData]);

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
              const now = Date.now();
              const lastAttempt = lastTickTradeAttemptRef.current[cleanSymbol] || 0;

              if (tickTradeInFlightRef.current) {
                console.log(`⏸️ [TICK-TRADE] Skipping ${cleanSymbol} - execution already in flight`);
                return;
              }

              if (now - lastAttempt < TICK_TRADE_COOLDOWN_MS) {
                const remainingMs = TICK_TRADE_COOLDOWN_MS - (now - lastAttempt);
                console.log(`⏸️ [TICK-TRADE] Cooldown active for ${cleanSymbol} - next attempt in ${Math.ceil(remainingMs / 1000)}s`);
                return;
              }

              lastTickTradeAttemptRef.current[cleanSymbol] = now;
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
                tickTradeInFlightRef.current = true;
                console.log(`🚀 [TICK-TRADE] CALLING executeAutoTradingViaSeparateRoutes() for ${symbol} via REF`);
                await executeFunction(buySignalStocks, sellSignalStocks);
                console.log(`✅ [TICK-TRADE] Execution completed successfully for ${symbol}`);
              } catch (error) {
                console.error(`❌ [TICK-TRADE] Execution failed for ${symbol}:`, error);
              } finally {
                tickTradeInFlightRef.current = false;
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
        // Handle target order details for display (supports both {targetOrder} and {position} payload shapes)
        const rawTarget = data?.targetOrder || data?.position || null;
        console.log('🎯 Target order placed payload:', rawTarget);

        if (!rawTarget || !rawTarget.symbol) {
          console.warn('⚠️ Ignoring malformed target_order_placed payload:', data);
          return;
        }

        const normalizedTargetOrder = {
          symbol: rawTarget.symbol,
          orderId: rawTarget.orderId || rawTarget.targetOrderId || null,
          avgPrice: Number(rawTarget.avgPrice || 0),
          quantity: Number(rawTarget.quantity || 0),
          investment: Number(rawTarget.investment || (Number(rawTarget.avgPrice || 0) * Math.abs(Number(rawTarget.quantity || 0))) || 0),
          targetPrice: Number(rawTarget.targetPrice || 0),
          expectedProfit: Number(rawTarget.expectedProfit || rawTarget.targetProfit || 0),
          profitPercentage: rawTarget.profitPercentage || '0.00',
          side: rawTarget.side || 'BUY',
          targetSide: rawTarget.targetSide || (rawTarget.side === 'SELL' ? 'BUY' : 'SELL'),
          placedAt: rawTarget.placedAt || rawTarget.timestamp || new Date().toISOString(),
          timestamp: rawTarget.timestamp || new Date().toLocaleTimeString(),
          status: rawTarget.status || 'OPEN',
          orderType: rawTarget.orderType || 'TARGET'
        };

        setTargetOrderDetails(prevDetails => {
          const safePrev = (prevDetails || []).filter(order => order && order.symbol);
          const existingIndex = safePrev.findIndex(order => order.orderId && normalizedTargetOrder.orderId && order.orderId === normalizedTargetOrder.orderId);

          let newDetails;
          if (existingIndex >= 0) {
            newDetails = [...safePrev];
            newDetails[existingIndex] = normalizedTargetOrder;
          } else {
            newDetails = [normalizedTargetOrder, ...safePrev].slice(0, 10);
          }

          return newDetails;
        });
        
        // Show the target order details section
        setShowTargetOrderDetails(true);
        
        // Voice notification
        if (voiceEnabled) {
          const profit = Math.round(normalizedTargetOrder.expectedProfit || 0);
          speak(`Target order placed for ${normalizedTargetOrder.symbol}. Expected profit ${profit} rupees`);
        }
        
        // Visual notification
        setOrderNotification({
          type: 'success',   
          title: '🎯 Target Order Placed',
          message: `Target order placed for ${normalizedTargetOrder.symbol}`,
          details: `Expected profit: ₹${Number(normalizedTargetOrder.expectedProfit || 0).toFixed(2)} (0.3%)`,
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

  // Do not run automatic position/order/funds checks on login.

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

  const selectedFilterBuyData = uiFilterStockSource === 'intersected'
    ? (intersectedSourceStocks.buy || [])
    : (lowPriceSourceStocks.buy || []);

  const selectedFilterSellData = uiFilterStockSource === 'intersected'
    ? (intersectedSourceStocks.sell || [])
    : (lowPriceSourceStocks.sell || []);

  return (
    <AppContainer>
      <ContentWrapper>
  
      <MainContent>
        {/* Algorithm Tutorial - Commented out */}
        {/* <AlgorithmTutorial /> */}

        <TopSectionsGrid>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>Live Subscribed Stock Tracker</SectionTitle>
            <SectionSubTitle>Real-time tick feed and active signal stock monitoring</SectionSubTitle>
          </SectionHeader>
          <SectionBody>
            <SubscribedStockTracker 
              tickData={tickData}
              onOpenChart={openNamedChart}
              subscribedCount={realSubscriptionCount}
              buySignalsCount={signalStocks.buySignals.length}
              sellSignalsCount={signalStocks.sellSignals.length}
              pollCountdown={pollCountdown}
              subscribedSymbols={scannerSubscriptionData.subscribedSymbols}
              signalStocks={scannerSubscriptionData.signalStocks}
              marginsData={scannerMargins}
            />

            <SignalFilterPlayground
              buyData={buySignals}
              sellData={sellSignals}
              showFilters={true}
              showTables={false}
              title="Signal Filters"
              buyChecks={buyFilterChecks}
              sellChecks={sellFilterChecks}
              onBuyChecksChange={handleBuyChecksChange}
              onSellChecksChange={handleSellChecksChange}
            />
          </SectionBody>
        </SectionCard>

        {/* TEMPORARILY HIDDEN: Scan Results Tables */}
        {/* 
        <ScanResultsTables 
          buyStocks={scanResults.buyTable}
          sellStocks={scanResults.sellTable}
          autoTrade={scanResults.autoTrade}
          onSymbolClick={openNamedChart}
        />
        */}

        {/*
        <SectionCard>
          <SectionHeader>
            <SectionTitle>Matched Signal Results</SectionTitle>
            <SectionSubTitle>Intersection of crossover and crossdown with main signal conditions</SectionSubTitle>
          </SectionHeader>
          <SectionBody>
            <ScanResultsTables
              buyStocks={scanResults.buyTable}
              sellStocks={scanResults.sellTable}
              autoTrade={scanResults.autoTrade}
              onSymbolClick={openNamedChart}
              buyTitle="🟢 Buy Signals (With Intersection)"
              sellTitle="🔴 Sell Signals (With Intersection)"
            />
          </SectionBody>
        </SectionCard>
        */}

        {/*
        <div style={{ margin: '10px 20px 0', color: '#c9d1d9', fontSize: '14px', fontWeight: 600 }}>
          Without Intersection (Buy without Crossover / Sell without Crossdown)
        </div>
        <ScanResultsTables
          buyStocks={scanResults.buyWithoutIntersectionTable}
          sellStocks={scanResults.sellWithoutIntersectionTable}
          autoTrade={scanResults.autoTrade}
          onSymbolClick={openNamedChart}
          buyTitle="🟢 Buy Signals (Without Intersection)"
          sellTitle="🔴 Sell Signals (Without Intersection)"
        />
        */}

        {/*
        <div style={{ margin: '10px 20px 0', color: '#c9d1d9', fontSize: '14px', fontWeight: 600 }}>
          Other Table: Only Crossover/Crossdown Stocks
        </div>
        <ScanResultsTables
          buyStocks={scanResults.crossoverTable}
          sellStocks={scanResults.crossdownTable}
          autoTrade={scanResults.autoTrade}
          onSymbolClick={openNamedChart}
          buyTitle="🟢 Crossover Stocks (Buy)"
          sellTitle="🔴 Crossdown Stocks (Sell)"
        />
        */}
        
        <SectionCard>
          <SectionHeader>
            <SectionTitle>Positions, Orders, and Targets</SectionTitle>
            <SectionSubTitle>Open positions, pending orders, and target order tracking</SectionSubTitle>
          </SectionHeader>
          <SectionBody>
            <PositionsOrdersTable 
              positions={positionsData}
              orders={ordersData}
              loading={positionsOrdersLoading}
              error={positionsOrdersError}
              lastUpdated={lastPositionsOrdersUpdate}
              onRefresh={fetchPositionsAndOrders}
            />

            <div style={{ marginTop: '12px', padding: '14px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148, 163, 184, 0.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#f1f5f9' }}>
                  Signal Conditions
                </div>
                <div style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 700 }}>
                  All listed conditions must pass
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setUiFilterStockSource('intersected')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    background: uiFilterStockSource === 'intersected' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(30, 41, 59, 0.7)',
                    color: uiFilterStockSource === 'intersected' ? '#86efac' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Intersected Source
                </button>
                <button
                  type="button"
                  onClick={() => setUiFilterStockSource('lowPrice')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    background: uiFilterStockSource === 'lowPrice' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 41, 59, 0.7)',
                    color: uiFilterStockSource === 'lowPrice' ? '#93c5fd' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Low-Price Source
                </button>
                <div style={{ fontSize: '11px', color: '#94a3b8', alignSelf: 'center' }}>
                  Buy: {selectedFilterBuyData.length} | Sell: {selectedFilterSellData.length}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(20, 83, 45, 0.28)', border: '1px solid rgba(74, 222, 128, 0.35)' }}>
                  <div style={{ fontWeight: 800, fontSize: '12px', color: '#86efac', marginBottom: '8px' }}>
                    Buy Conditions
                  </div>
                  <ol style={{ margin: 0, paddingLeft: '18px', color: '#e2e8f0', fontSize: '12px', lineHeight: '1.55' }}>
                    <li>EMA3 &gt; EMA5 on 1m, 5m, and 15m</li>
                    <li>MACD &gt; Signal on 5m and 15m</li>
                    <li>MACD(1m) &gt; 0 and MACD(5m) &gt; 0</li>
                    <li>-DI(5m) &lt; 15 OR -DI(15m) &lt; 15</li>
                    <li>ADX &gt; 25 on 1m OR 5m OR 15m</li>
                    <li>ADX(5m) &gt; 25</li>
                    <li>+DI(5m) &gt; 25 OR +DI(15m) &gt; 25</li>
                    <li>+DI(5m) &gt; ADX(5m) OR +DI(15m) &gt; ADX(15m)</li>
                    <li>+DI(1m) &gt; ADX(1m) and ADX(1m) &gt; 25</li>
                    <li>ADX(1m) &gt; -DI(1m)</li>
                    <li>EMA5(1m) &gt; VWAP(1m)</li>
                    <li>LTP &lt; UBB(5m)</li>
                  </ol>
                </div>

                <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(127, 29, 29, 0.28)', border: '1px solid rgba(248, 113, 113, 0.35)' }}>
                  <div style={{ fontWeight: 800, fontSize: '12px', color: '#fca5a5', marginBottom: '8px' }}>
                    Sell Conditions
                  </div>
                  <ol style={{ margin: 0, paddingLeft: '18px', color: '#e2e8f0', fontSize: '12px', lineHeight: '1.55' }}>
                    <li>EMA3 &lt; EMA5 on 1m, 5m, and 15m</li>
                    <li>MACD &lt; Signal on 5m and 15m</li>
                    <li>MACD(1m) &lt; 0 and MACD(5m) &lt; 0</li>
                    <li>+DI(5m) &lt; 15 OR +DI(15m) &lt; 15</li>
                    <li>ADX &gt; 25 on 1m OR 5m OR 15m</li>
                    <li>ADX(5m) &gt; 25</li>
                    <li>-DI(5m) &gt; 25 OR -DI(15m) &gt; 25</li>
                    <li>-DI(5m) &gt; ADX(5m) OR -DI(15m) &gt; ADX(15m)</li>
                    <li>-DI(1m) &gt; ADX(1m) and ADX(1m) &gt; 25</li>
                    <li>ADX(1m) &gt; +DI(1m)</li>
                    <li>EMA5(1m) &lt; VWAP(1m)</li>
                    <li>LTP &gt; LBB(5m)</li>
                  </ol>
                </div>
              </div>
            </div>

            <SignalFilterPlayground
              buyData={selectedFilterBuyData}
              sellData={selectedFilterSellData}
              showFilters={false}
              showTables={true}
              title={`Filtered Tables (${uiFilterStockSource === 'intersected' ? 'Intersected Source' : 'Low-Price Source'})`}
              onSymbolClick={openNamedChart}
              buyChecks={buyFilterChecks}
              sellChecks={sellFilterChecks}
              onBuyChecksChange={handleBuyChecksChange}
              onSellChecksChange={handleSellChecksChange}
            />

            <TargetOrderDetails 
              targetOrders={targetOrderDetails}
              isVisible={showTargetOrderDetails}
              onClose={() => setShowTargetOrderDetails(false)}
            />
          </SectionBody>
        </SectionCard>

        <SectionCard>
          <SectionHeader>
            <SectionTitle>Trading Control Panel</SectionTitle>
            <SectionSubTitle>Auto trade, polling, execution updates, and account controls</SectionSubTitle>
          </SectionHeader>
          <SectionBody>
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
              marginsData={scannerMargins}
            />
          </SectionBody>
        </SectionCard>

        </TopSectionsGrid>

        <SectionCard style={{ marginTop: '16px' }}>
          <SectionHeader>
            <SectionTitle>Pure Crossover and Crossdown</SectionTitle>
            <SectionSubTitle>EMA3(1m) crosses above/below VWMA(5) from separate scan routes</SectionSubTitle>
          </SectionHeader>
          <SectionBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '10px', fontWeight: 800, color: '#86efac', background: 'rgba(20, 83, 45, 0.22)' }}>
                  Crossover (EMA3(1m) crosses above VWMA(5))
                </div>
                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>Symbol</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>LTP</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>EMA3(1m)</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>VWMA(5)</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>Chart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scanResults.crossoverTable || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '10px', color: '#94a3b8' }}>No crossover stocks in latest scan.</td>
                        </tr>
                      ) : (
                        (scanResults.crossoverTable || []).map((row, idx) => (
                          <tr key={`cross-${row.symbol || idx}`}>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{row.symbol || 'N/A'}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{Number(row.ltp || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{Number(row.ema3_1 || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{Number(row.vwma_5 || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{renderChartCell(row, 'crossover')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '10px', fontWeight: 800, color: '#fca5a5', background: 'rgba(127, 29, 29, 0.22)' }}>
                  Crossdown (EMA3(1m) crosses below VWMA(5))
                </div>
                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>Symbol</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>LTP</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>EMA3(1m)</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>VWMA(5)</th>
                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(148, 163, 184, 0.35)' }}>Chart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scanResults.crossdownTable || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '10px', color: '#94a3b8' }}>No crossdown stocks in latest scan.</td>
                        </tr>
                      ) : (
                        (scanResults.crossdownTable || []).map((row, idx) => (
                          <tr key={`crossdown-${row.symbol || idx}`}>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{row.symbol || 'N/A'}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{Number(row.ltp || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{Number(row.ema3_1 || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{Number(row.vwma_5 || 0).toFixed(2)}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid rgba(71, 85, 105, 0.35)' }}>{renderChartCell(row, 'crossdown')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </SectionBody>
        </SectionCard>
        
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
        
        {/*
        <SectionCard>
          <SectionHeader>
            <SectionTitle>Scanner Workspace</SectionTitle>
            <SectionSubTitle>Full scanner output, stock universe, and crossover/crossdown context</SectionSubTitle>
          </SectionHeader>
          <SectionBody>
            <ScannerSection>
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
          </SectionBody>
        </SectionCard>
        */}
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
    </AppContainer>
  );
}

export default App;
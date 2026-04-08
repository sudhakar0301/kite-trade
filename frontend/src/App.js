import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import TradingDashboard from './components/TradingDashboard';
import WebSocketManager from './utils/WebSocketManager';
import TradingControlPanel from './components/TradingControlPanel';
// import TickAnalysisTable from './components/TickAnalysisTable';
import OrderBookPanel from './components/OrderBookPanel';
import SubscribedStockTracker from './components/SubscribedStockTracker';
// import AlgorithmTutorial from './components/AlgorithmTutorial';
import './App.css';


const DevConsole = styled.div`
  background: linear-gradient(135deg, #0d1117, #161b22);
  border: 1px solid #30363d;
  border-radius: 16px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #c9d1d9;
  padding: 24px;
  margin: 20px 20px 30px 20px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  max-height: 300px;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(139, 148, 158, 0.3);
    border-radius: 3px;
    
    &:hover {
      background: rgba(139, 148, 158, 0.5);
    }
  }
`;

const ConsoleHeader = styled.div`
  color: #ffd700;
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(139, 148, 158, 0.2);
  text-align: center;
  letter-spacing: 0.5px;
`;

const TokenLine = styled.div`
  margin-bottom: 8px;
  color: ${props => {
    if (props.type === 'sell') return '#f85149';
    if (props.type === 'buy') return '#3fb950';
    if (props.type === 'status') return '#79c0ff';
    return '#e6edf3';
  }};
  font-size: 12px;
  padding: 4px 0;
  font-weight: 500;
  
  &:hover {
    background: rgba(139, 148, 158, 0.1);
    border-radius: 4px;
    padding: 4px 8px;
    margin: 0 -8px 8px -8px;
  }
`;

const HighlightValue = styled.span`
  color: #ffd700;
  font-weight: 600;
`;

const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%);
  background-attachment: fixed;
  color: #ffffff;
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  overflow-x: hidden;
  padding-right: 360px; // Make space for the floating control panel
  
  @media (max-width: 768px) {
    padding-right: 0;
  }
`;

const ContentWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
`;

const MainContent = styled.main`
  padding: 0 20px 40px 20px;
  max-width: 1800px;
  margin: 0 auto;
`;

const KiteStatusContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(15px);
  padding: 18px 24px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 2rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
`;

const ScannerSection = styled.div`
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
  margin-top: 24px;
  transition: all 0.3s ease;
  &:hover {
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3);
  }
`;

function App() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [tickData, setTickData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [buySignals, setBuySignals] = useState([]);
  const [sellSignals, setSellSignals] = useState([]);
  const [lastUpdate, setLastUpdate] = useState('Never');
  const [orderNotification, setOrderNotification] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [kiteLoginStatus, setKiteLoginStatus] = useState('checking');
  const [accessToken, setAccessToken] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollCountdown, setPollCountdown] = useState(0);
  const [pollInterval, setPollInterval] = useState(15); // Default 15 seconds
  const [currentTick, setCurrentTick] = useState(null);
  const [symbolTickData, setSymbolTickData] = useState({}); // Group ticks by symbol
  const [orderBookOpen, setOrderBookOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [lastSpokenMessage, setLastSpokenMessage] = useState('');
  const [lastSpeakTime, setLastSpeakTime] = useState(0);
  const [realSubscriptionCount, setRealSubscriptionCount] = useState(0);

  // Refs
  const pollIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const hasInitialLoaded = useRef(false);

  // Handle tick updates from real market data
  const handleTickUpdate = useCallback((tick, source = 'kite') => {
    console.log('📊 App: Received tick update from', source, ':', tick.symbol, '₹' + tick.last_price);
    console.log('🔍 Full tick data:', tick);
    
    setCurrentTick(tick);
    
    // Group ticks by symbol for analysis table
    setSymbolTickData(prev => {
      const symbolHistory = prev[tick.symbol] || [];
      const newSymbolHistory = [tick, ...symbolHistory].slice(0, 10); // Last 10 ticks per symbol
      
      const updated = {
        ...prev,
        [tick.symbol]: newSymbolHistory
      };
      
      console.log('🔍 Updated symbolTickData keys:', Object.keys(updated));
      console.log('🔍 Total symbols in tick data:', Object.keys(updated).length);
      
      return updated;
    });
    
    setLastUpdate(new Date().toLocaleTimeString());
  }, []);

  // Handle order book panel
  const handleSymbolClick = useCallback((symbol) => {
    setSelectedSymbol(symbol);
    setOrderBookOpen(true);
  }, []);

  const handleCloseOrderBook = useCallback(() => {
    setOrderBookOpen(false);
    setSelectedSymbol(null);
  }, []);

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
  const openKiteLogin = () => {
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
  };

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

  // Auto trading via SEPARATE routes
  const executeAutoTradingViaSeparateRoutes = useCallback(async (buyStocks, sellStocks) => {
    const token = accessToken || localStorage.getItem('kite_access_token');
    if (!token || token === 'demo_token') {
      console.log('⚠️ No valid access token for auto trading');
      return;
    }

    console.log(`🤖 Executing auto trading via SEPARATE routes:`);
    console.log(`   - Buy stocks: ${buyStocks.length}`);
    console.log(`   - Sell stocks: ${sellStocks.length}`);

    let ordersPlaced = 0;
    let orderErrors = 0;

    // Process BUY orders first (prefer buy signals)
    if (buyStocks.length > 0) {
      const stock = buyStocks[0]; // Take first buy signal only
      console.log(`📈 Making SEPARATE call to /api/buy-order for ${stock.s}`);
      
      try {
        const buyResponse = await fetch('http://localhost:5000/api/buy-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            orderParams: {
              exchange: 'NSE',
              tradingsymbol: stock.s.replace('NSE:', ''),
              transaction_type: 'BUY',
              // quantity will be calculated by backend using real account data
              price: stock.d[0], // LTP
              product: 'MIS', // Force MIS for all orders
              order_type: 'LIMIT',
              validity: 'DAY'
            },
            ltp: stock.d[0]
          })
        });

        const buyResult = await buyResponse.json();
        console.log('📈 BUY route response:', buyResult);
        console.log('🔍 BUY RESPONSE QUANTITY DEBUG:', buyResult.quantity);
        console.log('🔍 BUY RESPONSE FULL:', JSON.stringify(buyResult, null, 2));

        if (buyResult.success) {
          ordersPlaced++;
          console.log('✅ Setting notification with quantity:', buyResult.quantity);
          setOrderNotification({
            type: 'buy',
            symbol: stock.s.replace('NSE:', ''),
            orderId: buyResult.order_id,
            price: buyResult.price,
            quantity: buyResult.quantity,
            timestamp: new Date().toISOString(),
            success: true
          });
          setTimeout(() => setOrderNotification(null), 8000);
        } else {
          orderErrors++;
          console.error('❌ BUY order failed:', buyResult.error);
          // Show error notification
          setOrderNotification({
            type: 'buy',
            symbol: stock.s.replace('NSE:', ''),
            orderId: null,
            price: stock.d[0],
            quantity: buyResult.quantity || 'Calculating...', // Use returned quantity or fallback
            timestamp: new Date().toISOString(),
            success: false,
            error: buyResult.error
          });
          setTimeout(() => setOrderNotification(null), 10000); // Show errors longer
        }
      } catch (error) {
        orderErrors++;
        console.error('❌ BUY route call failed:', error);
        // Show network error notification
        setOrderNotification({
          type: 'buy',
          symbol: stock.s.replace('NSE:', ''),
          orderId: null,
          price: stock.d[0],
          quantity: 'Network Error',
          timestamp: new Date().toISOString(),
          success: false,
          error: error.message || 'Network error'
        });
        setTimeout(() => setOrderNotification(null), 10000);
      }
    } 
    // Process SELL orders if no buy signals
    else if (sellStocks.length > 0) {
      const stock = sellStocks[0]; // Take first sell signal only
      console.log(`📉 Making SEPARATE call to /api/sell-order for ${stock.s}`);
      
      try {
        const sellResponse = await fetch('http://localhost:5000/api/sell-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            orderParams: {
              exchange: 'NSE',
              tradingsymbol: stock.s.replace('NSE:', ''),
              transaction_type: 'SELL',
              // quantity will be calculated by backend using real account data
              price: stock.d[0], // LTP
              product: 'MIS', // Force MIS for all orders
              order_type: 'LIMIT',
              validity: 'DAY'
            },
            ltp: stock.d[0]
          })
        });

        const sellResult = await sellResponse.json();
        console.log('📉 SELL route response:', sellResult);
        console.log('🔍 SELL RESPONSE QUANTITY DEBUG:', sellResult.quantity);
        console.log('🔍 SELL RESPONSE FULL:', JSON.stringify(sellResult, null, 2));

        if (sellResult.success) {
          ordersPlaced++;
          console.log('✅ Setting notification with quantity:', sellResult.quantity);
          setOrderNotification({
            type: 'sell',
            symbol: stock.s.replace('NSE:', ''),
            orderId: sellResult.order_id,
            price: sellResult.price,
            quantity: sellResult.quantity,
            timestamp: new Date().toISOString(),
            success: true
          });
          setTimeout(() => setOrderNotification(null), 8000);
        } else {
          orderErrors++;
          console.error('❌ SELL order failed:', sellResult.error);
          // Show error notification
          setOrderNotification({
            type: 'sell',
            symbol: stock.s.replace('NSE:', ''),
            orderId: null,
            price: stock.d[0],
            quantity: sellResult.quantity || 'Calculating...', // Use returned quantity or fallback
            timestamp: new Date().toISOString(),
            success: false,
            error: sellResult.error
          });
          setTimeout(() => setOrderNotification(null), 10000); // Show errors longer
        }
      } catch (error) {
        orderErrors++;
        console.error('❌ SELL route call failed:', error);
        // Show network error notification
        setOrderNotification({
          type: 'sell',
          symbol: stock.s.replace('NSE:', ''),
          orderId: null,
          price: stock.d[0],
          quantity: 'Network Error',
          timestamp: new Date().toISOString(),
          success: false,
          error: error.message || 'Network error'
        });
        setTimeout(() => setOrderNotification(null), 10000);
      }
    }

    // Voice feedback for auto trading results
    if (ordersPlaced > 0) {
      speak(`${ordersPlaced} orders placed via separate routes`);
    }
    if (orderErrors > 0) {
      speak(`${orderErrors} order errors occurred`);
    }

    console.log(`🎯 Auto trading via SEPARATE routes complete - Orders: ${ordersPlaced}, Errors: ${orderErrors}`);
  }, [accessToken, speak]);

  // Scanner data fetch function
  const fetchScannerData = useCallback(async () => {
    try {
      // STEP 1: Call scanner endpoint for data ONLY (no auto trading)
      console.log('🔍 Step 1: Fetching scanner data only...');
      const response = await fetch('http://localhost:5000/api/all-scanners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          autoTrade: false, // Always false - scanner only returns data
          access_token: accessToken || localStorage.getItem('kite_access_token')
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Scanner response received:');
        console.log('   - Full data:', data);
        console.log('   - Data type:', typeof data);
        console.log('   - Data keys:', Object.keys(data));
        
        // Extract buy and sell stocks from the consolidated response
        const buyStocks = data.buyStocks || [];
        const sellStocks = data.sellStocks || [];
        
        console.log('📊 Extracted signals:');
        console.log(`   - buyStocks: ${buyStocks.length} items`);
        console.log(`   - sellStocks: ${sellStocks.length} items`);
        if (buyStocks.length > 0) console.log('   - First buy stock:', buyStocks[0]);
        if (sellStocks.length > 0) console.log('   - First sell stock:', sellStocks[0]);
        
        setBuySignals(buyStocks.map(stock => ({
          symbol: stock.s,
          ltp: stock.d[0], // close price
          volume: stock.d[1] || 0,
          change_percent: ((stock.d[0] - stock.d[1]) / stock.d[1] * 100) || 0
        })));
        
        setSellSignals(sellStocks.map(stock => ({
          symbol: stock.s,
          ltp: stock.d[0], // close price  
          volume: stock.d[1] || 0,
          change_percent: ((stock.d[0] - stock.d[1]) / stock.d[1] * 100) || 0
        })));
        
        setLastUpdate(new Date().toLocaleTimeString());
        
        // STEP 2: If auto trading enabled, make SEPARATE route calls
        console.log(`📊 Debug Auto Trading Check:`);
        console.log(`   - autoTradingEnabled: ${autoTradingEnabled}`);
        console.log(`   - buyStocks.length: ${buyStocks.length}`);
        console.log(`   - sellStocks.length: ${sellStocks.length}`);
        console.log(`   - accessToken: ${accessToken ? 'present' : 'missing'}`);
        console.log(`   - kiteLoginStatus: ${kiteLoginStatus}`);
        
        if (autoTradingEnabled && (buyStocks.length > 0 || sellStocks.length > 0) && kiteLoginStatus === 'logged-in') {
          console.log('🚀 Step 2: Auto trading enabled - making SEPARATE route calls...');
          await executeAutoTradingViaSeparateRoutes(buyStocks, sellStocks);
        } else {
          console.log('⚠️ Auto trading not triggered because:');
          if (!autoTradingEnabled) console.log('   - Auto trading is DISABLED');
          if (buyStocks.length === 0 && sellStocks.length === 0) console.log('   - No buy/sell signals found');
          if (kiteLoginStatus !== 'logged-in') console.log(`   - Kite login status: ${kiteLoginStatus} (need logged-in)`);
        }
        
        // Regular voice alert for scanner results
        if (voiceEnabled && (buyStocks.length > 0 || sellStocks.length > 0)) {
          speak(`Scanner found ${buyStocks.length} buy signals and ${sellStocks.length} sell signals`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch scanner data:', error);
      // Set empty arrays on error
      setBuySignals([]);
      setSellSignals([]);
    }
  }, [voiceEnabled, autoTradingEnabled, speak, accessToken, kiteLoginStatus, executeAutoTradingViaSeparateRoutes]);

  // Initialize WebSocket connection
  useEffect(() => {
    const websocket = new WebSocketManager('ws://localhost:5000');

    websocket.onConnect = () => {
      setSocketConnected(true);
      console.log('🔗 WebSocket connected');
      // No auto-fetch here - let polling handle it
    };

    websocket.onDisconnect = () => {
      setSocketConnected(false);
      console.log('🔌 WebSocket disconnected');
    };

    websocket.onMessage = (data) => {
      console.log('📡 WebSocket received:', data.type, data);
      
      if (data.type === 'tick_update') {
        // Process real tick data through the same handler as mock data
        if (data.tick) {
          console.log('🔄 Processing real tick data:', data.tick.symbol, '₹' + data.tick.last_price);
          handleTickUpdate(data.tick, 'websocket');
        }
        
        // Also update legacy tickData for backward compatibility
        setTickData(data);
        setAnalysisData({
          analysis: data.analysis,
          signals: data.signals,
          position: data.position
        });
      } else if (data.type === 'tick_batch') {
        // Handle multiple ticks at once
        console.log(`🔄 Processing ${data.ticks?.length || 0} real ticks`);
        if (data.ticks && Array.isArray(data.ticks)) {
          data.ticks.forEach(tick => {
            console.log('📊 Batch tick:', tick.symbol, '₹' + tick.last_price);
            handleTickUpdate(tick, 'websocket-batch');
          });
        }
      } else if (data.type === 'scanner_results') {
        setBuySignals(data.buySignals || []);
        setSellSignals(data.sellSignals || []);
        setLastUpdate(new Date().toLocaleTimeString());
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
  }, [handleTickUpdate]);

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

  const togglePolling = () => {
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
  };

  const startPolling = () => {
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
  };

  const toggleAutoTrading = () => {
    setAutoTradingEnabled(!autoTradingEnabled);
    speak(autoTradingEnabled ? 'Auto trading disabled' : 'Auto trading enabled');
  };

  // Clear order notification
  const clearOrderNotification = () => {
    setOrderNotification(null);
  };

  return (
    <AppContainer>
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
        onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
        isPolling={isPolling}
        pollCountdown={pollCountdown}
        onTogglePolling={togglePolling}
        pollInterval={pollInterval}
        onChangePollInterval={setPollInterval}
        subscribedStocksCount={realSubscriptionCount}
      />
      
      <ContentWrapper>
      
      {/* Main Tick Data Console - Hidden */}
      {/*
      <DevConsole>
        <ConsoleHeader>
          📡 LIVE MARKET SCANNER & TICK DATA STREAM • {new Date().toLocaleTimeString()}
        </ConsoleHeader>
        
        {currentTick ? (
          <>
            <TokenLine type="buy">
              <HighlightValue>[TICK]</HighlightValue> {currentTick.symbol} • LTP: <HighlightValue>₹{currentTick.last_price?.toFixed(2)}</HighlightValue> • Vol: <HighlightValue>{currentTick.volume?.toLocaleString()}</HighlightValue>
            </TokenLine>
            <TokenLine>
              📈 Bid: <HighlightValue>₹{currentTick.depth?.buy?.[0]?.price?.toFixed(2)} ({currentTick.depth?.buy?.[0]?.quantity})</HighlightValue> | Ask: <HighlightValue>₹{currentTick.depth?.sell?.[0]?.price?.toFixed(2)} ({currentTick.depth?.sell?.[0]?.quantity})</HighlightValue>
            </TokenLine>
            <TokenLine type="status">
              ⚖️ Order Imbalance: Buy <HighlightValue>{currentTick.buy_quantity}</HighlightValue> vs Sell <HighlightValue>{currentTick.sell_quantity}</HighlightValue> • Spread: <HighlightValue>₹{((currentTick.depth?.sell?.[0]?.price || 0) - (currentTick.depth?.buy?.[0]?.price || 0)).toFixed(2)}</HighlightValue>
            </TokenLine>
          </>
        ) : (
          <TokenLine>
            🔍 Waiting for live tick data stream • Mock data will generate shortly...
          </TokenLine>
        )}
      </DevConsole>
      */}

      <MainContent>
        {/* Algorithm Tutorial - Commented out */}
        {/* <AlgorithmTutorial /> */}
        
        {/* Live Stock Tracker */}
        <SubscribedStockTracker tickData={symbolTickData} />
        
        {/* Trading Dashboard - Temporarily Hidden */}
        {/*
        <ScannerSection>
          <TradingDashboard 
            tickData={symbolTickData}
            analysisData={analysisData}
            buySignals={buySignals}
            sellSignals={sellSignals}
            onSymbolClick={handleSymbolClick}
          />
        </ScannerSection>
        */}
      </MainContent>
      
      {/* Order Book Panel */}
      <OrderBookPanel 
        isOpen={orderBookOpen}
        symbol={selectedSymbol}
        tickData={symbolTickData}
        onClose={handleCloseOrderBook}
      />
      </ContentWrapper>
    </AppContainer>
  );
}

export default App;
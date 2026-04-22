import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import TradingDashboard from './components/TradingDashboard';
import WebSocketManager from './utils/WebSocketManager';
import TradingControlPanel from './components/TradingControlPanel';
// import TickAnalysisTable from './components/TickAnalysisTable';
import OrderExecutionPanel from './components/OrderExecutionPanel';
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
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    padding: 20px;
    margin: 16px 16px 24px 16px;
    font-size: 12px;
    max-height: 250px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    padding: 16px;
    margin: 12px 12px 20px 12px;
    font-size: 11px;
    max-height: 220px;
    border-radius: 12px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    padding: 14px;
    margin: 10px 10px 16px 10px;
    max-height: 200px;
    border-radius: 10px;
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
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    font-size: 14px;
    margin-bottom: 15px;
    padding-bottom: 10px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    font-size: 13px;
    margin-bottom: 12px;
    padding-bottom: 8px;
  }
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
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  
  /* Large laptop adjustments */
  @media (max-width: 1600px) {
    grid-template-columns: 1fr 300px;
    gap: 16px;
  }
  
  /* Standard laptop */
  @media (max-width: 1400px) {
    grid-template-columns: 1fr 280px;
    gap: 12px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    grid-template-columns: 1fr 260px;
    gap: 10px;
  }
  
  /* Tablet landscape - side by side */
  @media (min-width: 769px) and (max-width: 1024px) {
    grid-template-columns: 1fr 240px;
    gap: 8px;
  }
  
  /* Mobile and tablet portrait - stack vertically */
  @media (max-width: 768px) {
    display: block;
    padding-bottom: 0;
  }
`;

const ControlPanelWrapper = styled.div`
  /* Desktop - sticky position in grid */
  @media (min-width: 769px) {
    order: 2;
    padding: 20px;
    display: flex;
    justify-content: center;
  }
  
  /* Mobile - let TradingControlPanel handle fixed positioning */
  @media (max-width: 768px) {
    order: 1;
    padding: 0;
  }
`;

const ContentWrapper = styled.div`
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  
  /* Mobile - full width */
  @media (max-width: 768px) {
    order: 2;
  }
`;

const MainContent = styled.main`
  padding: 20px;
  flex: 1;
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 12px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    padding: 8px;
  }
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
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 1rem;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    padding: 10px 12px;
    border-radius: 12px;
  }
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
  
  /* Tablet adjustments */
  @media (max-width: 1024px) {
    padding: 24px;
    border-radius: 20px;
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 16px;
    border-radius: 16px;
    margin-top: 16px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    padding: 12px;
    border-radius: 12px;
    margin-top: 12px;
  }
`;

const ScanBlockNotification = styled.div`
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: 2px solid #fbbf24;
  color: white;
  padding: 20px 24px;
  border-radius: 16px;
  margin: 20px;
  font-weight: 600;
  text-align: center;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.3);
  animation: pulse 2s infinite;
  
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.85; transform: scale(1.02); }
  }
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    padding: 16px 20px;
    margin: 16px;
    border-radius: 14px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    padding: 14px 18px;
    margin: 14px;
    border-radius: 12px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    padding: 12px 16px;
    margin: 12px;
    border-radius: 10px;
  }
`;

const ScanBlockHeader = styled.div`
  font-size: 18px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    font-size: 17px;
    margin-bottom: 10px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    font-size: 16px;
    margin-bottom: 8px;
    gap: 6px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    font-size: 15px;
  }
`;

const ScanBlockDetails = styled.div`
  font-size: 14px;
  opacity: 0.9;
  margin-bottom: 8px;
`;

const ScanBlockTiming = styled.div`
  font-size: 12px;
  opacity: 0.8;
  font-style: italic;
`;

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

  // Refs
  const pollIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const hasInitialLoaded = useRef(false);



  // Handle order execution panel
  const handleClearOrderExecutions = useCallback(() => {
    setOrderExecutions([]);
    console.log('🗑️ [ORDER] Order executions cleared');
    console.log('🎯 [PANEL] Order executions cleared, panel remains open');
  }, []);

  const handleCloseOrderPanel = useCallback(() => {
    setOrderPanelOpen(false);
    console.log('🎯 [PANEL] Order panel closed manually');
  }, []);

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
    
    if (token) {
      const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${token}`;
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
      }
    } else {
      console.warn(`⚠️ Symbol "${cleanSymbol}" not found in ${mappingCount} mappings`);
      
      // TradingView fallback
      const tradingViewUrl = `https://in.tradingview.com/chart/?symbol=NSE%3A${cleanSymbol}`;
      const tabName = 'kite-chart-tab'; // Use same simple tab name for consistency
      
      console.log(`📈 Opening TradingView fallback for ${cleanSymbol}`);
      
      try {
        const newTab = window.open(tradingViewUrl, tabName);
        if (newTab) {
          newTab.focus();
          console.log(`✅ TradingView chart opened: ${tabName}`);
        } else {
          alert(`📊 Chart blocked!\nSymbol: ${cleanSymbol}\nTried TradingView fallback but popup was blocked.`);
        }
      } catch (error) {
        console.error('❌ Error opening TradingView chart:', error);
        alert(`📊 No chart available for ${cleanSymbol}\nBoth Kite and TradingView failed.\nSymbol mappings loaded: ${mappingCount}`);
      }
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

  // Auto trading via SEPARATE routes
  const executeAutoTradingViaSeparateRoutes = useCallback(async (buyStocks, sellStocks) => {
    console.log('🎯 [AUTO-TRADE] === FUNCTION CALLED ===');
    console.log('🎯 [AUTO-TRADE] autoTradingEnabled:', autoTradingEnabled);
    console.log('🎯 [AUTO-TRADE] buyStocks:', buyStocks);
    console.log('🎯 [AUTO-TRADE] sellStocks:', sellStocks);
    
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

    console.log(`🤖 Executing auto trading via TICKER SYSTEM:`);
    console.log(`   - Buy stocks: ${buyStocks.length}`);
    console.log(`   - Sell stocks: ${sellStocks.length}`);

    try {
      // 🎯 ENABLE TICKER-BASED AUTO-TRADE: Set backend auto-trade mode
      const autoTradeResponse = await fetch('http://localhost:5000/api/enable-auto-trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: true,
          accessToken: token
        })
      });

      const autoTradeResult = await autoTradeResponse.json();
      
      if (autoTradeResult.success) {
        console.log('✅ [TICKER] Auto-trade enabled successfully - ticker will handle all orders');
        
        // Show auto-trade enabled notification
        setOrderNotification({
          type: 'info',
          symbol: 'AUTO-TRADE',
          orderId: null,
          price: null,
          quantity: 'ENABLED',
          timestamp: new Date().toISOString(),
          success: true,
          message: `Auto-trade enabled - ${buyStocks.length} buy + ${sellStocks.length} sell stocks monitored`
        });
        setTimeout(() => setOrderNotification(null), 5000);
        
      } else {
        console.error('❌ [TICKER] Failed to enable auto-trade:', autoTradeResult.error);
        
        setOrderNotification({
          type: 'error',
          symbol: 'AUTO-TRADE',
          orderId: null,
          price: null,
          quantity: 'FAILED',
          timestamp: new Date().toISOString(),
          success: false,
          error: autoTradeResult.error
        });
        setTimeout(() => setOrderNotification(null), 8000);
      }
    } catch (error) {
      console.error('❌ [TICKER] Auto-trade enable failed:', error);
      
      setOrderNotification({
        type: 'error',
        symbol: 'AUTO-TRADE',
        orderId: null,
        price: null,
        quantity: 'ERROR',
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message || 'Network error'
      });
      setTimeout(() => setOrderNotification(null), 8000);
    }

    console.log(`🎯 Auto trading via TICKER SYSTEM complete`);
  }, [accessToken, speak]);

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
          autoTrade: false, // Always false - scanner only returns data
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
        
        console.log('📊 Intersection Summary:', intersectionData);
        
        setLastUpdate(new Date().toLocaleTimeString());
        
        // STEP 2: If auto trading enabled, make SEPARATE route calls with low-price results
        console.log(`📊 Debug Auto Trading Check:`);
        console.log(`   - autoTradingEnabled: ${autoTradingEnabled}`);
        console.log(`   - buyStocks.length: ${buyStocks.length}`);
        console.log(`   - sellStocks.length: ${sellStocks.length}`);
        console.log(`   - accessToken: ${accessToken ? 'present' : 'missing'}`);
        console.log(`   - kiteLoginStatus: ${kiteLoginStatus}`);
        
        if (autoTradingEnabled && (buyStocks.length > 0 || sellStocks.length > 0) && kiteLoginStatus === 'logged-in') {
          console.log('🚀 Step 2: Auto trading enabled - making SEPARATE route calls with low-price results...');
          console.log('🎯 [AUTO-TRADE] About to call executeAutoTradingViaSeparateRoutes with:', {
            buyStocks: buyStocks.map(s => s.s || s.symbol),
            sellStocks: sellStocks.map(s => s.s || s.symbol)
          });
          await executeAutoTradingViaSeparateRoutes(buyStocks, sellStocks);
          console.log('🎯 [AUTO-TRADE] executeAutoTradingViaSeparateRoutes completed');
        } else {
          console.log('⚠️ Auto trading not triggered because:');
          if (!autoTradingEnabled) console.log('   - Auto trading is DISABLED');
          if (buyStocks.length === 0 && sellStocks.length === 0) console.log('   - No buy/sell signals found');
          if (kiteLoginStatus !== 'logged-in') console.log(`   - Kite login status: ${kiteLoginStatus} (need logged-in)`);
        }
        
        // Voice alert for low-price scanner results
        if (voiceEnabled && (buyStocks.length > 0 || sellStocks.length > 0)) {
          speak(`Low price scanner found ${buyStocks.length} buy signals and ${sellStocks.length} sell signals from stocks under ₹4000`);
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
              console.log(`🚀 Opening chart for ${chart.type} ${chart.symbol}: ${chart.chartUrl}`);
              window.open(chart.chartUrl, '_blank');
            }, index * 500); // 500ms delay between each tab
          });
        }
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
  }, []);

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

  const toggleAutoTrading = useCallback(() => {
    setAutoTradingEnabled(!autoTradingEnabled);
    speak(autoTradingEnabled ? 'Auto trading disabled' : 'Auto trading enabled');
  }, [autoTradingEnabled, speak]);

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
        
        {/* Live Stock Tracker - NOW VISIBLE */}
        <SubscribedStockTracker 
          tickData={tickData}
          onOpenChart={openNamedChart}
          subscribedCount={realSubscriptionCount}
          buySignalsCount={buySignals.length}
          sellSignalsCount={sellSignals.length}
          pollCountdown={pollCountdown}
        />
        
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
      
      {/* Order Execution Panel */}
      <OrderExecutionPanel 
        isOpen={orderPanelOpen}
        orderExecutions={orderExecutions}
        onClose={handleCloseOrderPanel}
        onClear={handleClearOrderExecutions}
      />
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
import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import TradingDashboard from './components/TradingDashboard';
import WebSocketManager from './utils/WebSocketManager';
import AutoTradingButton from './components/AutoTradingButton';
import OrderNotificationPanel from './components/OrderNotificationPanel';
import TradingInfoPanel from './components/TradingInfoPanel';
import ScannerControls from './components/ScannerControls';
import './App.css';


const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #1e3c72 100%);
  background-attachment: fixed;
  color: #ffffff;
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  overflow-x: hidden;
`;

const Header = styled.header`
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  margin: 24px;
  padding: 2.5rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  &:hover {
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2), 0 8px 16px rgba(0, 0, 0, 0.15);
  }
`;

const Title = styled.h1`
  margin: 0 0 1rem 0;
  font-size: 2.8rem;
  font-weight: 700;
  background: linear-gradient(90deg, #ffffff 0%, #e3f2fd 50%, #ffffff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  letter-spacing: -0.8px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const Subtitle = styled.p`
  margin: 0 0 2rem 0;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  font-weight: 500;
`;

const MainContent = styled.main`
  padding: 0 20px 40px 20px;
  max-width: 1800px;
  margin: 0 auto;
`;

const StatusBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(15px);
  padding: 18px 24px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  margin-bottom: 2rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
`;

const ScannerSection = styled.div`
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08);
  margin-top: 24px;
  transition: all 0.3s ease;
  &:hover {
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1);
  }
`;

function App() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [tickData, setTickData] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [buySignals, setBuySignals] = useState([]);
  const [sellSignals, setSellSignals] = useState([]);
  const [marketStatus] = useState('Checking...');
  const [fundInfo] = useState({ available: 0, leverage: 0 });
  const [positions] = useState([]);
  const [lastUpdate, setLastUpdate] = useState('Never');
  const [orderNotification, setOrderNotification] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [kiteLoginStatus, setKiteLoginStatus] = useState('checking');
  const [accessToken, setAccessToken] = useState(null);

  // Refs
  const pollIntervalRef = useRef(null);
  const hasInitialLoaded = useRef(false);

  // Check Kite login status
  useEffect(() => {
    const token = localStorage.getItem('kite_access_token');
    if (token && token !== 'demo_token') {
      setAccessToken(token);
      setKiteLoginStatus('logged-in');
    } else {
      setKiteLoginStatus('not-logged-in');
    }
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
        
        if (voiceEnabled) {
          speak('Kite login successful');
        }
        
        // Remove event listener
        window.removeEventListener('message', handleMessage);
        
        // Close login window if still open
        if (loginWindow) {
          loginWindow.close();
        }
      } else if (event.data.type === 'KITE_LOGIN_ERROR') {
        console.error('❌ Login error:', event.data.error);
        setKiteLoginStatus('not-logged-in');
        
        if (voiceEnabled) {
          speak('Kite login failed');
        }
        
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
        if (voiceEnabled) {
          speak('Kite login successful');
        }
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

  // Speech synthesis function
  const speak = useCallback((text) => {
    if (voiceEnabled && 'speechSynthesis' in window) {
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
  }, [voiceEnabled]);

  // Auto trading via SEPARATE routes
  const executeAutoTradingViaSeparateRoutes = useCallback(async (buyStocks, sellStocks) => {
    const token = accessToken || localStorage.getItem('kite_access_token');
    if (!token || token === 'demo_token') {
      console.log('⚠️ No valid access token for auto trading');
      speak('Auto trading requires Kite login');
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
              quantity: 1,
              price: stock.d[0], // LTP
              product: 'CNC', // Use CNC for after hours/weekend
              order_type: 'LIMIT',
              validity: 'DAY'
            },
            ltp: stock.d[0]
          })
        });

        const buyResult = await buyResponse.json();
        console.log('📈 BUY route response:', buyResult);

        if (buyResult.success) {
          ordersPlaced++;
          setOrderNotification({
            type: 'buy',
            symbol: stock.s.replace('NSE:', ''),
            orderId: buyResult.order_id,
            price: buyResult.price,
            quantity: buyResult.quantity,
            timestamp: new Date().toISOString()
          });
          setTimeout(() => setOrderNotification(null), 8000);
        } else {
          orderErrors++;
          console.error('❌ BUY order failed:', buyResult.error);
        }
      } catch (error) {
        orderErrors++;
        console.error('❌ BUY route call failed:', error);
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
              quantity: 1,
              price: stock.d[0], // LTP
              product: 'CNC', // Use CNC for after hours/weekend
              order_type: 'LIMIT',
              validity: 'DAY'
            },
            ltp: stock.d[0]
          })
        });

        const sellResult = await sellResponse.json();
        console.log('📉 SELL route response:', sellResult);

        if (sellResult.success) {
          ordersPlaced++;
          setOrderNotification({
            type: 'sell',
            symbol: stock.s.replace('NSE:', ''),
            orderId: sellResult.order_id,
            price: sellResult.price,
            quantity: sellResult.quantity,
            timestamp: new Date().toISOString()
          });
          setTimeout(() => setOrderNotification(null), 8000);
        } else {
          orderErrors++;
          console.error('❌ SELL order failed:', sellResult.error);
        }
      } catch (error) {
        orderErrors++;
        console.error('❌ SELL route call failed:', error);
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
  }, [accessToken, speak, voiceEnabled]);

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
        console.log('Scanner data received:', data);
        
        // Extract buy and sell stocks from the consolidated response
        const buyStocks = data.buyStocks || [];
        const sellStocks = data.sellStocks || [];
        
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
        if (autoTradingEnabled && (buyStocks.length > 0 || sellStocks.length > 0)) {
          console.log('🚀 Step 2: Auto trading enabled - making SEPARATE route calls...');
          await executeAutoTradingViaSeparateRoutes(buyStocks, sellStocks);
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
  }, [voiceEnabled, autoTradingEnabled, speak, accessToken]);

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
      if (data.type === 'tick_update') {
        setTickData(data);
        setAnalysisData({
          analysis: data.analysis,
          signals: data.signals,
          position: data.position
        });
      } else if (data.type === 'scanner_results') {
        setBuySignals(data.buySignals || []);
        setSellSignals(data.sellSignals || []);
        setLastUpdate(new Date().toLocaleTimeString());
      }
    };

    websocket.connect();

    return () => {
      websocket.disconnect();
    };
  }, []); // Remove fetchScannerData dependency to prevent multiple calls

  // Auto-polling with proper dependency management
  useEffect(() => {
    console.log('🔄 Setting up scanner polling...');
    
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    // Single initial fetch if not already loaded
    if (!hasInitialLoaded.current) {
      const initialTimeout = setTimeout(() => {
        console.log('🚀 Initial scanner fetch on page load');
        hasInitialLoaded.current = true;
        fetchScannerData();
      }, 2000);
      
      // Store timeout to clear if needed
      const timeoutRef = initialTimeout;
      
      // Then poll every 30 seconds
      pollIntervalRef.current = setInterval(() => {
        console.log('⏰ Scheduled scanner poll (30s interval)');
        fetchScannerData();
      }, 30000);

      return () => {
        console.log('🧹 Cleaning up scanner polling');
        clearTimeout(timeoutRef);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    } else {
      // If already loaded, just set up polling
      pollIntervalRef.current = setInterval(() => {
        console.log('⏰ Scheduled scanner poll (30s interval)');
        fetchScannerData();
      }, 30000);
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [fetchScannerData]);

  const toggleAutoTrading = () => {
    setAutoTradingEnabled(!autoTradingEnabled);
    speak(autoTradingEnabled ? 'Auto trading disabled' : 'Auto trading enabled');
  };

  // Handle scanner toggle with Kite login check
  const handleToggleScanning = () => {
    if (!isPolling) {
      // Check if auto trading is enabled and requires Kite login
      if (autoTradingEnabled && kiteLoginStatus !== 'logged-in') {
        const message = 'Please log in to Kite to enable auto trading';
        if (voiceEnabled) {
          speak(message);
        }
        return;
      }
      
      setIsPolling(true);
      // Auto-refresh every 30 seconds when polling starts
      if (!pollIntervalRef.current) {
        fetchScannerData(); // Initial fetch
        pollIntervalRef.current = setInterval(fetchScannerData, 30000);
      }
    } else {
      setIsPolling(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  };

  return (
    <AppContainer>
      <AutoTradingButton 
        enabled={autoTradingEnabled}
        onClick={toggleAutoTrading}
      />
      
      <OrderNotificationPanel 
        notification={orderNotification}
        onClose={() => setOrderNotification(null)}
      />
      
      <Header>
        <Title>🎯 Unified Scanner Dashboard</Title>
        <Subtitle>Comprehensive Stock Screening & Analysis</Subtitle>
        <StatusBar>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <span>Scanner Status: <strong style={{ color: socketConnected ? '#28a745' : '#dc3545' }}>
              {socketConnected ? '✅ Active' : '❌ Inactive'}
            </strong></span>
            <span>Auto-refresh: <strong style={{ color: isPolling ? '#28a745' : '#6c757d' }}>
              {isPolling ? '🔄 ON' : '⏹️ OFF'}
            </strong></span>
            <span>Market: <strong>{marketStatus}</strong></span>
            <span>WebSocket: <strong style={{ color: socketConnected ? '#28a745' : '#dc3545' }}>
              {socketConnected ? '🔗 Connected' : '🔌 Disconnected'}
            </strong></span>
            <span>Kite: <strong style={{ color: kiteLoginStatus === 'logged-in' ? '#28a745' : '#dc3545' }}>
              {kiteLoginStatus === 'logged-in' ? '✅ Logged In' : '❌ Not Logged In'}
            </strong></span>
            {kiteLoginStatus !== 'logged-in' && (
              <button 
                onClick={openKiteLogin}
                style={{
                  background: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔐 Login to Kite
              </button>
            )}
          </div>
        </StatusBar>
      </Header>

      <MainContent>
        <TradingInfoPanel 
          fundInfo={fundInfo}
          positions={positions}
          marketStatus={marketStatus}
          wsStatus={socketConnected ? 'Connected' : 'Disconnected'}
        />
        
        <ScannerControls 
          isPolling={isPolling}
          onTogglePolling={handleToggleScanning}
          onScan={fetchScannerData}
          autoTradingEnabled={autoTradingEnabled}
          onToggleAutoTrading={toggleAutoTrading}
          voiceEnabled={voiceEnabled}
          onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
          lastUpdate={lastUpdate}
        />

        <ScannerSection>
          <TradingDashboard 
            tickData={tickData}
            analysisData={analysisData}
            buySignals={buySignals}
            sellSignals={sellSignals}
          />
        </ScannerSection>
      </MainContent>
    </AppContainer>
  );
}

export default App;
import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { checkAutoTradeConditions, analyzeAllSubscribedStocks } from '../utils/autoTradeCheck';

// Import symbol mappings from backend
let symbolMappings = {};
try {
  // Try to fetch from backend API as fallback
  fetch('http://localhost:5000/api/symbol-mappings')
    .then(res => res.json())
    .then(data => {
      symbolMappings = data.symbolMappings || {};
      console.log('📊 Symbol mappings loaded from backend:', Object.keys(symbolMappings).length, 'symbols');
    })
    .catch(err => console.log('⚠️ Could not fetch symbol mappings from backend:', err));
} catch (err) {
  console.log('⚠️ Error loading symbol mappings:', err);
}

// Fallback local mapping for essential symbols  
const fallbackSymbolMappings = {
  'SAREGAMA': '1252353',
  'RELIANCE': '738561',
  'TCS': '2953217',
  'INFY': '408065',
  'HDFCBANK': '341249',
  'ICICIBANK': '1270529',
  'SBIN': '779521',
  'BHARTIARTL': '2714625',
  'ITC': '424961',
  'LT': '2939649'
};

// Animation for live tracker masking indicator
const pulse = keyframes`
  0% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 0.6; transform: scale(1); }
`;

// Terminal glow animation
const terminalGlow = keyframes`
  0%, 100% { 
    text-shadow: 0 0 8px rgba(0, 255, 65, 0.6), 0 0 16px rgba(0, 255, 65, 0.3);
  }
  50% { 
    text-shadow: 0 0 12px rgba(0, 255, 65, 0.8), 0 0 24px rgba(0, 255, 65, 0.4);
  }
`;

// Matrix-style data stream animation  
const dataStream = keyframes`
  0% { transform: translateY(0px); opacity: 1; }
  100% { transform: translateY(-2px); opacity: 0.9; }
`;

// Styled component for masking badge
const MaskingBadge = styled.span`
  margin-left: 10px;
  padding: 4px 8px;
  background: linear-gradient(45deg, rgba(245, 158, 11, 0.22), rgba(249, 115, 22, 0.14));
  border: 1px solid rgba(251, 191, 36, 0.65);
  border-radius: 12px;
  font-size: 10px;
  color: #fde68a;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const TrackerContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 4px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.75), rgba(15, 23, 42, 0.55));
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
  font-feature-settings: "liga", "tnum", "zero", "ss01", "locl";
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  
  /* Tablet adjustments */
  @media (max-width: 1024px) {
    gap: 6px;
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    gap: 4px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    font-size: 12px;
  }
`;

const AccordionSection = styled.div`
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.86), rgba(17, 24, 39, 0.82));
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
`;

const AccordionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: ${props => props.primary 
    ? 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)' 
    : 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(51, 65, 85, 0.92))'};
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: ${props => props.isExpanded ? '1px solid rgba(148, 163, 184, 0.28)' : 'none'};
  
  &:hover {
    background: ${props => props.primary 
      ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)' 
      : 'linear-gradient(135deg, rgba(51, 65, 85, 0.95), rgba(71, 85, 105, 0.93))'};
  }
`;

const AccordionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: ${props => props.primary ? '#f8fafc' : '#e2e8f0'};
  font-size: 14px;
`;

const AccordionIcon = styled.div`
  color: ${props => props.primary ? '#f8fafc' : '#cbd5e1'};
  font-size: 14px;
  transition: transform 0.2s;
  transform: ${props => props.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const AccordionContent = styled.div`
  max-height: ${props => props.isExpanded ? 'none' : '0'};
  overflow: ${props => props.isExpanded ? 'visible' : 'hidden'};
  transition: ${props => props.isExpanded ? 'opacity 0.3s ease' : 'max-height 0.3s ease'};
  padding: ${props => props.isExpanded ? '20px' : '0 20px'};
  opacity: ${props => props.isExpanded ? '1' : '0'};
`;

const TrackerHeader = styled.div`
  background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
  color: #eff6ff;
  padding: 15px 20px;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const TrackerBody = styled.div`
  padding: 20px;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 20px;
  align-items: start;
  
  /* Large tablet - adjust layout */
  @media (max-width: 1200px) {
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 16px;
    padding: 16px;
  }
  
  /* Tablet - stack some columns */
  @media (max-width: 1024px) {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    padding: 14px;
  }
  
  /* Mobile - single column layout */
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
    padding: 12px;
  }
  
  /* Small mobile */
  @media (max-width: 480px) {
    gap: 12px;
    padding: 10px;
  }
`;



const OrderLevel = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isBest', 'side'].includes(prop),
})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${props => props.isBest ? '8px 10px' : '6px 10px'};
  background: ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '16, 185, 129' : '239, 68, 68'}, 0.20)` : 
    'rgba(30, 41, 59, 0.62)'};
  border: 1px solid ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '52, 211, 153' : '248, 113, 113'}, 0.55)` : 
    'rgba(100, 116, 139, 0.32)'};
  border-radius: 4px;
  font-size: ${props => props.isBest ? '14px' : '13px'};
  font-weight: ${props => props.isBest ? '700' : '600'};
  min-height: 32px;
  
  &:hover {
    background: ${props => props.isBest ? 
      `rgba(${props.side === 'buy' ? '16, 185, 129' : '239, 68, 68'}, 0.28)` : 
      'rgba(51, 65, 85, 0.72)'};
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: ${props => props.isBest ? '10px 12px' : '8px 12px'};
    font-size: ${props => props.isBest ? '13px' : '12px'};
    min-height: 36px;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  @media (max-width: 480px) {
    padding: 8px 10px;
    font-size: 11px;
    min-height: 32px;
  }
`;

const BestLabel = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
  font-size: 10px;
  color: ${props => props.side === 'buy' ? '#34d399' : '#f87171'};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 3px;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const LevelIndex = styled.div`
  color: #c9d1d9;
  font-size: 11px;
  font-weight: 600;
  min-width: 20px;
`;

const LevelPrice = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
  color: ${props => props.side === 'buy' ? '#6ee7b7' : '#fca5a5'};
  font-weight: 700;
  font-size: 13px;
  flex: 1;
  text-align: center;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const LevelQuantity = styled.div`
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  min-width: 50px;
  text-align: right;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;



const SubscribedStockTracker = ({ 
  tickData, 
  onOpenChart, // Add onOpenChart prop
  subscribedCount = 0,
  buySignalsCount = 0,
  sellSignalsCount = 0,
  pollCountdown = 0,
  subscribedSymbols = [],
  signalStocks = { buySignals: [], sellSignals: [] },
  intersectionSignalStocks = null,
  emaCheckSignalStocks = null,
  marginsData = null
}) => {
  // State to track currently selected stock symbol
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // State to track real subscribed symbols from backend API
  const [realSubscribedSymbols, setRealSubscribedSymbols] = useState([]);
  
  // State to trigger re-renders for countdown timer
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // State to track buy/sell stocks for smart Reliance unsubscription
  const [buyStocks, setBuyStocks] = useState([]);
  const [sellStocks, setSellStocks] = useState([]);
  
  // State to force re-render for live market impact data based on tick updates
  const [lastTickUpdate, setLastTickUpdate] = useState(0);
  
  // State to manage accordion sections (for Order Book only)
  const [expandedSections, setExpandedSections] = useState({
    orderBook: true // Order Book accordion starts expanded
  });
  
  // State to track if we're in RELIANCE fallback mode
  const [isRelianceFallback, setIsRelianceFallback] = useState(false);
  const [relianceScanType, setRelianceScanType] = useState('FALLBACK');
  
  // Add ref to track manual symbol selections to prevent auto-override
  const manualSelectionRef = useRef(null);

  // State for funds data (same as scanner)
  const [fundsData, setFundsData] = useState({
    availableFunds: 0,
    leverageFunds: 0,
    usableFunds: 0,
    lastUpdated: null
  });
  const MANUAL_SELECTION_LOCK_TIME = 5000; // 5 seconds protection from auto-override
  
  // Function to toggle accordion sections
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Function to check fallback status
  const checkFallbackStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/fallback-status');
      if (response.ok) {
        const result = await response.json();
        setIsRelianceFallback(result.isRelianceFallback);
        setRelianceScanType(result.relianceScanType || 'FALLBACK');
        console.log('📊 Fallback status:', result);
      } else {
        // Fallback: If route doesn't exist, disable Reliance fallback
        console.log('⚠️ Fallback-status route not available, disabling Reliance fallback');
        setIsRelianceFallback(false);
        setRelianceScanType('DISABLED');
      }
    } catch (error) {
      console.error('❌ Error checking fallback status:', error);
      // Fallback: If route was removed or server error, disable Reliance fallback
      setIsRelianceFallback(false);
      setRelianceScanType('DISABLED');
    }
  }, []);
  
  // Refs to avoid infinite loops
  const symbolTimestampsRef = useRef({});
  const previousSymbolsRef = useRef(new Set());
  const symbolsAtSelectionRef = useRef({}); // Track which symbols existed when each symbol was selected
  const autoOpenedChartsRef = useRef(new Set()); // Track auto-opened charts to prevent duplicates
  
  // Responsive grid template columns function
  const getResponsiveGridTemplate = () => {
    const screenWidth = window.innerWidth;
    
    if (screenWidth <= 480) {
      // Very small mobile: 11 columns - Symbol, Type, LTP, CALC QTY, BID QTY, ASK QTY, BID LEVELS, ASK LEVELS, BUY SLIP, SELL SLIP, FUNDS
      return '45px 25px 35px 30px 30px 30px 35px 35px 35px 35px 60px';
    } else if (screenWidth <= 768) {
      // Mobile: 11 columns
      return '65px 35px 50px 40px 40px 40px 45px 45px 45px 45px 80px';
    } else if (screenWidth <= 1024) {
      // Tablet: 11 columns
      return '85px 40px 65px 55px 55px 55px 60px 60px 60px 60px 100px';
    } else {
      // Desktop: 11 columns
      return '100px 45px 75px 65px 65px 65px 70px 70px 70px 70px 120px';
    }
  };
  
  // State for responsive grid template
  const [gridTemplate, setGridTemplate] = useState(() => getResponsiveGridTemplate());
  
  // Handle window resize for responsive table
  useEffect(() => {
    const handleResize = () => {
      setGridTemplate(getResponsiveGridTemplate());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync subscription and funds state from scanner-driven App props.
  useEffect(() => {
    setRealSubscribedSymbols(Array.isArray(subscribedSymbols) ? [...new Set(subscribedSymbols)] : []);
  }, [subscribedSymbols]);

  useEffect(() => {
    const buy = signalStocks?.buySignals || [];
    const sell = signalStocks?.sellSignals || [];
    setBuyStocks([...new Set(buy)]);
    setSellStocks([...new Set(sell)]);
  }, [signalStocks]);

  useEffect(() => {
    if (!marginsData) return;
    setFundsData({
      availableFunds: Number(marginsData.availableFunds || 0),
      leverageFunds: Number(marginsData.leverageFunds || 0),
      usableFunds: Number(marginsData.usableFunds || 0),
      lastUpdated: new Date().toISOString()
    });
  }, [marginsData]);
  
  // Subscriptions are scan-driven only (backend reconciliation). No manual unsubscribe API calls here.

  // Function to handle buy scan button (RELIANCE only in fallback mode)
  const handleBuyScan = async () => {
    try {
      console.log('🏛️ Triggering RELIANCE Buy Scan...');
      
      const response = await fetch('http://localhost:5000/api/reliance-buy-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ RELIANCE buy scan completed:', result);
        setRelianceScanType('BUY_SCAN');
        alert(`RELIANCE set as Buy Scan symbol\nOrders will only execute if ALL 14 buy conditions are met`);
      } else {
        const error = await response.json();
        console.error('❌ RELIANCE buy scan failed:', error);
        alert('RELIANCE buy scan failed: ' + error.error);
      }
    } catch (error) {
      console.error('❌ Error in RELIANCE buy scan:', error);
      alert('Error in RELIANCE buy scan');
    }
  };

  // Function to handle sell scan button (RELIANCE only in fallback mode)
  const handleSellScan = async () => {
    try {
      console.log('🏛️ Triggering RELIANCE Sell Scan...');
      
      const response = await fetch('http://localhost:5000/api/reliance-sell-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ RELIANCE sell scan completed:', result);
        setRelianceScanType('SELL_SCAN');
        alert(`RELIANCE set as Sell Scan symbol\nOrders will only execute if ALL 14 sell conditions are met`);
      } else {
        const error = await response.json();
        console.error('❌ RELIANCE sell scan failed:', error);
        alert('RELIANCE sell scan failed: ' + error.error);
      }
    } catch (error) {
      console.error('❌ Error in RELIANCE sell scan:', error);
      alert('Error in RELIANCE sell scan');
    }
  };

  // Get dynamic symbol mappings with fallback
  const getSymbolToTokenMap = useCallback(() => {
    // Merge backend mappings with fallback mappings
    const mergedMappings = { ...fallbackSymbolMappings, ...symbolMappings };
    console.log('📊 Using symbol mappings:', Object.keys(mergedMappings).length, 'symbols available');
    return mergedMappings;
  }, []);

  // Get all available symbols (including those without live data yet, e.g., just subscribed)

  const getAllAvailableSymbols = useCallback(() => {
    if (!tickData) {
      console.log('🔍 No tickData available for symbol detection');
      return [];
    }
    
    // tickData contains all subscribed symbols as keys, even those without recent messages
    const allSymbols = Object.keys(tickData);
    console.log('🔍 getAllAvailableSymbols result:', allSymbols);
    
    return allSymbols;
  }, [tickData]);

  // Get stocks that are actually currently subscribed to KiteTicker
  const getSubscribedStocks = useCallback(() => {
    console.log('🔍 DEBUG - realSubscribedSymbols:', realSubscribedSymbols);
    console.log('🔍 DEBUG - tickData keys:', tickData ? Object.keys(tickData) : 'no tickData');
    
    // Always prioritize real subscribed symbols from backend, regardless of tick data
    if (realSubscribedSymbols.length > 0) {
      console.log('🔍 Using all real subscribed symbols from backend (including those without tick data):', realSubscribedSymbols);
      
      // ✅ DEDUPLICATE symbols to prevent table duplicates
      const uniqueSymbols = [...new Set(realSubscribedSymbols)];
      console.log('🔍 Deduplication: original length', realSubscribedSymbols.length, '→ unique length', uniqueSymbols.length);
      
      // ✅ NO SORTING - Keep original subscription order, add new symbols to bottom
      console.log('🔍 Stable order maintained - no sorting by activity');
      return uniqueSymbols; // Return in original order
    }
    
    // Fallback: Show all stocks from tickData in original order (no sorting)
    if (tickData) {
      const stocks = Object.keys(tickData);
      console.log('🔍 Fallback: Stocks in original order (no activity sorting):', stocks);
      return stocks;
    }
    
    return [];
  }, [realSubscribedSymbols, tickData]);

  // Enhanced chart URL function with better debugging and symbol matching
  const getKiteChartUrl = useCallback((symbol) => {
    console.log('🔍 getKiteChartUrl called with:', symbol, 'Type:', typeof symbol);
    
    if (!symbol) {
      console.log('🔍 No symbol provided to getKiteChartUrl');
      return null;
    }
    
    // Clean the symbol (remove NSE: prefix if present)
    let cleanSymbol = typeof symbol === 'string' ? symbol.replace('NSE:', '') : String(symbol);
    console.log('🔍 Clean symbol:', cleanSymbol);
    
    // Get current symbol mappings
    const symbolToTokenMap = getSymbolToTokenMap();
    
    // Look up the token from our mapping
    let token = symbolToTokenMap[cleanSymbol];
    
    // If not found, try common symbol variations and partial matches
    if (!token) {
      console.log('🔍 Direct lookup failed, trying variations...');
      
      // Try partial matches (for cases like SAREGA -> SAREGAMA)
      const possibleMatches = Object.keys(symbolToTokenMap).filter(key => 
        key.startsWith(cleanSymbol) || cleanSymbol.startsWith(key)
      );
      
      if (possibleMatches.length > 0) {
        console.log('🔍 Found possible matches:', possibleMatches);
        cleanSymbol = possibleMatches[0]; // Use first match
        token = symbolToTokenMap[cleanSymbol];
        console.log('🔍 Using symbol variation:', cleanSymbol, 'Token:', token);
      }
    }
    
    console.log('🔍 Final token lookup for', cleanSymbol, '- Found:', token);
    
    if (!token) {
      console.log('🔍 ❌ No token found for symbol:', cleanSymbol);
      console.log('🔍 Available symbols:', Object.keys(symbolToTokenMap).slice(0, 20));
      
      // Try to find similar symbols
      const similarSymbols = Object.keys(symbolToTokenMap).filter(key => 
        key.toLowerCase().includes(cleanSymbol.toLowerCase()) ||
        cleanSymbol.toLowerCase().includes(key.toLowerCase())
      ).slice(0, 5);
      
      if (similarSymbols.length > 0) {
        console.log('🔍 Similar symbols found:', similarSymbols);
      }
      
      return null;
    }
    
    // Construct NSE chart URL
    const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${token}`;
    console.log('🔍 ✅ Generated chart URL:', chartUrl);
    
    return chartUrl;
  }, [getSymbolToTokenMap]);

  // subscription-status is now supplied by App scanner flow only.

  // Check fallback status periodically
  // DISABLED: fallback-status route was removed
  /*
  useEffect(() => {
    // Check initially
    checkFallbackStatus();

    // Check every 5 seconds to keep in sync
    const interval = setInterval(checkFallbackStatus, 5000);

    return () => clearInterval(interval);
  }, [checkFallbackStatus]);
  */

  // Effect to fetch buy/sell stocks for smart Reliance management
  // DISABLED: Now getting signal stocks from enhanced /api/subscription-status
  /*
  // OLD: Removed conflicting fetchBuySellStocks - now using subscription-status data
  // useEffect(() => {
  //   const fetchBuySellStocks = async () => {
  //     try {
  //       const [buyResponse, sellResponse] = await Promise.all([
  //         fetch('http://localhost:5000/api/buy-stocks'),
  //         fetch('http://localhost:5000/api/sell-stocks')
  //       ]);
  //       
  //       if (buyResponse.ok) {
  //         const buyData = await buyResponse.json();
  //         setBuyStocks(buyData.stocks || []);
  //       }
  //       
  //       if (sellResponse.ok) {
  //         const sellData = await sellResponse.json();
  //         setSellStocks(sellData.stocks || []);
  //       }
  //     } catch (error) {
  //       console.error('❌ Error fetching buy/sell stocks:', error);
  //     }
  //   };
  //   
  //   fetchBuySellStocks();
  //   const interval = setInterval(fetchBuySellStocks, 15000); // Check every 15 seconds
  //   
  //   return () => clearInterval(interval);
  // }, []);
  */
  
  // Effect to trigger live updates when tick data changes
  useEffect(() => {
    if (tickData) {
      const newUpdate = Date.now();
      setLastTickUpdate(newUpdate);
      console.log('📊 LIVE TICK UPDATE: Market impact updated at', new Date(newUpdate).toLocaleTimeString());
    }
  }, [tickData]);

  useEffect(() => {
    console.log('🔍 📊 SYMBOL DETECTION EFFECT TRIGGERED');
    const subscribedStocks = getSubscribedStocks();
    const allAvailableSymbols = getAllAvailableSymbols();
    const newSymbolsSet = new Set(allAvailableSymbols);
    console.log('🔍 Currently subscribed stocks:', subscribedStocks);
    console.log('🔍 All available symbols:', allAvailableSymbols);
    
    // Check for newly subscribed symbols (including those without data yet)
    const newSymbols = allAvailableSymbols.filter(symbol => !previousSymbolsRef.current.has(symbol));
    
    console.log('🔍 Symbol detection debug:');
    console.log('  - Previous symbols:', Array.from(previousSymbolsRef.current));
    console.log('  - Current available:', allAvailableSymbols);
    console.log('  - Detected new symbols:', newSymbols);
    
    if (newSymbols.length > 0) {
      console.log('🔍 ✨ NEW SYMBOLS DETECTED:', newSymbols);
      console.log('🔍 Current selectedSymbol:', selectedSymbol);
      console.log('🔍 Current symbolTimestampsRef:', symbolTimestampsRef.current);
      
      // Check for manual selection protection
      const currentTime = Date.now();
      const isManualSelectionActive = manualSelectionRef.current && 
        (currentTime - manualSelectionRef.current.timestamp) < MANUAL_SELECTION_LOCK_TIME;
      
      if (isManualSelectionActive) {
        console.log('🔍 🔒 MANUAL SELECTION PROTECTED - Skipping auto-selection for:', manualSelectionRef.current.symbol, 'Time remaining:', Math.ceil((MANUAL_SELECTION_LOCK_TIME - (currentTime - manualSelectionRef.current.timestamp)) / 1000), 'seconds');
        // Update previous symbols to prevent this from running again
        previousSymbolsRef.current = newSymbolsSet;
        
        // Ensure manually selected symbol stays selected
        if (selectedSymbol !== manualSelectionRef.current.symbol) {
          console.log('🔍 🔄 RESTORING MANUAL SELECTION:', manualSelectionRef.current.symbol);
          setSelectedSymbol(manualSelectionRef.current.symbol);
        }
        return;
      }
      
      // Check if current symbol can be changed (30 seconds elapsed or no current symbol)
      const canChangeSymbol = !selectedSymbol || 
        !symbolTimestampsRef.current[selectedSymbol] || 
        (currentTime - symbolTimestampsRef.current[selectedSymbol] >= 30 * 1000); // 30 seconds in milliseconds
      
      if (canChangeSymbol) {
        // ❌ DISABLED: Auto-selection of trade-ready symbols - only manual selection allowed
        console.log('🎯 Auto-selection DISABLED - Trade-ready symbols detected but not auto-selected. Click to select manually.');
      } else {
        // Current symbol is still in its 30-second display period
        const timeRemaining = 30 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        console.log('🔍 ⏰ Current symbol still has', Math.ceil(timeRemaining / 1000), 'seconds remaining. New symbols will queue.');
      }
    }
    
    // ❌ DISABLED: Auto-fallback symbol selection - order book stays empty until manual click
    if (!selectedSymbol) {
      console.log('🔍 ❌ No selected symbol - Order book will remain empty until manual selection');
    }
    
    // Update previous symbols set
    console.log('🔍 Updating previousSymbolsRef from:', Array.from(previousSymbolsRef.current), 'to:', Array.from(newSymbolsSet));
    previousSymbolsRef.current = newSymbolsSet;
    
    // Cleanup old timestamps and selection records (symbols that are no longer available)
    const cleanedTimestamps = { ...symbolTimestampsRef.current };
    Object.keys(cleanedTimestamps).forEach(symbol => {
      if (!allAvailableSymbols.includes(symbol)) {
        delete cleanedTimestamps[symbol];
        delete symbolsAtSelectionRef.current[symbol]; // Also cleanup selection records
      }
    });
    symbolTimestampsRef.current = cleanedTimestamps;
    
  }, [tickData, getAllAvailableSymbols, getSubscribedStocks, getKiteChartUrl]); // Removed selectedSymbol to prevent manual selection override
  
  // Continuous trade-ready monitoring - runs independently of new symbol detection
  useEffect(() => {
    const checkTradeReadySymbols = () => {
      const allAvailableSymbols = getAllAvailableSymbols();
      const currentTime = Date.now();
      
      console.log('🎯 CONTINUOUS CHECK: Monitoring trade-ready symbols...');
      
      // Check for manual selection protection
      const isManualSelectionActive = manualSelectionRef.current && 
        (currentTime - manualSelectionRef.current.timestamp) < MANUAL_SELECTION_LOCK_TIME;
      
      if (isManualSelectionActive) {
        console.log('🎯 🔒 CONTINUOUS CHECK: Manual selection protected - Skipping auto-selection for:', manualSelectionRef.current.symbol, 'Time remaining:', Math.ceil((MANUAL_SELECTION_LOCK_TIME - (currentTime - manualSelectionRef.current.timestamp)) / 1000), 'seconds');
        return;
      }
      
      // Check if current symbol can be changed (30 seconds elapsed or no current symbol)
      const canChangeSymbol = !selectedSymbol || 
        !symbolTimestampsRef.current[selectedSymbol] || 
        (currentTime - symbolTimestampsRef.current[selectedSymbol] >= 30 * 1000);
      
      if (canChangeSymbol) {
        // Look for trade-ready symbols
        let tradeReadySymbol = null;
        
        for (const symbol of allAvailableSymbols) {
          const tickSymbols = tickData ? Object.keys(tickData) : [];
          const latestTick = tickSymbols.includes(symbol) ? tickData[symbol] : null;
          
          if (latestTick) {
            const tradeConditions = checkAutoTradeConditions(latestTick);
            if (tradeConditions?.canTrade) {
              tradeReadySymbol = symbol;
              console.log('🎯 ✅ CONTINUOUS CHECK: TRADE-READY SYMBOL FOUND:', symbol);
              break;
            }
          }
        }
        
        // ❌ DISABLED: Auto-selection of trade-ready symbols - manual selection only
        if (tradeReadySymbol && tradeReadySymbol !== selectedSymbol) {
          console.log('🎯 🔄 TRADE-READY SYMBOL DETECTED but auto-selection DISABLED:', tradeReadySymbol, '- Click to select manually');
        }
      } else if (selectedSymbol) {
        const timeRemaining = 30 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        console.log('🎯 CONTINUOUS CHECK: Current symbol has', Math.ceil(timeRemaining / 1000), 'seconds remaining');
      }
    };
    
    // Check immediately
    checkTradeReadySymbols();
    
    // Then check every 5 seconds for trade-ready opportunities
    const tradeReadyInterval = setInterval(checkTradeReadySymbols, 5000);
    
    return () => clearInterval(tradeReadyInterval);
  }, [tickData, selectedSymbol, getAllAvailableSymbols, getKiteChartUrl]);
  
  // Effect to notify backend about selected symbol changes for masking
  useEffect(() => {
    const updateLiveTrackerSymbol = async () => {
      try {
        console.log(`🎯 FRONTEND: Updating live tracker symbol for masking: '${selectedSymbol || 'none'}'`);
        console.log(`🎯 FRONTEND: Selected Symbol Type: ${typeof selectedSymbol}, Value: '${selectedSymbol}'`);
        
        const response = await fetch('http://localhost:5000/api/set-live-tracker-symbol', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            symbol: selectedSymbol
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`✅ FRONTEND: Live tracker masking ${result.maskingActive ? 'ENABLED' : 'DISABLED'} for symbol: '${selectedSymbol || 'none'}'`);
          console.log(`✅ FRONTEND: Backend response:`, result);
        } else {
          console.warn('⚠️ FRONTEND: Failed to update live tracker symbol for masking - Response not OK');
        }
      } catch (error) {
        console.error('❌ FRONTEND: Error updating live tracker symbol:', error);
      }
    };
    
    // Update backend with current selected symbol (or null if none selected)
    updateLiveTrackerSymbol();
  }, [selectedSymbol]); // Run whenever selectedSymbol changes
  
  // Effect to automatically check for symbol changes after 30-second periods
  useEffect(() => {
    if (!selectedSymbol || !symbolTimestampsRef.current[selectedSymbol]) return;
    
    const timeElapsed = Date.now() - symbolTimestampsRef.current[selectedSymbol];
    const timeRemaining = 30 * 1000 - timeElapsed;
    
    if (timeRemaining > 0) {
      // Set a timer to check for new symbols after the 30-second period
      const timer = setTimeout(() => {
        // Check if there are NEWLY SUBSCRIBED symbols (not existing ones)
        const allSymbols = getAllAvailableSymbols();
        const symbolsAtSelection = symbolsAtSelectionRef.current[selectedSymbol] || new Set();
        
        // Find symbols that exist now but didn't exist when current symbol was selected
        const newlySubscribedSymbols = allSymbols.filter(symbol => 
          !symbolsAtSelection.has(symbol) && // Wasn't available when current symbol was selected
          symbolTimestampsRef.current[symbol] && // Has a timestamp (was subscribed at some point)
          symbolTimestampsRef.current[symbol] > symbolTimestampsRef.current[selectedSymbol] // Was subscribed after current symbol
        );
        
        if (newlySubscribedSymbols.length > 0) {
          // ❌ DISABLED: Auto-selection after 30 seconds - manual selection only
          console.log('🔍 ⏰ 30 seconds elapsed. New symbols available but auto-selection DISABLED. Click to select manually:', newlySubscribedSymbols);
        } else {
          console.log('🔍 ⏰ 30 seconds elapsed but no newly subscribed symbols found. Staying with current symbol:', selectedSymbol);
        }
      }, timeRemaining);
      
      return () => clearTimeout(timer);
    }
  }, [selectedSymbol, getAllAvailableSymbols]);
  
  // Effect to analyze all subscribed stocks for trading opportunities
  useEffect(() => {
    if (tickData && Object.keys(tickData).length > 0) {
      const opportunities = analyzeAllSubscribedStocks(tickData, getSubscribedStocks());
      
      if (opportunities.length > 0) {
        console.log('🚀 TRADING OPPORTUNITIES FOUND:', opportunities.map(opp => ({
          symbol: opp.symbol,
          canTrade: opp.analysis.canTrade,
          conditions: opp.analysis.conditions
        })));

        // Automatically open charts for trading opportunities
        opportunities.forEach(opportunity => {
          const { symbol, analysis } = opportunity;
          
          if (analysis.canTrade && !autoOpenedChartsRef.current.has(symbol)) {
            console.log(`🚨 NEW TRADING OPPORTUNITY DETECTED: ${symbol}`);
            console.log(`ℹ️ Trading opportunity detected but NOT auto-opening chart for: ${symbol}`);
            
            // Check for manual selection protection
            const currentTime = Date.now();
            const isManualSelectionActive = manualSelectionRef.current && 
              (currentTime - manualSelectionRef.current.timestamp) < MANUAL_SELECTION_LOCK_TIME;
            
            // ❌ DISABLED: Auto-selection for trading opportunities - manual selection only
            console.log('🚨 NEW TRADING OPPORTUNITY DETECTED but auto-selection DISABLED:', symbol, '- Click to select manually');
            
            // Mark as detected to prevent duplicates
            autoOpenedChartsRef.current.add(symbol);
            
            // ❌ REMOVED: Auto-chart opening for trading opportunities
            // Charts should only open when orders are placed or symbols are manually clicked
            console.log('ℹ️ Trading opportunity detected but NOT auto-opening chart for:', symbol);
            
            // Clear the auto-opened flag after 2 minutes to allow re-opening if conditions re-emerge
            setTimeout(() => {
              autoOpenedChartsRef.current.delete(symbol);
              console.log(`♻️ Chart auto-open cooldown expired for: ${symbol}`);
            }, 2 * 60 * 1000); // 2 minutes cooldown
          } else if (analysis.canTrade && autoOpenedChartsRef.current.has(symbol)) {
            console.log(`⏳ Trading opportunity still active for ${symbol} (chart already opened)`);
          }
        });
      }
    }
  }, [tickData, getAllAvailableSymbols, getSubscribedStocks, getKiteChartUrl]); // Re-analyze when tick data updates
  
  // Effect to update current time every second for countdown display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // Subscriptions are managed only by backend scan reconciliation.
  // This component is display-only for subscription status.
  
  // Helper function to extract symbol name from exchange:symbol format
  const extractSymbolName = (fullSymbol) => {
    if (typeof fullSymbol === 'string' && fullSymbol.includes(':')) {
      return fullSymbol.split(':')[1];
    }
    return fullSymbol;
  };

  // Auto-select RELIANCE when it becomes available for order book display
  useEffect(() => {
    if (!selectedSymbol && tickData) {
      const availableSymbols = Object.keys(tickData);
      const relianceSymbol = availableSymbols.find(symbol => 
        symbol.toUpperCase().includes('RELIANCE') || 
        symbol === 'RELIANCE'
      );
      
      if (relianceSymbol) {
        console.log('🎯 Auto-selecting RELIANCE for order book display:', relianceSymbol);
        setSelectedSymbol(`NSE:${relianceSymbol}`);
      }
    }
  }, [tickData, selectedSymbol]);

  // Get stock data for the currently selected symbol
  const getAvailableStockData = () => {
    if (!tickData || !selectedSymbol) {
      return { data: null, symbol: null, hasSymbol: false, isWaitingForData: false };
    }
    
    // Extract symbol name without exchange prefix for tickData lookup
    const symbolKey = extractSymbolName(selectedSymbol);
    console.log('🔍 Looking up symbol:', selectedSymbol, '→ key:', symbolKey);
    
    const history = tickData[symbolKey];
    const hasSymbol = tickData.hasOwnProperty(symbolKey);
    const isWaitingForData = hasSymbol && (!history || history.length === 0);
    
    if (history && history.length > 0) {
      // Get the latest tick (last item in the array)
      const latestTick = history[history.length - 1];
      console.log('🔍 Latest tick for', selectedSymbol, ':', latestTick);
      console.log('🔍 ✅ Using selected stock:', selectedSymbol, 'with data:', latestTick);
      return { data: latestTick, symbol: selectedSymbol, hasSymbol: true, isWaitingForData: false };
    }
    
    if (isWaitingForData) {
      console.log('🔍 ⏳ Symbol subscribed but waiting for data:', selectedSymbol);
      return { data: null, symbol: selectedSymbol, hasSymbol: true, isWaitingForData: true };
    }
    
    console.log('🔍 ❌ No data for selected stock:', selectedSymbol, 'key tried:', symbolKey);
    return { data: null, symbol: null, hasSymbol: false, isWaitingForData: false };
  };

  const { data: stockData, symbol: currentSymbol, hasSymbol, isWaitingForData } = getAvailableStockData();

  // Calculate remaining display time for current symbol
  const getTimeRemaining = () => {
    if (!selectedSymbol || !symbolTimestampsRef.current[selectedSymbol]) return null;
    
    const timeElapsed = currentTime - symbolTimestampsRef.current[selectedSymbol];
    const timeRemaining = 30 * 1000 - timeElapsed; // 30 seconds in milliseconds
    
    return timeRemaining > 0 ? Math.ceil(timeRemaining / 1000) : 0; // Return seconds
  };

  const formatPrice = (price) => {
    return price ? `₹${parseFloat(price).toFixed(2)}` : 'N/A';
  };

  const formatQuantity = (qty) => {
    if (!qty) return '0';
    if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
    if (qty >= 1000) return `${(qty / 1000).toFixed(0)}K`;
    return qty.toString();
  };

  // get-margins is now supplied by App scanner flow only.

  // Calculate quantity based on funds (using leveraged funds for max possible quantity)
  const calculateQuantityFromFunds = (price) => {
    if (!price || !fundsData?.leverageFunds || fundsData.leverageFunds <= 0) {
      return 0;
    }
    
    const investment = fundsData.leverageFunds; // Use full leveraged funds (5x)
    const quantity = Math.floor(investment / price);
    
    console.log(`📊 Funds-based calc for price ${price}: leveraged_investment=${investment}, quantity=${quantity}`);
    return quantity;
  };

  // Helper function to calculate level consumption and slippage (real 5-level depth)
  const calculateLevelConsumption = (calcQty, depthLevels, side) => {
    if (!calcQty || !depthLevels || depthLevels.length === 0) {
      return { levels: '-', slippage: 'N/A', fitsIn5: false };
    }

    let remainingQty = calcQty;
    let levelsConsumed = 0;
    let totalCost = 0;
    let totalQtyFilled = 0;

    // Process only the available levels (max 5 from KiteTicker)
    for (let i = 0; i < Math.min(depthLevels.length, 5); i++) {
      const level = depthLevels[i];
      if (!level || !level.price || !level.quantity) continue;

      levelsConsumed++;
      const qtyAtLevel = Math.min(remainingQty, level.quantity);
      totalCost += qtyAtLevel * level.price;
      totalQtyFilled += qtyAtLevel;
      remainingQty -= qtyAtLevel;

      if (remainingQty <= 0) break;
    }

    const fitsIn5 = remainingQty <= 0;
    const avgExecutionPrice = totalQtyFilled > 0 ? totalCost / totalQtyFilled : 0;
    
    // Calculate slippage vs first level price
    const firstLevelPrice = depthLevels[0]?.price || 0;
    let slippage = 'N/A';
    
    if (fitsIn5 && firstLevelPrice > 0 && avgExecutionPrice > 0) {
      const slippagePercent = Math.abs((avgExecutionPrice - firstLevelPrice) / firstLevelPrice * 100);
      slippage = `${slippagePercent.toFixed(3)}%`;
    } else if (!fitsIn5) {
      slippage = 'High Slippage';
    }

    return {
      levels: fitsIn5 ? `${levelsConsumed} lvls` : '>5 lvls',
      slippage: slippage,
      fitsIn5: fitsIn5
    };
  };

  // Calculate order book analytics for first 5, 10, and 20 levels
  const calculateOrderBookAnalytics = () => {
    if (!stockData || !stockData.depth) {
      return {
        l5: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 },
        l10: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 },
        l20: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 }
      };
    }

    const { buy = [], sell = [] } = stockData.depth;
    
    // Calculate for L1-5
    const bidQtySum5 = buy.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum5 = sell.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty5 = bidQtySum5 + askQtySum5;
    const imbalance5 = totalQty5 > 0 ? ((bidQtySum5 - askQtySum5) / totalQty5 * 100) : 0;
    
    // Calculate for L1-10
    const bidQtySum10 = buy.slice(0, 10).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum10 = sell.slice(0, 10).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty10 = bidQtySum10 + askQtySum10;
    const imbalance10 = totalQty10 > 0 ? ((bidQtySum10 - askQtySum10) / totalQty10 * 100) : 0;
    
    // Calculate for L1-20
    const bidQtySum20 = buy.slice(0, 20).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum20 = sell.slice(0, 20).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty20 = bidQtySum20 + askQtySum20;
    const imbalance20 = totalQty20 > 0 ? ((bidQtySum20 - askQtySum20) / totalQty20 * 100) : 0;
    
    // Calculate average spread percentage for L1-5
    let spreadSum5 = 0;
    let validLevels5 = 0;
    for (let i = 0; i < Math.min(5, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum5 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels5++;
      }
    }
    const spreadPercent5 = validLevels5 > 0 ? spreadSum5 / validLevels5 : 0;
    
    // Calculate average spread percentage for L1-10
    let spreadSum10 = 0;
    let validLevels10 = 0;
    for (let i = 0; i < Math.min(10, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum10 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels10++;
      }
    }
    const spreadPercent10 = validLevels10 > 0 ? spreadSum10 / validLevels10 : 0;
    
    // Calculate average spread percentage for L1-20
    let spreadSum20 = 0;
    let validLevels20 = 0;
    for (let i = 0; i < Math.min(20, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum20 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels20++;
      }
    }
    const spreadPercent20 = validLevels20 > 0 ? spreadSum20 / validLevels20 : 0;
    
    // Get best bid and ask prices
    const bestBid = buy[0]?.price || 0;
    const bestAsk = sell[0]?.price || 0;
    
    return {
      l5: {
        bidQtySum: bidQtySum5,
        askQtySum: askQtySum5,
        imbalance: imbalance5,
        spreadPercent: spreadPercent5,
        bestBid: bestBid,
        bestAsk: bestAsk
      },
      l10: {
        bidQtySum: bidQtySum10,
        askQtySum: askQtySum10,
        imbalance: imbalance10,
        spreadPercent: spreadPercent10,
        bestBid: bestBid,
        bestAsk: bestAsk
      },
      l20: {
        bidQtySum: bidQtySum20,
        askQtySum: askQtySum20,
        imbalance: imbalance20,
        spreadPercent: spreadPercent20,
        bestBid: bestBid,
        bestAsk: bestAsk
      }
    };
  };



  return (
    <TrackerContainer>
      {/* Market Scanner Section */}
      <div style={{
        background: '#ffffff',
        borderRadius: '8px', 
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e5e7eb'
      }}>
        {/* Header */}
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#1f2937',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          � Subscribed Securities ({getSubscribedStocks().length})
          <span style={{ 
            color: '#00ff88', 
            fontSize: '20px',
            background: 'linear-gradient(45deg, rgba(0, 255, 136, 0.3), rgba(0, 255, 255, 0.2))',
            padding: '16px 32px',
            borderRadius: '20px',
            fontWeight: '700',
            letterSpacing: '0.8px',
            border: '2px solid rgba(0, 255, 136, 0.8)',
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.2)',
            fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", sans-serif',
            textTransform: 'uppercase'
          }}>
            🤖 Scanner
          </span>
          
          {/* Buy/Sell Scan Buttons - Show whenever RELIANCE is subscribed */}
          {(() => {
            const subscribedSymbols = getSubscribedStocks();
            const hasReliance = subscribedSymbols.some(symbol => 
              symbol.toLowerCase().includes('reliance') || 
              symbol === 'NSE:RELIANCE' || 
              symbol === 'RELIANCE'
            );
            return hasReliance;
          })() && (
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button
                onClick={handleBuyScan}
                disabled={relianceScanType === 'BUY_SCAN'}
                style={{
                  background: relianceScanType === 'BUY_SCAN' 
                    ? 'linear-gradient(135deg, #16a34a, #15803d)' 
                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: relianceScanType === 'BUY_SCAN' ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: relianceScanType === 'BUY_SCAN' 
                    ? '0 2px 4px rgba(22, 163, 74, 0.4)' 
                    : '0 2px 4px rgba(34, 197, 94, 0.2)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  opacity: relianceScanType === 'BUY_SCAN' ? '0.8' : '1'
                }}
                title={relianceScanType === 'BUY_SCAN' ? 'RELIANCE is set as Buy Scan symbol' : 'Set RELIANCE as Buy Scan symbol - Orders only execute if ALL 14 buy conditions are met'}
              >
                {relianceScanType === 'BUY_SCAN' ? '✓ Buy Active' : '📈 Buy Scan'}
              </button>
              
              <button
                onClick={handleSellScan}
                disabled={relianceScanType === 'SELL_SCAN'}
                style={{
                  background: relianceScanType === 'SELL_SCAN' 
                    ? 'linear-gradient(135deg, #dc2626, #b91c1c)' 
                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: relianceScanType === 'SELL_SCAN' ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: relianceScanType === 'SELL_SCAN' 
                    ? '0 2px 4px rgba(220, 38, 38, 0.4)' 
                    : '0 2px 4px rgba(239, 68, 68, 0.2)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  opacity: relianceScanType === 'SELL_SCAN' ? '0.8' : '1'
                }}
                title={relianceScanType === 'SELL_SCAN' ? 'RELIANCE is set as Sell Scan symbol' : 'Set RELIANCE as Sell Scan symbol - Orders only execute if ALL 14 sell conditions are met'}
              >
                {relianceScanType === 'SELL_SCAN' ? '✓ Sell Active' : '📉 Sell Scan'}
              </button>
              
              {/* RELIANCE Mode Indicator - Show whenever RELIANCE is subscribed */}
              <span style={{ 
                color: '#fbbf24', 
                fontSize: '12px',
                background: 'rgba(251, 191, 36, 0.1)',
                padding: '4px 8px',
                borderRadius: '12px',
                fontWeight: '600',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                display: 'flex',
                alignItems: 'center'
              }}>
                🏛️ RELIANCE ({relianceScanType})
              </span>
            </div>
          )}
        </div>

        {/* Scanner Status */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(30, 60, 114, 0.1), rgba(42, 82, 152, 0.05))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          marginBottom: '8px',
          fontSize: '12px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{ textAlign: 'center', color: '#10b981' }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{subscribedCount || 0}</div>
            <div style={{ opacity: '0.8' }}>Subscribed</div>
          </div>
          <div style={{ textAlign: 'center', color: '#3b82f6' }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{buySignalsCount || 0}</div>
            <div style={{ opacity: '0.8' }}>Buy Intersections</div>
          </div>
          <div style={{ textAlign: 'center', color: '#ef4444' }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{sellSignalsCount || 0}</div>
            <div style={{ opacity: '0.8' }}>Sell Intersections</div>
          </div>
          <div style={{ textAlign: 'center', color: '#f59e0b' }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{pollCountdown || 0}s</div>
            <div style={{ opacity: '0.8' }}>Next Poll</div>
          </div>
          <div style={{ textAlign: 'center', color: '#8b5cf6' }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>🔄</div>
            <div style={{ opacity: '0.8' }}>Auto-Sub/Unsub</div>
          </div>
        </div>
        
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: window.innerWidth <= 768 ? '85px 40px 55px 55px 55px 60px 65px 70px 80px 80px 75px 160px' : '130px 60px 85px 90px 90px 85px 100px 100px 130px 130px 120px 260px',
          gap: '8px',
          padding: '8px 12px',
          fontSize: '11px',
          fontWeight: '500',
          color: '#374151',
          background: '#f9fafb',
          borderRadius: '4px',
          marginBottom: '4px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: '0.025em',
          textTransform: 'uppercase',
          border: '1px solid #e5e7eb',
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>SYMBOL</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>TYPE</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>LTP</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>BID QTY</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>ASK QTY</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>RSI(1m)</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>IMPACT LVLS</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>SLIPPAGE</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>LAST UPDATE</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>LEVERAGED FUNDS</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>CALCULATED QTY</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: window.innerWidth <= 480 ? '9px' : '11px' }}>5L DEPTH CHECK</div>
        </div>
      
        {/* Table Data */}
        {(() => {
          const subscribedStocks = getSubscribedStocks();
          const IMPACT_MAX_LEVELS = 3;
          const IMPACT_MAX_SLIPPAGE = 0.08;
          const effectiveSignalStocks = emaCheckSignalStocks || signalStocks;

          const normalizeSymbolKey = (value) => String(extractSymbolName(value || '') || '').toUpperCase();
          const buySignalBySymbol = new Map(
            (effectiveSignalStocks?.buySignals || []).map((row) => [
              normalizeSymbolKey(row?.symbol || row?.s),
              row
            ])
          );
          const sellSignalBySymbol = new Map(
            (effectiveSignalStocks?.sellSignals || []).map((row) => [
              normalizeSymbolKey(row?.symbol || row?.s),
              row
            ])
          );

          const passedRows = subscribedStocks
            .map((symbol) => {
              const symbolKey = extractSymbolName(symbol);
              const symbolData = tickData?.[symbolKey];
              const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
              if (!latestTick) return null;

              const scanType = latestTick?.scan_type;
              const side = scanType === 'BUY_SCAN' ? 'buy' : (scanType === 'SELL_SCAN' ? 'sell' : null);
              if (!side) return null;

              const normalizedSymbolKey = normalizeSymbolKey(symbol);

              const signalRow = side === 'buy'
                ? buySignalBySymbol.get(normalizedSymbolKey)
                : sellSignalBySymbol.get(normalizedSymbolKey);
              if (!signalRow) return null;

              const ema3_1 = Number(signalRow?.ema3_1 || signalRow?.ema3_1m || 0);
              const ema5_1 = Number(signalRow?.ema5_1 || signalRow?.ema5_1m || 0);
              const emaPass = side === 'buy' ? (ema3_1 > ema5_1) : (ema3_1 < ema5_1);
              if (!emaPass) return null;

              const rsi1 = Number(signalRow?.rsi1 || signalRow?.rsi_1m || 0);

              const impact = latestTick?.marketImpact?.[side] || {};
              const levels = Number(impact.levels);
              const slippage = Number(impact.slippage);
              const depth = latestTick?.depth || latestTick?.rawTick?.depth || {};
              const bidQty = Number((depth?.buy || []).reduce((sum, level) => sum + Number(level?.quantity || 0), 0));
              const askQty = Number((depth?.sell || []).reduce((sum, level) => sum + Number(level?.quantity || 0), 0));
              const bidQty5 = Number((depth?.buy || []).slice(0, 5).reduce((sum, level) => sum + Number(level?.quantity || 0), 0));
              const askQty5 = Number((depth?.sell || []).slice(0, 5).reduce((sum, level) => sum + Number(level?.quantity || 0), 0));

              const impactPass = Number.isFinite(levels) && Number.isFinite(slippage) && levels <= IMPACT_MAX_LEVELS && Math.abs(slippage) <= IMPACT_MAX_SLIPPAGE;
              if (!impactPass) return null;

              return {
                symbol,
                scanType,
                ltp: Number(latestTick?.last_price || 0),
                bidQty,
                askQty,
                bidQty5,
                askQty5,
                rsi1,
                levels,
                slippage,
                timestamp: latestTick?.timestamp || null
              };
            })
            .filter(Boolean);

          console.log('🔍 LOW-PRICE+EMA(side: (ema3_1 vs ema5_5) OR (ema5_1 vs ema5_5))+IMPACT PASSED rows:', passedRows.length, {
            buySignalRows: buySignalBySymbol.size,
            sellSignalRows: sellSignalBySymbol.size
          });
          
          // Only show real subscribed stocks, no test data
          if (passedRows.length === 0) {
            return (
              <div style={{
                textAlign: 'center',
                padding: '40px',
                color: '#ff6b6b',
                background: 'rgba(255, 107, 107, 0.1)',
                border: '1px solid rgba(255, 107, 107, 0.3)',
                borderRadius: '8px',
                fontSize: '16px',
                fontFamily: '"Segoe UI", "Roboto", "Inter", system-ui, -apple-system, sans-serif',
                lineHeight: '1.6'
              }}>
                📡 No stocks passed low-price + EMA check yet.<br/>
                BUY rule: EMA3(1m) crosses above EMA5(5m) OR EMA5(1m) crosses above EMA5(5m).<br/>
                SELL rule: EMA3(1m) crosses below EMA5(5m) OR EMA5(1m) crosses below EMA5(5m).<br/>
                Waiting for these cross conditions and impact thresholds to pass.
              </div>
            );
          }
          
          return (
            <div>
              {/* Market Scanner Table */}
              <div style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                padding: '12px',
                borderRadius: '6px'
              }}>
          <div style={{ 
            color: '#00ff88', 
            fontWeight: '600', 
            marginBottom: '16px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📊 LIVE Market Impact Data 
            <span style={{ 
              fontSize: '10px', 
              color: '#10b981',
              animation: 'pulse 1s ease-in-out infinite',
              fontWeight: '400'
            }}>
              • REAL-TIME
            </span>
          </div> 
                <div style={{
                  fontSize: '18px', 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  letterSpacing: '0.025em'
                }}>
                  Market Scanner [Low-Price + EMA Cross Check (1m vs 5m OR) + Impact Passed: {passedRows.length}]
                </div>
                
                {passedRows.map((row, index) => {
                  const symbol = row.symbol;
                  const scanType = row.scanType;
                  const rowLtp = Number(row.ltp || 0);
                  const rowCalcQty = rowLtp > 0 ? calculateQuantityFromFunds(rowLtp) : 0;
                  const bidHasDouble = rowCalcQty > 0 && row.bidQty5 >= (2 * rowCalcQty);
                  const askHasDouble = rowCalcQty > 0 && row.askQty5 >= (2 * rowCalcQty);
                  const SELL_IMBALANCE_MIN = 1.2;
                  const SELL_IMBALANCE_MAX = 4;
                  const BUY_IMBALANCE_MIN = 1.2;
                  const BUY_IMBALANCE_MAX = 4;

                  const sellImbalanceRatio = row.bidQty5 > 0 ? (row.askQty5 / row.bidQty5) : 0;
                  const buyImbalanceRatio = row.askQty5 > 0 ? (row.bidQty5 / row.askQty5) : 0;

                  const sellRatioOk = sellImbalanceRatio >= SELL_IMBALANCE_MIN && sellImbalanceRatio <= SELL_IMBALANCE_MAX;
                  const buyRatioOk = buyImbalanceRatio >= BUY_IMBALANCE_MIN && buyImbalanceRatio <= BUY_IMBALANCE_MAX;

                  const sellSupportPass = bidHasDouble && askHasDouble && sellRatioOk;
                  const buySupportPass = askHasDouble && bidHasDouble && buyRatioOk;
                  
                  return (
                    <div
                      key={`unique-row-${symbol}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: window.innerWidth <= 768 ? '85px 40px 55px 55px 55px 60px 65px 70px 80px 80px 75px 160px' : '130px 60px 85px 90px 90px 85px 100px 100px 130px 130px 120px 260px',
                        gap: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        fontWeight: '400',
                        letterSpacing: '0.025em',
                        background: symbol === selectedSymbol ? 'rgba(0, 0, 0, 0.05)' : '#ffffff',
                        color: symbol === selectedSymbol ? '#1f2937' : '#1f2937',
                        borderRadius: '4px',
                        marginBottom: '1px',
                        border: '1px solid ' + (symbol === selectedSymbol ? '#9ca3af' : '#e5e7eb'),
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden'
                      }}
                      title={`Click to open ${symbol.replace('NSE:', '')} chart in Kite`}
                      onMouseEnter={(e) => {
                        e.target.style.background = symbol === selectedSymbol ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                        e.target.style.borderColor = '#3b82f6';
                        e.target.style.transform = 'translateY(-1px)';
                        e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = symbol === selectedSymbol ? 'rgba(0, 0, 0, 0.05)' : '#ffffff';
                        e.target.style.borderColor = symbol === selectedSymbol ? '#9ca3af' : '#e5e7eb';
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = 'none';
                      }}
                      onClick={() => {
                        // � SHOW ORDER BOOK: Click anywhere on row to show order book
                        // Track manual selection to prevent auto-override
                        const currentTime = Date.now();
                        manualSelectionRef.current = {
                          symbol: symbol,
                          timestamp: currentTime
                        };
                        
                        console.log('🔍 👆 MANUAL ROW SELECTION:', symbol, '- Protected until:', new Date(currentTime + MANUAL_SELECTION_LOCK_TIME).toLocaleTimeString());
                        console.log('🔒 ROW MANUAL PROTECTION ACTIVE: Will block auto-selection for next', MANUAL_SELECTION_LOCK_TIME/1000, 'seconds');
                        setSelectedSymbol(symbol);
                      }}
                    >
                      {/* Symbol */}
                      <div style={{ 
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '10px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                      title={`Click to show ${symbol.replace('NSE:', '')} order book and open chart`}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering row click
                        
                        // Track manual selection to prevent auto-override
                        const currentTime = Date.now();
                        manualSelectionRef.current = {
                          symbol: symbol,
                          timestamp: currentTime
                        };
                        
                        console.log('🔍 👆 MANUAL SELECTION:', symbol, '- Protected until:', new Date(currentTime + MANUAL_SELECTION_LOCK_TIME).toLocaleTimeString());
                        console.log('🔒 MANUAL PROTECTION ACTIVE: Will block auto-selection for next', MANUAL_SELECTION_LOCK_TIME/1000, 'seconds');
                        
                        setSelectedSymbol(symbol);
                        
                        //  OPEN NAMED CHART: Call onOpenChart if provided
                        if (onOpenChart) {
                          onOpenChart(symbol);
                        }
                        
                        console.log('🔍 👆 MANUAL SELECTION:', symbol, '- Protected for', MANUAL_SELECTION_LOCK_TIME/1000, 'seconds');
                      }}
                      >
                        {symbol.replace('NSE:', '').substring(0, window.innerWidth <= 480 ? 6 : 10)}
                        {symbol === selectedSymbol && <span style={{ marginLeft: '2px' }}>●</span>}
                        <span style={{ 
                          fontSize: '10px', 
                          opacity: 0.6,
                          marginLeft: 'auto'
                        }}>📊</span>
                      </div>
                      
                      {/* Type */}
                      <div style={{ 
                        color: scanType === 'BUY_SCAN' ? '#059669' : 
                               scanType === 'SELL_SCAN' ? '#dc2626' : 
                               scanType === 'PENDING' ? '#6b7280' : '#d97706',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '9px' : '11px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {scanType === 'BUY_SCAN' ? 'BUY' : 
                         scanType === 'SELL_SCAN' ? 'SELL' : 
                         scanType === 'PENDING' ? 'PENDING' :
                         'UNKNOWN'}
                      </div>
                      
                      {/* LTP */}
                      <div style={{ 
                        color: '#1f2937',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '10px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {row.ltp ? (window.innerWidth <= 480 ? row.ltp.toFixed(0) : `₹${row.ltp.toFixed(2)}`) : '-'}
                      </div>

                      {/* BID QTY */}
                      <div style={{ 
                        color: '#059669',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {row.bidQty > 0 ? formatQuantity(row.bidQty) : '-'}
                      </div>

                      {/* ASK QTY */}
                      <div style={{ 
                        color: '#dc2626',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {row.askQty > 0 ? formatQuantity(row.askQty) : '-'}
                      </div>

                      {/* RSI(1m) */}
                      <div style={{
                        color: '#7c3aed',
                        fontWeight: '600',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {Number.isFinite(row.rsi1) && row.rsi1 > 0 ? row.rsi1.toFixed(2) : '-'}
                      </div>
                      
                      {/* IMPACT LEVELS */}
                      <div style={{ 
                        color: '#0ea5e9',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {Number.isFinite(row.levels) ? row.levels : '-'}
                      </div>
                      
                      {/* SLIPPAGE */}
                      <div style={{ 
                        color: '#16a34a',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {Number.isFinite(row.slippage) ? `${Math.abs(row.slippage).toFixed(3)}%` : '-'}
                      </div>
                      
                      {/* LAST UPDATE */}
                      <div style={{ 
                        color: '#6b7280',
                        fontWeight: '500',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : '-'}
                      </div>

                      {/* LEVERAGED FUNDS */}
                      <div style={{
                        color: '#8b5cf6',
                        fontWeight: '600',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {window.innerWidth <= 480
                          ? `₹${(fundsData.leverageFunds / 1000).toFixed(0)}K`
                          : `₹${Number(fundsData.leverageFunds || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                      </div>

                      {/* CALCULATED QTY */}
                      <div style={{
                        color: '#0f766e',
                        fontWeight: '600',
                        fontSize: window.innerWidth <= 480 ? '9px' : '12px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {rowCalcQty > 0
                          ? (window.innerWidth <= 480 ? formatQuantity(rowCalcQty).substring(0, 4) : formatQuantity(rowCalcQty))
                          : '-'}
                      </div>

                      {/* 5L DEPTH CHECK (single column with 3 values) */}
                      <div style={{
                        color: '#334155',
                        fontWeight: '600',
                        fontSize: window.innerWidth <= 480 ? '8px' : '11px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: '1.25'
                      }}>
                        {scanType === 'BUY_SCAN' ? (
                          <div style={{ color: buySupportPass ? '#059669' : '#dc2626' }}>
                            <div style={{ fontWeight: '700' }}>BUY {buySupportPass ? 'PASS' : 'FAIL'}</div>
                            <div>CQ: {rowCalcQty > 0 ? formatQuantity(rowCalcQty) : '-'}</div>
                            <div>Bid 5L: {formatQuantity(row.bidQty5)} | 2x: {bidHasDouble ? 'YES' : 'NO'}</div>
                            <div>Ask 5L: {formatQuantity(row.askQty5)} | 2x: {askHasDouble ? 'YES' : 'NO'}</div>
                            <div>Ratio B/A: {buyImbalanceRatio.toFixed(2)} | Range [{BUY_IMBALANCE_MIN}-{BUY_IMBALANCE_MAX}] {buyRatioOk ? 'OK' : 'NO'}</div>
                          </div>
                        ) : scanType === 'SELL_SCAN' ? (
                          <div style={{ color: sellSupportPass ? '#059669' : '#dc2626' }}>
                            <div style={{ fontWeight: '700' }}>SELL {sellSupportPass ? 'PASS' : 'FAIL'}</div>
                            <div>CQ: {rowCalcQty > 0 ? formatQuantity(rowCalcQty) : '-'}</div>
                            <div>Bid 5L: {formatQuantity(row.bidQty5)} | 2x: {bidHasDouble ? 'YES' : 'NO'}</div>
                            <div>Ask 5L: {formatQuantity(row.askQty5)} | 2x: {askHasDouble ? 'YES' : 'NO'}</div>
                            <div>Ratio A/B: {sellImbalanceRatio.toFixed(2)} | Range [{SELL_IMBALANCE_MIN}-{SELL_IMBALANCE_MAX}] {sellRatioOk ? 'OK' : 'NO'}</div>
                          </div>
                        ) : (
                          <div style={{ color: '#6b7280' }}>-</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        
        {/* Summary Footer */}
        {(() => {
          const subscribedStocks = getSubscribedStocks();
          const IMPACT_MAX_LEVELS = 3;
          const IMPACT_MAX_SLIPPAGE = 0.08;

          const passedRows = subscribedStocks
            .map((symbol) => {
              const symbolKey = extractSymbolName(symbol);
              const symbolData = tickData?.[symbolKey];
              const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
              if (!latestTick) return null;
              const scanType = latestTick?.scan_type;
              const side = scanType === 'BUY_SCAN' ? 'buy' : (scanType === 'SELL_SCAN' ? 'sell' : null);
              if (!side) return null;
              const impact = latestTick?.marketImpact?.[side] || {};
              const levels = Number(impact.levels);
              const slippage = Number(impact.slippage);
              const impactPass = Number.isFinite(levels) && Number.isFinite(slippage) && levels <= IMPACT_MAX_LEVELS && Math.abs(slippage) <= IMPACT_MAX_SLIPPAGE;
              if (!impactPass) return null;
              return { symbol, scanType };
            })
            .filter(Boolean);

          return (
            <div style={{
              marginTop: '15px',
              padding: '10px',
              background: 'rgba(255, 215, 0, 0.1)',
              borderRadius: '6px',
              borderTop: '1px solid rgba(255, 215, 0, 0.3)'
            }}>
              <div style={{ 
                fontSize: '12px', 
                color: '#ffd700', 
                fontWeight: '600',
                textAlign: 'center',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: '"Segoe UI", "Roboto", "Inter", system-ui, -apple-system, sans-serif',
                letterSpacing: '0.2px'
              }}>
                <div>
                  Passed: {passedRows.length} symbols
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <span style={{ color: '#00ff00' }}>
                    🟢 Buy: {passedRows.filter(row => row.scanType === 'BUY_SCAN').length}
                  </span>
                  <span style={{ color: '#ff6b6b' }}>
                    🔴 Sell: {passedRows.filter(row => row.scanType === 'SELL_SCAN').length}
                  </span>
                </div>
                <div>
                  {selectedSymbol ? ` Live: ${selectedSymbol.replace('NSE:', '')}` : ' No selection'} ⚡
                </div>
              </div>
            </div>
          );
        })()}
        
        {/* Real-Time Order Book Display */}
        {selectedSymbol && (() => {
          const symbolKey = extractSymbolName(selectedSymbol);
          const symbolData = tickData?.[symbolKey];
          const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
          const rawDepth = latestTick?.rawTick?.originalDepth || latestTick?.rawTick?.depth;
          
          // Define variables for Order Book section scope
          const hasTickData = !!latestTick;
          const displayTick = latestTick || {
            last_price: 0,
            depth: { buy: [], sell: [] },
            marketImpact: { buy: {}, sell: {} },
            scan_type: 'PENDING',
            timestamp: new Date().toISOString()
          };
          
          if (!rawDepth || !rawDepth.buy || !rawDepth.sell) {
            return null;
          }
          
          return (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.02), rgba(0, 0, 0, 0.05))',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#1f2937',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                📊 Real-Time Order Book - {selectedSymbol.replace('NSE:', '')}
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '4px',
                  color: '#059669'
                }}>
                  L{rawDepth.buy?.length || 0} LIVE
                </span>
                <span style={{
                  fontSize: '10px',
                  color: '#6b7280',
                  marginLeft: 'auto'
                }}>
                  {hasTickData && displayTick?.timestamp ? new Date(displayTick.timestamp).toLocaleTimeString() : (hasTickData ? 'No timestamp' : 'Waiting...')}
                </span>
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px'
              }}>
                {/* Bid Side */}
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#059669',
                    marginBottom: '6px',
                    padding: '4px 8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}>
                    📈 BID (Buy Orders)
                  </div>
                  {rawDepth.buy?.slice(0, 5).map((level, index) => (
                    <div key={index} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: index === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.02)',
                      borderRadius: '3px',
                      marginBottom: '1px',
                      border: index === 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #f3f4f6'
                    }}>
                      <div style={{ color: '#059669', fontWeight: index === 0 ? '600' : '500' }}>
                        ₹{level.price?.toFixed(2)}
                      </div>
                      <div style={{ color: '#374151', textAlign: 'center' }}>
                        {level.quantity?.toLocaleString()}
                      </div>
                      <div style={{ color: '#6b7280', textAlign: 'right', fontSize: '10px' }}>
                        {level.orders} ord
                      </div>
                    </div>
                  )) || <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '11px' }}>No bid data</div>}
                </div>
                
                {/* Ask Side */}
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#dc2626',
                    marginBottom: '6px',
                    padding: '4px 8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}>
                    📉 ASK (Sell Orders)
                  </div>
                  {rawDepth.sell?.slice(0, 5).map((level, index) => (
                    <div key={index} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      background: index === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.02)',
                      borderRadius: '3px',
                      marginBottom: '1px',
                      border: index === 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #f3f4f6'
                    }}>
                      <div style={{ color: '#dc2626', fontWeight: index === 0 ? '600' : '500' }}>
                        ₹{level.price?.toFixed(2)}
                      </div>
                      <div style={{ color: '#374151', textAlign: 'center' }}>
                        {level.quantity?.toLocaleString()}
                      </div>
                      <div style={{ color: '#6b7280', textAlign: 'right', fontSize: '10px' }}>
                        {level.orders} ord
                      </div>
                    </div>
                  )) || <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '11px' }}>No ask data</div>}
                </div>
              </div>
              
              {/* Order Book Summary */}
              <div style={{
                marginTop: '12px',
                padding: '8px',
                background: 'rgba(0, 0, 0, 0.02)',
                borderRadius: '4px',
                fontSize: '11px',
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '4px',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>CALC QTY</div>
                  <div style={{ color: '#374151', fontWeight: '600' }}>
                    {(() => {
                      // Debug: Log all latestTick data to see what we have
                      console.log('CALC QTY Debug - latestTick:', latestTick);
                      
                      // Calculate funds-based quantity first
                      const currentPrice = latestTick?.last_price || latestTick?.ltp || displayTick?.last_price || displayTick?.ltp || 0;
                      const fundsBasedQty = calculateQuantityFromFunds(currentPrice);
                      
                      // Try multiple sources for calculated quantity (prioritize funds-based calculation)
                      const calcQty = fundsBasedQty > 0 ? fundsBasedQty :
                                     latestTick?.calculated_quantity || 
                                     latestTick?.calculated_quantity_buy ||
                                     latestTick?.calculated_quantity_sell ||
                                     latestTick?.marketImpact?.buy?.quantity ||
                                     latestTick?.marketImpact?.sell?.quantity ||
                                     latestTick?.calculatedQuantity ||
                                     latestTick?.quantity ||
                                     latestTick?.target_quantity ||
                                     latestTick?.targetQuantity || 0;
                      
                      console.log('CALC QTY Debug - Found quantity:', calcQty, 'fundsBasedQty:', fundsBasedQty);
                      return calcQty > 0 ? calcQty.toLocaleString() : 'N/A';
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>BID QTY</div>
                  <div style={{ color: '#059669', fontWeight: '600' }}>
                    {rawDepth.buy?.reduce((sum, level) => sum + (level.quantity || 0), 0)?.toLocaleString() || '0'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>ASK QTY</div>
                  <div style={{ color: '#dc2626', fontWeight: '600' }}>
                    {rawDepth.sell?.reduce((sum, level) => sum + (level.quantity || 0), 0)?.toLocaleString() || '0'}
                  </div>
                </div>
                <div>
                  {(() => {
                    const scanType = latestTick?.scan_type || displayTick?.scan_type;
                    
                    // Calculate funds-based quantity first
                    const currentPrice = latestTick?.last_price || latestTick?.ltp || displayTick?.last_price || displayTick?.ltp || 0;
                    const fundsBasedQty = calculateQuantityFromFunds(currentPrice);
                    
                    const calcQuantity = fundsBasedQty > 0 ? fundsBasedQty :
                                        latestTick?.calculated_quantity_buy || 
                                        latestTick?.calculated_quantity_sell ||
                                        latestTick?.calculated_quantity || 
                                        latestTick?.marketImpact?.buy?.quantity ||
                                        latestTick?.marketImpact?.sell?.quantity ||
                                        latestTick?.calculatedQuantity ||
                                        latestTick?.quantity ||
                                        latestTick?.target_quantity ||
                                        latestTick?.targetQuantity || 0;
                    
                    if (scanType === 'BUY_SCAN' && calcQuantity > 0) {
                      // Calculate how many ASK levels needed to fill calculated quantity
                      let remainingQty = calcQuantity;
                      let levelsConsumed = 0;
                      let totalFilled = 0;
                      
                      for (const level of (rawDepth.sell || [])) {
                        if (remainingQty <= 0) break;
                        if (level && level.quantity > 0) {
                          levelsConsumed++;
                          const fillQty = Math.min(remainingQty, level.quantity);
                          totalFilled += fillQty;
                          remainingQty -= fillQty;
                        }
                      }
                      
                      const canFillCompletely = remainingQty <= 0;
                      
                      return (
                        <>
                          <div style={{ color: '#6b7280', fontSize: '9px' }}>ASK LEVELS</div>
                          <div style={{ color: canFillCompletely ? '#dc2626' : '#f59e0b', fontWeight: '600' }}>
                            {canFillCompletely ? `${levelsConsumed} lvls` : `>${levelsConsumed} lvls`}
                          </div>
                        </>
                      );
                    } else if (scanType === 'SELL_SCAN' && calcQuantity > 0) {
                      // Calculate how many BID levels needed to fill calculated quantity
                      let remainingQty = calcQuantity;
                      let levelsConsumed = 0;
                      let totalFilled = 0;
                      
                      for (const level of (rawDepth.buy || [])) {
                        if (remainingQty <= 0) break;
                        if (level && level.quantity > 0) {
                          levelsConsumed++;
                          const fillQty = Math.min(remainingQty, level.quantity);
                          totalFilled += fillQty;
                          remainingQty -= fillQty;
                        }
                      }
                      
                      const canFillCompletely = remainingQty <= 0;
                      
                      return (
                        <>
                          <div style={{ color: '#6b7280', fontSize: '9px' }}>BID LEVELS</div>
                          <div style={{ color: canFillCompletely ? '#059669' : '#f59e0b', fontWeight: '600' }}>
                            {canFillCompletely ? `${levelsConsumed} lvls` : `>${levelsConsumed} lvls`}
                          </div>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <div style={{ color: '#6b7280', fontSize: '9px' }}>SCAN TYPE</div>
                          <div style={{ color: '#6b7280', fontWeight: '600' }}>
                            {scanType || 'N/A'}
                          </div>
                        </>
                      );
                    }
                  })()}
                </div>
                <div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>BUY SLIP</div>
                  <div style={{ color: '#dc2626', fontWeight: '600' }}>
                    {(() => {
                      // Calculate funds-based quantity first
                      const currentPrice = latestTick?.last_price || latestTick?.ltp || displayTick?.last_price || displayTick?.ltp || 0;
                      const fundsBasedQty = calculateQuantityFromFunds(currentPrice);
                      
                      // Try multiple sources for calculated quantity (prioritize funds-based calculation)
                      const calcQuantity = fundsBasedQty > 0 ? fundsBasedQty :
                                          latestTick?.calculated_quantity_buy || // Specific buy quantity
                                          latestTick?.calculated_quantity || 
                                          latestTick?.marketImpact?.buy?.quantity ||
                                          latestTick?.calculatedQuantity ||
                                          latestTick?.quantity ||
                                          latestTick?.target_quantity ||
                                          latestTick?.targetQuantity || 0;
                      const bestAsk = rawDepth.sell?.[0]?.price || 0;
                      
                      console.log('BUY SLIP Debug:', { calcQuantity, bestAsk, sellDepth: rawDepth.sell });
                      
                      if (calcQuantity > 0 && Array.isArray(rawDepth.sell) && rawDepth.sell.length > 0 && bestAsk > 0) {
                        let remainingQty = calcQuantity;
                        let totalCost = 0;
                        let filledQty = 0;
                        
                        for (const level of rawDepth.sell) {
                          if (remainingQty <= 0) break;
                          const levelPrice = level.price || 0;
                          const levelQty = level.quantity || 0;
                          
                          if (levelPrice > 0 && levelQty > 0) {
                            const fillQty = Math.min(remainingQty, levelQty);
                            totalCost += fillQty * levelPrice;
                            filledQty += fillQty;
                            remainingQty -= fillQty;
                          }
                        }
                        
                        if (filledQty > 0 && totalCost > 0) {
                          const avgPrice = totalCost / filledQty;
                          const slippage = ((avgPrice - bestAsk) / bestAsk) * 100;
                          return `${slippage.toFixed(3)}%`;
                        }
                      }
                      return 'N/A';
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>SELL SLIP</div>
                  <div style={{ color: '#059669', fontWeight: '600' }}>
                    {(() => {
                      // Calculate funds-based quantity first
                      const currentPrice = latestTick?.last_price || latestTick?.ltp || displayTick?.last_price || displayTick?.ltp || 0;
                      const fundsBasedQty = calculateQuantityFromFunds(currentPrice);
                      
                      // Try multiple sources for calculated quantity (prioritize funds-based calculation)
                      const calcQuantity = fundsBasedQty > 0 ? fundsBasedQty :
                                          latestTick?.calculated_quantity_sell || // Specific sell quantity
                                          latestTick?.calculated_quantity || 
                                          latestTick?.marketImpact?.sell?.quantity ||
                                          latestTick?.calculatedQuantity ||
                                          latestTick?.quantity ||
                                          latestTick?.target_quantity ||
                                          latestTick?.targetQuantity || 0;
                      const bestBid = rawDepth.buy?.[0]?.price || 0;
                      
                      console.log('SELL SLIP Debug:', { calcQuantity, bestBid, buyDepth: rawDepth.buy });
                      
                      if (calcQuantity > 0 && Array.isArray(rawDepth.buy) && rawDepth.buy.length > 0 && bestBid > 0) {
                        let remainingQty = calcQuantity;
                        let totalValue = 0;
                        let filledQty = 0;
                        
                        for (const level of rawDepth.buy) {
                          if (remainingQty <= 0) break;
                          const levelPrice = level.price || 0;
                          const levelQty = level.quantity || 0;
                          
                          if (levelPrice > 0 && levelQty > 0) {
                            const fillQty = Math.min(remainingQty, levelQty);
                            totalValue += fillQty * levelPrice;
                            filledQty += fillQty;
                            remainingQty -= fillQty;
                          }
                        }
                        
                        if (filledQty > 0 && totalValue > 0) {
                          const avgPrice = totalValue / filledQty;
                          const slippage = ((bestBid - avgPrice) / bestBid) * 100;
                          return `${slippage.toFixed(3)}%`;
                        }
                      }
                      return 'N/A';
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>LTP</div>
                  <div style={{ color: '#374151', fontWeight: '600' }}>
                    {(() => {
                      const ltp = latestTick?.last_price || 
                                 latestTick?.ltp || 
                                 latestTick?.price || 
                                 latestTick?.lastPrice || 0;
                      console.log('LTP Debug:', { ltp, latestTick });
                      return ltp > 0 ? `₹${ltp.toFixed(2)}` : 'N/A';
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        
        {/* Empty state prompt removed as requested */}
      </div>
      
    </TrackerContainer>
  );
};

export default SubscribedStockTracker;
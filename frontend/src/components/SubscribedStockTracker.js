import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { checkAutoTradeConditions, analyzeAllSubscribedStocks } from '../utils/autoTradeCheck';

const STREAK_BUY_1MIN_CONDITION_STORAGE_KEY = 'streak_buy_1min_condition';
const STREAK_BUY_5MIN_CONDITION_STORAGE_KEY = 'streak_buy_5min_condition';
const STREAK_SELL_1MIN_CONDITION_STORAGE_KEY = 'streak_sell_1min_condition';
const STREAK_SELL_5MIN_CONDITION_STORAGE_KEY = 'streak_sell_5min_condition';
const DEFAULT_BUY_1MIN_CONDITION = 'RSI(14,0) higher than 65 and Plus DI(14,0) higher than 25 and ADX(14,0) higher than Minus DI(14,0) and EMA(close, 25, 0) higher than MBB(Close,20,2,simple,0) and MACD(12,26,9,macd,0) higher than MACD(12,26,9,signal,0) and ADX(14,0) higher than Minus DI(14,0)';
const DEFAULT_BUY_5MIN_CONDITION = 'MACD(12,26,9,macd,0) higher than MACD(12,26,9,signal,0) and Plus DI(14,0) higher than 25 and Plus DI(14,0) higher than ADX(14,0) and ADX(14,0) higher than Minus DI(14,0) and Minus DI(14,0) lower than 15 and RSI(14,0) higher than 60 and MACD(12,26,9,signal,0) higher than MACD(12,26,9,histogram,0)';
const DEFAULT_SELL_1MIN_CONDITION = 'RSI(14,0) lower than 35 and Minus DI(14,0) higher than 25 and ADX(14,0) higher than Plus DI(14,0) and ADX(14,0) higher than 25 and EMA(close, 25, 0) lower than MBB(Close,20,2,simple,0) and MACD(12,26,9,macd,0) lower than MACD(12,26,9,signal,0) and ( EMA(close, 3, 0) lower than equal to LBB(Close,20,2,simple,0) )';
const DEFAULT_SELL_5MIN_CONDITION = DEFAULT_SELL_1MIN_CONDITION;
const ENABLE_SUBSCRIBED_TRACKER_DEBUG = false;
const trackerDebugLog = (...args) => {
  if (ENABLE_SUBSCRIBED_TRACKER_DEBUG) {
    console.log(...args);
  }
};

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
  emaCheckSignalStocks = null,
  marginsData = null,
  technicalDetailRows = []
}) => {
  // State to track currently selected stock symbol
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // State to track real subscribed symbols from backend API
  const [realSubscribedSymbols, setRealSubscribedSymbols] = useState([]);
  
  // State to trigger re-renders for countdown timer
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // State to force re-render for live market impact data based on tick updates
  const [lastTickUpdate, setLastTickUpdate] = useState(0);
  
  // State to manage accordion sections (for Order Book only)
  const [expandedSections, setExpandedSections] = useState({
    orderBook: true // Order Book accordion starts expanded
  });
  
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
    if (!marginsData) return;
    setFundsData({
      availableFunds: Number(marginsData.availableFunds || 0),
      leverageFunds: Number(marginsData.leverageFunds || 0),
      usableFunds: Number(marginsData.usableFunds || 0),
      lastUpdated: new Date().toISOString()
    });
  }, [marginsData]);
  
  // Subscriptions are scan-driven only (backend reconciliation). No manual unsubscribe API calls here.

  const configureCondition = useCallback((storageKey, title, defaultCondition) => {
    try {
      const currentCondition = localStorage.getItem(storageKey) || defaultCondition;
      const nextCondition = window.prompt(`${title} condition:`, currentCondition);
      if (!nextCondition || !nextCondition.trim()) {
        alert(`${title} condition is required.`);
        return;
      }

      localStorage.setItem(storageKey, nextCondition.trim());
      alert(`${title} condition saved. Next scan will use it.`);
    } catch (error) {
      console.error(`❌ Error configuring ${title} condition:`, error);
      alert(`Error configuring ${title} condition`);
    }
  }, []);

  const handleConfigureBuy1Min = useCallback(() => {
    configureCondition(STREAK_BUY_1MIN_CONDITION_STORAGE_KEY, 'BUY 1min', DEFAULT_BUY_1MIN_CONDITION);
  }, [configureCondition]);

  const handleConfigureBuy5Min = useCallback(() => {
    configureCondition(STREAK_BUY_5MIN_CONDITION_STORAGE_KEY, 'BUY 5min', DEFAULT_BUY_5MIN_CONDITION);
  }, [configureCondition]);

  const handleConfigureSell1Min = useCallback(() => {
    configureCondition(STREAK_SELL_1MIN_CONDITION_STORAGE_KEY, 'SELL 1min', DEFAULT_SELL_1MIN_CONDITION);
  }, [configureCondition]);

  const handleConfigureSell5Min = useCallback(() => {
    configureCondition(STREAK_SELL_5MIN_CONDITION_STORAGE_KEY, 'SELL 5min', DEFAULT_SELL_5MIN_CONDITION);
  }, [configureCondition]);

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
      trackerDebugLog('🔍 No tickData available for symbol detection');
      return [];
    }
    
    // tickData contains all subscribed symbols as keys, even those without recent messages
    const allSymbols = Object.keys(tickData);
    trackerDebugLog('🔍 getAllAvailableSymbols result:', allSymbols);
    
    return allSymbols;
  }, [tickData]);

  // Get stocks that are actually currently subscribed to KiteTicker
  const getSubscribedStocks = useCallback(() => {
    trackerDebugLog('🔍 DEBUG - realSubscribedSymbols:', realSubscribedSymbols);
    trackerDebugLog('🔍 DEBUG - tickData keys:', tickData ? Object.keys(tickData) : 'no tickData');
    
    // Always prioritize real subscribed symbols from backend, regardless of tick data
    if (realSubscribedSymbols.length > 0) {
      trackerDebugLog('🔍 Using all real subscribed symbols from backend (including those without tick data):', realSubscribedSymbols);
      
      // ✅ DEDUPLICATE symbols to prevent table duplicates
      const uniqueSymbols = [...new Set(realSubscribedSymbols)];
      trackerDebugLog('🔍 Deduplication: original length', realSubscribedSymbols.length, '→ unique length', uniqueSymbols.length);
      
      // ✅ NO SORTING - Keep original subscription order, add new symbols to bottom
      trackerDebugLog('🔍 Stable order maintained - no sorting by activity');
      return uniqueSymbols; // Return in original order
    }
    
    // Fallback: Show all stocks from tickData in original order (no sorting)
    if (tickData) {
      const stocks = Object.keys(tickData);
      trackerDebugLog('🔍 Fallback: Stocks in original order (no activity sorting):', stocks);
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
      trackerDebugLog('📊 LIVE TICK UPDATE: Market impact updated at', new Date(newUpdate).toLocaleTimeString());
    }
  }, [tickData]);

  useEffect(() => {
    trackerDebugLog('🔍 📊 SYMBOL DETECTION EFFECT TRIGGERED');
    const subscribedStocks = getSubscribedStocks();
    const allAvailableSymbols = getAllAvailableSymbols();
    const newSymbolsSet = new Set(allAvailableSymbols);
    trackerDebugLog('🔍 Currently subscribed stocks:', subscribedStocks);
    trackerDebugLog('🔍 All available symbols:', allAvailableSymbols);
    
    // Check for newly subscribed symbols (including those without data yet)
    const newSymbols = allAvailableSymbols.filter(symbol => !previousSymbolsRef.current.has(symbol));
    
    trackerDebugLog('🔍 Symbol detection debug:');
    trackerDebugLog('  - Previous symbols:', Array.from(previousSymbolsRef.current));
    trackerDebugLog('  - Current available:', allAvailableSymbols);
    trackerDebugLog('  - Detected new symbols:', newSymbols);
    
    if (newSymbols.length > 0) {
      trackerDebugLog('🔍 ✨ NEW SYMBOLS DETECTED:', newSymbols);
      trackerDebugLog('🔍 Current selectedSymbol:', selectedSymbol);
      trackerDebugLog('🔍 Current symbolTimestampsRef:', symbolTimestampsRef.current);
      
      // Check for manual selection protection
      const currentTime = Date.now();
      const isManualSelectionActive = manualSelectionRef.current && 
        (currentTime - manualSelectionRef.current.timestamp) < MANUAL_SELECTION_LOCK_TIME;
      
      if (isManualSelectionActive) {
        trackerDebugLog('🔍 🔒 MANUAL SELECTION PROTECTED - Skipping auto-selection for:', manualSelectionRef.current.symbol, 'Time remaining:', Math.ceil((MANUAL_SELECTION_LOCK_TIME - (currentTime - manualSelectionRef.current.timestamp)) / 1000), 'seconds');
        // Update previous symbols to prevent this from running again
        previousSymbolsRef.current = newSymbolsSet;
        
        // Ensure manually selected symbol stays selected
        if (selectedSymbol !== manualSelectionRef.current.symbol) {
          trackerDebugLog('🔍 🔄 RESTORING MANUAL SELECTION:', manualSelectionRef.current.symbol);
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
        trackerDebugLog('🎯 Auto-selection DISABLED - Trade-ready symbols detected but not auto-selected. Click to select manually.');
      } else {
        // Current symbol is still in its 30-second display period
        const timeRemaining = 30 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        trackerDebugLog('🔍 ⏰ Current symbol still has', Math.ceil(timeRemaining / 1000), 'seconds remaining. New symbols will queue.');
      }
    }
    
    // ❌ DISABLED: Auto-fallback symbol selection - order book stays empty until manual click
    if (!selectedSymbol) {
      trackerDebugLog('🔍 ❌ No selected symbol - Order book will remain empty until manual selection');
    }
    
    // Update previous symbols set
    trackerDebugLog('🔍 Updating previousSymbolsRef from:', Array.from(previousSymbolsRef.current), 'to:', Array.from(newSymbolsSet));
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
      
      trackerDebugLog('🎯 CONTINUOUS CHECK: Monitoring trade-ready symbols...');
      
      // Check for manual selection protection
      const isManualSelectionActive = manualSelectionRef.current && 
        (currentTime - manualSelectionRef.current.timestamp) < MANUAL_SELECTION_LOCK_TIME;
      
      if (isManualSelectionActive) {
        trackerDebugLog('🎯 🔒 CONTINUOUS CHECK: Manual selection protected - Skipping auto-selection for:', manualSelectionRef.current.symbol, 'Time remaining:', Math.ceil((MANUAL_SELECTION_LOCK_TIME - (currentTime - manualSelectionRef.current.timestamp)) / 1000), 'seconds');
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
              trackerDebugLog('🎯 ✅ CONTINUOUS CHECK: TRADE-READY SYMBOL FOUND:', symbol);
              break;
            }
          }
        }
        
        // ❌ DISABLED: Auto-selection of trade-ready symbols - manual selection only
        if (tradeReadySymbol && tradeReadySymbol !== selectedSymbol) {
          trackerDebugLog('🎯 🔄 TRADE-READY SYMBOL DETECTED but auto-selection DISABLED:', tradeReadySymbol, '- Click to select manually');
        }
      } else if (selectedSymbol) {
        const timeRemaining = 30 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        trackerDebugLog('🎯 CONTINUOUS CHECK: Current symbol has', Math.ceil(timeRemaining / 1000), 'seconds remaining');
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
          
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              onClick={handleConfigureBuy1Min}
              style={{
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(34, 197, 94, 0.2)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
              title='Configure BUY 1min condition'
            >
              Configure BUY 1m
            </button>

            <button
              onClick={handleConfigureBuy5Min}
              style={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
              title='Configure BUY 5min condition'
            >
              Configure BUY 5m
            </button>

            <button
              onClick={handleConfigureSell1Min}
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
              title='Configure SELL 1min condition'
            >
              Configure SELL 1m
            </button>

            <button
              onClick={handleConfigureSell5Min}
              style={{
                background: 'linear-gradient(135deg, #b91c1c, #991b1b)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(153, 27, 27, 0.2)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
              title='Configure SELL 5min condition'
            >
              Configure SELL 5m
            </button>
          </div>
        </div>

        {/* Scanner Status */}
        {(() => {
          const effectiveSignalStocks = emaCheckSignalStocks || signalStocks;
          const buySignalCount = Array.isArray(effectiveSignalStocks?.buySignals)
            ? effectiveSignalStocks.buySignals.length
            : Number(buySignalsCount || 0);
          const sellSignalCount = Array.isArray(effectiveSignalStocks?.sellSignals)
            ? effectiveSignalStocks.sellSignals.length
            : Number(sellSignalsCount || 0);

          return (
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
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{buySignalCount || 0}</div>
            <div style={{ opacity: '0.8' }}>Buy Signals</div>
          </div>
          <div style={{ textAlign: 'center', color: '#ef4444' }}>
            <div style={{ fontWeight: '600', fontSize: '16px' }}>{sellSignalCount || 0}</div>
            <div style={{ opacity: '0.8' }}>Sell Signals</div>
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
          );
        })()}

        {/* Signal metrics removed: subscribed table is now orderbook-only (BUY/SELL). */}

        {/* Subscribed Stocks Order Book Analyzer (Buy/Sell Tables) */}
        {(() => {
          const subscribedStocks = getSubscribedStocks();
          const effectiveSignalStocks = emaCheckSignalStocks || signalStocks;
          const normalizeSymbol = (value) => String(extractSymbolName(value || '') || '').trim().toUpperCase();
          const buySymbolSet = new Set(
            (effectiveSignalStocks?.buySignals || []).map((row) =>
              normalizeSymbol(typeof row === 'string' ? row : (row?.symbol || row?.s))
            )
          );
          const sellSymbolSet = new Set(
            (effectiveSignalStocks?.sellSignals || []).map((row) =>
              normalizeSymbol(typeof row === 'string' ? row : (row?.symbol || row?.s))
            )
          );

          const tableRows = subscribedStocks
            .map((symbol) => {
              const symbolKey = extractSymbolName(symbol);
              const normalizedSymbol = normalizeSymbol(symbol);
              const symbolData = tickData?.[symbolKey];
              const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
              const inferredScanType = buySymbolSet.has(normalizedSymbol)
                ? 'BUY_SCAN'
                : (sellSymbolSet.has(normalizedSymbol) ? 'SELL_SCAN' : 'PENDING');

              if (!latestTick) {
                return {
                  symbol,
                  scanType: inferredScanType,
                  ltp: 0,
                  bestBid: 0,
                  bestAsk: 0,
                  spreadPct: 0,
                  bidQty5: 0,
                  askQty5: 0,
                  imbalancePct: 0,
                  calcQty: 0,
                  depthCheckPass: false,
                  ratio: 0,
                  ratioLabel: '-',
                  timestamp: null,
                  hasLiveTick: false
                };
              }

              const rawScanType = latestTick?.scan_type;
              const scanType = (rawScanType === 'BUY_SCAN' || rawScanType === 'SELL_SCAN')
                ? rawScanType
                : inferredScanType;
              const depth = latestTick?.depth || latestTick?.rawTick?.depth || {};
              const buyDepth = Array.isArray(depth?.buy) ? depth.buy : [];
              const sellDepth = Array.isArray(depth?.sell) ? depth.sell : [];

              const ltp = Number(latestTick?.last_price || 0);
              const bestBid = Number(buyDepth[0]?.price || 0);
              const bestAsk = Number(sellDepth[0]?.price || 0);
              const spreadPct = bestBid > 0 && bestAsk > 0
                ? ((bestAsk - bestBid) / bestBid) * 100
                : 0;

              const bidQty5 = Number(buyDepth.slice(0, 5).reduce((sum, level) => sum + Number(level?.quantity || 0), 0));
              const askQty5 = Number(sellDepth.slice(0, 5).reduce((sum, level) => sum + Number(level?.quantity || 0), 0));
              const total5 = bidQty5 + askQty5;
              const imbalancePct = total5 > 0 ? ((bidQty5 - askQty5) / total5) * 100 : 0;

              const calcQty = ltp > 0 ? calculateQuantityFromFunds(ltp) : 0;
              const bidHasDouble = calcQty > 0 && bidQty5 >= (2 * calcQty);
              const askHasDouble = calcQty > 0 && askQty5 >= (2 * calcQty);

              const BUY_IMBALANCE_MIN = 1.2;
              const BUY_IMBALANCE_MAX = 4;
              const SELL_IMBALANCE_MIN = 1.2;
              const SELL_IMBALANCE_MAX = 4;

              const buyRatio = askQty5 > 0 ? (bidQty5 / askQty5) : 0;
              const sellRatio = bidQty5 > 0 ? (askQty5 / bidQty5) : 0;
              const buyRatioOk = buyRatio >= BUY_IMBALANCE_MIN && buyRatio <= BUY_IMBALANCE_MAX;
              const sellRatioOk = sellRatio >= SELL_IMBALANCE_MIN && sellRatio <= SELL_IMBALANCE_MAX;

              const buyDepthCheckPass = askHasDouble && bidHasDouble && buyRatioOk;
              const sellDepthCheckPass = bidHasDouble && askHasDouble && sellRatioOk;

              const depthCheckPass = scanType === 'BUY_SCAN'
                ? buyDepthCheckPass
                : (scanType === 'SELL_SCAN' ? sellDepthCheckPass : false);

              const ratio = scanType === 'BUY_SCAN' ? buyRatio : sellRatio;
              const ratioLabel = scanType === 'BUY_SCAN' ? 'B/A' : 'A/B';

              return {
                symbol,
                scanType,
                ltp,
                bestBid,
                bestAsk,
                spreadPct,
                bidQty5,
                askQty5,
                imbalancePct,
                calcQty,
                depthCheckPass,
                ratio,
                ratioLabel,
                timestamp: latestTick?.timestamp || null,
                hasLiveTick: true
              };
            })
            .filter(Boolean);

          const buyRows = tableRows.filter((row) => row.scanType === 'BUY_SCAN');
          const sellRows = tableRows.filter((row) => row.scanType === 'SELL_SCAN');

          const renderOrderbookTable = (rows, label, labelColor, borderColor) => (
            <div style={{
              background: '#f9fafb',
              border: `1px solid ${borderColor}`,
              borderRadius: '6px',
              padding: '10px',
              marginBottom: '10px'
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: labelColor,
                marginBottom: '8px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                {label} ({rows.length})
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#1f2937' }}>Symbol / Chart</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>LTP</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Best Bid</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Best Ask</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Spread %</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Bid Qty (5L)</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Ask Qty (5L)</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Imbalance %</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Calc Qty</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Depth Check</th>
                      <th style={{ padding: '7px 6px', borderBottom: '1px solid #e5e7eb', textAlign: 'right', color: '#1f2937' }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={11} style={{ padding: '10px', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                          No subscribed {label.toLowerCase()} stocks with live order book data yet.
                        </td>
                      </tr>
                    ) : rows.map((row, idx) => {
                      const symbolName = extractSymbolName(row.symbol);
                      return (
                        <tr key={`${row.symbol}-${idx}`} style={{ background: row.symbol === selectedSymbol ? '#eef2ff' : '#ffffff' }}>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const currentTime = Date.now();
                                manualSelectionRef.current = { symbol: row.symbol, timestamp: currentTime };
                                setSelectedSymbol(row.symbol);
                                if (onOpenChart) {
                                  onOpenChart(row.symbol);
                                }
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#2563eb',
                                padding: 0,
                                cursor: 'pointer',
                                fontWeight: 700,
                                textDecoration: 'underline'
                              }}
                            >
                              {symbolName}
                            </button>
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>
                            {row.ltp > 0 ? `₹${row.ltp.toFixed(2)}` : '-'}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#065f46' }}>
                            {row.bestBid > 0 ? row.bestBid.toFixed(2) : '-'}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#991b1b' }}>
                            {row.bestAsk > 0 ? row.bestAsk.toFixed(2) : '-'}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>
                            {row.spreadPct > 0 ? `${row.spreadPct.toFixed(3)}%` : '-'}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#065f46' }}>
                            {formatQuantity(row.bidQty5)}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#991b1b' }}>
                            {formatQuantity(row.askQty5)}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>
                            {Number.isFinite(row.imbalancePct) ? `${row.imbalancePct.toFixed(2)}%` : '-'}
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>
                            {row.calcQty > 0 ? formatQuantity(row.calcQty) : '-'}
                          </td>
                          <td style={{
                            padding: '7px 6px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            color: row.depthCheckPass ? '#059669' : '#dc2626',
                            fontWeight: 700
                          }}>
                            {row.depthCheckPass ? 'PASS' : 'FAIL'} ({row.ratioLabel}: {row.ratio > 0 ? row.ratio.toFixed(2) : '0.00'})
                          </td>
                          <td style={{ padding: '7px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#64748b' }}>
                            {row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );

          if (tableRows.length === 0) {
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
                No subscribed stocks with tick data yet.<br/>
                Orderbook analyzer rows will appear once ticks arrive.
              </div>
            );
          }

          return (
            <div>
              {renderOrderbookTable(buyRows, 'BUY Order Book Analyzer', '#166534', '#bbf7d0')}
              {renderOrderbookTable(sellRows, 'SELL Order Book Analyzer', '#991b1b', '#fecaca')}
            </div>
          );
        })()}

        {/* Technical details table under subscribed analyzer */}
        {(() => {
          const FIXED_GAP_THRESHOLD_PCT = 0.04;

          const normalizeTechnicalRows = (rows) => (Array.isArray(rows) ? rows : []).map((row) => {
            const symbol = extractSymbolName(row?.symbol || row?.seg_sym || row?.s || '');
            const ltp = Number(row?.at || row?.ltp || row?.d?.[0] || 0);
            const ema3_1 = Number(row?.ema3_1 || row?.d?.[36] || 0);
            const ema3_5 = Number(row?.ema3_5 || row?.d?.[32] || 0);
            const ubb_1 = Number(row?.ubb_1 || row?.d?.[41] || 0);
            const lbb_1 = Number(row?.lbb_1 || row?.d?.[40] || 0);
            const ubb_5 = Number(row?.ubb_5 || row?.d?.[27] || 0);
            const lbb_5 = Number(row?.lbb_5 || row?.d?.[28] || 0);
            const fourTickPct = FIXED_GAP_THRESHOLD_PCT;

            const gap1mUbbPct = ubb_1 > 0 ? (Math.abs(ema3_1 - ubb_1) / ubb_1) * 100 : null;
            const gap1mLbbPct = lbb_1 > 0 ? (Math.abs(ema3_1 - lbb_1) / lbb_1) * 100 : null;
            const gap5mUbbPct = ubb_5 > 0 ? (Math.abs(ema3_5 - ubb_5) / ubb_5) * 100 : null;
            const gap5mLbbPct = lbb_5 > 0 ? (Math.abs(ema3_5 - lbb_5) / lbb_5) * 100 : null;

            const gap1mUbbPass = fourTickPct !== null && gap1mUbbPct !== null ? gap1mUbbPct <= fourTickPct : null;
            const gap1mLbbPass = fourTickPct !== null && gap1mLbbPct !== null ? gap1mLbbPct <= fourTickPct : null;
            const gap5mUbbPass = fourTickPct !== null && gap5mUbbPct !== null ? gap5mUbbPct <= fourTickPct : null;
            const gap5mLbbPass = fourTickPct !== null && gap5mLbbPct !== null ? gap5mLbbPct <= fourTickPct : null;
            const buyBandPass = ((ubb_1 > 0 && ltp < ubb_1) || (ema3_1 > 0 && ltp < ema3_1));
            const sellBandPass = ((lbb_1 > 0 && ltp > lbb_1) || (ema3_1 > 0 && ltp > ema3_1));

            const buyLowPricePass = gap1mUbbPass === true && gap5mUbbPass === true && buyBandPass === true;
            const sellLowPricePass = gap1mLbbPass === true && gap5mLbbPass === true && sellBandPass === true;

            return {
              symbol,
              token: row?.token || null,
              ltp,
              ema3_1,
              ema3_5,
              ubb_1,
              lbb_1,
              ubb_5,
              lbb_5,
              fourTickPct,
              gap1mUbbPct,
              gap1mLbbPct,
              gap5mUbbPct,
              gap5mLbbPct,
              gap1mUbbPass,
              gap1mLbbPass,
              gap5mUbbPass,
              gap5mLbbPass,
              buyBandPass,
              sellBandPass,
              buyLowPricePass,
              sellLowPricePass,
              lowPriceSignalType: buyLowPricePass && sellLowPricePass ? 'BOTH' : buyLowPricePass ? 'BUY' : sellLowPricePass ? 'SELL' : null
            };
          });

          const technicalRows = normalizeTechnicalRows(technicalDetailRows);
          const subscribedSet = new Set(getSubscribedStocks().map((sym) => String(extractSymbolName(sym || '')).toUpperCase()));
          const visibleRows = technicalRows.filter((row) => {
            const symbolMatched = subscribedSet.size === 0 || subscribedSet.has(String(row.symbol || '').toUpperCase());
            return symbolMatched && (row.buyLowPricePass || row.sellLowPricePass);
          });

          const renderSymbolCell = (row) => (
            row.symbol ? (
              <button
                type="button"
                onClick={() => onOpenChart && onOpenChart({ symbol: row.symbol, token: row.token }, 'technical-details')}
                style={{ background: 'transparent', border: 'none', padding: 0, margin: 0, color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700, fontSize: '11px' }}
                title={`Open ${row.symbol} chart`}
              >
                {row.symbol}
              </button>
            ) : '-'
          );

          return (
            <div style={{ marginTop: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3a8a', marginBottom: '8px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  Technical Details (Qualified BUY/SELL Low-Price Pass Only) ({visibleRows.length})
                </div>

                {visibleRows.length === 0 ? (
                  <div style={{ padding: '8px', color: '#64748b' }}>No technical rows available yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#0f766e' }}>1min (BUY and SELL)</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1060px', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                              <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Symbol</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Type</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>LTP</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>4 Tick %</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>EMA3(1m)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY UBB(1m)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY Gap%</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY Pass</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL LBB(1m)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL Gap%</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL Pass</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.map((row, idx) => {
                              const showBuy = row.lowPriceSignalType === 'BUY' || row.lowPriceSignalType === 'BOTH';
                              const showSell = row.lowPriceSignalType === 'SELL' || row.lowPriceSignalType === 'BOTH';
                              return (
                                <tr key={`tech1m-${row.symbol}-${idx}`}>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', fontWeight: 600 }}>{renderSymbolCell(row)}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: row.lowPriceSignalType === 'BUY' ? '#166534' : row.lowPriceSignalType === 'SELL' ? '#991b1b' : '#1d4ed8', fontWeight: 700 }}>{row.lowPriceSignalType || '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{row.ltp > 0 ? `₹${row.ltp.toFixed(2)}` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>{row.fourTickPct !== null ? `${row.fourTickPct.toFixed(4)}%` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{row.ema3_1 > 0 ? row.ema3_1.toFixed(2) : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{showBuy && row.ubb_1 > 0 ? row.ubb_1.toFixed(2) : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: showBuy ? '#166534' : '#64748b', fontWeight: 700 }}>{showBuy && row.gap1mUbbPct !== null ? `${row.gap1mUbbPct.toFixed(4)}%` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: !showBuy || row.gap1mUbbPass === null ? '#64748b' : row.gap1mUbbPass ? '#166534' : '#b91c1c', fontWeight: 700 }}>{!showBuy || row.gap1mUbbPass === null ? '-' : row.gap1mUbbPass ? 'YES' : 'NO'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{showSell && row.lbb_1 > 0 ? row.lbb_1.toFixed(2) : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: showSell ? '#991b1b' : '#64748b', fontWeight: 700 }}>{showSell && row.gap1mLbbPct !== null ? `${row.gap1mLbbPct.toFixed(4)}%` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: !showSell || row.gap1mLbbPass === null ? '#64748b' : row.gap1mLbbPass ? '#166534' : '#b91c1c', fontWeight: 700 }}>{!showSell || row.gap1mLbbPass === null ? '-' : row.gap1mLbbPass ? 'YES' : 'NO'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#1e3a8a' }}>5min (BUY and SELL)</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1120px', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                              <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Symbol</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Type</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>LTP</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>4 Tick %</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>EMA3(5m)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY UBB(5m)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY Gap%</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY Pass</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>BUY (LTP&lt;UBB1 OR LTP&lt;EMA3)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL LBB(5m)</th>
                              <th style={{ padding: '6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL Gap%</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL Pass</th>
                              <th style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SELL (LTP&gt;LBB1 OR LTP&gt;EMA3)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleRows.map((row, idx) => {
                              const showBuy = row.lowPriceSignalType === 'BUY' || row.lowPriceSignalType === 'BOTH';
                              const showSell = row.lowPriceSignalType === 'SELL' || row.lowPriceSignalType === 'BOTH';
                              return (
                                <tr key={`tech5m-${row.symbol}-${idx}`}>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', color: '#0f172a', fontWeight: 600 }}>{renderSymbolCell(row)}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: row.lowPriceSignalType === 'BUY' ? '#166534' : row.lowPriceSignalType === 'SELL' ? '#991b1b' : '#1d4ed8', fontWeight: 700 }}>{row.lowPriceSignalType || '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{row.ltp > 0 ? `₹${row.ltp.toFixed(2)}` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>{row.fourTickPct !== null ? `${row.fourTickPct.toFixed(4)}%` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{row.ema3_5 > 0 ? row.ema3_5.toFixed(2) : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{showBuy && row.ubb_5 > 0 ? row.ubb_5.toFixed(2) : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: showBuy ? '#166534' : '#64748b', fontWeight: 700 }}>{showBuy && row.gap5mUbbPct !== null ? `${row.gap5mUbbPct.toFixed(4)}%` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: !showBuy || row.gap5mUbbPass === null ? '#64748b' : row.gap5mUbbPass ? '#166534' : '#b91c1c', fontWeight: 700 }}>{!showBuy || row.gap5mUbbPass === null ? '-' : row.gap5mUbbPass ? 'YES' : 'NO'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: !showBuy || row.buyBandPass === null ? '#64748b' : row.buyBandPass ? '#166534' : '#b91c1c', fontWeight: 700 }}>{!showBuy || row.buyBandPass === null ? '-' : row.buyBandPass ? 'YES' : 'NO'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: '#0f172a' }}>{showSell && row.lbb_5 > 0 ? row.lbb_5.toFixed(2) : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', color: showSell ? '#991b1b' : '#64748b', fontWeight: 700 }}>{showSell && row.gap5mLbbPct !== null ? `${row.gap5mLbbPct.toFixed(4)}%` : '-'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: !showSell || row.gap5mLbbPass === null ? '#64748b' : row.gap5mLbbPass ? '#166534' : '#b91c1c', fontWeight: 700 }}>{!showSell || row.gap5mLbbPass === null ? '-' : row.gap5mLbbPass ? 'YES' : 'NO'}</td>
                                  <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: !showSell || row.sellBandPass === null ? '#64748b' : row.sellBandPass ? '#166534' : '#b91c1c', fontWeight: 700 }}>{!showSell || row.sellBandPass === null ? '-' : row.sellBandPass ? 'YES' : 'NO'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Streak-only BUY/SELL stocks below Technical Details */}
        {(() => {
          const effectiveSignalStocks = emaCheckSignalStocks || signalStocks;
          const normalizeSymbol = (value) => String(extractSymbolName(value || '') || '').trim();

          const normalizeRows = (rows) => {
            const source = Array.isArray(rows) ? rows : [];
            const bySymbol = new Map();

            source.forEach((row) => {
              const symbol = normalizeSymbol(typeof row === 'string' ? row : (row?.symbol || row?.s || row?.seg_sym));
              if (!symbol) return;

              if (!bySymbol.has(symbol)) {
                bySymbol.set(symbol, {
                  symbol,
                  token: row?.token || null
                });
              }
            });

            return Array.from(bySymbol.values());
          };

          const streakBuyRows = normalizeRows(effectiveSignalStocks?.buySignals);
          const streakSellRows = normalizeRows(effectiveSignalStocks?.sellSignals);

          const renderSymbolButton = (row) => (
            row.symbol ? (
              <button
                type="button"
                onClick={() => onOpenChart && onOpenChart({ symbol: row.symbol, token: row.token }, 'streak-only-signals')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  color: '#1d4ed8',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '11px'
                }}
                title={`Open ${row.symbol} chart`}
              >
                {row.symbol}
              </button>
            ) : '-'
          );

          return (
            <div style={{ marginTop: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  Streak-Only Stocks (Below Technical Details)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#166534' }}>
                      BUY ({streakBuyRows.length})
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '220px', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Symbol</th>
                          </tr>
                        </thead>
                        <tbody>
                          {streakBuyRows.length === 0 ? (
                            <tr>
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>No streak BUY stocks</td>
                            </tr>
                          ) : streakBuyRows.map((row, idx) => (
                            <tr key={`streak-buy-${row.symbol}-${idx}`}>
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{renderSymbolButton(row)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>
                      SELL ({streakSellRows.length})
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '220px', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Symbol</th>
                          </tr>
                        </thead>
                        <tbody>
                          {streakSellRows.length === 0 ? (
                            <tr>
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>No streak SELL stocks</td>
                            </tr>
                          ) : streakSellRows.map((row, idx) => (
                            <tr key={`streak-sell-${row.symbol}-${idx}`}>
                              <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{renderSymbolButton(row)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
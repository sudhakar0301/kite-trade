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

// Styled component for masking badge
const MaskingBadge = styled.span`
  margin-left: 10px;
  padding: 4px 8px;
  background: linear-gradient(45deg, rgba(255, 215, 0, 0.2), rgba(255, 165, 0, 0.1));
  border: 1px solid rgba(255, 215, 0, 0.6);
  border-radius: 12px;
  font-size: 10px;
  color: #ffd700;
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
  margin: 20px;
`;

const AccordionSection = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.4);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
`;

const AccordionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: ${props => props.primary 
    ? 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)' 
    : 'rgba(255, 215, 0, 0.1)'};
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: ${props => props.isExpanded ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'};
  
  &:hover {
    background: ${props => props.primary 
      ? 'linear-gradient(135deg, #2a5298 0%, #3a6bc8 100%)' 
      : 'rgba(255, 215, 0, 0.15)'};
  }
`;

const AccordionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: ${props => props.primary ? 'white' : '#ffd700'};
  font-size: 14px;
`;

const AccordionIcon = styled.div`
  color: ${props => props.primary ? 'white' : '#ffd700'};
  font-size: 14px;
  transition: transform 0.2s;
  transform: ${props => props.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const AccordionContent = styled.div`
  max-height: ${props => props.isExpanded ? '1000px' : '0'};
  overflow: hidden;
  transition: max-height 0.3s ease;
  padding: ${props => props.isExpanded ? '20px' : '0 20px'};
`;

const TrackerHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
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
`;



const OrderLevel = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isBest', 'side'].includes(prop),
})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${props => props.isBest ? '8px 10px' : '6px 10px'};
  background: ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.15)` : 
    'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.4)` : 
    'rgba(255, 255, 255, 0.08)'};
  border-radius: 4px;
  font-size: ${props => props.isBest ? '14px' : '13px'};
  font-weight: ${props => props.isBest ? '700' : '600'};
  min-height: 32px;
  
  &:hover {
    background: ${props => props.isBest ? 
      `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.25)` : 
      'rgba(255, 255, 255, 0.1)'};
  }
`;

const BestLabel = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
  font-size: 10px;
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff5555'};
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
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff5555'};
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



const NoDataMessage = styled.div`
  text-align: center;
  color: #ff6b6b;
  font-size: 14px;
  padding: 20px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  margin: 10px;
`;



const SubscribedStockTracker = ({ tickData, onSymbolClick }) => {
  // State to track currently selected stock symbol
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // State to track real subscribed symbols from backend API
  const [realSubscribedSymbols, setRealSubscribedSymbols] = useState([]);
  
  // State to trigger re-renders for countdown timer
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Accordion state
  const [expandedSections, setExpandedSections] = useState({
    liveTracker: true,
    orderBook: true,
    allStocks: true
  });
  
  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
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
    
    if (screenWidth <= 768) {
      // Mobile: Show only essential columns
      return '80px 50px 60px 80px 90px';
    } else if (screenWidth <= 1024) {
      // Tablet: Reduced widths
      return '90px 55px 70px 70px 90px 90px 100px';
    } else {
      // Desktop: Full width
      return '100px 60px 80px 80px 100px 100px 120px 100px 120px';
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
    
    // Use real subscribed symbols if available
    if (realSubscribedSymbols.length > 0) {
      console.log('🔍 Using real subscribed symbols from backend:', realSubscribedSymbols);
      return realSubscribedSymbols;
    }
    
    // Show all stocks but sort by most recent activity (newest on top)
    if (tickData) {
      const stocks = Object.keys(tickData).sort((a, b) => {
        const aHistory = tickData[a];
        const bHistory = tickData[b];
        
        const aLatestTime = aHistory && aHistory.length > 0 ? 
          new Date(aHistory[aHistory.length - 1]?.timestamp || 0).getTime() : 0;
        const bLatestTime = bHistory && bHistory.length > 0 ? 
          new Date(bHistory[bHistory.length - 1]?.timestamp || 0).getTime() : 0;
          
        return bLatestTime - aLatestTime; // Newest first
      });
      
      console.log('🔍 Stocks sorted by recent activity (newest first):', stocks.slice(0, 5));
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

  // Fetch real subscribed symbols from backend API
  useEffect(() => {
    const fetchSubscribedSymbols = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/subscription-status');
        if (response.ok) {
          const data = await response.json();
          const subscribedSymbols = data.subscribed_symbols || [];
          console.log('🔍 Real subscribed symbols from backend:', subscribedSymbols);
          setRealSubscribedSymbols(subscribedSymbols);
        } else {
          console.log('⚠️ Failed to get subscription status from backend');
        }
      } catch (error) {
        console.log('❌ Error fetching subscription status:', error);
      }
    };

    // Fetch initially
    fetchSubscribedSymbols();

    // Fetch every 10 seconds to keep in sync
    const interval = setInterval(fetchSubscribedSymbols, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const subscribedStocks = getSubscribedStocks();
    const allAvailableSymbols = getAllAvailableSymbols();
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
      
      // Check if current symbol can be changed (30 seconds elapsed or no current symbol)
      const currentTime = Date.now();
      const canChangeSymbol = !selectedSymbol || 
        !symbolTimestampsRef.current[selectedSymbol] || 
        (currentTime - symbolTimestampsRef.current[selectedSymbol] >= 30 * 1000); // 30 seconds in milliseconds
      
      if (canChangeSymbol) {
        // PRIORITY 1: Check for trade-ready symbols first
        console.log('🎯 Checking for trade-ready symbols...');
        let tradeReadySymbol = null;
        
        // Check all available symbols for trade readiness
        for (const symbol of allAvailableSymbols) {
          const tickSymbols = tickData ? Object.keys(tickData) : [];
          const latestTick = tickSymbols.includes(symbol) ? tickData[symbol] : null;
          
          if (latestTick) {
            const tradeConditions = checkAutoTradeConditions(latestTick);
            if (tradeConditions?.canTrade) {
              tradeReadySymbol = symbol;
              console.log('🎯 ✅ TRADE-READY SYMBOL FOUND:', symbol, 'Conditions:', tradeConditions);
              break; // Use the first trade-ready symbol found
            }
          }
        }
        
        // PRIORITY 2: Use trade-ready symbol if found, otherwise use new symbol
        const symbolToSelect = tradeReadySymbol || newSymbols[newSymbols.length - 1];
        console.log('🔍 🔄 Switching to symbol:', symbolToSelect, tradeReadySymbol ? '(TRADE-READY)' : '(NEW)');
        setSelectedSymbol(symbolToSelect);
        
        // Auto-open chart in reusable tab for selected symbol - Enhanced debugging
        console.log('🚀 Attempting auto-chart open for:', symbolToSelect);
        console.log('🔍 Symbol format check - Original:', symbolToSelect, 'Type:', typeof symbolToSelect);
        
        const chartUrl = getKiteChartUrl(symbolToSelect);
        console.log('🔍 Chart URL result:', chartUrl);
        
        if (chartUrl) {
          console.log('🚀 AUTO-OPENING CHART NOW for:', symbolToSelect, 'URL:', chartUrl);
          
          // Try to open chart with popup blocker detection
          try {
            const newTab = window.open(chartUrl, 'kite-chart-tab'); // Named tab - reuses same tab
            if (newTab) {
              console.log('✅ Chart opened in reusable tab for:', symbolToSelect.replace('NSE:', ''));
              // Focus the chart tab to bring it to front
              newTab.focus();
              
              // Also open the order book panel for the same symbol
              if (onSymbolClick) {
                onSymbolClick(symbolToSelect);
                console.log('🎯 Order book panel opened for:', symbolToSelect.replace('NSE:', ''));
              }
            } else {
              console.error('❌ Popup blocked! Enable popups for automatic chart opening');
              // Show alert as fallback
              alert(`📊 Chart blocked by popup blocker!\nClick OK to open chart for ${symbolToSelect.replace('NSE:', '')}\n\nURL: ${chartUrl}`);
            }
          } catch (error) {
            console.error('❌ Error opening chart:', error);
          }
        } else {
          console.log('⚠️ No chart URL available for:', symbolToSelect);
          console.log('🔍 Debug: Checking token mapping for symbol:', symbolToSelect.replace('NSE:', ''));
        }
        
        // Update timestamp for the selected symbol
        const newTimestamps = {
          ...symbolTimestampsRef.current,
          [symbolToSelect]: currentTime
        };
        symbolTimestampsRef.current = newTimestamps;
        
        // Record which symbols existed when this symbol was selected
        symbolsAtSelectionRef.current[symbolToSelect] = new Set(allAvailableSymbols);
      } else {
        // Current symbol is still in its 30-second display period
        const timeRemaining = 30 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        console.log('🔍 ⏰ Current symbol still has', Math.ceil(timeRemaining / 1000), 'seconds remaining. New symbols will queue.');
      }
    }
    
    // If no selectedSymbol yet, or if current selectedSymbol is no longer available
    if (!selectedSymbol || !allAvailableSymbols.includes(selectedSymbol)) {
      // Prefer symbols with actual data, but show any available symbol
      const symbolToSelect = subscribedStocks.length > 0 ? subscribedStocks[0] : 
                            allAvailableSymbols.length > 0 ? allAvailableSymbols[0] : null;
      
      if (symbolToSelect) {
        console.log('🔍 🔄 Switching to available stock:', symbolToSelect);
        setSelectedSymbol(symbolToSelect);
        
        // Set timestamp for this symbol
        const currentTime = Date.now();
        const newTimestamps = {
          ...symbolTimestampsRef.current,
          [symbolToSelect]: currentTime
        };
        symbolTimestampsRef.current = newTimestamps;
        
        // Record which symbols existed when this symbol was selected
        symbolsAtSelectionRef.current[symbolToSelect] = new Set(allAvailableSymbols);
      } else {
        console.log('🔍 ❌ No available stocks');
        setSelectedSymbol(null);
      }
    }
    
    // Update previous symbols set
    const newSymbolsSet = new Set(allAvailableSymbols);
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
    
  }, [tickData, selectedSymbol, getAllAvailableSymbols, getSubscribedStocks, getKiteChartUrl]);
  
  // Continuous trade-ready monitoring - runs independently of new symbol detection
  useEffect(() => {
    const checkTradeReadySymbols = () => {
      const allAvailableSymbols = getAllAvailableSymbols();
      const currentTime = Date.now();
      
      console.log('🎯 CONTINUOUS CHECK: Monitoring trade-ready symbols...');
      
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
        
        // If we found a trade-ready symbol and it's different from current
        if (tradeReadySymbol && tradeReadySymbol !== selectedSymbol) {
          console.log('🎯 🔄 CONTINUOUS CHECK: Switching to trade-ready symbol:', tradeReadySymbol);
          setSelectedSymbol(tradeReadySymbol);
          
          // Update timestamp
          symbolTimestampsRef.current[tradeReadySymbol] = currentTime;
          
          // Auto-open chart and order panel
          const chartUrl = getKiteChartUrl(tradeReadySymbol);
          if (chartUrl) {
            console.log('🚀 CONTINUOUS CHECK: Opening chart for trade-ready symbol:', tradeReadySymbol);
            try {
              const newTab = window.open(chartUrl, 'kite-chart-tab');
              if (newTab) {
                newTab.focus();
                console.log('✅ Chart opened for trade-ready symbol:', tradeReadySymbol.replace('NSE:', ''));
              }
            } catch (error) {
              console.error('❌ Error opening chart for trade-ready symbol:', error);
            }
          }
          
          // Open order panel
          if (onSymbolClick) {
            onSymbolClick(tradeReadySymbol);
            console.log('🎯 Order panel opened for trade-ready symbol:', tradeReadySymbol.replace('NSE:', ''));
          }
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
  }, [tickData, selectedSymbol, getAllAvailableSymbols, getKiteChartUrl, onSymbolClick]);
  
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
          const newestSymbol = newlySubscribedSymbols.reduce((newest, symbol) => 
            symbolTimestampsRef.current[symbol] > symbolTimestampsRef.current[newest] ? symbol : newest
          );
          
          console.log('🔍 ⏰ 30 seconds elapsed. Switching to newly subscribed symbol:', newestSymbol);
          setSelectedSymbol(newestSymbol);
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
            console.log(`📈 AUTO-OPENING CHART for: ${symbol}`);
            
            // Set as selected symbol for highlighting and live tracker update
            setSelectedSymbol(symbol);
            
            // Mark as auto-opened to prevent duplicates
            autoOpenedChartsRef.current.add(symbol);
            
            // Get chart URL and open in new tab
            const chartUrl = getKiteChartUrl(symbol);
            if (chartUrl) {
              window.open(chartUrl, `chart-${symbol.replace(':', '-')}`);
              console.log(`✅ Chart opened automatically for: ${symbol}`);
            }
            
            // Also trigger the SST panel if callback is available
            if (onSymbolClick) {
              onSymbolClick(symbol);
              console.log(`🎯 SST panel opened automatically for: ${symbol}`);
            }
            
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
  }, [tickData, getAllAvailableSymbols, getSubscribedStocks, getKiteChartUrl, onSymbolClick]); // Re-analyze when tick data updates
  
  // Effect to update current time every second for countdown display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Helper function to extract symbol name from exchange:symbol format
  const extractSymbolName = (fullSymbol) => {
    if (typeof fullSymbol === 'string' && fullSymbol.includes(':')) {
      return fullSymbol.split(':')[1];
    }
    return fullSymbol;
  };

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
      {/* Live Tracker Header Section */}
      <AccordionSection>
        <AccordionHeader 
          primary={true}
          isExpanded={expandedSections.liveTracker}
          onClick={() => toggleSection('liveTracker')}
        >
          <AccordionTitle primary={true}>
            🏛️ Live Stock Tracker - {selectedSymbol ? selectedSymbol.replace('NSE:', '') : 'No Stock'}
            {selectedSymbol && (
              <MaskingBadge>
                🎯 MASKING ACTIVE
              </MaskingBadge>
            )}
          </AccordionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {(() => {
              const timeRemaining = getTimeRemaining();
              return timeRemaining !== null && timeRemaining > 0 ? (
                <span style={{ 
                  color: timeRemaining > 60 ? '#ffd700' : timeRemaining > 30 ? '#ff9500' : '#ff6b6b',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12px'
                }}>
                  ⏰ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </span>
              ) : null;
            })()}
            {stockData ? (
              <span style={{ color: '#00ff00', fontSize: '12px' }}>🟢 LIVE</span>
            ) : (
              <span style={{ color: '#ff6b6b', fontSize: '12px' }}>🔴 NO DATA</span>
            )}
            <AccordionIcon primary={true} isExpanded={expandedSections.liveTracker}>
              ▶
            </AccordionIcon>
          </div>
        </AccordionHeader>
        <AccordionContent isExpanded={expandedSections.liveTracker}>
          {/* Market Impact Info */}
          {selectedSymbol && stockData?.depth?.marketImpact && (
            <div style={{ 
              padding: '10px',
              background: 'rgba(255, 215, 0, 0.05)',
              border: '1px solid rgba(255, 215, 0, 0.2)',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#ffd700',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '8px',
              marginBottom: '15px'
            }}>
              <span>📊 Qty: {stockData.depth.marketImpact.quantity?.toLocaleString()}</span>
              <span>🎯 Levels: {stockData.depth.marketImpact.impactedLevels}</span>
              <span>📈 Slippage: {stockData.depth.marketImpact.totalSlippage?.toFixed(3)}%</span>
              <span>💰 Avg Price: ₹{stockData.depth.marketImpact.avgExecutionPrice?.toFixed(2)}</span>
              <span>📋 L5: {(() => {
                const analytics = calculateOrderBookAnalytics();
                return `B:${analytics.l5.bidQtySum.toLocaleString()} | A:${analytics.l5.askQtySum.toLocaleString()}`;
              })()}</span>
            </div>
          )}
        </AccordionContent>
      </AccordionSection>

      {/* Order Book Section */}
      {(stockData || isWaitingForData) && (
        <AccordionSection>
          <AccordionHeader 
            isExpanded={expandedSections.orderBook}
            onClick={() => toggleSection('orderBook')}
          >
            <AccordionTitle>
              📈 Order Book - {selectedSymbol ? selectedSymbol.replace('NSE:', '') : 'Loading...'}
            </AccordionTitle>
            <AccordionIcon isExpanded={expandedSections.orderBook}>
              ▶
            </AccordionIcon>
          </AccordionHeader>
          <AccordionContent isExpanded={expandedSections.orderBook}>
            {isWaitingForData && !stockData ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: 'rgba(255, 215, 0, 0.1)',
                border: '1px solid rgba(255, 215, 0, 0.3)', 
                borderRadius: '12px',
                color: '#ffd700'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                  Loading live data for {currentSymbol}...
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  Symbol subscribed successfully - waiting for first tick data from exchange
                </div>
              </div>
            ) : stockData ? (
              <TrackerBody>
                <div style={{ padding: '20px', textAlign: 'center', color: '#ffd700' }}>
                  Order book data for {selectedSymbol} would be displayed here
                </div>
              </TrackerBody>
            ) : null}
          </AccordionContent>
        </AccordionSection>
      )}

      {/* All Subscribed Stocks Section */}
      <AccordionSection>
        <AccordionHeader 
          isExpanded={expandedSections.allStocks}
          onClick={() => toggleSection('allStocks')}
        >
          <AccordionTitle>
            📊 All Subscribed Stocks ({getSubscribedStocks().length})
          </AccordionTitle>
          <AccordionIcon isExpanded={expandedSections.allStocks}>
            ▶
          </AccordionIcon>
        </AccordionHeader>
        <AccordionContent isExpanded={expandedSections.allStocks}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: gridTemplate,
            gap: '8px',
            padding: '8px',
            fontSize: '11px',
            fontWeight: '600',
            color: '#ffd700',
            background: 'rgba(255, 215, 0, 0.1)',
            borderRadius: '6px',
            marginBottom: '8px'
          }}>
            <div>📈 Symbol</div>
            <div>🔄 Type</div>
            <div>📊 Qty</div>
            <div>🎯 Levels</div>
            <div>🛡️ L3-7 Support</div>
            {window.innerWidth > 1024 && <div>📈 Slippage</div>}
            {window.innerWidth > 768 && <div>💰 Avg Price</div>}
            {window.innerWidth > 1024 && <div>⚖️ L3-7: Imbal</div>}
            {window.innerWidth > 1024 && <div>🎯 Trade Ready</div>}
          </div>
        
          {/* Table Data */}
          {getSubscribedStocks().map(symbol => {
            console.log('🔍 TABLE RENDER - Processing symbol:', symbol, 'Type:', typeof symbol);
            
            const symbolKey = extractSymbolName(symbol);
            console.log('🔍 TABLE RENDER - Symbol key for lookup:', symbolKey);
            
            const symbolData = tickData?.[symbolKey];
            console.log('🔍 TABLE RENDER - Found symbolData:', !!symbolData, 'Length:', symbolData?.length);
            
            const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
            console.log('🔍 TABLE RENDER - Latest tick exists:', !!latestTick);
            
            if (latestTick) {
              console.log('🔍 TABLE RENDER - Market impact:', !!latestTick.depth?.marketImpact);
            }
            
            const marketImpact = latestTick?.depth?.marketImpact;
            const scanType = latestTick?.scan_type || 'UNKNOWN';
            
            const tradeConditions = latestTick ? checkAutoTradeConditions(latestTick) : null;
            
            console.log(`🔍 DATA EXTRACTION for ${symbol}:`, {
              symbolKey: symbolKey,
              hasSymbolData: !!symbolData,
              dataLength: symbolData?.length,
              hasLatestTick: !!latestTick,
              scanType: scanType,
              hasMarketImpact: !!marketImpact
            });
            
            const l5Data = latestTick?.depth ? (() => {
              const { buy = [], sell = [] } = latestTick.depth;
              const bidQtySum5 = buy.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
              const askQtySum5 = sell.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
              return { bidQtySum5, askQtySum5 };
            })() : { bidQtySum5: 0, askQtySum5: 0 };
            
            const l37Data = latestTick?.depth ? (() => {
              const { buy = [], sell = [] } = latestTick.depth;
              const bidQtySum37 = buy.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0);
              const askQtySum37 = sell.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0);
              
              let imbalance37 = 0;
              if (scanType === 'BUY_SCAN' && askQtySum37 > 0) {
                imbalance37 = bidQtySum37 / askQtySum37;
              } else if (scanType === 'SELL_SCAN' && bidQtySum37 > 0) {
                imbalance37 = askQtySum37 / bidQtySum37;
              }
              
              return { bidQtySum37, askQtySum37, imbalance37 };
            })() : { bidQtySum37: 0, askQtySum37: 0, imbalance37: 0 };
            
            const supportData = latestTick?.depth ? (() => {
              const { buy = [], sell = [] } = latestTick.depth;
              
              const currentPrice = latestTick.last_price || 1;
              const calculatedQuantity = Math.floor(500000 / currentPrice);
              
              const askSupport = sell.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0);
              const askSupportRatio = calculatedQuantity > 0 ? askSupport / calculatedQuantity : 0;
              
              const bidSupport = buy.slice(2, 7).reduce((sum, level) => sum + (level?.quantity || 0), 0);
              const bidSupportRatio = calculatedQuantity > 0 ? bidSupport / calculatedQuantity : 0;
              
              return { askSupport, bidSupport, askSupportRatio, bidSupportRatio, calculatedQuantity };
            })() : { askSupport: 0, bidSupport: 0, askSupportRatio: 0, bidSupportRatio: 0, calculatedQuantity: 0 };
            
            const scanColors = {
              BUY_SCAN: {
                bg: 'rgba(0, 255, 0, 0.1)',
                border: 'rgba(0, 255, 0, 0.3)',
                text: '#00ff00',
                bidColor: '#00ff00',
                askColor: '#ffaa00'
              },
              SELL_SCAN: {
                bg: 'rgba(255, 107, 107, 0.1)',
                border: 'rgba(255, 107, 107, 0.3)',
                text: '#ff6b6b',
                bidColor: '#ffaa00',
                askColor: '#ff6b6b'
              },
              UNKNOWN: {
                bg: 'rgba(255, 255, 255, 0.02)',
                border: 'transparent',
                text: '#888',
                bidColor: '#888',
                askColor: '#888'
              }
            };
            
            const colors = scanColors[scanType] || scanColors.UNKNOWN;
            
            return (
              <div
                key={symbol}
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  gap: '8px',
                  padding: '8px',
                  fontSize: '10px',
                  background: symbol === selectedSymbol ? 
                    'rgba(255, 215, 0, 0.2)' : colors.bg,
                  borderRadius: '4px',
                  marginBottom: '4px',
                  border: symbol === selectedSymbol ? 
                    '1px solid rgba(255, 215, 0, 0.5)' : 
                    `1px solid ${colors.border}`,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  setSelectedSymbol(symbol);
                  const chartUrl = getKiteChartUrl(symbol);
                  if (chartUrl) {
                    window.open(chartUrl, 'kite-chart-tab');
                    console.log('🔍 Chart opened for:', symbol);
                  }
                  if (onSymbolClick) {
                    onSymbolClick(symbol);
                    console.log('🎯 SST side panel opened for:', symbol);
                  }
                }}
              >
                <div style={{ 
                  color: symbol === selectedSymbol ? '#ffd700' : '#79c0ff',
                  fontWeight: symbol === selectedSymbol ? '600' : '400',
                  fontSize: '11px'
                }}>
                  {symbol.replace('NSE:', '')}
                  {symbol === selectedSymbol && <span style={{ marginLeft: '4px' }}>🎯</span>}
                </div>
                
                <div style={{ 
                  color: colors.text,
                  fontSize: '9px',
                  fontWeight: '600'
                }}>
                  {scanType === 'BUY_SCAN' ? '🟢 BUY' : 
                   scanType === 'SELL_SCAN' ? '🔴 SELL' : '⚪ UNK'}
                </div>
                
                <div style={{ color: marketImpact ? '#00ff00' : '#888' }}>
                  {marketImpact?.quantity ? marketImpact.quantity.toLocaleString() : '-'}
                </div>
                
                <div style={{ color: marketImpact ? '#00ff00' : '#888' }}>
                  {marketImpact ? (
                    scanType === 'BUY_SCAN' ? (
                      <span style={{ color: colors.askColor }}>Ask: {marketImpact?.impactedLevels || '-'}</span>
                    ) : scanType === 'SELL_SCAN' ? (
                      <span style={{ color: colors.bidColor }}>Bid: {marketImpact?.impactedLevels || '-'}</span>
                    ) : (
                      marketImpact?.impactedLevels || '-'
                    )
                  ) : '-'}
                </div>
                
                <div style={{ 
                  color: latestTick ? '#79c0ff' : '#888',
                  fontSize: '9px',
                  fontWeight: '600'
                }}>
                  {latestTick ? (
                    scanType === 'BUY_SCAN' ? (
                      <span style={{ color: colors.askColor }} title="ASK L3-7 support : ratio vs ₹5L quantity">
                        {supportData.askSupport.toLocaleString()} : {supportData.askSupportRatio.toFixed(1)}
                      </span>
                    ) : scanType === 'SELL_SCAN' ? (
                      <span style={{ color: colors.bidColor }} title="BID L3-7 support : ratio vs ₹5L quantity">
                        {supportData.bidSupport.toLocaleString()} : {supportData.bidSupportRatio.toFixed(1)}
                      </span>
                    ) : (
                      <span>{Math.max(supportData.askSupport, supportData.bidSupport).toLocaleString()} : -</span>
                    )
                  ) : '-'}
                </div>
                
                {window.innerWidth > 1024 && (
                  <div style={{ color: marketImpact?.totalSlippage ? 
                    (marketImpact.totalSlippage <= 0.05 ? '#00ff00' : 
                     marketImpact.totalSlippage <= 0.1 ? '#ffa500' : '#ff6b6b') : '#888' }}>
                    {marketImpact?.totalSlippage ? 
                      `${marketImpact.totalSlippage.toFixed(3)}%` : '-'}
                  </div>
                )}
                
                {window.innerWidth > 768 && (
                  <div style={{ color: marketImpact ? '#ffd700' : '#888' }}>
                    {marketImpact?.avgExecutionPrice ? 
                      `₹${marketImpact.avgExecutionPrice.toFixed(2)}` : '-'}
                  </div>
                )}
                
                {window.innerWidth > 1024 && (
                  <div style={{ 
                    color: latestTick ? (
                      l37Data.imbalance37 >= 1.4 ? '#00ff00' : 
                      l37Data.imbalance37 >= 1.2 ? '#ffaa00' : '#ff6b6b'
                    ) : '#888',
                    fontSize: '9px',
                    fontWeight: '600'
                  }}>
                    {latestTick ? (
                      l37Data.imbalance37 > 0 ? (
                        <span title={`${scanType === 'BUY_SCAN' ? 'Bid/Ask' : 'Ask/Bid'} L3-7 ratio`}>
                          {l37Data.imbalance37.toFixed(2)} ({
                            scanType === 'BUY_SCAN' 
                              ? `${l37Data.bidQtySum37.toLocaleString()}, ${l37Data.askQtySum37.toLocaleString()}`
                              : scanType === 'SELL_SCAN'
                              ? `${l37Data.askQtySum37.toLocaleString()}, ${l37Data.bidQtySum37.toLocaleString()}`
                              : `${l37Data.bidQtySum37.toLocaleString()}, ${l37Data.askQtySum37.toLocaleString()}`
                          })
                        </span>
                      ) : '-'
                    ) : '-'}
                  </div>
                )}
                
                {window.innerWidth > 1024 && (
                  <div style={{ 
                    color: tradeConditions?.canTrade ? '#00ff00' : '#ff6b6b',
                    fontSize: '9px',
                    fontWeight: '600'
                  }}>
                    {tradeConditions ? (
                      tradeConditions.canTrade ? (
                        <span>✅ Ready</span>
                      ) : (
                        <span title={tradeConditions.reason}>❌ Wait</span>
                      )
                    ) : (
                      <span>⏳ Loading</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Summary Footer */}
          <div style={{
            marginTop: '15px',
            padding: '10px',
            background: 'rgba(255, 215, 0, 0.1)',
            borderRadius: '6px',
            borderTop: '1px solid rgba(255, 215, 0, 0.3)'
          }}>
            <div style={{ 
              fontSize: '11px', 
              color: '#ffd700', 
              fontWeight: '600',
              textAlign: 'center',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                📈 Total: {getSubscribedStocks().length} symbols
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <span style={{ color: '#00ff00' }}>
                  🟢 Buy: {getSubscribedStocks().filter(symbol => {
                    const symbolData = tickData?.[symbol];
                    const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
                    return latestTick?.scan_type === 'BUY_SCAN';
                  }).length}
                </span>
                <span style={{ color: '#ff6b6b' }}>
                  🔴 Sell: {getSubscribedStocks().filter(symbol => {
                    const symbolData = tickData?.[symbol];
                    const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
                    return latestTick?.scan_type === 'SELL_SCAN';
                  }).length}
                </span>
              </div>
              <div>
                {selectedSymbol ? ` Live: ${selectedSymbol.replace('NSE:', '')}` : ' No selection'} ⚡
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionSection>
      
      {!stockData && !isWaitingForData && (
        <AccordionSection>
          <AccordionContent isExpanded={true}>
            <NoDataMessage>
              {hasSymbol ? (
                <>
                  ⏳ Waiting for live data for {currentSymbol}... <br />
                  <small style={{ color: '#ffd700' }}>Symbol subscribed - first tick data loading...</small>
                </>
              ) : (
                <>
                  📡 Waiting for subscribed stock data... <br />
                  <small>Start scanner to begin receiving tick updates</small>
                </>
              )}
              {(() => {
                const allSymbols = getAllAvailableSymbols();
                const queuedSymbols = allSymbols.filter(symbol => symbol !== selectedSymbol);
                
                if (queuedSymbols.length > 0) {
                  return (
                    <div style={{ marginTop: '10px', fontSize: '11px', color: '#ffd700' }}>
                      🔄 Available symbols: {queuedSymbols.join(', ')}
                    </div>
                  );
                }
                return null;
              })()}
            </NoDataMessage>
          </AccordionContent>
        </AccordionSection>
      )}
    </TrackerContainer>
  );
};

export default SubscribedStockTracker;
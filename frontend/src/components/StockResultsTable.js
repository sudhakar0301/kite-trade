import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';

// Symbol mappings for chart URL generation
let symbolMappings = {};

// Load symbol mappings from backend
fetch('/api/symbol-mappings')
  .then(response => response.json())
  .then(data => {
    symbolMappings = data.symbolMappings || {};
    console.log('📊 Symbol mappings loaded for StockResultsTable:', Object.keys(symbolMappings).length, 'symbols');
  })
  .catch(error => console.error('❌ Failed to load symbol mappings:', error));

// Fallback symbol mappings for common stocks
const fallbackSymbolMappings = {
  'RELIANCE': '738561',
  'TCS': '2953217',
  'INFY': '408065',
  'WIPRO': '969473',
  'HDFCBANK': '341249',
  'ICICIBANK': '1270529',
  'SBIN': '779521',
  'ITC': '424961',
  'HINDUNILVR': '356865',
  'LT': '2939649'
};

const ResultsContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 20px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ResultPanel = styled.div`
  border: 2px solid ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  border-radius: 20px;
  padding: 20px;
  background: ${props => props.type === 'buy' 
    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.08) 100%)'
    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)'};
  backdrop-filter: blur(20px);
  height: 500px;
  display: flex;
  flex-direction: column;
  box-shadow: ${props => props.type === 'buy' 
    ? '0 8px 32px rgba(16, 185, 129, 0.2)' 
    : '0 8px 32px rgba(239, 68, 68, 0.2)'};
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: ${props => props.type === 'buy' 
      ? 'linear-gradient(90deg, #10b981, #34d399)' 
      : 'linear-gradient(90deg, #ef4444, #f87171)'};
  }
`;

const PanelHeader = styled.div`
  text-align: center;
  margin-bottom: 16px;
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
`;

const PanelTitle = styled.h6`
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
`;

const SignalBadge = styled.span`
  background: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  color: white;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  min-width: 28px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`;

const StocksTable = styled.div`
  flex: 1;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(139, 148, 158, 0.3);
    border-radius: 3px;
  }
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  background: rgba(255, 255, 255, 0.1);
  padding: 12px 16px;
  font-weight: 600;
  font-size: 11px;
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  z-index: 1;
`;

const StockRow = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    background: ${props => props.type === 'buy' 
      ? 'rgba(16, 185, 129, 0.1)' 
      : 'rgba(239, 68, 68, 0.1)'};
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const SymbolCell = styled.div`
  font-weight: 600;
  color: #e6edf3;
  font-size: 13px;
`;

const PriceCell = styled.div`
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  font-weight: 600;
  text-align: right;
`;

const IndicatorCell = styled.div`
  color: #8b949e;
  text-align: right;
  font-size: 11px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #8b949e;
  font-size: 14px;
  
  .icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  .message {
    text-align: center;
    line-height: 1.5;
  }
`;

const SimpleStockList = styled.div`
  overflow-y: auto;
  height: 100%;
`;

const SymbolItem = styled.div`
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.type === 'buy' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
    transform: translateX(4px);
  }
`;

const StockResultsTable = ({ type = 'buy', stocks = [], onSymbolClick }) => {
  
  // Get symbol to token mapping
  const getSymbolToTokenMap = useCallback(() => {
    const mergedMappings = { ...fallbackSymbolMappings, ...symbolMappings };
    return mergedMappings;
  }, []);

  // Generate Kite chart URL for a symbol
  const getKiteChartUrl = useCallback((symbol) => {
    console.log('📊 StockResultsTable getKiteChartUrl called with:', symbol, 'Type:', typeof symbol);
    
    if (!symbol) {
      console.log('📊 No symbol provided to getKiteChartUrl');
      return null;
    }
    
    // Clean the symbol (remove NSE: prefix if present)
    let cleanSymbol = typeof symbol === 'string' ? symbol.replace('NSE:', '') : String(symbol);
    console.log('📊 Clean symbol:', cleanSymbol);
    
    // Get current symbol mappings
    const symbolToTokenMap = getSymbolToTokenMap();
    
    // Look up the token from our mapping
    let token = symbolToTokenMap[cleanSymbol];
    
    // If not found, try common symbol variations and partial matches
    if (!token) {
      console.log('📊 Direct lookup failed, trying variations...');
      
      // Try partial matches (for cases like SAREGA -> SAREGAMA)
      const possibleMatches = Object.keys(symbolToTokenMap).filter(key => 
        key.startsWith(cleanSymbol) || cleanSymbol.startsWith(key)
      );
      
      if (possibleMatches.length > 0) {
        console.log('📊 Found possible matches:', possibleMatches);
        cleanSymbol = possibleMatches[0]; // Use first match
        token = symbolToTokenMap[cleanSymbol];
        console.log('📊 Using symbol variation:', cleanSymbol, 'Token:', token);
      }
    }
    
    console.log('📊 Final token lookup for', cleanSymbol, '- Found:', token);
    
    if (!token) {
      console.log('📊 ❌ No token found for symbol:', cleanSymbol);
      console.log('📊 Available symbols:', Object.keys(symbolToTokenMap).slice(0, 20));
      return null;
    }
    
    // Construct NSE chart URL
    const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${token}`;
    console.log('📊 ✅ Generated chart URL:', chartUrl);
    
    return chartUrl;
  }, [getSymbolToTokenMap]);

  const handleSymbolClick = (stock) => {
    const symbol = stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s);
    
    // Generate and open chart URL
    const chartUrl = getKiteChartUrl(symbol);
    if (chartUrl) {
      console.log('🚀 Opening chart for:', symbol, 'URL:', chartUrl);
      try {
        const newTab = window.open(chartUrl, 'kite-chart-tab'); // Named tab - reuses same tab
        if (newTab) {
          console.log('✅ Chart opened successfully for:', symbol);
        } else {
          console.log('⚠️ Popup may be blocked, showing alert');
          alert(`📊 Chart blocked by popup blocker!\nClick OK to open chart for ${symbol}\n\nURL: ${chartUrl}`);
        }
      } catch (error) {
        console.error('❌ Error opening chart:', error);
        alert(`📊 Error opening chart for ${symbol}: ${error.message}`);
      }
    } else {
      console.log('⚠️ No chart URL available for:', symbol);
      alert(`📊 Chart not available for ${symbol}\nSymbol may not be in our mapping.`);
    }

    // Also trigger the parent callback if provided
    if (onSymbolClick) {
      onSymbolClick(symbol);
    }
  };

  return (
    <ResultPanel type={type}>
      <PanelHeader type={type}>
        <PanelTitle>
          {type === 'buy' ? '📈 Buy Stocks' : '📉 Sell Stocks'}
          <SignalBadge type={type}>{stocks.length}</SignalBadge>
        </PanelTitle>
      </PanelHeader>

      <SimpleStockList>
        {stocks.length === 0 ? (
          <EmptyState>
            <div className="icon">{type === 'buy' ? '📈' : '📉'}</div>
            <div className="message">
              No {type} candidates<br/>
              <small>Select filters to see stocks</small>
            </div>
          </EmptyState>
        ) : (
          stocks.map((stock, index) => (
            <SymbolItem 
              key={`${stock.symbol || stock.s}-${index}`} 
              type={type}
              onClick={() => handleSymbolClick(stock)}
            >
              {stock.symbol || (stock.s && stock.s.includes(':') ? stock.s.split(':')[1] : stock.s)}
            </SymbolItem>
          ))
        )}
      </SimpleStockList>
    </ResultPanel>
  );
};

export default StockResultsTable;
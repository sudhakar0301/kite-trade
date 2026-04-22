import React, { useState, useMemo, useCallback, memo } from 'react';
import styled from 'styled-components';
import FilterPanel from './FilterPanel';

const StocksTable = styled.div`
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-height: 600px;
  overflow-y: auto;
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    max-height: 500px;
  }
  
  /* Smaller laptop screens */
  @media (max-width: 1200px) {
    max-height: 450px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    max-height: 400px;
    border-radius: 10px;
  }
`;

const StockSymbol = styled.div`
  padding: 12px 15px;
  font-weight: 600;
  color: #79c0ff;
  font-size: 16px;
  font-family: 'Inter', 'System UI', -apple-system, sans-serif;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    transform: translateX(4px);
  }
  
  &:last-child {
    border-bottom: none;
  }
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    padding: 10px 12px;
    font-size: 15px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    padding: 8px 10px;
    font-size: 14px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    padding: 10px 12px;
    font-size: 15px;
  }
`;

const FilteredStocksDisplay = ({ stocks, type }) => {
  if (!stocks.length) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: '#94a3b8',
        fontSize: '16px',
        fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
      }}>
        📊 No matching stocks
      </div>
    );
  }

  return (
    <StocksTable>
      {stocks.slice(0, 50).map((stock, index) => (
        <StockSymbol 
          key={stock.symbol || stock.s || index}
        >
          {stock.symbol || stock.s}
        </StockSymbol>
      ))}
      {stocks.length > 50 && (
        <div style={{
          padding: '15px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '13px',
          fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
        }}>
          +{stocks.length - 50} more
        </div>
      )}
    </StocksTable>
  );
};

const TradingDashboard = memo(({ 
  allStocks = [], 

  onOpenChart
}) => {
  const [buyResults, setBuyResults] = useState([]);
  const [sellResults, setSellResults] = useState([]);

  const handleBuyResults = useCallback((results) => {
    setBuyResults(results);
  }, []);

  const handleSellResults = useCallback((results) => {
    setSellResults(results);
  }, []);

  const handleSymbolClick = useCallback((symbol) => {
    if (onOpenChart) {
      onOpenChart(symbol);
    }
  }, [onOpenChart]);

  // Only log when values actually change
  const logData = useMemo(() => ({
    allStocks: allStocks.length,
    buyResults: buyResults.length,
    sellResults: sellResults.length
  }), [allStocks.length, buyResults.length, sellResults.length]);

  console.log('📊 TradingDashboard rendered with:', logData);

  return (
    <div style={{ display: 'none' }}>
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: '25px',
      padding: '30px',
      background: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '16px',
      minHeight: '800px',
      width: '100%',
      maxWidth: '1800px',
      margin: '0 auto'
    }}>
      {/* Buy Filters Column */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.1)',
        border: '2px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        minHeight: '700px'
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#10b981',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '2px solid rgba(16, 185, 129, 0.3)',
          paddingBottom: '12px',
          fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
        }}>
          📈 Buy Filters
        </div>
        <FilterPanel 
          type="buy"
          allStocks={allStocks}
          onFilteredResults={handleBuyResults}
          defaultAllSelected={true}
        />
      </div>

      {/* Buy Stocks Column */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.05)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '16px',
        padding: '20px',
        minHeight: '700px'
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#10b981',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '2px solid rgba(16, 185, 129, 0.3)',
          paddingBottom: '12px',
          fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
        }}>
          📋 Buy Stocks ({buyResults.length})
        </div>
        <FilteredStocksDisplay stocks={buyResults} type="buy" />
      </div>

      {/* Sell Filters Column */}
      <div style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '2px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        minHeight: '700px'
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#ef4444',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '2px solid rgba(239, 68, 68, 0.3)',
          paddingBottom: '12px',
          fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
        }}>
          📉 Sell Filters
        </div>
        <FilterPanel 
          type="sell"
          allStocks={allStocks}
          onFilteredResults={handleSellResults}
          defaultAllSelected={true}
        />
      </div>

      {/* Sell Stocks Column */}
      <div style={{
        background: 'rgba(239, 68, 68, 0.05)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '16px',
        padding: '20px',
        minHeight: '700px'
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: '700',
          color: '#ef4444',
          marginBottom: '20px',
          textAlign: 'center',
          borderBottom: '2px solid rgba(239, 68, 68, 0.3)',
          paddingBottom: '12px',
          fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
        }}>
          📋 Sell Stocks ({sellResults.length})
        </div>
        <FilteredStocksDisplay stocks={sellResults} type="sell" />
      </div>
    </div>

    {/* Information Panel */}
    <div style={{
      marginTop: '30px',
      padding: '20px',
      background: 'rgba(59, 130, 246, 0.1)',
      border: '2px solid rgba(59, 130, 246, 0.2)',
      borderRadius: '12px',
      color: '#60a5fa',
      fontSize: '15px',
      textAlign: 'center',
      maxWidth: '1800px',
      margin: '30px auto 0',
      fontFamily: "'Inter', 'System UI', -apple-system, sans-serif"
    }}>
      💡 <strong>Trading Scanner:</strong> Click any stock symbol to open its chart. All filters applied by default for comprehensive analysis.
    </div>
    </div>
  );
});

export default TradingDashboard;


import React, { useState } from 'react';
import FilterPanel from './FilterPanel';
import StockResultsTable from './StockResultsTable';

const TradingDashboard = ({ 
  allStocks = [], 
  onSymbolClick, 
  onOpenChart,
  crossoverBuyStocks = [], 
  crossbelowSellStocks = [] 
}) => {
  const [buyResults, setBuyResults] = useState([]);
  const [sellResults, setSellResults] = useState([]);
  const [crossoverBuySearch, setCrossoverBuySearch] = useState('');
  const [crossbelowSellSearch, setCrossbelowSellSearch] = useState('');

  const handleBuyResults = (results) => {
    setBuyResults(results);
  };

  const handleSellResults = (results) => {
    setSellResults(results);
  };

  // Filter crossover stocks based on search
  const filteredCrossoverBuyStocks = crossoverBuyStocks.filter(stock => 
    stock.symbol?.toLowerCase().includes(crossoverBuySearch.toLowerCase())
  );
  
  const filteredCrossbelowSellStocks = crossbelowSellStocks.filter(stock => 
    stock.symbol?.toLowerCase().includes(crossbelowSellSearch.toLowerCase())
  );

  console.log('📊 TradingDashboard rendered with:', {
    allStocks: allStocks.length,
    buyResults: buyResults.length,
    sellResults: sellResults.length,
    crossoverBuyStocks: crossoverBuyStocks.length,
    filteredCrossoverBuyStocks: filteredCrossoverBuyStocks.length,
    crossbelowSellStocks: crossbelowSellStocks.length,
    filteredCrossbelowSellStocks: filteredCrossbelowSellStocks.length
  });

  return (
    <>
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr 1fr',
      gap: '20px',
      padding: '20px',
      background: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '12px',
      minHeight: '400px'
    }}>
      {/* Buy Filters Column */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.1)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '12px',
        padding: '15px'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#10b981',
          marginBottom: '15px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
          paddingBottom: '10px'
        }}>
          📈 Buy Filters
        </div>
        <FilterPanel 
          type="buy"
          allStocks={allStocks}
          onFilteredResults={handleBuyResults}
        />
      </div>

      {/* Sell Filters Column */}
      <div style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        padding: '15px'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#ef4444',
          marginBottom: '15px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
          paddingBottom: '10px'
        }}>
          📉 Sell Filters
        </div>
        <FilterPanel 
          type="sell"
          allStocks={allStocks}
          onFilteredResults={handleSellResults}
        />
      </div>

      {/* Buy Stocks Column */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.05)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '12px',
        padding: '15px'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#10b981',
          marginBottom: '15px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
          paddingBottom: '10px'
        }}>
          📊 Buy Stocks ({buyResults.length})
        </div>
        <StockResultsTable 
          type="buy"
          stocks={buyResults}
          onSymbolClick={onSymbolClick}
          onOpenChart={onOpenChart}
        />
      </div>

      {/* Sell Stocks Column */}
      <div style={{
        background: 'rgba(239, 68, 68, 0.05)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: '12px',
        padding: '15px'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#ef4444',
          marginBottom: '15px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
          paddingBottom: '10px'
        }}>
          📈 Sell Stocks ({sellResults.length})
        </div>
        <StockResultsTable 
          type="sell"
          stocks={sellResults}
          onSymbolClick={onSymbolClick}
          onOpenChart={onOpenChart}
        />
      </div>
    </div>

    {/* Crossover Stocks Section */}
    {(crossoverBuyStocks.length > 0 || crossbelowSellStocks.length > 0 || crossoverBuySearch || crossbelowSellSearch) && (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        padding: '20px',
        background: 'rgba(255, 165, 0, 0.05)',
        border: '1px solid rgba(255, 165, 0, 0.2)',
        borderRadius: '12px',
        marginTop: '20px'
      }}>
        {/* EMA Crossover Buy Stocks */}
        <div style={{
          background: 'rgba(0, 255, 0, 0.05)',
          border: '1px solid rgba(0, 255, 0, 0.2)',
          borderRadius: '12px',
          padding: '15px'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#22c55e',
            marginBottom: '15px',
            textAlign: 'center',
            borderBottom: '1px solid rgba(0, 255, 0, 0.3)',
            paddingBottom: '10px'
          }}>
            🔄 EMA Crossover Buy ({filteredCrossoverBuyStocks.length}/{crossoverBuyStocks.length})
          </div>
          <div style={{
            fontSize: '12px',
            color: '#888',
            textAlign: 'center',
            marginBottom: '10px',
            fontStyle: 'italic'
          }}>
            EMA3(1min) crosses above EMA5(1min)
          </div>
          {/* Search Input */}
          <div style={{ marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="🔍 Search crossover buy stocks..."
              value={crossoverBuySearch}
              onChange={(e) => setCrossoverBuySearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid rgba(0, 255, 0, 0.3)',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>
          {filteredCrossoverBuyStocks.length > 0 ? (
            <div style={{
              display: 'grid',
              gap: '8px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {filteredCrossoverBuyStocks.map((stock, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: '10px',
                    padding: '8px 12px',
                    background: 'rgba(0, 255, 0, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(0, 255, 0, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 0, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 255, 0, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onClick={() => {
                    console.log('🔄 Crossover buy stock clicked:', stock.symbol, 'onOpenChart available:', !!onOpenChart);
                    if (onOpenChart) {
                      onOpenChart(stock.symbol, 'crossover-buy');
                    } else {
                      console.error('❌ onOpenChart function not available');
                    }
                  }}
                >
                  <div style={{
                    fontWeight: '600',
                    color: '#22c55e',
                    fontSize: '14px'
                  }}>
                    {stock.symbol}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#fff'
                  }}>
                    ₹{stock.ltp?.toFixed(2)}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: stock.change_percent >= 0 ? '#22c55e' : '#ef4444'
                  }}>
                    {stock.change_percent?.toFixed(2)}%
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#888'
                  }}>
                    {stock.volume?.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              color: '#888',
              padding: '20px',
              fontStyle: 'italic'
            }}>
              {crossoverBuyStocks.length === 0 
                ? 'No crossover buy signals' 
                : `No results for "${crossoverBuySearch}"`}
            </div>
          )}
        </div>

        {/* EMA Crossbelow Sell Stocks */}
        <div style={{
          background: 'rgba(255, 0, 0, 0.05)',
          border: '1px solid rgba(255, 0, 0, 0.2)',
          borderRadius: '12px',
          padding: '15px'
        }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#ef4444',
            marginBottom: '15px',
            textAlign: 'center',
            borderBottom: '1px solid rgba(255, 0, 0, 0.3)',
            paddingBottom: '10px'
          }}>
            🔻 EMA Crossbelow Sell ({filteredCrossbelowSellStocks.length}/{crossbelowSellStocks.length})
          </div>
          <div style={{
            fontSize: '12px',
            color: '#888',
            textAlign: 'center',
            marginBottom: '10px',
            fontStyle: 'italic'
          }}>
            EMA3(1min) crosses below EMA5(1min)
          </div>
          {/* Search Input */}
          <div style={{ marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="🔍 Search crossbelow sell stocks..."
              value={crossbelowSellSearch}
              onChange={(e) => setCrossbelowSellSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.3)',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>
          {filteredCrossbelowSellStocks.length > 0 ? (
            <div style={{
              display: 'grid',
              gap: '8px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {filteredCrossbelowSellStocks.map((stock, index) => (
                <div
                  key={index}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: '10px',
                    padding: '8px 12px',
                    background: 'rgba(255, 0, 0, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 0, 0, 0.2)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 0, 0, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onClick={() => {
                    console.log('🔻 Crossbelow sell stock clicked:', stock.symbol, 'onOpenChart available:', !!onOpenChart);
                    if (onOpenChart) {
                      onOpenChart(stock.symbol, 'crossbelow-sell');
                    } else {
                      console.error('❌ onOpenChart function not available');
                    }
                  }}
                >
                  <div style={{
                    fontWeight: '600',
                    color: '#ef4444',
                    fontSize: '14px'
                  }}>
                    {stock.symbol}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#fff'
                  }}>
                    ₹{stock.ltp?.toFixed(2)}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: stock.change_percent >= 0 ? '#22c55e' : '#ef4444'
                  }}>
                    {stock.change_percent?.toFixed(2)}%
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#888'
                  }}>
                    {stock.volume?.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              color: '#888',
              padding: '20px',
              fontStyle: 'italic'
            }}>
              {crossbelowSellStocks.length === 0 
                ? 'No crossbelow sell signals' 
                : `No results for "${crossbelowSellSearch}"`}
            </div>
          )}
        </div>
      </div>
    )}

    {/* Information Panel */}
    {(crossoverBuyStocks.length > 0 || crossbelowSellStocks.length > 0 || crossoverBuySearch || crossbelowSellSearch) && (
      <div style={{
        marginTop: '10px',
        padding: '15px',
        background: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '8px',
        color: '#60a5fa',
        fontSize: '12px',
        textAlign: 'center'
      }}>
        💡 <strong>Intersection Logic:</strong> Final buy/sell stocks above = Primary scan ∩ Crossover scan. 
        Raw crossover stocks shown below for reference. Click any symbol to open chart in new tab.
      </div>
    )}
    </>
  );
};

export default TradingDashboard;


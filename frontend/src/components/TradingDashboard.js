import React from 'react';
import styled from 'styled-components';

const DashboardContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ScannerPanel = styled.div`
  border: 2px solid ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  border-radius: 20px;
  padding: 24px;
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
  transition: all 0.3s ease;
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

  &:hover {
    box-shadow: ${props => props.type === 'buy' 
      ? '0 12px 40px rgba(16, 185, 129, 0.3)' 
      : '0 12px 40px rgba(239, 68, 68, 0.3)'};
    transform: translateY(-2px);
    border-color: ${props => props.type === 'buy' ? '#34d399' : '#f87171'};
  }
`;

const PanelHeader = styled.div`
  text-align: center;
  margin-bottom: 20px;
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
`;

const PanelTitle = styled.h6`
  margin: 0 0 5px 0;
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

const PanelDescription = styled.small`
  font-size: 11px;
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  opacity: 0.9;
  font-weight: 500;
`;

const SignalsTable = styled.div`
  flex: 1;
  overflow-y: auto;
  font-size: 11px;
`;

const SignalItem = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
  align-items: center;
  padding: 16px;
  margin-bottom: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  border-left: 4px solid ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 100%;
    background: ${props => props.type === 'buy' 
      ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.1), transparent)' 
      : 'linear-gradient(90deg, rgba(239, 68, 68, 0.1), transparent)'};
    transition: width 0.3s ease;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateX(8px);
    box-shadow: ${props => props.type === 'buy' 
      ? '0 4px 12px rgba(16, 185, 129, 0.2)' 
      : '0 4px 12px rgba(239, 68, 68, 0.2)'};
    border-color: ${props => props.type === 'buy' ? '#34d399' : '#f87171'};

    &::before {
      width: 100%;
    }
  }
`;

const SymbolInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SymbolName = styled.span`
  font-weight: 600;
  font-size: 14px;
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    text-decoration: underline;
    transform: scale(1.05);
  }
`;

const PriceInfo = styled.span`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
`;

const VolumeInfo = styled.div`
  font-size: 9px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const VolumeRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const VolumeLabel = styled.span`
  color: rgba(255, 255, 255, 0.6);
`;

const VolumeValue = styled.span`
  color: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  font-weight: 600;
`;

const SignalStrength = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`;

const StrengthMeter = styled.div`
  width: 40px;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${props => props.strength || 0}%;
    background: ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
    transition: width 0.5s ease;
  }
`;

const StrengthText = styled.span`
  font-size: 9px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
`;

const SpreadInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`;

const SpreadTitle = styled.span`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
`;

const SpreadValues = styled.div`
  font-size: 9px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  line-height: 1.3;
`;

const SpreadLevel = styled.div`
  color: ${props => props.type === 'buy' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)'};
`;

const EmptyState = styled.div`
  text-align: center;
  color: #666;
  padding: 40px 20px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  &::before {
    content: '📊';
    font-size: 24px;
    opacity: 0.5;
  }
`;

const TradingDashboard = ({ buySignals = [], sellSignals = [], tickData, analysisData, selectedSymbol, onSymbolClick }) => {
  const handleSignalClick = (symbol) => {
    // If onSymbolClick prop is provided, use it (for order book panel)
    if (onSymbolClick) {
      onSymbolClick(symbol);
    } else {
      // Fallback: Open chart for the symbol
      window.open(`https://kite.zerodha.com/chart/ext/NSE:${symbol}`, '_blank');
    }
  };

  // Calculate spread for first 5 levels of order book
  const calculateSpreads = (symbol) => {
    console.log('🔍 calculateSpreads called for symbol:', symbol);
    console.log('🔍 Available tickData keys:', tickData ? Object.keys(tickData) : 'tickData is null/undefined');
    
    // Try multiple symbol formats to find a match
    let symbolTicks = null;
    let matchedSymbol = null;
    
    if (tickData) {
      // Try exact match first
      if (tickData[symbol]) {
        symbolTicks = tickData[symbol];
        matchedSymbol = symbol;
      }
      // Try with NSE: prefix
      else if (tickData[`NSE:${symbol}`]) {
        symbolTicks = tickData[`NSE:${symbol}`];
        matchedSymbol = `NSE:${symbol}`;
      }
      // Try removing NSE: prefix if it exists
      else if (symbol.startsWith('NSE:') && tickData[symbol.replace('NSE:', '')]) {
        symbolTicks = tickData[symbol.replace('NSE:', '')];
        matchedSymbol = symbol.replace('NSE:', '');
      }
      // Try finding a partial match
      else {
        const tickDataKeys = Object.keys(tickData);
        const partialMatch = tickDataKeys.find(key => 
          key.includes(symbol) || symbol.includes(key.replace('NSE:', ''))
        );
        if (partialMatch) {
          symbolTicks = tickData[partialMatch];
          matchedSymbol = partialMatch;
        }
      }
    }
    
    console.log('🔍 Symbol matching result:', {
      originalSymbol: symbol,
      matchedSymbol,
      hasTickData: !!symbolTicks,
      tickCount: symbolTicks ? symbolTicks.length : 0
    });

    if (!symbolTicks || symbolTicks.length === 0) {
      console.log('❌ No tick data found for symbol, returning N/A spreads');
      return Array(5).fill({ spread: 'N/A', level: 0 });
    }

    const latestTick = symbolTicks[symbolTicks.length - 1];
    console.log('🔍 Latest tick data:', latestTick);
    
    if (!latestTick || !latestTick.depth) {
      console.log('❌ No depth data in latest tick, returning N/A spreads');
      return Array(5).fill({ spread: 'N/A', level: 0 });
    }

    const { buy = [], sell = [] } = latestTick.depth;
    console.log('🔍 Order book depth:', {
      buyLevels: buy.length,
      sellLevels: sell.length,
      buy: buy.slice(0, 5),
      sell: sell.slice(0, 5)
    });
    
    const spreads = [];

    for (let i = 0; i < 5; i++) {
      if (buy[i] && sell[i]) {
        const spread = (sell[i].price - buy[i].price).toFixed(2);
        spreads.push({ spread, level: i + 1 });
        console.log(`🔍 L${i + 1} spread: ₹${spread} (Bid: ₹${buy[i].price}, Ask: ₹${sell[i].price})`);
      } else {
        spreads.push({ spread: 'N/A', level: i + 1 });
        console.log(`❌ L${i + 1} missing data (Buy: ${!!buy[i]}, Sell: ${!!sell[i]})`);
      }
    }

    console.log('✅ Final spreads:', spreads);
    return spreads;
  };

  const formatPrice = (price) => {
    return price ? `₹${parseFloat(price).toFixed(2)}` : 'N/A';
  };

  const getSignalStrength = (signal) => {
    // Calculate signal strength based on various factors
    const baseStrength = 60;
    const volumeBonus = signal.volume > 100000 ? 20 : 10;
    const priceBonus = signal.change_percent > 2 ? 15 : 5;
    return Math.min(baseStrength + volumeBonus + priceBonus, 100);
  };

  return (
    <DashboardContainer>
      {/* Buy Scanner Panel */}
      <ScannerPanel type="buy">
        <PanelHeader type="buy">
          <PanelTitle type="buy">
            📈 Buy Scanner
            <SignalBadge type="buy">{buySignals.length}</SignalBadge>
          </PanelTitle>
          <PanelDescription type="buy">
            1min close crosses above EMA5(5min)
          </PanelDescription>
        </PanelHeader>

        <SignalsTable>
          {buySignals.length > 0 ? (
            buySignals.map((signal, index) => {
              const spreads = calculateSpreads(signal.symbol);
              return (
                <SignalItem 
                  key={`${signal.symbol}-${index}`}
                  type="buy"
                  onClick={() => handleSignalClick(signal.symbol)}
                >
                  <SymbolInfo>
                    <SymbolName type="buy">{signal.symbol}</SymbolName>
                    <PriceInfo>
                      {formatPrice(signal.ltp)} ({signal.change_percent > 0 ? '+' : ''}{signal.change_percent?.toFixed(2)}%)
                    </PriceInfo>
                    <VolumeInfo>
                      <VolumeRow>
                        <VolumeLabel>Current Vol:</VolumeLabel>
                        <VolumeValue type="buy">
                          {signal.volume ? signal.volume.toLocaleString() : 'N/A'}
                        </VolumeValue>
                      </VolumeRow>
                    </VolumeInfo>
                  </SymbolInfo>
                  
                  <SpreadInfo>
                    <SpreadTitle>Spreads L1-L5</SpreadTitle>
                    <SpreadValues>
                      {spreads.slice(0, 5).map((s, i) => (
                        <SpreadLevel key={i} type="buy">
                          L{s.level}: {s.spread}
                        </SpreadLevel>
                      ))}
                    </SpreadValues>
                  </SpreadInfo>
                </SignalItem>
              );
            })
          ) : (
            <EmptyState>
              Start polling to see buy signals...
            </EmptyState>
          )}
        </SignalsTable>
      </ScannerPanel>

      {/* Sell Scanner Panel */}
      <ScannerPanel type="sell">
        <PanelHeader type="sell">
          <PanelTitle type="sell">
            📉 Sell Scanner
            <SignalBadge type="sell">{sellSignals.length}</SignalBadge>
          </PanelTitle>
          <PanelDescription type="sell">
            1min close crosses below EMA5(5min)
          </PanelDescription>
        </PanelHeader>

        <SignalsTable>
          {sellSignals.length > 0 ? (
            sellSignals.map((signal, index) => {
              const spreads = calculateSpreads(signal.symbol);
              return (
                <SignalItem 
                  key={`${signal.symbol}-${index}`}
                  type="sell"
                  onClick={() => handleSignalClick(signal.symbol)}
                >
                  <SymbolInfo>
                    <SymbolName type="sell">{signal.symbol}</SymbolName>
                    <PriceInfo>
                      {formatPrice(signal.ltp)} ({signal.change_percent > 0 ? '+' : ''}{signal.change_percent?.toFixed(2)}%)
                    </PriceInfo>
                    <VolumeInfo>
                      <VolumeRow>
                        <VolumeLabel>Current Vol:</VolumeLabel>
                        <VolumeValue type="sell">
                          {signal.volume ? signal.volume.toLocaleString() : 'N/A'}
                        </VolumeValue>
                      </VolumeRow>
                    </VolumeInfo>
                  </SymbolInfo>
                  
                  <SpreadInfo>
                    <SpreadTitle>Spreads L1-L5</SpreadTitle>
                    <SpreadValues>
                      {spreads.slice(0, 5).map((s, i) => (
                        <SpreadLevel key={i} type="sell">
                          L{s.level}: {s.spread}
                        </SpreadLevel>
                      ))}
                    </SpreadValues>
                  </SpreadInfo>
                </SignalItem>
              );
            })
          ) : (
            <EmptyState>
              Start polling to see sell signals...
            </EmptyState>
          )}
        </SignalsTable>
      </ScannerPanel>
    </DashboardContainer>
  );
};

export default TradingDashboard;
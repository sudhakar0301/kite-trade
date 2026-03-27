import React from 'react';
import styled, { keyframes } from 'styled-components';

const glow = keyframes`
  0%, 100% { box-shadow: 0 4px 15px rgba(79, 172, 254, 0.3); }
  50% { box-shadow: 0 4px 25px rgba(79, 172, 254, 0.6); }
`;

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
    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)'
    : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)'};
  backdrop-filter: blur(20px);
  height: 500px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  &:hover {
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  border-left: 4px solid ${props => props.type === 'buy' ? '#10b981' : '#ef4444'};
  transition: all 0.3s ease;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: translateX(8px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
`;

const PriceInfo = styled.span`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
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

const TradingDashboard = ({ buySignals = [], sellSignals = [], tickData, analysisData, selectedSymbol }) => {
  const handleSignalClick = (symbol) => {
    // Open chart for the symbol
    window.open(`https://kite.zerodha.com/chart/ext/NSE:${symbol}`, '_blank');
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
            buySignals.map((signal, index) => (
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
                </SymbolInfo>
                
                <SignalStrength>
                  <StrengthMeter type="buy" strength={getSignalStrength(signal)} />
                  <StrengthText>{getSignalStrength(signal)}%</StrengthText>
                </SignalStrength>
              </SignalItem>
            ))
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
            sellSignals.map((signal, index) => (
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
                </SymbolInfo>
                
                <SignalStrength>
                  <StrengthMeter type="sell" strength={getSignalStrength(signal)} />
                  <StrengthText>{getSignalStrength(signal)}%</StrengthText>
                </SignalStrength>
              </SignalItem>
            ))
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
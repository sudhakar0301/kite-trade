import React, { useState, useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

const pulseAnimation = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
`;

const slideIn = keyframes`
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const VisualizerContainer = styled.div`
  background: rgba(0, 0, 0, 0.9);
  border-radius: 8px;
  padding: 15px;
  margin-top: 20px;
  border: 1px solid #30363d;
`;

const SectionTitle = styled.h4`
  color: #79c0ff;
  font-size: 13px;
  margin: 0 0 15px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #30363d;
`;

const TradeTape = styled.div`
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 20px;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(139, 148, 158, 0.3);
    border-radius: 2px;
  }
`;

const TradeItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  margin-bottom: 4px;
  background: ${props => props.side === 'BUY' ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)'};
  border-left: 3px solid ${props => props.side === 'BUY' ? '#3fb950' : '#f85149'};
  border-radius: 4px;
  font-size: 10px;
  animation: ${slideIn} 0.3s ease-out;
  
  &.flash {
    animation: ${pulseAnimation} 0.5s ease-in-out;
  }
`;

const TradeTime = styled.span`
  color: #8b949e;
  font-size: 9px;
  min-width: 50px;
`;

const TradePrice = styled.span`
  color: ${props => props.side === 'BUY' ? '#3fb950' : '#f85149'};
  font-weight: 600;
  font-family: monospace;
`;

const TradeSize = styled.span`
  color: #79c0ff;
  font-family: monospace;
`;

const TradeSide = styled.span`
  color: ${props => props.side === 'BUY' ? '#3fb950' : '#f85149'};
  font-weight: bold;
  font-size: 9px;
  min-width: 30px;
`;

const VolumeProfile = styled.div`
  background: rgba(30, 60, 114, 0.1);
  border-radius: 6px;
  padding: 10px;
`;

const VolumeBar = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 3px;
  font-size: 9px;
`;

const VolumePrice = styled.span`
  color: #e6edf3;
  width: 60px;
  font-family: monospace;
`;

const VolumeBarFill = styled.div`
  height: 12px;
  background: linear-gradient(90deg, 
    ${props => props.side === 'BUY' ? 'rgba(63, 185, 80, 0.6)' : 'rgba(248, 81, 73, 0.6)'}, 
    ${props => props.side === 'BUY' ? 'rgba(63, 185, 80, 0.2)' : 'rgba(248, 81, 73, 0.2)'}
  );
  border-radius: 2px;
  width: ${props => props.width}%;
  transition: width 0.3s ease;
  margin: 0 8px;
`;

const VolumeAmount = styled.span`
  color: #79c0ff;
  font-family: monospace;
  font-size: 8px;
`;

const OrderFlowVisualizer = ({ symbol, tickData, isOpen }) => {
  const [recentTrades, setRecentTrades] = useState([]);
  const [volumeProfile, setVolumeProfile] = useState([]);
  const tradeIdRef = useRef(0);

  // Simulate order execution based on tick data changes
  useEffect(() => {
    if (!isOpen || !symbol || !tickData || !tickData[symbol]) return;

    const currentTick = tickData[symbol][0];
    if (!currentTick) return;

    // Simulate trade execution when price changes
    const prevTick = tickData[symbol][1];
    if (prevTick && currentTick.last_price !== prevTick.last_price) {
      const side = currentTick.last_price > prevTick.last_price ? 'BUY' : 'SELL';
      const size = Math.floor(Math.random() * 500) + 100; // Random trade size
      const priceImpact = Math.abs(currentTick.last_price - prevTick.last_price);
      
      const newTrade = {
        id: tradeIdRef.current++,
        time: new Date().toLocaleTimeString(),
        price: currentTick.last_price,
        size: size,
        side: side,
        priceImpact: priceImpact.toFixed(2)
      };

      setRecentTrades(prev => [newTrade, ...prev].slice(0, 20)); // Keep last 20 trades
      
      // Update volume profile
      updateVolumeProfile(currentTick.last_price, size, side);
    }
  }, [tickData, symbol, isOpen]);

  const updateVolumeProfile = (price, size, side) => {
    const priceLevel = Math.floor(price * 10) / 10; // Round to nearest 0.1
    
    setVolumeProfile(prev => {
      const existing = prev.find(item => item.price === priceLevel);
      if (existing) {
        return prev.map(item => 
          item.price === priceLevel 
            ? { 
                ...item, 
                volume: item.volume + size,
                [side.toLowerCase() + 'Volume']: (item[side.toLowerCase() + 'Volume'] || 0) + size
              }
            : item
        );
      } else {
        const newItem = {
          price: priceLevel,
          volume: size,
          side: side,
          [`${side.toLowerCase()}Volume`]: size
        };
        return [...prev, newItem].sort((a, b) => b.price - a.price).slice(0, 10);
      }
    });
  };

  if (!isOpen || !symbol) return null;

  const maxVolume = Math.max(...volumeProfile.map(item => item.volume), 1);

  return (
    <VisualizerContainer>
      <SectionTitle>📈 Order Flow & Execution</SectionTitle>
      
      {/* Recent Trades/Executions */}
      <div style={{ marginBottom: '20px' }}>
        <h5 style={{ color: '#79c0ff', fontSize: '11px', margin: '0 0 8px 0' }}>
          🕒 Recent Executions
        </h5>
        <TradeTape>
          {recentTrades.length > 0 ? (
            recentTrades.map(trade => (
              <TradeItem key={trade.id} side={trade.side}>
                <TradeTime>{trade.time}</TradeTime>
                <TradePrice side={trade.side}>₹{trade.price.toFixed(2)}</TradePrice>
                <TradeSize>{trade.size.toLocaleString()}</TradeSize>
                <TradeSide side={trade.side}>{trade.side}</TradeSide>
              </TradeItem>
            ))
          ) : (
            <div style={{ 
              textAlign: 'center', 
              color: '#8b949e', 
              padding: '20px',
              fontSize: '10px'
            }}>
              📊 Waiting for trade executions...
            </div>
          )}
        </TradeTape>
      </div>

      {/* Volume Profile */}
      <div>
        <h5 style={{ color: '#79c0ff', fontSize: '11px', margin: '0 0 8px 0' }}>
          📊 Volume Profile
        </h5>
        <VolumeProfile>
          {volumeProfile.length > 0 ? (
            volumeProfile.map(item => (
              <VolumeBar key={item.price}>
                <VolumePrice>₹{item.price.toFixed(1)}</VolumePrice>
                <VolumeBarFill 
                  side={item.side}
                  width={(item.volume / maxVolume) * 100}
                />
                <VolumeAmount>{item.volume.toLocaleString()}</VolumeAmount>
              </VolumeBar>
            ))
          ) : (
            <div style={{ 
              textAlign: 'center', 
              color: '#8b949e', 
              padding: '15px',
              fontSize: '9px'
            }}>
              📈 Volume profile will build as trades execute
            </div>
          )}
        </VolumeProfile>
      </div>

      {/* Execution Stats */}
      {recentTrades.length > 0 && (
        <div style={{
          marginTop: '15px',
          padding: '8px',
          background: 'rgba(30, 60, 114, 0.15)',
          borderRadius: '4px',
          fontSize: '10px'
        }}>
          <div style={{ color: '#79c0ff', marginBottom: '4px' }}>📋 Session Stats:</div>
          <div style={{ color: '#e6edf3' }}>
            Total Executions: {recentTrades.length} | 
            Avg Size: {Math.round(recentTrades.reduce((sum, trade) => sum + trade.size, 0) / recentTrades.length).toLocaleString()}
          </div>
        </div>
      )}
    </VisualizerContainer>
  );
};

export default OrderFlowVisualizer;
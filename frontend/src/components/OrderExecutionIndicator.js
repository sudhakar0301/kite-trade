import React, { useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';

const executeFlash = keyframes`
  0% { background: rgba(255, 215, 0, 0.8); }
  50% { background: rgba(255, 215, 0, 0.4); }
  100% { background: transparent; }
`;

const volumePulse = keyframes`
  0% { transform: scaleX(1); opacity: 1; }
  50% { transform: scaleX(1.2); opacity: 0.7; }
  100% { transform: scaleX(1); opacity: 1; }
`;

const IndicatorContainer = styled.div`
  position: relative;
  background: rgba(0, 0, 0, 0.9);
  border-radius: 8px;
  padding: 12px;
  margin-top: 15px;
  border: 1px solid #30363d;
  overflow: hidden;
`;

const LiveIndicator = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 8px;
  font-size: 11px;
  background: rgba(30, 60, 114, 0.15);
  border-radius: 6px;
`;

const StatusDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props => props.active ? '#3fb950' : '#8b949e'};
  animation: ${props => props.active ? 'blink 1s infinite' : 'none'};
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0.3; }
  }
`;

const ExecutionFlow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const FlowMeter = styled.div`
  flex: 1;
  margin: 0 5px;
`;

const FlowLabel = styled.div`
  font-size: 9px;
  color: #8b949e;
  margin-bottom: 4px;
  text-align: center;
`;

const FlowBar = styled.div`
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
`;

const FlowFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, 
    ${props => props.type === 'buy' ? '#3fb950' : props.type === 'sell' ? '#f85149' : '#79c0ff'}, 
    ${props => props.type === 'buy' ? '#10b981' : props.type === 'sell' ? '#ef4444' : '#58a6ff'}
  );
  width: ${props => props.intensity}%;
  transition: width 0.5s ease;
  ${props => props.executing ? css`animation: ${volumePulse} 1s infinite;` : css`animation: none;`}
`;

const PriceAction = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: rgba(255, 215, 0, 0.1);
  border-radius: 6px;
  font-family: monospace;
  ${props => props.flashing ? css`animation: ${executeFlash} 2s ease-out;` : ''}
`;

const PriceDisplay = styled.span`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.direction === 'up' ? '#3fb950' : props.direction === 'down' ? '#f85149' : '#ffd700'};
  margin: 0 5px;
`;

const PriceChange = styled.span`
  font-size: 12px;
  color: ${props => props.direction === 'up' ? '#3fb950' : '#f85149'};
  margin-left: 8px;
`;

const OrderExecutionIndicator = ({ symbol, tickData, isOpen }) => {
  const [executionState, setExecutionState] = useState({
    isExecuting: false,
    buyIntensity: 30,
    sellIntensity: 30,
    marketIntensity: 20,
    lastPrice: 0,
    priceDirection: 'neutral',
    isFlashing: false
  });

  useEffect(() => {
    if (!isOpen || !symbol || !tickData || !tickData[symbol]) return;

    const currentTick = tickData[symbol][0];
    const previousTick = tickData[symbol][1];
    
    if (!currentTick) return;

    // Simulate execution activity based on tick data
    const simulateExecution = () => {
      if (previousTick && currentTick.last_price !== previousTick.last_price) {
        const priceChange = currentTick.last_price - previousTick.last_price;
        const direction = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral';
        
        // Calculate intensities based on volume and price movement
        const volumeFactor = Math.min(currentTick.volume / 100000, 1) * 100;
        const priceFactor = Math.abs(priceChange) * 20;
        
        setExecutionState(prev => ({
          ...prev,
          isExecuting: true,
          buyIntensity: direction === 'up' ? Math.min(60 + priceFactor, 100) : Math.max(30 - priceFactor, 10),
          sellIntensity: direction === 'down' ? Math.min(60 + priceFactor, 100) : Math.max(30 - priceFactor, 10),
          marketIntensity: Math.min(volumeFactor, 80),
          lastPrice: currentTick.last_price,
          priceDirection: direction,
          isFlashing: true
        }));

        // Stop execution animation after 2 seconds
        setTimeout(() => {
          setExecutionState(prev => ({
            ...prev,
            isExecuting: false,
            isFlashing: false
          }));
        }, 2000);
      } else {
        // Gradual cooldown when no price movement
        setExecutionState(prev => ({
          ...prev,
          buyIntensity: Math.max(prev.buyIntensity * 0.95, 20),
          sellIntensity: Math.max(prev.sellIntensity * 0.95, 20),
          marketIntensity: Math.max(prev.marketIntensity * 0.98, 15),
          lastPrice: currentTick.last_price,
          priceDirection: 'neutral'
        }));
      }
    };

    simulateExecution();
  }, [tickData, symbol, isOpen]);

  if (!isOpen || !symbol) return null;

  const currentTick = tickData[symbol]?.[0];
  const previousTick = tickData[symbol]?.[1];
  const priceChange = currentTick && previousTick ? currentTick.last_price - previousTick.last_price : 0;

  return (
    <IndicatorContainer>
      {/* Live Status */}
      <LiveIndicator>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <StatusDot active={executionState.isExecuting} />
          <span style={{ color: '#79c0ff', fontSize: '10px' }}>
            {executionState.isExecuting ? 'EXECUTING' : 'MONITORING'}
          </span>
        </div>
        <div style={{ color: '#ffd700', fontSize: '10px' }}>
          {symbol} Live Order Flow
        </div>
      </LiveIndicator>

      {/* Execution Flow Meters */}
      <ExecutionFlow>
        <FlowMeter>
          <FlowLabel>BUY PRESSURE</FlowLabel>
          <FlowBar>
            <FlowFill 
              type="buy" 
              intensity={executionState.buyIntensity} 
              executing={executionState.isExecuting && executionState.priceDirection === 'up'}
            />
          </FlowBar>
        </FlowMeter>

        <FlowMeter>
          <FlowLabel>MARKET FLOW</FlowLabel>
          <FlowBar>
            <FlowFill 
              type="market" 
              intensity={executionState.marketIntensity}
              executing={executionState.isExecuting}
            />
          </FlowBar>
        </FlowMeter>

        <FlowMeter>
          <FlowLabel>SELL PRESSURE</FlowLabel>
          <FlowBar>
            <FlowFill 
              type="sell" 
              intensity={executionState.sellIntensity}
              executing={executionState.isExecuting && executionState.priceDirection === 'down'}
            />
          </FlowBar>
        </FlowMeter>
      </ExecutionFlow>

      {/* Real-time Price Action */}
      <PriceAction flashing={executionState.isFlashing}>
        <span style={{ color: '#8b949e', fontSize: '12px' }}>LAST:</span>
        <PriceDisplay direction={executionState.priceDirection}>
          ₹{executionState.lastPrice.toFixed(2)}
        </PriceDisplay>
        {priceChange !== 0 && (
          <PriceChange direction={priceChange > 0 ? 'up' : 'down'}>
            {priceChange > 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}
          </PriceChange>
        )}
      </PriceAction>

      {/* Execution Stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '8px',
        fontSize: '9px',
        color: '#8b949e'
      }}>
        <span>Volume: {currentTick?.volume?.toLocaleString() || 'N/A'}</span>
        <span>Regime: {currentTick?.regime || 'UNKNOWN'}</span>
        <span>Updated: {new Date().toLocaleTimeString()}</span>
      </div>
    </IndicatorContainer>
  );
};

export default OrderExecutionIndicator;
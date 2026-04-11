import React, { useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import OrderFlowVisualizer from './OrderFlowVisualizer';
import OrderExecutionIndicator from './OrderExecutionIndicator';

const executeFlash = keyframes`
  0% { background: rgba(255, 215, 0, 0.5) !important; }
  100% { background: transparent !important; }
`;

const shimmer = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

const OrderRow = styled.tr`
  &:hover {
    background: rgba(30, 60, 114, 0.15);
  }
  
  ${props => props.executing && css`
    animation: ${executeFlash} 1s ease-out;
  `}
  
  ${props => props.masked && css`
    opacity: ${props.impactOpacity || 0.1} !important;
    background: red !important;
    border: 5px solid yellow !important;
    color: white !important;
    position: relative;
    
    &::after {
      content: '🔥 MASKED 🔥';
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      opacity: 1;
      font-size: 14px;
      color: yellow;
      font-weight: bold;
    }
  `}
`;

const PanelOverlay = styled.div`
  position: fixed;
  top: 0;
  right: ${props => props.isOpen ? '0' : '-400px'};
  width: 400px;
  height: 100vh;
  background: rgba(0, 0, 0, 0.95);
  backdrop-filter: blur(20px);
  border-left: 1px solid #333;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
  transition: right 0.4s ease;
  z-index: 15000;
  overflow-y: auto;
`;

const PanelHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 20px;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #333;
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.05);
  }
`;

const OrderBookContainer = styled.div`
  padding: 20px;
  color: #e6edf3;
`;

const OrderBookSection = styled.div`
  margin-bottom: 30px;
`;

const SectionTitle = styled.h3`
  color: #79c0ff;
  font-size: 14px;
  margin: 0 0 15px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #30363d;
`;

const OrderTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: 11px;
`;

const OrderHeader = styled.th`
  padding: 8px 4px;
  text-align: ${props => props.align || 'right'};
  font-weight: 600;
  color: #8b949e;
  border-bottom: 1px solid #30363d;
  font-size: 10px;
`;

const OrderCell = styled.td`
  padding: 6px 4px;
  text-align: ${props => props.align || 'right'};
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);
  font-size: 10px;
  
  &.price-bid { color: #3fb950; font-weight: 600; }
  &.price-ask { color: #f85149; font-weight: 600; }
  &.quantity { color: #79c0ff; }
`;

const SymbolInfo = styled.div`
  background: rgba(30, 60, 114, 0.2);
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const InfoLabel = styled.span`
  color: #8b949e;
  font-size: 11px;
`;

const InfoValue = styled.span`
  color: #ffd700;
  font-weight: 600;
  font-size: 12px;
`;

const SpreadInfo = styled.div`
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 6px;
  padding: 10px;
  margin: 15px 0;
  text-align: center;
`;

const OrderBookPanel = ({ isOpen, symbol, tickData, onClose }) => {
  const [executingRows, setExecutingRows] = useState(new Set());
  
  // Track price changes for execution animation - moved to top before any returns
  useEffect(() => {
    if (!isOpen || !symbol || !tickData) return;
    
    const currentTick = tickData[symbol]?.[0];
    const previousTick = tickData[symbol]?.[1];
    
    if (!currentTick || !previousTick) return;
    
    if (currentTick.last_price !== previousTick.last_price) {
      // Animate rows near the executed price
      const executedPrice = currentTick.last_price;
      const priceRange = Math.abs(currentTick.last_price - previousTick.last_price) * 2;
      
      const bidOrders = currentTick.depth?.buy || [];
      const askOrders = currentTick.depth?.sell || [];
      const newExecutingRows = new Set();
      
      // Find bid orders near execution price
      bidOrders.forEach((order, index) => {
        if (Math.abs(order.price - executedPrice) <= priceRange) {
          newExecutingRows.add(`bid-${index}`);
        }
      });
      
      // Find ask orders near execution price
      askOrders.forEach((order, index) => {
        if (Math.abs(order.price - executedPrice) <= priceRange) {
          newExecutingRows.add(`ask-${index}`);
        }
      });
      
      setExecutingRows(newExecutingRows);
      
      // Clear animations after 1.5 seconds
      setTimeout(() => setExecutingRows(new Set()), 1500);
    }
  }, [isOpen, symbol, tickData]);
  
  if (!isOpen || !symbol || !tickData) return null;

  const currentTick = tickData[symbol]?.[0];
  
  if (!currentTick) return null;

  const bidOrders = currentTick.depth?.buy || [];
  const askOrders = currentTick.depth?.sell || [];
  
  console.log('📊 FRONTEND: OrderBook Debug:', {
    symbol: symbol,
    bidLevels: bidOrders.length,
    askLevels: askOrders.length,
    firstFiveBidQty: bidOrders.slice(0, 5).reduce((sum, order) => sum + order.quantity, 0),
    firstFiveAskQty: askOrders.slice(0, 5).reduce((sum, order) => sum + order.quantity, 0),
    fullBidQty: bidOrders.reduce((sum, order) => sum + order.quantity, 0),
    fullAskQty: askOrders.reduce((sum, order) => sum + order.quantity, 0),
    bidSample: bidOrders.slice(0, 3),
    askSample: askOrders.slice(0, 3),
    marketImpact: currentTick.depth?.marketImpact,
    maskedBidLevels: bidOrders.filter(order => order.masked).length,
    maskedAskLevels: askOrders.filter(order => order.masked).length,
    scanType: currentTick.scan_type,
    liveTrackerMasking: currentTick.liveTrackerMasking,
    hasLiveTrackerMasking: !!currentTick.liveTrackerMasking,
    tickKeys: Object.keys(currentTick),
    depthKeys: currentTick.depth ? Object.keys(currentTick.depth) : 'no depth'
  });
  
  // Additional debug for masking properties
  console.log('🔍 FRONTEND MASKING DEBUG:', {
    symbol,
    currentTick: currentTick ? Object.keys(currentTick) : 'No tick data',
    hasDepth: !!currentTick?.depth,
    depthBuyLength: currentTick?.depth?.buy?.length || 0,
    depthSellLength: currentTick?.depth?.sell?.length || 0,
    sampleBuyOrder: currentTick?.depth?.buy?.[0] || 'No buy data',
    sampleSellOrder: currentTick?.depth?.sell?.[0] || 'No sell data',
    liveTrackerMasking: currentTick?.liveTrackerMasking,
    marketImpact: currentTick?.depth?.marketImpact,
    bidOrdersSample: bidOrders?.slice(0, 3),
    askOrdersSample: askOrders?.slice(0, 3)
  });
  
  if (bidOrders.some(order => order.masked) || askOrders.some(order => order.masked)) {
    console.log('🎯 MASKING DETECTED:', {
      symbol,
      maskedBids: bidOrders.filter(order => order.masked).map(order => ({ 
        level: order.level, 
        masked: order.masked, 
        impactOpacity: order.impactOpacity,
        price: order.price,
        quantity: order.quantity
      })),
      maskedAsks: askOrders.filter(order => order.masked).map(order => ({ 
        level: order.level, 
        masked: order.masked, 
        impactOpacity: order.impactOpacity,
        price: order.price,
        quantity: order.quantity
      }))
    });
  } else {
    console.log('❌ NO MASKING FOUND:', {
      symbol,
      bidCount: bidOrders?.length,
      askCount: askOrders?.length,
      bidHasMaskedProp: bidOrders?.[0]?.hasOwnProperty('masked'),
      askHasMaskedProp: askOrders?.[0]?.hasOwnProperty('masked')
    });
  }
  
  const bestBid = bidOrders[0]?.price || 0;
  const bestAsk = askOrders[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const spreadPercent = bestBid > 0 ? ((spread / bestBid) * 100).toFixed(3) : 0;

  const totalBidQty = bidOrders.reduce((sum, order) => sum + order.quantity, 0);
  const totalAskQty = askOrders.reduce((sum, order) => sum + order.quantity, 0);

  return (
    <PanelOverlay isOpen={isOpen}>
      <PanelHeader>
        <span>📊 Order Book: {symbol}</span>
        <CloseButton onClick={onClose}>✕</CloseButton>
      </PanelHeader>
      
      <OrderBookContainer>
        <SymbolInfo>
          <InfoRow>
            <InfoLabel>Last Traded Price:</InfoLabel>
            <InfoValue>₹{currentTick.last_price.toFixed(2)}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>Volume:</InfoLabel>
            <InfoValue>{currentTick.volume?.toLocaleString() || 'N/A'}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>Regime:</InfoLabel>
            <InfoValue>{currentTick.regime || 'UNKNOWN'}</InfoValue>
          </InfoRow>
          <InfoRow>
            <InfoLabel>Timestamp:</InfoLabel>
            <InfoValue>{new Date(currentTick.timestamp).toLocaleTimeString()}</InfoValue>
          </InfoRow>
        </SymbolInfo>

        <SpreadInfo>
          <strong>Bid-Ask Spread: ₹{spread.toFixed(2)} ({spreadPercent}%)</strong>
        </SpreadInfo>

        {/* Live Tracker Masking Indicator */}
        {currentTick.liveTrackerMasking && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.1))',
            border: '2px solid rgba(255, 215, 0, 0.6)',
            borderRadius: '10px',
            padding: '16px',
            margin: '15px 0',
            fontSize: '12px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ 
              color: '#ffd700', 
              fontWeight: 'bold', 
              marginBottom: '8px',
              fontSize: '14px',
              textShadow: '0 0 10px rgba(255, 215, 0, 0.3)'
            }}>
              🎯 LIVE TRACKER MASKING ACTIVE
            </div>
            <div style={{ color: '#e6edf3', lineHeight: '1.4' }}>
              This symbol is currently displayed in the Live Tracker.<br/>
              <span style={{color: '#79c0ff'}}>Market impact visualization shows ₹490,000 order effects.</span>
            </div>
            <div style={{ 
              position: 'absolute',
              top: '0',
              left: '0',
              right: '0',
              bottom: '0',
              background: 'linear-gradient(45deg, transparent 40%, rgba(255, 215, 0, 0.05) 50%, transparent 60%)',
              animation: 'shimmer 3s ease-in-out infinite'
            }} />
          </div>
        )}

        {/* Market Impact Visualization */}
        {currentTick.depth?.marketImpact && !currentTick.liveTrackerMasking && (
          <div style={{
            background: 'rgba(255, 215, 0, 0.1)',
            border: '1px solid rgba(255, 215, 0, 0.4)',
            borderRadius: '8px',
            padding: '12px',
            margin: '15px 0',
            fontSize: '11px'
          }}>
            <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>
              💰 Market Impact Analysis (₹490,000 Order)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: '#e6edf3' }}>
              <div>Order Type: <span style={{color: '#79c0ff'}}>{currentTick.depth.marketImpact.orderType}</span></div>
              <div>Quantity: <span style={{color: '#79c0ff'}}>{currentTick.depth.marketImpact.quantity?.toLocaleString()}</span></div>
              <div>Levels Impacted: <span style={{color: '#f85149'}}>{currentTick.depth.marketImpact.impactedLevels}</span></div>
              <div>Avg Price: <span style={{color: '#3fb950'}}>₹{currentTick.depth.marketImpact.avgExecutionPrice?.toFixed(2)}</span></div>
              <div style={{gridColumn: '1 / -1', textAlign: 'center', marginTop: '4px'}}>
                Slippage: <span style={{color: currentTick.depth.marketImpact.totalSlippage > 0 ? '#f85149' : '#3fb950'}}>
                  {currentTick.depth.marketImpact.totalSlippage?.toFixed(3)}%
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', color: '#8b949e', fontSize: '10px' }}>
              💡 Transparent rows show levels consumed by this order
            </div>
          </div>
        )}

        {/* Real-time Order Execution Indicator */}
        <OrderExecutionIndicator 
          symbol={symbol}
          tickData={tickData}
          isOpen={isOpen}
        />

        <OrderBookSection>
          <SectionTitle>🟢 BID ORDERS (Buy) - Total: {totalBidQty.toLocaleString()} (Top 20)</SectionTitle>
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #30363d', borderRadius: '4px' }}>
            <OrderTable>
            <thead>
              <tr>
                <OrderHeader align="right">Price</OrderHeader>
                <OrderHeader align="right">Quantity</OrderHeader>
                <OrderHeader align="right">Total</OrderHeader>
              </tr>
            </thead>
            <tbody>
              {bidOrders.slice(0, 20).map((order, index) => (
                <OrderRow 
                  key={index} 
                  executing={executingRows.has(`bid-${index}`)}
                  masked={order.masked || false}
                  impactOpacity={order.impactOpacity || 1.0}
                >
                  <OrderCell className="price-bid">₹{order.price.toFixed(2)}</OrderCell>
                  <OrderCell className="quantity">{order.quantity.toLocaleString()}</OrderCell>
                  <OrderCell className="quantity">₹{(order.price * order.quantity).toLocaleString()}</OrderCell>
                </OrderRow>
              ))}
            </tbody>
          </OrderTable>
          </div>
        </OrderBookSection>

        <OrderBookSection>
          <SectionTitle>🔴 ASK ORDERS (Sell) - Total: {totalAskQty.toLocaleString()} (Top 20)</SectionTitle>
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #30363d', borderRadius: '4px' }}>
            <OrderTable>
            <thead>
              <tr>
                <OrderHeader align="right">Price</OrderHeader>
                <OrderHeader align="right">Quantity</OrderHeader>
                <OrderHeader align="right">Total</OrderHeader>
              </tr>
            </thead>
            <tbody>
              {askOrders.slice(0, 20).map((order, index) => (
                <OrderRow 
                  key={index} 
                  executing={executingRows.has(`ask-${index}`)}
                  masked={order.masked || false}
                  impactOpacity={order.impactOpacity || 1.0}
                >
                  <OrderCell className="price-ask">₹{order.price.toFixed(2)}</OrderCell>
                  <OrderCell className="quantity">{order.quantity.toLocaleString()}</OrderCell>
                  <OrderCell className="quantity">₹{(order.price * order.quantity).toLocaleString()}</OrderCell>
                </OrderRow>
              ))}
            </tbody>
          </OrderTable>
          </div>
        </OrderBookSection>

        {bidOrders.length === 0 && askOrders.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#8b949e', 
            padding: '40px 20px',
            fontStyle: 'italic'
          }}>
            📭 No order book data available for {symbol}
          </div>
        )}

        {/* Order Flow Visualization */}
        <OrderFlowVisualizer 
          symbol={symbol}
          tickData={tickData}
          isOpen={isOpen}
        />
      </OrderBookContainer>
    </PanelOverlay>
  );
};

export default OrderBookPanel;
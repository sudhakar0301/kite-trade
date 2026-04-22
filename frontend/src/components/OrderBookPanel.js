import React from 'react';
import styled, { css } from 'styled-components';

const OrderRow = styled.tr`
  &:hover {
    background: rgba(30, 60, 114, 0.15);
  }
  
  ${props => props.masked && css`
    background: rgba(255, 107, 107, 0.2) !important;
    border-left: 4px solid rgba(239, 68, 68, 0.8) !important;
    opacity: 0.7 !important;
    
    &:hover {
      background: rgba(255, 107, 107, 0.3) !important;
      opacity: 0.8 !important;
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
  
  /* Large desktop */
  @media (max-width: 1600px) {
    width: 380px;
    right: ${props => props.isOpen ? '0' : '-380px'};
  }
  
  /* Standard laptop */
  @media (max-width: 1400px) {
    width: 360px;
    right: ${props => props.isOpen ? '0' : '-360px'};
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    width: 340px;
    right: ${props => props.isOpen ? '0' : '-340px'};
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    width: 320px;
    right: ${props => props.isOpen ? '0' : '-320px'};
  }
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
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    padding: 16px;
    font-size: 15px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    padding: 14px;
    font-size: 14px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    padding: 12px;
    font-size: 13px;
  }
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
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    padding: 16px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    padding: 14px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    padding: 12px;
  }
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
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    font-size: 10px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    font-size: 9px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    font-size: 8px;
  }
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

const OrderBookPanel = ({ isOpen, symbol, tickData, onClose }) => {
  if (!isOpen || !symbol || !tickData) return null;

  // Helper function to extract symbol name from exchange:symbol format
  const extractSymbolName = (fullSymbol) => {
    if (typeof fullSymbol === 'string' && fullSymbol.includes(':')) {
      return fullSymbol.split(':')[1];
    }
    return fullSymbol;
  };

  // Extract symbol name for tickData lookup
  const symbolKey = extractSymbolName(symbol);
  console.log('🔍 OrderBook - Symbol:', symbol, '→ Key:', symbolKey);
  
  // Get the latest tick (last item in the array, not first)
  const symbolHistory = tickData[symbolKey];
  const currentTick = symbolHistory && symbolHistory.length > 0 ? 
    symbolHistory[symbolHistory.length - 1] : null;
    
  console.log('🔍 OrderBook - Found tick data:', !!currentTick, 'History length:', symbolHistory?.length);
  
  if (!currentTick) return null;

  const bidOrders = currentTick.depth?.buy || [];
  const askOrders = currentTick.depth?.sell || [];
  const scanType = currentTick.scan_type;
  const marketImpact = currentTick.depth?.marketImpact;
  const liveTrackerMasking = currentTick.liveTrackerMasking;

  // Get number of levels to mask based on market impact
  const impactedLevels = marketImpact?.impactedLevels || 0;

  console.log('🔍 OrderBook Masking Debug:', {
    symbol: symbol,
    symbolKey: symbolKey,
    scanType: scanType,
    impactedLevels: impactedLevels,
    marketImpact: marketImpact,
    liveTrackerMasking: liveTrackerMasking,
    bidLevels: bidOrders.length,
    askLevels: askOrders.length
  });

  return (
    <PanelOverlay isOpen={isOpen}>
      <PanelHeader>
        <span>📊 Order Book: {symbol}</span>
        <CloseButton onClick={onClose}>✕</CloseButton>
      </PanelHeader>
      
      <OrderBookContainer>
        {scanType === 'BUY_SCAN' ? (
          <>
            {/* For BUY stocks - show ASK levels first (what you're buying from) */}
            <OrderBookSection>
              <SectionTitle>🔴 ASK ORDERS (Sell) - {askOrders.length} levels</SectionTitle>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #30363d', borderRadius: '4px' }}>
                <OrderTable>
                <thead>
                  <tr>
                    <OrderHeader align="right">Price</OrderHeader>
                    <OrderHeader align="right">Quantity</OrderHeader>
                  </tr>
                </thead>
                <tbody>
                  {askOrders.slice(0, 10).map((order, index) => {
                    // For BUY scans, mask the first N ask levels based on impactedLevels
                    const shouldMask = scanType === 'BUY_SCAN' && index < impactedLevels;
                    
                    console.log(`🎭 ASK Level ${index + 1} DYNAMIC MASKING:`, {
                      level: index + 1,
                      price: order.price,
                      quantity: order.quantity,
                      scanType: scanType,
                      impactedLevels: impactedLevels,
                      shouldMask: shouldMask,
                      maskingReason: shouldMask ? `Level ${index + 1} <= ${impactedLevels} impacted levels` : 'Not masked'
                    });
                    
                    return (
                      <OrderRow 
                        key={index}
                        masked={shouldMask}
                        style={{
                          opacity: shouldMask ? 0.6 : 1.0,
                          background: shouldMask ? 'rgba(255, 107, 107, 0.3)' : 'transparent',
                          borderLeft: shouldMask ? '4px solid rgba(239, 68, 68, 0.8)' : 'none'
                        }}
                      >
                        <OrderCell className="price-ask">₹{order.price.toFixed(2)}</OrderCell>
                        <OrderCell className="quantity">{order.quantity.toLocaleString()}</OrderCell>
                      </OrderRow>
                    );
                  })}
                </tbody>
              </OrderTable>
              </div>
            </OrderBookSection>

            <OrderBookSection>
              <SectionTitle>🟢 BID ORDERS (Buy) - {bidOrders.length} levels</SectionTitle>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #30363d', borderRadius: '4px' }}>
                <OrderTable>
                <thead>
                  <tr>
                    <OrderHeader align="right">Price</OrderHeader>
                    <OrderHeader align="right">Quantity</OrderHeader>
                  </tr>
                </thead>
                <tbody>
                  {bidOrders.slice(0, 10).map((order, index) => {
                    // For BUY scans, don't mask BID levels (they're not impacted)
                    const shouldMask = false;
                    
                    return (
                      <OrderRow 
                        key={index}
                        masked={shouldMask}
                        style={{
                          opacity: 1.0,
                          background: 'transparent'
                        }}
                      >
                        <OrderCell className="price-bid">₹{order.price.toFixed(2)}</OrderCell>
                        <OrderCell className="quantity">{order.quantity.toLocaleString()}</OrderCell>
                      </OrderRow>
                    );
                  })}
                </tbody>
              </OrderTable>
              </div>
            </OrderBookSection>
          </>
        ) : (
          <>
            {/* For SELL stocks - show BID levels first (what's buying from you) */}
            <OrderBookSection>
              <SectionTitle>🟢 BID ORDERS (Buy) - {bidOrders.length} levels</SectionTitle>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #30363d', borderRadius: '4px' }}>
                <OrderTable>
                <thead>
                  <tr>
                    <OrderHeader align="right">Price</OrderHeader>
                    <OrderHeader align="right">Quantity</OrderHeader>
                  </tr>
                </thead>
                <tbody>
                  {bidOrders.slice(0, 10).map((order, index) => {
                    // For SELL scans, mask the first N bid levels based on impactedLevels
                    const shouldMask = scanType === 'SELL_SCAN' && index < impactedLevels;
                    
                    console.log(`🎭 BID Level ${index + 1} DYNAMIC MASKING:`, {
                      level: index + 1,
                      price: order.price,
                      quantity: order.quantity,
                      scanType: scanType,
                      impactedLevels: impactedLevels,
                      shouldMask: shouldMask,
                      maskingReason: shouldMask ? `Level ${index + 1} <= ${impactedLevels} impacted levels` : 'Not masked'
                    });
                    
                    return (
                      <OrderRow 
                        key={index}
                        masked={shouldMask}
                        style={{
                          opacity: shouldMask ? 0.6 : 1.0,
                          background: shouldMask ? 'rgba(255, 107, 107, 0.3)' : 'transparent',
                          borderLeft: shouldMask ? '4px solid rgba(239, 68, 68, 0.8)' : 'none'
                        }}
                      >
                        <OrderCell className="price-bid">₹{order.price.toFixed(2)}</OrderCell>
                        <OrderCell className="quantity">{order.quantity.toLocaleString()}</OrderCell>
                      </OrderRow>
                    );
                  })}
                </tbody>
              </OrderTable>
              </div>
            </OrderBookSection>

            <OrderBookSection>
              <SectionTitle>🔴 ASK ORDERS (Sell) - {askOrders.length} levels</SectionTitle>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #30363d', borderRadius: '4px' }}>
                <OrderTable>
                <thead>
                  <tr>
                    <OrderHeader align="right">Price</OrderHeader>
                    <OrderHeader align="right">Quantity</OrderHeader>
                  </tr>
                </thead>
                <tbody>
                  {askOrders.slice(0, 10).map((order, index) => {
                    // For SELL scans, don't mask ASK levels (they're not impacted)
                    const shouldMask = false;
                    
                    return (
                      <OrderRow 
                        key={index}
                        masked={shouldMask}
                        style={{
                          opacity: 1.0,
                          background: 'transparent'
                        }}
                      >
                        <OrderCell className="price-ask">₹{order.price.toFixed(2)}</OrderCell>
                        <OrderCell className="quantity">{order.quantity.toLocaleString()}</OrderCell>
                      </OrderRow>
                    );
                  })}
                </tbody>
              </OrderTable>
              </div>
            </OrderBookSection>
          </>
        )}

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
      </OrderBookContainer>
    </PanelOverlay>
  );
};

export default OrderBookPanel;
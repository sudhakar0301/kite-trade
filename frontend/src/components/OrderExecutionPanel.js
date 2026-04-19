import React from 'react';
import styled from 'styled-components';

const PanelOverlay = styled.div`
  position: fixed;
  top: 0;
  right: ${props => props.isOpen ? '0' : '-450px'};
  width: 450px;
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
  position: sticky;
  top: 0;
  z-index: 1;
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

const OrderContainer = styled.div`
  padding: 20px;
  color: #e6edf3;
  
  h3 {
    color: #79c0ff;
    font-size: 14px;
    margin: 0 0 15px 0;
  }
`;

const OrderExecutionCard = styled.div`
  background: rgba(30, 60, 114, 0.1);
  border: 1px solid ${props => {
    switch (props.status) {
      case 'SUCCESS': return '#3fb950';
      case 'FAILED': case 'ERROR': return '#f85149';
      case 'ATTEMPTING': return '#ffd700';
      default: return '#30363d';
    }
  }};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(30, 60, 114, 0.2);
    transform: translateY(-1px);
  }
`;

const OrderHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const OrderSymbol = styled.div`
  font-weight: 600;
  font-size: 16px;
  color: ${props => props.type === 'BUY' ? '#3fb950' : '#f85149'};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const OrderStatus = styled.div`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    switch (props.status) {
      case 'SUCCESS': return 'rgba(63, 185, 80, 0.2)';
      case 'FAILED': case 'ERROR': return 'rgba(248, 81, 73, 0.2)';
      case 'ATTEMPTING': return 'rgba(255, 215, 0, 0.2)';
      default: return 'rgba(139, 148, 158, 0.2)';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'SUCCESS': return '#3fb950';
      case 'FAILED': case 'ERROR': return '#f85149';
      case 'ATTEMPTING': return '#ffd700';
      default: return '#8b949e';
    }
  }};
`;

const OrderDetails = styled.div`
  font-size: 12px;
  color: #8b949e;
  line-height: 1.5;
  
  .detail-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  
  .detail-label {
    color: #8b949e;
  }
  
  .detail-value {
    color: #e6edf3;
    font-weight: 500;
  }
  
  .route-info {
    background: rgba(121, 192, 255, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    margin-top: 8px;
    font-family: 'SF Mono', monospace;
    color: #79c0ff;
    font-size: 11px;
  }
  
  .error-message {
    background: rgba(248, 81, 73, 0.1);
    padding: 8px;
    border-radius: 4px;
    margin-top: 8px;
    color: #f85149;
    font-size: 11px;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  color: #8b949e;
  padding: 40px;
  font-size: 14px;
  
  .icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
`;

const ClearButton = styled.button`
  background: rgba(248, 81, 73, 0.1);
  border: 1px solid rgba(248, 81, 73, 0.3);
  color: #f85149;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 12px;
  margin-top: 16px;
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(248, 81, 73, 0.2);
  }
`;

const OrderExecutionPanel = ({ isOpen, onClose, orderExecutions = [], onClear }) => {
  console.log('📋 [PANEL] OrderExecutionPanel render - isOpen:', isOpen, 'orderCount:', orderExecutions.length);
  
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatPrice = (price) => {
    return price ? `₹${parseFloat(price).toFixed(2)}` : 'N/A';
  };

  const getOrderIcon = (type, status) => {
    if (status === 'ATTEMPTING') return '⏳';
    if (status === 'SUCCESS') return type === 'BUY' ? '📈' : '📉';
    return '❌';
  };

  const sortedOrders = [...orderExecutions].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <PanelOverlay isOpen={isOpen}>
      <PanelHeader>
        <span>🚀 Order Executions ({orderExecutions.length})</span>
        <CloseButton onClick={onClose}>✕</CloseButton>
      </PanelHeader>
      
      <OrderContainer>
        {sortedOrders.length === 0 ? (
          <EmptyState>
            <div className="icon">📋</div>
            <div>No order executions yet</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>
              Orders will appear here when scanner finds signals or when you test orders
            </div>
            <div style={{ 
              fontSize: '11px', 
              marginTop: '12px', 
              padding: '8px', 
              background: 'rgba(121, 192, 255, 0.1)', 
              borderRadius: '4px', 
              color: '#79c0ff' 
            }}>
              ✅ Panel is working! This message confirms the OrderExecutionPanel is rendering correctly.
            </div>
          </EmptyState>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>Recent Order Attempts</h3>
              <ClearButton onClick={onClear}>Clear All</ClearButton>
            </div>
            
            {sortedOrders.map((order) => (
              <OrderExecutionCard key={order.id} status={order.status}>
                <OrderHeader>
                  <OrderSymbol type={order.type}>
                    {getOrderIcon(order.type, order.status)} 
                    {order.symbol?.replace('NSE:', '')} ({order.type})
                  </OrderSymbol>
                  <OrderStatus status={order.status}>
                    {order.status}
                  </OrderStatus>
                </OrderHeader>
                
                <OrderDetails>
                  <div className="detail-row">
                    <span className="detail-label">Started:</span>
                    <span className="detail-value">{formatTime(order.timestamp)}</span>
                  </div>
                  
                  {order.completedAt && (
                    <div className="detail-row">
                      <span className="detail-label">Completed:</span>
                      <span className="detail-value">{formatTime(order.completedAt)}</span>
                    </div>
                  )}
                  
                  <div className="detail-row">
                    <span className="detail-label">Price:</span>
                    <span className="detail-value">{formatPrice(order.price || order.ltp)}</span>
                  </div>
                  
                  {order.quantity && (
                    <div className="detail-row">
                      <span className="detail-label">Quantity:</span>
                      <span className="detail-value">{order.quantity}</span>
                    </div>
                  )}
                  
                  {order.orderId && (
                    <div className="detail-row">
                      <span className="detail-label">Order ID:</span>
                      <span className="detail-value">{order.orderId}</span>
                    </div>
                  )}
                  
                  <div className="route-info">
                    POST {order.route}
                  </div>
                  
                  {order.error && (
                    <div className="error-message">
                      ❌ {order.error}
                    </div>
                  )}
                  
                  {order.message && order.status === 'SUCCESS' && (
                    <div style={{ 
                      background: 'rgba(63, 185, 80, 0.1)', 
                      padding: '8px', 
                      borderRadius: '4px', 
                      marginTop: '8px', 
                      color: '#3fb950', 
                      fontSize: '11px' 
                    }}>
                      ✅ {order.message}
                    </div>
                  )}
                </OrderDetails>
              </OrderExecutionCard>
            ))}
          </>
        )}
      </OrderContainer>
    </PanelOverlay>
  );
};

export default OrderExecutionPanel;
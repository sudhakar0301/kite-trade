import React from 'react';
import styled from 'styled-components';

const TargetOrderContainer = styled.div`
  margin: 20px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  
  @media (max-width: 768px) {
    margin: 10px;
  }
`;

const TargetOrderHeader = styled.div`
  background: linear-gradient(135deg, #2e7d32 0%, #4caf50 100%);
  padding: 16px 20px;
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: white;
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const TargetOrderList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(139, 148, 158, 0.3);
    border-radius: 3px;
    
    &:hover {
      background: rgba(139, 148, 158, 0.5);
    }
  }
`;

const TargetOrderCard = styled.div`
  padding: 15px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  
  &:hover {
    background: rgba(255, 255, 255, 0.03);
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const OrderSymbol = styled.div`
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const OrderId = styled.span`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
`;

const DetailsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;
  margin-top: 10px;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const DetailItem = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px;
  text-align: center;
`;

const DetailLabel = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 4px;
`;

const DetailValue = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  
  &.investment {
    color: #2196f3;
  }
  
  &.profit {
    color: #4caf50;
  }
  
  &.target-price {
    color: #ff9800;
  }
`;

const OrderSideInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
`;

const SideBadge = styled.span`
  background: ${props => props.side === 'BUY' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'};
  color: ${props => props.side === 'BUY' ? '#4caf50' : '#f44336'};
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 10px;
`;

const StatusBadge = styled.span`
  background: ${props => 
    props.status === 'OPEN' ? 'rgba(255, 193, 7, 0.2)' : 
    props.status === 'COMPLETE' ? 'rgba(76, 175, 80, 0.2)' : 
    'rgba(158, 158, 158, 0.2)'
  };
  color: ${props => 
    props.status === 'OPEN' ? '#ffc107' : 
    props.status === 'COMPLETE' ? '#4caf50' : 
    '#9e9e9e'
  };
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 10px;
  margin-left: 8px;
`;

const Timestamp = styled.div`
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
`;

const EmptyMessage = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
  font-size: 14px;
`;

const TargetOrderDetails = ({ targetOrders = [], onClose, isVisible = false }) => {
  const safeOrders = (Array.isArray(targetOrders) ? targetOrders : [])
    .filter(order => order && order.symbol)
    .map(order => ({
      ...order,
      investment: Number(order.investment || 0),
      expectedProfit: Number(order.expectedProfit || 0),
      targetPrice: Number(order.targetPrice || 0),
      profitPercentage: order.profitPercentage ?? '0.00'
    }));

  if (!isVisible || safeOrders.length === 0) {
    return null;
  }

  return (
    <TargetOrderContainer>
      <TargetOrderHeader>
        <div>🎯 Target Orders Placed ({safeOrders.length})</div>
        <CloseButton onClick={onClose}>✕</CloseButton>
      </TargetOrderHeader>
      
      <TargetOrderList>
        {safeOrders.length === 0 ? (
          <EmptyMessage>No target orders placed yet</EmptyMessage>
        ) : (
          safeOrders.map((order, index) => (
            <TargetOrderCard key={order.orderId || index}>
              <OrderSymbol>
                <span>{order.symbol}</span>
                <OrderId>#{order.orderId}</OrderId>
              </OrderSymbol>
              
              <DetailsGrid>
                <DetailItem>
                  <DetailLabel>Investment</DetailLabel>
                  <DetailValue className="investment">
                    ₹{order.investment.toLocaleString('en-IN')}
                  </DetailValue>
                </DetailItem>
                
                <DetailItem>
                  <DetailLabel>Expected Profit</DetailLabel>
                  <DetailValue className="profit">
                    ₹{order.expectedProfit.toFixed(2)}
                  </DetailValue>
                </DetailItem>
                
                <DetailItem>
                  <DetailLabel>Target Price</DetailLabel>
                  <DetailValue className="target-price">
                    ₹{order.targetPrice.toFixed(2)}
                  </DetailValue>
                </DetailItem>
              </DetailsGrid>
              
              <OrderSideInfo>
                <div>
                  Position: <SideBadge side={order.side}>{order.side}</SideBadge>
                  {' → '}
                  Target: <SideBadge side={order.targetSide}>{order.targetSide}</SideBadge>
                  {order.status && <StatusBadge status={order.status}>{order.status}</StatusBadge>}
                  {order.orderType && <span style={{fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginLeft: '8px'}}>{order.orderType}</span>}
                </div>
                <div>
                  <div style={{fontSize: '10px', color: 'rgba(255,255,255,0.5)'}}>
                    Profit: {order.profitPercentage}%
                  </div>
                  <Timestamp>{order.timestamp}</Timestamp>
                </div>
              </OrderSideInfo>
            </TargetOrderCard>
          ))
        )}
      </TargetOrderList>
    </TargetOrderContainer>
  );
};

export default TargetOrderDetails;
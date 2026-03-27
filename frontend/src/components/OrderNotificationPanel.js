import React from 'react';
import styled, { keyframes, css } from 'styled-components';

const slideIn = keyframes`
  from { right: -400px; }
  to { right: 0; }
`;

const slideOut = keyframes`
  from { right: 0; }
  to { right: -400px; }
`;

const NotificationPane = styled.div`
  position: fixed;
  top: 50%;
  right: -400px;
  transform: translateY(-50%);
  width: 350px;
  background: ${props => props.type === 'sell' 
    ? 'linear-gradient(135deg, #dc3545, #e74c3c)'
    : 'linear-gradient(135deg, #28a745, #20c997)'};
  color: white;
  border-radius: 15px 0 0 15px;
  box-shadow: -5px 0 20px rgba(0,0,0,0.3);
  z-index: 10000;
  font-family: 'Segoe UI', sans-serif;
  overflow: hidden;
  ${props => css`animation: ${props.show ? slideIn : slideOut} 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;`}
`;

const PaneHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  font-weight: 600;
  font-size: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 25px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.3s;
  
  &:hover {
    background: rgba(255,255,255,0.2);
  }
`;

const PaneBody = styled.div`
  padding: 20px;
`;

const OrderDetails = styled.div`
  margin-bottom: 20px;
`;

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
`;

const DetailLabel = styled.span`
  opacity: 0.9;
`;

const DetailValue = styled.span`
  font-weight: 600;
`;

const ActionButton = styled.button`
  background: rgba(255,255,255,0.2);
  border: 2px solid white;
  color: white;
  padding: 15px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  text-decoration: none;
  display: block;
  width: 100%;
  font-size: 16px;
  margin-top: 10px;
  
  &:hover {
    background: white;
    color: ${props => props.type === 'sell' ? '#dc3545' : '#28a745'};
    transform: translateY(-2px);
  }
`;

const OrderNotificationPanel = ({ notification, onClose }) => {
  if (!notification) return null;

  const { symbol, type, status, price, quantity, show } = notification;

  return (
    <NotificationPane show={show} type={type}>
      <PaneHeader>
        <span>📝 Order Status</span>
        <CloseButton onClick={onClose}>×</CloseButton>
      </PaneHeader>
      
      <PaneBody>
        <OrderDetails>
          <DetailRow>
            <DetailLabel>Symbol:</DetailLabel>
            <DetailValue>{symbol}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Type:</DetailLabel>
            <DetailValue>{type?.toUpperCase()}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Status:</DetailLabel>
            <DetailValue>{status}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Price:</DetailLabel>
            <DetailValue>₹{price}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Quantity:</DetailLabel>
            <DetailValue>{quantity}</DetailValue>
          </DetailRow>
        </OrderDetails>
        
        <div>
          <ActionButton type={type} onClick={() => window.open(`https://kite.zerodha.com/chart/ext/${symbol}`)}>
            📈 Open Chart
          </ActionButton>
          {type === 'buy' && status === 'COMPLETE' && (
            <ActionButton type={type}>
              🎯 Place Target Order (₹1500 profit)
            </ActionButton>
          )}
        </div>
      </PaneBody>
    </NotificationPane>
  );
};

export default OrderNotificationPanel;
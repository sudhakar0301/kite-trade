import React from 'react';
import styled from 'styled-components';

const InfoPanel = styled.div`
  background: rgba(40, 167, 69, 0.1);
  backdrop-filter: blur(20px);
  border: 2px solid rgba(40, 167, 69, 0.3);
  border-radius: 15px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  align-items: center;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 15px;
  }
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const InfoLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 8px;
`;

const InfoValue = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${props => {
    if (props.status === 'connected') return '#28a745';
    if (props.status === 'error') return '#dc3545';
    if (props.status === 'warning') return '#ffc107';
    return '#17a2b8';
  }};
  text-shadow: 0 2px 4px rgba(0,0,0,0.2);
`;

const PositionsContainer = styled.div`
  margin-top: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 15px;
  display: ${props => props.show ? 'block' : 'none'};
`;

const PositionsHeader = styled.div`
  font-weight: 600;
  margin-bottom: 10px;
  color: #ffd89b;
`;

const PositionItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;

  &:last-child {
    border-bottom: none;
  }
`;

const PnLValue = styled.span`
  font-weight: 600;
  color: ${props => props.value >= 0 ? '#28a745' : '#dc3545'};
`;

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const getStatusColor = (status) => {
  const statusMap = {
    'OPEN': 'connected',
    'CLOSED': 'error',
    'PRE-OPEN': 'warning',
    'Loading...': 'warning',
    'Connected': 'connected',
    'Disconnected': 'error',
    'Connecting...': 'warning'
  };
  return statusMap[status] || 'info';
};

const TradingInfoPanel = ({ fundInfo, positions, marketStatus, kiteStatus, wsStatus }) => {
  return (
    <InfoPanel>
      <InfoGrid>
        <InfoItem>
          <InfoLabel>💰 Available Funds:</InfoLabel>
          <InfoValue status="connected">
            {fundInfo?.available ? formatCurrency(fundInfo.available) : 'Loading...'}
          </InfoValue>
        </InfoItem>

        <InfoItem>
          <InfoLabel>⚡ Leverage Funds:</InfoLabel>
          <InfoValue status="info">
            {fundInfo?.leverage ? formatCurrency(fundInfo.leverage) : 'Loading...'}
          </InfoValue>
        </InfoItem>

        <InfoItem>
          <InfoLabel>📊 Order Type:</InfoLabel>
          <InfoValue status="info">MIS - MARKET</InfoValue>
        </InfoItem>

        <InfoItem>
          <InfoLabel>🕒 Market Status:</InfoLabel>
          <InfoValue status={getStatusColor(marketStatus)}>{marketStatus}</InfoValue>
        </InfoItem>

        <InfoItem>
          <InfoLabel>🔗 Kite Status:</InfoLabel>
          <InfoValue status={getStatusColor(kiteStatus || 'Checking...')}>
            {kiteStatus || 'Checking...'}
          </InfoValue>
        </InfoItem>

        <InfoItem>
          <InfoLabel>📡 WebSocket:</InfoLabel>
          <InfoValue status={getStatusColor(wsStatus || 'Connecting...')}>
            {wsStatus || 'Connecting...'}
          </InfoValue>
        </InfoItem>
      </InfoGrid>

      <PositionsContainer show={positions && positions.length > 0}>
        <PositionsHeader>📈 Active Positions ({positions?.length || 0})</PositionsHeader>
        {positions?.map((position, index) => (
          <PositionItem key={index}>
            <div>
              <strong>{position.symbol}</strong> - {position.quantity} qty
            </div>
            <div>
              <PnLValue value={position.pnl}>
                {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
              </PnLValue>
            </div>
          </PositionItem>
        ))}
      </PositionsContainer>
    </InfoPanel>
  );
};

export default TradingInfoPanel;
import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';

const slideIn = keyframes`
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
`;

const pulseAnimation = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.02); }
`;

const blinkAnimation = keyframes`
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0.6; }
`;

const ControlPanel = styled.div`
  position: fixed;
  top: 20px;
  right: 20px;
  width: 320px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  overflow: hidden;
  animation: ${slideIn} 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
`;

const ControlHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  padding: 20px;
  color: white;
  text-align: center;
  font-weight: 600;
  font-size: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const ControlBody = styled.div`
  padding: 20px;
`;

const AutoTradingSection = styled.div`
  margin-bottom: 20px;
`;

const AutoTradingToggle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px;
  background: ${props => props.$enabled 
    ? 'linear-gradient(135deg, #10b981, #059669)'
    : 'linear-gradient(135deg, #ef4444, #dc2626)'};
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: white;
  margin-bottom: 10px;
  
  ${props => props.$enabled && css`
    animation: ${pulseAnimation} 3s infinite;
  `}
  
  &:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  }
`;

const ToggleContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ToggleTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
`;

const ToggleSubtext = styled.div`
  font-size: 11px;
  opacity: 0.9;
`;

const ToggleIcon = styled.div`
  font-size: 24px;
`;

const DevConsole = styled.div`
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #00ff00;
  height: 200px;
  overflow-y: auto;
  padding: 10px;
  margin-bottom: 15px;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: #1a1a1a;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }
`;

const ConsoleHeader = styled.div`
  color: #ffff00;
  font-weight: bold;
  margin-bottom: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #333;
`;

const TokenLine = styled.div`
  margin-bottom: 3px;
  color: ${props => props.type === 'sell' ? '#ff6b6b' : props.type === 'buy' ? '#51cf66' : '#00ff00'};
  font-size: 10px;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const StatusItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

const StatusValue = styled.div`
  color: white;
  font-weight: 600;
  font-size: 14px;
`;

const StatusLabel = styled.div`
  font-size: 10px;
  opacity: 0.7;
`;

const OrderSection = styled.div`
  margin-top: 20px;
  ${props => !props.show && css`display: none;`}
`;

const OrderNotification = styled.div`
  background: ${props => {
    // Handle error states first
    if (props.success === false) {
      return 'linear-gradient(135deg, #dc2626, #b91c1c)'; // Red gradient for errors
    }
    // Handle success states by type
    return props.type === 'sell' 
      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
      : 'linear-gradient(135deg, #10b981, #059669)';
  }};
  color: white;
  padding: 15px;
  border-radius: 15px;
  margin-bottom: 10px;
  animation: ${slideIn} 0.3s ease;
  border: ${props => props.success === false 
    ? '2px solid #fca5a5' 
    : 'none'};
`;

const OrderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
`;

const OrderDetails = styled.div`
  font-size: 12px;
  opacity: 0.9;
`;

const OrderDetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
`;

const ViewOrderButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 8px 15px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 8px;
  width: 100%;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: white;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  border-radius: 50%;
  transition: background 0.3s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;

const LoginSection = styled.div`
  margin-top: 15px;
`;

const LoginButton = styled.button`
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border: none;
  color: white;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  width: 100%;
  font-size: 13px;
  animation: ${blinkAnimation} 2s infinite;
  
  &:hover {
    background: linear-gradient(135deg, #2563eb, #1e40af);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }
`;

const LoginStatus = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 15px;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 10px;
  color: white;
  font-size: 12px;
  font-weight: 500;
`;

const QuickActionsSection = styled.div`
  margin-top: 15px;
  display: flex;
  gap: 10px;
`;

const QuickActionButton = styled.button`
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border: none;
  color: white;
  padding: 10px 15px;
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  flex: 1;
  font-size: 12px;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #2563eb, #1e40af);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const TradingControlPanel = ({ 
  autoTradingEnabled, 
  onToggleAutoTrading,
  buySignals = [], 
  sellSignals = [], 
  orderNotification,
  onClearOrderNotification,
  kiteLoginStatus,
  onKiteLogin,
  lastUpdate,
  voiceEnabled,
  onToggleVoice,
  isPolling = false,
  pollCountdown = 0,
  onTogglePolling,
  pollInterval = 15,
  onChangePollInterval,
  subscribedStocksCount = 0
}) => {
  const handleToggleAutoTrading = () => {
    if (kiteLoginStatus !== 'logged-in') {
      onKiteLogin();
    } else {
      onToggleAutoTrading();
    }
  };

  const handleViewOrder = () => {
    if (orderNotification?.orderId) {
      window.open(`https://kite.zerodha.com/orders`, '_blank');
    }
  };

  return (
    <ControlPanel>
      <ControlHeader>
        🤖 Trading Control Center
      </ControlHeader>
      
      <ControlBody>
        {/* Auto Trading Section */}
        <AutoTradingSection>
          <AutoTradingToggle $enabled={autoTradingEnabled} onClick={handleToggleAutoTrading}>
            <ToggleContent>
              <ToggleTitle>
                Auto Trading {autoTradingEnabled ? 'ACTIVE' : 'INACTIVE'}
              </ToggleTitle>
              <ToggleSubtext>
                {kiteLoginStatus === 'logged-in' 
                  ? (autoTradingEnabled ? 'Orders will be placed automatically' : 'Click to enable auto trading')
                  : 'Login to Kite to enable'}
              </ToggleSubtext>
            </ToggleContent>
            <ToggleIcon>{autoTradingEnabled ? '⚡' : '🚫'}</ToggleIcon>
          </AutoTradingToggle>

          {/* Status Indicators */}
          <StatusIndicator>
            <StatusItem>
              <StatusValue>{subscribedStocksCount}</StatusValue>
              <StatusLabel>Subscribed</StatusLabel>
            </StatusItem>
            <StatusItem>
              <StatusValue>{buySignals.length}</StatusValue>
              <StatusLabel>Buy Signals</StatusLabel>
            </StatusItem>
            <StatusItem>
              <StatusValue>{sellSignals.length}</StatusValue>
              <StatusLabel>Sell Signals</StatusLabel>
            </StatusItem>
            <StatusItem>
              <StatusValue>
                {isPolling ? `${pollCountdown}s` : '⏸️'}
              </StatusValue>
              <StatusLabel>Next Poll</StatusLabel>
            </StatusItem>
          </StatusIndicator>
        </AutoTradingSection>

        {/* Kite Login Section */}
        {kiteLoginStatus === 'not-logged-in' && (
          <LoginSection>
            <LoginButton onClick={onKiteLogin}>
              🔐 Login to Kite Connect
            </LoginButton>
          </LoginSection>
        )}

        {kiteLoginStatus === 'logged-in' && (
          <LoginStatus>
            <span>✅ Connected to Kite</span>
            <span>🟢</span>
          </LoginStatus>
        )}

        {/* Polling Controls */}
        <AutoTradingSection>
          <div style={{ marginBottom: '10px', color: '#fff', fontSize: '12px', fontWeight: '600' }}>
            ⏱️ Polling Interval
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <QuickActionButton
              onClick={() => onChangePollInterval && onChangePollInterval(15)}
              style={{
                background: pollInterval === 15
                  ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                  : 'linear-gradient(135deg, #6b7280, #4b5563)',
                fontSize: '11px'
              }}
              disabled={!onChangePollInterval}
            >
              15s
            </QuickActionButton>
            <QuickActionButton
              onClick={() => onChangePollInterval && onChangePollInterval(30)}
              style={{
                background: pollInterval === 30
                  ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                  : 'linear-gradient(135deg, #6b7280, #4b5563)',
                fontSize: '11px'
              }}
              disabled={!onChangePollInterval}
            >
              30s
            </QuickActionButton>
          </div>
        </AutoTradingSection>

        {/* Quick Actions */}
        <QuickActionsSection>
          <QuickActionButton 
            onClick={onTogglePolling} 
            disabled={!onTogglePolling}
            style={{
              background: isPolling 
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #10b981, #059669)'
            }}
          >
            {isPolling ? '⏹️ Stop Polling' : '▶️ Start Polling'}
          </QuickActionButton>
          <QuickActionButton 
            onClick={onToggleVoice} 
            style={{ 
              background: voiceEnabled 
                ? 'linear-gradient(135deg, #10b981, #059669)' 
                : 'linear-gradient(135deg, #6b7280, #4b5563)' 
            }}
            disabled={!onToggleVoice}
          >
            {voiceEnabled ? '🔊' : '🔇'} Voice {voiceEnabled ? 'ON' : 'OFF'}
          </QuickActionButton>
        </QuickActionsSection>

        {/* Order Notification Section */}
        <OrderSection show={orderNotification}>
          {orderNotification && (
            <OrderNotification 
              type={orderNotification.type} 
              success={orderNotification.success}
            >
              <OrderHeader>
                <span>
                  {/* Show different icons for success/failure */}
                  {orderNotification.success === false 
                    ? '❌' 
                    : orderNotification.type === 'buy' ? '📈' : '📉'
                  } 
                  {orderNotification.type.toUpperCase()} Order {
                    orderNotification.success === false ? 'FAILED' : 'PLACED'
                  }
                </span>
                <CloseButton onClick={onClearOrderNotification}>✕</CloseButton>
              </OrderHeader>
              
              <OrderDetails>
                <OrderDetailRow>
                  <span>Symbol:</span>
                  <span>{orderNotification.symbol}</span>
                </OrderDetailRow>
                <OrderDetailRow>
                  <span>Quantity:</span>
                  <span>{orderNotification.quantity}</span>
                </OrderDetailRow>
                <OrderDetailRow>
                  <span>Price:</span>
                  <span>₹{orderNotification.price}</span>
                </OrderDetailRow>
                
                {/* Show Order ID only for successful orders */}
                {orderNotification.success !== false && orderNotification.orderId && (
                  <OrderDetailRow>
                    <span>Order ID:</span>
                    <span>{orderNotification.orderId}</span>
                  </OrderDetailRow>
                )}
                
                {/* Show error message for failed orders */}
                {orderNotification.success === false && orderNotification.error && (
                  <OrderDetailRow>
                    <span>Error:</span>
                    <span style={{ color: '#fca5a5', fontSize: '11px' }}>
                      {orderNotification.error}
                    </span>
                  </OrderDetailRow>
                )}
              </OrderDetails>

              <ViewOrderButton onClick={handleViewOrder}>
                View Order on Kite
              </ViewOrderButton>
            </OrderNotification>
          )}
        </OrderSection>
      </ControlBody>
    </ControlPanel>
  );
};

export default TradingControlPanel;
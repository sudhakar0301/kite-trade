import React, { useState, memo, useMemo, useCallback, useEffect } from 'react';
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
  position: sticky;
  top: 20px;
  width: 100%;
  max-width: none;
  min-height: 800px;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
  margin: 0;
  
  /* Large laptop - adjust width and height */
  @media (max-width: 1600px) {
    max-width: none;
    min-height: 700px;
    margin: 0;
  }
  
  /* Standard laptop */
  @media (max-width: 1400px) {
    max-width: none;
    min-height: 650px;
    border-radius: 16px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    max-width: none;
    min-height: 600px;
    margin: 0;
    border-radius: 14px;
  }
  
  /* Tablet landscape - smaller panel */
  @media (min-width: 769px) and (max-width: 1024px) {
    max-width: none;
    min-height: 550px;
    border-radius: 12px;
  }
  
  /* Mobile and tablet portrait - full width, bottom position */
  @media (max-width: 768px) {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    width: 100%;
    max-width: none;
    min-height: auto;
    max-height: 70vh;
    margin: 0;
    border-radius: 20px 20px 0 0;
    z-index: 10000;
    animation: slideInFromBottom 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  
  /* Small mobile adjustments */
  @media (max-width: 480px) {
    max-height: 75vh;
    border-radius: 16px 16px 0 0;
  }
`;

const slideInFromBottom = keyframes`
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
`;

const ControlHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  padding: 20px 16px;
  color: white;
  text-align: center;
  font-weight: 600;
  font-size: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 16px 12px;
    font-size: 16px;
    position: relative;
    
    /* Add mobile handle bar */
    &::before {
      content: '';
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 4px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2px;
    }
  }
`;

const ControlBody = styled.div`
  padding: 20px 16px;
  overflow-y: auto;
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 16px 12px;
    max-height: calc(70vh - 60px);
  }
  
  @media (max-width: 480px) {
    padding: 12px 10px;
    max-height: calc(75vh - 60px);
  }
`;

const AutoTradingSection = styled.div`
  margin-bottom: 20px;
`;

const AutoTradingToggle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: ${props => props.$enabled 
    ? 'linear-gradient(135deg, #10b981, #059669)'
    : 'linear-gradient(135deg, #ef4444, #dc2626)'};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  color: white;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 500;
  
  ${props => props.$enabled && css`
    animation: ${pulseAnimation} 3s infinite;
  `}
  
  &:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  }
  
  /* Mobile adjustments */
  @media (max-width: 768px) {
    padding: 14px 12px;
    font-size: 15px;
    border-radius: 10px;
    
    /* Larger touch target */
    min-height: 60px;
  }
  
  @media (max-width: 480px) {
    padding: 12px 10px;
    font-size: 14px;
    min-height: 56px;
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
  font-size: 12px;
  opacity: 0.9;
`;

const ToggleIcon = styled.div`
  font-size: 20px;
`;

const DevConsole = styled.div`
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 8px;
  font-family: 'Fira Code', 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  color: #e6edf3;
  padding: 12px;
  margin: 12px 0;
  max-height: 200px;
  overflow-y: auto;
  
  /* Laptop adjustments */
  @media (max-width: 1400px) {
    font-size: 10px;
    padding: 10px;
    max-height: 180px;
  }
  
  /* Smaller laptop */
  @media (max-width: 1200px) {
    font-size: 9px;
    padding: 8px;
    max-height: 160px;
  }
  
  /* Tablet landscape */
  @media (max-width: 1024px) {
    max-height: 140px;
    border-radius: 6px;
  }
`;

const ConsoleHeader = styled.div`
  color: #ffff00;
  font-weight: bold;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid #333;
  font-size: 14px;
`;

const TokenLine = styled.div`
  margin-bottom: 2px;
  color: ${props => props.type === 'sell' ? '#ff6b6b' : props.type === 'buy' ? '#51cf66' : '#00ff00'};
  font-size: 11px;
  line-height: 1.3;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
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
  font-size: 16px;
`;

const StatusLabel = styled.div`
  font-size: 13px;
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
  font-size: 16px;
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
  font-size: 16px;
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
  font-size: 20px;
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
  font-size: 17px;
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
  font-size: 16px;
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
  font-size: 16px;
  
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
  pollInterval = 5,
  onChangePollInterval,
  subscribedStocksCount = 0,
  marginsData = { availableFunds: 0, leverageFunds: 0, usableFunds: 0 },
  accessToken, // Add access token prop
  orderExecutions = [], // Add order executions prop
  onUpdateOrderExecutions, // Add order executions updater prop
  onOpenOrderPanel // Add order panel opener prop
}) => {
  const [isTestingOrder, setIsTestingOrder] = useState(false);
  
  // Only log data when it actually changes, not on every render
  const logData = useMemo(() => ({
    orderExecutions: orderExecutions?.length || 0,
    onUpdateOrderExecutions: !!onUpdateOrderExecutions,
    onOpenOrderPanel: !!onOpenOrderPanel,
    accessToken: !!accessToken,
    kiteLoginStatus
  }), [orderExecutions?.length, onUpdateOrderExecutions, onOpenOrderPanel, accessToken, kiteLoginStatus]);
  
  // Reduced logging - only log when logData actually changes
  useEffect(() => {
    console.log('🔧 [PROPS] TradingControlPanel props changed:', logData);
  }, [logData]);

  const handleToggleAutoTrading = useCallback(() => {
    onToggleAutoTrading();
  }, [onToggleAutoTrading]);

  const handleViewOrder = useCallback(() => {
    if (orderNotification?.orderId) {
      window.open(`https://kite.zerodha.com/orders`, '_blank');
    }
  }, [orderNotification?.orderId]);

  const handleShowFunds = useCallback(async () => {
    const availableFunds = Number(marginsData?.availableFunds || 0);
    const usableFunds = Number(marginsData?.usableFunds || 0);
    alert(`Funds\n\nAvailable: ₹${availableFunds.toLocaleString('en-IN')}\nUsable: ₹${usableFunds.toLocaleString('en-IN')}`);
  }, [marginsData]);

  const handleShowLeveragedFunds = useCallback(async () => {
    const leverageFunds = Number(marginsData?.leverageFunds || 0);
    alert(`Leveraged Funds\n\n₹${leverageFunds.toLocaleString('en-IN')}`);
  }, [marginsData]);

  const handleTestRelianceBuy = useCallback(async () => {
    if (!accessToken || kiteLoginStatus !== 'logged-in') {
      alert('Please login to Kite Connect first');
      return;
    }

    if (!autoTradingEnabled) {
      alert('Please enable Auto Trading first to place test orders');
      return;
    }

    // Add order attempt to tracking
    const orderAttempt = {
      id: Date.now(),
      symbol: 'RELIANCE',
      type: 'BUY (TEST)',
      status: 'ATTEMPTING',
      timestamp: new Date().toISOString(),
      ltp: 0, // Will be updated from response
      route: '/api/test-reliance-buy'
    };
    
    console.log('🎯 [TEST] Creating order attempt:', orderAttempt);
    
    if (onUpdateOrderExecutions) {
      onUpdateOrderExecutions(prev => {
        console.log('🎯 [TEST] Adding order to executions, current count:', prev.length);
        return [...prev, orderAttempt];
      });
    } else {
      console.log('❌ [TEST] onUpdateOrderExecutions not available!');
    }
    
    if (onOpenOrderPanel) {
      onOpenOrderPanel(); // Auto-open order panel
      console.log('🎯 [PANEL] Test order panel opened from TradingControlPanel');
    } else {
      console.log('❌ [TEST] onOpenOrderPanel not available!');
    }

    setIsTestingOrder(true);
    
    console.log(`🚀 [DEV] ROUTE CALL: POST /api/test-reliance-buy`);
    console.log(`🦩 [ORDER] Attempting TEST BUY order for RELIANCE`);
    console.log(`📊 [ORDER] Order ID: ${orderAttempt.id}`);
    
    try {
      console.log('🦩 TEST: Calling test RELIANCE buy order...');
      
      const response = await fetch('http://localhost:5000/api/test-reliance-buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({})
      });
      
      const result = await response.json();
      console.log(`✅ [DEV] ROUTE RESPONSE: /api/test-reliance-buy - Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      console.log('✅ TEST: RELIANCE buy order result:', result);
      
      // Update order tracking
      if (onUpdateOrderExecutions) {
        onUpdateOrderExecutions(prev => prev.map(order => 
          order.id === orderAttempt.id ? {
            ...order,
            status: result.success ? 'SUCCESS' : 'FAILED',
            orderId: result.orderResult?.order_id,
            price: result.currentPrice,
            quantity: result.orderResult?.quantity || 'N/A',
            message: result.success ? 'Test order completed' : result.error,
            error: result.error,
            ltp: result.currentPrice || 0,
            completedAt: new Date().toISOString()
          } : order
        ));
        
        console.log('🎯 [TEST] Order tracking updated with result:', {
          success: result.success,
          orderId: result.orderResult?.order_id,
          price: result.currentPrice
        });
      } else {
        console.log('❌ [TEST] onUpdateOrderExecutions not available for result update!');
      }
      
      if (result.success) {
        alert(`🎉 Test Order Successful!\n\nRELIANCE Buy Order Placed\nPrice: ₹${result.currentPrice}\nResult: ${JSON.stringify(result.orderResult, null, 2)}`);
      } else {
        alert(`❌ Test Order Failed!\n\nError: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ [DEV] ROUTE ERROR: /api/test-reliance-buy - ${error.message}`);
      console.error('❌ TEST: Error placing test order:', error);
      
      // Update order tracking with error
      if (onUpdateOrderExecutions) {
        onUpdateOrderExecutions(prev => prev.map(order => 
          order.id === orderAttempt.id ? {
            ...order,
            status: 'ERROR',
            error: error.message || 'Network error',
            completedAt: new Date().toISOString()
          } : order
        ));
      }
      
      alert(`❌ Test Order Failed!\n\nNetwork Error: ${error.message}`);
    } finally {
      setIsTestingOrder(false);
    }
  }, [accessToken, kiteLoginStatus, autoTradingEnabled, onUpdateOrderExecutions, onOpenOrderPanel]);

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
              onClick={() => onChangePollInterval && onChangePollInterval(5)}
              style={{
                background: pollInterval === 5
                  ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                  : 'linear-gradient(135deg, #6b7280, #4b5563)',
                fontSize: '11px'
              }}
              disabled={!onChangePollInterval}
            >
              5s
            </QuickActionButton>
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
            {voiceEnabled ? '🔊 Voice' : '🔇 Voice'}
          </QuickActionButton>
          <QuickActionButton
            onClick={handleShowFunds}
            style={{
              background: 'linear-gradient(135deg, #0ea5e9, #0369a1)'
            }}
          >
            💰 Funds ₹{Number(marginsData?.availableFunds || 0).toLocaleString('en-IN')}
          </QuickActionButton>
          <QuickActionButton
            onClick={handleShowLeveragedFunds}
            style={{
              background: 'linear-gradient(135deg, #14b8a6, #0f766e)'
            }}
          >
            🏦 Leveraged ₹{Number(marginsData?.leverageFunds || 0).toLocaleString('en-IN')}
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

// Optimized comparison function to prevent unnecessary re-renders
const areEqual = (prevProps, nextProps) => {
  // Compare primitive props that actually matter for rendering
  const primitiveKeys = [
    'autoTradingEnabled', 'kiteLoginStatus', 'lastUpdate', 'voiceEnabled',
    'isPolling', 'pollCountdown', 'pollInterval', 'subscribedStocksCount', 'accessToken'
  ];
  
  for (const key of primitiveKeys) {
    if (prevProps[key] !== nextProps[key]) {
      // Only log significant changes, not every countdown tick
      if (key !== 'pollCountdown' || Math.abs(prevProps[key] - nextProps[key]) > 1) {
        console.log(`🔄 TradingControlPanel: ${key} changed from`, prevProps[key], 'to', nextProps[key]);
      }
      return false;
    }
  }
  
  // Compare arrays by length and first few items (shallow check)
  const arrayKeys = ['buySignals', 'sellSignals', 'orderExecutions'];
  for (const key of arrayKeys) {
    const prevArray = prevProps[key] || [];
    const nextArray = nextProps[key] || [];
    
    if (prevArray.length !== nextArray.length) {
      console.log(`🔄 TradingControlPanel: ${key} length changed from ${prevArray.length} to ${nextArray.length}`);
      return false;
    }
    
    // For small arrays, do light comparison on first few items
    if (prevArray.length > 0 && nextArray.length > 0) {
      const compareCount = Math.min(3, prevArray.length);
      for (let i = 0; i < compareCount; i++) {
        if (prevArray[i]?.symbol !== nextArray[i]?.symbol) {
          console.log(`🔄 TradingControlPanel: ${key}[${i}] symbol changed`);
          return false;
        }
      }
    }
  }
  
  // Compare orderNotification object (lightweight comparison)
  const prevOrderId = prevProps.orderNotification?.orderId;
  const nextOrderId = nextProps.orderNotification?.orderId;
  if (prevOrderId !== nextOrderId) {
    console.log('🔄 TradingControlPanel: orderNotification orderId changed');
    return false;
  }
  
  // Skip function prop comparison - assume parent uses useCallback properly
  // This prevents re-renders when functions are recreated but functionality is same
  
  // Props are essentially the same, prevent re-render
  return true;
};

export default memo(TradingControlPanel, areEqual);
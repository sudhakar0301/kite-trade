import React from 'react';
import styled from 'styled-components';

const TablesContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 20px;
  
  @media (max-width: 1024px) {
    gap: 15px;
    margin: 15px;
  }
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 10px;
    margin: 10px;
  }
`;

const TableWrapper = styled.div`
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
`;

const TableHeader = styled.div`
  background: linear-gradient(135deg, #0f3460 0%, #0e6ba8 100%);
  padding: 16px 20px;
  color: #ffffff;
  font-weight: 600;
  font-size: 16px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  
  &.buy-header {
    background: linear-gradient(135deg, #0f6023 0%, #28a745 100%);
  }
  
  &.sell-header {
    background: linear-gradient(135deg, #7d1515 0%, #dc3545 100%);
  }
`;

const TableContent = styled.div`
  max-height: 400px;
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

const StockRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
  cursor: pointer;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
    transform: translateX(2px);
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const SymbolName = styled.div`
  font-weight: 600;
  color: #79c0ff;
  font-size: 15px;
  font-family: 'Inter', sans-serif;
  position: relative;
  
  &:hover {
    color: #a5d6ff;
    text-decoration: underline;
  }
  
  &:after {
    content: '📈';
    font-size: 12px;
    margin-left: 6px;
    opacity: 0.7;
  }
`;

const Price = styled.div`
  font-weight: 500;
  color: #ffffff;
  font-size: 14px;
  text-align: right;
  margin-right: 12px;
`;

const StatusBadge = styled.div`
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  min-width: 70px;
  
  &.executed {
    background: rgba(40, 167, 69, 0.2);
    color: #28a745;
    border: 1px solid rgba(40, 167, 69, 0.3);
  }
  
  &.failed {
    background: rgba(220, 53, 69, 0.2);
    color: #dc3545;
    border: 1px solid rgba(220, 53, 69, 0.3);
  }
  
  &.pending {
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
    border: 1px solid rgba(255, 193, 7, 0.3);
  }
  
  &.trigger-not-met {
    background: rgba(108, 117, 125, 0.2);
    color: #6c757d;
    border: 1px solid rgba(108, 117, 125, 0.3);
  }
`;

const EmptyMessage = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
  font-size: 14px;
`;

const TriggerInfo = styled.div`
  font-size: 11px;
  color: ${props => props.met ? '#28a745' : '#6c757d'};
  margin-top: 2px;
  font-weight: 500;
`;

const ScanResultsTables = ({ buyStocks = [], sellStocks = [], autoTrade = false, onSymbolClick }) => {
  const handleSymbolClick = (symbol) => {
    if (onSymbolClick) {
      // Use the parent's openNamedChart function
      onSymbolClick(symbol, 'scan-chart');
    } else {
      console.log(`🔗 No chart handler provided for ${symbol}`);
    }
  };

  const getOrderStatus = (stock) => {
    if (stock.orderExecuted === true) {
      return { class: 'executed', text: '✅ Executed' };
    } else if (stock.orderExecuted === false && stock.orderError) {
      return { class: 'failed', text: '❌ Failed' };
    } else if (autoTrade && !stock.triggerMet) {
      return { class: 'trigger-not-met', text: '⏸️ Waiting' };
    } else if (!autoTrade) {
      return { class: 'pending', text: '📊 Scan Only' };
    } else {
      return { class: 'pending', text: '⏳ Pending' };
    }
  };

  const renderStockRow = (stock, index) => {
    const status = getOrderStatus(stock);
    
    return (
      <StockRow key={index} onClick={() => handleSymbolClick(stock.symbol)}>
        <div>
          <SymbolName>{stock.symbol}</SymbolName>
          {stock.triggerMet !== undefined && (
            <TriggerInfo met={stock.triggerMet}>
              LTP {stock.triggerMet ? '✓' : '✗'} EMA3(5min)
            </TriggerInfo>
          )}
        </div>
        <Price>₹{stock.ltp}</Price>
        <StatusBadge className={status.class}>
          {status.text}
        </StatusBadge>
      </StockRow>
    );
  };

  return (
    <TablesContainer>
      {/* Buy Stocks Table */}
      <TableWrapper>
        <TableHeader className="buy-header">
          🟢 Buy Signals ({buyStocks.length})
        </TableHeader>
        <TableContent>
          {buyStocks.length === 0 ? (
            <EmptyMessage>No buy signals found</EmptyMessage>
          ) : (
            buyStocks.map(renderStockRow)
          )}
        </TableContent>
      </TableWrapper>

      {/* Sell Stocks Table */}
      <TableWrapper>
        <TableHeader className="sell-header">
          🔴 Sell Signals ({sellStocks.length})
        </TableHeader>
        <TableContent>
          {sellStocks.length === 0 ? (
            <EmptyMessage>No sell signals found</EmptyMessage>
          ) : (
            sellStocks.map(renderStockRow)
          )}
        </TableContent>
      </TableWrapper>
    </TablesContainer>
  );
};

export default ScanResultsTables;
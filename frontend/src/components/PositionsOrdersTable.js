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
  display: flex;
  justify-content: space-between;
  align-items: center;
  
  &.positions-header {
    background: linear-gradient(135deg, #6f42c1 0%, #9c27b0 100%);
  }
  
  &.orders-header {
    background: linear-gradient(135deg, #fd7e14 0%, #e83e8c 100%);
  }
`;

const RefreshButton = styled.button`
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
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TableContent = styled.div`
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

const DataRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  padding: 10px 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.2s ease;
  font-size: 13px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const OrderRow = styled(DataRow)`
  grid-template-columns: 1fr auto auto;
`;

const SymbolName = styled.div`
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
`;

const DataValue = styled.div`
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  text-align: right;
  
  &.positive {
    color: #28a745;
  }
  
  &.negative {
    color: #dc3545;
  }
  
  &.quantity {
    font-weight: 500;
  }
`;

const StatusBadge = styled.div`
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  
  &.long {
    background: rgba(40, 167, 69, 0.2);
    color: #28a745;
  }
  
  &.short {
    background: rgba(220, 53, 69, 0.2);
    color: #dc3545;
  }
  
  &.open {
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
  }
  
  &.complete {
    background: rgba(40, 167, 69, 0.2);
    color: #28a745;
  }
  
  &.cancelled {
    background: rgba(108, 117, 125, 0.2);
    color: #6c757d;
  }
  
  &.rejected {
    background: rgba(220, 53, 69, 0.2);
    color: #dc3545;
  }
`;

const EmptyMessage = styled.div`
  padding: 30px 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
  font-size: 14px;
`;

const ErrorMessage = styled.div`
  padding: 20px;
  text-align: center;
  color: #dc3545;
  font-size: 12px;
  background: rgba(220, 53, 69, 0.1);
  margin: 10px;
  border-radius: 8px;
`;

const LastUpdated = styled.div`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  margin-left: 10px;
`;

const PositionsOrdersTable = ({ 
  positions = [], 
  orders = [], 
  loading = false, 
  error = null, 
  lastUpdated = null,
  onRefresh = null 
}) => {
  const formatPnL = (pnl) => {
    const value = parseFloat(pnl) || 0;
    const className = value > 0 ? 'positive' : value < 0 ? 'negative' : '';
    const sign = value > 0 ? '+' : '';
    return { value: `${sign}₹${value.toFixed(2)}`, className };
  };

  const renderPositionRow = (position, index) => {
    const pnl = formatPnL(position.pnl);
    const isLong = position.quantity > 0;
    
    return (
      <DataRow key={index}>
        <div>
          <SymbolName>{position.tradingsymbol}</SymbolName>
          <DataValue>Avg: ₹{parseFloat(position.average_price || 0).toFixed(2)}</DataValue>
        </div>
        <DataValue className="quantity">
          {Math.abs(position.quantity)}
        </DataValue>
        <DataValue className={pnl.className}>
          {pnl.value}
        </DataValue>
        <StatusBadge className={isLong ? 'long' : 'short'}>
          {isLong ? 'Long' : 'Short'}
        </StatusBadge>
      </DataRow>
    );
  };

  const renderOrderRow = (order, index) => {
    const getStatusClass = (status) => {
      switch (status.toLowerCase()) {
        case 'open': return 'open';
        case 'complete': return 'complete';
        case 'cancelled': return 'cancelled';
        case 'rejected': return 'rejected';
        default: return 'open';
      }
    };

    return (
      <OrderRow key={index}>
        <div>
          <SymbolName>{order.tradingsymbol}</SymbolName>
          <DataValue>
            {order.transaction_type} • ₹{parseFloat(order.price || 0).toFixed(2)} • Qty: {order.quantity}
          </DataValue>
        </div>
        <DataValue>
          {order.order_type}
        </DataValue>
        <StatusBadge className={getStatusClass(order.status)}>
          {order.status}
        </StatusBadge>
      </OrderRow>
    );
  };

  return (
    <TablesContainer>
      {/* Positions Table */}
      <TableWrapper>
        <TableHeader className="positions-header">
          <div>
            💼 Positions ({positions.length})
            {lastUpdated && <LastUpdated>Updated: {lastUpdated}</LastUpdated>}
          </div>
          <RefreshButton onClick={onRefresh} disabled={loading}>
            {loading ? '⟳' : '🔄'}
          </RefreshButton>
        </TableHeader>
        <TableContent>
          {error ? (
            <ErrorMessage>{error}</ErrorMessage>
          ) : positions.length === 0 ? (
            <EmptyMessage>No active positions</EmptyMessage>
          ) : (
            positions.map(renderPositionRow)
          )}
        </TableContent>
      </TableWrapper>

      {/* Orders Table */}
      <TableWrapper>
        <TableHeader className="orders-header">
          <div>
            📋 Orders ({orders.length})
            {lastUpdated && <LastUpdated>Updated: {lastUpdated}</LastUpdated>}
          </div>
          <RefreshButton onClick={onRefresh} disabled={loading}>
            {loading ? '⟳' : '🔄'}
          </RefreshButton>
        </TableHeader>
        <TableContent>
          {error ? (
            <ErrorMessage>{error}</ErrorMessage>
          ) : orders.length === 0 ? (
            <EmptyMessage>No pending orders</EmptyMessage>
          ) : (
            orders.map(renderOrderRow)
          )}
        </TableContent>
      </TableWrapper>
    </TablesContainer>
  );
};

export default PositionsOrdersTable;
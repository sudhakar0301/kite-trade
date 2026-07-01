import React, { useState } from 'react';
import styled from 'styled-components';

const Panel = styled.div`
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.75);
`;

const Header = styled.div`
  padding: 10px;
  font-weight: 800;
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.75);
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: #cbd5e1;
  border-bottom: 1px solid rgba(71, 85, 105, 0.35);
`;

const ClearButton = styled.button`
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.8);
  color: #e2e8f0;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
`;

const TableWrap = styled.div`
  max-height: 380px;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.95);
  position: sticky;
  top: 0;
  z-index: 1;
`;

const Td = styled.td`
  padding: 8px;
  border-bottom: 1px solid rgba(71, 85, 105, 0.35);
`;

const Tag = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  background: ${(props) => (props.status === 'OPEN' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)')};
  color: ${(props) => (props.status === 'OPEN' ? '#86efac' : '#cbd5e1')};
  border: 1px solid ${(props) => (props.status === 'OPEN' ? 'rgba(34, 197, 94, 0.45)' : 'rgba(148, 163, 184, 0.4)')};
`;

const sideColor = (side) => (String(side || '').toUpperCase() === 'SELL' ? '#fca5a5' : '#86efac');

const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasFinite = (value) => Number.isFinite(Number(value));

const fmtMoney = (value) => `₹${toNum(value).toFixed(2)}`;
const fmtSignedMoney = (value) => {
  const num = toNum(value);
  const prefix = num > 0 ? '+' : '';
  return `${prefix}₹${num.toFixed(2)}`;
};
const fmtMoneyOrNA = (value) => (hasFinite(value) ? `₹${Number(value).toFixed(2)}` : '₹0.00');
const fmtPctOrNA = (value) => (hasFinite(value) ? `${Number(value).toFixed(6)}%` : '0.000000%');
const pnlColor = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '#e2e8f0';
  return num > 0 ? '#86efac' : '#fca5a5';
};

const normalizeSymbol = (value) => String(value || '').trim().toUpperCase();

function ExecutedOrderDetailsPanel({ orders = [], activePositions = [], openOrders = [] }) {
  const [selectedSymbol, setSelectedSymbol] = useState('');

  const groupedBySymbol = new Map();

  activePositions.forEach((position) => {
    const symbol = String(position?.tradingsymbol || position?.symbol || '').trim();
    if (!symbol) return;
    if (!groupedBySymbol.has(symbol)) {
      groupedBySymbol.set(symbol, { symbol, position: null, openOrders: [] });
    }
    const row = groupedBySymbol.get(symbol);
    row.position = position;
  });

  openOrders.forEach((order) => {
    const symbol = String(order?.tradingsymbol || order?.symbol || '').trim();
    if (!symbol) return;
    if (!groupedBySymbol.has(symbol)) {
      groupedBySymbol.set(symbol, { symbol, position: null, openOrders: [] });
    }
    const row = groupedBySymbol.get(symbol);
    row.openOrders.push(order);
  });

  const pairedRows = Array.from(groupedBySymbol.values())
    .sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));

  const filteredOrders = selectedSymbol
    ? orders.filter((order) => normalizeSymbol(order?.symbol) === selectedSymbol)
    : orders;

  return (
    <Panel>
      <Header>Executed Order Details ({orders.length})</Header>
      <FilterBar>
        <span>
          Selected Symbol: <strong>{selectedSymbol || 'ALL'}</strong>
        </span>
        {selectedSymbol ? (
          <ClearButton type="button" onClick={() => setSelectedSymbol('')}>
            Clear Filter
          </ClearButton>
        ) : null}
      </FilterBar>
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Symbol</Th>
              <Th>Position Side</Th>
              <Th>Net Qty</Th>
              <Th>Avg Price</Th>
              <Th>Open Orders</Th>
            </tr>
          </thead>
          <tbody>
            {pairedRows.length === 0 ? (
              <tr>
                <Td colSpan={5} style={{ color: '#94a3b8' }}>
                  No active positions or open orders.
                </Td>
              </tr>
            ) : (
              pairedRows.map((row) => {
                const qty = Number(row?.position?.quantity || 0);
                const side = qty > 0 ? 'BUY' : qty < 0 ? 'SELL' : 'N/A';
                const avgPrice = Number(row?.position?.average_price || 0);
                const openOrderCount = Array.isArray(row?.openOrders) ? row.openOrders.length : 0;
                const normalizedSymbol = normalizeSymbol(row.symbol);
                const isSelected = selectedSymbol === normalizedSymbol;
                return (
                  <tr
                    key={`pair-${row.symbol}`}
                    onClick={() => setSelectedSymbol((prev) => (prev === normalizedSymbol ? '' : normalizedSymbol))}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'
                    }}
                  >
                    <Td>{row.symbol}</Td>
                    <Td style={{ color: sideColor(side), fontWeight: 700 }}>{side}</Td>
                    <Td>{Math.abs(qty)}</Td>
                    <Td>{avgPrice > 0 ? fmtMoney(avgPrice) : 'N/A'}</Td>
                    <Td>{openOrderCount}</Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </TableWrap>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Symbol</Th>
              <Th>Side</Th>
              <Th>Tag</Th>
              <Th>Triggered LTP</Th>
              <Th>Executed Price</Th>
              <Th>Slippage</Th>
              <Th>Profit/Loss</Th>
              <Th>Target Price</Th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <Td colSpan={9} style={{ color: '#94a3b8' }}>
                  {selectedSymbol ? `No executed orders for ${selectedSymbol}.` : 'No executed orders available.'}
                </Td>
              </tr>
            ) : (
              filteredOrders.map((order, index) => (
                <tr
                  key={order.orderId || `${order.symbol || 'NA'}-${order.side || 'NA'}-${order.timestamp || index}`}
                  style={{
                    background: selectedSymbol && normalizeSymbol(order?.symbol) === selectedSymbol
                      ? 'rgba(34, 197, 94, 0.10)'
                      : 'transparent'
                  }}
                >
                  {(() => {
                    const status = String(order.orderStatus || order.tag || (order.isCurrent ? 'OPEN' : 'CLOSED')).toUpperCase();
                    return (
                      <>
                  <Td>{order.timestamp ? new Date(order.timestamp).toLocaleTimeString() : 'N/A'}</Td>
                  <Td>{order.symbol || 'N/A'}</Td>
                  <Td style={{ color: sideColor(order.side), fontWeight: 700 }}>{order.side || 'N/A'}</Td>
                  <Td>
                    <Tag status={status}>
                      {status}
                    </Tag>
                  </Td>
                  <Td>{fmtMoneyOrNA(order.triggeredLtp)}</Td>
                  <Td>{fmtMoney(order.executedPrice)}</Td>
                  <Td>{fmtPctOrNA(order.slippage)}</Td>
                  <Td style={{ color: pnlColor(order.profitLoss ?? order.profit), fontWeight: 700 }}>
                    {fmtSignedMoney(order.profitLoss ?? order.profit)}
                  </Td>
                  <Td>{fmtMoney(order.targetPrice || order.targetValue)}</Td>
                      </>
                    );
                  })()}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrap>
    </Panel>
  );
}

export default ExecutedOrderDetailsPanel;

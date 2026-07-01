import React from 'react';
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
  background: ${(props) => (props.current ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)')};
  color: ${(props) => (props.current ? '#86efac' : '#cbd5e1')};
  border: 1px solid ${(props) => (props.current ? 'rgba(34, 197, 94, 0.45)' : 'rgba(148, 163, 184, 0.4)')};
`;

const sideColor = (side) => (String(side || '').toUpperCase() === 'SELL' ? '#fca5a5' : '#86efac');

const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasFinite = (value) => Number.isFinite(Number(value));

const fmtMoney = (value) => `₹${toNum(value).toFixed(2)}`;
const fmtMoneyOrNA = (value) => (hasFinite(value) ? `₹${Number(value).toFixed(2)}` : '₹0.00');
const fmtPct = (value) => `${toNum(value).toFixed(4)}%`;
const fmtPctOrNA = (value) => (hasFinite(value) ? `${Number(value).toFixed(6)}%` : '0.000000%');

function ExecutedOrderDetailsPanel({ orders = [] }) {
  return (
    <Panel>
      <Header>Executed Order Details ({orders.length})</Header>
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
              <Th>Profit</Th>
              <Th>Target Price</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <Td colSpan={9} style={{ color: '#94a3b8' }}>
                  No executed orders available.
                </Td>
              </tr>
            ) : (
              orders.map((order, index) => (
                <tr key={order.orderId || `${order.symbol || 'NA'}-${order.side || 'NA'}-${order.timestamp || index}`}>
                  <Td>{order.timestamp ? new Date(order.timestamp).toLocaleTimeString() : 'N/A'}</Td>
                  <Td>{order.symbol || 'N/A'}</Td>
                  <Td style={{ color: sideColor(order.side), fontWeight: 700 }}>{order.side || 'N/A'}</Td>
                  <Td>
                    <Tag current={Boolean(order.isCurrent)}>
                      {order.tag || (order.isCurrent ? 'Current' : 'History')}
                    </Tag>
                  </Td>
                  <Td>{fmtMoneyOrNA(order.triggeredLtp)}</Td>
                  <Td>{fmtMoney(order.executedPrice)}</Td>
                  <Td>{fmtPctOrNA(order.slippage)}</Td>
                  <Td>{fmtMoney(order.profit)}</Td>
                  <Td>{fmtMoney(order.targetPrice || order.targetValue)}</Td>
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

import React from 'react';
import styled from 'styled-components';
import { Sparklines, SparklinesLine } from 'react-sparklines';

const TableContainer = styled.div`
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #333;
  border-radius: 12px;
  margin: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
`;

const TableWrapper = styled.div`
  overflow-x: auto;
`;

const TableHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 15px 20px;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: 11px;
  color: #e6edf3;
`;

const TableHead = styled.thead`
  background: rgba(30, 60, 114, 0.25);
  position: sticky;
  top: 0;
  z-index: 2;
`;

const TableHeaderCell = styled.th`
  padding: 12px 8px;
  text-align: left;
  font-weight: 600;
  border-bottom: 1px solid #30363d;
  color: #79c0ff;
  font-size: 10px;
`;

const TableRow = styled.tr`
  &:nth-child(even) {
    background: rgba(255, 255, 255, 0.02);
  }
  
  &:hover {
    background: rgba(30, 60, 114, 0.15);
  }
`;

const TableCell = styled.td`
  padding: 8px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.5);
  font-size: 10px;
  
  &.time { color: #8b949e; font-size: 9px; }
  &.price { color: #ffd700; font-weight: 600; }
  &.positive { color: #3fb950; }
  &.negative { color: #f85149; }
  &.neutral { color: #79c0ff; }
  &.regime { font-weight: bold; font-size: 10px; padding: 4px 6px; border-radius: 4px; text-align: center; }
`;

const RegimeBadge = ({ regime }) => {
  let bg = '#79c0ff';
  if (regime === 'BULL') bg = '#3fb950';
  else if (regime === 'BEAR') bg = '#f85149';
  else if (regime === 'TRAP') bg = '#ff79c6';
  else if (regime === 'CHOP') bg = '#8b949e';

  return <span style={{ background: bg, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>{regime}</span>;
};

const ClickableSymbol = styled.span`
  cursor: pointer;
  color: #79c0ff;
  font-weight: 600;
  transition: all 0.2s ease;
  
  &:hover {
    color: #ffd700;
    text-decoration: underline;
    transform: scale(1.05);
  }
`;

const TickAnalysisTable = ({ symbolTickData = {}, isPolling = false, socketConnected = false, onSymbolClick }) => {
  const calculateMetrics = (currentTick, previousTick, symbolHistory = []) => {
    if (!currentTick) return null;

    const buyQty = currentTick.depth?.buy?.reduce((sum, l) => sum + l.quantity, 0) || 0;
    const sellQty = currentTick.depth?.sell?.reduce((sum, l) => sum + l.quantity, 0) || 0;
    const totalQty = buyQty + sellQty;

    const orderImbalance = totalQty > 0 ? ((buyQty - sellQty) / totalQty) * 100 : 0;
    const bidDepthQty = currentTick.depth?.buy?.slice(0, 20).reduce((sum, l) => sum + l.quantity, 0) || 0;
    const askDepthQty = currentTick.depth?.sell?.slice(0, 20).reduce((sum, l) => sum + l.quantity, 0) || 0;
    const depthImbalance = (bidDepthQty + askDepthQty) > 0 ? ((bidDepthQty - askDepthQty) / (bidDepthQty + askDepthQty) * 100) : 0;

    const priceMovement = previousTick ? currentTick.last_price - previousTick.last_price : 0;
    const bidPrice = currentTick.depth?.buy?.[0]?.price || 0;
    const askPrice = currentTick.depth?.sell?.[0]?.price || 0;
    const spread = askPrice - bidPrice;
    const delta = currentTick.last_price >= bidPrice + (spread / 2) ? 'BUY' : 'SELL';
    
    // 📊 Improved Volume Analysis
    // Get volumes from symbol history for better baseline calculation
    const volumes = symbolHistory.length > 3 ? 
      symbolHistory.slice(1, -1).map(t => t.volume).filter(v => v && v > 0) : // Exclude current and oldest tick
      [];
    
    // Rolling baseline using historical volumes (more realistic)
    const rollingAvg = volumes.length > 0 ?
      volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length :
      currentTick.volume * 0.8; // Use current volume * 0.8 as fallback baseline
    
    // Volume rate calculation
    const currentVolume = currentTick.volume || 0;
    const volumeRate = rollingAvg > 0 ? (currentVolume / rollingAvg) * 100 : 100;

    // Spike detection with improved thresholds
    const isVolumeSpike = currentVolume > rollingAvg * 1.8;
    const isHighVolume = volumeRate > 150;
    const isLowVolume = volumeRate < 70;

    return {
      orderImbalance: orderImbalance.toFixed(1),
      depthImbalance: depthImbalance.toFixed(1),
      priceMovement: priceMovement.toFixed(2),
      spread: spread.toFixed(2),
      delta,
      volumeRate: volumeRate.toFixed(1),
      isVolumeSpike,
      rollingAvg: Math.round(rollingAvg),
      currentVolume: currentVolume,
      signal: generateAdvancedSignal({
        orderImbalance: parseFloat(orderImbalance.toFixed(1)),
        depthImbalance: parseFloat(depthImbalance.toFixed(1)),
        priceMovement: parseFloat(priceMovement.toFixed(2)),
        delta,
        volumeRate: parseFloat(volumeRate.toFixed(1)),
        spread: parseFloat(spread.toFixed(2)),
        regime: currentTick.regime,
        isVolumeSpike,
        isHighVolume,
        isLowVolume
      })
    };
  };

  // 🧠 Advanced Signal Generation with Bull Trap Detection & Volume Spikes
  const generateAdvancedSignal = ({
    orderImbalance, depthImbalance, priceMovement, delta, volumeRate, spread, regime, isVolumeSpike, isHighVolume, isLowVolume
  }) => {
    // ⚠️ Bull Trap Detection - AVOID LONG
    if (orderImbalance > 0 && depthImbalance < -5) return '🚩 FAKE MOVE';
    if (priceMovement > 0 && isLowVolume) return '⚠️ WEAK RALLY';
    if (delta === 'SELL') return '🔻 HIDDEN SELL';
    if (regime === 'TRAP') return '🪤 MANIPULATION';
    if (spread > 1.0) return '💸 ILLIQUID';

    // 💪 Volume Spike Analysis
    if (isVolumeSpike && priceMovement > 0 && orderImbalance > 15) {
      return '🚀 BREAKOUT SPIKE';
    }
    if (isVolumeSpike && priceMovement < 0 && orderImbalance < -15) {
      return '📉 BREAKDOWN SPIKE';
    }

    // ✔ Perfect LONG Setup (High Probability)
    const perfectLong = 
      orderImbalance > 15 &&
      depthImbalance > 10 &&
      priceMovement > 0 &&
      delta === 'BUY' &&
      isHighVolume &&
      spread < 0.5 &&
      regime === 'BULL';

    if (perfectLong) return '🚀 PERFECT LONG';

    // ✔ Strong LONG Setup
    const strongLong = 
      orderImbalance > 15 &&
      depthImbalance > 10 &&
      priceMovement > 0 &&
      delta === 'BUY';

    if (strongLong) return '🟢 STRONG BUY';

    // ✔ Moderate LONG Setup
    const moderateLong = 
      orderImbalance > 8 &&
      priceMovement > 0 &&
      volumeRate > 100;

    if (moderateLong) return '🔵 BUY';

    // 📊 Analyze SHORT opportunities
    const perfectShort = 
      orderImbalance < -15 &&
      depthImbalance < -10 &&
      priceMovement < 0 &&
      delta === 'SELL' &&
      isHighVolume &&
      regime === 'BEAR';

    if (perfectShort) return '🔻 PERFECT SHORT';

    const strongShort = 
      orderImbalance < -15 &&
      depthImbalance < -10 &&
      priceMovement < 0;

    if (strongShort) return '🔴 STRONG SELL';

    return '⏸️ HOLD';
  };

  const getClassForValue = (value, type) => {
    if (type === 'signal') {
      // Perfect setups
      if (value === '🚀 PERFECT LONG') return 'positive';
      if (value === '🔻 PERFECT SHORT') return 'negative';
      
      // Strong signals
      if (value === '🟢 STRONG BUY') return 'positive';
      if (value === '🔴 STRONG SELL') return 'negative';
      
      // Breakout/Breakdown spikes
      if (value.includes('BREAKOUT') || value.includes('SPIKE')) return 'positive';
      if (value.includes('BREAKDOWN')) return 'negative';
      
      // Regular signals
      if (value === '🔵 BUY') return 'neutral';
      
      // Bull traps and warnings
      if (value.includes('FAKE') || value.includes('WEAK') || value.includes('HIDDEN') || 
          value.includes('MANIPULATION') || value.includes('ILLIQUID')) return 'negative';
      
      return 'neutral';
    }
    if (type === 'imbalance') return parseFloat(value) > 10 ? 'positive' : parseFloat(value) < -10 ? 'negative' : 'neutral';
    if (type === 'price') return parseFloat(value) > 0 ? 'positive' : parseFloat(value) < 0 ? 'negative' : 'neutral';
    return 'neutral';
  };

  const symbolEntries = Object.entries(symbolTickData);
  const totalSymbols = symbolEntries.length;
  const totalTicks = Object.values(symbolTickData).reduce((sum, ticks) => sum + ticks.length, 0);
  
  // Debug logging
  console.log('📋 TickAnalysisTable: Received', totalSymbols, 'symbols with', totalTicks, 'total ticks, isPolling:', isPolling, 'socketConnected:', socketConnected);

  return (
    <TableContainer>
      <TableHeader>
        📊 Real-Time Tick Analysis & Order Flow
        <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>{totalSymbols} Symbols • {totalTicks} Ticks</span>
          <span style={{ 
            color: totalTicks > 0 ? '#3fb950' : '#f85149',
            background: totalTicks > 0 ? 'rgba(63, 185, 80, 0.2)' : 'rgba(248, 81, 73, 0.2)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '600'
          }}>
            {totalTicks > 0 ? '🟢 ACTIVE' : '🔴 NO DATA'}
          </span>
        </span>
      </TableHeader>

      <TableWrapper>
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Time</TableHeaderCell>
              <TableHeaderCell>Symbol</TableHeaderCell>
              <TableHeaderCell>LTP</TableHeaderCell>
              <TableHeaderCell>Trend</TableHeaderCell>
              <TableHeaderCell>Order Imb %</TableHeaderCell>
              <TableHeaderCell>Depth Imb %</TableHeaderCell>
              <TableHeaderCell>Price Δ</TableHeaderCell>
              <TableHeaderCell>Spread</TableHeaderCell>
              <TableHeaderCell>Delta</TableHeaderCell>
              <TableHeaderCell>Vol Rate %</TableHeaderCell>
              <TableHeaderCell>Signal</TableHeaderCell>
              <TableHeaderCell>Regime</TableHeaderCell>
            </tr>
          </TableHead>
          <tbody>
            {symbolEntries.map(([symbol, ticks]) => {
              const currentTick = ticks[0]; // Latest tick for this symbol
              const previousTick = ticks[1] || null; // Previous tick for comparison
              const symbolPriceHistory = ticks.map(t => t.last_price).slice(0, 10);
              
              if (!currentTick) return null;
              
              const metrics = calculateMetrics(currentTick, previousTick, ticks);
              if (!metrics) return null;

              return (
                <TableRow key={symbol}>
                  <TableCell className="time">{new Date(currentTick.timestamp).toLocaleTimeString('en-GB')}</TableCell>
                  <TableCell>
                    <ClickableSymbol onClick={() => onSymbolClick && onSymbolClick(symbol)}>
                      {symbol}
                    </ClickableSymbol>
                  </TableCell>
                  <TableCell className="price">₹{currentTick.last_price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Sparklines data={symbolPriceHistory} width={60} height={20}>
                      <SparklinesLine color={metrics.priceMovement >= 0 ? "#3fb950" : "#f85149"} style={{ strokeWidth: 2, fill: "none" }} />
                    </Sparklines>
                  </TableCell>
                  <TableCell className={getClassForValue(metrics.orderImbalance, 'imbalance')}>{metrics.orderImbalance}%</TableCell>
                  <TableCell className={getClassForValue(metrics.depthImbalance, 'imbalance')}>{metrics.depthImbalance}%</TableCell>
                  <TableCell className={getClassForValue(metrics.priceMovement, 'price')}>
                    {metrics.priceMovement > 0 ? '+' : ''}{metrics.priceMovement}
                  </TableCell>
                  <TableCell className="neutral">₹{metrics.spread}</TableCell>
                  <TableCell className={metrics.delta === 'BUY' ? 'positive' : 'negative'}>{metrics.delta}</TableCell>
                  <TableCell className="neutral">
                    {metrics.volumeRate}%{metrics.isVolumeSpike ? ' 📈' : ''}
                    <small style={{display: 'block', fontSize: '8px', color: '#666'}}>
                      {metrics.currentVolume.toLocaleString()}/{metrics.rollingAvg.toLocaleString()}
                    </small>
                  </TableCell>
                  <TableCell className={getClassForValue(metrics.signal, 'signal')}><strong>{metrics.signal}</strong></TableCell>
                  <TableCell className="regime"><RegimeBadge regime={currentTick.regime} /></TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </TableWrapper>

      {totalSymbols === 0 && (
        <div style={{ 
          padding: '40px 20px', 
          textAlign: 'center', 
          color: '#f85149', 
          background: 'rgba(248, 81, 73, 0.1)',
          border: '1px dashed #f85149',
          margin: '20px',
          borderRadius: '8px',
          fontWeight: '500'
        }}>
          📊 <strong>No Tick Data Available</strong><br/>
          <span style={{fontSize: '12px', color: '#8b949e', marginTop: '8px', display: 'inline-block'}}>
            Click "▶️ Start Polling" in the Trading Control Panel to begin generating tick analysis data
          </span>
        </div>
      )}
    </TableContainer>
  );
};

export default TickAnalysisTable;
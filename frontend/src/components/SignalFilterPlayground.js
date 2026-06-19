import React, { useEffect, useMemo, useState } from 'react';

const baseCard = {
  background: 'rgba(15, 23, 42, 0.68)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: '12px',
  padding: '12px',
  minHeight: '280px'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
  color: '#e2e8f0'
};

const thStyle = {
  textAlign: 'left',
  padding: '8px 6px',
  borderBottom: '1px solid rgba(148, 163, 184, 0.35)',
  color: '#cbd5e1',
  fontWeight: 700,
  position: 'sticky',
  top: 0,
  background: 'rgba(15, 23, 42, 0.95)'
};

const tdStyle = {
  padding: '8px 6px',
  borderBottom: '1px solid rgba(71, 85, 105, 0.35)'
};

const buyFilterDefs = [
  {
    id: 'plusDiAbove25_1mBuy',
    label: '+DI(1m) > 25',
    test: row => Number(row.plus_di1 || row.plusDI1 || row.pdi1) > 25
  },
  {
    id: 'plusDiAboveAdx_1mBuy',
    label: '+DI(1m) > ADX(1m)',
    test: row => Number(row.plus_di1 || row.plusDI1 || row.pdi1) > Number(row.adx1 || row.adx_1m)
  },
  {
    id: 'adxAboveMinusDi_1mBuy',
    label: 'ADX(1m) > -DI(1m)',
    test: row => Number(row.adx1 || row.adx_1m) > Number(row.minus_di1 || row.minusDI1 || row.mdi1)
  },
  {
    id: 'macdAboveSignal_1mBuy',
    label: 'MACD(1m) > Signal(1m)',
    test: row => Number(row.macd1 || row.macd_1m) > Number(row.signal1 || row.signal_1m)
  },
  {
    id: 'macdAboveZero_1mBuy',
    label: 'MACD(1m) > 0',
    test: row => Number(row.macd1 || row.macd_1m) > 0
  },
  {
    id: 'ema3AboveEma5_1mBuy',
    label: 'EMA3(1m) > EMA5(1m)',
    test: row => Number(row.ema3_1 || row.ema3_1m) > Number(row.ema5_1 || row.ema5_1m)
  },
  {
    id: 'rsiAbove65_1mBuy',
    label: 'RSI(1m) > 65',
    test: row => Number(row.rsi1 || row.rsi_1m) > 65
  },
  {
    id: 'ema9AboveMbb_1mBuy',
    label: 'EMA9(1m) > MBB(1m)',
    test: row => Number(row.ema9_1 || row.ema9_1m) > Number(row.mbb_1 || row.mbb_1m)
  },
  {
    id: 'ema3UbbGapWithinPoint1Pct_1mBuy',
    label: '|UBB(1m)-EMA3(1m)| <= 0.05%',
    test: row => {
      const ubb = Number(row.ubb_1 || row.ubb_1m || row.bbUpper1 || 0);
      if (!(ubb > 0)) return false;
      const ema3 = Number(row.ema3_1 || row.ema3_1m || 0);
      return (Math.abs(ubb - ema3) / ubb) * 100 <= 0.05;
    }
  },
  {
    id: 'ltpBelowUbb_5mBuy',
    label: 'LTP < UBB(5m)',
    test: row => {
      const ubb = Number(row.ubb_5 || row.ubb5 || row.bbUpper5 || 0);
      if (!(ubb > 0)) return false;
      const ltp = Number(row.ltp || row.last_price || row.price || 0);
      return ltp < ubb;
    }
  },
  {
    id: 'ltpBelowUbb_15mBuy',
    label: 'LTP < UBB(15m)',
    test: row => {
      const ubb = Number(row.ubb_15 || row.ubb15 || row.bbUpper15 || 0);
      if (!(ubb > 0)) return false;
      const ltp = Number(row.ltp || row.last_price || row.price || 0);
      return ltp < ubb;
    }
  },
  {
    id: 'macdAboveZero_5mBuy',
    label: 'MACD(5m) > 0',
    test: row => Number(row.macd5 || row.macd_5m) > 0
  },
  {
    id: 'plusDiAboveMinusDi_5mBuy',
    label: '+DI(5m) > -DI(5m)',
    test: row => Number(row.plus_di5 || row.plusDI5 || row.pdi5) > Number(row.minus_di5 || row.minusDI5 || row.mdi5)
  }
];

const sellFilterDefs = [
  {
    id: 'minusDiAbove25_1mSell',
    label: '-DI(1m) > 25',
    test: row => Number(row.minus_di1 || row.minusDI1 || row.mdi1) > 25
  },
  {
    id: 'minusDiAboveAdx_1mSell',
    label: '-DI(1m) > ADX(1m)',
    test: row => Number(row.minus_di1 || row.minusDI1 || row.mdi1) > Number(row.adx1 || row.adx_1m)
  },
  {
    id: 'adxAbovePlusDi_1mSell',
    label: 'ADX(1m) > +DI(1m)',
    test: row => Number(row.adx1 || row.adx_1m) > Number(row.plus_di1 || row.plusDI1 || row.pdi1)
  },
  {
    id: 'macdBelowSignal_1mSell',
    label: 'MACD(1m) < Signal(1m)',
    test: row => Number(row.macd1 || row.macd_1m) < Number(row.signal1 || row.signal_1m)
  },
  {
    id: 'macdBelowZero_1mSell',
    label: 'MACD(1m) < 0',
    test: row => Number(row.macd1 || row.macd_1m) < 0
  },
  {
    id: 'ema3BelowEma5_1mSell',
    label: 'EMA3(1m) < EMA5(1m)',
    test: row => Number(row.ema3_1 || row.ema3_1m) < Number(row.ema5_1 || row.ema5_1m)
  },
  {
    id: 'rsiBelow35_1mSell',
    label: 'RSI(1m) < 35',
    test: row => Number(row.rsi1 || row.rsi_1m) < 35
  },
  {
    id: 'ema9BelowMbb_1mSell',
    label: 'EMA9(1m) < MBB(1m)',
    test: row => Number(row.ema9_1 || row.ema9_1m) < Number(row.mbb_1 || row.mbb_1m)
  },
  {
    id: 'ema3LbbGapWithinPoint1Pct_1mSell',
    label: '|LBB(1m)-EMA3(1m)| <= 0.05%',
    test: row => {
      const lbb = Number(row.lbb_1 || row.lbb_1m || row.bbLower1 || 0);
      if (!(lbb > 0)) return false;
      const ema3 = Number(row.ema3_1 || row.ema3_1m || 0);
      return (Math.abs(lbb - ema3) / lbb) * 100 <= 0.05;
    }
  },
  {
    id: 'ltpAboveLbb_5mSell',
    label: 'LTP > LBB(5m)',
    test: row => {
      const lbb = Number(row.lbb_5 || row.lbb5 || row.bbLower5 || 0);
      if (!(lbb > 0)) return false;
      const ltp = Number(row.ltp || row.last_price || row.price || 0);
      return ltp > lbb;
    }
  },
  {
    id: 'ltpAboveLbb_15mSell',
    label: 'LTP > LBB(15m)',
    test: row => {
      const lbb = Number(row.lbb_15 || row.lbb15 || row.bbLower15 || 0);
      if (!(lbb > 0)) return false;
      const ltp = Number(row.ltp || row.last_price || row.price || 0);
      return ltp > lbb;
    }
  },
  {
    id: 'macdBelowZero_5mSell',
    label: 'MACD(5m) < 0',
    test: row => Number(row.macd5 || row.macd_5m) < 0
  },
  {
    id: 'minusDiAbovePlusDi_5mSell',
    label: '-DI(5m) > +DI(5m)',
    test: row => Number(row.minus_di5 || row.minusDI5 || row.mdi5) > Number(row.plus_di5 || row.plusDI5 || row.pdi5)
  }
];

function normalizeRows(rows) {
  return (rows || []).map(row => ({
    symbol: row.symbol || row.s || 'N/A',
    token: row.instrument_token || row.token || row.instrumentToken || null,
    ltp: Number(row.ltp || row.last_price || row.price || 0),
    volume: Number(row.volume || 0),
    change_percent: Number(row.change_percent || row.changePercent || 0),
    ema3_15: Number(row.ema3_15 || 0),
    ema3_5: Number(row.ema3_5 || row.ema3_5m || 0),
    ema3_1: Number(row.ema3_1 || row.ema3_1m || 0),
    ema4_1: Number(row.ema4_1 || row.ema4_1m || 0),
    ema5_15: Number(row.ema5_15 || row.ema5_15m || 0),
    ema5_5: Number(row.ema5_5 || row.ema5_5m || 0),
    ema5_1: Number(row.ema5_1 || row.ema5_1m || 0),
    ema9_15: Number(row.ema9_15 || row.ema9_15m || 0),
    ema9_5: Number(row.ema9_5 || row.ema9_5m || 0),
    ema9_1: Number(row.ema9_1 || row.ema9_1m || 0),
    mbb_1: Number(row.mbb_1 || row.mbb_1m || row.bbBasis1 || 0),
    lbb_1: Number(row.lbb_1 || row.lbb_1m || row.bbLower1 || 0),
    ubb_1: Number(row.ubb_1 || row.ubb_1m || row.bbUpper1 || 0),
    vwap1: Number(row.vwap1 || row.vwap_1m || row.vwap_1 || 0),
    ubb_5: Number(row.ubb_5 || row.ubb5 || row.bbUpper5 || 0),
    lbb_5: Number(row.lbb_5 || row.lbb5 || row.bbLower5 || 0),
    ubb_15: Number(row.ubb_15 || row.ubb15 || row.bbUpper15 || 0),
    lbb_15: Number(row.lbb_15 || row.lbb15 || row.bbLower15 || 0),
    macd15: Number(row.macd15 || row.macd_15m || 0),
    macd5: Number(row.macd5 || 0),
    macd1: Number(row.macd1 || row.macd_1m || 0),
    signal15: Number(row.signal15 || row.signal_15m || 0),
    signal5: Number(row.signal5 || 0),
    signal1: Number(row.signal1 || row.signal_1m || 0),
    rsi5: Number(row.rsi5 || row.rsi_5m || 0),
    rsi1: Number(row.rsi1 || row.rsi_1m || 0),
    adx15: Number(row.adx15 || row.adx_15m || 0),
    adx5: Number(row.adx5 || 0),
    adx1: Number(row.adx1 || row.adx_1m || 0),
    plusDI15: Number(row.plusDI15 || row.plus_di15 || row.pdi15 || 0),
    plusDI5: Number(row.plusDI5 || row.plus_di5 || row.pdi5 || 0),
    plusDI1: Number(row.plusDI1 || row.plus_di1 || row.pdi1 || 0),
    minusDI15: Number(row.minusDI15 || row.minus_di15 || row.mdi15 || 0),
    minusDI5: Number(row.minusDI5 || row.minus_di5 || row.mdi5 || 0),
    minusDI1: Number(row.minusDI1 || row.minus_di1 || row.mdi1 || 0)
  }));
}

function sortRows(rows, option) {
  const list = Array.isArray(rows) ? [...rows] : [];

  switch (option) {
    case 'ltpDesc':
      return list.sort((a, b) => Number(b?.ltp || 0) - Number(a?.ltp || 0));
    case 'ltpAsc':
      return list.sort((a, b) => Number(a?.ltp || 0) - Number(b?.ltp || 0));
    case 'symbolDesc':
      return list.sort((a, b) => String(b?.symbol || '').localeCompare(String(a?.symbol || '')));
    case 'symbolAsc':
    default:
      return list.sort((a, b) => String(a?.symbol || '').localeCompare(String(b?.symbol || '')));
  }
}

export default function SignalFilterPlayground({
  buyData = [],
  sellData = [],
  showFilters = true,
  showTables = true,
  title = 'Filtered Buy/Sell Tables (AND Logic)',
  onSymbolClick,
  buyChecks: buyChecksProp,
  sellChecks: sellChecksProp,
  onBuyChecksChange,
  onSellChecksChange,
  onFilteredBuyChange,
  onFilteredSellChange
}) {
  const [buyChecksState, setBuyChecksState] = useState({});
  const [sellChecksState, setSellChecksState] = useState({});
  const [tableSortOption, setTableSortOption] = useState('symbolAsc');
  const [buyBandsOpen, setBuyBandsOpen] = useState(false);
  const [sellBandsOpen, setSellBandsOpen] = useState(false);
  const buyChecks = buyChecksProp || buyChecksState;
  const sellChecks = sellChecksProp || sellChecksState;
  const setBuyChecks = onBuyChecksChange || setBuyChecksState;
  const setSellChecks = onSellChecksChange || setSellChecksState;

  const selectAllBuyFilters = () => {
    const next = {};
    buyFilterDefs.forEach(filter => {
      next[filter.id] = true;
    });
    setBuyChecks(next);
  };

  const clearAllBuyFilters = () => {
    setBuyChecks({});
  };

  const selectAllSellFilters = () => {
    const next = {};
    sellFilterDefs.forEach(filter => {
      next[filter.id] = true;
    });
    setSellChecks(next);
  };

  const clearAllSellFilters = () => {
    setSellChecks({});
  };

  const normalizedBuy = useMemo(() => {
    return normalizeRows(buyData);
  }, [buyData]);

  const normalizedSell = useMemo(() => {
    return normalizeRows(sellData);
  }, [sellData]);

  const filteredBuy = useMemo(() => {
    const active = buyFilterDefs.filter(f => buyChecks[f.id]);
    return normalizedBuy.filter(row => active.every(f => f.test(row)));
  }, [normalizedBuy, buyChecks]);

  const filteredSell = useMemo(() => {
    const active = sellFilterDefs.filter(f => sellChecks[f.id]);
    return normalizedSell.filter(row => active.every(f => f.test(row)));
  }, [normalizedSell, sellChecks]);

  const sortedFilteredBuy = useMemo(() => {
    return sortRows(filteredBuy, tableSortOption);
  }, [filteredBuy, tableSortOption]);

  const sortedFilteredSell = useMemo(() => {
    return sortRows(filteredSell, tableSortOption);
  }, [filteredSell, tableSortOption]);

  const formatPrice = (value) => {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toFixed(2) : '--';
  };

  const formatGapPct = (numerator, denominator) => {
    const base = Number(denominator || 0);
    if (!(base > 0)) return '--';
    const pct = (Math.abs(Number(numerator || 0)) / base) * 100;
    return `${pct.toFixed(4)}%`;
  };

  useEffect(() => {
    if (onFilteredBuyChange) {
      onFilteredBuyChange(filteredBuy);
    }
  }, [filteredBuy, onFilteredBuyChange]);

  useEffect(() => {
    if (onFilteredSellChange) {
      onFilteredSellChange(filteredSell);
    }
  }, [filteredSell, onFilteredSellChange]);

  if (!showFilters && !showTables) {
    return null;
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ fontWeight: 800, fontSize: '14px', color: '#f1f5f9', marginBottom: '8px' }}>
        {title}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <label style={{ color: '#cbd5e1', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Sort UI Filtered Tables
          <select
            value={tableSortOption}
            onChange={(e) => setTableSortOption(e.target.value)}
            style={{
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(148, 163, 184, 0.45)',
              color: '#e2e8f0',
              borderRadius: '6px',
              padding: '4px 8px',
              fontSize: '12px'
            }}
          >
            <option value="symbolAsc">Symbol A-Z</option>
            <option value="symbolDesc">Symbol Z-A</option>
            <option value="ltpDesc">LTP High-Low</option>
            <option value="ltpAsc">LTP Low-High</option>
          </select>
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(280px, 1fr))', gap: '12px', minWidth: '1120px' }}>
          <div style={baseCard}>
            <div style={{ color: '#86efac', fontWeight: 800, marginBottom: '10px', fontSize: '15px' }}>
              Buy Filters
            </div>
            {showFilters && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={selectAllBuyFilters}
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      color: '#a7f3d0',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllBuyFilters}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      color: '#fecaca',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Clear All
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: '18px' }}>
                  {buyFilterDefs.map(filter => (
                    <label key={filter.id} style={{ color: '#cbd5e1', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', lineHeight: '1.35' }}>
                      <input
                        type="checkbox"
                        checked={!!buyChecks[filter.id]}
                        onChange={e => setBuyChecks(prev => ({ ...prev, [filter.id]: e.target.checked }))}
                        style={{ width: '16px', height: '16px' }}
                      />
                      {filter.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={baseCard}>
            <div style={{ color: '#86efac', fontWeight: 800, marginBottom: '10px', fontSize: '15px' }}>
              Buy Stocks
            </div>
            {showTables && (
              <>
                <div style={{ color: '#a7f3d0', fontSize: '11px', marginBottom: '8px' }}>
                  Showing {filteredBuy.length} / {normalizedBuy.length} rows
                </div>

                <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '8px' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Symbol</th>
                        <th style={thStyle}>Chart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFilteredBuy.map((row, idx) => (
                        <tr key={`${row.symbol}-${idx}`}>
                          <td style={tdStyle}>{row.symbol}</td>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              onClick={() => onSymbolClick && onSymbolClick(row)}
                              style={{
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid rgba(59, 130, 246, 0.5)',
                                color: '#bfdbfe',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setBuyBandsOpen((prev) => !prev)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'rgba(30, 41, 59, 0.85)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      color: '#a7f3d0',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {buyBandsOpen ? '▼' : '▶'} Buy Bands Table (LBB / UBB / EMA3 / Gap%)
                  </button>

                  {buyBandsOpen && (
                    <div style={{ marginTop: '8px', maxHeight: '240px', overflow: 'auto', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '8px' }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Symbol</th>
                            <th style={thStyle}>LBB(1m)</th>
                            <th style={thStyle}>UBB(1m)</th>
                            <th style={thStyle}>EMA3(1m)</th>
                            <th style={thStyle}>Gap %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedFilteredBuy.map((row, idx) => (
                            <tr key={`${row.symbol}-buy-bands-${idx}`}>
                              <td style={tdStyle}>{row.symbol}</td>
                              <td style={tdStyle}>{formatPrice(row.lbb_1)}</td>
                              <td style={tdStyle}>{formatPrice(row.ubb_1)}</td>
                              <td style={tdStyle}>{formatPrice(row.ema3_1)}</td>
                              <td style={tdStyle}>{formatGapPct(Number(row.ubb_1 || 0) - Number(row.ema3_1 || 0), row.ubb_1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div style={baseCard}>
            <div style={{ color: '#fca5a5', fontWeight: 800, marginBottom: '10px', fontSize: '15px' }}>
              Sell Filters
            </div>
            {showFilters && (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={selectAllSellFilters}
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      color: '#a7f3d0',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllSellFilters}
                    style={{
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      color: '#fecaca',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Clear All
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: '18px' }}>
                  {sellFilterDefs.map(filter => (
                    <label key={filter.id} style={{ color: '#cbd5e1', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px', lineHeight: '1.35' }}>
                      <input
                        type="checkbox"
                        checked={!!sellChecks[filter.id]}
                        onChange={e => setSellChecks(prev => ({ ...prev, [filter.id]: e.target.checked }))}
                        style={{ width: '16px', height: '16px' }}
                      />
                      {filter.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={baseCard}>
            <div style={{ color: '#fca5a5', fontWeight: 800, marginBottom: '10px', fontSize: '15px' }}>
              Sell Stocks
            </div>
            {showTables && (
              <>
                <div style={{ color: '#fecaca', fontSize: '11px', marginBottom: '8px' }}>
                  Showing {filteredSell.length} / {normalizedSell.length} rows
                </div>

                <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '8px' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Symbol</th>
                        <th style={thStyle}>Chart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFilteredSell.map((row, idx) => (
                        <tr key={`${row.symbol}-${idx}`}>
                          <td style={tdStyle}>{row.symbol}</td>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              onClick={() => onSymbolClick && onSymbolClick(row)}
                              style={{
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid rgba(59, 130, 246, 0.5)',
                                color: '#bfdbfe',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSellBandsOpen((prev) => !prev)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'rgba(30, 41, 59, 0.85)',
                      border: '1px solid rgba(148, 163, 184, 0.35)',
                      color: '#fecaca',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {sellBandsOpen ? '▼' : '▶'} Sell Bands Table (LBB / UBB / EMA3 / Gap%)
                  </button>

                  {sellBandsOpen && (
                    <div style={{ marginTop: '8px', maxHeight: '240px', overflow: 'auto', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '8px' }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Symbol</th>
                            <th style={thStyle}>LBB(1m)</th>
                            <th style={thStyle}>UBB(1m)</th>
                            <th style={thStyle}>EMA3(1m)</th>
                            <th style={thStyle}>Gap %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedFilteredSell.map((row, idx) => (
                            <tr key={`${row.symbol}-sell-bands-${idx}`}>
                              <td style={tdStyle}>{row.symbol}</td>
                              <td style={tdStyle}>{formatPrice(row.lbb_1)}</td>
                              <td style={tdStyle}>{formatPrice(row.ubb_1)}</td>
                              <td style={tdStyle}>{formatPrice(row.ema3_1)}</td>
                              <td style={tdStyle}>{formatGapPct(Number(row.ema3_1 || 0) - Number(row.lbb_1 || 0), row.lbb_1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

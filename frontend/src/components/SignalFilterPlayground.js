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
    id: 'macdAboveSignal5m',
    label: 'MACD(5m) > Signal(5m)',
    test: row => Number(row.macd5 || row.macd_5m) > Number(row.signal5 || row.signal_5m)
  },
  {
    id: 'macdAboveZero5m',
    label: 'MACD(5m) > 0',
    test: row => Number(row.macd5 || row.macd_5m) > 0
  },
  {
    id: 'adxAbove25_5m',
    label: 'ADX(5m) > 20',
    test: row => Number(row.adx5 || row.adx_5m) > 20
  },
  {
    id: 'plusDiAbove25_5m',
    label: '+DI(5m) > 25',
    test: row => Number(row.plus_di5 || row.plusDI5 || row.pdi5) > 25
  },
  {
    id: 'minusDiBelow15_5m',
    label: '-DI(5m) < 15',
    test: row => Number(row.minus_di5 || row.minusDI5 || row.mdi5) < 15
  },
  {
    id: 'ema3AboveEma5_5m',
    label: 'EMA3(5m) > EMA5(5m)',
    test: row => Number(row.ema3_5 || row.ema3_5m) > Number(row.ema5_5 || row.ema5_5m)
  },
  {
    id: 'rsiAbove60_5m',
    label: 'RSI(5m) > 60',
    test: row => Number(row.rsi5 || row.rsi_5m) > 60
  },
  {
    id: 'adxAbove25_1m',
    label: 'ADX(1m) > 20',
    test: row => Number(row.adx1 || row.adx_1m) > 20
  },
  {
    id: 'plusDiAbove25_1m',
    label: '+DI(1m) > 25',
    test: row => Number(row.plus_di1 || row.plusDI1 || row.pdi1) > 25
  },
  {
    id: 'rsiAbove65_1m',
    label: 'RSI(1m) > 60',
    test: row => Number(row.rsi1 || row.rsi_1m) > 60
  },
  {
    id: 'ema9BelowEma3_5m',
    label: 'EMA9(1m) < EMA3(5m)',
    test: row => Number(row.ema9_1 || row.ema9_1m) < Number(row.ema3_5 || row.ema3_5m)
  }
];

const sellFilterDefs = [
  {
    id: 'macdBelowSignal5mSell',
    label: 'MACD(5m) < Signal(5m)',
    test: row => Number(row.macd5 || row.macd_5m) < Number(row.signal5 || row.signal_5m)
  },
  {
    id: 'macdBelowZero5mSell',
    label: 'MACD(5m) < 0',
    test: row => Number(row.macd5 || row.macd_5m) < 0
  },
  {
    id: 'adxAbove25_5mSell',
    label: 'ADX(5m) > 20',
    test: row => Number(row.adx5 || row.adx_5m) > 20
  },
  {
    id: 'minusDiAbove25_5mSell',
    label: '-DI(5m) > 25',
    test: row => Number(row.minus_di5 || row.minusDI5 || row.mdi5) > 25
  },
  {
    id: 'plusDiBelow15_5mSell',
    label: '+DI(5m) < 15',
    test: row => Number(row.plus_di5 || row.plusDI5 || row.pdi5) < 15
  },
  {
    id: 'ema3BelowEma5_5mSell',
    label: 'EMA3(5m) < EMA5(5m)',
    test: row => Number(row.ema3_5 || row.ema3_5m) < Number(row.ema5_5 || row.ema5_5m)
  },
  {
    id: 'rsiBelow40_5mSell',
    label: 'RSI(5m) < 40',
    test: row => Number(row.rsi5 || row.rsi_5m) < 40
  },
  {
    id: 'adxAbove25_1mSell',
    label: 'ADX(1m) > 20',
    test: row => Number(row.adx1 || row.adx_1m) > 20
  },
  {
    id: 'minusDiAbove25_1mSell',
    label: '-DI(1m) > 25',
    test: row => Number(row.minus_di1 || row.minusDI1 || row.mdi1) > 25
  },
  {
    id: 'rsiBelow35_1mSell',
    label: 'RSI(1m) < 40',
    test: row => Number(row.rsi1 || row.rsi_1m) < 40
  },
  {
    id: 'ema9AboveEma3_5mSell',
    label: 'EMA9(1m) > EMA3(5m)',
    test: row => Number(row.ema9_1 || row.ema9_1m) > Number(row.ema3_5 || row.ema3_5m)
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
    ema5_15: Number(row.ema5_15 || row.ema5_15m || 0),
    ema5_5: Number(row.ema5_5 || row.ema5_5m || 0),
    ema5_1: Number(row.ema5_1 || row.ema5_1m || 0),
    ema9_15: Number(row.ema9_15 || row.ema9_15m || 0),
    ema9_5: Number(row.ema9_5 || row.ema9_5m || 0),
    ema9_1: Number(row.ema9_1 || row.ema9_1m || 0),
    vwap1: Number(row.vwap1 || row.vwap_1m || row.vwap_1 || 0),
    ubb_5: Number(row.ubb_5 || row.ubb5 || row.bbUpper5 || 0),
    lbb_5: Number(row.lbb_5 || row.lbb5 || row.bbLower5 || 0),
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

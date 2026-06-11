import React, { useMemo, useState } from 'react';

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
    id: 'emaTrendAllTf',
    label: 'EMA3 > EMA5 on 1m, 5m, and 15m',
    test: row =>
      Number(row.ema3_1 || row.ema3_1m) > Number(row.ema5_1 || row.ema5_1m) &&
      Number(row.ema3_5 || row.ema3_5m) > Number(row.ema5_5 || row.ema5_5m) &&
      Number(row.ema3_15 || row.ema3_15m) > Number(row.ema5_15 || row.ema5_15m)
  },
  {
    id: 'ema5_5BelowEma3_15',
    label: 'EMA5(5m) < EMA3(15m)',
    test: row => Number(row.ema5_5 || row.ema5_5m) < Number(row.ema3_15 || row.ema3_15m)
  },
  {
    id: 'macdSignalAllTf',
    label: 'MACD > Signal on 5m and 15m',
    test: row =>
      Number(row.macd5 || row.macd_5m) > Number(row.signal5 || row.signal_5m) &&
      Number(row.macd15 || row.macd_15m) > Number(row.signal15 || row.signal_15m)
  },
  {
    id: 'macdAboveZero',
    label: 'MACD(1m) > 0 and MACD(5m) > 0',
    test: row => Number(row.macd1 || row.macd_1m) > 0 && Number(row.macd5 || row.macd_5m) > 0
  },
  {
    id: 'minusDiLow',
    label: '-DI(5m) < 15 OR -DI(15m) < 15',
    test: row => Number(row.minus_di5 || row.minusDI5 || row.mdi5) < 15 || Number(row.minus_di15 || row.minusDI15 || row.mdi15) < 15
  },
  {
    id: 'adxStrongAnyTf',
    label: 'ADX > 25 on 1m OR 5m OR 15m',
    test: row => Number(row.adx1 || row.adx_1m) > 25 || Number(row.adx5 || row.adx_5m) > 25 || Number(row.adx15 || row.adx_15m) > 25
  },
  {
    id: 'adxStrong5m',
    label: 'ADX(5m) > 25',
    test: row => Number(row.adx5 || row.adx_5m) > 25
  },
  {
    id: 'plusDiStrong',
    label: '+DI(5m) > 25 OR +DI(15m) > 25',
    test: row => Number(row.plus_di5 || row.plusDI5 || row.pdi5) > 25 || Number(row.plus_di15 || row.plusDI15 || row.pdi15) > 25
  },
  {
    id: 'plusDiOverAdx5Or15',
    label: '+DI(5m) > ADX(5m) OR +DI(15m) > ADX(15m)',
    test: row =>
      Number(row.plus_di5 || row.plusDI5 || row.pdi5) > Number(row.adx5 || row.adx_5m) ||
      Number(row.plus_di15 || row.plusDI15 || row.pdi15) > Number(row.adx15 || row.adx_15m)
  },
  {
    id: 'plusDiOverAdx1m',
    label: '+DI(1m) > 25 and (+DI(1m) > ADX(1m) OR ADX(1m) > 25)',
    test: row => {
      const plusDi1 = Number(row.plus_di1 || row.plusDI1 || row.pdi1);
      const adx1 = Number(row.adx1 || row.adx_1m);
      return plusDi1 > 25 && (plusDi1 > adx1 || adx1 > 25);
    }
  },
  {
    id: 'adxOverMinusDi1m',
    label: 'ADX(1m) > -DI(1m)',
    test: row => Number(row.adx1 || row.adx_1m) > Number(row.minus_di1 || row.minusDI1 || row.mdi1)
  },
  {
    id: 'ema5OverVwap1m',
    label: 'EMA5(1m) > VWAP(1m)',
    test: row => Number(row.ema5_1 || row.ema5_1m) > Number(row.vwap1 || row.vwap_1m)
  },
  {
    id: 'ema3BandBuy',
    label: 'LTP < UBB(5m)',
    test: row => Number(row.ltp) < Number(row.ubb_5 || row.ubb5 || row.bbUpper5)
  }
];

const sellFilterDefs = [
  {
    id: 'emaTrendAllTfSell',
    label: 'EMA3 < EMA5 on 1m, 5m, and 15m',
    test: row =>
      Number(row.ema3_1 || row.ema3_1m) < Number(row.ema5_1 || row.ema5_1m) &&
      Number(row.ema3_5 || row.ema3_5m) < Number(row.ema5_5 || row.ema5_5m) &&
      Number(row.ema3_15 || row.ema3_15m) < Number(row.ema5_15 || row.ema5_15m)
  },
  {
    id: 'ema5_5AboveEma3_15',
    label: 'EMA5(5m) > EMA3(15m)',
    test: row => Number(row.ema5_5 || row.ema5_5m) > Number(row.ema3_15 || row.ema3_15m)
  },
  {
    id: 'macdSignalAllTfSell',
    label: 'MACD < Signal on 5m and 15m',
    test: row =>
      Number(row.macd5 || row.macd_5m) < Number(row.signal5 || row.signal_5m) &&
      Number(row.macd15 || row.macd_15m) < Number(row.signal15 || row.signal_15m)
  },
  {
    id: 'macdBelowZero',
    label: 'MACD(1m) < 0 and MACD(5m) < 0',
    test: row => Number(row.macd1 || row.macd_1m) < 0 && Number(row.macd5 || row.macd_5m) < 0
  },
  {
    id: 'plusDiLow',
    label: '+DI(5m) < 15 OR +DI(15m) < 15',
    test: row => Number(row.plus_di5 || row.plusDI5 || row.pdi5) < 15 || Number(row.plus_di15 || row.plusDI15 || row.pdi15) < 15
  },
  {
    id: 'adxStrongAnyTfSell',
    label: 'ADX > 25 on 1m OR 5m OR 15m',
    test: row => Number(row.adx1 || row.adx_1m) > 25 || Number(row.adx5 || row.adx_5m) > 25 || Number(row.adx15 || row.adx_15m) > 25
  },
  {
    id: 'adxStrong5mSell',
    label: 'ADX(5m) > 25',
    test: row => Number(row.adx5 || row.adx_5m) > 25
  },
  {
    id: 'minusDiStrong',
    label: '-DI(5m) > 25 OR -DI(15m) > 25',
    test: row => Number(row.minus_di5 || row.minusDI5 || row.mdi5) > 25 || Number(row.minus_di15 || row.minusDI15 || row.mdi15) > 25
  },
  {
    id: 'minusDiOverAdx5Or15',
    label: '-DI(5m) > ADX(5m) OR -DI(15m) > ADX(15m)',
    test: row =>
      Number(row.minus_di5 || row.minusDI5 || row.mdi5) > Number(row.adx5 || row.adx_5m) ||
      Number(row.minus_di15 || row.minusDI15 || row.mdi15) > Number(row.adx15 || row.adx_15m)
  },
  {
    id: 'minusDiOverAdx1m',
    label: '-DI(1m) > 25 and (-DI(1m) > ADX(1m) OR ADX(1m) > 25)',
    test: row => {
      const minusDi1 = Number(row.minus_di1 || row.minusDI1 || row.mdi1);
      const adx1 = Number(row.adx1 || row.adx_1m);
      return minusDi1 > 25 && (minusDi1 > adx1 || adx1 > 25);
    }
  },
  {
    id: 'adxOverPlusDi1m',
    label: 'ADX(1m) > +DI(1m)',
    test: row => Number(row.adx1 || row.adx_1m) > Number(row.plus_di1 || row.plusDI1 || row.pdi1)
  },
  {
    id: 'ema5BelowVwap1m',
    label: 'EMA5(1m) < VWAP(1m)',
    test: row => Number(row.ema5_1 || row.ema5_1m) < Number(row.vwap1 || row.vwap_1m)
  },
  {
    id: 'ema3BandSell',
    label: 'LTP > LBB(5m)',
    test: row => Number(row.ltp) > Number(row.lbb_5 || row.lbb5 || row.bbLower5)
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
    vwap1: Number(row.vwap1 || row.vwap_1m || row.vwap_1 || 0),
    ubb_5: Number(row.ubb_5 || row.ubb5 || row.bbUpper5 || 0),
    lbb_5: Number(row.lbb_5 || row.lbb5 || row.bbLower5 || 0),
    macd15: Number(row.macd15 || row.macd_15m || 0),
    macd5: Number(row.macd5 || 0),
    macd1: Number(row.macd1 || row.macd_1m || 0),
    signal15: Number(row.signal15 || row.signal_15m || 0),
    signal5: Number(row.signal5 || 0),
    signal1: Number(row.signal1 || row.signal_1m || 0),
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
  onSellChecksChange
}) {
  const [buyChecksState, setBuyChecksState] = useState({});
  const [sellChecksState, setSellChecksState] = useState({});
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

  if (!showFilters && !showTables) {
    return null;
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <div style={{ fontWeight: 800, fontSize: '14px', color: '#f1f5f9', marginBottom: '8px' }}>
        {title}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: '18px', marginBottom: showTables ? '10px' : 0 }}>
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
                    {filteredBuy.map((row, idx) => (
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: '18px', marginBottom: showTables ? '10px' : 0 }}>
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
                    {filteredSell.map((row, idx) => (
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
  );
}

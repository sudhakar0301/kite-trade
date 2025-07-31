import React from 'react';

const TradingConditionsDisplay = ({ data }) => {
  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div style={{
      margin: '20px',
      padding: '15px',
      background: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #dee2e6'
    }}>
      <h3 style={{ 
        margin: '0 0 15px 0', 
        color: '#495057',
        fontSize: '18px',
        borderBottom: '2px solid #007bff',
        paddingBottom: '5px'
      }}>
        🎯 Trading Condition Values (Used for Buy/Sell Decisions)
      </h3>
      
      {data.map((item, index) => {
        const tradingValues = item.tradingConditionValues;
        if (!tradingValues) return null;

        const { fresh, live } = tradingValues;

        return (
          <div key={item.token || index} style={{
            marginBottom: '15px',
            padding: '12px',
            background: '#ffffff',
            borderRadius: '6px',
            border: '1px solid #e9ecef'
          }}>
            <h4 style={{ 
              margin: '0 0 10px 0', 
              color: '#007bff',
              fontSize: '16px'
            }}>
              {item.symbol} ({item.token})
            </h4>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '15px'
            }}>
              {/* Fresh Historical Indicators */}
              <div style={{
                padding: '10px',
                background: '#e8f5e9',
                borderRadius: '4px',
                border: '1px solid #c3e6cb'
              }}>
                <h5 style={{ 
                  margin: '0 0 8px 0', 
                  color: '#155724',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  📊 FRESH HISTORICAL (API-based)
                </h5>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <div><strong>VWAP:</strong> {fresh?.vwap_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>VWMA10:</strong> {fresh?.vwma10_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>VWMA20:</strong> {fresh?.vwma20_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>ADX:</strong> {fresh?.adx_1m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>+DI:</strong> {fresh?.plus_di_1m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>-DI:</strong> {fresh?.minus_di_1m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>MACD:</strong> {fresh?.macd_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>Signal:</strong> {fresh?.macd_signal_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>Histogram:</strong> {fresh?.macd_histogram_1m?.toFixed(4) || 'N/A'}</div>
                </div>
              </div>

              {/* Live Tick-based Indicators */}
              <div style={{
                padding: '10px',
                background: '#fff3cd',
                borderRadius: '4px',
                border: '1px solid #ffeaa7'
              }}>
                <h5 style={{ 
                  margin: '0 0 8px 0', 
                  color: '#856404',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  ⚡ LIVE TICK-BASED (Cache-based)
                </h5>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <div><strong>RSI 1H:</strong> {live?.rsi1h?.toFixed(2) || 'N/A'}</div>
                  <div><strong>RSI 15M:</strong> {live?.rsi15m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>RSI 1M:</strong> {live?.rsi1m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>EMA9:</strong> {live?.ema9_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>EMA21:</strong> {live?.ema21_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>OBV Current:</strong> {live?.obv_current?.toFixed(0) || 'N/A'}</div>
                  <div><strong>OBV Prev:</strong> {live?.obv_prev?.toFixed(0) || 'N/A'}</div>
                  <div><strong>ATR %:</strong> {live?.atr_percent_1m?.toFixed(3) || 'N/A'}%</div>
                  <div><strong>LTP:</strong> ₹{live?.ltp?.toFixed(2) || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Buy/Sell Condition Summary */}
            <div style={{
              marginTop: '10px',
              padding: '8px',
              background: item.buyCondition ? '#d4edda' : item.sellCondition ? '#f8d7da' : '#e2e3e5',
              borderRadius: '4px',
              border: `1px solid ${item.buyCondition ? '#c3e6cb' : item.sellCondition ? '#f5c6cb' : '#adb5bd'}`,
              fontSize: '13px',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              {item.buyCondition ? '🟢 BUY CONDITION MET' : 
               item.sellCondition ? '🔴 SELL CONDITION MET' : 
               '⚪ NO TRADING SIGNAL'}
            </div>
          </div>
        );
      })}
      
      <div style={{
        marginTop: '15px',
        padding: '10px',
        background: '#e9ecef',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#6c757d'
      }}>
        <strong>📝 Note:</strong> Fresh Historical indicators use pure API data calculated every minute. 
        Live indicators use tick-based cache data updated in real-time. 
        Trading conditions use the appropriate source for each indicator type.
      </div>
    </div>
  );
};

export default TradingConditionsDisplay;

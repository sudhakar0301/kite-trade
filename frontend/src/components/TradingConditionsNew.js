import React from 'react';

const TradingConditionsDisplay = ({ data }) => {
  if (!data || data.length === 0) {
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
        <p>No trading condition data available</p>
      </div>
    );
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

        const { fresh, live, tradingConditions } = tradingValues;

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

            {/* Trading Condition Evaluations */}
            {tradingConditions && (
              <div style={{ marginBottom: '15px' }}>
                <h5 style={{ color: '#28a745', marginBottom: '8px' }}>
                  🚀 BUY Conditions {tradingConditions.buy?.overall ? '✅ MET' : '❌ NOT MET'}:
                </h5>
                <div style={{ fontSize: '13px', marginBottom: '10px', paddingLeft: '10px' }}>
                  <div>• RSI 1H &gt; 60: <span style={{ color: tradingConditions.buy?.rsi1hBuy ? 'green' : 'red', fontWeight: 'bold' }}>
                    {live?.rsi1h?.toFixed(2)} &gt; 60 = {tradingConditions.buy?.rsi1hBuy ? 'TRUE' : 'FALSE'}
                  </span></div>
                  <div>• RSI 15M &gt; 60: <span style={{ color: tradingConditions.buy?.rsi15mBuy ? 'green' : 'red', fontWeight: 'bold' }}>
                    {live?.rsi15m?.toFixed(2)} &gt; 60 = {tradingConditions.buy?.rsi15mBuy ? 'TRUE' : 'FALSE'}
                  </span></div>
                  <div>• EMA9 &gt; EMA21: <span style={{ color: tradingConditions.buy?.emaCrossoverBuy ? 'green' : 'red', fontWeight: 'bold' }}>
                    {live?.ema9_1m?.toFixed(2)} &gt; {live?.ema21_1m?.toFixed(2)} = {tradingConditions.buy?.emaCrossoverBuy ? 'TRUE' : 'FALSE'}
                  </span></div>
                  <div>• RSI 1M &gt; 65: <span style={{ color: tradingConditions.buy?.rsi1mBuy ? 'green' : 'red', fontWeight: 'bold' }}>
                    {live?.rsi1m?.toFixed(2)} &gt; 65 = {tradingConditions.buy?.rsi1mBuy ? 'TRUE' : 'FALSE'}
                  </span></div>
                </div>

                <h5 style={{ color: '#dc3545', marginBottom: '8px' }}>
                  📉 SELL Conditions {tradingConditions.sell?.overall ? '✅ MET' : '❌ NOT MET'}:
                </h5>
                <div style={{ fontSize: '13px', marginBottom: '10px', paddingLeft: '10px' }}>
                  <div>• RSI 1H &lt; 40: <span style={{ color: tradingConditions.sell?.rsi1hSell ? 'red' : 'gray', fontWeight: 'bold' }}>
                    {live?.rsi1h?.toFixed(2)} &lt; 40 = {tradingConditions.sell?.rsi1hSell ? 'TRUE' : 'FALSE'}
                  </span></div>
                  <div>• RSI 15M &lt; 35: <span style={{ color: tradingConditions.sell?.rsi15mSell ? 'red' : 'gray', fontWeight: 'bold' }}>
                    {live?.rsi15m?.toFixed(2)} &lt; 35 = {tradingConditions.sell?.rsi15mSell ? 'TRUE' : 'FALSE'}
                  </span></div>
                  <div>• EMA9 &lt; EMA21: <span style={{ color: tradingConditions.sell?.emaCrossoverSell ? 'red' : 'gray', fontWeight: 'bold' }}>
                    {live?.ema9_1m?.toFixed(2)} &lt; {live?.ema21_1m?.toFixed(2)} = {tradingConditions.sell?.emaCrossoverSell ? 'TRUE' : 'FALSE'}
                  </span></div>
                  <div>• RSI 1M &lt; 40: <span style={{ color: tradingConditions.sell?.rsi1mSell ? 'red' : 'gray', fontWeight: 'bold' }}>
                    {live?.rsi1m?.toFixed(2)} &lt; 40 = {tradingConditions.sell?.rsi1mSell ? 'TRUE' : 'FALSE'}
                  </span></div>
                </div>
              </div>
            )}
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '15px',
              marginBottom: '15px'
            }}>
              {/* Fresh Historical Indicators */}
              <div>
                <h5 style={{ 
                  margin: '0 0 8px 0', 
                  color: '#28a745',
                  fontSize: '14px',
                  borderBottom: '1px solid #28a745',
                  paddingBottom: '2px'
                }}>
                  📊 Fresh Historical (API-based)
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

              {/* Live Indicators (Used in Trading Conditions) */}
              <div>
                <h5 style={{ 
                  margin: '0 0 8px 0', 
                  color: '#dc3545',
                  fontSize: '14px',
                  borderBottom: '1px solid #dc3545',
                  paddingBottom: '2px'
                }}>
                  ⚡ Live (Used for Trading)
                </h5>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <div><strong>RSI 1H:</strong> {live?.rsi1h?.toFixed(2) || 'N/A'}</div>
                  <div><strong>RSI 15M:</strong> {live?.rsi15m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>RSI 1M:</strong> {live?.rsi1m?.toFixed(2) || 'N/A'}</div>
                  <div><strong>EMA9:</strong> {live?.ema9_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>EMA21:</strong> {live?.ema21_1m?.toFixed(4) || 'N/A'}</div>
                  <div><strong>OBV Current:</strong> {live?.obv_current?.toFixed(0) || 'N/A'}</div>
                  <div><strong>ATR %:</strong> {live?.atr_percent_1m?.toFixed(3) || 'N/A'}%</div>
                  <div><strong>LTP:</strong> ₹{live?.ltp?.toFixed(2) || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Overall Trading Signal */}
            <div style={{
              padding: '10px',
              background: tradingConditions?.buy?.overall ? '#d4edda' : tradingConditions?.sell?.overall ? '#f8d7da' : '#e2e3e5',
              borderRadius: '4px',
              border: `1px solid ${tradingConditions?.buy?.overall ? '#c3e6cb' : tradingConditions?.sell?.overall ? '#f5c6cb' : '#adb5bd'}`,
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'center',
              color: tradingConditions?.buy?.overall ? '#155724' : tradingConditions?.sell?.overall ? '#721c24' : '#495057'
            }}>
              {tradingConditions?.buy?.overall ? '🚀 BUY SIGNAL ACTIVE' : 
               tradingConditions?.sell?.overall ? '📉 SELL SIGNAL ACTIVE' : 
               '⏸️ NO TRADING SIGNAL'}
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
        <strong>📝 Note:</strong> Fresh Historical indicators (VWAP, VWMA, ADX, MACD) use pure API data calculated every minute. 
        Live indicators (RSI, EMA, OBV) use tick-based cache data for trading conditions. 
        The values shown above are the exact same values used for buy/sell decision making.
      </div>
    </div>
  );
};

export default TradingConditionsDisplay;

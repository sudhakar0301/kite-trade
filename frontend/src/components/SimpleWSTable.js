import React, { useState, useEffect, useRef } from "react";

function SimpleWSTable({ data }) {
  console.log("🔥 SimpleWSTable received data:", data);
  
  // State to track previous values for highlighting changes
  const [previousData, setPreviousData] = useState({});
  const [changedFields, setChangedFields] = useState({});
  const [changes, setChanges] = useState({});
  const timeoutRefs = useRef({});
  
  // Track changes when data updates
  useEffect(() => {
    if (!data || data.length === 0) return;
    
    const newChangedFields = {};
    
    data.forEach(item => {
      const token = item.token;
      const prev = previousData[token];
      
      if (prev) {
        // Check for changes in key fields
        const fieldsToCheck = [
          'ltp', 'rsi1m', 'rsiArray', 'ema9_1m', 'ema21_1m', 'vwma20_1m', 'vwma20Array',
          'macd_1m', 'macd_signal_1m', 'macdArray', 'signalArray',
          'adx_1m', 'plus_di_1m', 'minus_di_1m', 'plusDIArray', 'minusDIArray', 
          'atr_1m', 'atr_percent_1m', 'atrArray', 'vwap_1m', 'vwapArray'
        ];
        let hasChanges = false;
        
        fieldsToCheck.forEach(field => {
          let hasChanged = false;
          
          // Special handling for arrays
          if (field === 'rsiArray' || field === 'vwma20Array' || field === 'macdArray' || 
              field === 'signalArray' || field === 'plusDIArray' || 
              field === 'minusDIArray' || field === 'atrArray' || field === 'vwapArray') {
            const prevArray = prev[field];
            const currentArray = item[field];
            
            // Compare arrays by checking if they have different lengths or different last value
            if (!prevArray && currentArray) {
              hasChanged = true;
            } else if (prevArray && !currentArray) {
              hasChanged = true;
            } else if (prevArray && currentArray) {
              hasChanged = prevArray.length !== currentArray.length || 
                          (prevArray.length > 0 && currentArray.length > 0 && 
                           prevArray[prevArray.length - 1] !== currentArray[currentArray.length - 1]);
            }
          } else {
            // Regular comparison for non-array fields
            hasChanged = prev[field] !== item[field];
          }
          
          if (hasChanged) {
            if (!newChangedFields[token]) newChangedFields[token] = {};
            newChangedFields[token][field] = true;
            hasChanges = true;
            
            // Clear highlight after 1 second
            const timeoutKey = `${token}-${field}`;
            if (timeoutRefs.current[timeoutKey]) {
              clearTimeout(timeoutRefs.current[timeoutKey]);
            }
            timeoutRefs.current[timeoutKey] = setTimeout(() => {
              setChangedFields(prev => {
                const updated = {...prev};
                if (updated[token]) {
                  delete updated[token][field];
                  if (Object.keys(updated[token]).length === 0) {
                    delete updated[token];
                  }
                }
                return updated;
              });
              setChanges(prev => {
                const updated = {...prev};
                delete updated[token];
                return updated;
              });
            }, 1000);
          }
        });
        
        if (hasChanges) {
          setChanges(prev => ({...prev, [token]: true}));
        }
      }
    });
    
    setChangedFields(prev => ({...prev, ...newChangedFields}));
    
    // Update previous data
    const newPreviousData = {};
    data.forEach(item => {
      newPreviousData[item.token] = {...item};
    });
    setPreviousData(newPreviousData);
    
  }, [data]); // Removed previousData from dependency array
  
  // Helper function to get highlight style for changed fields
  const getHighlightStyle = (token, field) => {
    if (changedFields[token] && changedFields[token][field]) {
      return {
        background: '#dbeafe',
        border: '1px solid #0ea5e9',
        borderRadius: '3px',
        transition: 'all 0.3s ease',
        position: 'relative'
      };
    }
    return {};
  };
  
  // Debug: Log specific values for the first item
  if (data && data.length > 0) {
    const firstItem = data[0];
    console.log("🔍 Debug first item values:", {
      symbol: firstItem.symbol,
      ltp: firstItem.ltp,
      // 1-minute indicators
      ema9_1m: firstItem.ema9_1m,
      ema21_1m: firstItem.ema21_1m,
      vwma20_1m: firstItem.vwma20_1m,
      vwma20Array: firstItem.vwma20Array?.slice(-5), // Show last 5 values
      vwma20ArrayLength: firstItem.vwma20Array?.length,
      rsi1m: firstItem.rsi1m,
      rsiArray: firstItem.rsiArray?.slice(-5), // Show last 5 values
      rsiArrayLength: firstItem.rsiArray?.length,
      // MACD indicators
      macd_1m: firstItem.macd_1m,
      macd_signal_1m: firstItem.macd_signal_1m,
      macdArray: firstItem.macdArray?.slice(-5),
      signalArray: firstItem.signalArray?.slice(-5),
      // ADX indicators
      adx_1m: firstItem.adx_1m,
      plus_di_1m: firstItem.plus_di_1m,
      minus_di_1m: firstItem.minus_di_1m,
      plusDIArray: firstItem.plusDIArray?.slice(-5),
      minusDIArray: firstItem.minusDIArray?.slice(-5),
      // ATR
      atr_1m: firstItem.atr_1m,
      atr_percent_1m: firstItem.atr_percent_1m,
      atrArray: firstItem.atrArray?.slice(-5),
      // VWAP
      vwap_1m: firstItem.vwap_1m,
      vwapArray: firstItem.vwapArray?.slice(-5)
    });
  }
  
  if (!data || data.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{ textAlign: 'center', color: '#333333' }}>
          <h2 style={{margin: '0 0 20px 0', fontSize: '24px', fontWeight: '400', color: '#666'}}>
            Trading Monitor
          </h2>
          <div style={{
            padding: '16px 24px',
            border: '1px solid #e0e0e0',
            borderRadius: '4px',
            background: '#f8f9fa',
            fontSize: '14px',
            color: '#666'
          }}>
            {data ? `${data.length} tokens connected` : 'Connecting...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: '#f8fafc',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px 0'
    }}>
      <style>{`
        .modern-table {
          width: 95%;
          max-width: 1600px;
          margin: 0 auto;
          border-collapse: collapse;
          background: white;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
        }
        .modern-table th {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white;
          font-weight: 600;
          font-size: 12px;
          padding: 12px 8px;
          text-align: center;
          border: none;
          white-space: nowrap;
        }
        .modern-table td {
          padding: 8px 6px;
          text-align: center;
          border-bottom: 1px solid #f1f5f9;
          font-size: 12px;
          vertical-align: top;
          white-space: nowrap;
        }
        .indicator-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          min-height: 60px;
        }
        .current-value {
          font-size: 13px;
          font-weight: bold;
          padding: 4px 6px;
          border-radius: 4px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          min-width: 60px;
        }
        .array-values {
          display: flex;
          flex-direction: column;
          gap: 1px;
          font-size: 9px;
          color: #666;
          line-height: 1.2;
        }
        .array-value {
          padding: 1px 3px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 2px;
          min-width: 40px;
        }
        .modern-table tbody tr:hover {
          background-color: #f1f5f9;
          transition: background-color 0.15s ease;
        }
        .modern-table tbody tr:nth-child(even) {
          background-color: #fafafa;
        }
        @keyframes pulse-blue {
          0% { 
            background-color: #dbeafe; 
            border-color: #60a5fa;
          }
          50% { 
            background-color: #bfdbfe; 
            border-color: #3b82f6;
          }
          100% { 
            background-color: #dbeafe; 
            border-color: #60a5fa;
          }
        }
        .updated-cell {
          animation: pulse-blue 0.8s ease-in-out;
        }
        .update-indicator {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #0ea5e9;
          border-radius: 50%;
          margin-left: 4px;
          animation: pulse 1s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <div style={{
        padding: '8px 12px',
        background: 'rgba(255, 255, 255, 0.95)',
        borderBottom: '1px solid #e5e7eb',
        backdropFilter: 'blur(10px)'
      }}>
        <h1 style={{
          margin: '0',
          fontSize: '20px',
          fontWeight: '600',
          color: '#1f2937'
        }}>
          Trading Monitor
        </h1>
        <p style={{
          margin: '2px 0 0 0',
          fontSize: '12px',
          color: '#6b7280'
        }}>
          {data.length} tokens • {new Date().toLocaleTimeString()}
        </p>
      </div>
      <table className="modern-table">
        <thead>
          <tr>
            <th style={{minWidth: '120px'}}>Symbol</th>
            <th style={{minWidth: '100px'}}>LTP</th>
            <th style={{minWidth: '140px'}}>RSI 1M</th>
            <th style={{minWidth: '100px'}}>EMA9</th>
            <th style={{minWidth: '100px'}}>EMA21</th>
            <th style={{minWidth: '140px'}}>VWMA20</th>
            <th style={{minWidth: '140px'}}>VWAP</th>
            <th style={{minWidth: '140px'}}>MACD</th>
            <th style={{minWidth: '140px'}}>Signal</th>
            <th style={{minWidth: '100px'}}>ADX</th>
            <th style={{minWidth: '140px'}}>+DI</th>
            <th style={{minWidth: '140px'}}>-DI</th>
            <th style={{minWidth: '140px'}}>ATR%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={`${item.token}-${index}`}>
              <td style={{ fontWeight: '600', color: '#374151', fontSize: '13px' }}>{item.symbol || 'N/A'}</td>
              
              {/* LTP */}
              <td style={{
                color: '#1f2937',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'ltp')
              }}>
                {item.ltp?.toFixed(2) || '-'}
                {changedFields[item.token]?.ltp && <span className="update-indicator"></span>}
              </td>
              
              {/* RSI 1M */}
              <td style={{
                ...getHighlightStyle(item.token, 'rsi1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: item.rsi1m ? (item.rsi1m > 70 ? 'red' : item.rsi1m < 30 ? 'green' : '#333') : '#999',
                      backgroundColor: item.rsi1m > 70 ? 'rgba(239, 68, 68, 0.1)' : item.rsi1m < 30 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                    }}
                  >
                    {item.rsi1m?.toFixed(1) || '-'}
                  </div>
                  {item.rsiArray && item.rsiArray.length > 0 && (
                    <div className="array-values">
                      {item.rsiArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(1)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.rsi1m && <span className="update-indicator"></span>}
              </td>
              
              {/* EMA9 */}
              <td style={{
                color: '#4a5568',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'ema9_1m')
              }}>
                {item.ema9_1m?.toFixed(2) || '-'}
                {changedFields[item.token]?.ema9_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* EMA21 */}
              <td style={{
                color: '#4a5568',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'ema21_1m')
              }}>
                {item.ema21_1m?.toFixed(2) || '-'}
                {changedFields[item.token]?.ema21_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* VWMA20 */}
              <td style={{
                ...getHighlightStyle(item.token, 'vwma20_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: '#9333ea',
                      backgroundColor: 'rgba(147, 51, 234, 0.1)',
                      borderColor: 'rgba(147, 51, 234, 0.2)'
                    }}
                  >
                    {item.vwma20_1m?.toFixed(2) || '-'}
                  </div>
                  {item.vwma20Array && item.vwma20Array.length > 0 && (
                    <div className="array-values">
                      {item.vwma20Array.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.vwma20_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* VWAP */}
              <td style={{
                ...getHighlightStyle(item.token, 'vwap_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: '#dc2626',
                      backgroundColor: 'rgba(220, 38, 38, 0.1)',
                      borderColor: 'rgba(220, 38, 38, 0.2)'
                    }}
                  >
                    {item.vwap_1m?.toFixed(2) || '-'}
                  </div>
                  {item.vwapArray && item.vwapArray.length > 0 && (
                    <div className="array-values">
                      {item.vwapArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.vwap_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* MACD */}
              <td style={{
                ...getHighlightStyle(item.token, 'macd_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: item.macd_1m ? (item.macd_1m > 0 ? '#16a34a' : '#dc2626') : '#999',
                      backgroundColor: item.macd_1m > 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                      borderColor: item.macd_1m > 0 ? 'rgba(22, 163, 74, 0.2)' : 'rgba(220, 38, 38, 0.2)'
                    }}
                  >
                    {item.macd_1m?.toFixed(4) || '-'}
                  </div>
                  {item.macdArray && item.macdArray.length > 0 && (
                    <div className="array-values">
                      {item.macdArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(4)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.macd_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* MACD Signal */}
              <td style={{
                ...getHighlightStyle(item.token, 'macd_signal_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: '#6366f1',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      borderColor: 'rgba(99, 102, 241, 0.2)'
                    }}
                  >
                    {item.macd_signal_1m?.toFixed(4) || '-'}
                  </div>
                  {item.signalArray && item.signalArray.length > 0 && (
                    <div className="array-values">
                      {item.signalArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(4)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.macd_signal_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* ADX */}
              <td style={{
                color: item.adx_1m ? (item.adx_1m > 25 ? '#0ea5e9' : '#94a3b8') : '#999',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'adx_1m')
              }}>
                {item.adx_1m?.toFixed(2) || '-'}
                {changedFields[item.token]?.adx_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* +DI */}
              <td style={{
                ...getHighlightStyle(item.token, 'plus_di_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: '#16a34a',
                      backgroundColor: 'rgba(22, 163, 74, 0.1)',
                      borderColor: 'rgba(22, 163, 74, 0.2)'
                    }}
                  >
                    {item.plus_di_1m?.toFixed(2) || '-'}
                  </div>
                  {item.plusDIArray && item.plusDIArray.length > 0 && (
                    <div className="array-values">
                      {item.plusDIArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.plus_di_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* -DI */}
              <td style={{
                ...getHighlightStyle(item.token, 'minus_di_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: '#dc2626',
                      backgroundColor: 'rgba(220, 38, 38, 0.1)',
                      borderColor: 'rgba(220, 38, 38, 0.2)'
                    }}
                  >
                    {item.minus_di_1m?.toFixed(2) || '-'}
                  </div>
                  {item.minusDIArray && item.minusDIArray.length > 0 && (
                    <div className="array-values">
                      {item.minusDIArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.minus_di_1m && <span className="update-indicator"></span>}
              </td>
              
              {/* ATR% */}
              <td style={{
                ...getHighlightStyle(item.token, 'atr_percent_1m')
              }}>
                <div className="indicator-cell">
                  <div 
                    className="current-value"
                    style={{
                      color: '#7c2d12',
                      backgroundColor: 'rgba(124, 45, 18, 0.1)',
                      borderColor: 'rgba(124, 45, 18, 0.2)'
                    }}
                  >
                    {item.atr_percent_1m?.toFixed(2) || '-'}%
                  </div>
                  <div style={{ 
                    fontSize: '9px', 
                    color: '#666', 
                    marginBottom: '2px'
                  }}>
                    ATR: {item.atr_1m?.toFixed(2) || '-'}
                  </div>
                  {item.atrArray && item.atrArray.length > 0 && (
                    <div className="array-values">
                      {item.atrArray.slice(-5).map((val, idx) => (
                        <div key={idx} className="array-value">
                          {val?.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {changedFields[item.token]?.atr_percent_1m && <span className="update-indicator"></span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SimpleWSTable;

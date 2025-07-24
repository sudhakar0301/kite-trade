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
          'ltp', 'rsi1m', 'ema9_1m', 'ema21_1m',
          'buyCondition', 'sellCondition',
          'rsi1h', 'rsi15m'
        ];
        let hasChanges = false;
        
        fieldsToCheck.forEach(field => {
          if (prev[field] !== item[field]) {
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
      // 1-minute indicators
      ema9_1m: firstItem.ema9_1m,
      ema21_1m: firstItem.ema21_1m,
      rsi1m: firstItem.rsi1m,
      rsi1h: firstItem.rsi1h,
      rsi15m: firstItem.rsi15m,
      rsiArrayExists: !!firstItem.rsiArray,
      rsiArrayLength: firstItem.rsiArray?.length || 0,
      last10RSI: firstItem.rsiArray?.slice(-10) || [],
      // Condition flags
      buyCondition: firstItem.buyCondition,
      sellCondition: firstItem.sellCondition
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
          padding: 10px 7px;
          text-align: center;
          border-bottom: 1px solid #f1f5f9;
          font-size: 12px;
          vertical-align: middle;
          white-space: nowrap;
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
            <th style={{minWidth: '100px'}}>Symbol</th>
            <th style={{minWidth: '80px'}}>RSI 1M</th>
            <th style={{minWidth: '80px'}}>EMA9</th>
            <th style={{minWidth: '80px'}}>EMA21</th>
            <th style={{minWidth: '90px'}}>RSI 1H</th>
            <th style={{minWidth: '90px'}}>RSI 15M</th>
            <th style={{minWidth: '70px'}}>BUY</th>
            <th style={{minWidth: '70px'}}>SELL</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={`${item.token}-${index}`}>
              <td style={{ fontWeight: '600', color: '#374151', fontSize: '13px' }}>{item.symbol || 'N/A'}</td>
              
              {/* RSI 1M */}
              <td style={{
                color: item.rsi1m ? (item.rsi1m > 70 ? 'red' : item.rsi1m < 30 ? 'green' : '#666') : '#999',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'rsi1m')
              }}>
                {item.rsi1m?.toFixed(1) || '-'}
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
              
              {/* RSI 1H */}
              <td style={{
                color: item.rsi1h ? (item.rsi1h > 70 ? 'red' : item.rsi1h < 30 ? 'green' : '#666') : '#999',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'rsi1h')
              }}>
                {item.rsi1h?.toFixed(1) || '-'}
                {changedFields[item.token]?.rsi1h && <span className="update-indicator"></span>}
              </td>
              
              {/* RSI 15M */}
              <td style={{
                color: item.rsi15m ? (item.rsi15m > 70 ? 'red' : item.rsi15m < 30 ? 'green' : '#666') : '#999',
                fontWeight: 'bold', 
                fontSize: '12px',
                ...getHighlightStyle(item.token, 'rsi15m')
              }}>
                {item.rsi15m?.toFixed(1) || '-'}
                {changedFields[item.token]?.rsi15m && <span className="update-indicator"></span>}
              </td>
              
              {/* BUY Condition */}
              <td style={{
                color: item.buyCondition ? 'green' : 'gray', 
                fontWeight: 'bold', 
                fontSize: '14px',
                ...getHighlightStyle(item.token, 'buyCondition')
              }}>
                {item.buyCondition ? 'BUY' : 'WAIT'}
                {changedFields[item.token]?.buyCondition && <span className="update-indicator"></span>}
              </td>
              
              {/* SELL Condition */}
              <td style={{
                color: item.sellCondition ? 'red' : 'gray', 
                fontWeight: 'bold', 
                fontSize: '14px',
                ...getHighlightStyle(item.token, 'sellCondition')
              }}>
                {item.sellCondition ? 'SELL' : 'HOLD'}
                {changedFields[item.token]?.sellCondition && <span className="update-indicator"></span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SimpleWSTable;

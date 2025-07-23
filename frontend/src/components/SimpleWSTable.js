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
        const fieldsToCheck = ['ltp', 'rsi1m', 'rsiArray', 'ema9_1m', 'ema21_1m', 'vwap1m'];
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
        background: '#f0f9ff',
        border: '1px solid #0ea5e9',
        borderRadius: '3px',
        transition: 'all 0.3s ease'
      };
    }
    return {};
  };
  
  // Debug: Log specific values for the first item
  if (data && data.length > 0) {
    const firstItem = data[0];
    console.log("🔍 Debug first item values:", {
      symbol: firstItem.symbol,
      ema9_1m: firstItem.ema9_1m,
      ema21_1m: firstItem.ema21_1m,
      vwap1m: firstItem.vwap1m,
      rsi1m: firstItem.rsi1m,
      rsiArrayExists: !!firstItem.rsiArray,
      rsiArrayLength: firstItem.rsiArray?.length || 0,
      last10RSI: firstItem.rsiArray?.slice(-10) || []
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
          width: 70%;
          margin: 0 auto;
          border-collapse: collapse;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .modern-table th {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white;
          font-weight: 600;
          font-size: 12px;
          padding: 12px 8px;
          text-align: center;
          border: none;
        }
        .modern-table td {
          padding: 8px;
          text-align: center;
          border-bottom: 1px solid #f1f5f9;
          font-size: 11px;
          vertical-align: middle;
        }
        .modern-table tbody tr:hover {
          background-color: #f1f5f9;
          transition: background-color 0.15s ease;
        }
        .modern-table tbody tr:nth-child(even) {
          background-color: #fafafa;
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
            <th>Symbol</th>
            <th>Price</th>
            <th>RSI (1m)</th>
            <th>Last 10 RSI</th>
            <th>EMA9</th>
            <th>EMA21</th>
            <th>VWAP</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={`${item.token}-${index}`}>
              <td style={{ fontWeight: '600', color: '#374151' }}>{item.symbol || 'N/A'}</td>
              <td style={{ fontWeight: '500', color: '#1f2937', ...getHighlightStyle(item.token, 'ltp') }}>₹{(item.ltp || 0).toFixed(2)}</td>
              <td style={{ ...getHighlightStyle(item.token, 'rsi1m') }}>{item.rsi1m?.toFixed(2) || 'N/A'}</td>
              <td style={{ ...getHighlightStyle(item.token, 'rsiArray') }}>
                <div style={{ display: 'flex', gap: '2px', fontSize: '10px', justifyContent: 'center' }}>
                  {item.rsiArray && item.rsiArray.length >= 10
                    ? item.rsiArray.slice(-10).map((rsiVal, idx) => (
                        <span key={idx} style={{
                          padding: '2px 4px',
                          borderRadius: '2px',
                          background: rsiVal > 68 ? '#fee2e2' : rsiVal < 32 ? '#fef3c7' : '#f0f9ff',
                          color: rsiVal > 68 ? '#dc2626' : rsiVal < 32 ? '#d97706' : '#1e40af',
                          fontWeight: '500'
                        }}>{rsiVal.toFixed(0)}</span>
                      ))
                    : <span style={{ color: '#d97706', fontStyle: 'italic' }}>Waiting...</span>}
                </div>
              </td>
              <td style={{ ...getHighlightStyle(item.token, 'ema9_1m') }}>{item.ema9_1m?.toFixed(2) || 'N/A'}</td>
              <td style={{ ...getHighlightStyle(item.token, 'ema21_1m') }}>{item.ema21_1m?.toFixed(2) || 'N/A'}</td>
              <td style={{ ...getHighlightStyle(item.token, 'vwap1m') }}>{item.vwap1m?.toFixed(2) || 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SimpleWSTable;

import React from "react";

function DebugDataDisplay({ data, title }) {
  console.log("🔍 DebugDataDisplay - Received data:", data);
  
  return (
    <div style={{
      padding: '20px',
      margin: '10px 0',
      border: '2px solid #ff5722',
      borderRadius: '8px',
      backgroundColor: '#fff3e0'
    }}>
      <h3 style={{color: '#d84315'}}>{title}</h3>
      <div>
        <p><strong>Data Type:</strong> {Array.isArray(data) ? 'Array' : typeof data}</p>
        <p><strong>Data Length:</strong> {data ? data.length : 'null/undefined'}</p>
        <p><strong>Raw Data:</strong></p>
        <pre style={{
          backgroundColor: '#f5f5f5',
          padding: '10px',
          borderRadius: '4px',
          fontSize: '12px',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
        {data && data.length > 0 && (
          <div>
            <p><strong>First Item Fields:</strong></p>
            <ul>
              {Object.keys(data[0]).map(key => (
                <li key={key}>{key}: {typeof data[0][key]} = {JSON.stringify(data[0][key])}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default DebugDataDisplay;

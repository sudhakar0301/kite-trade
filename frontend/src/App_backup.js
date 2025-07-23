import React, { useEffect, useState } from "react";
import RsiTable from "./components/RsiTable";
import NewStrategyTable from "./components/NewStrategyTable";
import SimplifiedStrategyTable from "./components/SimplifiedStrategyTable";
import SimpleDataTable from "./components/SimpleDataTable";
import NewBuyConditionsTable from "./components/NewBuyConditionsTable";
import ClearTradingTable from "./components/ClearTradingTable";

function App() {
  const [allTokens, setAllTokens] = useState([]); // Change to array instead of Map
  const [testCounter, setTestCounter] = useState(0); // Simple test counter
  const [newStrategyTokens, setNewStrategyTokens] = useState(new Map()); // New strategy tokens
  const [simplifiedTokens, setSimplifiedTokens] = useState(new Map()); // Simplified strategy tokens
  const [scanStatus, setScanStatus] = useState({ isScanning: false, lastScan: null, filteredCount: 0 });
  const [notification, setNotification] = useState(null); // Notification state
  const [lastUpdate, setLastUpdate] = useState(Date.now()); // Force re-render trigger

  // Convert Map to Array for display
  // Debug array state every time it changes
  useEffect(() => {
    console.log(`🎯 ARRAY STATE CHANGED: ${allTokens.length} tokens`);
    if (allTokens.length > 0) {
      console.log(`📋 First token structure:`, allTokens[0]);
      console.log(`📋 All token symbols:`, allTokens.map(t => t.symbol));
      console.log(`📋 Required fields check:`, allTokens[0] && {
        rsi1m: allTokens[0].rsi1m,
        buyRsiNoRecent68: allTokens[0].buyRsiNoRecent68,
        ema9_1m: allTokens[0].ema9_1m,
        vwap1m: allTokens[0].vwap1m,
        ema20_1m: allTokens[0].ema20_1m,
        atrPercentage: allTokens[0].atrPercentage,
        ltp: allTokens[0].ltp,
        symbol: allTokens[0].symbol,
        token: allTokens[0].token
      });
    }
  }, [allTokens]);

  const tokensArray = allTokens; // Already an array
  const newStrategyArray = Array.from(newStrategyTokens.values());
  const simplifiedArray = Array.from(simplifiedTokens.values());
  
  // Debug logging
  useEffect(() => {
    console.log(`🚨 STATE UPDATE DETECTED!`);
    console.log(`🎯 Current tokens count: ${allTokens.length}`, tokensArray.slice(0, 3));
    console.log(`📋 Token symbols:`, tokensArray.map(t => t.symbol));
    console.log(`🔍 First token data:`, tokensArray[0]);
    console.log(`🚀 New strategy tokens count: ${newStrategyTokens.size}`, newStrategyArray.slice(0, 3));
    console.log(`🎯 Dip-Recovery strategy tokens count: ${simplifiedTokens.size}`, simplifiedArray.slice(0, 3));
    
    // Log VWAP1h and EMA1h values for simplified tokens
    if (simplifiedArray.length > 0) {
      console.log(`📊 Dip-Recovery tokens with all indicators:`, 
        simplifiedArray.map(token => ({
          symbol: token.symbol,
          vwap1h: token.vwap1h,
          ema1h: token.ema1h,
          gap1h: token.gap1h,
          hourOpen: token.hourOpen,
          hourLow: token.hourLow,
          rsi1m: token.rsi1m,
          vwap1m: token.vwap1m,
          ema9_1m: token.ema9_1m
        }))
      );
    }
  }, [allTokens, newStrategyTokens, simplifiedTokens]);

  useEffect(() => {
    console.log("🔌 Attempting to connect to WebSocket server...");
    const socket = new WebSocket("ws://localhost:5000");

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("📨 Received message:", msg.type, msg.data);
        
        // Only handle filtered_token_update messages
        if (msg.type === "filtered_token_update" && msg.data) {
          // DEBUG: Log everything about this message
          console.log(`🚨 FILTERED_TOKEN_UPDATE RECEIVED!`);
          console.log(`📤 Token: ${msg.data.token} (${msg.data.symbol})`);
          console.log(`📋 Complete token data:`, JSON.stringify(msg.data, null, 2));
          
          // Simple increment counter test
          setTestCounter(prev => {
            console.log(`� TEST COUNTER: ${prev} -> ${prev + 1}`);
            return prev + 1;
          });
          
          // Simple array update with duplicate check
          setAllTokens(prev => {
            console.log(`🔍 BEFORE UPDATE: Array has ${prev.length} tokens`);
            console.log(`📊 Current tokens:`, prev.map(t => `${t.symbol}(${t.token})`));
            
            const token = msg.data.token;
            const existingIndex = prev.findIndex(t => t.token === token);
            
            let newTokens;
            if (existingIndex >= 0) {
              // Update existing token
              newTokens = [...prev];
              newTokens[existingIndex] = { ...prev[existingIndex], ...msg.data };
              console.log(`🔄 UPDATED token ${msg.data.symbol} at index ${existingIndex}`);
            } else {
              // Add new token
              newTokens = [...prev, msg.data];
              console.log(`➕ ADDED new token ${msg.data.symbol}`);
            }
            
            console.log(`🔍 AFTER UPDATE: Array has ${newTokens.length} tokens`);
            console.log(`� Updated tokens:`, newTokens.map(t => `${t.symbol}(${t.token})`));
            
            return newTokens;
          });
          
          // Force a re-render
          setLastUpdate(Date.now());
          console.log(`🔄 FORCED RE-RENDER at ${new Date().toLocaleTimeString()}`);
        } else {
          console.log(`⚠️ Ignoring message type: ${msg.type}`);
        }
      } catch (err) {
        console.error("Invalid WS data:", err);
      }
    };

    socket.onopen = () => {
      console.log("✅ WebSocket connected successfully!");
      console.log("🎯 Connection established to ws://localhost:5000");
    };
    socket.onerror = (err) => {
      console.error("❌ WebSocket connection error:", err);
      console.error("🔍 Error details:", err.type, err.target.readyState);
    };
    socket.onclose = (event) => {
      console.warn("🔌 WebSocket connection closed");
      console.warn("🔍 Close details:", event.code, event.reason, event.wasClean);
    };

    return () => socket.close();
  }, []);

  // Auto-hide notifications after 10 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 10000); // Hide after 10 seconds
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  return (
    <div className="container">
      <h2>📈 Live Trading Dashboard - Multi-Strategy View</h2>
      <div style={{padding: '10px', background: '#ffeb3b', marginBottom: '10px', borderRadius: '4px'}}>
        <strong>🧪 TEST COUNTER: {testCounter}</strong> | 
        🕒 Last Update: {new Date(lastUpdate).toLocaleTimeString()} | 
        📊 Tokens: {allTokens.length}
      </div>
      
      {scanStatus.lastScan && (
        <div className="scan-status">
          <p>
            Last scan: {new Date(scanStatus.lastScan).toLocaleTimeString()} | 
            Filtered tokens: {scanStatus.filteredCount} | 
            Status: {scanStatus.isScanning ? "Scanning..." : "Complete"}
          </p>
        </div>
      )}
      
      {notification && (
        <div className={`notification notification-${notification.type}`} style={{
          padding: '12px 16px',
          margin: '10px 0',
          border: '1px solid',
          borderRadius: '6px',
          borderColor: notification.type === 'success' ? '#4caf50' : notification.type === 'error' ? '#f44336' : '#2196f3',
          backgroundColor: notification.type === 'success' ? '#e8f5e9' : notification.type === 'error' ? '#ffebee' : '#e3f2fd',
          color: notification.type === 'success' ? '#2e7d32' : notification.type === 'error' ? '#c62828' : '#1565c0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'fadeIn 0.3s ease-in'
        }}>
          <span>
            <strong>{notification.timestamp}</strong> - {notification.message}
          </span>
          <button 
            onClick={() => setNotification(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      <div className="rsi-tables-container">
        {/* NEW BUY CONDITIONS TABLE - Primary Strategy (ONLY TABLE SHOWN) */}
        <div style={{marginBottom: '30px'}}>
          {tokensArray.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', background: '#e3f2fd', border: '2px solid #2196f3', borderRadius: '8px'}}>
              <h3 style={{color: '#1976d2', margin: '0 0 10px 0'}}>🎯 NEW BUY CONDITIONS STRATEGY</h3>
              <p>⏳ No tokens to display. Waiting for data...</p>
              <p>Array length: {allTokens.length}</p>
              <p>Last update: {new Date(lastUpdate).toLocaleTimeString()}</p>
            </div>
          ) : (
            <div>
              <div style={{padding: '10px', background: '#e8f5e9', marginBottom: '10px', borderRadius: '4px'}}>
                <strong>🕒 Last Update: {new Date(lastUpdate).toLocaleTimeString()}</strong> | 
                Array Length: {allTokens.length} | Tokens: {tokensArray.length}
              </div>
              <NewBuyConditionsTable 
                data={tokensArray} 
                title={`NEW BUY CONDITIONS STRATEGY (${tokensArray.length} tokens)`}
              />
            </div>
          )}
        </div>

        {/* OLD TABLES HIDDEN - Only showing NewBuyConditionsTable */}
        {/*
        <div style={{marginBottom: '30px'}}>
          {simplifiedArray.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', background: '#f3e5f5', border: '2px solid #9c27b0', borderRadius: '8px'}}>
              <h3 style={{color: '#7b1fa2', margin: '0 0 10px 0'}}>🎯 Dip-Recovery RSI/EMA9/VWAP Strategy</h3>
              <p>⏳ No strategy tokens to display. Waiting for data...</p>
              <p>Map size: {simplifiedTokens.size}</p>
              <p>Array length: {simplifiedArray.length}</p>
            </div>
          ) : (
            <ClearTradingTable 
              data={simplifiedArray} 
              title={`Clear Trading Strategy (${simplifiedArray.length})`}
            />
          )}
        </div>

        <div style={{marginBottom: '30px'}}>
          {newStrategyArray.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', background: '#e3f2fd', border: '2px solid #2196f3', borderRadius: '8px'}}>
              <h3 style={{color: '#1565c0', margin: '0 0 10px 0'}}>🚀 New Hourly Strategy</h3>
              <p>⏳ No new strategy tokens to display. Waiting for data...</p>
              <p>Map size: {newStrategyTokens.size}</p>
              <p>Array length: {newStrategyArray.length}</p>
            </div>
          ) : (
            <NewStrategyTable 
              data={newStrategyArray} 
              title={`New Strategy Tokens (${newStrategyArray.length})`}
            />
          )}
        </div>

        <div style={{marginBottom: '30px'}}>
          {tokensArray.length === 0 ? (
            <div style={{padding: '20px', textAlign: 'center', background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '8px'}}>
              <h3 style={{color: '#2e7d32', margin: '0 0 10px 0'}}>📊 Main Trading Data</h3>
              <p>⏳ No tokens to display. Waiting for data...</p>
              <p>Map size: {allTokens.size}</p>
              <p>Array length: {tokensArray.length}</p>
            </div>
          ) : (
            <SimpleDataTable 
              data={tokensArray} 
              title={`Live Trading Data (${tokensArray.length})`}
            />
          )}
        </div>
        */}
        
      </div>
    </div>
  );
}
export default App;

import React, { useEffect, useState } from "react";
import SimpleWSTable from "./components/SimpleWSTable";

function App() {
  const [wsData, setWsData] = useState([]);
  const [counter, setCounter] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [debugMessages, setDebugMessages] = useState([]);

  const addDebugMessage = (message) => {
    setDebugMessages(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    console.log("🔌 Connecting to WebSocket...");
    const socket = new WebSocket("ws://localhost:5000");

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("📨 WS MESSAGE:", msg.type, msg.data);
        addDebugMessage(`Received: ${msg.type}`);
        
        if ((msg.type === "filtered_token_update" || msg.type === "simplified_strategy_update" || msg.type === "tick_update") && msg.data) {
          console.log("🔥 PROCESSING TOKEN:", msg.data.symbol, msg.data.token);
          addDebugMessage(`Processing: ${msg.data.symbol}`);
          
          setCounter(prev => prev + 1);
          setLastMessage(msg.data);
          
          setWsData(prev => {
            const token = msg.data.token;
            const existingIndex = prev.findIndex(t => t.token === token);
            
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = msg.data;
              console.log("🔄 UPDATED:", msg.data.symbol);
              addDebugMessage(`Updated: ${msg.data.symbol}`);
              return updated;
            } else {
              console.log("➕ ADDED:", msg.data.symbol);
              addDebugMessage(`Added: ${msg.data.symbol}`);
              return [...prev, msg.data];
            }
          });
        } else {
          addDebugMessage(`Ignored: ${msg.type}`);
        }
      } catch (err) {
        console.error("❌ WS Error:", err);
        addDebugMessage(`Error: ${err.message}`);
      }
    };

    socket.onopen = () => {
      console.log("✅ WebSocket connected");
      setConnectionStatus("Connected");
      addDebugMessage("WebSocket connected!");
    };
    socket.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      setConnectionStatus("Error");
      addDebugMessage("WebSocket error occurred");
    };
    socket.onclose = () => {
      console.warn("🔌 WebSocket closed");
      setConnectionStatus("Disconnected");
      addDebugMessage("WebSocket disconnected");
    };

    return () => socket.close();
  }, []);

  return (
    <div>
      <div style={{
        padding: '10px', 
        background: connectionStatus === "Connected" ? '#4caf50' : '#f44336', 
        color: 'white',
        textAlign: 'center',
        fontSize: '16px',
        fontWeight: 'bold'
      }}>
        📊 LIVE WEBSOCKET DASHBOARD | 
        Status: {connectionStatus} | 
        Messages: {counter} | 
        Tokens: {wsData.length} | 
        Time: {new Date().toLocaleTimeString()}
      </div>
      
      {/* Debug Messages */}
      {debugMessages.length > 0 && (
        <div style={{
          padding: '10px', 
          background: '#f5f5f5', 
          margin: '10px',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <strong>🔍 Debug Messages:</strong>
          {debugMessages.map((msg, idx) => (
            <div key={idx} style={{fontSize: '12px', margin: '2px 0'}}>{msg}</div>
          ))}
        </div>
      )}
      
      {lastMessage && (
        <div style={{
          padding: '10px', 
          background: '#e8f5e9', 
          margin: '10px',
          borderRadius: '4px'
        }}>
          <strong>Last received:</strong> {lastMessage.symbol} ({lastMessage.token}) - 
          RSI: {lastMessage.rsi1m?.toFixed(2)} | 
          LTP: ₹{lastMessage.ltp?.toFixed(2)}
        </div>
      )}
      
      <SimpleWSTable data={wsData} />
    </div>
  );
}

export default App;

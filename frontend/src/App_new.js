import React, { useEffect, useState } from "react";
import SimpleWSTable from "./components/SimpleWSTable";

function App() {
  const [wsData, setWsData] = useState([]);
  const [counter, setCounter] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    console.log("🔌 Connecting to WebSocket...");
    const socket = new WebSocket("ws://localhost:5000");

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("📨 WS MESSAGE:", msg.type, msg.data);
        
        if (msg.type === "filtered_token_update" && msg.data) {
          console.log("🔥 PROCESSING TOKEN:", msg.data.symbol, msg.data.token);
          
          setCounter(prev => prev + 1);
          setLastMessage(msg.data);
          
          setWsData(prev => {
            const token = msg.data.token;
            const existingIndex = prev.findIndex(t => t.token === token);
            
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = msg.data;
              console.log("🔄 UPDATED:", msg.data.symbol);
              return updated;
            } else {
              console.log("➕ ADDED:", msg.data.symbol);
              return [...prev, msg.data];
            }
          });
        }
      } catch (err) {
        console.error("❌ WS Error:", err);
      }
    };

    socket.onopen = () => console.log("✅ WebSocket connected");
    socket.onerror = (err) => console.error("❌ WebSocket error:", err);
    socket.onclose = () => console.warn("🔌 WebSocket closed");

    return () => socket.close();
  }, []);

  return (
    <div>
      <div style={{
        padding: '10px', 
        background: '#ffeb3b', 
        textAlign: 'center',
        fontSize: '16px',
        fontWeight: 'bold'
      }}>
        📊 LIVE WEBSOCKET DASHBOARD | 
        Messages: {counter} | 
        Tokens: {wsData.length} | 
        Time: {new Date().toLocaleTimeString()}
      </div>
      
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

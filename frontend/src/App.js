import React, { useEffect, useState } from "react";
import SimpleWSTable from "./components/SimpleWSTable";
import TokenSubscriptionMonitor from "./components/TokenSubscriptionMonitor";
import TradingConditionsDisplay from "./components/TradingConditionsNew";

function App() {
  const [wsData, setWsData] = useState([]);
  const [counter, setCounter] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [debugMessages, setDebugMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [subscribedTokens, setSubscribedTokens] = useState(new Set()); // Track subscribed tokens
  const [hasReceivedSubscriptionState, setHasReceivedSubscriptionState] = useState(false); // Track if we got initial state

  const addDebugMessage = (message) => {
    setDebugMessages(prev => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    console.log("🔌 Connecting to WebSocket...");
    const ws = new WebSocket("ws://localhost:5000");
    setSocket(ws);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("📨 WS MESSAGE:", msg.type, msg.data);
        addDebugMessage(`Received: ${msg.type}`);
        
        // Handle token subscription updates
        if (msg.type === "token_subscription_update") {
          console.log("🔄 Token subscription update:", msg);
          
          // Update subscribed tokens set
          setSubscribedTokens(prev => {
            const newSet = new Set(prev);
            
            // Add new tokens
            if (msg.tokensAdded) {
              msg.tokensAdded.forEach(token => newSet.add(String(token)));
            }
            
            // Remove unsubscribed tokens
            if (msg.tokensRemoved) {
              msg.tokensRemoved.forEach(token => newSet.delete(String(token)));
            }
            
            console.log(`📊 Updated subscribed tokens: ${newSet.size} total`);
            return newSet;
          });
          
          // Remove data for unsubscribed tokens from wsData
          if (msg.tokensRemoved && msg.tokensRemoved.length > 0) {
            setWsData(prev => {
              const filtered = prev.filter(item => !msg.tokensRemoved.includes(String(item.token)));
              console.log(`🗑️ Removed ${prev.length - filtered.length} unsubscribed tokens from display`);
              return filtered;
            });
          }
        }
        
        // Handle subscription state response
        if (msg.type === "subscription_state" && msg.tokens) {
          console.log("📋 Received current subscription state:", msg.tokens.length, "tokens");
          setSubscribedTokens(new Set(msg.tokens.map(String)));
          setHasReceivedSubscriptionState(true);
          addDebugMessage(`Loaded ${msg.tokens.length} subscribed tokens`);
        }
        
        // Handle order placement notifications
        if (msg.type === "order_placed" || msg.type === "new_buy_order") {
          console.log("📈 ORDER PLACED:", msg.data);
          addDebugMessage(`Order: ${msg.data.orderType || msg.data.side} ${msg.data.symbol}`);
          
          // Show order notification
          const orderInfo = `${msg.data.orderType || msg.data.side} Order: ${msg.data.symbol} | Qty: ${msg.data.quantity} | Price: ₹${msg.data.price} | ID: ${msg.data.orderId}`;
          alert(`🎯 ORDER PLACED!\n${orderInfo}\n\nReason: ${msg.data.reason}`);
          
          // Auto-open Kite chart if chartURL is provided
          if (msg.data.chartURL && msg.data.openChart) {
            console.log("📊 Opening Kite chart:", msg.data.chartURL);
            addDebugMessage(`Opening chart for ${msg.data.symbol}`);
            window.open(msg.data.chartURL, '_blank');
          }
        }
        
        if ((msg.type === "filtered_token_update" || msg.type === "simplified_strategy_update" || msg.type === "tick_update") && msg.data) {
          console.log("🔥 PROCESSING TOKEN:", msg.data.symbol, msg.data.token);
          addDebugMessage(`Processing: ${msg.data.symbol}`);
          
          // Only apply subscription filtering if we've received the initial subscription state
          const tokenStr = String(msg.data.token);
          if (hasReceivedSubscriptionState && !subscribedTokens.has(tokenStr)) {
            console.log(`⏭️ SKIPPED (not subscribed): ${msg.data.symbol} (${tokenStr})`);
            addDebugMessage(`Skipped (not subscribed): ${msg.data.symbol}`);
            return;
          }
          
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

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setConnectionStatus("Connected");
      addDebugMessage("WebSocket connected!");
      
      // Request current subscription state
      ws.send(JSON.stringify({
        type: "request_subscription_state",
        message: "Frontend requesting current token subscriptions"
      }));
    };
    ws.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      setConnectionStatus("Error");
      addDebugMessage("WebSocket error occurred");
    };
    ws.onclose = () => {
      console.warn("🔌 WebSocket closed");
      setConnectionStatus("Disconnected");
      addDebugMessage("WebSocket disconnected");
    };

    return () => ws.close();
  }, []);

  // Filter wsData to only show subscribed tokens (but only if we've received subscription state)
  const filteredData = hasReceivedSubscriptionState 
    ? wsData.filter(item => subscribedTokens.has(String(item.token)))
    : wsData; // Show all data if we haven't received subscription state yet

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
        Subscribed: {subscribedTokens.size} | 
        Displaying: {filteredData.length} | 
        SubState: {hasReceivedSubscriptionState ? '✅' : '⏳'} | 
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
      
      {/* Token Subscription Monitor */}
      <TokenSubscriptionMonitor socket={socket} />
      
      <SimpleWSTable data={filteredData} />
      
      {/* Trading Conditions Display */}
      <TradingConditionsDisplay data={filteredData} />
    </div>
  );
}

export default App;

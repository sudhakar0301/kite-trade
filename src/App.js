import React, { useEffect, useState } from "react";
import TickTable from "./components/TickTable";

function App() {
  const [ticks, setTicks] = useState([]);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:5000");

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "tick_update" && msg.data) {
          setTicks((prev) => [msg.data, ...prev.slice(0, 99)]);
        }
      } catch (err) {
        console.error("Invalid WS data:", err);
      }
    };

    socket.onopen = () => console.log("✅ WebSocket connected");
    socket.onerror = (err) => console.error("❌ WebSocket error:", err);
    socket.onclose = () => console.warn("🔌 WebSocket closed");

    return () => socket.close();
  }, []);

  return (
    <div className="container">
      <h2>📈 Live RSI Dashboard</h2>
      <TickTable data={ticks} />
    </div>
  );
}

export default App;

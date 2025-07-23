const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 6001 });
let clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  console.log('🔌 New WebSocket connection');

  ws.on('close', () => {
    clients = clients.filter(client => client !== ws);
    console.log('❌ WebSocket client disconnected');
  });
});

// Broadcast log message to all clients
function broadcastLog(message) {
  console.log(message);
  const payload = JSON.stringify({ type: 'log', message });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Broadcast tick data to frontend (for live chart or table)
function broadcastTick(data) {
  const payload = JSON.stringify({ type: 'tick', data });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

module.exports = {
  broadcastLog,
  broadcastTick,
};

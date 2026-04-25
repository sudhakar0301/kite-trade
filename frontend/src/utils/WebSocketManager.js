class WebSocketManager {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3; // REDUCED from 5 to 3
    this.reconnectInterval = 5000; // INCREASED from 3000 to 5000ms
    this.onConnect = null;
    this.onDisconnect = null;
    this.onMessage = null;
    this.onError = null;
    this.isManualDisconnect = false;
  }

  connect() {
    try {
      // Prevent multiple connections
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        console.log('🔄 WebSocket already connecting, skipping...');
        return;
      }
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket already connected, skipping...');
        return;
      }

      console.log('🔗 Attempting WebSocket connection to:', this.url);
      this.isManualDisconnect = false; // Reset manual disconnect flag
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = (event) => {
        console.log('✅ WebSocket connected successfully to', this.url);
        console.log('📊 Connection details:', {
          readyState: this.ws.readyState,
          protocol: this.ws.protocol,
          extensions: this.ws.extensions
        });
        this.reconnectAttempts = 0;
        if (this.onConnect) this.onConnect(event);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', data.type || 'Unknown type');
          if (this.onMessage) this.onMessage(data);
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          isManualDisconnect: this.isManualDisconnect,
          reconnectAttempts: this.reconnectAttempts
        });
        
        if (this.onDisconnect) this.onDisconnect(event);
        
        // Only attempt reconnection if not manually disconnected and within retry limit
        if (!this.isManualDisconnect && event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log('🔄 Will attempt reconnection...');
          this.attemptReconnection();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log('❌ Max reconnection attempts reached - stopping reconnection attempts');
        } else {
          console.log('ℹ️ Connection closed normally or manually - no reconnection needed');
        }
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        if (this.onError) this.onError(error);
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      this.attemptReconnection();
    }
  }

  attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff: 5s, 10s, 20s
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
    
    setTimeout(() => {
      if (!this.isManualDisconnect) { // Check flag before reconnecting
        this.connect();
      }
    }, delay);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      console.log('📤 WebSocket message sent:', data);
    } else {
      console.warn('⚠️ WebSocket not connected. Cannot send message:', data);
    }
  }

  disconnect() {
    if (this.ws) {
      console.log('🔌 Manually disconnecting WebSocket');
      this.isManualDisconnect = true; // Set flag to prevent reconnection
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
  }

  subscribe(symbol) {
    this.send({
      type: 'subscribe',
      symbol: symbol
    });
  }

  unsubscribe(symbol) {
    this.send({
      type: 'unsubscribe', 
      symbol: symbol
    });
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  getState() {
    if (!this.ws) return 'DISCONNECTED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'CONNECTED';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'DISCONNECTED';
      default:
        return 'UNKNOWN';
    }
  }
}

export default WebSocketManager;
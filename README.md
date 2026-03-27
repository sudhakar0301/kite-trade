# React Trading Scanner - Standalone Complete Version

A comprehensive real-time trading scanner application with **REAL Chartink API integration** and Kite Connect support.

## 🚀 NEW FEATURES - Real Trading Integration

- ✅ **Real Chartink Scanner**: Uses actual Chartink API with technical filters (MACD, EMA, ADX)
- ✅ **KiteConnect Integration**: Real positions, funds, orders, historical data
- ✅ **Live Order Placement**: Direct buy/sell order execution through Kite API
- ✅ **NSE500 Symbol Database**: Complete symbol mappings with instrument tokens
- ✅ **Auto-Subscription**: WebSocket live data streaming for scanner results

### Quick Start (Use install-deps.bat and start-scanner.bat)

## Original Features

- **Real-time Data Streaming**: WebSocket connection for live market tick data
- **Order Book Analysis**: 5-level depth analysis with liquidity assessment
- **Trading Signals**: Intelligent signal detection based on order book patterns
- **Position Sizing**: Automated calculations based on liquidity and risk parameters
- **Trading Charges**: Comprehensive intraday charge calculations
- **Interactive Dashboard**: Modern React UI with real-time updates
- **Symbol Management**: Categorized symbol selection with search functionality
- **Visual Analytics**: Order book visualization with strength meters

## Scanner Routes (Real Implementation)

### Main Scanner API
- `POST /api/all-scanners` - **Real Chartink scanner** with buy/sell filters
- `GET /api/positions` - Live Kite Connect positions
- `GET /api/funds` - Account margins and funds
- `POST /api/buy-order` - Execute buy orders
- `POST /api/sell-order` - Execute sell orders
- `POST /api/kite/historical` - Get historical candle data
- `GET /api/all-nse500-stocks` - NSE500 stock database

## Architecture

```
react-trading-scanner/
├── backend/                 # Express.js backend
│   ├── server.js           # WebSocket server
│   ├── routes/
│   │   └── scanner-routes.js # Trading API endpoints
│   └── package.json
└── frontend/               # React frontend
    ├── src/
    │   ├── App.js          # Main application
    │   ├── components/
    │   │   ├── TradingDashboard.js    # Trading signals display
    │   │   ├── OrderBookAnalyzer.js   # Order book visualization
    │   │   └── SymbolSelector.js      # Symbol selection
    │   └── utils/
    │       └── WebSocketManager.js    # WebSocket utility
    └── package.json
```

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install express ws cors body-parser
```

3. Start the backend server:
```bash
npm start
```

The backend server will start on `http://localhost:3002` with WebSocket support.

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install react react-dom react-scripts styled-components
```

3. Start the React development server:
```bash
npm start
```

The frontend will start on `http://localhost:3000`.

## Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3002
WEBSOCKET_PORT=3002
KITE_API_KEY=your_kite_api_key
KITE_ACCESS_TOKEN=your_access_token
```

### Trading Parameters

Default trading configuration in `scanner-routes.js`:

```javascript
const TRADING_CONFIG = {
    POSITION_SIZE: 500,
    CAPITAL_AMOUNT: 250000,
    MIN_LIQUIDITY_MULTIPLIER: 2,
    RISK_PERCENTAGE: 0.02,
    BROKERAGE: 20,
    TAXES: {
        STT: 0.00025,
        EXCHANGE: 0.0000345,
        SEBI: 0.000001,
        GST: 0.18
    }
};
```

## API Endpoints

### REST Endpoints

- `GET /api/scanner/signals/:symbol` - Get trading signals for symbol
- `GET /api/scanner/analysis/:symbol` - Get order book analysis
- `GET /api/scanner/position/:symbol` - Get position sizing recommendations
- `GET /api/scanner/charges` - Get trading charge calculations

### WebSocket Events

#### Client → Server

```javascript
// Subscribe to symbol
{
    "type": "subscribe",
    "symbol": "NSE:RELIANCE"
}

// Unsubscribe from symbol
{
    "type": "unsubscribe", 
    "symbol": "NSE:RELIANCE"
}
```

#### Server → Client

```javascript
// Tick data with analysis
{
    "type": "tick",
    "symbol": "NSE:RELIANCE",
    "data": {
        "ltp": 2450.50,
        "volume": 1234567,
        "orderBook": [...],
        "signals": {...},
        "analysis": {...}
    }
}

// Connection status
{
    "type": "status",
    "connected": true,
    "subscribedSymbols": ["NSE:RELIANCE"]
}
```

## Usage

### Starting the Application

1. Start the backend server first
2. Start the frontend React application
3. Open `http://localhost:3000` in your browser

### Using the Scanner

1. **Symbol Selection**: Use the symbol selector to choose stocks by category
2. **Real-time Data**: View live price updates and order book data
3. **Signal Analysis**: Monitor trading signals and strength indicators
4. **Position Planning**: Review calculated position sizes and entry points
5. **Order Book**: Analyze liquidity and market depth

### Trading Workflow

1. **Symbol Research**: Select symbols from categorized lists
2. **Signal Detection**: Wait for strong buy/sell signals (>70 strength)
3. **Liquidity Check**: Ensure adequate liquidity for position size
4. **Charge Calculation**: Review total trading costs
5. **Position Sizing**: Use calculated optimal quantities
6. **Entry/Exit**: Monitor price movements and order book imbalances

## Order Book Analysis Features

### Liquidity Assessment
- **Total Liquidity**: Sum of all bid/ask quantities
- **Imbalance Ratio**: Bid vs Ask volume comparison
- **Institutional Levels**: Detection of large orders (>100 quantity)

### Signal Detection
- **Strong Buy**: High bid volume with low ask pressure
- **Strong Sell**: High ask volume with low bid support
- **Neutral**: Balanced order book conditions

### Position Sizing
- **Liquidity-based**: Ensures 2x available liquidity
- **Risk-based**: Limits to 2% of capital per trade
- **Charge-adjusted**: Accounts for all trading costs

## Trading Charges Calculation

### Intraday Trading Costs
- **Brokerage**: ₹20 maximum per order
- **STT**: 0.025% on sell side
- **Exchange Charges**: 0.00345% of turnover
- **SEBI Charges**: 0.0001% of turnover  
- **GST**: 18% on brokerage + exchange charges
- **Stamp Duty**: 0.003% on buy side

### Minimum Profitable Spread
- **0.17% minimum** for ₹250k position
- **₹430 total charges** for round-trip

## Troubleshooting

### WebSocket Connection Issues
1. Check backend server is running on port 3002
2. Verify CORS configuration allows localhost:3000
3. Check browser console for connection errors

### Missing Market Data
1. Verify Kite API credentials are configured
2. Check market hours (9:15 AM - 3:30 PM IST)
3. Ensure symbols are valid and active

### Performance Issues
1. Limit active subscriptions to 10-15 symbols
2. Clear browser cache and restart application
3. Monitor network connectivity

## License

This project is for educational purposes only. Use at your own risk for live trading.

## Support

For issues and questions, review the code comments and console logs for debugging information.
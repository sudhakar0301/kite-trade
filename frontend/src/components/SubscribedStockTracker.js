import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const TrackerContainer = styled.div`
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #333;
  border-radius: 12px;
  margin: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
`;

const TrackerHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 15px 20px;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const TrackerBody = styled.div`
  padding: 20px;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 20px;
  align-items: start;
`;

const SymbolInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SymbolName = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: #ffd700;
  text-align: center;
`;

const PriceInfo = styled.div`
  text-align: center;
`;

const CurrentPrice = styled.div`
  font-size: 20px;
  font-weight: 600;
  color: #00ff00;
  margin-bottom: 5px;
`;

const PriceChange = styled.div`
  font-size: 14px;
  color: ${props => props.isPositive ? '#00ff00' : '#ff6b6b'};
  font-weight: 500;
`;

const Volume = styled.div`
  font-size: 12px;
  color: #8b949e;
  text-align: center;
  margin-top: 5px;
`;

const OrderBookSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const OrderBookTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #79c0ff;
  text-align: center;
  margin-bottom: 10px;
`;

const OrderBookContainer = styled.div`
  display: flex;
  gap: 20px;
  justify-content: space-between;
`;

const OrderBookSide = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SideTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${props => props.side === 'buy' ? '#00ff00' : '#ff6b6b'};
  text-align: center;
  margin-bottom: 8px;
  padding: 8px 6px 6px 6px;
  background: rgba(${props => props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.1);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const BestPriceDisplay = styled.div`
  font-size: 9px;
  color: ${props => props.side === 'buy' ? '#00ff00' : '#ff6b6b'};
  font-weight: 500;
  opacity: 0.8;
`;

const OrderLevel = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${props => props.isBest ? '8px 10px' : '6px 10px'};
  background: ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.15)` : 
    'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.4)` : 
    'rgba(255, 255, 255, 0.08)'};
  border-radius: 4px;
  font-size: ${props => props.isBest ? '14px' : '13px'};
  font-weight: ${props => props.isBest ? '700' : '600'};
  min-height: 32px;
  
  &:hover {
    background: ${props => props.isBest ? 
      `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.25)` : 
      'rgba(255, 255, 255, 0.1)'};
  }
`;

const BestLabel = styled.div`
  font-size: 10px;
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff5555'};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 3px;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const LevelIndex = styled.div`
  color: #c9d1d9;
  font-size: 11px;
  font-weight: 600;
  min-width: 20px;
`;

const LevelPrice = styled.div`
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff5555'};
  font-weight: 700;
  font-size: 13px;
  flex: 1;
  text-align: center;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const LevelQuantity = styled.div`
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  min-width: 50px;
  text-align: right;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const StatsSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const AnalyticsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const AnalyticsTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: #79c0ff;
  text-align: center;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(121, 192, 255, 0.1);
  border: 1px solid rgba(121, 192, 255, 0.3);
  border-radius: 6px;
`;

const StatItem = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px;
  text-align: center;
`;

const StatLabel = styled.div`
  font-size: 10px;
  color: #8b949e;
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const NoDataMessage = styled.div`
  text-align: center;
  color: #ff6b6b;
  font-size: 14px;
  padding: 20px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  margin: 10px;
`;

const SubscribedStockTracker = ({ tickData }) => {
  // State to track currently selected stock symbol
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // Debug: Log the received tickData
  console.log('🔍 SubscribedStockTracker - Received tickData:', tickData);
  console.log('🔍 TickData type:', typeof tickData);
  console.log('🔍 TickData keys:', tickData ? Object.keys(tickData) : 'null/undefined');
  
  // Get list of currently subscribed stocks (stocks with active data)
  const getSubscribedStocks = () => {
    if (!tickData) return [];
    
    return Object.entries(tickData)
      .filter(([symbol, history]) => history && history.length > 0)
      .sort(([, historyA], [, historyB]) => {
        // Sort by most recent activity (history length as proxy)
        return historyB.length - historyA.length;
      })
      .map(([symbol]) => symbol);
  };
  
  // Effect to update selected stock when tickData changes
  useEffect(() => {
    const subscribedStocks = getSubscribedStocks();
    console.log('🔍 Currently subscribed stocks:', subscribedStocks);
    
    // If no selectedSymbol yet, or if current selectedSymbol is no longer subscribed
    if (!selectedSymbol || !subscribedStocks.includes(selectedSymbol)) {
      if (subscribedStocks.length > 0) {
        const newSelection = subscribedStocks[0]; // Get the most active subscribed stock
        console.log('🔍 🔄 Switching to subscribed stock:', newSelection);
        setSelectedSymbol(newSelection);
      } else {
        console.log('🔍 ❌ No subscribed stocks available');
        setSelectedSymbol(null);
      }
    }
  }, [tickData, selectedSymbol]);
  
  // Get stock data for the currently selected symbol
  const getAvailableStockData = () => {
    if (!tickData || !selectedSymbol) {
      console.log('🔍 No tickData or selectedSymbol provided');
      return { data: null, symbol: null };
    }
    
    const history = tickData[selectedSymbol];
    if (history && history.length > 0) {
      // Get the latest tick (last item in the array)
      const latestTick = history[history.length - 1];
      console.log('🔍 Latest tick for', selectedSymbol, ':', latestTick);
      console.log('🔍 ✅ Using selected stock:', selectedSymbol, 'with data:', latestTick);
      return { data: latestTick, symbol: selectedSymbol };
    }
    
    console.log('🔍 ❌ No data for selected stock:', selectedSymbol);
    return { data: null, symbol: null };
  };

  const { data: stockData, symbol: currentSymbol } = getAvailableStockData();

  const formatPrice = (price) => {
    return price ? `₹${parseFloat(price).toFixed(2)}` : 'N/A';
  };

  const formatVolume = (volume) => {
    if (!volume) return 'N/A';
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toLocaleString();
  };

  const formatQuantity = (qty) => {
    if (!qty) return '0';
    if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
    if (qty >= 1000) return `${(qty / 1000).toFixed(0)}K`;
    return qty.toString();
  };

  // Calculate order book analytics for first 5, 10, and 20 levels
  const calculateOrderBookAnalytics = () => {
    if (!stockData || !stockData.depth) {
      return {
        l5: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 },
        l10: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 },
        l20: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 }
      };
    }

    const { buy = [], sell = [] } = stockData.depth;
    
    // Calculate for L1-5
    const bidQtySum5 = buy.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum5 = sell.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty5 = bidQtySum5 + askQtySum5;
    const imbalance5 = totalQty5 > 0 ? ((bidQtySum5 - askQtySum5) / totalQty5 * 100) : 0;
    
    // Calculate for L1-10
    const bidQtySum10 = buy.slice(0, 10).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum10 = sell.slice(0, 10).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty10 = bidQtySum10 + askQtySum10;
    const imbalance10 = totalQty10 > 0 ? ((bidQtySum10 - askQtySum10) / totalQty10 * 100) : 0;
    
    // Calculate for L1-20
    const bidQtySum20 = buy.slice(0, 20).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum20 = sell.slice(0, 20).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty20 = bidQtySum20 + askQtySum20;
    const imbalance20 = totalQty20 > 0 ? ((bidQtySum20 - askQtySum20) / totalQty20 * 100) : 0;
    
    // Calculate average spread percentage for L1-5
    let spreadSum5 = 0;
    let validLevels5 = 0;
    for (let i = 0; i < Math.min(5, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum5 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels5++;
      }
    }
    const spreadPercent5 = validLevels5 > 0 ? spreadSum5 / validLevels5 : 0;
    
    // Calculate average spread percentage for L1-10
    let spreadSum10 = 0;
    let validLevels10 = 0;
    for (let i = 0; i < Math.min(10, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum10 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels10++;
      }
    }
    const spreadPercent10 = validLevels10 > 0 ? spreadSum10 / validLevels10 : 0;
    
    // Calculate average spread percentage for L1-20
    let spreadSum20 = 0;
    let validLevels20 = 0;
    for (let i = 0; i < Math.min(20, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum20 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels20++;
      }
    }
    const spreadPercent20 = validLevels20 > 0 ? spreadSum20 / validLevels20 : 0;
    
    // Get best bid and ask prices
    const bestBid = buy[0]?.price || 0;
    const bestAsk = sell[0]?.price || 0;
    
    return {
      l5: {
        bidQtySum: bidQtySum5,
        askQtySum: askQtySum5,
        imbalance: imbalance5,
        spreadPercent: spreadPercent5,
        bestBid: bestBid,
        bestAsk: bestAsk
      },
      l10: {
        bidQtySum: bidQtySum10,
        askQtySum: askQtySum10,
        imbalance: imbalance10,
        spreadPercent: spreadPercent10,
        bestBid: bestBid,
        bestAsk: bestAsk
      },
      l20: {
        bidQtySum: bidQtySum20,
        askQtySum: askQtySum20,
        imbalance: imbalance20,
        spreadPercent: spreadPercent20,
        bestBid: bestBid,
        bestAsk: bestAsk
      }
    };
  };

  const analytics = calculateOrderBookAnalytics();

  // Render order book levels (up to 20 levels each side)
  const renderOrderBookLevels = (side) => {
    if (!stockData || !stockData.depth || !stockData.depth[side]) {
      return Array(20).fill(null).map((_, i) => (
        <OrderLevel key={i} side={side} isBest={i === 0}>
          {i === 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              <BestLabel side={side}>{side === 'buy' ? 'BEST BID' : 'BEST ASK'}</BestLabel>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <LevelIndex>{i + 1}</LevelIndex>
                <LevelPrice side={side}>-</LevelPrice>
                <LevelQuantity>-</LevelQuantity>
              </div>
            </div>
          )}
          {i !== 0 && (
            <>
              <LevelIndex>{i + 1}</LevelIndex>
              <LevelPrice side={side}>-</LevelPrice>
              <LevelQuantity>-</LevelQuantity>
            </>
          )}
        </OrderLevel>
      ));
    }

    const levels = stockData.depth[side];
    const maxLevels = Math.min(20, levels.length);
    
    const renderedLevels = [];
    
    // Render available levels
    for (let i = 0; i < maxLevels; i++) {
      const level = levels[i];
      renderedLevels.push(
        <OrderLevel key={i} side={side} isBest={i === 0}>
          {i === 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              <BestLabel side={side}>{side === 'buy' ? 'BEST BID' : 'BEST ASK'}</BestLabel>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <LevelIndex>{i + 1}</LevelIndex>
                <LevelPrice side={side}>
                  {formatPrice(level.price)}
                </LevelPrice>
                <LevelQuantity>
                  {formatQuantity(level.quantity)}
                </LevelQuantity>
              </div>
            </div>
          )}
          {i !== 0 && (
            <>
              <LevelIndex>{i + 1}</LevelIndex>
              <LevelPrice side={side}>
                {formatPrice(level.price)}
              </LevelPrice>
              <LevelQuantity>
                {formatQuantity(level.quantity)}
              </LevelQuantity>
            </>
          )}
        </OrderLevel>
      );
    }
    
    // Fill remaining levels with empty data
    for (let i = maxLevels; i < 20; i++) {
      renderedLevels.push(
        <OrderLevel key={i} side={side} isBest={false}>
          <LevelIndex>{i + 1}</LevelIndex>
          <LevelPrice side={side}>-</LevelPrice>
          <LevelQuantity>-</LevelQuantity>
        </OrderLevel>
      );
    }
    
    return renderedLevels;
  };

  return (
    <TrackerContainer>
      <TrackerHeader>
        🏛️ Live Stock Tracker - {currentSymbol ? currentSymbol.replace('NSE:', '') : 'No Stock'}
        <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.8 }}>
          {stockData ? (
            <span style={{ color: '#00ff00' }}>🟢 LIVE</span>
          ) : (
            <span style={{ color: '#ff6b6b' }}>🔴 NO DATA</span>
          )}
        </span>
      </TrackerHeader>

      {stockData ? (
        <TrackerBody>
          {/* Order Book Section */}
          <OrderBookSection>
            <OrderBookTitle>📊 Full Order Book (20 Levels)</OrderBookTitle>
            <OrderBookContainer>
              {/* Buy Side */}
              <OrderBookSide>
                <SideTitle side="buy">
                  🟢 BUY ORDERS
                  <BestPriceDisplay side="buy">
                    {stockData.depth?.buy?.[0]?.price ? formatPrice(stockData.depth.buy[0].price) : 'No Data'}
                  </BestPriceDisplay>
                </SideTitle>
                {renderOrderBookLevels('buy')}
              </OrderBookSide>
              
              {/* Sell Side */}
              <OrderBookSide>
                <SideTitle side="sell">
                  🔴 SELL ORDERS
                  <BestPriceDisplay side="sell">
                    {stockData.depth?.sell?.[0]?.price ? formatPrice(stockData.depth.sell[0].price) : 'No Data'}
                  </BestPriceDisplay>
                </SideTitle>
                {renderOrderBookLevels('sell')}
              </OrderBookSide>
            </OrderBookContainer>
          </OrderBookSection>

          {/* L1-5 Analytics */}
          <AnalyticsContainer>
            <AnalyticsTitle>📊 5 Levels (L1-L5)</AnalyticsTitle>
            <StatItem>
              <StatLabel>Spread (%)</StatLabel>
              <StatValue style={{ color: analytics.l5.spreadPercent > 0.5 ? '#ff6b6b' : '#00ff00' }}>
                {analytics.l5.spreadPercent > 0 ? `${analytics.l5.spreadPercent.toFixed(3)}%` : 'N/A'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Bid Qty</StatLabel>
              <StatValue style={{ color: '#00ff00' }}>
                {formatQuantity(analytics.l5.bidQtySum)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Ask Qty</StatLabel>
              <StatValue style={{ color: '#ff6b6b' }}>
                {formatQuantity(analytics.l5.askQtySum)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Imbalance</StatLabel>
              <StatValue style={{ 
                color: Math.abs(analytics.l5.imbalance) < 10 ? '#ffd700' : 
                       analytics.l5.imbalance > 0 ? '#00ff00' : '#ff6b6b' 
              }}>
                {analytics.l5.imbalance !== 0 ? `${analytics.l5.imbalance > 0 ? '+' : ''}${analytics.l5.imbalance.toFixed(1)}%` : 'Balanced'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Best Bid</StatLabel>
              <StatValue style={{ color: '#00ff00' }}>
                {analytics.l5.bestBid > 0 ? formatPrice(analytics.l5.bestBid) : 'N/A'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Best Ask</StatLabel>
              <StatValue style={{ color: '#ff6b6b' }}>
                {analytics.l5.bestAsk > 0 ? formatPrice(analytics.l5.bestAsk) : 'N/A'}
              </StatValue>
            </StatItem>
          </AnalyticsContainer>

          {/* L1-10 Analytics */}
          <AnalyticsContainer>
            <AnalyticsTitle>📈 10 Levels (L1-L10)</AnalyticsTitle>
            <StatItem>
              <StatLabel>Spread (%)</StatLabel>
              <StatValue style={{ color: analytics.l10.spreadPercent > 0.5 ? '#ff6b6b' : '#00ff00' }}>
                {analytics.l10.spreadPercent > 0 ? `${analytics.l10.spreadPercent.toFixed(3)}%` : 'N/A'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Bid Qty</StatLabel>
              <StatValue style={{ color: '#00ff00' }}>
                {formatQuantity(analytics.l10.bidQtySum)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Ask Qty</StatLabel>
              <StatValue style={{ color: '#ff6b6b' }}>
                {formatQuantity(analytics.l10.askQtySum)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Imbalance</StatLabel>
              <StatValue style={{ 
                color: Math.abs(analytics.l10.imbalance) < 10 ? '#ffd700' : 
                       analytics.l10.imbalance > 0 ? '#00ff00' : '#ff6b6b' 
              }}>
                {analytics.l10.imbalance !== 0 ? `${analytics.l10.imbalance > 0 ? '+' : ''}${analytics.l10.imbalance.toFixed(1)}%` : 'Balanced'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Best Bid</StatLabel>
              <StatValue style={{ color: '#00ff00' }}>
                {analytics.l10.bestBid > 0 ? formatPrice(analytics.l10.bestBid) : 'N/A'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Best Ask</StatLabel>
              <StatValue style={{ color: '#ff6b6b' }}>
                {analytics.l10.bestAsk > 0 ? formatPrice(analytics.l10.bestAsk) : 'N/A'}
              </StatValue>
            </StatItem>
          </AnalyticsContainer>

          {/* L1-20 Analytics */}
          <AnalyticsContainer>
            <AnalyticsTitle>📊 20 Levels (L1-L20)</AnalyticsTitle>
            <StatItem>
              <StatLabel>Spread (%)</StatLabel>
              <StatValue style={{ color: analytics.l20.spreadPercent > 0.5 ? '#ff6b6b' : '#00ff00' }}>
                {analytics.l20.spreadPercent > 0 ? `${analytics.l20.spreadPercent.toFixed(3)}%` : 'N/A'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Bid Qty</StatLabel>
              <StatValue style={{ color: '#00ff00' }}>
                {formatQuantity(analytics.l20.bidQtySum)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Ask Qty</StatLabel>
              <StatValue style={{ color: '#ff6b6b' }}>
                {formatQuantity(analytics.l20.askQtySum)}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Imbalance</StatLabel>
              <StatValue style={{ 
                color: Math.abs(analytics.l20.imbalance) < 10 ? '#ffd700' : 
                       analytics.l20.imbalance > 0 ? '#00ff00' : '#ff6b6b' 
              }}>
                {analytics.l20.imbalance !== 0 ? `${analytics.l20.imbalance > 0 ? '+' : ''}${analytics.l20.imbalance.toFixed(1)}%` : 'Balanced'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Best Bid</StatLabel>
              <StatValue style={{ color: '#00ff00' }}>
                {analytics.l20.bestBid > 0 ? formatPrice(analytics.l20.bestBid) : 'N/A'}
              </StatValue>
            </StatItem>
            <StatItem>
              <StatLabel>Best Ask</StatLabel>
              <StatValue style={{ color: '#ff6b6b' }}>
                {analytics.l20.bestAsk > 0 ? formatPrice(analytics.l20.bestAsk) : 'N/A'}
              </StatValue>
            </StatItem>
          </AnalyticsContainer>
        </TrackerBody>
      ) : (
        <NoDataMessage>
          📡 Waiting for subscribed stock data... <br />
          <small>Start polling to begin receiving tick updates</small>
        </NoDataMessage>
      )}
    </TrackerContainer>
  );
};

export default SubscribedStockTracker;
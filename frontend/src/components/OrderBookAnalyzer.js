import React from 'react';
import styled from 'styled-components';

const AnalyzerContainer = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 1.5rem;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

const AnalyzerTitle = styled.h2`
  margin: 0 0 1.5rem 0;
  font-size: 1.3rem;
  text-align: center;
  color: #ffd89b;
`;

const OrderBookSection = styled.div`
  margin-bottom: 1.5rem;
`;

const OrderBookHeader = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  font-weight: bold;
`;

const OrderBookTable = styled.div`
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  overflow: hidden;
`;

const OrderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.4rem 0.8rem;
  font-size: 0.8rem;
  background: ${props => props.side === 'buy' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 71, 87, 0.1)'};
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  &:last-child {
    border-bottom: none;
  }
`;

const Price = styled.span`
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff4757'};
  font-weight: bold;
  min-width: 60px;
`;

const Quantity = styled.span`
  color: #ffffff;
  min-width: 40px;
  text-align: center;
`;

const Orders = styled.span`
  color: #b8b8b8;
  min-width: 30px;
  text-align: right;
`;

const AnalysisSection = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1.5rem;
`;

const AnalysisGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1rem;
`;

const AnalysisItem = styled.div`
  text-align: center;
`;

const AnalysisLabel = styled.div`
  font-size: 0.7rem;
  color: #b8b8b8;
  margin-bottom: 0.3rem;
`;

const AnalysisValue = styled.div`
  font-size: 0.9rem;
  font-weight: bold;
  color: ${props => {
    if (props.type === 'imbalance') {
      return props.value > 0 ? '#00ff88' : props.value < 0 ? '#ff4757' : '#ffa726';
    }
    if (props.type === 'spread') {
      return props.value < 0.1 ? '#00ff88' : props.value > 0.3 ? '#ff4757' : '#ffa726';
    }
    return '#ffffff';
  }};
`;

const LiquidityBar = styled.div`
  background: rgba(255, 255, 255, 0.1);
  height: 20px;
  border-radius: 10px;
  overflow: hidden;
  margin: 1rem 0;
  position: relative;
`;

const LiquidityFill = styled.div`
  height: 100%;
  background: ${props => props.side === 'buy' ? 
    'linear-gradient(90deg, transparent 0%, #00ff88 100%)' : 
    'linear-gradient(90deg, #ff4757 0%, transparent 100%)'};
  width: ${props => props.percentage}%;
  ${props => props.side === 'sell' ? 'margin-left: auto;' : ''}
`;

const LiquidityLabel = styled.div`
  position: absolute;
  top: 50%;
  ${props => props.side === 'buy' ? 'left: 8px;' : 'right: 8px;'}
  transform: translateY(-50%);
  font-size: 0.7rem;
  font-weight: bold;
  color: white;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
`;

const SpreadInfo = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
`;

const SpreadValue = styled.div`
  font-size: 1.2rem;
  font-weight: bold;
  color: #ffd89b;
  margin-bottom: 0.5rem;
`;

const SpreadPercent = styled.div`
  font-size: 0.9rem;
  color: ${props => props.value < 0.1 ? '#00ff88' : props.value > 0.3 ? '#ff4757' : '#ffa726'};
`;

function OrderBookAnalyzer({ tickData, analysisData }) {
  if (!tickData || !tickData.depth) {
    return (
      <AnalyzerContainer>
        <AnalyzerTitle>📈 Order Book Analysis</AnalyzerTitle>
        <div style={{textAlign: 'center', padding: '2rem', color: '#b8b8b8'}}>
          No order book data available
        </div>
      </AnalyzerContainer>
    );
  }

  const { depth } = tickData;
  const { analysis } = analysisData || {};
  
  const totalLiquidity = (analysis?.buyLiquidity || 0) + (analysis?.sellLiquidity || 0);
  const buyPercentage = totalLiquidity > 0 ? ((analysis?.buyLiquidity || 0) / totalLiquidity) * 100 : 50;
  const sellPercentage = totalLiquidity > 0 ? ((analysis?.sellLiquidity || 0) / totalLiquidity) * 100 : 50;

  const spread = depth.sell[0]?.price - depth.buy[0]?.price;
  const spreadPercent = (spread / tickData.price) * 100;

  return (
    <AnalyzerContainer>
      <AnalyzerTitle>📈 Order Book Analysis</AnalyzerTitle>
      
      {/* Order Book Display */}
      <OrderBookSection>
        <h3 style={{margin: '0 0 1rem 0', fontSize: '1rem', textAlign: 'center'}}>Live Order Book</h3>
        
        {/* Sell Orders (Asks) */}
        <OrderBookTable>
          <OrderBookHeader>
            <span>Ask Price</span>
            <span>Qty</span>
            <span>Orders</span>
          </OrderBookHeader>
          {depth.sell?.slice().reverse().map((level, index) => (
            <OrderRow key={`sell-${index}`} side="sell">
              <Price side="sell">₹{level.price?.toFixed(2)}</Price>
              <Quantity>{level.quantity}</Quantity>
              <Orders>{level.orders}</Orders>
            </OrderRow>
          ))}
        </OrderBookTable>

        {/* Spread Display */}
        <SpreadInfo style={{margin: '0.5rem 0'}}>
          <SpreadValue>Spread: ₹{spread?.toFixed(3)}</SpreadValue>
          <SpreadPercent value={spreadPercent}>
            {spreadPercent?.toFixed(3)}%
          </SpreadPercent>
        </SpreadInfo>

        {/* Buy Orders (Bids) */}
        <OrderBookTable>
          <OrderBookHeader>
            <span>Bid Price</span>
            <span>Qty</span>
            <span>Orders</span>
          </OrderBookHeader>
          {depth.buy?.map((level, index) => (
            <OrderRow key={`buy-${index}`} side="buy">
              <Price side="buy">₹{level.price?.toFixed(2)}</Price>
              <Quantity>{level.quantity}</Quantity>
              <Orders>{level.orders}</Orders>
            </OrderRow>
          ))}
        </OrderBookTable>
      </OrderBookSection>

      {/* Liquidity Visualization */}
      {analysis && (
        <>
          <div style={{margin: '1.5rem 0 1rem 0'}}>
            <h4 style={{margin: '0 0 0.5rem 0', fontSize: '0.9rem', textAlign: 'center'}}>
              Liquidity Distribution
            </h4>
            <LiquidityBar>
              <LiquidityFill side="buy" percentage={buyPercentage} />
              <LiquidityFill side="sell" percentage={sellPercentage} />
              <LiquidityLabel side="buy">
                Buy: {analysis.buyLiquidity}
              </LiquidityLabel>
              <LiquidityLabel side="sell">
                Sell: {analysis.sellLiquidity}
              </LiquidityLabel>
            </LiquidityBar>
          </div>

          {/* Analysis Metrics */}
          <AnalysisSection>
            <h4 style={{margin: '0 0 1rem 0', fontSize: '1rem', textAlign: 'center'}}>
              Market Analysis
            </h4>
            <AnalysisGrid>
              <AnalysisItem>
                <AnalysisLabel>Imbalance</AnalysisLabel>
                <AnalysisValue type="imbalance" value={analysis.imbalance}>
                  {analysis.imbalance > 0 ? '+' : ''}{(analysis.imbalance * 100)?.toFixed(1)}%
                </AnalysisValue>
              </AnalysisItem>
              <AnalysisItem>
                <AnalysisLabel>Total Liquidity</AnalysisLabel>
                <AnalysisValue>
                  {analysis.totalLiquidity?.toLocaleString()}
                </AnalysisValue>
              </AnalysisItem>
              <AnalysisItem>
                <AnalysisLabel>Buy Institutional</AnalysisLabel>
                <AnalysisValue>
                  {analysis.buyInstitutional} levels
                </AnalysisValue>
              </AnalysisItem>
              <AnalysisItem>
                <AnalysisLabel>Sell Institutional</AnalysisLabel>
                <AnalysisValue>
                  {analysis.sellInstitutional} levels
                </AnalysisValue>
              </AnalysisItem>
            </AnalysisGrid>
          </AnalysisSection>
        </>
      )}

      {/* Quick Stats */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.2)', 
        padding: '0.8rem', 
        borderRadius: '8px',
        fontSize: '0.8rem',
        lineHeight: '1.4'
      }}>
        <div><strong>Best Bid:</strong> ₹{depth.buy[0]?.price?.toFixed(2)} ({depth.buy[0]?.quantity})</div>
        <div><strong>Best Ask:</strong> ₹{depth.sell[0]?.price?.toFixed(2)} ({depth.sell[0]?.quantity})</div>
        <div><strong>Mid Price:</strong> ₹{((depth.buy[0]?.price + depth.sell[0]?.price) / 2)?.toFixed(2)}</div>
      </div>
    </AnalyzerContainer>
  );
}

export default OrderBookAnalyzer;
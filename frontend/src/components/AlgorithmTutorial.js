import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';

const slideInAnimation = keyframes`
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

const pulseAnimation = keyframes`
  0%, 100% { 
    transform: scale(1);
    opacity: 1;
  }
  50% { 
    transform: scale(1.05);
    opacity: 0.8;
  }
`;

const TutorialContainer = styled.div`
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(25px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 32px;
  margin: 24px 0;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
  
  &:hover {
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4), 0 8px 16px rgba(0, 0, 0, 0.3);
  }
`;

const TutorialHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
`;

const TutorialTitle = styled.h2`
  color: #ffffff;
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  
  .icon {
    font-size: 28px;
  }
`;

const PlayButton = styled.button`
  background: linear-gradient(135deg, #10b981, #059669);
  border: none;
  border-radius: 50px;
  color: white;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  padding: 12px 24px;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  
  &:hover {
    background: linear-gradient(135deg, #059669, #047857);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
    transform: translateY(-2px);
  }
  
  &:active {
    transform: translateY(0);
  }
  
  &:disabled {
    background: linear-gradient(135deg, #6b7280, #4b5563);
    cursor: not-allowed;
    &:hover {
      transform: none;
    }
  }
`;

const VideoContainer = styled.div`
  display: ${props => props.show ? 'block' : 'none'};
  animation: ${css`${slideInAnimation} 0.5s ease`};
`;

const StepContainer = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  margin: 20px 0;
  animation: ${css`${slideInAnimation} 0.5s ease`};
  transition: all 0.3s ease;
  
  ${props => props.active && css`
    border-color: #10b981;
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    animation: ${pulseAnimation} 2s ease-in-out infinite;
  `}
`;

const StepTitle = styled.h3`
  color: #10b981;
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StepDescription = styled.p`
  color: #e5e7eb;
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 20px 0;
`;

const OrderBookDemo = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 16px 0;
`;

const BookSide = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  padding: 16px;
  border: 2px solid ${props => props.side === 'bid' ? '#10b981' : '#ef4444'};
`;

const BookHeader = styled.div`
  color: ${props => props.side === 'bid' ? '#10b981' : '#ef4444'};
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const PriceLevel = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  margin: 2px 0;
  font-family: 'SF Mono', monospace;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  transition: all 0.3s ease;
  position: relative;
  z-index: 2;
  
  ${props => props.highlight && css`
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    animation: ${pulseAnimation} 1.5s ease-in-out infinite;
  `}
`;

const ConditionBox = styled.div`
  background: ${props => props.passed ? 
    'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.08))' : 
    'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08))'};
  border: 2px solid ${props => props.passed ? '#10b981' : '#ef4444'};
  border-radius: 12px;
  padding: 16px;
  margin: 12px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #ffffff;
`;

const ProgressBar = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  height: 8px;
  margin: 20px 0;
  overflow: hidden;
  
  &::after {
    content: '';
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #10b981, #34d399);
    width: ${props => (props.progress / props.total) * 100}%;
    transition: width 0.5s ease;
    border-radius: 8px;
  }
`;

const AudioControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 16px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 25px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const AudioButton = styled.button`
  background: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.3s ease;
  padding: 4px;
  border-radius: 4px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.1);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    &:hover {
      transform: none;
      background: transparent;
    }
  }
`;

const VolumeControl = styled.input`
  width: 60px;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
  border-radius: 2px;
  
  &::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    background: #10b981;
    border-radius: 50%;
    cursor: pointer;
  }
`;

const DetailedExplanation = styled.div`
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05));
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
  padding: 20px;
  margin: 16px 0;
  color: #e5e7eb;
  font-size: 15px;
  line-height: 1.7;
  
  h4 {
    color: #3b82f6;
    margin: 0 0 12px 0;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  ul {
    margin: 12px 0;
    padding-left: 20px;
  }
  
  li {
    margin: 8px 0;
    color: #d1d5db;
  }
  
  .formula {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    padding: 8px 12px;
    font-family: 'SF Mono', monospace;
    font-size: 13px;
    color: #fbbf24;
    margin: 8px 0;
    border-left: 3px solid #3b82f6;
  }
`;

const ChartContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 20px 0;
  
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const MiniChart = styled.div`
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
  height: 200px;
  position: relative;
  overflow: hidden;
`;

const ChartHeader = styled.div`
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  text-align: center;
`;

const PriceChart = styled.svg`
  width: 100%;
  height: 150px;
  position: absolute;
  top: 40px;
  left: 0;
`;

const ChartLine = styled.path`
  fill: none;
  stroke: ${props => props.color || '#10b981'};
  stroke-width: 2;
  stroke-linecap: round;
  animation: ${css`${slideInAnimation} 1s ease`};
`;

const ChartDot = styled.circle`
  fill: ${props => props.color || '#10b981'};
  stroke: rgba(255, 255, 255, 0.8);
  stroke-width: 2;
  animation: ${css`${pulseAnimation} 2s ease-in-out infinite`};
  
  ${props => props.highlight && css`
    r: 6;
    fill: #fbbf24;
    stroke: #ffffff;
  `}
`;

const OrderBookVisualization = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 20px 0;
  min-height: 250px;
`;

const EnhancedBookSide = styled.div`
  background: rgba(0, 0, 0, 0.4);
  border-radius: 12px;
  padding: 16px;
  border: 2px solid ${props => props.side === 'bid' ? '#10b981' : '#ef4444'};
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: ${props => props.side === 'bid' 
      ? 'linear-gradient(90deg, #10b981, #34d399)' 
      : 'linear-gradient(90deg, #ef4444, #f87171)'};
    border-radius: 4px 4px 0 0;
  }
`;

const VolumeBar = styled.div`
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  background: ${props => props.side === 'bid' 
    ? 'linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.2))' 
    : 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.2))'};
  width: ${props => (props.volume / props.maxVolume) * 100}%;
  border-radius: 4px;
  transition: all 0.5s ease;
`;

const AnalysisOverlay = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid #fbbf24;
  border-radius: 8px;
  padding: 12px 16px;
  color: #fbbf24;
  font-weight: 600;
  font-size: 12px;
  text-align: center;
  animation: ${css`${pulseAnimation} 1.5s ease-in-out infinite`};
  z-index: 10;
  
  ${props => !props.show && 'display: none;'}
`;

const tutorialSteps = [
  {
    id: 1,
    title: "Step 1: Spread & Imbalance Validation",
    description: "The algorithm first checks if market conditions are favorable for buying by analyzing bid-ask spread and order imbalance.",
    detailedExplanation: {
      title: "🔬 Market Condition Analysis",
      content: `The algorithm begins by evaluating two critical market metrics that determine execution quality:

**Bid-Ask Spread Analysis:**
• Measures the difference between best bid and ask prices
• Lower spreads indicate better market efficiency
• Calculated as: (Ask Price - Bid Price) / Bid Price × 100

**Order Imbalance Calculation:**
• Ratio of total bid quantity to total ask quantity
• Higher imbalance (>1.3) suggests buying pressure
• Formula: Total Bid Qty ÷ Total Ask Qty

**Decision Logic:**
The algorithm accepts trades under two scenarios:
1. Tight market (spread ≤ 0.08%) with moderate buying pressure (imbalance ≥ 1.3)
2. Slightly wider market (spread ≤ 0.10%) but with strong buying pressure (imbalance ≥ 1.7)

This dual-condition approach ensures we only trade in favorable market conditions.`
    },
    audioScript: "Let's start with Step 1: Spread and Imbalance Validation. The algorithm first analyzes market conditions by examining the bid-ask spread and order imbalance. The spread measures market efficiency - tighter spreads mean better execution. Order imbalance shows buying versus selling pressure. We only proceed if we have either a tight spread with moderate buying pressure, or a slightly wider spread with strong buying pressure. This ensures we're trading in favorable conditions.",
    code: `const validSpread =
   (spread <= 0.08 && imbalance >= 1.3) ||
   (spread <= 0.10 && imbalance >= 1.7);

if (!validSpread) return HOLD;`,
    conditions: [
      { text: "Tight spread (≤0.08%) with moderate imbalance (≥1.3)", passed: true },
      { text: "OR Wider spread (≤0.10%) with higher imbalance (≥1.7)", passed: false }
    ],
    chartData: {
      prices: [1000.2, 1000.35, 1000.28, 1000.45, 1000.52, 1000.48, 1000.55],
      timestamps: ['09:15', '09:16', '09:17', '09:18', '09:19', '09:20', '09:21'],
      spread: 0.05,
      trend: 'bullish'
    },
    orderBook: {
      bids: [
        { price: 1000.50, qty: 500, highlight: false, volume: 500 },
        { price: 1000.45, qty: 300, highlight: false, volume: 300 },
        { price: 1000.40, qty: 250, highlight: false, volume: 250 },
        { price: 1000.35, qty: 200, highlight: false, volume: 200 },
        { price: 1000.30, qty: 150, highlight: false, volume: 150 }
      ],
      asks: [
        { price: 1000.55, qty: 200, highlight: false, volume: 200 },
        { price: 1000.60, qty: 180, highlight: false, volume: 180 },
        { price: 1000.65, qty: 220, highlight: false, volume: 220 },
        { price: 1000.70, qty: 300, highlight: false, volume: 300 },
        { price: 1000.75, qty: 400, highlight: false, volume: 400 }
      ],
      spread: 0.05,
      imbalance: 1.4,
      maxVolume: 500,
      analysis: "SPREAD ANALYSIS"
    }
  },
  {
    id: 2,
    title: "Step 2: Fillable Quantity Calculation",
    description: "Calculate how much quantity can be filled within an acceptable price range to ensure good execution.",
    detailedExplanation: {
      title: "📊 Liquidity Assessment",
      content: `This step performs sophisticated liquidity analysis to ensure execution quality:

**Price Range Calculation:**
• Defines acceptable price range: Best Ask × (1 + spread%)
• Example: If best ask is ₹1000 and spread is 0.05%, range = ₹1000.50
• Prevents paying excessive premiums

**Quantity Aggregation:**
• Sums all ask quantities within the acceptable price range
• Only considers levels where we can get reasonable fills
• Excludes expensive levels that would hurt performance

**Execution Threshold:**
• Requires at least 50% of desired order quantity to be available
• Prevents partial fills that may be inefficient
• Formula: Fillable Qty ≥ Order Qty × 0.5

**Risk Management:**
If insufficient quantity is available, the algorithm holds to avoid:
• Poor execution prices
• Market impact from aggressive orders
• Incomplete position building`
    },
    audioScript: "Step 2 focuses on liquidity assessment. We calculate how much quantity can be filled within an acceptable price range. The algorithm looks at ask levels within the spread percentage above the best ask price. We need at least 50% of our desired order quantity to be available at reasonable prices. This prevents us from paying excessive premiums or getting poor fills. If there's insufficient liquidity, we hold and wait for better conditions.",
    code: `const fillableQty = asks
   .filter(level => level.price <= bestAsk * (1 + spread / 100))
   .reduce((sum, level) => sum + level.quantity, 0);

if (fillableQty < orderQty * 0.5) return HOLD;`,
    conditions: [
      { text: "Fillable quantity ≥ 50% of desired order", passed: true },
      { text: "Sufficient liquidity within spread range", passed: true }
    ],
    chartData: {
      prices: [1000.55, 1000.58, 1000.52, 1000.56, 1000.59, 1000.57, 1000.60],
      timestamps: ['09:15', '09:16', '09:17', '09:18', '09:19', '09:20', '09:21'],
      spread: 0.05,
      trend: 'consolidating'
    },
    orderBook: {
      bids: [
        { price: 1000.50, qty: 500, highlight: false, volume: 500 },
        { price: 1000.45, qty: 300, highlight: false, volume: 300 },
        { price: 1000.40, qty: 250, highlight: false, volume: 250 },
        { price: 1000.35, qty: 200, highlight: false, volume: 200 },
        { price: 1000.30, qty: 150, highlight: false, volume: 150 }
      ],
      asks: [
        { price: 1000.55, qty: 200, highlight: true, volume: 200 },
        { price: 1000.60, qty: 180, highlight: true, volume: 180 },
        { price: 1000.65, qty: 220, highlight: false, volume: 220 },
        { price: 1000.70, qty: 300, highlight: false, volume: 300 },
        { price: 1000.75, qty: 400, highlight: false, volume: 400 }
      ],
      fillableQty: 380,
      maxVolume: 500,
      analysis: "LIQUIDITY CALC"
    }
  },
  {
    id: 3,
    title: "Step 3: Bid Support Verification",
    description: "Ensure there's sufficient buying support to prevent immediate price drops after our buy order.",
    detailedExplanation: {
      title: "⚖️ Support Structure Analysis",
      content: `Critical protection mechanism that prevents buying into weak markets:

**Bid Buffer Calculation:**
• Analyzes top 5 bid levels for buying support
• Calculates total quantity available to absorb selling pressure
• Formula: Sum of quantities in top 5 bid levels

**Support Validation:**
• Ensures bid buffer exceeds our fillable quantity
• Protects against immediate price drops after execution
• Prevents buying into thin markets

**Market Psychology:**
Strong bid support indicates:
• Sustained buying interest at lower levels
• Reduced risk of price gaps
• Market stability and participant confidence

**Risk Mitigation:**
Without sufficient bid support:
• Our buy order could face immediate selling pressure
• Price could drop rapidly after execution
• Position could show immediate unrealized loss

This check ensures we only buy when there's a 'safety net' of buyers below.`
    },
    audioScript: "Step 3 is about bid support verification - this is crucial risk management. We calculate the total quantity in the top 5 bid levels, which represents buying support below the current price. This bid buffer must exceed our fillable quantity. Why? Because we need a safety net of buyers below us. Without sufficient bid support, our buy order could face immediate selling pressure, causing the price to drop. This protection ensures we only buy when there's strong underlying demand.",
    code: `const bidBuffer = bids
   .slice(0, 5)
   .reduce((sum, level) => sum + level.quantity, 0);

if (bidBuffer < fillableQty) return HOLD;`,
    conditions: [
      { text: "Top 5 bid levels have sufficient quantity", passed: true },
      { text: "Bid buffer > fillable quantity", passed: true }
    ],
    chartData: {
      prices: [1000.60, 1000.58, 1000.62, 1000.59, 1000.61, 1000.63, 1000.65],
      timestamps: ['09:15', '09:16', '09:17', '09:18', '09:19', '09:20', '09:21'],
      spread: 0.05,
      trend: 'supported'
    },
    orderBook: {
      bids: [
        { price: 1000.50, qty: 500, highlight: true, volume: 500 },
        { price: 1000.45, qty: 300, highlight: true, volume: 300 },
        { price: 1000.40, qty: 250, highlight: true, volume: 250 },
        { price: 1000.35, qty: 200, highlight: true, volume: 200 },
        { price: 1000.30, qty: 150, highlight: true, volume: 150 }
      ],
      asks: [
        { price: 1000.55, qty: 200, highlight: false, volume: 200 },
        { price: 1000.60, qty: 180, highlight: false, volume: 180 },
        { price: 1000.65, qty: 220, highlight: false, volume: 220 },
        { price: 1000.70, qty: 300, highlight: false, volume: 300 },
        { price: 1000.75, qty: 400, highlight: false, volume: 400 }
      ],
      bidBuffer: 1400,
      maxVolume: 500,
      analysis: "BID SUPPORT"
    }
  },
  {
    id: 4,
    title: "Step 4: Execute BUY Order",
    description: "All conditions are satisfied! Execute the buy order with calculated fillable quantity.",
    detailedExplanation: {
      title: "🚀 Smart Order Execution",
      content: `Final execution phase with all safety checks passed:

**Pre-Execution Validation:**
✅ Market conditions favorable (spread & imbalance)
✅ Sufficient liquidity available (fillable quantity)
✅ Strong bid support confirmed (safety net)

**Execution Parameters:**
• Order size optimized for market conditions
• Price levels pre-validated for efficiency
• Risk controls actively protecting capital

**Algorithm Advantages:**
This systematic approach provides:
• Superior execution quality vs. market orders
• Reduced market impact and slippage
• Built-in risk management at every step
• Consistent performance across market conditions

**Execution Types:**
The algorithm can execute various order types:
• Limit orders at optimal price levels
• Iceberg orders for large quantities
• TWAP execution for minimal market impact

**Post-Execution:**
• Monitor fill quality and slippage
• Update position and risk metrics
• Prepare for next trading opportunity

This completes our intelligent buy decision process!`
    },
    audioScript: "Finally, Step 4 - Order Execution! All our safety checks have passed. We have favorable market conditions, sufficient liquidity, and strong bid support. Now we execute the buy order with the calculated fillable quantity. This systematic approach gives us superior execution quality compared to simple market orders. We've minimized risk, optimized for market conditions, and ensured we're buying at the right time with the right size. This completes our intelligent algorithmic trading decision process!",
    code: `return BUY(fillableQty);`,
    conditions: [
      { text: "✅ Spread & imbalance validated", passed: true },
      { text: "✅ Sufficient fillable quantity", passed: true },
      { text: "✅ Strong bid support confirmed", passed: true },
      { text: "🚀 EXECUTING BUY ORDER", passed: true }
    ],
    chartData: {
      prices: [1000.65, 1000.68, 1000.70, 1000.72, 1000.75, 1000.78, 1000.80],
      timestamps: ['09:15', '09:16', '09:17', '09:18', '09:19', '09:20', '09:21'],
      spread: 0.05,
      trend: 'bullish',
      execution: true
    },
    orderBook: {
      bids: [
        { price: 1000.50, qty: 500, highlight: true, volume: 500 },
        { price: 1000.45, qty: 300, highlight: true, volume: 300 },
        { price: 1000.40, qty: 250, highlight: true, volume: 250 },
        { price: 1000.35, qty: 200, highlight: true, volume: 200 },
        { price: 1000.30, qty: 150, highlight: true, volume: 150 }
      ],
      asks: [
        { price: 1000.55, qty: 200, highlight: true, volume: 200 },
        { price: 1000.60, qty: 180, highlight: true, volume: 180 },
        { price: 1000.65, qty: 220, highlight: false, volume: 220 },
        { price: 1000.70, qty: 300, highlight: false, volume: 300 },
        { price: 1000.75, qty: 400, highlight: false, volume: 400 }
      ],
      executeQty: 380,
      maxVolume: 500,
      analysis: "EXECUTING!"
    }
  }
];

const AlgorithmTutorial = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechSynthesisRef = useRef(null);

  // Generate SVG path for price chart
  const generateChartPath = (prices, width = 250, height = 120) => {
    if (!prices || prices.length === 0) return '';
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = 20;
    
    const points = prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);
      return `${x},${y}`;
    });
    
    return `M${points.join(' L')}`;
  };

  // Generate chart dots for key points
  const generateChartDots = (prices, width = 250, height = 120, highlightIndex = -1) => {
    if (!prices || prices.length === 0) return [];
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const padding = 20;
    
    return prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);
      
      return {
        x,
        y,
        price,
        highlight: index === highlightIndex || index === prices.length - 1
      };
    });
  };

  // Audio narration function
  const speakText = useCallback((text) => {
    if (!audioEnabled || !window.speechSynthesis) return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = volume;
    
    // Get available voices and prefer a professional one
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.name.includes('Female') || 
      voice.name.includes('Samantha') ||
      voice.name.includes('Alex')
    ) || voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    speechSynthesisRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [audioEnabled, volume]);
  
  // Stop audio
  const stopAudio = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };
  
  useEffect(() => {
    let interval;
    if (isPlaying && currentStep < tutorialSteps.length) {
      // Start audio narration for current step
      if (audioEnabled) {
        const currentStepData = tutorialSteps[currentStep];
        setTimeout(() => {
          speakText(currentStepData.audioScript);
        }, 500); // Small delay for visual effect
      }
      
      interval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= tutorialSteps.length - 1) {
            setIsPlaying(false);
            stopAudio();
            return prev;
          }
          return prev + 1;
        });
      }, 8000); // 8 seconds per step for audio
    }
    return () => {
      clearInterval(interval);
      stopAudio();
    };
  }, [isPlaying, currentStep, audioEnabled, volume, speakText]);
  
  // Load voices when component mounts
  useEffect(() => {
    const loadVoices = () => window.speechSynthesis.getVoices();
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handlePlay = () => {
    setShowVideo(true);
    setCurrentStep(0);
    setIsPlaying(true);
    if (audioEnabled) {
      // Welcome message
      setTimeout(() => {
        speakText("Welcome to the Trading Algorithm Tutorial. Let's explore how our intelligent system makes buy and sell decisions.");
      }, 1000);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    setShowVideo(false);
    stopAudio();
  };
  
  const toggleAudio = () => {
    if (audioEnabled && isSpeaking) {
      stopAudio();
    }
    setAudioEnabled(!audioEnabled);
  };
  
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  return (
    <TutorialContainer>
      <TutorialHeader>
        <TutorialTitle>
          <span className="icon">🎓</span>
          Trading Algorithm Tutorial
        </TutorialTitle>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <PlayButton onClick={handlePlay} disabled={isPlaying}>
            {isPlaying ? '⏸️ Playing...' : '▶️ Play Tutorial'}
          </PlayButton>
          {showVideo && (
            <PlayButton onClick={handleReset} style={{ 
              background: 'linear-gradient(135deg, #ef4444, #dc2626)' 
            }}>
              🔄 Reset
            </PlayButton>
          )}
          
          <AudioControls>
            <AudioButton 
              onClick={toggleAudio} 
              title={audioEnabled ? 'Disable Audio' : 'Enable Audio'}
              style={{ color: audioEnabled ? '#10b981' : '#6b7280' }}
            >
              {audioEnabled ? '🔊' : '🔇'}
            </AudioButton>
            
            {audioEnabled && (
              <>
                <VolumeControl
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  title="Volume"
                />
                
                {isSpeaking && (
                  <AudioButton onClick={stopAudio} title="Stop Audio">
                    ⏹️
                  </AudioButton>
                )}
              </>
            )}
          </AudioControls>
        </div>
      </TutorialHeader>

      {showVideo && (
        <VideoContainer show={showVideo}>
          <ProgressBar progress={currentStep + 1} total={tutorialSteps.length} />
          
          {tutorialSteps.map((step, index) => (
            <StepContainer 
              key={step.id} 
              active={index === currentStep}
              style={{ 
                display: index === currentStep ? 'block' : 'none' 
              }}
            >
              <StepTitle>
                <span style={{ fontSize: '24px' }}>
                  {index === 0 ? '🔍' : index === 1 ? '📊' : index === 2 ? '⚖️' : '🚀'}
                </span>
                {step.title}
              </StepTitle>
              
              <StepDescription>{step.description}</StepDescription>
              
              {/* Detailed Explanation */}
              {step.detailedExplanation && (
                <DetailedExplanation>
                  <h4>
                    <span style={{ fontSize: '18px' }}>📚</span>
                    {step.detailedExplanation.title}
                  </h4>
                  <div style={{ whiteSpace: 'pre-line' }}>
                    {step.detailedExplanation.content}
                  </div>
                </DetailedExplanation>
              )}

              {/* Code Block */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '16px',
                fontFamily: "'SF Mono', monospace",
                fontSize: '13px',
                color: '#ffffff',
                marginBottom: '20px',
                whiteSpace: 'pre-wrap'
              }}>
                {step.code}
              </div>

              {/* Conditions */}
              {step.conditions.map((condition, idx) => (
                <ConditionBox key={idx} passed={condition.passed}>
                  <span style={{ fontSize: '18px' }}>
                    {condition.passed ? '✅' : '❌'}
                  </span>
                  {condition.text}
                </ConditionBox>
              ))}

              {/* Chart and Order Book Visualizations */}
              {step.chartData && (
                <ChartContainer>
                  {/* Price Chart */}
                  <MiniChart>
                    <ChartHeader>📈 Price Chart - {step.chartData.trend.toUpperCase()}</ChartHeader>
                    <PriceChart viewBox="0 0 250 120">
                      <defs>
                        <linearGradient id={`gradient-${step.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(16, 185, 129, 0.3)" />
                          <stop offset="100%" stopColor="rgba(16, 185, 129, 0.05)" />
                        </linearGradient>
                      </defs>
                      
                      {/* Chart background grid */}
                      <g stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
                        {[...Array(5)].map((_, i) => (
                          <line key={i} x1="20" y1={20 + i * 20} x2="230" y2={20 + i * 20} />
                        ))}
                        {[...Array(6)].map((_, i) => (
                          <line key={i} x1={20 + i * 35} y1="20" x2={20 + i * 35} y2="100" />
                        ))}
                      </g>
                      
                      {/* Price line */}
                      <ChartLine
                        d={generateChartPath(step.chartData.prices)}
                        color={step.chartData.trend === 'bullish' ? '#10b981' : 
                               step.chartData.trend === 'bearish' ? '#ef4444' : '#3b82f6'}
                      />
                      
                      {/* Area fill */}
                      <path
                        d={`${generateChartPath(step.chartData.prices)} L230,100 L20,100 Z`}
                        fill={`url(#gradient-${step.id})`}
                      />
                      
                      {/* Price dots */}
                      {generateChartDots(step.chartData.prices).map((dot, idx) => (
                        <ChartDot
                          key={idx}
                          cx={dot.x}
                          cy={dot.y}
                          r={dot.highlight ? 4 : 2}
                          color={step.chartData.trend === 'bullish' ? '#10b981' : 
                                 step.chartData.trend === 'bearish' ? '#ef4444' : '#3b82f6'}
                          highlight={dot.highlight}
                        />
                      ))}
                      
                      {/* Current price label */}
                      <text
                        x="235"
                        y={generateChartDots(step.chartData.prices).pop()?.y}
                        fill="#fbbf24"
                        fontSize="10"
                        fontWeight="600"
                      >
                        ₹{step.chartData.prices[step.chartData.prices.length - 1]}
                      </text>
                      
                      {step.chartData.execution && (
                        <text x="125" y="15" fill="#fbbf24" fontSize="12" fontWeight="600" textAnchor="middle">
                          🚀 EXECUTION POINT
                        </text>
                      )}
                    </PriceChart>
                    
                    {/* Chart metrics */}
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '16px',
                      fontSize: '11px',
                      color: '#9ca3af'
                    }}>
                      Spread: {step.chartData.spread}% | Trend: {step.chartData.trend}
                    </div>
                  </MiniChart>

                  {/* Market Depth Visualization */}
                  <MiniChart>
                    <ChartHeader>📊 Market Depth</ChartHeader>
                    <div style={{ 
                      display: 'flex', 
                      height: '120px',
                      alignItems: 'end',
                      gap: '4px',
                      padding: '20px 10px 20px 10px'  
                    }}>
                      {/* Bid side bars */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'end', gap: '2px' }}>
                        {step.orderBook.bids.map((bid, idx) => (
                          <div 
                            key={idx}
                            style={{
                              flex: 1,
                              height: `${(bid.volume / step.orderBook.maxVolume) * 80}px`,
                              background: bid.highlight 
                                ? 'linear-gradient(to top, #10b981, #34d399)'
                                : 'linear-gradient(to top, rgba(16, 185, 129, 0.6), rgba(16, 185, 129, 0.3))',
                              borderRadius: '2px 2px 0 0',
                              border: bid.highlight ? '2px solid #fbbf24' : 'none',
                              transition: 'all 0.5s ease'
                            }}
                          />
                        ))}
                      </div>
                      
                      {/* Spread indicator */}
                      <div style={{
                        width: '8px',
                        height: '100%',
                        background: 'linear-gradient(to bottom, #fbbf24, #f59e0b)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '8px',
                        color: '#000',
                        fontWeight: '600'
                      }}>
                        |
                      </div>
                      
                      {/* Ask side bars */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'end', gap: '2px', flexDirection: 'row-reverse' }}>
                        {step.orderBook.asks.map((ask, idx) => (
                          <div 
                            key={idx}
                            style={{
                              flex: 1,
                              height: `${(ask.volume / step.orderBook.maxVolume) * 80}px`,
                              background: ask.highlight 
                                ? 'linear-gradient(to top, #ef4444, #f87171)'
                                : 'linear-gradient(to top, rgba(239, 68, 68, 0.6), rgba(239, 68, 68, 0.3))',
                              borderRadius: '2px 2px 0 0',
                              border: ask.highlight ? '2px solid #fbbf24' : 'none',
                              transition: 'all 0.5s ease'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    
                    {/* Analysis overlay */}
                    {step.orderBook.analysis && (
                      <AnalysisOverlay show={true}>
                        {step.orderBook.analysis}
                      </AnalysisOverlay>
                    )}
                    
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '16px',
                      fontSize: '11px',
                      color: '#9ca3af'
                    }}>
                      <span style={{ color: '#10b981' }}>Bids</span> | 
                      <span style={{ color: '#ef4444' }}> Asks</span>
                    </div>
                  </MiniChart>
                </ChartContainer>
              )}

              {/* Enhanced Order Book */}
              <OrderBookVisualization>
                <EnhancedBookSide side="bid">
                  <BookHeader side="bid">Bids (Buy Orders)</BookHeader>
                  {step.orderBook && step.orderBook.bids.map((bid, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <VolumeBar 
                        side="bid"
                        volume={bid.volume || bid.qty}
                        maxVolume={step.orderBook.maxVolume || 500}
                      />
                      <PriceLevel highlight={bid.highlight}>
                        <span>₹{bid.price.toFixed(2)}</span>
                        <span>{bid.qty}</span>
                      </PriceLevel>
                    </div>
                  ))}
                  {step.orderBook && step.orderBook.bidBuffer && (
                    <div style={{ 
                      marginTop: '12px', 
                      padding: '8px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      textAlign: 'center',
                      color: '#10b981'
                    }}>
                      Buffer: {step.orderBook.bidBuffer} qty
                    </div>
                  )}
                </EnhancedBookSide>

                <EnhancedBookSide side="ask">
                  <BookHeader side="ask">Asks (Sell Orders)</BookHeader>
                  {step.orderBook && step.orderBook.asks.map((ask, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <VolumeBar 
                        side="ask"
                        volume={ask.volume || ask.qty}
                        maxVolume={step.orderBook.maxVolume || 500}
                      />
                      <PriceLevel highlight={ask.highlight}>
                        <span>₹{ask.price.toFixed(2)}</span>
                        <span>{ask.qty}</span>
                      </PriceLevel>
                    </div>
                  ))}
                  {step.orderBook && step.orderBook.fillableQty && (
                    <div style={{ 
                      marginTop: '12px', 
                      padding: '8px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      textAlign: 'center',
                      color: '#ef4444'
                    }}>
                      Fillable: {step.orderBook.fillableQty} qty
                    </div>
                  )}
                  {step.orderBook && step.orderBook.executeQty && (
                    <div style={{ 
                      marginTop: '12px', 
                      padding: '8px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      textAlign: 'center',
                      color: '#10b981',
                      fontWeight: '600'
                    }}>
                      🚀 EXECUTE: {step.orderBook.executeQty} qty
                    </div>
                  )}
                </EnhancedBookSide>
              </OrderBookVisualization>

              {/* Market Data */}
              {step.orderBook && (step.orderBook.spread || step.orderBook.imbalance) && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  marginTop: '16px',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}>
                  {step.orderBook.spread && (
                    <div>
                      <strong>Spread:</strong> {step.orderBook.spread}%
                    </div>
                  )}
                  {step.orderBook.imbalance && (
                    <div>
                      <strong>Imbalance:</strong> {step.orderBook.imbalance}x
                    </div>
                  )}
                </div>
              )}
            </StepContainer>
          ))}

          {currentStep >= tutorialSteps.length - 1 && !isPlaying && (
            <div style={{
              textAlign: 'center',
              padding: '24px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.08))',
              border: '2px solid #10b981',
              borderRadius: '16px',
              margin: '20px 0'
            }}>
              <h3 style={{ color: '#10b981', margin: '0 0 12px 0' }}>
                🎉 Tutorial Complete!
              </h3>
              <p style={{ color: '#ffffff', margin: 0 }}>
                You now understand how the algorithm evaluates market conditions and executes trades safely.
              </p>
            </div>
          )}
        </VideoContainer>
      )}
    </TutorialContainer>
  );
};

export default AlgorithmTutorial;
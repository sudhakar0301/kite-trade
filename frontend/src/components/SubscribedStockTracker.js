import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';

// Excel Export Functionality
const ExcelLogger = {
  workbook: null,
  worksheet: null,
  
  // Initialize Excel workbook and worksheet
  init: () => {
    // Create workbook structure in memory
    ExcelLogger.workbook = {
      SheetNames: ['SST_Symbol_Log'],
      Sheets: {
        'SST_Symbol_Log': {
          '!ref': 'A1:D1',
          'A1': { v: 'Symbol', t: 's' },
          'B1': { v: 'Scan_Type', t: 's' },
          'C1': { v: 'Timestamp', t: 's' },
          'D1': { v: 'Price', t: 's' }
        }
      }
    };
    console.log('📊 Excel logger initialized');
  },
  
  // Add symbol entry to Excel data
  addEntry: (symbol, scanType, price) => {
    if (!ExcelLogger.workbook) ExcelLogger.init();
    
    const timestamp = new Date().toLocaleString();
    const worksheet = ExcelLogger.workbook.Sheets['SST_Symbol_Log'];
    
    // Find next row
    const range = worksheet['!ref'];
    const lastRow = range ? parseInt(range.split(':')[1].match(/\d+/)[0]) : 1;
    const newRow = lastRow + 1;
    
    // Add new row data
    worksheet[`A${newRow}`] = { v: symbol, t: 's' };
    worksheet[`B${newRow}`] = { v: scanType, t: 's' };
    worksheet[`C${newRow}`] = { v: timestamp, t: 's' };
    worksheet[`D${newRow}`] = { v: price, t: 'n' };
    
    // Update range
    worksheet['!ref'] = `A1:D${newRow}`;
    
    console.log(`📝 Added to Excel log: ${symbol} (${scanType}) at ${timestamp}`);
    
    // Auto-download updated Excel every 5 entries or on demand
    if (newRow % 6 === 0) { // Every 5 entries (excluding header)
      ExcelLogger.downloadExcel();
    }
  },
  
  // Download Excel file
  downloadExcel: () => {
    try {
      if (!ExcelLogger.workbook) {
        console.warn('⚠️ No Excel data to download');
        return;
      }
      
      // Convert to CSV format for download (browser-compatible)
      const worksheet = ExcelLogger.workbook.Sheets['SST_Symbol_Log'];
      let csvContent = '';
      
      // Get range
      const range = worksheet['!ref'];
      if (!range) return;
      
      const [start, end] = range.split(':');
      const startRow = 1;
      const endRow = parseInt(end.match(/\d+/)[0]);
      
      // Convert to CSV
      for (let row = startRow; row <= endRow; row++) {
        const rowData = [];
        for (const col of ['A', 'B', 'C', 'D']) {
          const cellRef = `${col}${row}`;
          const cell = worksheet[cellRef];
          rowData.push(cell ? cell.v : '');
        }
        csvContent += rowData.join(',') + '\n';
      }
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `SST_Symbol_Log_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      console.log('📥 Excel file downloaded successfully');
    } catch (error) {
      console.error('❌ Error downloading Excel file:', error);
    }
  },
  
  // Determine scan type from stock data - Enhanced with debugging and multiple sources
  determineScanType: (stockData) => {
    console.log('🔍 Excel Logger Debug - stockData:', stockData);
    
    // Use actual scan type from backend if available
    if (stockData && stockData.scan_type) {
      console.log('✅ Found scan_type from backend:', stockData.scan_type);
      return stockData.scan_type;
    }
    
    // Check if stockData has scan_type in different possible locations
    if (stockData && stockData.data && stockData.data.scan_type) {
      console.log('✅ Found scan_type in data field:', stockData.data.scan_type);
      return stockData.data.scan_type;
    }
    
    // Check for regime field which might indicate scan type
    if (stockData && stockData.regime) {
      console.log('🚀 Using regime as scan type indicator:', stockData.regime);
      if (stockData.regime === 'BULL') return 'BUY_SCAN_REGIME';
      if (stockData.regime === 'BEAR') return 'SELL_SCAN_REGIME';
    }
    
    // Fallback to heuristics if scan_type is not available (legacy data)
    if (!stockData) {
      console.log('⚠️ No stockData provided to determineScanType');
      return 'NO_DATA';
    }
    
    const changePercent = parseFloat(stockData.change_percent || 0);
    const volume = parseInt(stockData.volume || 0);
    
    console.log(`📈 Fallback heuristics - Change: ${changePercent}%, Volume: ${volume}`);
    
    // Enhanced heuristic logic with better classification
    if (changePercent > 2 && volume > 100000) {
      return 'BUY_STRONG_HEURISTIC';
    } else if (changePercent < -2 && volume > 100000) {
      return 'SELL_STRONG_HEURISTIC';
    } else if (changePercent > 1 && volume > 50000) {
      return 'BUY_MODERATE_HEURISTIC';
    } else if (changePercent < -1 && volume > 50000) {
      return 'SELL_MODERATE_HEURISTIC';
    } else if (changePercent > 0) {
      return 'BUY_WEAK_HEURISTIC';
    } else if (changePercent < 0) {
      return 'SELL_WEAK_HEURISTIC';
    } else {
      return 'NEUTRAL_HEURISTIC';
    }
  }
};

// AI Trading Advisor Service
const AITradingAdvisor = {
  // Configuration for different AI providers
  providers: {
    openai: {
      enabled: false, // Set to true and add API key to use
      apiKey: '', // Add your OpenAI API key here
      model: 'gpt-4',
      endpoint: 'https://api.openai.com/v1/chat/completions'
    },
    local: {
      enabled: true, // Uses local analysis without external APIs
      model: 'rule-based'
    }
  },

  // Enhanced Local AI Analysis (no API keys needed)
  analyzeLocally: (stockData, analytics, symbol) => {
    const insights = [];
    const signals = [];
    let overallSentiment = 'NEUTRAL';
    let confidence = 0;

    // === ENHANCED TECHNICAL ANALYSIS ===
    
    // 1. Advanced Price Action Analysis
    const currentPrice = parseFloat(stockData.last_price || 0);
    const changePercent = parseFloat(stockData.change_percent || 0);
    const volume = parseInt(stockData.volume || 0);
    
    // Price momentum scoring
    let momentumScore = 0;
    if (Math.abs(changePercent) > 5) {
      momentumScore = changePercent > 0 ? 40 : -40;
      insights.push(`🚀 Extreme ${changePercent > 0 ? 'bullish' : 'bearish'} momentum (${changePercent.toFixed(2)}%)`);
    } else if (Math.abs(changePercent) > 3) {
      momentumScore = changePercent > 0 ? 25 : -25;
      insights.push(`📈 Strong ${changePercent > 0 ? 'upward' : 'downward'} movement (${changePercent.toFixed(2)}%)`);
    } else if (Math.abs(changePercent) > 1) {
      momentumScore = changePercent > 0 ? 15 : -15;
      insights.push(`⬆️ Moderate price ${changePercent > 0 ? 'gain' : 'decline'} (${changePercent.toFixed(2)}%)`);
    }
    
    // 2. Volume Analysis with Scoring
    let volumeScore = 0;
    
    if (volume > 500000) {
      volumeScore = 25;
      insights.push(`🔥 Exceptional volume surge (${(volume/1000).toFixed(0)}K) - major interest`);
    } else if (volume > 200000) {
      volumeScore = 15;
      insights.push(`📊 High volume activity (${(volume/1000).toFixed(0)}K) - strong participation`);
    } else if (volume > 50000) {
      volumeScore = 5;
      insights.push(`📈 Normal trading volume (${(volume/1000).toFixed(0)}K)`);
    } else {
      volumeScore = -10;
      insights.push(`📉 Low volume (${(volume/1000).toFixed(0)}K) - limited interest`);
    }

    // 3. Advanced Order Book Intelligence
    let orderBookScore = 0;
    if (analytics) {
      const l5 = analytics.l5 || {};
      const l10 = analytics.l10 || {};
      const l20 = analytics.l20 || {};
      
      // Multi-level imbalance analysis
      const l5Imbalance = l5.imbalance || 0;
      const l10Imbalance = l10.imbalance || 0;
      const l20Imbalance = l20.imbalance || 0;
      
      // Imbalance consistency scoring
      const consistency = (Math.sign(l5Imbalance) === Math.sign(l10Imbalance) && 
                          Math.sign(l10Imbalance) === Math.sign(l20Imbalance)) ? 1.5 : 1;
      
      if (Math.abs(l10Imbalance) > 30) {
        orderBookScore = (l10Imbalance > 0 ? 35 : -35) * consistency;
        insights.push(`⚡ Extreme L10 ${l10Imbalance > 0 ? 'buy' : 'sell'} wall (${Math.abs(l10Imbalance).toFixed(1)}%)`);
        signals.push(l10Imbalance > 0 ? 'STRONG_BUY_WALL' : 'STRONG_SELL_WALL');
        
        if (consistency > 1) {
          insights.push(`🏗️ Multi-level ${l10Imbalance > 0 ? 'support' : 'resistance'} structure confirmed`);
        }
      } else if (Math.abs(l10Imbalance) > 15) {
        orderBookScore = (l10Imbalance > 0 ? 20 : -20) * consistency;
        insights.push(`⚖️ Significant L10 ${l10Imbalance > 0 ? 'buying' : 'selling'} pressure (${Math.abs(l10Imbalance).toFixed(1)}%)`);
      }
      
      // Spread quality analysis
      const l10Spread = l10.spreadPercent || 0;
      if (l10Spread > 1.0) {
        orderBookScore -= 15;
        insights.push(`🌊 Wide spread alert (${l10Spread.toFixed(3)}%) - illiquid conditions`);
        signals.push('LIQUIDITY_CONCERN');
      } else if (l10Spread < 0.05) {
        orderBookScore += 10;
        insights.push(`💧 Excellent liquidity (${l10Spread.toFixed(3)}% spread)`);
      }
      
      // Depth progression analysis
      const l5Total = (l5.bidQtySum || 0) + (l5.askQtySum || 0);
      const l20Total = (l20.bidQtySum || 0) + (l20.askQtySum || 0);
      
      if (l20Total > l5Total * 3) {
        insights.push(`🏔️ Deep market depth - strong institutional interest`);
        orderBookScore += 10;
      }
    }

    // 4. Pattern Recognition & Market Microstructure
    const priceLevel = currentPrice;
    const roundNumber = Math.round(priceLevel / 100) * 100;
    const distanceToRound = Math.abs(priceLevel - roundNumber) / priceLevel * 100;
    
    if (distanceToRound < 1) {
      insights.push(`🎯 Near psychological level ₹${roundNumber} - potential ${priceLevel < roundNumber ? 'resistance' : 'support'}`);
      signals.push(priceLevel < roundNumber ? 'PSYCHOLOGICAL_RESISTANCE' : 'PSYCHOLOGICAL_SUPPORT');
    }

    // 5. Market Context Analysis
    const marketHour = new Date().getHours();
    let timeScore = 0;
    
    if (marketHour >= 9 && marketHour <= 11) {
      timeScore = 15;
      insights.push(`⏰ Morning session - high volatility window`);
    } else if (marketHour >= 14 && marketHour <= 15) {
      timeScore = 20;
      insights.push(`⏰ Closing hour - potential directional moves`);
    } else if (marketHour >= 11 && marketHour <= 14) {
      timeScore = 5;
      insights.push(`⏰ Midday session - typically lower volatility`);
    }

    // === ADVANCED SCORING & SENTIMENT ===
    
    // Calculate composite score
    const totalScore = momentumScore + volumeScore + orderBookScore + timeScore;
    confidence = Math.min(Math.abs(totalScore) * 1.2, 100);
    
    // Determine sentiment with nuanced thresholds
    if (totalScore > 40) {
      overallSentiment = 'STRONG_BULLISH';
    } else if (totalScore > 20) {
      overallSentiment = 'BULLISH';
    } else if (totalScore < -40) {
      overallSentiment = 'STRONG_BEARISH';
    } else if (totalScore < -20) {
      overallSentiment = 'BEARISH';
    } else {
      overallSentiment = 'NEUTRAL';
    }

    // === SOPHISTICATED TRADING RECOMMENDATIONS ===
    
    let advice = '';
    const riskReward = confidence > 60 ? '1:2' : '1:1.5';
    const position_size = confidence > 70 ? 'Full' : confidence > 50 ? 'Half' : 'Small';
    
    if (overallSentiment === 'STRONG_BULLISH' && confidence > 60) {
      const target1 = (currentPrice * 1.025).toFixed(2);
      const target2 = (currentPrice * 1.04).toFixed(2);
      const stopLoss = (currentPrice * 0.975).toFixed(2);
      
      advice = `🚀 STRONG BUY Signal\\n${position_size} position recommended\\n🎯 T1: ₹${target1} (+2.5%) | T2: ₹${target2} (+4%)\\n🛡️ SL: ₹${stopLoss} (-2.5%) | R:R = ${riskReward}`;
      signals.push('ACTION_BUY');
      
    } else if (overallSentiment === 'BULLISH' && confidence > 45) {
      const target = (currentPrice * 1.02).toFixed(2);
      const stopLoss = (currentPrice * 0.985).toFixed(2);
      
      advice = `📈 BUY Signal\\n${position_size} position\\n🎯 Target: ₹${target} (+2%)\\n🛡️ Stop: ₹${stopLoss} (-1.5%)`;
      signals.push('ACTION_BUY');
      
    } else if (overallSentiment === 'STRONG_BEARISH' && confidence > 60) {
      const target1 = (currentPrice * 0.975).toFixed(2);
      const target2 = (currentPrice * 0.96).toFixed(2);
      const stopLoss = (currentPrice * 1.025).toFixed(2);
      
      advice = `🐻 STRONG SELL Signal\\n${position_size} short recommended\\n🎯 T1: ₹${target1} (-2.5%) | T2: ₹${target2} (-4%)\\n🛡️ SL: ₹${stopLoss} (+2.5%)`;
      signals.push('ACTION_SELL');
      
    } else if (overallSentiment === 'BEARISH' && confidence > 45) {
      const resistance = currentPrice.toFixed(2);
      const target = (currentPrice * 0.98).toFixed(2);
      
      advice = `📉 AVOID/SHORT\\nResistance at ₹${resistance}\\n🎯 Downside target: ₹${target} (-2%)`;
      signals.push('ACTION_AVOID');
      
    } else {
      const support = (currentPrice * 0.98).toFixed(2);
      const resistance = (currentPrice * 1.02).toFixed(2);
      
      advice = `⏳ WAIT for clearer signal\\nRange: ₹${support} - ₹${resistance}\\n🔍 Watch for breakout direction`;
      signals.push('ACTION_WAIT');
    }
    
    // Add risk management insights
    if (confidence > 80) {
      insights.push(`🔥 High confidence setup - consider larger position`);
    } else if (confidence < 30) {
      insights.push(`⚠️ Low confidence - reduce position size or wait`);
    }

    return {
      sentiment: overallSentiment,
      confidence: Math.round(confidence),
      insights,
      advice,
      signals,
      timestamp: new Date().toLocaleTimeString(),
      technicalScore: Math.round(totalScore),
      components: {
        momentum: Math.round(momentumScore),
        volume: Math.round(volumeScore),
        orderBook: Math.round(orderBookScore),
        timing: Math.round(timeScore)
      }
    };
  },

  // Main analysis function
  analyze: async (stockData, analytics, symbol) => {
    try {
      // Always use local analysis as primary method
      const localAnalysis = AITradingAdvisor.analyzeLocally(stockData, analytics, symbol);
      
      // TODO: Add external AI provider integration if needed
      // if (AITradingAdvisor.providers.openai.enabled) {
      //   const aiAnalysis = await AITradingAdvisor.analyzeWithOpenAI(stockData, analytics, symbol);
      //   return { ...localAnalysis, aiInsights: aiAnalysis };
      // }
      
      return localAnalysis;
    } catch (error) {
      console.error('AI Analysis Error:', error);
      return {
        sentiment: 'ERROR',
        confidence: 0,
        insights: ['❌ Analysis temporarily unavailable'],
        advice: '⚠️ Please check data and try again',
        signals: [],
        timestamp: new Date().toLocaleTimeString()
      };
    }
  }
};

const AIAdvisorContainer = styled.div`
  background: linear-gradient(135deg, rgba(138, 43, 226, 0.1) 0%, rgba(75, 0, 130, 0.1) 100%);
  border: 2px solid rgba(138, 43, 226, 0.3);
  border-radius: 12px;
  padding: 15px;
  margin-top: 15px;
  grid-column: 1 / -1;
`;

const AIAdvisorHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
`;

const AIAdvisorTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: #da70d6;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SentimentBadge = styled.div`
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => {
    switch(props.sentiment) {
      case 'STRONG_BULLISH': return 'linear-gradient(135deg, #00ff00, #32cd32)';
      case 'BULLISH': return 'linear-gradient(135deg, #90ee90, #00cc00)';
      case 'STRONG_BEARISH': return 'linear-gradient(135deg, #ff0000, #dc143c)';
      case 'BEARISH': return 'linear-gradient(135deg, #ff4444, #cc0000)';
      case 'NEUTRAL': return 'linear-gradient(135deg, #ffd700, #ffaa00)';
      default: return 'linear-gradient(135deg, #666, #444)';
    }
  }};
  color: #000;
`;

const ConfidenceBar = styled.div`
  width: 60px;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  
  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: ${props => props.confidence}%;
    background: ${props => {
      const conf = props.confidence;
      if (conf > 70) return 'linear-gradient(90deg, #00ff00, #00cc00)';
      if (conf > 40) return 'linear-gradient(90deg, #ffd700, #ffaa00)';
      return 'linear-gradient(90deg, #ff4444, #cc0000)';
    }};
    transition: width 0.5s ease;
  }
`;

const AIInsightsGrid = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
`;

const InsightsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InsightItem = styled.div`
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-left: 3px solid #da70d6;
  border-radius: 6px;
  font-size: 13px;
  color: #e6e6e6;
`;

const AdvicePanel = styled.div`
  padding: 15px;
  background: rgba(218, 112, 214, 0.1);
  border: 1px solid rgba(218, 112, 214, 0.3);
  border-radius: 8px;
  font-size: 14px;
  color: #da70d6;
  font-weight: 500;
  text-align: center;
`;

const AnalysisTimestamp = styled.div`
  font-size: 10px;
  color: #999;
  text-align: right;
  margin-top: 10px;
`;

const RefreshButton = styled.button`
  padding: 6px 12px;
  background: linear-gradient(135deg, #da70d6, #9932cc);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: linear-gradient(135deg, #9932cc, #7b68ee);
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

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

const SideTitle = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
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

const BestPriceDisplay = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
  font-size: 9px;
  color: ${props => props.side === 'buy' ? '#00ff00' : '#ff6b6b'};
  font-weight: 500;
  opacity: 0.8;
`;

const OrderLevel = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isBest', 'side'].includes(prop),
})`
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

const BestLabel = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
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

const LevelPrice = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
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

const ChartIframe = styled.iframe`
  width: 100%;
  height: 600px;
  border: 2px solid #333;
  border-radius: 12px;
  background: #1a1a1a;
  margin: 0;
  display: block;
  
  /* Ensure iframe is visible */
  opacity: 1;
  visibility: visible;
  
  /* Add loading state */
  &:not([src]) {
    background: rgba(255, 255, 255, 0.1);
    
    &::before {
      content: 'Loading chart...';
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #666;
    }
  }
`;

const SubscribedStockTracker = ({ tickData }) => {
  // State to track currently selected stock symbol
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // State to trigger re-renders for countdown timer
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Excel Logging State
  const [loggedSymbols, setLoggedSymbols] = useState(new Set());
  const loggedSymbolsRef = useRef(new Set());
  
  // Refs to avoid infinite loops
  const symbolTimestampsRef = useRef({});
  const previousSymbolsRef = useRef(new Set());
  const symbolsAtSelectionRef = useRef({}); // Track which symbols existed when each symbol was selected
  
  // Debug: Log the received tickData
 // console.log('🔍 SubscribedStockTracker - Received tickData:', tickData);
  //console.log('🔍 TickData type:', typeof tickData);
  //console.log('🔍 TickData keys:', tickData ? Object.keys(tickData) : 'null/undefined');
  
  // Complete Symbol to Token mapping (NSE symbols with Kite instrument tokens)
  const symbolToTokenMap = {
    '360ONE': '3343617',
    '3MINDIA': '121345',
    'ABB': '3329',
    'ACC': '5633',
    'ACMESOLAR': '6927617',
    'AIAENG': '3350017',
    'APLAPOLLO': '6599681',
    'AUBANK': '5436929',
    'AWL': '2076161',
    'AADHARHFC': '6074625',
    'AARTIIND': '1793',
    'AAVAS': '1378561',
    'ABBOTINDIA': '4583169',
    'ACE': '3478273',
    'ADANIENSOL': '2615553',
    'ADANIENT': '6401',
    'ADANIGREEN': '912129',
    'ADANIPORTS': '3861249',
    'ADANIPOWER': '4451329',
    'ATGL': '1552897',
    'ABCAPITAL': '5533185',
    'ABFRL': '7707649',
    'ABLBL': '193751809',
    'ABREL': '160001',
    'ABSLAMC': '1540609',
    'AEGISLOG': '10241',
    'AEGISVOPAK': '193878017',
    'AFCONS': '6650113',
    'AFFLE': '2903809',
    'AJANTPHARM': '2079745',
    'AKUMS': '6327041',
    'AKZOINDIA': '375553',
    'APLLTD': '6483969',
    'ALKEM': '2995969',
    'ALKYLAMINE': '1148673',
    'ALOKINDS': '4524801',
    'ARE&M': '25601',
    'AMBER': '303361',
    'AMBUJACEM': '325121',
    'ANANDRATHI': '1829121',
    'ANANTRAJ': '3486721',
    'ANGELONE': '82945',
    'APARINDS': '2941697',
    'APOLLOHOSP': '40193',
    'APOLLOTYRE': '41729',
    'APTUS': '1391361',
    'ASAHIINDIA': '1376769',
    'ASHOKLEY': '54273',
    'ASIANPAINT': '60417',
    'ASTERDM': '386049',
    'ASTRAZEN': '1436161',
    'ASTRAL': '3691009',
    'ATHERENERG': '193957121',
    'ATUL': '67329',
    'AUROPHARMA': '70401',
    'AIIL': '6029569',
    'DMART': '5097729',
    'AXISBANK': '1510401',
    'BASF': '94209',
    'BEML': '101121',
    'BLS': '4423425',
    'BSE': '5013761',
    'BAJAJ-AUTO': '4267265',
    'BAJFINANCE': '81153',
    'BAJAJFINSV': '4268801',
    'BAJAJHLDNG': '78081',
    'BAJAJHFL': '6469121',
    'BALKRISIND': '85761',
    'BALRAMCHIN': '87297',
    'BANDHANBNK': '579329',
    'BANKBARODA': '1195009',
    'BANKINDIA': '1214721',
    'MAHABANK': '2912513',
    'BATAINDIA': '94977',
    'BAYERCROP': '4589313',
    'BERGEPAINT': '103425',
    'BDL': '548865',
    'BEL': '98049',
    'BHARATFORG': '108033',
    'BHEL': '112129',
    'BPCL': '134657',
    'BHARTIARTL': '2714625',
    'BHARTIHEXA': '6013185',
    'BIKAJI': '3063297',
    'BIOCON': '2911489',
    'BSOFT': '1790465',
    'BLUEDART': '126721',
    'BLUEJET': '5039617',
    'BLUESTARCO': '2127617',
    'BBTC': '97281',
    'BOSCHLTD': '558337',
    'FIRSTCRY': '6352385',
    'BRIGADE': '3887105',
    'BRITANNIA': '140033',
    'MAPMYINDIA': '1850113',
    'CCL': '2931713',
    'CESC': '160769',
    'CGPOWER': '194561',
    'CRISIL': '193793',
    'CAMPUS': '2396673',
    'CANFINHOME': '149249',
    'CANBK': '2763265',
    'CAPLIPOINT': '999937',
    'CGCL': '5204225',
    'CARBORUNIV': '152321',
    'CASTROLIND': '320001',
    'CEATLTD': '3905025',
    'CENTRALBK': '3812865',
    'CDSL': '5420545',
    'CENTURYPLY': '3406081',
    'CERA': '3849985',
    'CHALET': '2187777',
    'CHAMBLFERT': '163073',
    'CHENNPETRO': '524545',
    'CHOICEIN': '2269697',
    'CHOLAHLDNG': '5565441',
    'CHOLAFIN': '175361',
    'CIPLA': '177665',
    'CUB': '1459457',
    'CLEAN': '1292545',
    'COALINDIA': '5215745',
    'COCHINSHIP': '5506049',
    'COFORGE': '2955009',
    'COHANCE': '4593921',
    'COLPAL': '3876097',
    'CAMS': '87553',
    'CONCORDBIO': '4623361',
    'CONCOR': '1215745',
    'COROMANDEL': '189185',
    'CRAFTSMAN': '730625',
    'CREDITACC': '1131777',
    'CROMPTON': '4376065',
    'CUMMINSIND': '486657',
    'CYIENT': '1471489',
    'DCMSHRIRAM': '207617',
    'DLF': '3771393',
    'DOMS': '5261057',
    'DABUR': '197633',
    'DALBHARAT': '2067201',
    'DATAPATTNS': '1883649',
    'DEEPAKFERT': '211713',
    'DEEPAKNTR': '5105409',
    'DELHIVERY': '2457345',
    'DEVYANI': '1375489',
    'DIVISLAB': '2800641',
    'DIXON': '5552641',
    'AGARWALEYE': '7539713',
    'LALPATHLAB': '2983425',
    'DRREDDY': '225537',
    'EIDPARRY': '234497',
    'EIHOTEL': '235265',
    'EICHERMOT': '232961',
    'ELECON': '3492609',
    'ELGIEQUIP': '239873',
    'EMAMILTD': '3460353',
    'EMCURE': '6245889',
    'ENDURANCE': '4818433',
    'ENGINERSIN': '1256193',
    'ERIS': '5415425',
    'ESCORTS': '245249',
    'ETERNAL': '1304833',
    'EXIDEIND': '173057',
    'NYKAA': '1675521',
    'FEDERALBNK': '261889',
    'FACT': '258049',
    'FINCABLES': '265729',
    'FINPIPE': '266497',
    'FSL': '3661825',
    'FIVESTAR': '3080193',
    'FORCEMOT': '2962689',
    'FORTIS': '3735553',
    'GAIL': '1207553',
    'GVT&D': '4296449',
    'GMRAIRPORT': '3463169',
    'GRSE': '1401601',
    'GICRE': '70913',
    'GILLETTE': '403457',
    'GLAND': '303617',
    'GLAXO': '295169',
    'GLENMARK': '1895937',
    'MEDANTA': '3060737',
    'GODIGIT': '6092545',
    'GPIL': '3432705',
    'GODFRYPHLP': '302337',
    'GODREJAGRO': '36865',
    'GODREJCP': '2585345',
    'GODREJIND': '2796801',
    'GODREJPROP': '4576001',
    'GRANULES': '3039233',
    'GRAPHITE': '151553',
    'GRASIM': '315393',
    'GRAVITA': '5256705',
    'GESHIP': '3526657',
    'FLUOROCHEM': '3520001',
    'GUJGASLTD': '2713345',
    'GMDCLTD': '1332225',
    'GSPL': '3378433',
    'HEG': '342017',
    'HBLENGINE': '3575297',
    'HCLTECH': '1850625',
    'HDFCAMC': '1086465',
    'HDFCBANK': '341249',
    'HDFCLIFE': '119553',
    'HFCL': '5619457',
    'HAPPSTMNDS': '12289',
    'HAVELLS': '2513665',
    'HEROMOTOCO': '345089',
    'HEXT': '7594497',
    'HSCL': '3669505',
    'HINDALCO': '348929',
    'HAL': '589569',
    'HINDCOPPER': '4592385',
    'HINDPETRO': '359937',
    'HINDUNILVR': '356865',
    'HINDZINC': '364545',
    'POWERINDIA': '4724993',
    'HOMEFIRST': '526337',
    'HONASA': '5072129',
    'HONAUT': '874753',
    'HUDCO': '5331201',
    'HYUNDAI': '6616065',
    'ICICIBANK': '1270529',
    'ICICIGI': '5573121',
    'ICICIPRULI': '4774913',
    'IDBI': '377857',
    'IDFCFIRSTB': '2863105',
    'IFCI': '381697',
    'IIFL': '3023105',
    'INOXINDIA': '5275393',
    'IRB': '3920129',
    'IRCON': '1276417',
    'ITCHOTELS': '7488257',
    'ITC': '424961',
    'ITI': '428801',
    'INDGN': '6065409',
    'INDIACEM': '387841',
    'INDIAMART': '2745857',
    'INDIANB': '3663105',
    'IEX': '56321',
    'INDHOTEL': '387073',
    'IOC': '415745',
    'IOB': '2393089',
    'IRCTC': '3484417',
    'IRFC': '519425',
    'IREDA': '5186817',
    'IGL': '2883073',
    'INDUSTOWER': '7458561',
    'INDUSINDBK': '1346049',
    'NAUKRI': '3520257',
    'INFY': '408065',
    'INOXWIND': '2010113',
    'INTELLECT': '1517057',
    'INDIGO': '2865921',
    'IGIL': '7264769',
    'IKS': '7200001',
    'IPCALAB': '418049',
    'JBCHEPHARM': '441857',
    'JKCEMENT': '3397121',
    'JBMA': '2983681',
    'JKTYRE': '3695361',
    'JMFINANCIL': '3491073',
    'JSWCEMENT': '194165761',
    'JSWENERGY': '4574465',
    'JSWINFRA': '4869121',
    'JSWSTEEL': '3001089',
    'JPPOWER': '3011329',
    'J&KBANK': '1442049',
    'JINDALSAW': '774145',
    'JSL': '2876417',
    'JINDALSTEL': '1723649',
    'JIOFIN': '4644609',
    'JUBLFOOD': '4632577',
    'JUBLINGREA': '712449',
    'JUBLPHARMA': '931073',
    'JWL': '5177345',
    'JYOTHYLAB': '3877377',
    'JYOTICNC': '5461505',
    'KPRMILL': '3817473',
    'KEI': '3407361',
    'KPITTECH': '2478849',
    'KSB': '498945',
    'KAJARIACER': '462849',
    'KPIL': '464385',
    'KALYANKJIL': '756481',
    'KARURVYSYA': '470529',
    'KAYNES': '3095553',
    'KEC': '3394561',
    'KFINTECH': '3419905',
    'KIRLOSBROS': '4756737',
    'KIRLOSENG': '5359617',
    'KOTAKBANK': '492033',
    'KIMS': '1240833',
    'LTF': '6386689',
    'LTTS': '4752385',
    'LICHSGFIN': '511233',
    'LTFOODS': '3536897',
    'LTM': '4561409',
    'LT': '2939649',
    'LATENTVIEW': '1745409',
    'LAURUSLABS': '4923905',
    'THELEELA': '193795585',
    'LEMONTREE': '667137',
    'LICI': '2426881',
    'LINDEINDIA': '416513',
    'LLOYDSME': '4432129',
    'LODHA': '824321',
    'LUPIN': '2672641',
    'MMTC': '4596993',
    'MRF': '582913',
    'MGL': '4488705',
    'MAHSCOOTER': '533761',
    'MAHSEAMLES': '534529',
    'M&MFIN': '3400961',
    'M&M': '519937',
    'MANAPPURAM': '4879617',
    'MRPL': '584449',
    'MANKIND': '3937281',
    'MARICO': '1041153',
    'MARUTI': '2815745',
    'MFSL': '548353',
    'MAXHEALTH': '5728513',
    'MAZDOCK': '130305',
    'METROPOLIS': '2452737',
    'MINDACORP': '6629633',
    'MSUMI': '2200577',
    'MOTILALOFS': '3826433',
    'MPHASIS': '1152769',
    'MCX': '7982337',
    'MUTHOOTFIN': '6054401',
    'NATCOPHARM': '1003009',
    'NBCC': '8042241',
    'NCC': '593665',
    'NHPC': '4454401',
    'NLCINDIA': '2197761',
    'NMDC': '3924993',
    'NSLNISP': '3630081',
    'NTPCGREEN': '6957057',
    'NTPC': '2977281',
    'NH': '3031041',
    'NATIONALUM': '1629185',
    'NAVA': '1027585',
    'NAVINFLUOR': '3756033',
    'NESTLEIND': '4598529',
    'NETWEB': '4462849',
    'NEULANDLAB': '615937',
    'NEWGEN': '297985',
    'NAM-INDIA': '91393',
    'NIVABUPA': '6936833',
    'NUVAMA': '4792577',
    'NUVOCO': '1389057',
    'OBEROIRLTY': '5181953',
    'ONGC': '633601',
    'OIL': '4464129',
    'OLAELEC': '6342913',
    'OLECTRA': '2723073',
    'PAYTM': '1716481',
    'ONESOURCE': '7481345',
    'OFSS': '2748929',
    'POLICYBZR': '1703937',
    'PCBL': '678145',
    'PGEL': '6491649',
    'PIIND': '6191105',
    'PNBHOUSING': '4840449',
    'PTCIL': '4270593',
    'PVRINOX': '3365633',
    'PAGEIND': '3689729',
    'PATANJALI': '4359425',
    'PERSISTENT': '4701441',
    'PETRONET': '2905857',
    'PFIZER': '676609',
    'PHOENIXLTD': '3725313',
    'PIDILITIND': '681985',
    'PPLPHARMA': '2962177',
    'POLYMED': '6583809',
    'POLYCAB': '2455041',
    'POONAWALLA': '2919169',
    'PFC': '3660545',
    'POWERGRID': '3834113',
    'PRAJIND': '692481',
    'PREMIERENE': '6412545',
    'PRESTIGE': '5197313',
    'PGHH': '648961',
    'PNB': '2730497',
    'RRKABEL': '4752897',
    'RBLBANK': '4708097',
    'RECLTD': '3930881',
    'RHIM': '7977729',
    'RITES': '962817',
    'RADICO': '2813441',
    'RVNL': '2445313',
    'RAILTEL': '622337',
    'RAINBOW': '2408449',
    'RKFORGE': '2921217',
    'RCF': '733697',
    'REDINGTON': '3649281',
    'RELIANCE': '738561',
    'RELINFRA-BE': '1226497',
    'RPOWER': '3906305',
    'SBFC': '4614657',
    'SBICARD': '4600577',
    'SBILIFE': '5582849',
    'SJVN': '4834049',
    'SRF': '837889',
    'SAGILITY': '6925313',
    'SAILIFE': '7126785',
    'SAMMAANCAP': '7712001',
    'MOTHERSON': '1076225',
    'SAPPHIRE': '1719809',
    'SARDAEN': '4546049',
    'SAREGAMA': '1252353',
    'SCHAEFFLER': '258817',
    'SCHNEIDER-BE': '7996929',
    'SCI': '780289',
    'SHREECEM': '794369',
    'SHRIRAMFIN': '1102337',
    'SHYAMMETL': '1201409',
    'ENRIN': '193758977',
    'SIEMENS': '806401',
    'SIGNATURE': '4798209',
    'SOBHA': '3539457',
    'SOLARINDS': '3412993',
    'SONACOMS': '1199105',
    'SONATSOFTW': '1688577',
    'STARHEALTH': '1813249',
    'SBIN': '779521',
    'SAIL': '758529',
    'SUMICHEM': '4378881',
    'SUNPHARMA': '857857',
    'SUNTV': '3431425',
    'SUNDARMFIN': '854785',
    'SUNDRMFAST': '856321',
    'SUPREMEIND': '860929',
    'SUZLON': '3076609',
    'SWANCORP': '6936321',
    'SWIGGY': '6928897',
    'SYNGENE': '2622209',
    'SYRMA': '2763009',
    'TBOTEK': '6077441',
    'TVSMOTOR': '2170625',
    'TATACHEM': '871681',
    'TATACOMM': '952577',
    'TCS': '2953217',
    'TATACONSUM': '878593',
    'TATAELXSI': '873217',
    'TATAINVEST': '414977',
    'TMPV': '884737',
    'TATAPOWER': '877057',
    'TATASTEEL': '895745',
    'TATATECH': '5195009',
    'TTML': '2292225',
    'TECHM': '3465729',
    'TECHNOE': '1649921',
    'TEJASNET': '5409537',
    'NIACL': '102145',
    'RAMCOCEM': '523009',
    'THERMAX': '889601',
    'TIMKEN': '3634689',
    'TITAGARH': '3945985',
    'TITAN': '897537',
    'TORNTPHARM': '900609',
    'TORNTPOWER': '3529217',
    'TARIL': '3884545',
    'TRENT': '502785',
    'TRIDENT': '2479361',
    'TRIVENI': '3348737',
    'TRITURBINE': '6549505',
    'TIINDIA': '79873',
    'UCOBANK': '2873089',
    'UNOMINDA': '3623425',
    'UPL': '2889473',
    'UTIAMC': '134913',
    'ULTRACEMCO': '2952193',
    'UNIONBANK': '2752769',
    'UBL': '4278529',
    'UNITDSPR': '2674433',
    'USHAMART': '2263041',
    'VGUARD': '3932673',
    'DBREALTY': '4639745',
    'VTL': '530689',
    'VBL': '4843777',
    'MANYAVAR': '2090753',
    'VEDL': '784129',
    'VENTIVE': '7384833',
    'VIJAYA': '1429761',
    'VMM': '7160065',
    'IDEA': '3677697',
    'VOLTAS': '951809',
    'WAAREEENER': '6632193',
    'WELCORP': '3026177',
    'WELSPUNLIV': '2880769',
    'WHIRLPOOL': '4610817',
    'WIPRO': '969473',
    'WOCKPHARMA': '1921537',
    'YESBANK': '3050241',
    'ZFCVINDIA': '4330241',
    'ZEEL': '975873',
    'ZENTEC': '1922049',
    'ZENSARTECH': '275457',
    'ZYDUSLIFE': '2029825',
    'ECLERX': '3885825'
  };
  
  // Function to get token from symbol
  const getTokenFromSymbol = (symbol) => {
    if (!symbol) return null;
    
    // Remove NSE: prefix if present
    const cleanSymbol = symbol.replace('NSE:', '');
    
    // Look up in our mapping
    return symbolToTokenMap[cleanSymbol] || null;
  };
  
  // Function to construct Kite chart URL
  const getKiteChartUrl = (symbol) => {
    if (!symbol) {
      console.log('🔍 No symbol provided for chart URL');
      return null;
    }
    
    const cleanSymbol = symbol.replace('NSE:', '');
    const token = getTokenFromSymbol(symbol);
    
    console.log('🔍 Chart URL Debug:');
    console.log('  - Original symbol:', symbol);
    console.log('  - Clean symbol:', cleanSymbol);
    console.log('  - Token found:', token);
    
    if (!token) {
      console.log('🔍 ❌ No token found for symbol:', cleanSymbol);
      return null;
    }
    
    const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${token}`;
    console.log('🔍 ✅ Generated Kite chart URL:', chartUrl);
    
    return chartUrl;
  };
  
  // Get list of currently subscribed stocks (stocks with active data)
  const getSubscribedStocks = useCallback(() => {
    if (!tickData) return [];
    
    return Object.entries(tickData)
      .filter(([symbol, history]) => history && history.length > 0)
      .sort(([, historyA], [, historyB]) => {
        // Sort by most recent activity (history length as proxy)
        return historyB.length - historyA.length;
      })
      .map(([symbol]) => symbol);
  }, [tickData]);
  
  // Get list of all available symbols (even those without tick data yet)
  const getAllAvailableSymbols = useCallback(() => {
    if (!tickData) return [];
    
    return Object.keys(tickData).sort((a, b) => {
      const historyA = tickData[a] || [];
      const historyB = tickData[b] || [];
      // Prioritize symbols with data, then by recency
      if (historyA.length > 0 && historyB.length === 0) return -1;
      if (historyA.length === 0 && historyB.length > 0) return 1;
      return historyB.length - historyA.length;
    });
  }, [tickData]);
  
  // Effect to update selected stock when tickData changes
  useEffect(() => {
    const subscribedStocks = getSubscribedStocks();
    const allAvailableSymbols = getAllAvailableSymbols();
    console.log('🔍 Currently subscribed stocks:', subscribedStocks);
    console.log('🔍 All available symbols:', allAvailableSymbols);
    
    // Check for newly subscribed symbols (including those without data yet)
    const newSymbols = allAvailableSymbols.filter(symbol => !previousSymbolsRef.current.has(symbol));
    
    console.log('🔍 Symbol detection debug:');
    console.log('  - Previous symbols:', Array.from(previousSymbolsRef.current));
    console.log('  - Current available:', allAvailableSymbols);
    console.log('  - Detected new symbols:', newSymbols);
    
    if (newSymbols.length > 0) {
      console.log('🔍 ✨ NEW SYMBOLS DETECTED:', newSymbols);
      console.log('🔍 Current selectedSymbol:', selectedSymbol);
      console.log('🔍 Current symbolTimestampsRef:', symbolTimestampsRef.current);
      
      // 📊 Excel Logging for New Symbols - Enhanced debugging
      newSymbols.forEach(symbol => {
        if (!loggedSymbolsRef.current.has(symbol)) {
          console.log(`🔍 Excel logging for symbol: ${symbol}`);
          
          // Get the stock data for this symbol - tickData is an object with symbol keys
          const tickHistory = tickData && tickData[symbol] ? tickData[symbol] : [];
          const latestTick = tickHistory.length > 0 ? tickHistory[tickHistory.length - 1] : null;
          
          console.log('🔍 tickData structure:', typeof tickData, Object.keys(tickData || {}));
          console.log('🔍 tickHistory for', symbol, ':', tickHistory);
          console.log('🔍 latestTick:', latestTick);
          
          // Use the latest tick as stockData
          const stockData = latestTick;
          
          console.log('🔍 final stockData for Excel:', stockData);
          
          const scanType = ExcelLogger.determineScanType(stockData);
          const price = stockData?.last_price || 0;
          
          // Log to Excel
          ExcelLogger.addEntry(symbol.replace('NSE:', ''), scanType, price);
          
          // Mark as logged to avoid duplicates
          loggedSymbolsRef.current.add(symbol);
          setLoggedSymbols(new Set(loggedSymbolsRef.current));
          
          console.log(`📊 Excel logged: ${symbol} (${scanType}) - Price: ₹${price}`);
        }
      });
      
      // Check if current symbol can be changed (2 minutes elapsed or no current symbol)
      const currentTime = Date.now();
      const canChangeSymbol = !selectedSymbol || 
        !symbolTimestampsRef.current[selectedSymbol] || 
        (currentTime - symbolTimestampsRef.current[selectedSymbol] >= 2 * 60 * 1000); // 2 minutes in milliseconds
      
      if (canChangeSymbol) {
        // Switch to the most recently subscribed new symbol
        const newSymbol = newSymbols[newSymbols.length - 1];
        console.log('🔍 🔄 Switching to new symbol:', newSymbol);
        setSelectedSymbol(newSymbol);
        
        // Auto-open chart in reusable tab for new symbol - Enhanced debugging
        console.log('🚀 Attempting auto-chart open for:', newSymbol);
        console.log('🔍 Symbol format check - Original:', newSymbol, 'Type:', typeof newSymbol);
        
        const chartUrl = getKiteChartUrl(newSymbol);
        console.log('🔍 Chart URL result:', chartUrl);
        
        if (chartUrl) {
          console.log('🚀 AUTO-OPENING CHART NOW for:', newSymbol, 'URL:', chartUrl);
          
          // Try to open chart with popup blocker detection
          try {
            const newTab = window.open(chartUrl, 'kite-chart-tab'); // Named tab - reuses same tab
            if (newTab) {
              console.log('✅ Chart opened in reusable tab for:', newSymbol.replace('NSE:', ''));
              // Focus the chart tab to bring it to front
              newTab.focus();
            } else {
              console.error('❌ Popup blocked! Enable popups for automatic chart opening');
              // Show alert as fallback
              alert(`📊 Chart blocked by popup blocker!\nClick OK to open chart for ${newSymbol.replace('NSE:', '')}\n\nURL: ${chartUrl}`);
            }
          } catch (error) {
            console.error('❌ Error opening chart:', error);
          }
        } else {
          console.log('⚠️ No chart URL available for:', newSymbol);
          console.log('🔍 Debug: Checking token mapping for symbol:', newSymbol.replace('NSE:', ''));
        }
        
        // Update timestamp for the new symbol
        const newTimestamps = {
          ...symbolTimestampsRef.current,
          [newSymbol]: currentTime
        };
        symbolTimestampsRef.current = newTimestamps;
        
        // Record which symbols existed when this symbol was selected
        symbolsAtSelectionRef.current[newSymbol] = new Set(allAvailableSymbols);
      } else {
        // Current symbol is still in its 2-minute display period
        const timeRemaining = 2 * 60 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        console.log('🔍 ⏰ Current symbol still has', Math.ceil(timeRemaining / 1000), 'seconds remaining. New symbols will queue.');
      }
    }
    
    // If no selectedSymbol yet, or if current selectedSymbol is no longer available
    if (!selectedSymbol || !allAvailableSymbols.includes(selectedSymbol)) {
      // Prefer symbols with actual data, but show any available symbol
      const symbolToSelect = subscribedStocks.length > 0 ? subscribedStocks[0] : 
                            allAvailableSymbols.length > 0 ? allAvailableSymbols[0] : null;
      
      if (symbolToSelect) {
        console.log('🔍 🔄 Switching to available stock:', symbolToSelect);
        setSelectedSymbol(symbolToSelect);
        
        // Set timestamp for this symbol
        const currentTime = Date.now();
        const newTimestamps = {
          ...symbolTimestampsRef.current,
          [symbolToSelect]: currentTime
        };
        symbolTimestampsRef.current = newTimestamps;
        
        // Record which symbols existed when this symbol was selected
        symbolsAtSelectionRef.current[symbolToSelect] = new Set(allAvailableSymbols);
      } else {
        console.log('🔍 ❌ No available stocks');
        setSelectedSymbol(null);
      }
    }
    
    // Update previous symbols set
    const newSymbolsSet = new Set(allAvailableSymbols);
    console.log('🔍 Updating previousSymbolsRef from:', Array.from(previousSymbolsRef.current), 'to:', Array.from(newSymbolsSet));
    previousSymbolsRef.current = newSymbolsSet;
    
    // Cleanup old timestamps and selection records (symbols that are no longer available)
    const cleanedTimestamps = { ...symbolTimestampsRef.current };
    Object.keys(cleanedTimestamps).forEach(symbol => {
      if (!allAvailableSymbols.includes(symbol)) {
        delete cleanedTimestamps[symbol];
        delete symbolsAtSelectionRef.current[symbol]; // Also cleanup selection records
      }
    });
    symbolTimestampsRef.current = cleanedTimestamps;
    
  }, [tickData, selectedSymbol, getAllAvailableSymbols, getSubscribedStocks]);
  
  // Effect to automatically check for symbol changes after 2-minute periods
  useEffect(() => {
    if (!selectedSymbol || !symbolTimestampsRef.current[selectedSymbol]) return;
    
    const timeElapsed = Date.now() - symbolTimestampsRef.current[selectedSymbol];
    const timeRemaining = 2 * 60 * 1000 - timeElapsed;
    
    if (timeRemaining > 0) {
      // Set a timer to check for new symbols after the 2-minute period
      const timer = setTimeout(() => {
        // Check if there are NEWLY SUBSCRIBED symbols (not existing ones)
        const allSymbols = getAllAvailableSymbols();
        const symbolsAtSelection = symbolsAtSelectionRef.current[selectedSymbol] || new Set();
        
        // Find symbols that exist now but didn't exist when current symbol was selected
        const newlySubscribedSymbols = allSymbols.filter(symbol => 
          !symbolsAtSelection.has(symbol) && // Wasn't available when current symbol was selected
          symbolTimestampsRef.current[symbol] && // Has a timestamp (was subscribed at some point)
          symbolTimestampsRef.current[symbol] > symbolTimestampsRef.current[selectedSymbol] // Was subscribed after current symbol
        );
        
       // console.log('🔍 Symbols at selection of', selectedSymbol, ':', Array.from(symbolsAtSelection));
       // console.log('🔍 Current available symbols:', allSymbols);
       // console.log('🔍 Newly subscribed symbols since selection:', newlySubscribedSymbols);
        
        if (newlySubscribedSymbols.length > 0) {
          const newestSymbol = newlySubscribedSymbols.reduce((newest, symbol) => 
            symbolTimestampsRef.current[symbol] > symbolTimestampsRef.current[newest] ? symbol : newest
          );
          
          console.log('🔍 ⏰ 2 minutes elapsed. Switching to newly subscribed symbol:', newestSymbol);
          setSelectedSymbol(newestSymbol);
        } else {
          console.log('🔍 ⏰ 2 minutes elapsed but no newly subscribed symbols found. Staying with current symbol:', selectedSymbol);
        }
      }, timeRemaining);
      
      return () => clearTimeout(timer);
    }
  }, [selectedSymbol, getAllAvailableSymbols]);
  
  // Effect to update current time every second for countdown display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Get stock data for the currently selected symbol
  const getAvailableStockData = () => {
    if (!tickData || !selectedSymbol) {
    //  console.log('🔍 No tickData or selectedSymbol provided');
      return { data: null, symbol: null, hasSymbol: false, isWaitingForData: false };
    }
    
    const history = tickData[selectedSymbol];
    const hasSymbol = tickData.hasOwnProperty(selectedSymbol);
    const isWaitingForData = hasSymbol && (!history || history.length === 0);
    
    if (history && history.length > 0) {
      // Get the latest tick (last item in the array)
      const latestTick = history[history.length - 1];
      console.log('🔍 Latest tick for', selectedSymbol, ':', latestTick);
      console.log('🔍 ✅ Using selected stock:', selectedSymbol, 'with data:', latestTick);
      return { data: latestTick, symbol: selectedSymbol, hasSymbol: true, isWaitingForData: false };
    }
    
    if (isWaitingForData) {
      console.log('🔍 ⏳ Symbol subscribed but waiting for data:', selectedSymbol);
      return { data: null, symbol: selectedSymbol, hasSymbol: true, isWaitingForData: true };
    }
    
    console.log('🔍 ❌ No data for selected stock:', selectedSymbol);
    return { data: null, symbol: null, hasSymbol: false, isWaitingForData: false };
  };

  const { data: stockData, symbol: currentSymbol, hasSymbol, isWaitingForData } = getAvailableStockData();

  // Calculate remaining display time for current symbol
  const getTimeRemaining = () => {
    if (!selectedSymbol || !symbolTimestampsRef.current[selectedSymbol]) return null;
    
    const timeElapsed = currentTime - symbolTimestampsRef.current[selectedSymbol];
    const timeRemaining = 2 * 60 * 1000 - timeElapsed; // 2 minutes in milliseconds
    
    return timeRemaining > 0 ? Math.ceil(timeRemaining / 1000) : 0; // Return seconds
  };

  const formatPrice = (price) => {
    return price ? `₹${parseFloat(price).toFixed(2)}` : 'N/A';
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

  // AI Analysis Functions
  const runAIAnalysis = useCallback(async () => {
    if (!stockData || !currentSymbol) return;
    
    setIsAnalyzing(true);
    try {
      console.log('🤖 Running AI analysis for:', currentSymbol);
      console.log('🔄 Current stock data:', { 
        symbol: currentSymbol, 
        price: stockData.last_price, 
        change: stockData.change_percent,
        volume: stockData.volume,
        hasDepth: !!stockData.depth 
      });
      
      // Recalculate analytics fresh for AI analysis to ensure sync
      const freshAnalytics = calculateOrderBookAnalytics();
      console.log('📊 Fresh analytics calculated:', {
        l10_imbalance: freshAnalytics.l10?.imbalance,
        l10_spread: freshAnalytics.l10?.spreadPercent,
        l20_imbalance: freshAnalytics.l20?.imbalance
      });
      
      const analysis = await AITradingAdvisor.analyze(stockData, freshAnalytics, currentSymbol);
      
      setAiAnalysis(analysis);
      
      console.log('🤖✅ AI Analysis Complete:', {
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        signals: analysis.signals?.length || 0,
        timestamp: analysis.timestamp
      });
    } catch (error) {
      console.error('AI Analysis Error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [stockData, currentSymbol]); // Removed analytics dependency to avoid stale closures

  // Auto-run AI analysis when data changes
  useEffect(() => {
    if (stockData && currentSymbol && stockData.depth) {
      // Immediate analysis for new symbols, delayed for updates
      const isNewSymbol = !aiAnalysis || aiAnalysis.timestamp === undefined;
      const delay = isNewSymbol ? 500 : 1000; // Faster for new symbols
      
      console.log(`🤖 Scheduling AI analysis in ${delay}ms for:`, currentSymbol, isNewSymbol ? '(NEW SYMBOL)' : '(UPDATE)');
      
      const timer = setTimeout(() => {
        runAIAnalysis();
      }, delay);
      
      return () => clearTimeout(timer);
    }
  }, [stockData, currentSymbol, runAIAnalysis]);

  return (
    <TrackerContainer>
      <TrackerHeader>
        🏛️ Live Stock Tracker - {currentSymbol ? currentSymbol.replace('NSE:', '') : 'No Stock'}
        <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '15px' }}>
          {(() => {
            const timeRemaining = getTimeRemaining();
            return timeRemaining !== null && timeRemaining > 0 ? (
              <span style={{ 
                color: timeRemaining > 60 ? '#ffd700' : timeRemaining > 30 ? '#ff9500' : '#ff6b6b',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                ⏰ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            ) : null;
          })()}
          {stockData ? (
            <span style={{ color: '#00ff00' }}>🟢 LIVE</span>
          ) : (
            <span style={{ color: '#ff6b6b' }}>🔴 NO DATA</span>
          )}
        </span>
      </TrackerHeader>

      {stockData || isWaitingForData ? (
        <TrackerBody>
          {/* Show waiting message when symbol is subscribed but no data yet */}
          {isWaitingForData && !stockData ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '40px 20px',
              background: 'rgba(255, 215, 0, 0.1)',
              border: '1px solid rgba(255, 215, 0, 0.3)', 
              borderRadius: '12px',
              margin: '20px',
              color: '#ffd700'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                Loading live data for {currentSymbol}...
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Symbol subscribed successfully - waiting for first tick data from exchange
              </div>
            </div>
          ) : null}
          
          {/* Excel Logger Control Panel */}
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

          {/* AI Trading Advisor - HIDDEN */}
          {false && stockData && (
            <AIAdvisorContainer>
              <AIAdvisorHeader>
                <AIAdvisorTitle>
                  🤖 AI Trading Advisor
                  {aiAnalysis && (
                    <SentimentBadge sentiment={aiAnalysis.sentiment}>
                      {aiAnalysis.sentiment}
                    </SentimentBadge>
                  )}
                  {/* Sync Status Indicator */}
                  {aiAnalysis && stockData && (
                    <div style={{ 
                      fontSize: '10px', 
                      color: '#00ff00', 
                      marginLeft: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      🔄 SYNCED
                    </div>
                  )}
                </AIAdvisorTitle>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {aiAnalysis && (
                    <>
                      <div style={{ fontSize: '10px', color: '#ccc', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <div>Confidence: {aiAnalysis.confidence}%</div>
                        {aiAnalysis.technicalScore !== undefined && (
                          <div>Score: {aiAnalysis.technicalScore > 0 ? '+' : ''}{aiAnalysis.technicalScore}</div>
                        )}
                      </div>
                      <ConfidenceBar confidence={aiAnalysis.confidence} />
                    </>
                  )}
                  <RefreshButton 
                    onClick={runAIAnalysis} 
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? '🔄 Analyzing...' : '🔄 Refresh'}
                  </RefreshButton>
                </div>
              </AIAdvisorHeader>

              {aiAnalysis ? (
                <AIInsightsGrid>
                  <InsightsList>
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: '#ffd700', 
                      marginBottom: '10px' 
                    }}>
                      📊 Market Insights:
                    </div>
                    {aiAnalysis.insights.length > 0 ? (
                      aiAnalysis.insights.map((insight, index) => (
                        <InsightItem key={index}>
                          {insight}
                        </InsightItem>
                      ))
                    ) : (
                      <InsightItem>
                        📈 Monitoring market conditions...
                      </InsightItem>
                    )}
                    
                    {/* Trading Signals */}
                    {aiAnalysis.signals && aiAnalysis.signals.length > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#da70d6', 
                          marginBottom: '5px' 
                        }}>
                          🎯 Active Signals: {aiAnalysis.signals.join(', ')}
                        </div>
                      </div>
                    )}

                    {/* Technical Score Breakdown */}
                    {aiAnalysis.components && (
                      <div style={{ 
                        marginTop: '10px', 
                        padding: '8px', 
                        background: 'rgba(255, 255, 255, 0.03)', 
                        borderRadius: '6px' 
                      }}>
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#ffd700', 
                          marginBottom: '5px' 
                        }}>
                          📊 Score Components:
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 1fr', 
                          gap: '4px', 
                          fontSize: '10px' 
                        }}>
                          <div style={{ color: '#79c0ff' }}>
                            Momentum: {aiAnalysis.components.momentum > 0 ? '+' : ''}{aiAnalysis.components.momentum}
                          </div>
                          <div style={{ color: '#79c0ff' }}>
                            Volume: {aiAnalysis.components.volume > 0 ? '+' : ''}{aiAnalysis.components.volume}
                          </div>
                          <div style={{ color: '#79c0ff' }}>
                            OrderBook: {aiAnalysis.components.orderBook > 0 ? '+' : ''}{aiAnalysis.components.orderBook}
                          </div>
                          <div style={{ color: '#79c0ff' }}>
                            Timing: {aiAnalysis.components.timing > 0 ? '+' : ''}{aiAnalysis.components.timing}
                          </div>
                        </div>
                      </div>
                    )}
                  </InsightsList>

                  <AdvicePanel>
                    <div style={{ 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      marginBottom: '8px' 
                    }}>
                      💡 Trading Advice:
                    </div>
                    {aiAnalysis.advice || 'Analyzing market conditions...'}
                  </AdvicePanel>
                </AIInsightsGrid>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '20px', 
                  color: '#999' 
                }}>
                  {isAnalyzing ? (
                    <>
                      � Enhanced AI analyzing market data...
                      <div style={{ 
                        marginTop: '10px', 
                        fontSize: '12px' 
                      }}>
                        🔍 Examining: Price patterns • Volume flow • Order book depth • Market timing
                      </div>
                      <div style={{ 
                        marginTop: '5px', 
                        fontSize: '10px',
                        color: '#79c0ff'
                      }}>
                        Advanced local analysis • No API required
                      </div>
                    </>
                  ) : (
                    <>
                      🧠 Enhanced AI Trading Advisor Ready
                      <div style={{ 
                        marginTop: '10px', 
                        fontSize: '12px' 
                      }}>
                        Professional-grade analysis without external APIs
                      </div>
                      <div style={{ 
                        marginTop: '5px', 
                        fontSize: '10px',
                        color: '#da70d6'
                      }}>
                        Click refresh for detailed market insights
                      </div>
                    </>
                  )}
                </div>
              )}

              {aiAnalysis && (
                <AnalysisTimestamp>
                  Last updated: {aiAnalysis.timestamp}
                </AnalysisTimestamp>
              )}
            </AIAdvisorContainer>
          )}
          
          {/* Excel Logger Control Panel */}
          <div style={{
            gridColumn: '1 / -1',
            marginTop: '15px',
            padding: '15px',
            background: 'rgba(0, 255, 127, 0.1)',
            border: '1px solid rgba(0, 255, 127, 0.3)',
            borderRadius: '8px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#00ff7f',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                📊 Excel Logger
                <span style={{
                  fontSize: '10px',
                  color: '#ffd700',
                  background: 'rgba(255, 215, 0, 0.2)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  {loggedSymbols.size} logged
                </span>
              </div>
              
              <button
                onClick={() => ExcelLogger.downloadExcel()}
                style={{
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#fff',
                  background: 'linear-gradient(135deg, #00ff7f, #00cc65)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 255, 127, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #00cc65, #00aa50)';
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = 'linear-gradient(135deg, #00ff7f, #00cc65)';
                  e.target.style.transform = 'translateY(0)';
                }}
              >
                📥 Download Excel
              </button>
            </div>
            
            <div style={{
              fontSize: '11px',
              color: '#cccccc',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '15px'
            }}>
              <div>
                <div style={{ color: '#00ff7f', marginBottom: '5px' }}>✨ Features:</div>
                <div>• Auto-logs new symbols with scan type</div>
                <div>• Tracks BUY_SCAN vs SELL_SCAN</div>
                <div>• Timestamp & price recording</div>
                <div>• Auto-download every 5 entries</div>
              </div>
              <div>
                <div style={{ color: '#ffd700', marginBottom: '5px' }}>📋 Recent Logs:</div>
                {Array.from(loggedSymbols).slice(-3).map((symbol, i) => (
                  <div key={i} style={{ fontSize: '10px', color: '#888' }}>
                    {symbol} ✓
                  </div>
                ))}
                {loggedSymbols.size === 0 && (
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    No symbols logged yet
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Zerodha Kite Chart - HIDDEN */}
          {false && (() => {
            console.log('🔍=== CHART DEBUG START ===');
            console.log('🔍 Chart Debug - stockData exists:', !!stockData);
            console.log('🔍 Chart Debug - currentSymbol:', currentSymbol);
            console.log('🔍 Chart Debug - isWaitingForData:', isWaitingForData);
            
            // Show chart if we have stockData OR if we're waiting for data but have a symbol
            const shouldShowChart = Boolean((stockData || isWaitingForData) && currentSymbol);
            console.log('🔍 Chart Debug - shouldShowChart:', shouldShowChart);
            
            if (shouldShowChart) {
              const chartUrl = getKiteChartUrl(currentSymbol);
              console.log('🔍 Chart Debug - chartUrl:', chartUrl);
              console.log('🔍=== CHART DEBUG END ===');
              
              return (
                <div style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600', 
                    color: '#79c0ff',
                    textAlign: 'center',
                    marginBottom: '15px',
                    padding: '10px',
                    background: 'rgba(121, 192, 255, 0.1)',
                    border: '1px solid rgba(121, 192, 255, 0.3)',
                    borderRadius: '8px'
                  }}>
                    📈 Live Chart - {currentSymbol.replace('NSE:', '')}
                    {!stockData && isWaitingForData && (
                      <div style={{ fontSize: '12px', color: '#ffd700', marginTop: '5px' }}>
                        ⏳ Loading chart data...
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
                      Debug: stockData={!!stockData}, waiting={isWaitingForData}, url={!!chartUrl}
                    </div>
                  </div>
                  
                  {chartUrl ? (
                    <div>
                      {/* Open Chart Button - Reusable Tab */}
                      <div style={{
                        textAlign: 'center',
                        marginBottom: '15px',
                        padding: '15px',
                        background: 'rgba(0, 255, 0, 0.1)',
                        border: '2px solid rgba(0, 255, 0, 0.3)',
                        borderRadius: '12px'
                      }}>
                        <button
                          onClick={() => {
                            window.open(chartUrl, 'kite-chart-tab'); // Reuses same named tab
                            console.log('🔍 ✅ Opening chart in reusable tab:', chartUrl);
                          }}
                          style={{
                            padding: '12px 24px',
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#fff',
                            background: 'linear-gradient(135deg, #00ff00, #00cc00)',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0, 255, 0, 0.3)',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseOver={(e) => {
                            e.target.style.background = 'linear-gradient(135deg, #00cc00, #00aa00)';
                            e.target.style.transform = 'translateY(-2px)';
                          }}
                          onMouseOut={(e) => {
                            e.target.style.background = 'linear-gradient(135deg, #00ff00, #00cc00)';
                            e.target.style.transform = 'translateY(0)';
                          }}
                        >
                          🚀 Open {currentSymbol.replace('NSE:', '')} Chart (Smart Reuse)
                        </button>
                        
                        {/* Debug Test Button */}
                        <button
                          onClick={() => {
                            console.log('🧪 Testing auto-chart functionality for:', currentSymbol);
                            const chartUrl = getKiteChartUrl(currentSymbol);
                            if (chartUrl) {
                              const newTab = window.open(chartUrl, 'kite-chart-tab'); // Test reusable tab
                              console.log('🧪 Test result - Tab opened:', !!newTab);
                              if (newTab) {
                                console.log('📋 Chart will update in the "Kite Chart" tab');
                              }
                            } else {
                              console.log('🧪 Test result - No chart URL generated');
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            fontSize: '10px',
                            fontWeight: '600',
                            color: '#fff',
                            background: 'linear-gradient(135deg, #ff9500, #ff6b00)',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginTop: '5px'
                          }}
                        >
                          🧪 Test Auto-Open
                        </button>
                        
                        <div style={{ fontSize: '11px', color: '#00ff00', marginTop: '8px', opacity: 0.8 }}>
                          🎯 Smart tab reuse: Same chart tab updates with each new symbol
                        </div>
                      </div>

                      {/* Embedded Iframe - Fallback Option */}
                      <div style={{
                        position: 'relative',
                        marginTop: '10px'
                      }}>
                        <div style={{
                          fontSize: '12px',
                          color: '#ffd700',
                          textAlign: 'center',
                          marginBottom: '10px',
                          padding: '8px',
                          background: 'rgba(255, 215, 0, 0.1)',
                          border: '1px solid rgba(255, 215, 0, 0.3)',
                          borderRadius: '6px'
                        }}>
                          📋 Chart updates in same tab (auto-opened above)
                        </div>
                        <ChartIframe 
                          src={chartUrl}
                          title={`Kite Chart for ${currentSymbol}`}
                          frameBorder="0"
                          allowFullScreen
                          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                          onLoad={(e) => {
                            console.log('🔍 ✅ Iframe loaded successfully');
                            e.target.style.border = '2px solid #00ff00';
                          }}
                          onError={(e) => {
                            console.log('🔍 ❌ Iframe failed to load - likely blocked by X-Frame-Options');
                            e.target.style.border = '2px solid #ff6b6b';
                            e.target.style.background = 'rgba(255, 107, 107, 0.1)';
                          }}
                        />
                        
                        {/* Iframe Overlay for Click-to-Open */}
                        <div 
                          onClick={() => {
                            window.open(chartUrl, 'kite-chart-tab'); // Reuses same named tab
                          }}
                          style={{
                            position: 'absolute',
                            top: '40px',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.02)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0,
                            transition: 'opacity 0.3s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.opacity = '0.1'}
                          onMouseLeave={(e) => e.target.style.opacity = '0'}
                        >
                          <div style={{
                            padding: '8px 16px',
                            background: 'rgba(0, 255, 0, 0.8)',
                            color: '#fff',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            Click to refresh chart in same tab
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '10px', color: '#666', marginTop: '8px', textAlign: 'center' }}>
                        Chart URL: {chartUrl}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        background: 'rgba(255, 165, 0, 0.1)',
                        border: '1px solid rgba(255, 165, 0, 0.3)',
                        borderRadius: '8px',
                        color: '#ffb84d',
                        marginBottom: '10px'
                      }}>
                        📊 Chart not available for {currentSymbol.replace('NSE:', '')}
                        <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
                          Token mapping needed for this symbol
                        </div>
                      </div>
                      
                      {/* Test iframe with RELIANCE */}
                      <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        background: 'rgba(0, 255, 0, 0.1)',
                        border: '1px solid rgba(0, 255, 0, 0.3)',
                        borderRadius: '8px',
                        marginTop: '10px'
                      }}>
                        <div style={{ color: '#00ff00', marginBottom: '10px' }}>🧪 Test Chart (RELIANCE)</div>
                        <ChartIframe 
                          src="https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/RELIANCE/738561"
                          title="Test Kite Chart"
                          frameBorder="0"
                          allowFullScreen
                          onLoad={() => console.log('🔍 Test iframe loaded successfully')}
                          onError={() => console.log('🔍 Test iframe failed to load')}
                        />
                        <div style={{ fontSize: '10px', color: '#666', marginTop: '5px' }}>
                          Test URL: https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/RELIANCE/738561
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            
            // Always show test chart section for debugging
            return (
              <div style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600', 
                  color: '#ff6b6b',
                  textAlign: 'center',
                  marginBottom: '15px',
                  padding: '10px',
                  background: 'rgba(255, 107, 107, 0.1)',
                  border: '1px solid rgba(255, 107, 107, 0.3)',
                  borderRadius: '8px'
                }}>
                  🎯 Debug Chart Section
                  <div style={{ fontSize: '12px', marginTop: '5px' }}>
                    Conditions: stockData={!!stockData}, currentSymbol={currentSymbol}, waiting={isWaitingForData}
                  </div>
                </div>
                
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: 'rgba(0, 255, 255, 0.1)',
                  border: '1px solid rgba(0, 255, 255, 0.3)',
                  borderRadius: '8px'
                }}>
                  <div style={{ color: '#00ffff', marginBottom: '10px' }}>🔧 Always Visible Test Chart</div>
                  <ChartIframe 
                    src="https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/RELIANCE/738561"
                    title="Always Visible Test Chart"
                    frameBorder="0"
                    allowFullScreen
                    onLoad={() => console.log('🔍 Always-visible test iframe loaded')}
                    onError={() => console.log('🔍 Always-visible test iframe failed')}
                  />
                </div>
              </div>
            );
          })()}        </TrackerBody>
      ) : (
        <NoDataMessage>
          {hasSymbol ? (
            <>
              ⏳ Waiting for live data for {currentSymbol}... <br />
              <small style={{ color: '#ffd700' }}>Symbol subscribed - first tick data loading...</small>
            </>
          ) : (
            <>
              📡 Waiting for subscribed stock data... <br />
              <small>Start scanner to begin receiving tick updates</small>
            </>
          )}
          {(() => {
            const allSymbols = getAllAvailableSymbols();
            const queuedSymbols = allSymbols.filter(symbol => symbol !== selectedSymbol);
            
            if (queuedSymbols.length > 0) {
              return (
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#ffd700' }}>
                  🔄 Available symbols: {queuedSymbols.join(', ')}
                </div>
              );
            }
            return null;
          })()}
        </NoDataMessage>
      )}
    </TrackerContainer>
  );
};

export default SubscribedStockTracker;
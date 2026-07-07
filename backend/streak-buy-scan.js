const BUY_1MIN_SCAN_PAYLOAD = {
    condition: 'RSI(14,0) higher than 65 and Plus DI(14,0) higher than 25 and ADX(14,0) higher than Minus DI(14,0) and EMA(close, 25, 0) higher than MBB(Close,20,2,simple,0) and MACD(12,26,9,macd,0) higher than MACD(12,26,9,signal,0) and ADX(14,0) higher than Minus DI(14,0)',
    scan_on: 'nifty_500',
    time_frame: 'min',
    chart_type: 'candlestick',
    slug: '1min-bullish'
};

const BUY_5MIN_SCAN_PAYLOAD = {
    condition: 'multitime frame completed(5min,period min(14,RSI(14,-1)) higher than equal to 60)',
    scan_on: 'nifty_500',
    time_frame: '5min',
    chart_type: 'candlestick',
    slug: '5min-bullish'
};

module.exports = {
    BUY_1MIN_SCAN_PAYLOAD,
    BUY_5MIN_SCAN_PAYLOAD
};

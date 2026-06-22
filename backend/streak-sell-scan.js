const SELL_1MIN_SCAN_PAYLOAD = {
    condition: 'RSI(14,0) lower than 35 and Minus DI(14,0) higher than 25 and ADX(14,0) higher than Plus DI(14,0) and ADX(14,0) higher than 25 and EMA(close, 25, 0) lower than MBB(Close,20,2,simple,0) and MACD(12,26,9,macd,0) lower than MACD(12,26,9,signal,0) and ( EMA(close, 3, 0) lower than equal to LBB(Close,20,2,simple,0) )',
    scan_on: 'nifty_500',
    time_frame: 'min',
    chart_type: 'candlestick',
    slug: 'bearish-scan-1min'
};

const SELL_5MIN_SCAN_PAYLOAD = {
    condition: 'RSI(14,0) lower than 35 and Minus DI(14,0) higher than 25 and ADX(14,0) higher than Plus DI(14,0) and ADX(14,0) higher than 25 and EMA(close, 25, 0) lower than MBB(Close,20,2,simple,0) and MACD(12,26,9,macd,0) lower than MACD(12,26,9,signal,0) and ( EMA(close, 3, 0) lower than equal to LBB(Close,20,2,simple,0) )',
    scan_on: 'nifty_500',
    time_frame: '5min',
    chart_type: 'candlestick',
    slug: 'bearish-scan-5min'
};

const DEFAULT_SELL_SCAN_PAYLOAD = SELL_1MIN_SCAN_PAYLOAD;

module.exports = {
    SELL_1MIN_SCAN_PAYLOAD,
    SELL_5MIN_SCAN_PAYLOAD,
    DEFAULT_SELL_SCAN_PAYLOAD
};

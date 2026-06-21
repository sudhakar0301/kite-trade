class DepthTrackEngine {
    constructor(windowSize = 30) {
        this.windowSize = windowSize;
        this.state = {};
    }

    init(token, symbol) {
        if (!this.state[token]) {
            this.state[token] = {
                symbol,
                history: [],
                last: null
            };
        }
    }

    // ---------------- MAIN UPDATE ----------------
    update(token, tick, symbol = token) {
        this.init(token, symbol);

        const depth = tick?.depth || { buy: [], sell: [] };
        const buy = depth.buy || [];
        const sell = depth.sell || [];

        const B1 = buy[0]?.quantity || 0;
        const B2 = buy[1]?.quantity || 0;
        const B3 = buy[2]?.quantity || 0;

        const A1 = sell[0]?.quantity || 0;
        const A2 = sell[1]?.quantity || 0;
        const A3 = sell[2]?.quantity || 0;

        const bidSum = B1 + B2 + B3;
        const askSum = A1 + A2 + A3;

        const imbalance = (bidSum - askSum) / (bidSum + askSum + 1);

        const snapshot = {
            time: Date.now(),
            ltp: tick?.last_price || 0,

            B1, B2, B3,
            A1, A2, A3,

            bidSum,
            askSum,
            imbalance
        };

        const s = this.state[token];

        s.history.push(snapshot);
        if (s.history.length > this.windowSize) {
            s.history.shift();
        }

        s.last = snapshot;

        return this.analyze(token);
    }

    // ---------------- ANALYSIS ENGINE ----------------
    analyze(token) {
        const entry = this.state[token];
        const h = entry.history;

        if (h.length < 5) return null;

        const last = h[h.length - 1];

        const result = {
            symbol: entry.symbol,
            supportBreak: false,
            slippageRisk: 0,
            absorption: 0,
            imbalance: 0
        };

        // ---------------- SMOOTHED IMBALANCE ----------------
        const last5 = h.slice(-5);
        const avgImbalance =
            last5.reduce((sum, x) => sum + x.imbalance, 0) / last5.length;

        result.imbalance = avgImbalance;

        // ---------------- ABSORPTION ----------------
        const prev = h[h.length - 2];

        const bidDrop = prev.bidSum - last.bidSum;
        const askDrop = prev.askSum - last.askSum;

        result.absorption = bidDrop - askDrop;

        // ---------------- SUPPORT BREAK (ROBUST) ----------------
        const bidTrend = h.slice(-5).map(x => x.bidSum);
        const priceTrend = h.slice(-3).map(x => x.ltp);

        const bidFalling =
            bidTrend[0] > bidTrend[1] &&
            bidTrend[1] > bidTrend[2] &&
            bidTrend[2] > bidTrend[3];

        const priceFalling =
            priceTrend.length >= 3 &&
            priceTrend[0] >= priceTrend[1] &&
            priceTrend[1] >= priceTrend[2];

        const breakdown =
            bidFalling &&
            priceFalling &&
            last.ltp < prev.ltp;

        if (breakdown) {
            result.supportBreak = true;
        }

        // ---------------- LIQUIDITY EVAPORATION ----------------
        const last2 = h.slice(-2);

        const liquidityEvap =
            (last2[0].bidSum - last2[1].bidSum) +
            (last2[0].askSum - last2[1].askSum);

        // ---------------- SLOPPAGE RISK MODEL ----------------
        const gap = Math.abs(last.B1 - last.A1);
        const imbalanceRisk = Math.abs(avgImbalance) * 100;

        const liquidityThin =
            last.bidSum < last.askSum;

        let slippage =
            imbalanceRisk * 0.5 +
            (gap > 50 ? 20 : gap / 3) +
            (liquidityThin ? 15 : 0) +
            (liquidityEvap > 0 ? 15 : 0);

        result.slippageRisk = slippage;

        return result;
    }

    // ---------------- PRE-TRADE GATE ----------------
    evaluateOrderbookPreTradeGate({ token, symbol, tick, scanType }) {
        const signal = this.update(token, tick, symbol);

        if (!signal) {
            return {
                allowed: false,
                reason: "WARMING_UP",
                metrics: null
            };
        }

        // ---------------- BLOCK HIGH SLIPPAGE ----------------
        if (signal.slippageRisk >= 70) {
            return {
                allowed: false,
                reason: "HIGH_SLIPPAGE_RISK",
                metrics: signal
            };
        }

        // ---------------- PERSISTENT PRESSURE CHECK ----------------
        const h = this.state[token].history.slice(-5);

        const persistentSellPressure =
            h.filter(x => x.imbalance < -0.15).length >= 3;

        const persistentBuyPressure =
            h.filter(x => x.imbalance > 0.15).length >= 3;

        // ---------------- SCAN RULES ----------------
        if (scanType === "BUY_SCAN") {
            if (signal.supportBreak) {
                return {
                    allowed: false,
                    reason: "SUPPORT_BREAK",
                    metrics: signal
                };
            }

            if (persistentSellPressure) {
                return {
                    allowed: false,
                    reason: "SELL_PRESSURE_HIGH",
                    metrics: signal
                };
            }
        }

        if (scanType === "SELL_SCAN") {
            if (persistentBuyPressure) {
                return {
                    allowed: false,
                    reason: "BUY_PRESSURE_HIGH",
                    metrics: signal
                };
            }
        }

        return {
            allowed: true,
            reason: "PASS",
            metrics: signal
        };
    }

    // ---------------- DEBUG ----------------
    getState(token) {
        return this.state[token];
    }
}

module.exports = DepthTrackEngine;
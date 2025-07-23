const { getKiteConnect } = require('../kite/connection');

async function getHistoricalData(token, interval, from, to) {
  const kc = getKiteConnect();
  return await kc.getHistoricalData(token, interval, from, to, false, false);
}

module.exports = { getHistoricalData };

const { initKiteConnect } = require('./kite/connection');
const { runScanAndSubscribe } = require('./strategy/scanner');
const { initTickListener } = require('./live/tickListener');
const { buildCache } = require('./cache/cacheManager');

(async () => {
  const kc = await initKiteConnect();
  global.kite = kc;

  //await buildCache();             // seed cache from historical data
  await runScanAndSubscribe();   // scan and subscribe live instruments
  initTickListener();            // start live tick monitoring

  setInterval(runScanAndSubscribe, 5 * 60 * 1000); // scan every 5 mins
})();
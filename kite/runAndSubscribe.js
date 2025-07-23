async function runScanAndSubscribe() {
  selected.length = 0;
  const filtered = instruments.instruments.filter(i => i.exchange === 'NSE' && i.instrument_type === 'EQ');
   
  broadcastLog(`🔍 Scanning ${filtered.length} instruments...`);
  await batchedScan(filtered, 5, 1000);

  if (selected.length) {
    subscribeToTokens(selected);
    broadcastLog(`📡 Subscribed to ${selected.length} tokens for live 1m monitoring`);
  } else {
    broadcastLog(`⚠️ No instruments matched the criteria`);
  }

  // Save selected instruments to file
  const outputPath = path.join(__dirname, '../data/filtered_instruments.json');
  fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2));
  broadcastLog(`📄 Saved ${selected.length} instruments to filtered_instruments.json`);
}

module.exports = { runScanAndSubscribe, selected };
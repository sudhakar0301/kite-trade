const fs = require('fs');
const path = require('path');
const os = require('os');
const csv = require('csv-parser');
const instruments = require('../data/nse500.json');

const downloadsPath = path.join(os.homedir(), 'Downloads');
const filteredOutputPath = path.join(__dirname, '../data/filtered_instruments.json');

function parseCsvAndFilter(filepath) {
  const matched = [];

  fs.createReadStream(filepath)
    .pipe(csv())
    .on('data', (row) => {
      const symbol = row.Symbol?.trim();
      if (!symbol) return;

      const match = instruments.instruments.find(
        (i) => i.tradingsymbol === symbol && i.exchange === 'NSE'
      );

      if (match) {
        matched.push(match);
      }
    })
    .on('end', () => {
      console.log(`✅ Matched ${matched.length} instruments from CSV.`);
      fs.writeFileSync(filteredOutputPath, JSON.stringify(matched.map(m => m.instrument_token), null, 2));
      console.log(`📄 Updated filtered_instruments.json`);
    });
}

function watchTradeInstrumentsCsv() {
  console.log(`👀 Watching Downloads folder for 'trade instruments*.csv' files...`);

  fs.watch(downloadsPath, (eventType, filename) => {
    if (
      eventType === 'rename' &&
      filename &&
      /^trade instruments.*\.csv$/i.test(filename)
    ) {
      const fullPath = path.join(downloadsPath, filename);

      // Ensure file is fully written
      setTimeout(() => {
        if (fs.existsSync(fullPath)) {
          console.log(`📥 New file detected: ${filename}`);
          parseCsvAndFilter(fullPath);
        }
      }, 1500);
    }
  });
}

module.exports = {
  watchTradeInstrumentsCsv,
};

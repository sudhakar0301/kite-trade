// Test the hour calculations with Indian market trading hours
const { getCurrentTradingHour, calculateHourOpenLow } = require('./hourCalculations.js');

// Test getCurrentTradingHour function
console.log('Testing getCurrentTradingHour:');

// Test various times during the day
const testTimes = [
  new Date('2025-07-10T09:14:00'), // Before market opens
  new Date('2025-07-10T09:15:00'), // Market opens (first hour)
  new Date('2025-07-10T10:14:59'), // End of first hour
  new Date('2025-07-10T10:15:00'), // Start of second hour
  new Date('2025-07-10T11:30:00'), // Middle of third hour
  new Date('2025-07-10T14:14:59'), // End of last hour
  new Date('2025-07-10T14:15:00'), // Market closes
  new Date('2025-07-10T15:00:00'), // After market closes
];

testTimes.forEach(time => {
  const result = getCurrentTradingHour(time);
  console.log(`${time.toTimeString().slice(0,8)} -> ${result ? result.hourString : 'Not in trading hours'}`);
});

// Test calculateHourOpenLow with sample candles
console.log('\nTesting calculateHourOpenLow:');

// Create sample 1-minute candles for 9:15-9:20
const sampleCandles = [
  { date: new Date('2025-07-10T09:15:00'), open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { date: new Date('2025-07-10T09:16:00'), open: 101, high: 103, low: 100, close: 102, volume: 1100 },
  { date: new Date('2025-07-10T09:17:00'), open: 102, high: 104, low: 98, close: 99, volume: 1200 }, // Lowest point
  { date: new Date('2025-07-10T09:18:00'), open: 99, high: 101, low: 98.5, close: 100, volume: 1300 },
  { date: new Date('2025-07-10T09:19:00'), open: 100, high: 105, low: 100, close: 103, volume: 1400 },
];

const testTime = new Date('2025-07-10T09:19:30'); // 9:19:30 AM
const result = calculateHourOpenLow(sampleCandles, testTime);

console.log('Sample candles result:');
console.log(`Hour Open: ${result.hourOpen} (should be 100 - first candle's open)`);
console.log(`Hour Low: ${result.hourLow} (should be 98 - lowest low among all candles)`);
console.log(`Candles in hour: ${result.candlesInHour} (should be 5)`);
console.log(`Hour range: ${result.hourStartTime?.toTimeString().slice(0,8)} to ${result.hourEndTime?.toTimeString().slice(0,8)}`);

/**
 * Test script to validate MIS/CNC product type switching logic
 */

// Mock the functions from orderManager
const MIS_CUTOFF_TIME = { hours: 15, minutes: 15 }; // 3:15 PM

function isMISTimeOver() {
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  
  // Convert current time and cutoff time to minutes for easy comparison
  const currentTimeInMinutes = currentHours * 60 + currentMinutes;
  const cutoffTimeInMinutes = MIS_CUTOFF_TIME.hours * 60 + MIS_CUTOFF_TIME.minutes;
  
  const isOver = currentTimeInMinutes >= cutoffTimeInMinutes;
  
  if (isOver) {
    console.log(`🕐 MIS trading window is over (current: ${currentHours}:${currentMinutes.toString().padStart(2, '0')}, cutoff: ${MIS_CUTOFF_TIME.hours}:${MIS_CUTOFF_TIME.minutes.toString().padStart(2, '0')})`);
  }
  
  return isOver;
}

function getProductType() {
  return isMISTimeOver() ? 'CNC' : 'MIS';
}

// Test different times
function testTimeScenarios() {
  const currentTime = new Date();
  console.log(`\n=== Testing Product Type Logic ===`);
  console.log(`Current time: ${currentTime.toLocaleTimeString()}`);
  console.log(`MIS cutoff: ${MIS_CUTOFF_TIME.hours}:${MIS_CUTOFF_TIME.minutes.toString().padStart(2, '0')}`);
  console.log(`Current product type: ${getProductType()}`);
  
  // Test specific times
  const testTimes = [
    { hours: 9, minutes: 30 }, // Market open
    { hours: 12, minutes: 0 },  // Midday
    { hours: 15, minutes: 0 },  // Just before cutoff
    { hours: 15, minutes: 15 }, // Exactly at cutoff
    { hours: 15, minutes: 30 }, // After cutoff
    { hours: 16, minutes: 0 }   // Well after cutoff
  ];
  
  console.log(`\n--- Test Scenarios ---`);
  testTimes.forEach(time => {
    const timeInMinutes = time.hours * 60 + time.minutes;
    const cutoffInMinutes = MIS_CUTOFF_TIME.hours * 60 + MIS_CUTOFF_TIME.minutes;
    const isOver = timeInMinutes >= cutoffInMinutes;
    const productType = isOver ? 'CNC' : 'MIS';
    
    console.log(`${time.hours}:${time.minutes.toString().padStart(2, '0')} → ${productType} ${isOver ? '(MIS window closed)' : '(MIS window open)'}`);
  });
}

// Run the test
testTimeScenarios();

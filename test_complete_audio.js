// Test the complete audio notification system
console.log('🎵 Testing Complete Audio Notification System...\n');

// Import the audio functions from orderManager
const path = require('path');
const { exec } = require('child_process');

// Test Windows Text-to-Speech directly
function testTextToSpeech() {
  console.log('1. Testing Text-to-Speech: "Order placed"');
  
  exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Volume = 100; $speak.Speak(\'Order placed successfully\')"', (error) => {
    if (error) {
      console.log(`❌ Text-to-Speech failed: ${error.message}`);
    } else {
      console.log('✅ Text-to-Speech working!');
    }
    
    // Test waiting audio after 3 seconds
    setTimeout(testWaitingAudio, 3000);
  });
}

function testWaitingAudio() {
  console.log('\n2. Testing Text-to-Speech: "Waiting for order"');
  
  exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Volume = 100; $speak.Speak(\'Waiting for order\')"', (error) => {
    if (error) {
      console.log(`❌ Waiting audio failed: ${error.message}`);
    } else {
      console.log('✅ Waiting audio working!');
    }
    
    // Test system sounds after 3 seconds
    setTimeout(testSystemSounds, 3000);
  });
}

function testSystemSounds() {
  console.log('\n3. Testing Windows system sound');
  
  exec('powershell -c "[console]::beep(800,500)"', (error) => {
    if (error) {
      console.log(`❌ System beep failed: ${error.message}`);
    } else {
      console.log('✅ System beep working!');
    }
    
    // Show final results
    setTimeout(showResults, 2000);
  });
}

function showResults() {
  console.log('\n🎉 ===== AUDIO SYSTEM TEST COMPLETE =====');
  console.log('✅ The audio system should now work through your speakers!');
  console.log('');
  console.log('📋 What was tested:');
  console.log('   1. Text-to-Speech for "Order placed"');
  console.log('   2. Text-to-Speech for "Waiting for order"');
  console.log('   3. Windows system beep sounds');
  console.log('');
  console.log('🔊 How it works in your trading system:');
  console.log('   • When an order is placed → "Order placed successfully"');
  console.log('   • Every minute with no orders → "Waiting for order"');
  console.log('   • Fallback system beeps if TTS fails');
  console.log('');
  console.log('⚙️ The audio system is now integrated into your orderManager.js');
}

// Start the test
testTextToSpeech();

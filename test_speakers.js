// Audio test for Windows speakers
const { exec } = require('child_process');

console.log('🎵 Testing Audio System for Windows Speakers...\n');

console.log('1. Testing Text-to-Speech "Order Placed":');
exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak(\'Order placed\')"', (error) => {
  if (error) {
    console.log('   ❌ TTS failed, trying system sound...');
    
    console.log('2. Testing Windows System Sound:');
    exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Ding.wav\').PlaySync();"', (soundError) => {
      if (soundError) {
        console.log('   ❌ System sound failed, trying PowerShell beep...');
        
        console.log('3. Testing PowerShell Beep:');
        exec('powershell -c "[console]::beep(800,500)"', (beepError) => {
          if (beepError) {
            console.log('   ❌ All audio methods failed!');
          } else {
            console.log('   ✅ PowerShell beep worked!');
          }
        });
      } else {
        console.log('   ✅ Windows system sound worked!');
      }
    });
  } else {
    console.log('   ✅ Text-to-Speech worked!');
  }
});

setTimeout(() => {
  console.log('\n4. Testing "Waiting for Order" TTS:');
  exec('powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak(\'Waiting for order\')"', (error) => {
    if (error) {
      console.log('   ❌ Waiting TTS failed, trying alternative...');
      
      exec('powershell -c "[console]::beep(400,300); Start-Sleep -m 200; [console]::beep(500,300)"', (beepError) => {
        if (beepError) {
          console.log('   ❌ Alternative audio failed');
        } else {
          console.log('   ✅ Alternative beep pattern worked!');
        }
      });
    } else {
      console.log('   ✅ Waiting TTS worked!');
    }
  });
}, 3000);

setTimeout(() => {
  console.log('\n✅ Audio test completed!');
  console.log('📝 Note: Make sure your speakers/headphones are connected and volume is up');
  console.log('🔊 The working audio method will be used in your trading system');
}, 6000);

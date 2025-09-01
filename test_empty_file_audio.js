/**
 * Test script for the empty file audio notification
 */

const { exec } = require('child_process');

/**
 * Audio notification for empty CSV files
 */
function playEmptyFileAudio() {
  try {
    // Windows-specific audio using PowerShell with text-to-speech
    const message = 'empty file please download again';
    
    console.log(`🔊 Testing audio notification: "${message}"`);
    
    // Method 1: Text-to-Speech announcement
    exec(`powershell -c "Add-Type -AssemblyName System.Speech; $speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speak.Rate = 2; $speak.Speak('${message}')"`, (ttsError) => {
      if (ttsError) {
        console.log(`⚠️ TTS failed: ${ttsError.message}`);
        console.log(`🔊 Trying fallback method 2: System warning sound`);
        
        // Method 2: System warning sound
        exec('powershell -c "(New-Object Media.SoundPlayer \'C:\\Windows\\Media\\Windows Exclamation.wav\').PlaySync();"', (soundError) => {
          if (soundError) {
            console.log(`⚠️ System sound failed: ${soundError.message}`);
            console.log(`🔊 Trying fallback method 3: Beep sequence`);
            
            // Method 3: PowerShell warning beep sequence
            exec('powershell -c "[console]::beep(300,200); Start-Sleep -m 100; [console]::beep(300,200); Start-Sleep -m 100; [console]::beep(300,200)"', (beepError) => {
              if (beepError) {
                console.log(`⚠️ Beep sequence failed: ${beepError.message}`);
                console.log(`🔊 Using final fallback: ASCII bell`);
                console.log('\u0007\u0007\u0007'); // Final fallback to triple ASCII bell
              } else {
                console.log(`✅ Beep sequence played successfully`);
              }
            });
          } else {
            console.log(`✅ System warning sound played successfully`);
          }
        });
      } else {
        console.log(`✅ Text-to-speech played successfully: "${message}"`);
      }
    });
    
    // Additional console notification
    console.log(`🔊 AUDIO ALERT: ${message.toUpperCase()} 🔊`);
    
  } catch (error) {
    console.log(`⚠️ Empty file audio notification failed: ${error.message}`);
    console.log('\u0007\u0007\u0007'); // Fallback to triple ASCII bell
  }
}

// Test the audio function
console.log('🎵 Testing Empty File Audio Notification...');
console.log('🔊 You should hear: "empty file please download again"');
console.log('');

playEmptyFileAudio();

// Test completion message
setTimeout(() => {
  console.log('');
  console.log('✅ Audio test completed!');
  console.log('💡 If you heard the message or sounds, the audio system is working correctly.');
  console.log('💡 If no audio played, check your system volume and PowerShell permissions.');
}, 3000);

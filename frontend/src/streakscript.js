function runScanAndDownload() {
  // Step 1: Click the "Run Scan" button
  const runScanBtn = Array.from(document.querySelectorAll('button'))
    .find(btn => btn.textContent.trim().includes('Run'));

  if (runScanBtn instanceof HTMLElement) {
    runScanBtn.click();
    console.log('Clicked "Run Scan" button');

    // Step 2: Wait 10 seconds
    setTimeout(() => {
      const svg = Array.from(document.querySelectorAll('svg[data-name]'))
        .find(el => el.getAttribute('data-name')?.includes('Component 28'));

      if (svg) {
        const clickableParent = svg.closest('button, a, div, span');

        if (clickableParent instanceof HTMLElement) {
          clickableParent.click();
          console.log('Clicked SVG parent');

          // Step 3: Wait 1.5 seconds and click "Download Scan Results"
          setTimeout(() => {
            const downloadBtn = Array.from(document.querySelectorAll('button'))
              .find(btn => btn.textContent.trim().includes('Download Scan Results'));

            if (downloadBtn instanceof HTMLElement) {
              downloadBtn.click();
              console.log('Clicked "Download Scan Results" button');
            } else {
              console.warn('Button containing "Download Scan Results" not found.');
            }

            // ✅ Schedule next run after 2 minutes
            scheduleNextRun();
          }, 1500);

        } else {
          console.warn('No clickable parent found for SVG.');
          scheduleNextRun();
        }
      } else {
        console.warn('SVG with data-name containing "Component 28" not found.');
        scheduleNextRun();
      }
    }, 25000); // 10 sec wait after "Run Scan" click

  } else {
    console.warn('Button with text "Run Scan" not found.');
    scheduleNextRun();
  }
}

// Recursive timeout function for 2-minute interval
function scheduleNextRun() {
  setTimeout(runScanAndDownload, 60000); // 2 min = 120,000 ms
}

// 🔁 Start immediately
runScanAndDownload();

// ==UserScript==
// @name        YouTube Clipper v4
// @namespace   http://tampermonkey.net/
// @version     4.1
// @match       *://*.youtube.com/watch*
// @grant       GM_xmlhttpRequest
// @connect     stellar.roiban.xyz
// ==/UserScript==

(() => {
  const baseUrl = "https://clipper.roiban.xyz";
  let times = [];
  let format = "mp4"; // Default format
  let quality = "720p"; // Default quality for mp4
  let loopEnabled = false;
  let modalElement = null;
  let selectingTimeIndex = -1; // -1: not selecting, 0: selecting start, 1: selecting end

  // Add CSS styles for modal
  const addStyles = () => {
    if (document.querySelector("#clip-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "clip-modal-styles";
    style.textContent = `
      #clip-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: top;
      }
      #clip-btn svg {
        width: 24px;
        height: 24px;
        vertical-align: middle;
        position: relative;
        top: -1px;
      }
      #clip-modal {
        position: absolute;
        background: rgba(28, 28, 28, 0.9);
        color: white;
        padding: 15px;
        border-radius: 4px;
        z-index: 2147483647;
        font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        min-width: 250px;
      }
      #clip-download-popup {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(28, 28, 28, 0.95);
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 2147483648;
        font-family: 'YouTube Noto', Roboto, Arial, sans-serif;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
        width: 400px;
        text-align: left;
      }
      #clip-modal .time-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 10px 0;
      }
      #clip-modal .time-row > div:first-child {
        display: flex;
        align-items: center;
      }
      #clip-modal .time-row svg {
        width: 24px;
        height: 24px;
        margin-right: 15px;
      }
      #clip-modal .controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 15px;
      }
      #clip-modal .format-options {
        background: rgba(28, 28, 28, 0.95);
        border-radius: 4px;
        position: absolute;
        bottom: -90px;
        left: 0;
        width: 100%;
        padding: 10px 0;
      }
      #clip-modal .quality-options {
        background: rgba(28, 28, 28, 0.95);
        border-radius: 4px;
        position: absolute;
        bottom: -150px;
        right: 0;
        width: 120px;
        padding: 10px 0;
      }
      #clip-modal .format-option {
        padding: 8px 15px;
        cursor: pointer;
      }
      #clip-modal .format-option:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      #clip-modal .quality-option {
        padding: 8px 15px;
        cursor: pointer;
      }
      #clip-modal .quality-option:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .time-value {
        font-size: 16px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }
      .time-value:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      .time-value.selecting {
        background: rgba(29, 155, 240, 0.3);
        border: 1px solid rgba(29, 155, 240, 0.6);
      }
      .control-button {
        cursor: pointer;
        padding: 5px 10px;
        font-size: 16px;
        color: white;
        background: none;
        border: none;
        outline: none;
      }
      .control-button:hover {
        text-decoration: underline;
      }
      .control-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .control-button:disabled:hover {
        text-decoration: none;
      }
      .next-button {
        display: flex;
        align-items: center;
      }
      #clip-download-popup h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-size: 18px;
        font-weight: 500;
      }
      #clip-download-popup .progress-bar-container {
        width: 100%;
        height: 8px;
        background: rgba(100, 100, 100, 0.3);
        border-radius: 4px;
        margin: 15px 0;
        overflow: hidden;
      }
      #clip-download-popup .progress-bar {
        height: 100%;
        background: #1ed760; /* Spotify green */
        width: 0;
        border-radius: 4px;
        transition: width 0.5s;
      }
      #clip-download-popup .info-text {
        font-size: 16px;
        margin: 10px 0;
      }
      #clip-download-popup .eta-text {
        font-size: 14px;
        color: #cccccc;
        margin-top: 20px;
      }
    `;
    document.head.appendChild(style);
  };

  // inject once into right controls
  setInterval(() => {
    addStyles();
    const ctr = document.querySelector(".ytp-right-controls");
    if (ctr && !ctr.querySelector("#clip-btn")) {
      const btn = document.createElement("button");
      btn.id = "clip-btn";
      btn.className = "ytp-button";
      btn.title = "Clip";
      btn.style.margin = "0 8px"; // Add equal margin on both sides
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M22,3h-4l-5,5l3,3l6-6V3L22,3z M10.79,7.79C10.91,7.38,11,6.95,11,6.5C11,4.01,8.99,2,6.5,2S2,4.01,2,6.5S4.01,11,6.5,11 c0.45,0,.88-0.09,1.29-0.21L9,12l-1.21,1.21C7.38,13.09,6.95,13,6.5,13C4.01,13,2,15.01,2,17.5S4.01,22,6.5,22s4.5-2.01,4.5-4.5 c0-0.45-0.09-0.88-0.21-1.29L12,15l6,6h4v-2L10.79,7.79z M6.5,8C5.67,8,5,7.33,5,6.5S5.67,5,6.5,5S8,5.67,8,6.5S7.33,8,6.5,8z M6.5,19C5.67,19,5,18.33,5,17.5S5.67,16,6.5,16S8,16.67,8,17.5S7.33,19,6.5,19z");
      path.setAttribute("fill", "white");
      svg.appendChild(path);
      btn.appendChild(svg);
      btn.addEventListener("click", showModal);
      ctr.prepend(btn);
    }
  }, 500);

  function createModalContent(modal) {
    // Clear previous content safely
    while (modal.firstChild) {
      modal.removeChild(modal.firstChild);
    }

    // Helper to create time rows
    const createTimeRow = (svgPath, label, timeIndex) => {
      const row = document.createElement('div');
      row.className = 'time-row';

      const leftDiv = document.createElement('div');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '24');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', svgPath);
      path.setAttribute('fill', 'white');
      svg.appendChild(path);

      const span = document.createElement('span');
      span.textContent = label;
      leftDiv.appendChild(svg);
      leftDiv.appendChild(span);

      const rightDiv = document.createElement('div');
      rightDiv.className = 'time-value';
      rightDiv.dataset.timeIndex = timeIndex;
      rightDiv.textContent = times.length > timeIndex ? times[timeIndex] : 'Click to select';

      row.appendChild(leftDiv);
      row.appendChild(rightDiv);
      return row;
    };

    modal.appendChild(createTimeRow('M8 5v14l11-7z', 'Start time', 0));
    modal.appendChild(createTimeRow('M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z', 'End time', 1));

    // Controls
    const controls = document.createElement('div');
    controls.className = 'controls';

    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-btn';
    resetBtn.className = 'control-button';
    resetBtn.textContent = 'Reset';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'close-btn';
    closeBtn.className = 'control-button';
    closeBtn.textContent = 'Close';

    const controlsRight = document.createElement('div');

    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'download-btn';
    downloadBtn.className = 'control-button';
    if (times.length < 2) downloadBtn.disabled = true;
    const downloadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    downloadSvg.setAttribute('height', '24');
    downloadSvg.setAttribute('viewBox', '0 0 24 24');
    downloadSvg.setAttribute('width', '24');
    downloadSvg.style.verticalAlign = 'middle';
    const downloadPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    downloadPath.setAttribute('d', 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z');
    downloadPath.setAttribute('fill', 'white');
    downloadSvg.appendChild(downloadPath);
    downloadBtn.appendChild(downloadSvg);

    const formatBtn = document.createElement('button');
    formatBtn.id = 'format-btn';
    formatBtn.className = 'control-button';
    formatBtn.textContent = `${format} `;
    const formatSpan = document.createElement('span');
    formatSpan.textContent = `(${format === 'mp3' ? 'audio' : 'video'})`;
    formatBtn.appendChild(formatSpan);

    const qualityBtn = document.createElement('button');
    qualityBtn.id = 'quality-btn';
    qualityBtn.className = 'control-button';
    qualityBtn.style.display = format === 'mp4' ? 'inline-block' : 'none';
    qualityBtn.textContent = quality;

    const loopBtn = document.createElement('button');
    loopBtn.id = 'loop-btn';
    loopBtn.className = 'control-button';
    loopBtn.textContent = 'Loop: OFF';

    controls.appendChild(resetBtn);
    controls.appendChild(closeBtn);
    controlsRight.appendChild(downloadBtn);
    controlsRight.appendChild(formatBtn);
    controlsRight.appendChild(qualityBtn);
    controlsRight.appendChild(loopBtn);
    controls.appendChild(controlsRight);
    modal.appendChild(controls);

    // Format Options
    const formatOptions = document.createElement('div');
    formatOptions.id = 'format-options';
    formatOptions.className = 'format-options';
    formatOptions.style.display = 'none';
    const formatMp3 = document.createElement('div');
    formatMp3.className = 'format-option';
    formatMp3.dataset.format = 'mp3';
    formatMp3.textContent = 'mp3 (audio)';
    const formatMp4 = document.createElement('div');
    formatMp4.className = 'format-option';
    formatMp4.dataset.format = 'mp4';
    formatMp4.textContent = 'mp4 (video)';
    formatOptions.appendChild(formatMp3);
    formatOptions.appendChild(formatMp4);
    modal.appendChild(formatOptions);

    // Quality Options
    const qualityOptions = document.createElement('div');
    qualityOptions.id = 'quality-options';
    qualityOptions.className = 'quality-options';
    qualityOptions.style.display = 'none';
    const qualities = ['1080p', '720p', '480p', '360p', '240p'];
    qualities.forEach(q => {
      const qualityOption = document.createElement('div');
      qualityOption.className = 'quality-option';
      qualityOption.dataset.quality = q;
      qualityOption.textContent = q;
      qualityOptions.appendChild(qualityOption);
    });
    modal.appendChild(qualityOptions);
  }

  // Create and show the modal
  function showModal() {
    // Remove any existing modal
    if (document.querySelector("#clip-modal")) {
      document.querySelector("#clip-modal").remove();
    }

    // Reset times
    times = [];
    selectingTimeIndex = -1;

    // Create modal element
    modalElement = document.createElement("div");
    modalElement.id = "clip-modal";

    // Position the modal near the clip button
    const clipBtn = document.querySelector("#clip-btn");
    const rect = clipBtn.getBoundingClientRect();

    // Modal content
    createModalContent(modalElement);

    document.body.appendChild(modalElement);

    // Position the modal near the clip button
    positionModal();

    // Add event listeners
    setupModalListeners();

    // Set up timeline click listener
    setupTimelineListener();
  }

  // Helper to position the modal
  function positionModal() {
    const clipBtn = document.querySelector("#clip-btn");
    if (clipBtn && modalElement) {
      const rect = clipBtn.getBoundingClientRect();
      modalElement.style.top = `${rect.top - modalElement.offsetHeight - 10}px`;
      modalElement.style.right = `${window.innerWidth - rect.right - 10}px`;
    }
  }

  // Calculate an end time by adding 1 minute to start time
  function calculateEndTime(startTime) {
    const timeParts = startTime.split(':');
    let minutes, seconds;

    if (timeParts.length === 2) {
      minutes = parseInt(timeParts[0]);
      seconds = parseInt(timeParts[1]);
    } else if (timeParts.length === 3) {
      const hours = parseInt(timeParts[0]);
      minutes = parseInt(timeParts[1]) + (hours * 60);
      seconds = parseInt(timeParts[2]);
    } else {
      return "01:00"; // Default
    }

    // Add 1 minute
    minutes += 1;

    // Format back to string
    if (timeParts.length === 2) {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      const hours = Math.floor(minutes / 60);
      minutes = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  // Set up listeners for modal buttons
  function setupModalListeners() {
    // Time value click handlers
    document.querySelectorAll("#clip-modal .time-value").forEach(timeElement => {
      timeElement.addEventListener("click", (e) => {
        const timeIndex = parseInt(e.target.dataset.timeIndex);

        // Toggle selection state
        if (selectingTimeIndex === timeIndex) {
          // Already selecting this time, cancel selection
          selectingTimeIndex = -1;
          updateTimeSelectionDisplay();
        } else {
          // Start selecting this time
          selectingTimeIndex = timeIndex;
          updateTimeSelectionDisplay();
        }
      });
    });

    // Reset button
    document.querySelector("#reset-btn").addEventListener("click", () => {
      times = [];
      selectingTimeIndex = -1;
      updateTimeDisplay();
    });

    // Close button
    document.querySelector("#close-btn").addEventListener("click", () => {
      document.querySelector("#clip-modal")?.remove();
      selectingTimeIndex = -1;
      removeTimelineListener();
    });

    // Format button
    document.querySelector("#format-btn").addEventListener("click", () => {
      const formatOptions = document.querySelector("#format-options");
      formatOptions.style.display = formatOptions.style.display === "none" ? "block" : "none";
    });

    // Format options
    document.querySelectorAll(".format-option").forEach(option => {
      option.addEventListener("click", (e) => {
        format = e.target.dataset.format;
        document.querySelector("#format-options").style.display = "none";

        // Update format button text while preserving structure
        const formatBtn = document.querySelector("#format-btn");
        if (formatBtn.firstChild && formatBtn.firstChild.nodeType === Node.TEXT_NODE) {
          formatBtn.firstChild.textContent = `${format} `;
        } else {
          formatBtn.textContent = `${format} `;
        }
        const formatSpan = formatBtn.querySelector('span');
        if (formatSpan) {
          formatSpan.textContent = `(${format === 'mp3' ? 'audio' : 'video'})`;
        } else if (formatBtn.firstChild && formatBtn.firstChild.nodeType === Node.TEXT_NODE) {
          // Re-add the span if it was lost
          const newSpan = document.createElement('span');
          newSpan.textContent = `(${format === 'mp3' ? 'audio' : 'video'})`;
          formatBtn.appendChild(newSpan);
        }

        // Show/hide quality button based on format
        const qualityBtn = document.querySelector("#quality-btn");
        if (qualityBtn) {
          qualityBtn.style.display = format === 'mp4' ? 'inline-block' : 'none';
        }
      });
    });

    // Quality button
    document.querySelector("#quality-btn").addEventListener("click", () => {
      const qualityOptions = document.querySelector("#quality-options");
      qualityOptions.style.display = qualityOptions.style.display === "none" ? "block" : "none";
    });

    // Quality options
    document.querySelectorAll(".quality-option").forEach(option => {
      option.addEventListener("click", (e) => {
        quality = e.target.dataset.quality;
        document.querySelector("#quality-options").style.display = "none";
        document.querySelector("#quality-btn").textContent = quality;
      });
    });

    // Loop button
    document.querySelector("#loop-btn").addEventListener("click", () => {
      loopEnabled = !loopEnabled;
      document.querySelector("#loop-btn").textContent = loopEnabled ? "Loop: ON" : "Loop: OFF";

      // If loop is enabled, set up looping in YouTube player
      toggleLooping(loopEnabled);
    });

    // Download button
    document.querySelector("#download-btn").addEventListener("click", () => {
      if (times.length >= 2) {
        sendClip();
      }
    });
  }

  // Set up timeline click listener
  function setupTimelineListener() {
    const progressBar = document.querySelector('.ytp-progress-bar');
    if (progressBar && !progressBar.hasAttribute('data-clip-listener')) {
      progressBar.setAttribute('data-clip-listener', 'true');
      progressBar.addEventListener('click', handleTimelineClick);
    }
  }

  // Remove timeline listener
  function removeTimelineListener() {
    const progressBar = document.querySelector('.ytp-progress-bar');
    if (progressBar) {
      progressBar.removeAttribute('data-clip-listener');
      progressBar.removeEventListener('click', handleTimelineClick);
    }
  }

  // Handle timeline clicks
  function handleTimelineClick(e) {
    if (!document.querySelector("#clip-modal")) return;

    // Small delay to let YouTube update the time display
    setTimeout(() => {
      const currentTime = document.querySelector(".ytp-time-current")?.textContent.trim();
      if (currentTime) {
        if (selectingTimeIndex >= 0) {
          // User has selected a specific time slot to update
          times[selectingTimeIndex] = currentTime;
          selectingTimeIndex = -1; // Reset selection
          updateTimeDisplay();
        } else if (times.length < 2) {
          // No specific selection, add to next available slot
          times.push(currentTime);
          updateTimeDisplay();
        }
      }
    }, 100);
  }

  // Select time from video
  function selectTimeFromVideo(index) {
    const video = document.querySelector("video");
    if (video) {
      const currentTime = document.querySelector(".ytp-time-current")?.textContent.trim();
      if (currentTime) {
        times[index] = currentTime;
        updateTimeDisplay();
      }
    }
  }

  // Update time display in modal
  function updateTimeDisplay() {
    const timeElements = document.querySelectorAll("#clip-modal .time-value");
    const downloadBtn = document.querySelector("#download-btn");

    if (timeElements.length >= 2) {
      timeElements[0].textContent = times.length > 0 ? times[0] : 'Click to select';
      timeElements[1].textContent = times.length > 1 ? times[1] : 'Click to select';

      // Enable/disable download button
      if (downloadBtn) {
        if (times.length >= 2) {
          downloadBtn.removeAttribute('disabled');
          downloadBtn.style.opacity = '1';
        } else {
          downloadBtn.setAttribute('disabled', 'true');
          downloadBtn.style.opacity = '0.5';
        }
      }
    }

    // Update selection display
    updateTimeSelectionDisplay();
  }

  // Update visual selection display
  function updateTimeSelectionDisplay() {
    const timeElements = document.querySelectorAll("#clip-modal .time-value");
    timeElements.forEach((element, index) => {
      if (selectingTimeIndex === index) {
        element.classList.add('selecting');
      } else {
        element.classList.remove('selecting');
      }
    });
  }

  // Toggle video looping
  function toggleLooping(enabled) {
    const video = document.querySelector("video");
    if (video && times.length === 2) {
      if (enabled) {
        // Convert times to seconds for looping
        const startSeconds = timeToSeconds(times[0]);
        const endSeconds = timeToSeconds(times[1]);

        // Set up loop check interval
        if (!window.loopInterval) {
          window.loopInterval = setInterval(() => {
            if (video.currentTime >= endSeconds) {
              video.currentTime = startSeconds;
            }
          }, 500);
        }
      } else {
        // Clear loop interval
        if (window.loopInterval) {
          clearInterval(window.loopInterval);
          window.loopInterval = null;
        }
      }
    }
  }

  // Convert time string to seconds
  function timeToSeconds(timeStr) {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  function showErrorPopup(message) {
    const popup = document.querySelector('#clip-download-popup');
    if (popup) {
      popup.querySelector('h3').textContent = 'Error';
      popup.querySelector('.info-text').textContent = message;
      const progressBar = popup.querySelector('.progress-bar');
      if (progressBar) progressBar.style.backgroundColor = 'red';

      // Add a close button to the error popup
      let closeButton = popup.querySelector('.close-popup-btn');
      if (!closeButton) {
        closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.className = 'close-popup-btn';
        closeButton.style.marginTop = '15px';
        closeButton.onclick = () => popup.remove();
        popup.appendChild(closeButton);
      }
      
      // Stop any further processing like auto-closing if we are showing an error
      if (popup.dataset.autoCloseTimer) {
          clearTimeout(parseInt(popup.dataset.autoCloseTimer));
      }
    }
  }

  function pollStatus(jobId) {
    const statusUrl = `${baseUrl}/status/${jobId}`;
    const h3 = document.querySelector('#clip-download-popup h3');
    const infoText = document.querySelector('#clip-download-popup .info-text');
    const progressBar = document.getElementById('download-progress-bar');
    const etaText = document.querySelector('#clip-download-popup .eta-text');

    const pollInterval = setInterval(() => {
      GM_xmlhttpRequest({
        method: "GET",
        url: statusUrl,
        responseType: "json",
        onload(res) {
          if (res.status === 200) {
            const job = res.response;
            switch (job.status) {
              case 'starting':
                h3.textContent = 'Job is starting...';
                etaText.textContent = 'Please wait...';
                break;
              case 'downloading':
                h3.textContent = 'Downloading...';
                if (job.progress && job.progress.percent) {
                  const percent = parseFloat(job.progress.percent) || 0;
                  progressBar.style.width = `${percent}%`;
                  etaText.textContent = `ETA: ${job.progress.eta || '--:--'} | Speed: ${job.progress.speed || 'N/A'}`;
                }
                break;
              case 'trimming':
                h3.textContent = 'Trimming video...';
                progressBar.style.width = '100%';
                infoText.textContent = 'Finalizing your clip, this should be quick!';
                etaText.textContent = '';
                break;
              case 'completed':
                clearInterval(pollInterval);
                h3.textContent = 'Download Ready!';
                infoText.textContent = 'Your clip is ready to be downloaded.';
                etaText.textContent = '';
                downloadFinalFile(jobId);
                break;
              case 'error':
                clearInterval(pollInterval);
                showErrorPopup(job.error || 'An unknown error occurred.');
                break;
            }
          } else {
            clearInterval(pollInterval);
            showErrorPopup('Failed to get job status.');
          }
        },
        onerror() {
          clearInterval(pollInterval);
          showErrorPopup('Could not connect to the server for status updates.');
        }
      });
    }, 2000);
  }

  function downloadFinalFile(jobId) {
      const downloadUrl = `${baseUrl}/download/${jobId}`;
      const videoTitle = document.querySelector('.ytd-video-primary-info-renderer .title')?.textContent?.trim() || 'Video';
      let [start, end] = times;
      if (end < start) [start, end] = [end, start];

      const downloadNowBtn = document.createElement('button');
      downloadNowBtn.textContent = 'Download Now';
      downloadNowBtn.style.marginTop = '15px';
      downloadNowBtn.onclick = () => {
          GM_xmlhttpRequest({
              method: "GET",
              url: downloadUrl,
              responseType: "blob",
              onload(res) {
                  if (res.status === 200) {
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(res.response);
                      a.download = `${videoTitle}_${start.replace(/:/g, "")}-${end.replace(/:/g, "")}.${format}`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                      
                      const popup = document.querySelector("#clip-download-popup");
                      if(popup) {
                        popup.querySelector('h3').textContent = 'Download Started!';
                        popup.querySelector('.info-text').textContent = 'Check your browser downloads.';
                        // remove the download button
                        downloadNowBtn.remove();
                        const autoCloseTimer = setTimeout(() => {
                            popup.remove();
                        }, 3000);
                        popup.dataset.autoCloseTimer = autoCloseTimer;
                      }
                  } else {
                      showErrorPopup('Failed to download the file.');
                  }
              },
              onerror() {
                  showErrorPopup('An error occurred during download.');
              }
          });
      };
      
      const popup = document.querySelector('#clip-download-popup');
      if (popup) {
        // Clear previous content like ETA text before adding the button
        const etaText = popup.querySelector('.eta-text');
        if(etaText) etaText.remove();
        
        popup.appendChild(downloadNowBtn);
      }
  }

  function sendClip() {
    let [start, end] = times;
    if (end < start) [start, end] = [end, start];

    document.querySelector("#clip-modal")?.remove();
    selectingTimeIndex = -1;
    removeTimelineListener();

    const videoTitle = document.querySelector('.ytd-video-primary-info-renderer .title')?.textContent?.trim() || 'Video';

    const h3 = document.createElement('h3');
    h3.textContent = 'Initializing...';
    const infoText = document.createElement('div');
    infoText.className = 'info-text';
    infoText.textContent = 'Preparing your clip request.';
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.id = 'download-progress-bar';
    progressContainer.appendChild(progressBar);
    const etaText = document.createElement('div');
    etaText.className = 'eta-text';
    etaText.textContent = 'Contacting server...';

    const popupEl = document.createElement("div");
    popupEl.id = "clip-download-popup";

    popupEl.appendChild(h3);
    popupEl.appendChild(infoText);
    popupEl.appendChild(progressContainer);
    popupEl.appendChild(etaText);

    document.body.appendChild(popupEl);

    GM_xmlhttpRequest({
      method: "POST",
      url: `${baseUrl}/clip`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        url: location.href,
        start,
        end,
        format,
        quality: format === 'mp4' ? quality : undefined
      }),
      responseType: "json",
      onload(res) {
          if (res.status === 200 && res.response.job_id) {
            pollStatus(res.response.job_id);
          } else {
            let errorMsg = 'Failed to start clipping job.';
            if (res.response && res.response.error) {
                errorMsg = res.response.error;
            }
            showErrorPopup(errorMsg);
          }
      },
      onerror() {
        showErrorPopup('Could not connect to the clipping server.');
      }
    });
  }
})()

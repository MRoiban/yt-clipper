// ==UserScript==
// @name        YouTube Clipper v4
// @namespace   http://tampermonkey.net/
// @version     4.0
// @match       *://*.youtube.com/watch*
// @grant       GM_xmlhttpRequest
// @connect     stellar.roiban.xyz
// ==/UserScript==

(() => {
  const server = "https://stellar.roiban.xyz/clip";
  let times = [];
  let format = "mp4"; // Default format
  let quality = "720p"; // Default quality for mp4
  let loopEnabled = false;
  let modalElement = null;
  let selectingTimeIndex = -1; // -1: not selecting, 0: selecting start, 1: selecting end

  // Add CSS styles for modal
  const addStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
      #clip-btn {
        display: flex;
        align-items: center;
        justify-content: center;
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
    const ctr = document.querySelector(".ytp-right-controls");
    if (ctr && !ctr.querySelector("#clip-btn") && !document.querySelector("#clip-modal-styles")) {
      addStyles();
      const btn = document.createElement("button");
      btn.id = "clip-btn";
      btn.className = "ytp-button";
      btn.title = "Clip";
      btn.style.margin = "0 8px"; // Add equal margin on both sides
      btn.innerHTML = `
        <svg height="24" viewBox="0 0 24 24" width="24">
          <path d="M22,3h-4l-5,5l3,3l6-6V3L22,3z M10.79,7.79C10.91,7.38,11,6.95,11,6.5C11,4.01,8.99,2,6.5,2S2,4.01,2,6.5S4.01,11,6.5,11 c0.45,0,.88-0.09,1.29-0.21L9,12l-1.21,1.21C7.38,13.09,6.95,13,6.5,13C4.01,13,2,15.01,2,17.5S4.01,22,6.5,22s4.5-2.01,4.5-4.5 c0-0.45-0.09-0.88-0.21-1.29L12,15l6,6h4v-2L10.79,7.79z M6.5,8C5.67,8,5,7.33,5,6.5S5.67,5,6.5,5S8,5.67,8,6.5S7.33,8,6.5,8z M6.5,19C5.67,19,5,18.33,5,17.5S5.67,16,6.5,16S8,16.67,8,17.5S7.33,19,6.5,19z" fill="white"></path>
        </svg>`;
      btn.addEventListener("click", showModal);
      ctr.prepend(btn);
    }
  }, 500);

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
    modalElement.innerHTML = `
      <div class="time-row">
        <div>
          <svg height="24" viewBox="0 0 24 24" width="24">
            <path d="M8 5v14l11-7z" fill="white"></path>
          </svg>
          <span>Start time</span>
        </div>
        <div class="time-value" data-time-index="0">${times.length > 0 ? times[0] : 'Click to select'}</div>
      </div>
      <div class="time-row">
        <div>
          <svg height="24" viewBox="0 0 24 24" width="24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" fill="white"></path>
          </svg>
          <span>End time</span>
        </div>
        <div class="time-value" data-time-index="1">${times.length > 1 ? times[1] : 'Click to select'}</div>
      </div>
      <div class="controls">
        <button id="reset-btn" class="control-button">Reset</button>
        <button id="close-btn" class="control-button">Close</button>
        <div>
          <button id="download-btn" class="control-button" ${times.length < 2 ? 'disabled' : ''}>
            <svg height="24" viewBox="0 0 24 24" width="24" style="vertical-align: middle;">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="white"></path>
            </svg>
          </button>
          <button id="format-btn" class="control-button">
            ${format} <span>(${format === 'mp3' ? 'audio' : 'video'})</span>
          </button>
          <button id="quality-btn" class="control-button" style="display: ${format === 'mp4' ? 'inline-block' : 'none'};">
            ${quality}
          </button>
          <button id="loop-btn" class="control-button">${loopEnabled ? "Loop" : "Loop"}</button>
        </div>
      </div>
      <div id="format-options" class="format-options" style="display: none;">
        <div class="format-option" data-format="mp3">mp3 (audio)</div>
        <div class="format-option" data-format="mp4">mp4 (video)</div>
      </div>
      <div id="quality-options" class="quality-options" style="display: none;">
        <div class="quality-option" data-quality="1080p">1080p</div>
        <div class="quality-option" data-quality="720p">720p</div>
        <div class="quality-option" data-quality="480p">480p</div>
        <div class="quality-option" data-quality="360p">360p</div>
        <div class="quality-option" data-quality="240p">240p</div>
      </div>
    `;
    
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
        document.querySelector("#format-btn").innerHTML = `${format} <span>(${format === 'mp3' ? 'audio' : 'video'})</span>`;
        
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
      document.querySelector("#loop-btn").textContent = loopEnabled ? "Loop" : "Loop";
      
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

  function sendClip() {
    let [start, end] = times;
    if (end < start) [start, end] = [end, start];
    
    // Close the modal and remove timeline listener
    document.querySelector("#clip-modal")?.remove();
    selectingTimeIndex = -1;
    removeTimelineListener();
    
    // Create download popup
    const popupEl = document.createElement("div");
    popupEl.id = "clip-download-popup";
    
    // Get video title
    const videoTitle = document.querySelector('.ytd-video-primary-info-renderer .title')?.textContent?.trim() || 'Video';
    
    popupEl.innerHTML = `
      <h3>Downloading video stream...</h3>
      <div class="info-text">This may take a while, get a cup of coffee while you wait!</div>
      <div class="progress-bar-container">
        <div class="progress-bar" id="download-progress-bar"></div>
      </div>
      <div class="eta-text">Elapsed: 0:00 | ETA: --:--</div>
    `;
    document.body.appendChild(popupEl);
    
    // Set up progress tracking variables
    const startTime = Date.now();
    let progressInterval;
    let elapsedSeconds = 0;
    let estimatedTotalSeconds = 180; // Default 3 minutes
    
    // Function to format time as MM:SS
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    // Start progress simulation
    progressInterval = setInterval(() => {
      elapsedSeconds = (Date.now() - startTime) / 1000;
      
      // Calculate progress percentage (simulated)
      const progress = Math.min(elapsedSeconds / estimatedTotalSeconds, 0.95); // Cap at 95% until complete
      const progressBar = document.getElementById('download-progress-bar');
      if (progressBar) {
        progressBar.style.width = `${progress * 100}%`;
      }
      
      // Update ETA
      const etaSeconds = estimatedTotalSeconds - elapsedSeconds;
      const etaText = etaSeconds > 0 ? formatTime(etaSeconds) : '0:00';
      const etaElement = document.querySelector('#clip-download-popup .eta-text');
      if (etaElement) {
        etaElement.textContent = `Elapsed: ${formatTime(elapsedSeconds)} | ETA: ${etaText}`;
      }
    }, 1000);
    
    GM_xmlhttpRequest({
      method: "POST",
      url: server,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ 
        url: location.href, 
        start, 
        end, 
        format,
        quality: format === 'mp4' ? quality : undefined
      }),
      responseType: "blob",
      onload(res) {
        // Stop progress interval
        clearInterval(progressInterval);
        
        // Update download popup to show completion
        const progressBar = document.getElementById('download-progress-bar');
        if (progressBar) {
          progressBar.style.width = '100%';
        }
        
        document.querySelector('#clip-download-popup h3').textContent = 'Download Complete!';
        document.querySelector('#clip-download-popup .info-text').textContent = 'Your clip has been saved.';
        document.querySelector('#clip-download-popup .eta-text').textContent = 
          `Duration: ${formatTime(elapsedSeconds)} | Size: ${Math.round(res.response.size / 1024)} KB`;
        
        // Auto-close the popup after a delay
        setTimeout(() => {
          document.querySelector("#clip-download-popup")?.remove();
        }, 3000);
        
        // Trigger download
        const a = document.createElement("a");
        a.href = URL.createObjectURL(res.response);
        a.download = `${videoTitle}_${start.replace(/:/g, "")}-${end.replace(/:/g, "")}.${format}`;
        a.click();
      },
      onerror() {
        // Stop progress interval
        clearInterval(progressInterval);
        
        // Show error in the popup
        document.querySelector('#clip-download-popup h3').textContent = 'Error Creating Clip';
        document.querySelector('#clip-download-popup .info-text').textContent = 
          'There was an error processing your request. Please try again.';
        document.querySelector('#clip-download-popup .progress-bar').style.backgroundColor = '#ff3333';
        
        // Auto-close after a delay
        setTimeout(() => {
          document.querySelector("#clip-download-popup")?.remove();
        }, 5000);
      }
    });
  }
})()

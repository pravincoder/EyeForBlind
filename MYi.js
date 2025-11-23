// Enhanced logging with categories
const log = (message, category = 'system') => {
  const logEl = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${category}`;
  const timestamp = new Date().toLocaleTimeString();
  entry.innerHTML = `<span style="opacity:0.6">[${timestamp}]</span> ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
};

// Update status indicator
const updateStatus = (text, state = 'idle') => {
  const statusText = document.getElementById('status-text');
  const statusLight = document.getElementById('status-light');
  statusText.textContent = text;
  statusLight.className = `status-light ${state}`;
};

// Application state
let recognition;
let stage = "idle"; // idle → ready → camera_open → reading
let isBusy = false;
let stopReading = false;
let cameraStream = null;
let worker = null;

// Initialize Tesseract worker for better performance
async function initOCR() {
  try {
    worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          updateStatus('Processing document...', 'processing');
        }
      }
    });
    // Configure for both printed and handwritten text
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume uniform block of text
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:()[]{}\'"-',
    });
    log('OCR engine initialized', 'system');
  } catch (e) {
    log(`OCR initialization error: ${e.message}`, 'error');
  }
}

// Enhanced Text to Speech with better voice
function speak(msg, priority = false) {
  return new Promise((resolve) => {
    if (priority) {
      speechSynthesis.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(msg);
    
    // Try to use a more natural voice
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.includes('en') && (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Google'))
    ) || voices.find(v => v.lang.includes('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      log(`Speech error: ${e.error}`, 'error');
      resolve();
    };
    
    speechSynthesis.speak(utterance);
  });
}

// Start Microphone with enhanced error handling
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    log("Speech recognition not supported in this browser", 'error');
    updateStatus('Speech recognition unavailable', 'idle');
    return;
  }

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    if (isBusy) return;
    const transcript = e.results[e.resultIndex][0].transcript.toLowerCase().trim();
    log(`User: "${transcript}"`, 'user');
    handleVoice(transcript);
  };

  recognition.onerror = (e) => {
    log(`Recognition error: ${e.error}`, 'error');
    if (e.error === 'no-speech') {
      updateStatus('Listening...', 'listening');
    } else if (e.error === 'not-allowed') {
      updateStatus('Microphone permission denied', 'idle');
      speak("Please allow microphone access to use voice commands.");
    }
  };

  recognition.onstart = () => {
    updateStatus('Listening...', 'listening');
    log('Voice recognition started', 'system');
  };

  recognition.onend = () => {
    if (!isBusy) {
      recognition.start();
    }
  };

  try {
    recognition.start();
    log('Microphone initialized', 'system');
  } catch (e) {
    log(`Failed to start recognition: ${e.message}`, 'error');
  }
}

// Enhanced voice command handler with natural language processing
async function handleVoice(transcript) {
  const t = transcript.toLowerCase();
  
  // Stop command - highest priority
  if ((t.includes("stop") || t.includes("cancel")) && (isBusy || speechSynthesis.speaking)) {
    stopReading = true;
    speechSynthesis.cancel();
    isBusy = false;
    updateStatus('Stopped', 'idle');
    await speak("Stopped.", true);
    return;
  }

  // Help command
  if (t.includes("help") || t.includes("what can you do")) {
    await speak("I can help you read documents. Say 'start' to begin, then 'open camera' to activate the camera, and 'read it' to read a document. Say 'stop' anytime to stop.");
    return;
  }

  // Greeting/Start commands
  if ((stage === "idle" || stage === "ready") && 
      (t.includes("hello") || t.includes("hi") || t.includes("start") || t.includes("begin"))) {
    stage = "ready";
    await speak("Hello! I'm your document reading assistant. I can help you read printed and handwritten documents. Say 'open camera' when you're ready to begin.");
    return;
  }

  // Camera commands
  if ((stage === "ready" || stage === "idle") && 
      (t.includes("open camera") || t.includes("turn on camera") || t.includes("start camera") || t.includes("camera"))) {
    await openCam();
    return;
  }

  // Read commands
  if ((stage === "camera_open" || stage === "ready") && 
      (t.includes("read") || t.includes("scan") || t.includes("what does it say"))) {
    await readNow();
    return;
  }

  // If camera is open but command not recognized
  if (stage === "camera_open" && !isBusy) {
    await speak("I didn't understand that. Say 'read it' to read the document, or 'stop' to stop.");
  }
}

// Enhanced camera opening with better constraints
async function openCam() {
  if (isBusy) {
    await speak("Please wait, I'm currently busy.");
    return;
  }

  try {
    updateStatus('Requesting camera access...', 'processing');
    await speak("Opening camera. Please allow camera access when prompted.");

    // Request camera with optimal settings for document scanning
    const constraints = {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: 'environment', // Use back camera on mobile
        focusMode: 'continuous',
        exposureMode: 'continuous'
      }
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('video');
    video.srcObject = cameraStream;
    
    // Show overlay guide
    document.getElementById('overlay').classList.add('active');
    
    stage = "camera_open";
    updateStatus('Camera ready', 'listening');
    await speak("Camera is ready. Position your document in the frame and say 'read it' when you're ready.");
    log('Camera opened successfully', 'system');
  } catch (e) {
    log(`Camera error: ${e.message}`, 'error');
    updateStatus('Camera error', 'idle');
    
    if (e.name === 'NotAllowedError') {
      await speak("Camera access was denied. Please allow camera access in your browser settings.");
    } else if (e.name === 'NotFoundError') {
      await speak("No camera found. Please connect a camera and try again.");
    } else {
      await speak("Failed to open camera. Please try again.");
    }
  }
}

// Enhanced OCR with better image processing
async function readNow() {
  if (isBusy) {
    await speak("Please wait, I'm already processing.");
    return;
  }

  if (!cameraStream) {
    await speak("Camera is not open. Say 'open camera' first.");
    return;
  }

  isBusy = true;
  stopReading = false;
  stage = "reading";
  
  updateStatus('Capturing image...', 'processing');
  await speak("Hold still, capturing the document now.");

  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  
  // Wait a moment for video to stabilize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  
  // Draw video frame to canvas
  ctx.drawImage(video, 0, 0);
  
  // Apply image enhancement for better OCR
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  enhanceImage(imageData);
  ctx.putImageData(imageData, 0, 0);
  
  // Convert to data URL
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  try {
    updateStatus('Reading document...', 'processing');
    log('Starting OCR...', 'system');
    
    // Use the initialized worker for better performance
    let result;
    if (worker) {
      result = await worker.recognize(imgData);
    } else {
      // Fallback to direct recognition
      result = await Tesseract.recognize(imgData, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            updateStatus('Processing text...', 'processing');
          }
        }
      });
    }

    const text = result.data.text.trim();
    log(`OCR Result: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`, 'assistant');

    if (stopReading) {
      await speak("Reading cancelled.");
      isBusy = false;
      stage = "camera_open";
      updateStatus('Camera ready', 'listening');
      return;
    }

    if (text && text.length > 10) {
      // Clean up the text
      const cleanedText = text
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines
        .trim();
      
      updateStatus('Reading aloud...', 'processing');
      await speak(cleanedText);
      
      if (!stopReading) {
        await speak("Reading complete. Say 'read it' again to read another document, or 'stop' to finish.");
      }
    } else {
      await speak("I couldn't read any text from the document. Make sure the document is well-lit, in focus, and positioned clearly in the frame. Try again.");
    }
  } catch (e) {
    log(`OCR Error: ${e.message}`, 'error');
    await speak("An error occurred while reading the document. Please try again.");
  } finally {
    isBusy = false;
    if (stage === "reading") {
      stage = "camera_open";
    }
    updateStatus('Camera ready', 'listening');
  }
}

// Image enhancement for better OCR accuracy
function enhanceImage(imageData) {
  const data = imageData.data;
  
  // Convert to grayscale and enhance contrast
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Convert to grayscale
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Enhance contrast (simple linear stretch)
    const enhanced = Math.min(255, Math.max(0, (gray - 50) * 1.5));
    
    data[i] = enhanced;     // R
    data[i + 1] = enhanced; // G
    data[i + 2] = enhanced; // B
    // Alpha channel (data[i + 3]) remains unchanged
  }
}

// Button handlers for manual controls
document.addEventListener('DOMContentLoaded', () => {
  const cameraBtn = document.getElementById('camera-btn');
  const readBtn = document.getElementById('read-btn');
  const stopBtn = document.getElementById('stop-btn');

  cameraBtn.addEventListener('click', async () => {
    if (cameraStream) {
      // Close camera
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
      document.getElementById('video').srcObject = null;
      document.getElementById('overlay').classList.remove('active');
      stage = "ready";
      updateStatus('Camera closed', 'idle');
      await speak("Camera closed.");
      cameraBtn.textContent = "📷 Camera";
    } else {
      await openCam();
      cameraBtn.textContent = "📷 Close Camera";
    }
  });

  readBtn.addEventListener('click', async () => {
    if (cameraStream) {
      await readNow();
    } else {
      await speak("Please open the camera first.");
    }
  });

  stopBtn.addEventListener('click', async () => {
    stopReading = true;
    speechSynthesis.cancel();
    isBusy = false;
    updateStatus('Stopped', 'idle');
    await speak("Stopped.", true);
  });

  // Initialize
  updateStatus('Initializing...', 'processing');
  log('MYi Document Reading Assistant starting...', 'system');
  
  // Wait for voices to load
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
      startMic();
      initOCR();
    };
  } else {
    startMic();
    initOCR();
  }
  
  // Welcome message
  setTimeout(async () => {
    await speak("Welcome to MYi, your document reading assistant. Say 'hello' or 'start' to begin.");
    updateStatus('Ready - Say "hello" to start', 'listening');
  }, 1000);
});

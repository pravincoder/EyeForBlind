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
  
  // Update data attributes for language switching
  if (statusText.hasAttribute('data-en') && statusText.hasAttribute('data-hi')) {
    statusText.setAttribute(`data-${currentLanguage}`, text);
  }
};

// Application state
let recognition;
let stage = "idle"; // idle → ready → camera_open → reading
let isBusy = false;
let stopReading = false;
let cameraStream = null;
let worker = null;
let currentLanguage = 'en'; // 'en' or 'hi'

// Translations
const translations = {
  en: {
    status: {
      initializing: "Initializing...",
      listening: "Listening...",
      processing: "Processing document...",
      ready: 'Ready - Say "hello" to start',
      cameraReady: "Camera ready",
      stopped: "Stopped",
      cameraClosed: "Camera closed"
    },
    messages: {
      welcome: "Welcome to MYi, your document reading assistant. Say 'hello' or 'start' to begin.",
      hello: "Hello! I'm your document reading assistant. I can help you read printed and handwritten documents. Say 'open camera' when you're ready to begin.",
      help: "I can help you read documents. Say 'start' to begin, then 'open camera' to activate the camera, and 'read it' to read a document. Say 'stop' anytime to stop.",
      stopped: "Stopped.",
      cameraOpening: "Opening camera. Please allow camera access when prompted.",
      cameraReady: "Camera is ready. Position your document in the frame and say 'read it' when you're ready.",
      cameraDenied: "Camera access was denied. Please allow camera access in your browser settings.",
      noCamera: "No camera found. Please connect a camera and try again.",
      cameraFailed: "Failed to open camera. Please try again.",
      cameraClosed: "Camera closed.",
      capturing: "Hold still, capturing the document now.",
      cameraNotOpen: "Camera is not open. Say 'open camera' first.",
      busy: "Please wait, I'm currently busy.",
      alreadyProcessing: "Please wait, I'm already processing.",
      readingComplete: "Reading complete. Say 'read it' again to read another document, or 'stop' to finish.",
      noText: "I couldn't read any text from the document. Make sure the document is well-lit, in focus, and positioned clearly in the frame. Try again.",
      error: "An error occurred while reading the document. Please try again.",
      notUnderstood: "I didn't understand that. Say 'read it' to read the document, or 'stop' to stop.",
      openCameraFirst: "Please open the camera first.",
      micPermission: "Please allow microphone access to use voice commands."
    },
    ui: {
      title: "MYi - Your Document Reading Assistant",
      subtitle: "Voice-powered assistant to help read printed and handwritten documents",
      overlayText: "Position document within frame",
      camera: "📷 Camera",
      closeCamera: "📷 Close Camera",
      read: "📖 Read",
      stop: "⏹ Stop"
    }
  },
  hi: {
    status: {
      initializing: "आरंभ हो रहा है...",
      listening: "सुन रहा हूँ...",
      processing: "दस्तावेज़ प्रसंस्करण...",
      ready: 'तैयार - शुरू करने के लिए "नमस्ते" कहें',
      cameraReady: "कैमरा तैयार है",
      stopped: "रोक दिया गया",
      cameraClosed: "कैमरा बंद"
    },
    messages: {
      welcome: "MYi में आपका स्वागत है, आपका दस्तावेज़ पढ़ने वाला सहायक। शुरू करने के लिए 'नमस्ते' या 'शुरू करें' कहें।",
      hello: "नमस्ते! मैं आपका दस्तावेज़ पढ़ने वाला सहायक हूँ। मैं आपको मुद्रित और हस्तलिखित दस्तावेज़ पढ़ने में मदद कर सकता हूँ। जब आप तैयार हों तो 'कैमरा खोलें' कहें।",
      help: "मैं आपको दस्तावेज़ पढ़ने में मदद कर सकता हूँ। शुरू करने के लिए 'शुरू करें' कहें, फिर कैमरा सक्रिय करने के लिए 'कैमरा खोलें' कहें, और दस्तावेज़ पढ़ने के लिए 'इसे पढ़ें' कहें। कभी भी 'रोकें' कहकर रोक सकते हैं।",
      stopped: "रोक दिया गया।",
      cameraOpening: "कैमरा खोल रहा हूँ। कृपया जब संकेत दिया जाए तो कैमरा पहुंच की अनुमति दें।",
      cameraReady: "कैमरा तैयार है। अपना दस्तावेज़ फ्रेम में रखें और जब तैयार हों तो 'इसे पढ़ें' कहें।",
      cameraDenied: "कैमरा पहुंच अस्वीकार कर दी गई। कृपया अपनी ब्राउज़र सेटिंग्स में कैमरा पहुंच की अनुमति दें।",
      noCamera: "कोई कैमरा नहीं मिला। कृपया एक कैमरा कनेक्ट करें और पुनः प्रयास करें।",
      cameraFailed: "कैमरा खोलने में विफल। कृपया पुनः प्रयास करें।",
      cameraClosed: "कैमरा बंद।",
      capturing: "स्थिर रहें, अब दस्तावेज़ कैप्चर कर रहा हूँ।",
      cameraNotOpen: "कैमरा खुला नहीं है। पहले 'कैमरा खोलें' कहें।",
      busy: "कृपया प्रतीक्षा करें, मैं अभी व्यस्त हूँ।",
      alreadyProcessing: "कृपया प्रतीक्षा करें, मैं पहले से ही प्रसंस्करण कर रहा हूँ।",
      readingComplete: "पढ़ना पूर्ण। दूसरा दस्तावेज़ पढ़ने के लिए फिर से 'इसे पढ़ें' कहें, या समाप्त करने के लिए 'रोकें' कहें।",
      noText: "मैं दस्तावेज़ से कोई पाठ नहीं पढ़ सका। सुनिश्चित करें कि दस्तावेज़ अच्छी तरह से रोशन है, फोकस में है, और फ्रेम में स्पष्ट रूप से स्थित है। पुनः प्रयास करें।",
      error: "दस्तावेज़ पढ़ते समय एक त्रुटि हुई। कृपया पुनः प्रयास करें।",
      notUnderstood: "मैं समझ नहीं पाया। दस्तावेज़ पढ़ने के लिए 'इसे पढ़ें' कहें, या रोकने के लिए 'रोकें' कहें।",
      openCameraFirst: "कृपया पहले कैमरा खोलें।",
      micPermission: "आवाज़ आदेशों का उपयोग करने के लिए कृपया माइक्रोफोन पहुंच की अनुमति दें।"
    },
    ui: {
      title: "MYi - आपका दस्तावेज़ पढ़ने वाला सहायक",
      subtitle: "मुद्रित और हस्तलिखित दस्तावेज़ पढ़ने में मदद करने वाला आवाज़-संचालित सहायक",
      overlayText: "दस्तावेज़ को फ्रेम के भीतर रखें",
      camera: "📷 कैमरा",
      closeCamera: "📷 कैमरा बंद करें",
      read: "📖 पढ़ें",
      stop: "⏹ रोकें"
    }
  }
};

// Get translation
function t(key) {
  const keys = key.split('.');
  let value = translations[currentLanguage];
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return key;
    }
  }
  return value || key;
}

// Update UI language
function updateUILanguage() {
  const lang = currentLanguage;
  
  // Update title and subtitle
  document.getElementById('app-title').textContent = translations[lang].ui.title;
  document.getElementById('app-subtitle').textContent = translations[lang].ui.subtitle;
  
  // Update elements with data attributes
  document.querySelectorAll('[data-en][data-hi]').forEach(el => {
    el.textContent = el.getAttribute(`data-${lang}`);
  });
  
  // Update buttons
  const cameraBtn = document.getElementById('camera-btn');
  const readBtn = document.getElementById('read-btn');
  const stopBtn = document.getElementById('stop-btn');
  
  if (cameraStream) {
    cameraBtn.textContent = translations[lang].ui.closeCamera;
  } else {
    cameraBtn.textContent = translations[lang].ui.camera;
  }
  readBtn.textContent = translations[lang].ui.read;
  stopBtn.textContent = translations[lang].ui.stop;
  
  // Update status if needed
  updateStatus(translations[lang].status.initializing, 'processing');
}

// Initialize Tesseract worker for better performance
async function initOCR() {
  try {
    // Close existing worker if any
    if (worker) {
      await worker.terminate();
      worker = null;
    }
    
    // Determine OCR language based on current language
    const ocrLang = currentLanguage === 'hi' ? 'hin' : 'eng';
    
    worker = await Tesseract.createWorker(ocrLang, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          updateStatus(t('status.processing'), 'processing');
        }
      }
    });
    
    // Configure for both printed and handwritten text
    if (currentLanguage === 'en') {
      await worker.setParameters({
        tessedit_pageseg_mode: '6', // Assume uniform block of text
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:()[]{}\'"-',
      });
    } else {
      // For Hindi, use default character set
      await worker.setParameters({
        tessedit_pageseg_mode: '6', // Assume uniform block of text
      });
    }
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
    
    // Try to use a more natural voice based on current language
    const voices = speechSynthesis.getVoices();
    let preferredVoice;
    
    if (currentLanguage === 'hi') {
      // Prefer Hindi voices
      preferredVoice = voices.find(v => 
        v.lang.includes('hi') && (v.name.includes('Hindi') || v.name.includes('hi-IN'))
      ) || voices.find(v => v.lang.includes('hi') || v.lang.includes('hi-IN'));
    } else {
      // Prefer English voices
      preferredVoice = voices.find(v => 
        v.lang.includes('en') && (v.name.includes('Samantha') || v.name.includes('Alex') || v.name.includes('Google'))
      ) || voices.find(v => v.lang.includes('en'));
    }
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      utterance.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-US';
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
  recognition.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    if (isBusy) {
      log('Ignoring voice command (busy)', 'system');
      return;
    }
    const transcript = e.results[e.resultIndex][0].transcript.trim();
    log(`User: "${transcript}"`, 'user');
    handleVoice(transcript);
  };

  recognition.onerror = (e) => {
    log(`Recognition error: ${e.error}`, 'error');
    if (e.error === 'no-speech') {
      updateStatus(t('status.listening'), 'listening');
    } else if (e.error === 'not-allowed') {
      updateStatus('Microphone permission denied', 'idle');
      speak(t('messages.micPermission'));
    } else if (e.error === 'aborted') {
      // Recognition was aborted, don't restart automatically
      log('Recognition aborted', 'system');
    } else if (e.error === 'network') {
      log('Network error in speech recognition', 'error');
      // Try to restart after a delay
      setTimeout(() => {
        if (!isBusy && recognition) {
          try {
            recognition.start();
          } catch (err) {
            log(`Failed to restart recognition: ${err.message}`, 'error');
          }
        }
      }, 2000);
    }
  };

  recognition.onstart = () => {
    updateStatus(t('status.listening'), 'listening');
    log('Voice recognition started successfully', 'system');
  };

  recognition.onend = () => {
    // Only restart if not busy and recognition object still exists
    if (!isBusy && recognition) {
      try {
        recognition.start();
      } catch (e) {
        // If recognition is already running or there's an error, log it
        if (e.message && !e.message.includes('already started')) {
          log(`Recognition restart error: ${e.message}`, 'error');
        }
      }
    }
  };

  try {
    recognition.start();
    log('Attempting to start microphone...', 'system');
  } catch (e) {
    log(`Failed to start recognition: ${e.message}`, 'error');
    updateStatus('Speech recognition error - check microphone permissions', 'idle');
    
    // If it's because recognition is already running, that's okay
    if (e.message && (e.message.includes('already started') || e.message.includes('already started'))) {
      log('Recognition already running', 'system');
      updateStatus(t('status.listening'), 'listening');
    } else {
      // Try again after a short delay
      setTimeout(() => {
        if (recognition && !isBusy) {
          try {
            recognition.start();
            log('Retrying to start recognition...', 'system');
          } catch (err) {
            log(`Recognition retry failed: ${err.message}`, 'error');
            updateStatus('Microphone access required for voice commands', 'idle');
            speak("Please allow microphone access to use voice commands. Click the microphone icon in your browser's address bar.");
          }
        }
      }, 1000);
    }
  }
}

// Enhanced voice command handler with natural language processing
async function handleVoice(transcript) {
  const text = transcript.toLowerCase().trim();
  log(`Processing command: "${text}"`, 'system');
  
  // Stop command - highest priority (both languages)
  const stopCommands = currentLanguage === 'hi' 
    ? ["रोकें", "रोक", "बंद करें", "stop", "cancel"]
    : ["stop", "cancel"];
  
  if (stopCommands.some(cmd => text.includes(cmd)) && (isBusy || speechSynthesis.speaking)) {
    log('Stop command detected', 'system');
    stopReading = true;
    speechSynthesis.cancel();
    isBusy = false;
    updateStatus(t('status.stopped'), 'idle');
    await speak(t('messages.stopped'), true);
    return;
  }

  // Help command
  const helpCommands = currentLanguage === 'hi'
    ? ["मदद", "help", "सहायता"]
    : ["help", "what can you do"];
  
  if (helpCommands.some(cmd => text.includes(cmd))) {
    log('Help command detected', 'system');
    await speak(t('messages.help'));
    return;
  }

  // Greeting/Start commands
  const startCommands = currentLanguage === 'hi'
    ? ["नमस्ते", "शुरू करें", "शुरू", "hello", "hi", "start", "begin"]
    : ["hello", "hi", "start", "begin"];
  
  if ((stage === "idle" || stage === "ready") && 
      startCommands.some(cmd => text.includes(cmd))) {
    log('Start command detected', 'system');
    stage = "ready";
    await speak(t('messages.hello'));
    return;
  }

  // Camera commands
  const cameraCommands = currentLanguage === 'hi'
    ? ["कैमरा खोलें", "कैमरा चालू करें", "कैमरा", "open camera", "turn on camera", "start camera", "camera"]
    : ["open camera", "turn on camera", "start camera", "camera"];
  
  if ((stage === "ready" || stage === "idle") && 
      cameraCommands.some(cmd => text.includes(cmd))) {
    log('Camera command detected', 'system');
    await openCam();
    return;
  }

  // Read commands
  const readCommands = currentLanguage === 'hi'
    ? ["पढ़ें", "इसे पढ़ें", "दस्तावेज़ पढ़ें", "read", "scan", "what does it say", "read it", "read document"]
    : ["read", "scan", "what does it say", "read it", "read document"];
  
  if ((stage === "camera_open" || stage === "ready") && 
      readCommands.some(cmd => text.includes(cmd))) {
    log('Read command detected', 'system');
    await readNow();
    return;
  }

  // If camera is open but command not recognized
  if (stage === "camera_open" && !isBusy) {
    log(`Command not recognized: "${text}"`, 'system');
    await speak(t('messages.notUnderstood'));
  } else if (stage === "idle" && !isBusy) {
    log(`Command not recognized in idle stage: "${text}"`, 'system');
  }
}

// Enhanced camera opening with better constraints
async function openCam() {
  if (isBusy) {
    await speak(t('messages.busy'));
    return;
  }

  try {
    updateStatus('Requesting camera access...', 'processing');
    await speak(t('messages.cameraOpening'));

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
    updateStatus(t('status.cameraReady'), 'listening');
    await speak(t('messages.cameraReady'));
    log('Camera opened successfully', 'system');
  } catch (e) {
    log(`Camera error: ${e.message}`, 'error');
    updateStatus('Camera error', 'idle');
    
    if (e.name === 'NotAllowedError') {
      await speak(t('messages.cameraDenied'));
    } else if (e.name === 'NotFoundError') {
      await speak(t('messages.noCamera'));
    } else {
      await speak(t('messages.cameraFailed'));
    }
  }
}

// Enhanced OCR with better image processing
async function readNow() {
  if (isBusy) {
    await speak(t('messages.alreadyProcessing'));
    return;
  }

  if (!cameraStream) {
    await speak(t('messages.cameraNotOpen'));
    return;
  }

  isBusy = true;
  stopReading = false;
  stage = "reading";
  
  updateStatus('Capturing image...', 'processing');
  await speak(t('messages.capturing'));

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
    
    // Reinitialize OCR if needed (will be done automatically by initOCR)
    if (!worker) {
      await initOCR();
    }
    
    // Determine OCR language based on current language
    const ocrLang = currentLanguage === 'hi' ? 'hin' : 'eng';
    
    // Use the initialized worker for better performance
    let result;
    if (worker) {
      result = await worker.recognize(imgData);
    } else {
      // Fallback to direct recognition
      result = await Tesseract.recognize(imgData, ocrLang, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            updateStatus(t('status.processing'), 'processing');
          }
        }
      });
    }

    const text = result.data.text.trim();
    log(`OCR Result: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`, 'assistant');

    if (stopReading) {
      await speak(t('messages.stopped'));
      isBusy = false;
      stage = "camera_open";
      updateStatus(t('status.cameraReady'), 'listening');
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
        await speak(t('messages.readingComplete'));
      }
    } else {
      await speak(t('messages.noText'));
    }
  } catch (e) {
    log(`OCR Error: ${e.message}`, 'error');
    await speak(t('messages.error'));
  } finally {
    isBusy = false;
    if (stage === "reading") {
      stage = "camera_open";
    }
    updateStatus(t('status.cameraReady'), 'listening');
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
      updateStatus(t('status.cameraClosed'), 'idle');
      await speak(t('messages.cameraClosed'));
      cameraBtn.textContent = t('ui.camera');
    } else {
      await openCam();
      cameraBtn.textContent = t('ui.closeCamera');
    }
  });

  readBtn.addEventListener('click', async () => {
    if (cameraStream) {
      await readNow();
    } else {
      await speak(t('messages.openCameraFirst'));
    }
  });

  stopBtn.addEventListener('click', async () => {
    stopReading = true;
    speechSynthesis.cancel();
    isBusy = false;
    updateStatus(t('status.stopped'), 'idle');
    await speak(t('messages.stopped'), true);
  });
  
  // Language selector
  const langSelect = document.getElementById('lang-select');
  langSelect.addEventListener('change', async (e) => {
    const newLang = e.target.value;
    if (newLang !== currentLanguage) {
      currentLanguage = newLang;
      
      // Restart recognition with new language
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
        recognition.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-US';
        
        // Restart after a brief delay
        setTimeout(() => {
          if (!isBusy) {
            try {
              recognition.start();
            } catch (e) {
              log(`Recognition restart error: ${e.message}`, 'error');
            }
          }
        }, 500);
      }
      
      // Reinitialize OCR with new language
      await initOCR();
      
      // Update UI
      updateUILanguage();
      
      log(`Language switched to ${currentLanguage === 'hi' ? 'Hindi' : 'English'}`, 'system');
    }
  });

  // Initialize
  updateStatus(t('status.initializing'), 'processing');
  log('MYi Document Reading Assistant starting...', 'system');
  
  // Wait for voices to load, but also start mic immediately
  // Some browsers don't fire onvoiceschanged event
  startMic();
  initOCR();
  
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {
      // Voices loaded, but mic should already be started
      log('Voices loaded', 'system');
    };
  }
  
  // Welcome message
  setTimeout(async () => {
    await speak(t('messages.welcome'));
    updateStatus(t('status.ready'), 'listening');
  }, 1000);
});

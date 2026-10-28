(() => {
  const DETECTION_INTERVAL_MS = 1500;
  const ABSENCE_GRACE_MS = 2500;

  let generation = 0;
  let isStarting = false;
  let stream = null;
  let video = null;
  let frameTimer = null;
  let worker = null;
  let frameCanvas = null;
  let frameContext = null;
  let workerReady = false;
  let frameInFlight = false;
  let isPresent = false;
  let consecutiveFaceFrames = 0;
  let lastSeenAt = 0;

  const preview = document.createElement('video');
  preview.autoplay = true;
  preview.muted = true;
  preview.playsInline = true;
  preview.setAttribute('aria-label', 'Live camera preview');
  preview.style.cssText = [
    'display:block', 'width:240px', 'height:150px', 'max-width:100%',
    'object-fit:cover', 'background:#09080d', 'border:1px solid #373448',
    'border-radius:9px'
  ].join(';');

  const status = document.createElement('aside');
  status.setAttribute('aria-label', 'Camera preview');
  status.style.cssText = [
    'position:fixed', 'left:16px', 'bottom:16px', 'z-index:10000',
    'width:240px', 'max-width:calc(100vw - 32px)', 'line-height:0',
    'pointer-events:none'
  ].join(';');

  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'nav-btn camera-control';
  control.textContent = 'Start camera';
  control.title = 'Start presence camera';

  status.appendChild(preview);
  document.body.appendChild(status);
  const adminNav = document.getElementById('nav-admin-btn')?.parentElement;
  const adminNavButton = document.getElementById('nav-admin-btn');
  if (adminNav && adminNavButton) adminNav.insertBefore(control, adminNavButton.nextSibling);
  else document.querySelector('.brand-section')?.appendChild(control);

  function publishPresence(present) {
    if (isPresent === present) return;
    isPresent = present;
    window.echoServeUserPresent = present;
    window.dispatchEvent(new CustomEvent('echoserve:presence-change', { detail: { present } }));
  }

  function setStatus(text) {
    control.title = text;
  }

  function releaseCamera() {
    if (frameTimer !== null) window.clearTimeout(frameTimer);
    frameTimer = null;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    if (video) video.srcObject = null;
    preview.srcObject = null;
    video = null;
    if (worker) worker.terminate();
    worker = null;
    frameCanvas = frameContext = null;
    workerReady = false;
    frameInFlight = false;
    consecutiveFaceFrames = 0;
    lastSeenAt = 0;
    publishPresence(false);
  }

  function reportWorkerError(runId, error){
    if (runId !== generation) return;
    isStarting = false;
    frameInFlight = false;
    if (frameTimer !== null) window.clearTimeout(frameTimer);
    frameTimer = null;
    if (worker) worker.terminate();
    worker = null;
    workerReady = false;
    setStatus(error?.message || 'Background face detector failed to load.');
    control.textContent = stream ? 'Retry detector' : 'Retry camera';
    console.error('Presence detector error:', error);
  }

  function scheduleFrame(runId){
    if (runId !== generation || !worker || !workerReady || !video || !frameCanvas || !frameContext) return;
    frameTimer = window.setTimeout(async () => {
      frameTimer = null;
      if (runId !== generation || !worker || !workerReady || frameInFlight) return;
      try {
        frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
        frameInFlight = true;
        const bitmap = await createImageBitmap(frameCanvas);
        if (runId !== generation || !worker){
          bitmap.close();
          frameInFlight = false;
          return;
        }
        worker.postMessage({ type: 'frame', bitmap }, [bitmap]);
      } catch (error){
        frameInFlight = false;
        console.warn('Could not send camera frame to detector:', error);
        scheduleFrame(runId);
      }
    }, DETECTION_INTERVAL_MS);
  }

  function handleDetectionResult(present){
    if (present){
      consecutiveFaceFrames += 1;
      lastSeenAt = Date.now();
      if (!isPresent && consecutiveFaceFrames >= 2){
        publishPresence(true);
        setStatus('User detected — opening the assistant.');
      }
    } else {
      consecutiveFaceFrames = 0;
      if (isPresent && Date.now() - lastSeenAt >= ABSENCE_GRACE_MS){
        publishPresence(false);
        setStatus('No face detected — waiting for a user.');
      }
    }
  }

  async function startDetection() {
    const runId = ++generation;
    isStarting = true;
    setStatus('Requesting camera permission…');
    control.textContent = 'Pause camera';

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires a supported browser and a secure local page.');
      }
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 8, max: 10 }
        }
      });
      if (runId !== generation) {
        cameraStream.getTracks().forEach(track => track.stop());
        return;
      }
      stream = cameraStream;

      video = preview;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();

      frameCanvas = document.createElement('canvas');
      frameCanvas.width = 240;
      frameCanvas.height = 180;
      frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
      if (!frameContext) throw new Error('Could not create a camera frame.');

      worker = new Worker(new URL('./presence_worker.js?v=11', import.meta.url));
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'ready'){
          workerReady = true;
          isStarting = false;
          setStatus(data.message || 'No face detected — waiting for a user.');
          scheduleFrame(runId);
        } else if (data.type === 'progress'){
          setStatus(data.message || 'Loading background face detector…');
        } else if (data.type === 'result'){
          frameInFlight = false;
          handleDetectionResult(data.present);
          scheduleFrame(runId);
        } else if (data.type === 'error'){
          reportWorkerError(runId, new Error(data.message || 'Face detection failed.'));
        }
      };
      worker.onerror = (error) => {
        reportWorkerError(runId, new Error('Background face detector worker failed to load.'));
      };
      worker.addEventListener('messageerror', () => {
        reportWorkerError(runId, new Error('Could not read a message from the face detector.'));
      });
      const workerTimeout = window.setTimeout(() => {
        if (!workerReady && runId === generation){
          reportWorkerError(runId, new Error('OpenCV took too long to initialize. Check your connection, then retry.'));
        }
      }, 65000);
      worker.addEventListener('message', (event) => {
        if (event.data?.type === 'ready' || event.data?.type === 'error') window.clearTimeout(workerTimeout);
      });
      setStatus('Loading background face detector…');
      worker.postMessage({ type: 'init' });
    } catch (error) {
      if (runId !== generation) return;
      isStarting = false;
      releaseCamera();
      control.textContent = 'Retry camera';
      setStatus(error?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access and retry.'
        : (error?.message || 'Presence detection could not start.'));
      console.error('Presence detection failed:', error);
    }
  }

  control.addEventListener('click', () => {
    if ((stream || isStarting) && workerReady){
      generation += 1;
      isStarting = false;
      releaseCamera();
      control.textContent = 'Resume camera';
      setStatus('Presence detection paused.');
    } else if (stream && worker === null){
      generation += 1;
      isStarting = false;
      releaseCamera();
      control.textContent = 'Retry camera';
      startDetection();
    } else if (isStarting){
      generation += 1;
      isStarting = false;
      releaseCamera();
      control.textContent = 'Retry camera';
      setStatus('Presence detection stopped.');
    } else {
      startDetection();
    }
  });

  window.echoServeUserPresent = false;
  if (window.echoServeAuthenticated) startDetection();
  else window.addEventListener('echoserve:authenticated', startDetection, { once: true });
})();

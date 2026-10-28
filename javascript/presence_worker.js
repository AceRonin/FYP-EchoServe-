const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js';
const CASCADE_URL = 'https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_frontalface_default.xml';
const CASCADE_FILE = 'haarcascade_frontalface_default.xml';
const OPENCV_LOAD_TIMEOUT_MS = 55000;

let cvLib = null;
let classifier = null;
let canvas = null;
let context = null;

async function loadOpenCv(){
  self.postMessage({ type: 'progress', message: 'Downloading OpenCV runtime…' });
  if (self.cv?.Mat) return { cv: self.cv };
  try {
    self.postMessage({ type: 'progress', message: 'Loading OpenCV runtime…' });
    importScripts(OPENCV_URL);
    self.postMessage({ type: 'progress', message: 'OpenCV script loaded; initializing WebAssembly…' });
  } catch (error){
    throw new Error(`Could not load OpenCV.js: ${error?.message || error}`);
  }

  const cvModule = self.cv;
  if (!cvModule) throw new Error('OpenCV.js loaded without creating its runtime.');
  if (cvModule.Mat || cvModule.calledRun) return { cv: cvModule };

  // OpenCV's custom thenable signals runtime readiness. Resolve with a plain
  // wrapper because resolving directly with cv recursively assimilates it.
  let runtimeTimer;
  const runtimeReady = new Promise((resolve, reject) => {
    runtimeTimer = setTimeout(() => reject(new Error('OpenCV.js runtime initialization timed out.')), OPENCV_LOAD_TIMEOUT_MS);
    const onReady = (module) => {
      clearTimeout(runtimeTimer);
      resolve({ cv: module || cvModule });
    };
    if (typeof cvModule.then === 'function') cvModule.then(onReady);
    else cvModule.onRuntimeInitialized = () => onReady(cvModule);
  });
  const { cv: loadedCv } = await runtimeReady;
  if (!loadedCv?.Mat) throw new Error('OpenCV.js finished loading without initializing its runtime.');
  return { cv: loadedCv };
}

async function initialize(){
  self.postMessage({ type: 'progress', message: 'Loading face detector and OpenCV…' });
  const modelPromise = fetch(CASCADE_URL, { signal: AbortSignal.timeout(20000) });
  modelPromise.catch(() => {});
  const [cvResult, response] = await Promise.all([loadOpenCv(), modelPromise]);
  const loadedCv = cvResult.cv;
  cvLib = loadedCv;
  self.postMessage({ type: 'progress', message: 'Preparing face detector model…' });
  if (!response.ok) throw new Error(`Face model download failed (${response.status}).`);
  if (typeof cvLib.CascadeClassifier !== 'function'){
    throw new Error('Loaded OpenCV build does not include the face-detection classifier.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  cvLib.FS_createDataFile('/', CASCADE_FILE, bytes, true, false, false);

  classifier = new cvLib.CascadeClassifier();
  if (!classifier.load(CASCADE_FILE)){
    classifier.delete();
    classifier = null;
    throw new Error('OpenCV could not load the face detector model.');
  }

  canvas = new OffscreenCanvas(240, 180);
  context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create the camera frame processor.');
  self.postMessage({ type: 'ready', message: 'No face detected — waiting for a user.' });
}

function detect(bitmap){
  try {
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const rgba = cvLib.matFromImageData(imageData);
    const gray = new cvLib.Mat();
    const faces = new cvLib.RectVector();
    const minFaceSize = new cvLib.Size(18, 18);

    try {
      cvLib.cvtColor(rgba, gray, cvLib.COLOR_RGBA2GRAY);
      cvLib.equalizeHist(gray, gray);
      classifier.detectMultiScale(gray, faces, 1.1, 3, 0, minFaceSize);
      self.postMessage({ type: 'result', present: faces.size() > 0 });
    } finally {
      rgba.delete();
      gray.delete();
      faces.delete();
      minFaceSize.delete?.();
    }
  } catch (error){
    self.postMessage({ type: 'error', message: error?.message || 'Face detection failed.' });
  } finally {
    bitmap.close();
  }
}

self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'init'){
    try {
      await initialize();
    } catch (error){
      self.postMessage({ type: 'error', message: error?.message || 'Could not initialize face detection.' });
    }
  } else if (data.type === 'frame' && classifier){
    detect(data.bitmap);
  } else if (data.type === 'frame'){
    data.bitmap?.close();
  }
});

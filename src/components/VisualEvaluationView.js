import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analyzeVisualReactions } from '../services/visionAnalysis';
import './VisualEvaluationView.css';

const MAX_IMAGES = 20;
const CAPTURE_INTERVAL_MS = 3000; // Capture every 3 seconds (up to 20 images in ~1 min)

export default function VisualEvaluationView({ video, channelTitle, onStartInterview, onBack }) {
  const [step, setStep] = useState('permission'); // permission | capturing | analyzing | report
  const [capturedCount, setCapturedCount] = useState(0);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const imagesRef = useRef([]);

  const videoId = video?.video_id || (video?.video_url && video.video_url.match(/v=([^&]+)/)?.[1]);
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : '';

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const requestCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setStep('capturing');
    } catch (e) {
      setError('Camera permission denied. Please allow camera access to use visual evaluation.');
    }
  };

  // Start capture after video/canvas are in DOM (when step becomes 'capturing')
  useEffect(() => {
    if (step !== 'capturing' || !streamRef.current) return;

    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl) return;

    // Attach stream to video element (it exists now)
    videoEl.srcObject = streamRef.current;

    const runAnalysis = async (imgs) => {
      setStep('analyzing');
      try {
        const text = await analyzeVisualReactions(imgs, video?.title);
        setReport(text);
        setStep('report');
      } catch (e) {
        setError(e.message || 'Analysis failed');
        setStep('capturing');
      }
    };

    const captureFrame = () => {
      const images = imagesRef.current;
      if (images.length >= MAX_IMAGES) return;
      if (!videoEl.videoWidth || !videoEl.videoHeight) return; // Wait for video to be ready
      const ctx = canvasEl.getContext('2d');
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0);
      const dataUrl = canvasEl.toDataURL('image/jpeg', 0.8);
      images.push({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      setCapturedCount(images.length);
      if (images.length >= MAX_IMAGES) {
        stopCamera();
        runAnalysis([...images]);
      }
    };

    imagesRef.current = [];
    setCapturedCount(0);

    const tryCapture = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        captureFrame();
        intervalRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
      } else {
        setTimeout(tryCapture, 200);
      }
    };

    // Wait for video to have dimensions (camera stream loaded), then start capture
    let timeoutId;
    const startWhenReady = () => {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        tryCapture();
      } else {
        videoEl.addEventListener('loadeddata', tryCapture, { once: true });
        videoEl.addEventListener('loadedmetadata', tryCapture, { once: true });
        timeoutId = setTimeout(() => {
          if (imagesRef.current.length === 0) tryCapture();
        }, 500);
      }
    };
    startWhenReady();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [step, video?.title, stopCamera]);

  const handleStartEvaluation = () => {
    requestCamera();
  };

  const handleStartInterview = () => {
    stopCamera();
    onStartInterview({
      video,
      channelTitle,
      visualEvaluation: report,
    });
  };

  return (
    <div className="visual-eval-view">
      <button type="button" className="visual-eval-back" onClick={onBack}>
        ← Back to video list
      </button>

      <div className="visual-eval-header">
        <h2>Visual Evaluation</h2>
        <p className="visual-eval-video-title">{video?.title}</p>
      </div>

      {step === 'permission' && (
        <div className="visual-eval-step">
          <p>Click below to enable your camera. While watching the video, up to 20 images will be captured automatically for visual analysis.</p>
          <button type="button" className="visual-eval-btn primary" onClick={handleStartEvaluation}>
            Start Visual Evaluation
          </button>
        </div>
      )}

      {(step === 'capturing' || step === 'analyzing') && (
        <div className="visual-eval-layout">
          <div className="visual-eval-video-area">
            <h4>Video Player</h4>
            <div className="video-embed-wrap">
              <iframe
                title="YouTube"
                src={embedUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
          <div className="visual-eval-camera-area">
            <h4>Camera</h4>
            <div className="camera-preview-wrap">
              <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
            <p className="capture-status">
              {step === 'capturing'
                ? `Captured ${capturedCount}/${MAX_IMAGES} images…`
                : 'Analyzing…'}
            </p>
          </div>
        </div>
      )}

      {step === 'report' && (
        <div className="visual-eval-report">
          <h3>Visual Evaluation Report</h3>
          <div className="report-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
          </div>
          <button type="button" className="visual-eval-btn primary" onClick={handleStartInterview}>
            Start Interview
          </button>
        </div>
      )}

      {error && <p className="visual-eval-error">{error}</p>}
    </div>
  );
}

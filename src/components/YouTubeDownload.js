import { useState, useCallback } from 'react';
import VisualEvaluationView from './VisualEvaluationView';
import './YouTubeDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeDownload({ onBack, onStartInterview }) {
  const [channelUrl, setChannelUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [result, setResult] = useState(null);
  const [downloadReady, setDownloadReady] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  const handleDownload = useCallback(async () => {
    setError('');
    setInfoMessage('');
    setResult(null);
    setLoading(true);
    setProgress(0);
    setStage('Connecting...');
    setDownloadReady(false);

    let gotResult = false;
    try {
      const url = `${API}/api/youtube/channel?url=${encodeURIComponent(channelUrl)}&maxVideos=${Math.min(Math.max(parseInt(maxVideos, 10) || 10, 1), 100)}`;
      const res = await fetch(url);

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data.optional && data.message) {
          setInfoMessage(data.message);
          setLoading(false);
          setStage('');
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || res.statusText || 'Download failed');
        }
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || res.statusText || 'Download failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const obj = JSON.parse(line.slice(6));
              if (obj.error) throw new Error(obj.error);
              if (obj.progress !== undefined) setProgress(obj.progress);
              if (obj.stage) setStage(obj.stage);
              if (obj.done && obj.data) {
                setResult(obj.data);
                setDownloadReady(true);
                gotResult = true;
              }
            } catch (e) {
              if (e.message && e.message !== 'Unexpected end of JSON input') {
                throw e;
              }
            }
          }
        }
      }
      if (!gotResult) {
        throw new Error('Incomplete response from server. Check that YouTube API key is configured.');
      }
    } catch (err) {
      setError(err.message || 'Download failed');
    } finally {
      setLoading(false);
      setStage('');
    }
  }, [channelUrl, maxVideos]);

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(result.channel_title || 'channel').replace(/[^a-z0-9]/gi, '_')}_channel_data.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="youtube-download">
      <div className="youtube-download-card">
        <button type="button" className="youtube-back-btn" onClick={onBack}>
          ← Back to Chat
        </button>
        <h1 className="youtube-title">YouTube Channel Download</h1>
        <p className="youtube-subtitle">
          Download metadata for channel videos including title, description, duration,
          view count, like count, comment count, and video URL.
        </p>

        <div className="youtube-form">
          <label>
            Channel URL
            <input
              type="url"
              placeholder="https://www.youtube.com/@veritasium"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              disabled={loading}
            />
          </label>
          <label>
            Max videos (1–100)
            <input
              type="number"
              min={1}
              max={100}
              value={maxVideos}
              onChange={(e) => setMaxVideos(e.target.value)}
              disabled={loading}
            />
          </label>
        </div>

        {error && <p className="youtube-error">{error}</p>}
        {infoMessage && <p className="youtube-info">{infoMessage}</p>}

        {loading && (
          <div className="youtube-progress-wrap">
            <div className="youtube-progress-bar">
              <div className="youtube-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="youtube-stage">{stage}</p>
          </div>
        )}

        <div className="youtube-actions">
          <button
            type="button"
            className="youtube-download-btn"
            onClick={handleDownload}
            disabled={loading}
          >
            {loading ? 'Downloading...' : 'Download Channel Data'}
          </button>
          {downloadReady && result && (
            <button
              type="button"
              className="youtube-json-btn"
              onClick={handleDownloadJson}
            >
              Download JSON File
            </button>
          )}
        </div>

        {result && (
          <div className="youtube-summary">
            <h3>Download complete</h3>
            <p>
              <strong>{result.channel_title}</strong> — {result.video_count} videos
            </p>
            <p className="youtube-summary-hint">Scroll down and click a video to enter visual evaluation:</p>
            <ul className="video-list">
              {(result.videos || []).map((v, i) => (
                <li
                  key={v.video_id || i}
                  onClick={() => setSelectedVideo(v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedVideo(v)}
                >
                  <span className="video-list-title">{v.title || `Video ${i + 1}`}</span>
                  <span className="video-list-meta">
                    {v.view_count != null && `${(v.view_count / 1000).toFixed(1)}K views`}
                    {v.release_date && ` · ${new Date(v.release_date).toLocaleDateString()}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selectedVideo && (
        <div className="youtube-visual-eval-section">
          <VisualEvaluationView
            video={selectedVideo}
            channelTitle={result?.channel_title}
            onStartInterview={(ctx) => {
              setSelectedVideo(null);
              onStartInterview?.(ctx);
            }}
            onBack={() => setSelectedVideo(null)}
          />
        </div>
      )}
    </div>
  );
}

export default function VideoCard({ title, thumbnail, url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="video-card"
    >
      {thumbnail && (
        <div className="video-card-thumb">
          <img src={thumbnail} alt="" />
        </div>
      )}
      <div className="video-card-body">
        <span className="video-card-title">{title || 'Watch on YouTube'}</span>
        <span className="video-card-hint">Opens in new tab →</span>
      </div>
    </a>
  );
}

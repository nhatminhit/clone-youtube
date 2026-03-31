import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { formatViewCount, formatDuration, formatTimeAgo } from '../../utils/format';
import { getCombinedWatchData } from '../../api';
import './VideoCard.css';

export default function VideoCard({ video, index = 0 }) {
    const prefetchTimerRef = useRef(null);

    const handleMouseEnter = () => {
        // Prefetch after 400ms hover
        prefetchTimerRef.current = setTimeout(() => {
            getCombinedWatchData(video.id).catch(() => { });
        }, 400);
    };

    const handleMouseLeave = () => {
        if (prefetchTimerRef.current) {
            clearTimeout(prefetchTimerRef.current);
        }
    };

    return (
        <Link
            to={`/watch/${video.id}`}
            state={{ initialData: video }}
            className="video-card fade-in"
            id={`video-card-${video.id}`}
            style={{ animationDelay: `${index * 50}ms` }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="video-card__thumbnail-wrap">
                <img
                    className="video-card__thumbnail"
                    src={video.thumbnail}
                    alt={video.title}
                    loading="lazy"
                />
                {video.duration && (
                    <span className="video-card__duration">{formatDuration(video.duration)}</span>
                )}
                <div className="video-card__overlay">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
            </div>

            <div className="video-card__info">
                <div className="video-card__channel-avatar">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                    </svg>
                </div>
                <div className="video-card__details">
                    <h3 className="video-card__title">{video.title}</h3>
                    <p className="video-card__channel">{video.channelTitle}</p>
                    <p className="video-card__meta">
                        {video.statistics && (
                            <span>{formatViewCount(video.statistics.viewCount)} views</span>
                        )}
                        {video.publishedAt && (
                            <>
                                <span className="video-card__dot">•</span>
                                <span>{formatTimeAgo(video.publishedAt)}</span>
                            </>
                        )}
                    </p>
                </div>
            </div>
        </Link>
    );
}

import { useState, useEffect } from 'react';
import { getTrending, getCombinedWatchData } from '../../api';
import VideoCard from '../../components/VideoCard/VideoCard';
import './Home.css';

const CATEGORIES = [
    'All', 'Music', 'Gaming', 'News', 'Sports', 'Entertainment',
    'Education', 'Science', 'Technology', 'Comedy', 'Film',
];

export default function Home() {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('All');
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                let data;
                if (activeCategory === 'All') {
                    data = await getTrending('VN', 24);
                } else {
                    // Fetch by search query for specific categories
                    const { searchVideos } = await import('../../api');
                    data = await searchVideos(activeCategory, 24);
                }

                if (!cancelled) {
                    const videoItems = data.items || [];
                    setVideos(videoItems);

                    // Prefetch top 5 videos in background
                    if (videoItems.length > 0) {
                        videoItems.slice(0, 5).forEach(v => {
                            // Delay a bit to not block main thread
                            setTimeout(() => {
                                getCombinedWatchData(v.id).catch(() => { });
                            }, 2000);
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to load videos:', err);
                if (!cancelled) {
                    setError('Failed to load videos. Make sure the backend server is running.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [activeCategory]);

    return (
        <div className="home" id="home-page">
            {/* Category chips */}
            <div className="home__categories">
                <div className="home__categories-scroll">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            className={`home__chip ${activeCategory === cat ? 'home__chip--active' : ''}`}
                            onClick={() => setActiveCategory(cat)}
                            id={`chip-${cat.toLowerCase()}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="home__error">
                    <div className="home__error-icon">⚠️</div>
                    <h2>Connection Error</h2>
                    <p>{error}</p>
                    <button className="home__error-btn" onClick={() => window.location.reload()}>
                        Retry
                    </button>
                </div>
            )}

            {/* Loading skeletons */}
            {loading && (
                <div className="home__grid">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div className="video-card-skeleton" key={i}>
                            <div className="video-card-skeleton__thumb skeleton" />
                            <div className="video-card-skeleton__info">
                                <div className="video-card-skeleton__avatar skeleton" />
                                <div className="video-card-skeleton__lines">
                                    <div className="video-card-skeleton__line skeleton" />
                                    <div className="video-card-skeleton__line video-card-skeleton__line--short skeleton" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Video grid */}
            {!loading && !error && (
                <div className="home__grid">
                    {videos.map((video, i) => (
                        <VideoCard key={video.id} video={video} index={i} />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && videos.length === 0 && (
                <div className="home__empty">
                    <svg width="120" height="120" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                    </svg>
                    <h2>No videos found</h2>
                    <p>Try searching for something or check back later.</p>
                </div>
            )}
        </div>
    );
}

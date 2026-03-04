import { useState, useEffect } from 'react';
import { getTrending } from '../../api';
import VideoCard from '../../components/VideoCard/VideoCard';
import './Trending.css';

const REGIONS = [
    { code: 'VN', name: '🇻🇳 Vietnam' },
    { code: 'US', name: '🇺🇸 United States' },
    { code: 'JP', name: '🇯🇵 Japan' },
    { code: 'KR', name: '🇰🇷 Korea' },
    { code: 'GB', name: '🇬🇧 United Kingdom' },
    { code: 'IN', name: '🇮🇳 India' },
];

export default function Trending() {
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [region, setRegion] = useState('VN');
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const data = await getTrending(region, 24);
                if (!cancelled) {
                    setVideos(data.items || []);
                }
            } catch (err) {
                console.error('Failed to load trending:', err);
                if (!cancelled) {
                    setError('Failed to load trending videos.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [region]);

    return (
        <div className="trending" id="trending-page">
            <div className="trending__header">
                <div className="trending__title-row">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent-primary)">
                        <path d="M17.53 11.2c-.23-.3-.51-.56-.80-.78-.55-.4-.74-.45-1.08-.63-1.09-.62-2.47-1.01-2.85-2.18-.04-.14-.08-.28-.08-.44 0-.21.04-.41.11-.6-.24.37-.42.8-.42 1.28 0 1.54 1.13 2.79 2.53 3.08.5.1 1.04.13 1.53-.03.48-.17.88-.49 1.15-.9.13-.2.23-.42.3-.66-.07.26-.22.51-.39.66z" />
                        <path d="M7.47 21.5C4.2 19.93 1.86 16.76 1.5 13 .92 9.02 3.45 5.34 7.27 4.14c.05-.02.1-.02.16 0 .05.02.09.05.12.1l.71 1.05c.06.09.12.19.18.29C9.05 6.73 9.75 7.89 10.64 9c.67.84 1.11 1.82 1.27 2.87.14.95.04 1.93-.28 2.84-.04.12-.1.24-.17.34 0-1.88-1.15-3.58-2.93-4.26-.46-.18-.97-.26-1.47-.24-.87.04-1.69.39-2.32.99-.94.91-1.38 2.33-1.13 3.58.36 1.81 1.18 3.4 2.33 4.65.17.18.35.35.53.51z" />
                    </svg>
                    <h1>Trending</h1>
                </div>

                <div className="trending__regions">
                    {REGIONS.map((r) => (
                        <button
                            key={r.code}
                            className={`trending__region-btn ${region === r.code ? 'trending__region-btn--active' : ''}`}
                            onClick={() => setRegion(r.code)}
                            id={`region-${r.code.toLowerCase()}`}
                        >
                            {r.name}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="trending__error">
                    <p>{error}</p>
                </div>
            )}

            {loading ? (
                <div className="trending__grid">
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
            ) : (
                <div className="trending__grid">
                    {videos.map((video, i) => (
                        <VideoCard key={video.id} video={video} index={i} />
                    ))}
                </div>
            )}
        </div>
    );
}

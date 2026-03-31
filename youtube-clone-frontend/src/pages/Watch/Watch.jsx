import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { getVideoDetails, getRelatedVideos, getCombinedWatchData } from '../../api';
import { formatViewCount, formatTimeAgo, formatDuration } from '../../utils/format';
import { usePlayer } from '../../context/PlayerContext';
import './Watch.css';

export default function Watch() {
    const { id } = useParams();
    const location = useLocation();
    const { playVideo, toggleMiniMode, setPortalTarget, portalTarget } = usePlayer();
    const [videoDetails, setVideoDetails] = useState(location.state?.initialData || null);
    const [relatedVideos, setRelatedVideos] = useState([]);
    const [loading, setLoading] = useState(!videoDetails);
    const [descExpanded, setDescExpanded] = useState(false);

    // Initial load and sync with global player
    useEffect(() => {
        if (!id) return;
        let cancelled = false;

        // If we have initial data from location state or cache, start playing immediately
        if (videoDetails && videoDetails.id === id) {
            document.title = `${videoDetails.title} - YouTube Premium Clone`;
            playVideo({ ...videoDetails, id });
        }

        async function load() {
            // Only show loading skeleton if we have NO data at all
            if (!videoDetails || videoDetails.id !== id) {
                setLoading(true);
            }
            
            setDescExpanded(false);
            try {
                const data = await getCombinedWatchData(id);

                if (!cancelled) {
                    setVideoDetails(data.details);
                    
                    // Lịch sử xem (LocalStorage)
                    const history = JSON.parse(localStorage.getItem('yt_history') || '[]');
                    const newEntry = { 
                        id, 
                        title: data.details.title, 
                        thumbnail: data.details.thumbnail,
                        thumbnailHigh: data.details.thumbnailHigh,
                        channelTitle: data.details.channelTitle,
                        watchedAt: new Date().toISOString()
                    };
                    const filtered = history.filter(item => item.id !== id).slice(0, 49);
                    localStorage.setItem('yt_history', JSON.stringify([newEntry, ...filtered]));

                    // Lazy load related videos
                    getRelatedVideos(id, 15).then(res => {
                        if (!cancelled) setRelatedVideos(res.items || []);
                    });

                    if (data.details && data.details.title) {
                        document.title = `${data.details.title} - YouTube Premium Clone`;
                        // Notify global player with full data (stream, sponsors)
                        playVideo({
                            ...data.details,
                            id,
                            preloadedStream: data.stream,
                            preloadedSponsors: data.sponsors
                        });
                    }
                }
            } catch (err) {
                console.error('Failed to load video:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return () => { cancelled = true; };
    }, [id, playVideo]); // Removed videoDetails from deps to avoid loop; logic handles it.

    // Handle entering/exiting mini mode based on route
    useEffect(() => {
        const isWatchPage = location.pathname.startsWith('/watch/');
        if (isWatchPage) {
            toggleMiniMode(false);
            // Move player to anchor
            const anchor = document.getElementById('watch-player-anchor');
            if (anchor) setPortalTarget(anchor);
        }
        return () => setPortalTarget(null);
    }, [location.pathname, toggleMiniMode, setPortalTarget]);

    return (
        <div className="watch" id="watch-page">
            <div className="watch__main">
                <div className="watch__player-outer">
                    <div className="watch__player-wrap" id="watch-player-anchor">
                        {/* Ẩn trình giữ chỗ nếu đã có nội dung player được dịch chuyển vào đây */}
                        {!portalTarget && <div className="watch__player-placeholder" />}
                    </div>
                </div>

                {/* Video Info */}
                {loading ? (
                    <div className="watch__info-skeleton">
                        <div className="skeleton" style={{ height: 28, width: '70%', marginBottom: 12 }} />
                        <div className="skeleton" style={{ height: 18, width: '40%', marginBottom: 8 }} />
                        <div className="skeleton" style={{ height: 14, width: '30%' }} />
                    </div>
                ) : videoDetails ? (
                    <div className="watch__info fade-in">
                        <h1 className="watch__title" id="video-title">{videoDetails.title}</h1>

                        <div className="watch__meta-row">
                            <div className="watch__channel">
                                <Link to={`/channel/${videoDetails.channelId}`} className="watch__channel-link">
                                    <div className="watch__channel-avatar">
                                        <img
                                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(videoDetails.channelTitle)}&background=random&color=fff`}
                                            alt={videoDetails.channelTitle}
                                        />
                                    </div>
                                    <div className="watch__channel-info">
                                        <span className="watch__channel-name">{videoDetails.channelTitle}</span>
                                        <span className="watch__sub-count">1.2M subscribers</span>
                                    </div>
                                </Link>
                                <button className="watch__subscribe-btn" id="subscribe-btn">Subscribe</button>
                            </div>

                            <div className="watch__actions">
                                <button className="watch__action-btn" id="like-btn">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z" />
                                    </svg>
                                    <span>{videoDetails.statistics ? formatViewCount(videoDetails.statistics.likeCount) : ''}</span>
                                </button>
                                <button className="watch__action-btn" id="share-btn">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
                                    </svg>
                                    <span>Share</span>
                                </button>
                                <button className="watch__action-btn" id="save-btn">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
                                    </svg>
                                    <span>Save</span>
                                </button>
                            </div>
                        </div>

                        {/* Stats & Description */}
                        <div className="watch__details-box" onClick={() => !descExpanded && setDescExpanded(true)}>
                            <div className="watch__stats">
                                {videoDetails.statistics && (
                                    <span>{formatViewCount(videoDetails.statistics.viewCount)} views</span>
                                )}
                                {videoDetails.publishedAt && (
                                    <span>{formatTimeAgo(videoDetails.publishedAt)}</span>
                                )}
                            </div>
                            <div className={`watch__description ${descExpanded ? 'watch__description--expanded' : ''}`}>
                                {videoDetails.description}
                            </div>
                            {videoDetails.description && videoDetails.description.length > 100 && (
                                <button
                                    className="watch__desc-toggle"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDescExpanded(!descExpanded);
                                    }}
                                >
                                    {descExpanded ? 'Show less' : '...more'}
                                </button>
                            )}
                        </div>

                        {/* Comments Placeholder */}
                        <div className="watch__comments-section">
                            <div className="watch__comments-header">
                                <h3>{videoDetails.statistics?.commentCount ? `${formatViewCount(videoDetails.statistics.commentCount)} Comments` : 'Comments'}</h3>
                            </div>
                            <div className="watch__comment-input-row">
                                <div className="watch__comment-avatar">
                                    <img src="https://ui-avatars.com/api/?name=User&background=272727&color=fff" alt="User" />
                                </div>
                                <div className="watch__comment-field">
                                    <input type="text" placeholder="Add a comment..." />
                                    <div className="watch__comment-underline" />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="watch__error">
                        <h2>Video not found</h2>
                        <p>This video may have been removed or is unavailable.</p>
                    </div>
                )}
            </div>

            {/* Related Videos Sidebar */}
            <aside className="watch__sidebar" id="related-videos">
                <h2 className="watch__sidebar-title">Related Videos</h2>
                {loading && (
                    <div className="watch__sidebar-skeletons">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="watch__related-skeleton">
                                <div className="watch__related-thumb-skeleton skeleton" />
                                <div className="watch__related-info-skeleton">
                                    <div className="skeleton" style={{ height: 16, width: '90%', marginBottom: 6 }} />
                                    <div className="skeleton" style={{ height: 12, width: '60%' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!loading && relatedVideos.length === 0 && (
                    <p className="watch__sidebar-empty">No related videos found</p>
                )}
                {relatedVideos.map((video) => (
                    <Link
                        key={video.id}
                        to={`/watch/${video.id}`}
                        className="watch__related-card fade-in"
                        id={`related-${video.id}`}
                    >
                        <div className="watch__related-thumb-wrap">
                            <img
                                className="watch__related-thumb"
                                src={video.thumbnail}
                                alt={video.title}
                                loading="lazy"
                            />
                            {video.duration && (
                                <span className="watch__related-duration">{formatDuration(video.duration)}</span>
                            )}
                        </div>
                        <div className="watch__related-info">
                            <h3 className="watch__related-title">{video.title}</h3>
                            <p className="watch__related-channel">{video.channelTitle}</p>
                            {video.statistics && (
                                <p className="watch__related-views">
                                    {formatViewCount(video.statistics?.viewCount)} views
                                </p>
                            )}
                        </div>
                    </Link>
                ))}
            </aside>
        </div>
    );
}

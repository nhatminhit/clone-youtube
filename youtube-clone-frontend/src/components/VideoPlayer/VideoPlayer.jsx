import { useState, useRef, useEffect, useCallback } from 'react';
import { getVideoStream, getAudioStream, getAudioProxyUrl, getSponsorSegments, getFormats } from '../../api';
import './VideoPlayer.css';

export default function VideoPlayer({ videoId, videoDetails }) {
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const progressRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [loading, setLoading] = useState(true);
    const [streamUrl, setStreamUrl] = useState(null);
    const [sponsorSegments, setSponsorSegments] = useState([]);
    const [toast, setToast] = useState(null);
    const [isBackgroundMode, setIsBackgroundMode] = useState(false);
    const [buffered, setBuffered] = useState(0);
    const controlsTimeoutRef = useRef(null);
    const containerRef = useRef(null);

    const [availableQualities, setAvailableQualities] = useState([]);
    const [selectedQuality, setSelectedQuality] = useState('auto');

    // Load stream URL and sponsor segments
    useEffect(() => {
        if (!videoId) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                let streamData, sponsorData, formatsData;

                // 1. Try preloaded data from Watch page first
                if (videoDetails?.preloadedStream) {
                    streamData = videoDetails.preloadedStream;
                    sponsorData = { segments: videoDetails.preloadedSponsors || [] };
                    // We still need formats for the quality menu, but we can fetch it separately
                    formatsData = await getFormats(videoId).catch(() => ({ formats: [] }));
                } else {
                    // Fallback to individual fetches
                    const results = await Promise.all([
                        getVideoStream(videoId),
                        getSponsorSegments(videoId),
                        getFormats(videoId).catch(() => ({ formats: [] }))
                    ]);
                    streamData = results[0];
                    sponsorData = results[1];
                    formatsData = results[2];
                }

                if (cancelled) return;

                // Get ALL video formats for quality menu
                const allFormats = (formatsData.formats || [])
                    .filter(f => f.hasVideo)
                    .sort((a, b) => (parseInt(b.height) || 0) - (parseInt(a.height) || 0));

                // Dedup and pick best representative itag per quality label
                const uniqueQualities = [];
                const seen = new Set();
                for (const f of allFormats) {
                    if (f.qualityLabel && !seen.has(f.qualityLabel)) {
                        uniqueQualities.push(f);
                        seen.add(f.qualityLabel);
                    }
                }

                setAvailableQualities(uniqueQualities);

                const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
                const BACKEND_URL = API_BASE.replace(/\/api$/, '');
                const resolveUrl = (url) => {
                    if (!url) return url;
                    // Direct googlevideo.com URLs - use as-is
                    if (url.startsWith('http')) return url;
                    // Relative /api/ URLs - prepend backend
                    if (url.startsWith('/api')) return `${BACKEND_URL}${url}`;
                    return url;
                };

                if (streamData.type === 'combined') {
                    setStreamUrl(resolveUrl(streamData.url));
                } else if (streamData.type === 'separate') {
                    setStreamUrl(resolveUrl(streamData.video.url));
                }

                setSponsorSegments(sponsorData.segments || []);
            } catch (err) {
                console.error('Failed to load stream:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [videoId]);

    const handleQualityChange = (format) => {
        if (!videoRef.current) return;

        const currentTime = videoRef.current.currentTime;
        const wasPlaying = !videoRef.current.paused;

        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        const BACKEND_URL = API_BASE.replace(/\/api$/, '');
        const resolveUrl = (url) => {
            if (!url) return url;
            if (url.startsWith('http')) return url;
            if (url.startsWith('/api')) return `${BACKEND_URL}${url}`;
            return url;
        };

        if (format === 'auto') {
            setSelectedQuality('auto');
            getVideoStream(videoId).then(data => {
                setStreamUrl(resolveUrl(data.url || data.video?.url));
            });
        } else {
            setSelectedQuality(format.qualityLabel);
            // Use direct URL from format data (googlevideo.com)
            if (format.url) {
                setStreamUrl(format.url);
            } else {
                setStreamUrl(`${BACKEND_URL}/api/video/${videoId}/proxy/video?itag=${format.itag}`);
            }
        }

        // Seamless switching
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.currentTime = currentTime;
                if (wasPlaying) videoRef.current.play();
            }
        }, 100);

        setShowSettings(false);
        showToast(`Chất lượng: ${format === 'auto' ? 'Tự động' : format.qualityLabel}`);
    };

    // SponsorBlock: auto-skip segments
    useEffect(() => {
        if (!videoRef.current || sponsorSegments.length === 0) return;

        const checkSegment = () => {
            const time = videoRef.current?.currentTime || 0;

            for (const seg of sponsorSegments) {
                if (time >= seg.start && time < seg.start + 1.0 && time < seg.end) {
                    videoRef.current.currentTime = seg.end;
                    showToast(`⏭ Skipped ${seg.category} (${seg.duration}s)`);
                    break;
                }
            }
        };

        const interval = setInterval(checkSegment, 500);
        return () => clearInterval(interval);
    }, [sponsorSegments]);

    // Background Playback — Visibility API
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    const isBackgroundModeRef = useRef(isBackgroundMode);
    useEffect(() => { isBackgroundModeRef.current = isBackgroundMode; }, [isBackgroundMode]);

    useEffect(() => {
        const handleVisibility = async () => {
            if (document.visibilityState === 'hidden' && isPlayingRef.current) {
                // Switch to audio-only mode
                setIsBackgroundMode(true);
                try {
                    if (!audioRef.current) {
                        audioRef.current = new Audio();
                    }

                    const time = videoRef.current?.currentTime || 0;
                    const proxyUrl = getAudioProxyUrl(videoId);

                    audioRef.current.src = proxyUrl;
                    audioRef.current.volume = volume;

                    // IMPORTANT: Wait for metadata before seeking to prevent reset to 0
                    audioRef.current.onloadedmetadata = () => {
                        audioRef.current.currentTime = time;
                        audioRef.current.play().catch(() => { });
                    };

                    if (videoRef.current) {
                        videoRef.current.pause();
                    }
                } catch (err) {
                    console.error('Background audio failed:', err);
                }
            } else if (document.visibilityState === 'visible' && isBackgroundModeRef.current) {
                // Switch back to video mode
                setIsBackgroundMode(false);
                if (audioRef.current && videoRef.current) {
                    const time = audioRef.current.currentTime;

                    audioRef.current.pause();
                    audioRef.current.src = '';

                    // Sync time back to video
                    videoRef.current.currentTime = time;
                    if (isPlayingRef.current) {
                        videoRef.current.play().catch(() => { });
                    }
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [videoId, volume]);

    // Media Session API
    useEffect(() => {
        if (!videoDetails || !('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: videoDetails.title,
            artist: videoDetails.channelTitle,
            artwork: videoDetails.thumbnail ? [
                { src: videoDetails.thumbnail, sizes: '512x512', type: 'image/jpeg' }
            ] : [],
        });

        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('seekbackward', () => seek(-10));
        navigator.mediaSession.setActionHandler('seekforward', () => seek(10));

        return () => {
            navigator.mediaSession.setActionHandler('play', null);
            navigator.mediaSession.setActionHandler('pause', null);
            navigator.mediaSession.setActionHandler('seekbackward', null);
            navigator.mediaSession.setActionHandler('seekforward', null);
        };
    }, [videoDetails, isPlaying]);

    const showToast = useCallback((message) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    }, []);

    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    }, []);

    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [isPiP, setIsPiP] = useState(false);
    const [seekingVisual, setSeekingVisual] = useState(null); // { side: 'left' | 'right' }
    const lastTapRef = useRef(0);

    const handleDownload = (type) => {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        const BACKEND_URL = API_BASE.replace(/\/api$/, '');
        const downloadUrl = `${BACKEND_URL}/api/video/download/${videoId}?type=${type}`;

        // Use a hidden anchor tag to trigger download reliably without new tab issues
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = '';
        link.target = '_blank'; // Force browser to handle download in background
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setShowDownloadMenu(false);
        showToast(`Bắt đầu tải ${type === 'audio' ? 'MP3' : 'MP4'}...`);
    };

    const seek = useCallback((seconds) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
    }, [duration]);

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const time = videoRef.current.currentTime;
        const dur = videoRef.current.duration || 0;
        setCurrentTime(time);
        setDuration(dur);

        // Update global CSS variable for progress bar (used by miniplayer)
        if (dur > 0) {
            const percent = (time / dur) * 100;
            document.documentElement.style.setProperty('--player-progress', `${percent}%`);
        }

        if (videoRef.current.buffered.length > 0) {
            setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
        }

        // Save to session every few updates to prevent reset on navigation/portal moves
        if (videoId && time > 0) {
            sessionStorage.setItem(`yt_time_${videoId}`, time.toString());
        }
    };

    const handleProgressClick = (e) => {
        if (!progressRef.current || !videoRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        videoRef.current.currentTime = ratio * duration;
    };

    const handleVolumeChange = (e) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
    };

    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        if (isMuted) {
            videoRef.current.volume = volume || 0.5;
            setIsMuted(false);
        } else {
            videoRef.current.volume = 0;
            setIsMuted(true);
        }
    }, [isMuted, volume]);

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    const handleMouseMove = () => {
        setShowControls(true);
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't trigger if user is typing in an input/textarea
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'j':
                    e.preventDefault();
                    seek(-10);
                    triggerSeekingVisual('left');
                    break;
                case 'l':
                    e.preventDefault();
                    seek(10);
                    triggerSeekingVisual('right');
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    seek(-5);
                    triggerSeekingVisual('left');
                    break;
                case 'arrowright':
                    e.preventDefault();
                    seek(5);
                    triggerSeekingVisual('right');
                    break;
                case 'arrowup':
                    e.preventDefault();
                    setVolume(prev => Math.min(1, prev + 0.05));
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    setVolume(prev => Math.max(0, prev - 0.05));
                    break;
                case 'i':
                    e.preventDefault();
                    togglePiP();
                    break;
                default:
                    if (e.key >= '0' && e.key <= '9') {
                        const percent = parseInt(e.key) * 10;
                        if (videoRef.current) {
                            videoRef.current.currentTime = (percent / 100) * duration;
                        }
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, toggleFullscreen, toggleMute, seek, duration, isPiP]);

    // Handle Volume Side Effect
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = volume;
            setIsMuted(volume === 0);
        }
    }, [volume]);

    const togglePiP = async () => {
        try {
            if (!document.pictureInPictureEnabled) {
                showToast("PiP not supported");
                return;
            }
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiP(false);
            } else {
                await videoRef.current.requestPictureInPicture();
                setIsPiP(true);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handlePlaybackRateChange = (rate) => {
        setPlaybackRate(rate);
        if (videoRef.current) {
            videoRef.current.playbackRate = rate;
        }
        setShowSettings(false);
        showToast(`Tốc độ: ${rate}x`);
    };

    const triggerSeekingVisual = (side) => {
        setSeekingVisual(side);
        setTimeout(() => setSeekingVisual(null), 800);
    };

    const handleVideoClick = (e) => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 400; // Increased for better mobile response
        const rect = e.currentTarget.getBoundingClientRect();

        // Get coordinates correctly for both touch and mouse
        const x = (e.clientX || (e.changedTouches && e.changedTouches[0].clientX)) - rect.left;
        const width = rect.width;

        if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
            // Double tap detected
            if (x < width / 3) {
                seek(-10);
                triggerSeekingVisual('left');
            } else if (x > (width * 2) / 3) {
                seek(10);
                triggerSeekingVisual('right');
            } else {
                // Double tap in center toggles fullscreen on logic but here we'll just play/pause
                togglePlay();
            }
            lastTapRef.current = 0; // Reset
        } else {
            // Single tap
            lastTapRef.current = now;
            setTimeout(() => {
                if (lastTapRef.current === now) {
                    // Show controls or hide them if already showing
                    if (!showControls) {
                        setShowControls(true);
                    } else {
                        togglePlay();
                    }
                }
            }, DOUBLE_TAP_DELAY);
        }
    };

    const [aspectRatio, setAspectRatio] = useState(16 / 9);

    const onLoadedMetadata = (e) => {
        const video = e.target;
        const { videoWidth, videoHeight } = video;
        if (videoWidth && videoHeight) {
            setAspectRatio(videoWidth / videoHeight);
        }

        // RESUME LOGIC: Fix the "reset to 0" issue when switching from mini player/tabs
        const savedTime = sessionStorage.getItem(`yt_time_${videoId}`);
        if (savedTime) {
            const timeToResume = parseFloat(savedTime);
            // Only seek if there's a significant difference to avoid infinite loops
            if (Math.abs(video.currentTime - timeToResume) > 0.5) {
                // Resume from saved time
                video.currentTime = timeToResume;
            }
        }

        handleTimeUpdate();
    };

    return (
        <div
            className={`player ${isFullscreen ? 'player--fullscreen' : ''}`}
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            id="video-player"
            style={!isFullscreen ? { aspectRatio: `${aspectRatio}` } : {}}
        >
            <div className={`player__video-container ${loading ? 'loading' : ''}`} onClick={handleVideoClick}>
                <video
                    ref={videoRef}
                    className="player__video"
                    src={streamUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={onLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onWaiting={() => setLoading(true)}
                    onCanPlay={() => {
                        setLoading(false);
                        if (streamUrl) {
                            videoRef.current.play().catch(err => {
                                // Autoplay blocked - expected in some browsers
                            });
                        }
                    }}
                    playsInline
                    autoPlay
                />

                {/* Double Tap Visuals */}
                {seekingVisual && (
                    <div className={`player__seek-feedback player__seek-feedback--${seekingVisual}`}>
                        <div className="player__seek-ripple" />
                        <div className="player__seek-text">
                            {seekingVisual === 'left' ? (
                                <><svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" /></svg><span>-10s</span></>
                            ) : (
                                <><svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg><span>+10s</span></>
                            )}
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="player__loading">
                        <div className="player__spinner" />
                    </div>
                )}

                {/* Big play button - pointer-events none because the container handles clicks */}
                {!isPlaying && !loading && !seekingVisual && (
                    <div className="player__big-play" style={{ pointerEvents: 'none' }}>
                        <svg width="68" height="68" viewBox="0 0 24 24" fill="white">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className={`player__controls ${showControls ? 'player__controls--visible' : ''}`}>
                {/* Progress bar */}
                <div className="player__progress-wrap" ref={progressRef} onClick={handleProgressClick}>
                    <div className="player__progress-buffered" style={{ width: `${bufferedProgress}%` }} />
                    <div className="player__progress-bar" style={{ width: `${progress}%` }}>
                        <div className="player__progress-handle" />
                    </div>
                    {/* Sponsor segment markers */}
                    {sponsorSegments.map((seg, i) => (
                        <div
                            key={i}
                            className="player__sponsor-marker"
                            style={{
                                left: `${(seg.start / duration) * 100}%`,
                                width: `${((seg.end - seg.start) / duration) * 100}%`,
                            }}
                            title={`${seg.category}: ${seg.duration}s`}
                        />
                    ))}
                </div>

                <div className="player__controls-row">
                    <div className="player__controls-left">
                        <button className="player__btn" onClick={togglePlay} id="play-pause-btn">
                            {isPlaying ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                            )}
                        </button>

                        <button className="player__btn" onClick={() => seek(-10)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></svg>
                        </button>
                        <button className="player__btn" onClick={() => seek(10)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8V1l-5 5 5 5V7c3.31 0 6 2.69 6 6z" /></svg>
                        </button>

                        <div className="player__volume">
                            <button className="player__btn" onClick={toggleMute}>
                                {isMuted || volume === 0 ? (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
                                ) : (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                                )}
                            </button>
                            <input
                                type="range"
                                className="player__volume-slider"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                            />
                        </div>

                        <span className="player__time">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    </div>

                    <div className="player__controls-right">
                        <div className="player__settings-container">
                            <button
                                className={`player__btn ${showDownloadMenu ? 'player__btn--active' : ''}`}
                                onClick={() => {
                                    setShowDownloadMenu(!showDownloadMenu);
                                    setShowSettings(false);
                                }}
                                title="Tải xuống"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                                </svg>
                            </button>

                            {showDownloadMenu && (
                                <div className="player__settings-menu player__download-menu">
                                    <div className="player__settings-section">
                                        <div className="player__settings-header">Tải xuống</div>
                                        <button className="player__settings-opt" onClick={() => handleDownload('video')}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
                                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                                            </svg>
                                            Video (.mp4)
                                        </button>
                                        <button className="player__settings-opt" onClick={() => handleDownload('audio')}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
                                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                                            </svg>
                                            Audio (.mp3)
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="player__settings-container">
                            <button
                                className={`player__btn ${showSettings ? 'player__btn--active' : ''}`}
                                onClick={() => {
                                    setShowSettings(!showSettings);
                                    setShowDownloadMenu(false);
                                }}
                                title="Cài đặt"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.85,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12c0,0.31,0.02,0.65,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.5c-1.93,0-3.5-1.57-3.5-3.5 s1.57-3.5,3.5-3.5s3.5,1.57,3.5,3.5S13.93,15.5,12,15.5z" />
                                </svg>
                            </button>

                            {showSettings && (
                                <div className="player__settings-menu">
                                    <div className="player__settings-section">
                                        <div className="player__settings-header">Tốc độ phát</div>
                                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                                            <button
                                                key={rate}
                                                className={`player__settings-opt ${playbackRate === rate ? 'active' : ''}`}
                                                onClick={() => handlePlaybackRateChange(rate)}
                                            >
                                                {rate === 1 ? 'Thường' : `${rate}x`}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="player__settings-section">
                                        <div className="player__settings-header">Chất lượng</div>
                                        <button
                                            className={`player__settings-opt ${selectedQuality === 'auto' ? 'active' : ''}`}
                                            onClick={() => { handleQualityChange('auto'); setShowSettings(false); }}
                                        >
                                            Tự động ({selectedQuality})
                                        </button>
                                        {availableQualities.slice(0, 3).map((f, i) => (
                                            <button
                                                key={i}
                                                className={`player__settings-opt ${selectedQuality === f.qualityLabel ? 'active' : ''}`}
                                                onClick={() => { handleQualityChange(f); setShowSettings(false); }}
                                            >
                                                {f.qualityLabel}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className="player__btn" onClick={togglePiP} title="Chế độ thu nhỏ (I)">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                                <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z" />
                            </svg>
                        </button>

                        <button className="player__btn" onClick={toggleFullscreen} id="fullscreen-btn">
                            {isFullscreen ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" /></svg>
                            ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Toast notification */}
            {toast && (
                <div className="player__toast">
                    {toast}
                </div>
            )}
        </div>
    );
}



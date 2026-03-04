import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer } from '../../context/PlayerContext';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import { useNavigate } from 'react-router-dom';
import './GlobalPlayer.css';

export default function GlobalPlayer() {
    const { currentVideo, showPlayer, isMiniMode, toggleMiniMode, closePlayer, portalTarget } = usePlayer();
    const navigate = useNavigate();

    // Swipe to minimize states
    const [dragY, setDragY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);

    if (!showPlayer || !currentVideo) return null;

    const handleBackToWatch = () => {
        toggleMiniMode(false);
        navigate(`/watch/${currentVideo.id}`);
    };

    // --- Swipe Down Logic ---
    const handleTouchStart = (e) => {
        if (isMiniMode) return;
        startY.current = e.touches[0].clientY;
        setIsDragging(true);
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - startY.current;

        // Only allow dragging downwards
        if (deltaY > 0) {
            setDragY(deltaY);
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;

        setIsDragging(false);
        // Threshold: if dragged more than 150px, minimize
        if (dragY > 150) {
            toggleMiniMode(true);
            if (window.location.pathname.startsWith('/watch/')) {
                navigate('/');
            }
        }
        setDragY(0);
    };

    const dragStyle = isDragging ? {
        transform: `translateY(${dragY}px) scale(${Math.max(0.8, 1 - dragY / 1000)})`,
        opacity: Math.max(0.5, 1 - dragY / 500),
        transition: 'none'
    } : {};

    const videoPlayerContent = (
        <VideoPlayer videoId={currentVideo.id} videoDetails={currentVideo} />
    );

    // If we have a portal target (Watch page is active/mounted), teleport player there
    if (portalTarget && !isMiniMode) {
        return createPortal(videoPlayerContent, portalTarget);
    }

    // Default: Return the floating player (Fixed or Mini)
    return (
        <div
            className={`global-player ${isMiniMode ? 'global-player--mini' : 'global-player--full'}`}
            onClick={isMiniMode ? handleBackToWatch : undefined}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={dragStyle}
        >
            <div className="global-player__container">
                {/* Close/Minimize buttons on miniplayer */}
                {isMiniMode && (
                    <>
                        <button
                            className="global-player__close-btn"
                            onClick={(e) => { e.stopPropagation(); closePlayer(); }}
                            title="Đóng"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                            </svg>
                        </button>
                        <div className="global-player__mini-controls" onClick={(e) => { e.stopPropagation(); handleBackToWatch(); }}>
                            <div className="global-player__mini-info">
                                <span className="global-player__mini-title">{currentVideo.title}</span>
                                <span className="global-player__mini-channel">{currentVideo.channelTitle}</span>
                            </div>
                        </div>
                    </>
                )}

                {videoPlayerContent}
            </div>
        </div>
    );
}


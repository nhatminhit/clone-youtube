import { createContext, useContext, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const PlayerContext = createContext();

export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {
    const [currentVideo, setCurrentVideo] = useState(null); // { id, title, thumbnail, channelTitle }
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMiniMode, setIsMiniMode] = useState(false);
    const [showPlayer, setShowPlayer] = useState(false);
    const navigate = useNavigate();

    const playVideo = useCallback((video) => {
        setCurrentVideo(video);
        setShowPlayer(true);
        setIsMiniMode(false);
        setIsPlaying(true);
        // Only navigate if we're not already on a watch page or we're in mini mode
        // For simplicity, always navigate for now if we're "playing" a new video
        navigate(`/watch/${video.id}`);
    }, [navigate]);

    const toggleMiniMode = useCallback((val) => {
        setIsMiniMode(prev => (val !== undefined ? val : !prev));
    }, []);

    const closePlayer = useCallback(() => {
        setShowPlayer(false);
        setIsPlaying(false);
        setCurrentVideo(null);
    }, []);

    const [portalTarget, setPortalTarget] = useState(null);

    const value = {
        currentVideo,
        isPlaying,
        setIsPlaying,
        isMiniMode,
        toggleMiniMode,
        showPlayer,
        playVideo,
        closePlayer,
        portalTarget,
        setPortalTarget
    };

    return (
        <PlayerContext.Provider value={value}>
            {children}
        </PlayerContext.Provider>
    );
};

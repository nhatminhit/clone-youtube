import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import VideoCard from '../../components/VideoCard/VideoCard';
import './History.css';

export default function History() {
    const [history, setHistory] = useState([]);

    useEffect(() => {
        const savedHistory = JSON.parse(localStorage.getItem('yt_history') || '[]');
        setHistory(savedHistory);
        document.title = 'History - YouTube Premium Clone';
    }, []);

    const clearHistory = () => {
        if (window.confirm('Clear all watch history?')) {
            localStorage.setItem('yt_history', '[]');
            setHistory([]);
        }
    };

    return (
        <div className="history-page">
            <div className="history-page__header">
                <h1 className="history-page__title">Watch history</h1>
                {history.length > 0 && (
                    <button className="history-page__clear-btn" onClick={clearHistory}>
                        Clear all watch history
                    </button>
                )}
            </div>

            {history.length === 0 ? (
                <div className="history-page__empty">
                    <svg width="120" height="120" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                        <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                    </svg>
                    <p>This list has no videos.</p>
                </div>
            ) : (
                <div className="history-grid">
                    {history.map((video, index) => (
                        <VideoCard key={`${video.id}-${index}`} video={video} index={index} />
                    ))}
                </div>
            )}
        </div>
    );
}

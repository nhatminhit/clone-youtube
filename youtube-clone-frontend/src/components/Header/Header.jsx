import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchVideos } from '../../api';
import './Header.css';

export default function Header() {
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const navigate = useNavigate();
    const debounceTimer = useRef(null);
    const wrapperRef = useRef(null);

    // Debounced search suggestions
    const fetchSuggestions = useCallback((q) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        if (!q.trim() || q.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        debounceTimer.current = setTimeout(async () => {
            try {
                const data = await searchVideos(q.trim(), 5);
                const titles = (data.items || []).map(item => item.title).filter(Boolean);
                setSuggestions(titles.slice(0, 8));
                setShowSuggestions(true);
                setActiveIndex(-1);
            } catch {
                setSuggestions([]);
            }
        }, 350);
    }, []);

    useEffect(() => {
        fetchSuggestions(query);
        return () => clearTimeout(debounceTimer.current);
    }, [query, fetchSuggestions]);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        const q = query.trim();
        if (q) {
            navigate(`/search?q=${encodeURIComponent(q)}`);
            setShowMobileSearch(false);
            setShowSuggestions(false);
            setSuggestions([]);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setQuery(suggestion);
        navigate(`/search?q=${encodeURIComponent(suggestion)}`);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            handleSuggestionClick(suggestions[activeIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    return (
        <header className={`header ${showMobileSearch ? 'header--searching' : ''}`} id="main-header">
            <div className={`header__left ${showMobileSearch ? 'mobile-hide' : ''}`}>
                <button className="header__menu-btn mobile-hide" id="menu-toggle" aria-label="Menu">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                    </svg>
                </button>
                <a href="/" className="header__logo" id="logo-link" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
                    <div className="header__logo-icon">
                        <svg viewBox="0 0 90 20" width="90" height="20">
                            <g fill="none">
                                <path d="M27.973 18.075V3.134h-3.26v14.94h3.26zm4.577-10.776v2.544h4.647c-.134 1.396-1.33 2.694-3.23 2.694-1.957 0-3.587-1.67-3.587-3.846s1.63-3.846 3.587-3.846c1.168 0 2.02.466 2.638 1.066l1.749-1.8C37.22 2.976 35.978 2.27 34.197 2.27c-3.605 0-6.546 2.876-6.546 6.419 0 3.543 2.941 6.419 6.546 6.419 3.782 0 6.297-2.716 6.297-6.537 0-.438-.05-.876-.134-1.272h-6.163z" fill="#f1f1f1" />
                                <path d="M19.44 10c0 5.078-3.86 9.2-8.621 9.2S2.2 15.078 2.2 10s3.86-9.2 8.62-9.2 8.62 4.122 8.62 9.2z" fill="#FF4E45" />
                                <path d="M13.91 10l-4.14-2.82v5.64z" fill="white" />
                            </g>
                        </svg>
                    </div>
                    <span className="header__logo-text">Premium</span>
                </a>
            </div>

            {showMobileSearch && (
                <button
                    className="header__back-btn"
                    onClick={() => setShowMobileSearch(false)}
                    aria-label="Back"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                    </svg>
                </button>
            )}

            <form
                ref={wrapperRef}
                className={`header__search ${isFocused ? 'header__search--focused' : ''} ${showMobileSearch ? 'header__search--mobile-active' : ''}`}
                onSubmit={handleSearch}
                style={{ position: 'relative' }}
            >
                <div className="header__search-input-wrap">
                    <input
                        id="search-input"
                        type="text"
                        className="header__search-input"
                        placeholder="Search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => {
                            setIsFocused(true);
                            if (suggestions.length > 0) setShowSuggestions(true);
                        }}
                        onBlur={() => setIsFocused(false)}
                        onKeyDown={handleKeyDown}
                        autoComplete="off"
                    />

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <ul className="header__suggestions" role="listbox" id="search-suggestions">
                            {suggestions.map((s, i) => (
                                <li
                                    key={i}
                                    className={`header__suggestion-item ${i === activeIndex ? 'header__suggestion-item--active' : ''}`}
                                    onMouseDown={() => handleSuggestionClick(s)}
                                    role="option"
                                    aria-selected={i === activeIndex}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="header__suggestion-icon">
                                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                                    </svg>
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button type="submit" className="header__search-btn" id="search-btn" aria-label="Search">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                </button>
            </form>

            <div className={`header__right ${showMobileSearch ? 'mobile-hide' : ''}`}>
                <button
                    className="header__icon-btn header__search-trigger-mobile"
                    onClick={() => setShowMobileSearch(true)}
                    aria-label="Search"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                </button>
                <button className="header__icon-btn mobile-hide" id="notification-btn" aria-label="Notifications">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                    </svg>
                </button>
                <div className="header__avatar" id="user-avatar">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--text-secondary)">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                    </svg>
                </div>
            </div>
        </header>
    );
}

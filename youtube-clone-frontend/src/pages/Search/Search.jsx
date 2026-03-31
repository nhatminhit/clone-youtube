import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchVideos } from '../../api';
import VideoCard from '../../components/VideoCard/VideoCard';
import './Search.css';

export default function Search() {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [nextPageToken, setNextPageToken] = useState(null);
    const [totalResults, setTotalResults] = useState(0);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!query) return;
        let cancelled = false;

        async function search() {
            setLoading(true);
            setError(null);
            try {
                const data = await searchVideos(query, 16);
                if (!cancelled) {
                    setResults(data.items || []);
                    setNextPageToken(data.nextPageToken);
                    setTotalResults(data.totalResults || 0);
                    document.title = `${query} - YouTube Search`;
                }
            } catch (err) {
                console.error('Search failed:', err);
                if (!cancelled) {
                    setError('Failed to search. Check your backend connection.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        search();
        return () => { cancelled = true; };
    }, [query]);

    const loadMore = async () => {
        if (!nextPageToken) return;
        try {
            const data = await searchVideos(query, 16, nextPageToken);
            setResults((prev) => [...prev, ...(data.items || [])]);
            setNextPageToken(data.nextPageToken);
        } catch (err) {
            console.error('[Route /api/search] Error:', err.message, err.response?.data || '');
        }
    };

    return (
        <div className="search-page" id="search-page">
            {query && (
                <div className="search-page__header">
                    <h1 className="search-page__title">
                        Results for "<span className="search-page__query">{query}</span>"
                    </h1>
                    {totalResults > 0 && (
                        <p className="search-page__count">
                            About {totalResults.toLocaleString()} results
                        </p>
                    )}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="search-page__grid">
                    {Array.from({ length: 8 }).map((_, i) => (
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

            {/* Error */}
            {error && (
                <div className="search-page__error">
                    <p>{error}</p>
                </div>
            )}

            {/* Results grid */}
            {!loading && !error && (
                <>
                    <div className="search-page__grid">
                        {results.map((video, i) => (
                            <VideoCard key={video.id} video={video} index={i} />
                        ))}
                    </div>

                    {results.length === 0 && query && (
                        <div className="search-page__empty">
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                            </svg>
                            <h2>No results found</h2>
                            <p>Try different keywords or remove search filters</p>
                        </div>
                    )}

                    {nextPageToken && results.length > 0 && (
                        <div className="search-page__load-more">
                            <button className="search-page__load-more-btn" onClick={loadMore} id="load-more-btn">
                                Load More
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* No query */}
            {!query && (
                <div className="search-page__empty">
                    <svg width="100" height="100" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                    <h2>Search YouTube</h2>
                    <p>Type a keyword in the search bar above</p>
                </div>
            )}
        </div>
    );
}

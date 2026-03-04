import { NavLink } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar() {
    return (
        <nav className="sidebar" id="sidebar">
            <NavLink to="/" className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`} end>
                <svg className="sidebar__icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
                <span className="sidebar__label">Home</span>
            </NavLink>

            <NavLink to="/trending" className={({ isActive }) => `sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}>
                <svg className="sidebar__icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M17.53 11.2c-.23-.3-.51-.56-.80-.78-.55-.4-.74-.45-1.08-.63-1.09-.62-2.47-1.01-2.85-2.18-.04-.14-.08-.28-.08-.44 0-.21.04-.41.11-.6-.24.37-.42.8-.42 1.28 0 1.54 1.13 2.79 2.53 3.08.5.1 1.04.13 1.53-.03.48-.17.88-.49 1.15-.9.13-.2.23-.42.3-.66-.07.26-.22.51-.39.66z" />
                    <path d="M7.47 21.5C4.2 19.93 1.86 16.76 1.5 13 .92 9.02 3.45 5.34 7.27 4.14c.05-.02.1-.02.16 0 .05.02.09.05.12.1l.71 1.05c.06.09.12.19.18.29C9.05 6.73 9.75 7.89 10.64 9c.67.84 1.11 1.82 1.27 2.87.14.95.04 1.93-.28 2.84-.04.12-.1.24-.17.34 0-1.88-1.15-3.58-2.93-4.26-.46-.18-.97-.26-1.47-.24-.87.04-1.69.39-2.32.99-.94.91-1.38 2.33-1.13 3.58.36 1.81 1.18 3.4 2.33 4.65.17.18.35.35.53.51z" />
                </svg>
                <span className="sidebar__label">Trending</span>
            </NavLink>

            <div className="sidebar__item">
                <svg className="sidebar__icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
                </svg>
                <span className="sidebar__label">Library</span>
            </div>

            <div className="sidebar__item">
                <svg className="sidebar__icon" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
                </svg>
                <span className="sidebar__label">History</span>
            </div>
        </nav>
    );
}

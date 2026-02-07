import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import App from '.';
import './index.css';

// Lazy load pages for better performance
const IntroPage = React.lazy(() => import('./pages/IntroPage'));
const FeedPage = React.lazy(() => import('./pages/FeedPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SettingsPage = React.lazy(() => import('./pages/settings/SettingsPage'));
const NotificationPage = React.lazy(() => import('./pages/settings/notification/NotificationPage'));
const PublisherPage = React.lazy(() => import('./pages/settings/publisher/PublisherPage'));
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const LoginPage = React.lazy(() => import('./pages/auth/login/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/auth/register/RegisterPage'));
const CallbackPage = React.lazy(() => import('./pages/auth/callback/CallbackPage'));
const LibraryPage = React.lazy(() => import('./pages/library/LibraryPage'));
const HistoryPage = React.lazy(() => import('./pages/library/history/HistoryPage'));
const SavedPage = React.lazy(() => import('./pages/library/saved/SavedPage'));
const StatsPage = React.lazy(() => import('./pages/StatsPage'));

const Loading = () => <div>Loading...</div>;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<React.Suspense fallback={<Loading />}><IntroPage /></React.Suspense>} />
          <Route path="intro" element={<React.Suspense fallback={<Loading />}><IntroPage /></React.Suspense>} />
          <Route path="feed" element={<React.Suspense fallback={<Loading />}><FeedPage /></React.Suspense>} />
          <Route path="profile" element={<React.Suspense fallback={<Loading />}><ProfilePage /></React.Suspense>} />
          <Route path="settings" element={<React.Suspense fallback={<Loading />}><SettingsPage /></React.Suspense>} />
          <Route path="settings/notifications" element={<React.Suspense fallback={<Loading />}><NotificationPage /></React.Suspense>} />
          <Route path="settings/publisher" element={<React.Suspense fallback={<Loading />}><PublisherPage /></React.Suspense>} />
          <Route path="about" element={<React.Suspense fallback={<Loading />}><AboutPage /></React.Suspense>} />
          <Route path="library" element={<React.Suspense fallback={<Loading />}><LibraryPage /></React.Suspense>} />
          <Route path="library/history" element={<React.Suspense fallback={<Loading />}><HistoryPage /></React.Suspense>} />
          <Route path="library/saved" element={<React.Suspense fallback={<Loading />}><SavedPage /></React.Suspense>} />
          <Route path="stats" element={<React.Suspense fallback={<Loading />}><StatsPage /></React.Suspense>} />
        </Route>
        <Route path="auth/login" element={<React.Suspense fallback={<Loading />}><LoginPage /></React.Suspense>} />
        <Route path="auth/register" element={<React.Suspense fallback={<Loading />}><RegisterPage /></React.Suspense>} />
        <Route path="auth/callback" element={<React.Suspense fallback={<Loading />}><CallbackPage /></React.Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  </React.StrictMode>
);

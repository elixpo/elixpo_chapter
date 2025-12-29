import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import './index.css';

// Lazy load pages for better performance
const IntroPage = React.lazy(() => import('./pages/IntroPage'));
const FeedPage = React.lazy(() => import('./pages/FeedPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const LibraryPage = React.lazy(() => import('./pages/LibraryPage'));
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
          <Route path="about" element={<React.Suspense fallback={<Loading />}><AboutPage /></React.Suspense>} />
          <Route path="library" element={<React.Suspense fallback={<Loading />}><LibraryPage /></React.Suspense>} />
          <Route path="stats" element={<React.Suspense fallback={<Loading />}><StatsPage /></React.Suspense>} />
        </Route>
        <Route path="auth/login" element={<React.Suspense fallback={<Loading />}><LoginPage /></React.Suspense>} />
        <Route path="auth/register" element={<React.Suspense fallback={<Loading />}><RegisterPage /></React.Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  </React.StrictMode>
);

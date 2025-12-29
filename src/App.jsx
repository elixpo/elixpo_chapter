import { Outlet, useNavigate } from 'react-router-dom';
import './App.css';

export default function App() {
  const navigate = useNavigate();

  return (
    <div className="app-container">
      <header className="appHeader">
        <div className="logo"></div>
        <p className="appName">LixBlogs</p>

        <div className="writeIcon" onClick={() => navigate('/write')}> 
          <ion-icon name="pencil"></ion-icon> Write
        </div>
        <div className="signin" onClick={() => navigate('/auth/login')}>Sign-In</div>
        <div className="getStartedBtn" onClick={() => navigate('/feed')}>
          <span>Get started</span>
        </div>
        <ion-icon name="logo-github" className="githubLogo"></ion-icon>
      </header>

      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}

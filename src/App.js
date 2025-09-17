import React, { useEffect } from 'react';
import { appConfig } from './config';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import MyCourses from './components/MyCourses';
import Profile from './components/Profile';
import Challenges from './components/Challenges';
import Favourites from './components/Favourites';
import ErrorPage from './components/ErrorPage';
import NotFoundPage from './components/NotFoundPage';
import PrivacyPage from './components/PrivacyPage';
import HelpPage from './components/HelpPage';
import CourseDetail from './components/CourseDetail';
import ElementPage from './components/ElementPage';
import ElementFeed from './components/ElementFeed';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import './App.css';

// Compute router basename consistently for dev/prod
function getBasename() {
  // Prefer config baseUrl when provided
  try {
    const url = new URL(appConfig.baseUrl);
    const fromConfig = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    if (fromConfig && fromConfig !== '/') return fromConfig;
  } catch (_) {}

  // In development, allow hosting under a sub-path like /hejvi
  try {
    const path = window.location?.pathname || '';
    const common = ['/hejvi'];
    const detected = common.find(p => p && p !== '/' && path.startsWith(p));
    if (detected) return detected;
  } catch (_) {}

  return '';
}

// Protected Route component with redirect support
function ProtectedRoute({ children, redirectTo = null }) {
  const { user, loading } = useAuth();
  const location = window.location;

  if (loading) {
    return (
      <div className="mobile-container">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Store the intended destination for redirect after login
    // Remove the basename from the path to avoid duplication
    const basename = getBasename();
    let currentPath = location.pathname + location.search;

    if (basename && currentPath.startsWith(basename)) {
      currentPath = currentPath.substring(basename.length) || '/';
    }

    if (currentPath !== '/login') {
      localStorage.setItem('hejvi_redirect_after_login', currentPath);
    }
    return <Navigate to="/login" replace />;
  }

  return <div className="mobile-container">{children}</div>;
}

// Public Route component (for login) with PIN support
function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mobile-container">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (user) {
    // Check if there's a redirect destination stored
    let redirectPath = localStorage.getItem('hejvi_redirect_after_login');
    if (redirectPath) {
      const basename = getBasename();
      if (basename && redirectPath.startsWith(basename)) {
        redirectPath = redirectPath.substring(basename.length) || '/';
      }
      localStorage.removeItem('hejvi_redirect_after_login');
      // Guard against invalid routes causing 404; fall back to '/'
      try {
        new URL(redirectPath, window.location.origin); // just a sanity check
        return <Navigate to={redirectPath} replace />;
      } catch (_) {
        return <Navigate to="/" replace />;
      }
    }
    return <Navigate to="/" replace />;
  }

  return <div className="mobile-container">{children}</div>;
}

function AppContent() {
  // Navigation tracking
  useEffect(() => {
    const handleNavigation = () => {
      // Navigation occurred
    };
    
    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          <PublicRoute>
            <LoginScreen />
          </PublicRoute>
        } 
      />
      
      {/* Protected Routes */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/my-courses" 
        element={
          <ProtectedRoute>
            <MyCourses />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/challenges" 
        element={
          <ProtectedRoute>
            <Challenges />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/favourites" 
        element={
          <ProtectedRoute>
            <Favourites />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/video/:videoId" 
        element={
          <ProtectedRoute>
            <ErrorPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/course/:courseId" 
        element={
          <ProtectedRoute>
            <CourseDetail />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/element/:hashId" 
        element={
          <ProtectedRoute>
            <ElementPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/feed/:hashId" 
        element={
          <ProtectedRoute>
            <ElementFeed />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/element-feed/:hashId" 
        element={
          <ProtectedRoute>
            <ElementFeed />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/collection/:hashId" 
        element={
          <ProtectedRoute>
            <CourseDetail />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/error" 
        element={
          <ProtectedRoute>
            <ErrorPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Static pages */}
      <Route 
        path="/profile/privacy" 
        element={
          <ProtectedRoute>
            <PrivacyPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/profile/help" 
        element={
          <ProtectedRoute>
            <HelpPage />
          </ProtectedRoute>
        } 
      />

      {/* Catch all route - show 404 */}
      <Route 
        path="*" 
        element={
          <ProtectedRoute>
            <NotFoundPage />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Router
          basename={getBasename()}
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
          window={window}
        >
          <AppContent />
        </Router>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;

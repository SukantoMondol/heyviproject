import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useExternalBackButton } from '../hooks/useExternalBackButton';
import './GlobalAppBar.css';

const GlobalAppBar = ({ 
  title, 
  showBackButton = false, 
  onBackClick,
  backTo,
  showSearch = false,
  showDisplayToggle = false,
  isTwoColumnLayout = true,
  onDisplayToggle,
  onSearchToggle,
  onSearchQuery,
  onSearchSubmit,
  searchQuery = '',
  isSearchActive = false
}) => {
  const navigate = useNavigate();
  const { logout, getUser, clientLogoUrl } = useAuth();
  const { t } = useLanguage();
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [logoUrl, setLogoUrl] = useState('');
  
  // Set up external back button handling for all pages
  const { handleBackClick: externalBackClick } = useExternalBackButton('/dashboard');

  // Update local search query when prop changes
  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // Use cached logo URL from auth context and keep a local copy for error fallback
  useEffect(() => {
    if (typeof clientLogoUrl === 'string' && clientLogoUrl.trim().length > 2) {
      setLogoUrl(clientLogoUrl.trim());
    } else {
      const cached = localStorage.getItem('hejvi_client_logo_url');
      if (cached && cached.trim().length > 2) setLogoUrl(cached.trim());
    }
  }, [clientLogoUrl]);

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else if (backTo) {
      navigate(backTo);
    } else {
      // Use external back button logic for better handling of external QR scans
      externalBackClick();
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleSearchToggle = () => {

    if (onSearchToggle) {
      onSearchToggle();
    }
    // Clear local search when toggling
    setLocalSearchQuery('');
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    setLocalSearchQuery(value);
    // Only update the parent's search query for display purposes, not for API calls
    if (onSearchQuery) {
      onSearchQuery(value);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    // Only trigger actual search on form submission
    if (onSearchSubmit) {
      onSearchSubmit(localSearchQuery);
    }
  };

  const handleClearSearch = () => {
    setLocalSearchQuery('');
    if (onSearchQuery) {
      onSearchQuery('');
    }
    if (onSearchSubmit) {
      onSearchSubmit('');
    }
  };

  return (
    <div className="global-app-bar">
      <div className="app-bar-content">
        {!isSearchActive ? (
          <>
            <div className="app-bar-left">
              {showBackButton && (
                <button className="app-bar-icon-button" onClick={handleBackClick} aria-label="back">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              
              {/* Client logo or HejVi text on the left */}
              {logoUrl && logoUrl.length > 2 ? (
                <img
                  className="app-bar-logo"
                  src={logoUrl}
                  alt="Client logo"
                  onError={() => setLogoUrl('')}
                />
              ) : (
                <h1 className="app-bar-title">HejVi</h1>
              )}
            </div>

            {/* Center area intentionally left empty to avoid duplicate titles */}
            <div className="app-bar-center"></div>

            <div className="app-bar-actions">
              {showDisplayToggle && (
                <button 
                  className="app-bar-icon-button" 
                  onClick={onDisplayToggle} 
                  aria-label={isTwoColumnLayout ? "Switch to single column" : "Switch to two columns"}
                  title={isTwoColumnLayout ? "Switch to single column" : "Switch to two columns"}
                >
                  {isTwoColumnLayout ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3H21V21H3V3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3H21V21H3V3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M15 3V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              )}
              {showSearch && (
                <button className="app-bar-icon-button" onClick={handleSearchToggle} aria-label="search">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M21 21L16.514 16.506M19 10.5C19 15.194 15.194 19 10.5 19S2 15.194 2 10.5 5.806 2 10.5 2 19 5.806 19 10.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button className="app-bar-icon-button notification-button" aria-label="notifications" style={{ display: 'none' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13.73 21A2 2 0 0 1 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="app-bar-search">
            <button className="search-back-button" onClick={handleSearchToggle}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <form onSubmit={handleSearchSubmit} className="search-form">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={localSearchQuery}
                onChange={handleSearchInputChange}
                className="search-input"
                autoFocus
              />
              {localSearchQuery && (
                <button 
                  type="button" 
                  className="search-clear-button"
                  onClick={handleClearSearch}
                  aria-label="clear search"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button type="submit" className="search-submit-button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21 21L16.514 16.506M19 10.5C19 15.194 15.194 19 10.5 19S2 15.194 2 10.5 5.806 2 10.5 2 19 5.806 19 10.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalAppBar;

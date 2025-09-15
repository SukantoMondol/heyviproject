import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import './LanguageSwitcher.css';

const LanguageSwitcher = ({ compact = false }) => {
  const { t, languageName, changeLanguage, getAvailableLanguages, isLoading } = useLanguage();
  const { makeAuthenticatedRequest, setSettings } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isApiLoading, setIsApiLoading] = useState(false);

  const availableLanguages = getAvailableLanguages();

  // Fetch available languages from API when component mounts and user is authenticated
  useEffect(() => {
    const fetchLanguagesFromAPI = async () => {
      try {
        setIsApiLoading(true);
        const response = await makeAuthenticatedRequest('/user');
        const userData = await response.json();
        
        if (userData.available_languages) {
          // Store in localStorage for LanguageContext to use
          localStorage.setItem('hejvi_available_languages', JSON.stringify(userData.available_languages));
          
          // Update current language based on user's preferred language
          const preferredLanguageId = userData.data?.preferred_language;
          if (preferredLanguageId) {
            const languageObj = userData.available_languages.find(lang => lang.id === preferredLanguageId);
            if (languageObj) {
              // Update language context directly instead of reloading
              const languageCode = getLanguageCodeFromId(preferredLanguageId);
              if (languageCode && languageCode !== 'en') {
                // Only update if it's different from current language
                await changeLanguage(languageObj.english_name || languageObj.original_name);
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch languages from API:', error);
      } finally {
        setIsApiLoading(false);
      }
    };

    // Only fetch if we have auth context and haven't already loaded languages
    if (makeAuthenticatedRequest && availableLanguages.length === 0) {
      fetchLanguagesFromAPI();
    }
  }, [makeAuthenticatedRequest]); // Removed dependencies that could cause infinite loops

  // Helper function to get language code from API ID
  const getLanguageCodeFromId = (id) => {
    const languageMap = {
      1: 'de', // German
      2: 'en', // English
      3: 'ru', // Russian
      4: 'ar', // Arabic
      5: 'fr'  // French
    };
    return languageMap[id];
  };

  const handleLanguageChange = async (languageName) => {
    try {
      // First, change language locally
      await changeLanguage(languageName);
      
      // Then update on server if authenticated
      if (setSettings) {
        const languageObj = availableLanguages.find(lang => 
          lang.english_name === languageName || 
          lang.original_name === languageName ||
          lang.german_name === languageName
        );
        
        if (languageObj) {
          await setSettings({ language: languageObj.id.toString() });
      
        }
      }
      
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to change language:', error);
      // Keep dropdown open if there was an error
    }
  };

  const currentLanguage = availableLanguages.find(lang => lang.name === languageName);

  // Helper function to render flag (image or emoji)
  const renderFlag = (flag) => {
    if (flag && flag.startsWith('http')) {
      // It's a URL, render as image with fallback
      return (
        <span className="language-flag">
          <img 
            src={flag} 
            alt="flag" 
            className="language-flag-image"
            onError={(e) => {
              // Hide the image and show fallback emoji
              e.target.style.display = 'none';
              const fallback = e.target.parentElement.querySelector('.language-flag-emoji');
              if (fallback) {
                fallback.style.display = 'inline-block';
              }
            }}
          />
          <span className="language-flag-emoji" style={{ display: 'none' }}>
            {getLanguageFlagFromName(flag) || '🌐'}
          </span>
        </span>
      );
    }
    // It's an emoji, render as text
    return (
      <span className="language-flag">
        <span className="language-flag-emoji">{flag || '🌐'}</span>
      </span>
    );
  };

  // Helper function to get emoji flag from URL
  const getLanguageFlagFromName = (url) => {
    if (url.includes('/de.png')) return '🇩🇪';
    if (url.includes('/gb.png')) return '🇺🇸';
    if (url.includes('/ru.png')) return '🇷🇺';
    if (url.includes('/ar.png')) return '🇸🇦';
    if (url.includes('/fr.png')) return '🇫🇷';
    return '🌐';
  };

  if (compact) {
    return (
      <div className="language-switcher-compact">
        <button 
          className="language-button-compact"
          onClick={() => setIsOpen(!isOpen)}
          title={t('language')}
          disabled={isLoading || isApiLoading}
        >
          {isLoading || isApiLoading ? (
            <div className="language-loading-spinner"></div>
          ) : (
            renderFlag(currentLanguage?.flag)
          )}
        </button>
        
        {isOpen && (
          <div className="language-dropdown-compact">
            {availableLanguages.map((language) => (
              <button
                key={language.id || language.code}
                className={`language-option-compact ${language.name === languageName ? 'active' : ''}`}
                onClick={() => handleLanguageChange(language.name)}
                disabled={isLoading || isApiLoading}
              >
                {renderFlag(language.flag)}
                <span className="language-name">{language.name}</span>
                {(isLoading || isApiLoading) && language.name === languageName && (
                  <div className="language-loading-spinner-small"></div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="language-switcher">
      <button 
        className="language-button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || isApiLoading}
      >
        {isLoading || isApiLoading ? (
          <div className="language-loading-spinner"></div>
        ) : (
          <>
            {renderFlag(currentLanguage?.flag)}
            <span className="language-name">
              {currentLanguage?.name || 'English'}
            </span>
          </>
        )}
        <svg 
          className={`dropdown-arrow ${isOpen ? 'open' : ''}`} 
          width="12" 
          height="8" 
          viewBox="0 0 12 8" 
          fill="none"
        >
          <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      
      {isOpen && (
        <div className="language-dropdown">
          {availableLanguages.map((language) => (
            <button
              key={language.id || language.code}
              className={`language-option ${language.name === languageName ? 'active' : ''}`}
              onClick={() => handleLanguageChange(language.name)}
              disabled={isLoading || isApiLoading}
            >
              {renderFlag(language.flag)}
              <span className="language-name">{language.name}</span>
              {(isLoading || isApiLoading) && language.name === languageName && (
                <div className="language-loading-spinner-small"></div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;


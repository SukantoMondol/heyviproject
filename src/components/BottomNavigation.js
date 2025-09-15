import React, { useState, useEffect } from 'react';
import './BottomNavigation.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import QRScanner from './QRScanner';
import VoiceRecorder from './VoiceRecorder';
import Toast from './Toast';
import { getContentByHash, getElementByHash, getCollectionByHash } from '../services/apiService';
import { appConfig } from '../config';

const BottomNavigation = ({ onVoiceSearchResults }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, makeAuthenticatedRequest, user } = useAuth();
  const { t } = useLanguage();
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isVoiceRecorderOpen, setIsVoiceRecorderOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Close QR scanner when navigating away
  useEffect(() => {
    if (isQRScannerOpen) {
      setIsQRScannerOpen(false);
    }
  }, [location.pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setIsQRScannerOpen(false);
      setIsVoiceRecorderOpen(false);
    };
  }, []);

  const getActiveNavItem = () => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return t('home');
    if (path === '/my-courses') return t('myCourses');
    if (path === '/challenges') return t('challenges');
    if (path === '/profile') return t('profile');
    return t('home');
  };

  const activeNavItem = getActiveNavItem();

  // URL opening function - optimized for iOS in-app WebView
  const openUrlInSameTab = (url) => {
    try {
      console.log('Opening URL:', url);
      console.log('User Agent:', navigator.userAgent);
      console.log('Platform:', navigator.platform);
      
      // Store current URL to detect if navigation actually happened
      const currentUrl = window.location.href;
      
      // For iOS WebView (in-app), window.location.href is most reliable
      // This opens in the same tab and allows users to use back button
      window.location.href = url;
      
      // Set a timeout to check if navigation actually occurred
      // If we're still on the same page after 2 seconds, something went wrong
      setTimeout(() => {
        if (window.location.href === currentUrl) {
          console.warn('URL navigation may have failed - still on same page');
          setToast({ 
            show: true, 
            message: `Failed to navigate to: ${url}. URL may be blocked or invalid.`, 
            type: 'error'
          });
          
          // Try to copy to clipboard as fallback
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
              setTimeout(() => {
                setToast({ 
                  show: true, 
                  message: 'URL copied to clipboard as fallback', 
                  type: 'info'
                });
              }, 2000);
            }).catch((clipboardError) => {
              console.warn('Clipboard copy also failed:', clipboardError);
            });
          }
        }
      }, 2000);
      
    } catch (error) {
      console.warn('Error opening URL:', error);
      
      // Show the exact error message in the snackbar
      const errorMessage = error.message || error.toString() || 'Unknown error occurred';
      setToast({ 
        show: true, 
        message: `Failed to open URL: ${errorMessage}`, 
        type: 'error'
      });
      
      // Also try to copy to clipboard as fallback
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          // Show additional info about clipboard copy
          setTimeout(() => {
            setToast({ 
              show: true, 
              message: 'URL copied to clipboard as fallback', 
              type: 'info'
            });
          }, 2000);
        }).catch((clipboardError) => {
          console.warn('Clipboard copy also failed:', clipboardError);
        });
      }
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleVoiceSearchResults = (results) => {

    setToast({ 
      show: true, 
      message: (t('voiceSearchSummary') || '{collections} collections, {elements} elements')
        .replace('{collections}', String(results.data?.collections?.length || 0))
        .replace('{elements}', String(results.data?.elements?.length || 0)), 
      type: 'success' 
    });
    
    // Pass results to parent component if provided (Dashboard case)
    if (onVoiceSearchResults) {
      onVoiceSearchResults(results);
    } else {
      // For other pages, navigate to Dashboard with search results
      // This ensures voice search results are displayed consistently across all pages
      navigate('/dashboard', { 
        state: { 
          voiceSearchResults: results,
          fromVoiceSearch: true 
        } 
      });
    }
  };

  const handleQRScan = async (data) => {
    // Check if user is authenticated before processing QR scan
    if (!user) {
      setToast({ 
        show: true, 
        message: t('pleaseLoginFirst') || 'Please login first to scan QR codes', 
        type: 'error' 
      });
      return;
    }
    
    try {
      const trimmed = (data || '').trim();
      const isEAN = (text) => /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test((text || '').trim());
      const isAlnumHash = /^[A-Za-z0-9\-_]+$/.test(trimmed);
      
      // Check if URL contains the web app base URL from config
      const isWebAppUrl = (url) => {
        const baseUrl = appConfig.webAppBaseUrl;
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.toLowerCase();
          
          // Check if the hostname is exactly the base URL or ends with it as a proper domain
          if (hostname === baseUrl.toLowerCase()) {
            return true;
          }
          
          // Check if it's a subdomain of the base URL (e.g., www.killspam.de, api.killspam.de)
          if (hostname.endsWith('.' + baseUrl.toLowerCase())) {
            return true;
          }
          
          // Check if it's a subdomain that contains the base URL (e.g., hejvi.killspam.de)
          const parts = hostname.split('.');
          for (let i = 0; i < parts.length - 1; i++) {
            if (parts.slice(i).join('.') === baseUrl.toLowerCase()) {
              return true;
            }
          }
          
          return false;
        } catch (e) {
          // If URL parsing fails, fall back to simple string check
          return url.toLowerCase().includes(baseUrl.toLowerCase());
        }
      };
      
      const isHejviUrl = /(^https?:\/\/[^\s]*\.hejvi\.[^\s/]+(\/[^\s]*)?$)|(^https?:\/\/hejvi\.[^\s/]+(\/[^\s]*)?$)/i.test(trimmed);

      // Allow URLs that contain the web app base URL or are hejvi URLs
      const looksLikeUrl = /^https?:\/\//i.test(trimmed);
      if (looksLikeUrl && !isHejviUrl && !isWebAppUrl(trimmed)) {
        throw new Error(t('invalidQrUrl') || 'Blocked external URL');
      }

      // Handle different types of scanned data
      if (isHejviUrl || isWebAppUrl(trimmed)) {
        // Show loading message first
        setToast({ show: true, message: t('openingUrl') || 'Opening URL...', type: 'info' });
        
        // Validate URL before attempting to open
        try {
          new URL(trimmed);
        } catch (urlError) {
          setToast({ 
            show: true, 
            message: `Invalid URL format: ${trimmed}`, 
            type: 'error'
          });
          return;
        }
        
        // Open hejvi URLs or web app URLs in same tab for better iOS compatibility
        openUrlInSameTab(trimmed);
        
        // Update success message after a short delay (only if navigation succeeds)
        setTimeout(() => {
          // Only show success if we're still on the same page (navigation didn't happen)
          // If navigation happened, the user won't see this message anyway
          setToast({ show: true, message: t('urlOpened') || 'URL opened successfully', type: 'success' });
        }, 1500);
      } else if (data.startsWith('course:')) {
        // If it's a course ID, navigate to the course
        const courseId = data.replace('course:', '');
        navigate(`/course/${courseId}`);
        setToast({ show: true, message: t('navigatingCourse'), type: 'success' });
      } else if (data.startsWith('product:')) {
        // If it's a product code, you can handle it accordingly
        const productCode = data.replace('product:', '');
        setToast({ show: true, message: t('productCode').replace('{code}', productCode), type: 'info' });
      } else if (isEAN(trimmed)) {
        // EAN barcode (from feed card API)
        const ean = trimmed;
        setToast({ show: true, message: t('lookingUpEAN').replace('{ean}', ean), type: 'info' });

        // Fetch feed and search for matching EAN
        const response = await makeAuthenticatedRequest('/feed');
        const feedJson = await response.json();

        // Normalize to arrays of collections and elements
        const collections = Array.isArray(feedJson?.data) ? feedJson.data : (Array.isArray(feedJson) ? feedJson : []);

        // Helper to safely get possible EAN fields
        const getItemEAN = (item) => String(item?.EAN || item?.ean || item?.ean_number || '').trim();

        // Search elements first
        let matchElement = null;
        let matchCollection = null;

        for (const col of collections) {
          // Check collection itself (in case EAN exists at collection level)
          if (!matchCollection && getItemEAN(col) === ean) {
            matchCollection = col;
          }
          const elements = Array.isArray(col?.elements) ? col.elements : [];
          for (const el of elements) {
            if (getItemEAN(el) === ean) {
              matchElement = el;
              break;
            }
          }
          if (matchElement) break;
        }

        if (matchElement?.hash_id) {
          // Fetch full element details then navigate
          const full = await getElementByHash(matchElement.hash_id);
          navigate(`/feed/${matchElement.hash_id}`, {
            state: {
              elementData: full?.data,
              chapters: full?.chapters || [],
              related: full?.related || [],
              sourcePage: location.pathname || '/dashboard'
            }
          });
          setToast({ show: true, message: t('elementFound').replace('{name}', matchElement.name || matchElement.hash_id), type: 'success' });
          return;
        }

        if (matchCollection?.hash_id) {
          // Fetch full collection details then navigate
          const full = await getCollectionByHash(matchCollection.hash_id);
          navigate(`/collection/${matchCollection.hash_id}`, {
            state: {
              collectionData: full?.data,
              chapters: full?.chapters || [],
              related: full?.related || [],
              sourcePage: location.pathname || '/dashboard'
            }
          });
          setToast({ show: true, message: t('collectionFound').replace('{name}', matchCollection.name || matchCollection.hash_id), type: 'success' });
          return;
        }

        throw new Error(t('eanNotFound') || 'No item matched this EAN in the feed');
      } else if (trimmed.startsWith('el-')) {
        // Explicit element UUID handling - navigate to ElementPage instead of ElementFeed
        setToast({ show: true, message: t('fetchingContent'), type: 'info' });
        const full = await getElementByHash(trimmed);
        navigate(`/element/${trimmed}`, {
          state: {
            elementData: full?.data,
            chapters: full?.chapters || [],
            related: full?.related || [],
            fromQRScan: true, // Flag to indicate this came from QR scan
            sourcePage: location.pathname || '/dashboard'
          }
        });
        setToast({ show: true, message: t('elementFound').replace('{name}', full?.data?.name || trimmed), type: 'success' });
        return;
      } else if (trimmed.startsWith('col-')) {
        // Explicit collection UUID handling
        setToast({ show: true, message: t('fetchingContent'), type: 'info' });
        const full = await getCollectionByHash(trimmed);
        navigate(`/collection/${trimmed}`, {
          state: {
            collectionData: full?.data,
            chapters: full?.chapters || [],
            related: full?.related || [],
            sourcePage: location.pathname || '/dashboard'
          }
        });
        setToast({ show: true, message: t('collectionFound').replace('{name}', full?.data?.name || trimmed), type: 'success' });
        return;
      } else if (isAlnumHash) {
        // Try to fetch content by hash ID (element or collection)
        setToast({ show: true, message: t('fetchingContent'), type: 'info' });
        
        const content = await getContentByHash(trimmed);
        
        if (content.type === 'element') {
          // Navigate to element detail page
          navigate(`/feed/${trimmed}`, { 
            state: { 
              elementData: content.data.data,
              chapters: content.data.chapters,
              related: content.data.related,
              sourcePage: location.pathname || '/dashboard'
            }
          });
          setToast({ show: true, message: t('elementFound').replace('{name}', content.data.data.name), type: 'success' });
        } else if (content.type === 'collection') {
          // Navigate to collection detail page
          navigate(`/collection/${trimmed}`, { 
            state: { 
              collectionData: content.data.data,
              chapters: content.data.chapters,
              related: content.data.related,
              sourcePage: location.pathname || '/dashboard'
            }
          });
          setToast({ show: true, message: t('collectionFound').replace('{name}', content.data.data.name), type: 'success' });
        }
      } else {
        throw new Error(t('invalidQrContent') || 'Unsupported QR/EAN content');
      }
    } catch (error) {
      console.error('Error handling QR scan:', error);
      
      // Check if it's an authentication error
      if (error.message && error.message.includes('Authentication failed')) {
        setToast({ 
          show: true, 
          message: t('sessionExpired') || 'Your session has expired. Please login again.', 
          type: 'error'
        });
        // Don't redirect to login here as the ProtectedRoute will handle it
        return;
      }
      
      // Show the exact error message with more context
      const errorMessage = error.message || error.toString() || 'Unknown error occurred';
      setToast({ 
        show: true, 
        message: `QR Scan Error: ${errorMessage}`, 
        type: 'error'
      });
    }
  };

  return (
    <div className="bottom-navigation">
      <div className="nav-background">
        <svg className="nav-background-svg" width="100%" height="72" viewBox="0 0 440 72" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ filter: 'drop-shadow(0 -3px 10px rgba(0, 0, 0, 0.25))', WebkitFilter: 'drop-shadow(0 -3px 10px rgba(0, 0, 0, 0.25))' }}>
          <path d="M436 0C438.209 0 440 1.79086 440 4V68C440 70.2091 438.209 72 436 72H4C1.79086 72 1.61066e-08 70.2091 0 68V4C1.03083e-06 1.79086 1.79086 0 4 0H152.531C154.434 0 156.052 1.34767 156.582 3.17462C161.418 19.8277 176.787 32 195 32H245C263.213 32 278.582 19.8277 283.418 3.17462C283.948 1.34768 285.566 0 287.469 0H436Z" fill="white"/>
        </svg>
      </div>
      <div className="nav-content">
        <div className="nav-section left">
          <button 
            className={`nav-item ${activeNavItem === 'Home' ? 'active' : ''}`}
            onClick={() => {
      
              navigate('/', { state: { clearFilters: true } });
            }}
          >
            <div className={`nav-icon-container ${activeNavItem === 'Home' ? 'active' : ''}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke={activeNavItem === 'Home' ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 22V12H15V22" stroke={activeNavItem === 'Home' ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span>{t('home')}</span>
          </button>
          <button 
            className={`nav-item ${activeNavItem === t('myCourses') ? 'active' : ''}`}
            onClick={() => {
      
              navigate('/my-courses', { state: { clearFilters: true } });
            }}
          >
            <div className={`nav-icon-container ${activeNavItem === t('myCourses') ? 'active' : ''}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M2 3H8C9.06087 3 10.0783 3.42143 10.8284 4.17157C11.5786 4.92172 12 5.93913 12 7V21C12 20.2044 11.6839 19.4413 11.1213 18.8787C10.5587 18.3161 9.79565 18 9 18H2V3Z" stroke={activeNavItem === t('myCourses') ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 3H16C14.9391 3 13.9217 3.42143 13.1716 4.17157C12.4214 4.92172 12 5.93913 12 7V21C12 20.2044 12.3161 19.4413 12.8787 18.8787C13.4413 18.3161 14.2044 18 15 18H22V3Z" stroke={activeNavItem === t('myCourses') ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span>{t('myCourses')}</span>
          </button>
        </div>

        {/* Floating Action Buttons */}
        <div className="floating-buttons">
          <button 
            className="floating-button camera-button"
            onClick={() => setIsQRScannerOpen(true)}
          >
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g filter="url(#filter0_d_540_116)">
                <path d="M4 24C4 10.7452 14.7452 0 28 0C41.2548 0 52 10.7452 52 24C52 37.2548 41.2548 48 28 48C14.7452 48 4 37.2548 4 24Z" fill="#FF6407" shapeRendering="crispEdges"/>
                <path d="M21.1027 16.2334C20.8627 16.6132 20.5424 16.936 20.1644 17.179C19.7865 17.422 19.3599 17.5794 18.9147 17.64C18.408 17.712 17.9053 17.7894 17.4027 17.8734C15.9987 18.1067 15 19.3427 15 20.7654V32C15 32.7957 15.3161 33.5587 15.8787 34.1213C16.4413 34.684 17.2044 35 18 35H38C38.7957 35 39.5587 34.684 40.1213 34.1213C40.6839 33.5587 41 32.7957 41 32V20.7654C41 19.3427 40 18.1067 38.5973 17.8734C38.0943 17.7895 37.5902 17.7118 37.0853 17.64C36.6403 17.5792 36.214 17.4217 35.8363 17.1787C35.4586 16.9358 35.1385 16.6131 34.8987 16.2334L33.8027 14.4787C33.5565 14.0788 33.2176 13.7442 32.8147 13.503C32.4118 13.2619 31.9567 13.1214 31.488 13.0934C29.1643 12.9686 26.8357 12.9686 24.512 13.0934C24.0433 13.1214 23.5882 13.2619 23.1853 13.503C22.7824 13.7442 22.4435 14.0788 22.1973 14.4787L21.1027 16.2334Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M34 25C34 26.5913 33.3679 28.1174 32.2426 29.2426C31.1174 30.3679 29.5913 31 28 31C26.4087 31 24.8826 30.3679 23.7574 29.2426C22.6321 28.1174 22 26.5913 22 25C22 23.4087 22.6321 21.8826 23.7574 20.7574C24.8826 19.6321 26.4087 19 28 19C29.5913 19 31.1174 19.6321 32.2426 20.7574C33.3679 21.8826 34 23.4087 34 25ZM37 22H37.0107V22.0107H37V22Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
              <defs>
                <filter id="filter0_d_540_116" x="0" y="0" width="56" height="56" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                  <feOffset dy="4"/>
                  <feGaussianBlur stdDeviation="2"/>
                  <feComposite in2="hardAlpha" operator="out"/>
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.16 0"/>
                  <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_540_116"/>
                  <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_540_116" result="shape"/>
                </filter>
              </defs>
            </svg>
          </button>
          <button 
            className="floating-button mic-button"
            onClick={() => setIsVoiceRecorderOpen(true)}
          >
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g filter="url(#filter0_d_mic)">
                <path d="M4 24C4 10.7452 14.7452 0 28 0C41.2548 0 52 10.7452 52 24C52 37.2548 41.2548 48 28 48C14.7452 48 4 37.2548 4 24Z" fill="#A9ADAD" shapeRendering="crispEdges"/>
                <g transform="translate(12,12)">
                  <path d="M16 2C14.3431 2 13 3.34315 13 5V15C13 16.6569 14.3431 18 16 18C17.6569 18 19 16.6569 19 15V5C19 3.34315 17.6569 2 16 2Z" stroke="white" strokeWidth="2"/>
                  <path d="M9 13V15C9 19.4183 12.5817 23 17 23H15C19.4183 23 23 19.4183 23 15V13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 23V30" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 30H20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </g>
              </g>
              <defs>
                <filter id="filter0_d_mic" x="0" y="0" width="56" height="56" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                  <feFlood floodOpacity="0" result="BackgroundImageFix"/>
                  <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
                  <feOffset dy="4"/>
                  <feGaussianBlur stdDeviation="2"/>
                  <feComposite in2="hardAlpha" operator="out"/>
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.16 0"/>
                  <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_mic"/>
                  <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_mic" result="shape"/>
                </filter>
              </defs>
            </svg>
          </button>
        </div>

        <div className="nav-section right">
          <button 
            className={`nav-item ${activeNavItem === t('challenges') ? 'active' : ''}`}
            onClick={() => {
      
              navigate('/challenges', { state: { clearFilters: true } });
            }}
          >
            <div className={`nav-icon-container ${activeNavItem === t('challenges') ? 'active' : ''}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M2 2L12 7L22 2V17C22 17.5304 21.7893 18.0391 21.4142 18.4142C21.0391 18.7893 20.5304 19 20 19H4C3.46957 19 2.96086 18.7893 2.58579 18.4142C2.21071 18.0391 2 17.5304 2 17V2Z" stroke={activeNavItem === t('challenges') ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 7L12 12L22 7" stroke={activeNavItem === t('challenges') ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span>{t('challenges')}</span>
          </button>
          <button 
            className={`nav-item ${activeNavItem === t('profile') ? 'active' : ''}`}
            onClick={() => {
      
              navigate('/profile');
            }}
          >
            <div className={`nav-icon-container ${activeNavItem === t('profile') ? 'active' : ''}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke={activeNavItem === t('profile') ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke={activeNavItem === t('profile') ? '#FF6407' : '#A9ADAD'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span>{t('profile')}</span>
          </button>
        </div>
      </div>
      
      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScan={handleQRScan}
      />
      
      {/* Voice Recorder Modal */}
      <VoiceRecorder
        isOpen={isVoiceRecorderOpen}
        onClose={() => setIsVoiceRecorderOpen(false)}
        onSearchResults={handleVoiceSearchResults}
      />
      
      {/* Toast Notifications */}
      <Toast
        isVisible={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, show: false })}
      />
    </div>
  );
};

export default BottomNavigation;
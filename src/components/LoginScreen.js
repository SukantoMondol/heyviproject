
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import QRScanner from './QRScanner';
import { appConfig } from '../config';
import './LoginScreen.css';

const LoginScreen = () => {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const { login, error, clearError } = useAuth();
  const { t } = useLanguage();

  // Check for PIN in URL query parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinFromUrl = urlParams.get('pin');
    
    if (pinFromUrl) {
      setPin(pinFromUrl);
      // Automatically attempt login with PIN from URL
      handleAutoLogin(pinFromUrl);
    }
  }, []); // Empty dependency array since handleAutoLogin is defined in component

  const handleAutoLogin = async (pinValue) => {
    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const result = await login(pinValue);
      
      if (result.success) {
        setMessage({ text: t('loginSuccess'), type: 'success' });
        // The redirect will be handled by the PublicRoute component
      } else {
        const errorText = result.error || '';
        if (errorText === 'wrong_pin') {
          setMessage({ text: t('wrongPin'), type: 'error' });
        } else if (errorText.toLowerCase().includes('connect') || 
                   errorText.toLowerCase().includes('server')) {
          setMessage({ text: t('networkError'), type: 'error' });
        } else {
          setMessage({ text: errorText, type: 'error' });
        }
      }
    } catch (error) {
      setMessage({ text: t('generalError'), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      const lower = String(error).toLowerCase();
      const isPinError = error === 'wrong_pin' ||
        lower.includes('pin') || lower.includes('alphanumeric') ||
        lower.includes('invalid');
      const translated = isPinError ? t('wrongPin') : error;
      setMessage({ text: translated, type: 'error' });
    }
  }, [error]);

  const validatePin = (value) => {
    return value; // allow any characters, no length limit
  };

  const handlePinChange = (e) => {
    const validatedPin = validatePin(e.target.value);
    setPin(validatedPin);
    
    if (message.text) {
      setMessage({ text: '', type: '' });
      clearError();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await handleAutoLogin(pin);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  const handleQRScan = async (data) => {
    try {
      const trimmed = (data || '').trim();
      console.log('QR Code scanned:', trimmed);
      
      // Check if it's a login URL with PIN - support multiple URL patterns
      // More flexible approach to extract PIN from any URL
      
      // Pattern 1: Any URL with pin parameter
      const anyUrlWithPinPattern = /[?&]pin=([^&\s]+)/i;
      // Pattern 2: Just the PIN value (fallback for simple QR codes)
      const pinOnlyPattern = /^[a-zA-Z0-9_-]+$/;
      
      let pinFromQR = null;
      
      // Try to find pin parameter in any URL
      let match = trimmed.match(anyUrlWithPinPattern);
      if (match && match[1]) {
        pinFromQR = match[1];
        console.log('PIN extracted from URL parameter:', pinFromQR);
      } else if (pinOnlyPattern.test(trimmed)) {
        // If it's just a PIN value, use it directly
        pinFromQR = trimmed;
        console.log('Using direct PIN value:', pinFromQR);
      } else {
        // Try to extract PIN from the last part of the URL path
        const urlPathMatch = trimmed.match(/\/([a-zA-Z0-9_-]+)(?:\?|$)/i);
        if (urlPathMatch && urlPathMatch[1] && pinOnlyPattern.test(urlPathMatch[1])) {
          pinFromQR = urlPathMatch[1];
          console.log('PIN extracted from URL path:', pinFromQR);
        }
      }
      
      if (pinFromQR) {
        console.log('PIN extracted from QR:', pinFromQR);
        setPin(pinFromQR);
        setIsQRScannerOpen(false);
        // Automatically attempt login with PIN from QR
        await handleAutoLogin(pinFromQR);
      } else {
        console.log('No valid PIN found in QR code');
        setMessage({ text: 'Invalid login QR code - no PIN found', type: 'error' });
        setIsQRScannerOpen(false);
      }
    } catch (error) {
      console.error('Error processing QR code:', error);
      setMessage({ text: 'Failed to process QR code', type: 'error' });
      setIsQRScannerOpen(false);
    }
  };

  return (
    <>
      <div className="main-content">
        {/* Logo Section */}
        <div className="logo-section">
          <h1 className="logo">HeyVi</h1>
        </div>

        {/* Login Form */}
        <div className="login-section">
          <div className="login-header">
            <h2 className="login-title">{t('login')}</h2>
            <p className="welcome-text">{t('welcome')}</p>
          </div>

          <form className="form-container" onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label" htmlFor="pin-input">
                <svg className="lock-icon" width="11" height="12" viewBox="0 0 11 12" fill="none">
                  <path d="M2.75 5.5V3.5C2.75 1.84 4.09 0.5 5.75 0.5C7.41 0.5 8.75 1.84 8.75 3.5V5.5H9.5C10.05 5.5 10.5 5.95 10.5 6.5V10.5C10.5 11.05 10.05 11.5 9.5 11.5H2C1.45 11.5 1 11.05 1 10.5V6.5C1 5.95 1.45 5.5 2 5.5H2.75ZM4 5.5H7.5V3.5C7.5 2.4 6.6 1.5 5.5 1.5C4.4 1.5 3.5 2.4 3.5 3.5V5.5H4Z" fill="#FB923C"/>
                </svg>
                {t('enterPin')}
              </label>
              <input 
                type="password" 
                id="pin-input"
                className={`pin-input ${message.type === 'error' ? 'error' : ''}`}
                placeholder=""
                value={pin}
                onChange={handlePinChange}
                onKeyDown={handleKeyDown}
                // no maxLength restriction
                autoComplete="off"
                disabled={isLoading}
              />
            </div>

            <button 
              type="submit" 
              className={`login-button ${isLoading ? 'loading' : ''}`}
              disabled={isLoading || pin.length === 0}
            >
              {!isLoading && (
                <>
                  <svg className="login-icon" width="18" height="16" viewBox="0 0 18 16" fill="none">
                    <path d="M10 1L16 8L10 15M16 8H2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>{t('login')}</span>
                </>
              )}
            </button>

            {/* Message Display */}
            {message.text && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}
          </form>

          {/* QR Login Option */}
          <div className="qr-login-section">
            <button 
              type="button"
              className="qr-login-button"
              onClick={() => setIsQRScannerOpen(true)}
              disabled={isLoading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 3H11V11H3V3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 3H21V11H13V3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 13H11V21H3V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 13H15V15H13V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 13H19V15H17V13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 17H15V19H13V17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 17H19V19H17V17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 21H21V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 15H19V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('loginWithQRCode') || 'Login with QR Code'}
            </button>
          </div>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScan={handleQRScan}
      />
    </>
  );
};

export default LoginScreen;
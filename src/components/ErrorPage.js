import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ErrorPage.css';

const ErrorPage = ({ errorCode = '404', errorMessage = "Oops! Page not found", errorDescription = "The page you're looking for doesn't exist or was moved." }) => {
  const navigate = useNavigate();
  
  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="error-container">

      {/* Error Content */}
      <div className="error-content">
        <div className="error-section">
          <div className="error-icon-container">
            <div className="error-icon-background">
              <div className="error-icon">
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                  <path d="M30 5C16.1929 5 5 16.1929 5 30C5 43.8071 16.1929 55 30 55C43.8071 55 55 43.8071 55 30C55 16.1929 43.8071 5 30 5ZM30 45C28.6193 45 27.5 43.8807 27.5 42.5C27.5 41.1193 28.6193 40 30 40C31.3807 40 32.5 41.1193 32.5 42.5C32.5 43.8807 31.3807 45 30 45ZM32.5 35H27.5V15H32.5V35Z" fill="#FB923C"/>
                </svg>
              </div>
            </div>
          </div>
          
          <h1 className="error-code">{errorCode}</h1>
          <h2 className="error-message">{errorMessage}</h2>
          <p className="error-description">{errorDescription}</p>
        </div>

        <button className="go-home-button" onClick={handleGoHome}>
          <div className="button-icon">
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
              <path d="M6.5 13L1 7.5L6.5 2M1.8 7.5H15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="button-text">Go to Home</span>
        </button>
      </div>
    </div>
  );
};

export default ErrorPage;
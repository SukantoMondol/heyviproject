import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Custom hook to handle back button navigation for external QR scans
 * When a user accesses any page directly (no history), back button should go to dashboard
 * 
 * Usage:
 * ```javascript
 * const { handleBackClick } = useExternalBackButton('/dashboard');
 * 
 * // Use in button onClick
 * <button onClick={handleBackClick}>Back</button>
 * 
 * // Or pass to GlobalAppBar
 * <GlobalAppBar onBackClick={handleBackClick} />
 * ```
 */
export const useExternalBackButton = (fallbackPath = '/dashboard') => {
  const location = useLocation();
  const navigate = useNavigate();

  // Check if this is a direct access (external QR scan) - no state information
  const isDirectAccess = !location?.state || Object.keys(location.state).length === 0;

  useEffect(() => {
    const handlePopState = (event) => {
      console.log('Popstate event triggered');
      
      if (isDirectAccess) {
        console.log('External QR scan detected (popstate) - navigating to dashboard');
        // Prevent default back behavior and navigate to dashboard
        event.preventDefault();
        navigate(fallbackPath, { replace: true });
      } else {
        // For normal navigation, let the browser handle it naturally
        console.log('Normal navigation - allowing browser back');
      }
    };

    // Add popstate listener for browser back button
    window.addEventListener('popstate', handlePopState);

    // Handle device back button on mobile (if supported)
    const handleBackButton = () => {
      console.log('Device back button pressed');
      
      if (isDirectAccess) {
        console.log('External QR scan detected (device back) - navigating to dashboard');
        navigate(fallbackPath, { replace: true });
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior
    };

    // Add device back button listener (for mobile apps)
    if (window.DeviceBackButton) {
      window.DeviceBackButton.addListener(handleBackButton);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.DeviceBackButton) {
        window.DeviceBackButton.removeListener(handleBackButton);
      }
    };
  }, [isDirectAccess, navigate, fallbackPath]);

  // Function to handle back button clicks
  const handleBackClick = () => {
    console.log('Back button clicked - location.state:', location?.state);
    console.log('Back button clicked - isDirectAccess:', isDirectAccess);
    console.log('Back button clicked - history.length:', window.history.length);
    
    if (isDirectAccess) {
      // For external QR scans, always go to dashboard
      console.log('External QR scan detected - navigating to dashboard');
      navigate(fallbackPath, { replace: true });
    } else {
      // For normal navigation, try history first, then fallback to dashboard
      if (window.history.length > 1) {
        try {
          console.log('Using window.history.back()');
          window.history.back();
        } catch (e) {
          console.log('history.back() failed, using navigate to dashboard:', e);
          // If history.back() fails, default to dashboard for safety
          navigate(fallbackPath, { replace: true });
        }
      } else {
        console.log('No history available, defaulting to dashboard');
        // No history available, default to dashboard
        navigate(fallbackPath, { replace: true });
      }
    }
  };

  return {
    isDirectAccess,
    handleBackClick
  };
};

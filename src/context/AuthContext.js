import React, { createContext, useContext, useState, useEffect } from 'react';
import { appConfig } from '../config';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientLogoUrl, setClientLogoUrl] = useState('');

  const API_BASE = appConfig.apiBaseUrl;

  useEffect(() => {
    checkExistingAuth();
  }, []);

  // Helper to extract client logo URL from various API shapes
  const extractLogoUrl = (obj) => {
    if (!obj) return '';
    const fromDirect = obj?.client?.logo_url;
    const fromNested = obj?.data?.client?.logo_url;
    const fromClientArray = Array.isArray(obj?.client) && obj.client.length > 0 ? obj.client[0]?.logo_url : '';
    const fromClientsArray = Array.isArray(obj?.clients) && obj.clients.length > 0 ? obj.clients[0]?.logo_url : '';
    const alt = obj?.client_logo_url || obj?.logo_url;
    const result = fromDirect || fromNested || fromClientArray || fromClientsArray || alt || '';
    return (typeof result === 'string' && result.trim().length > 2) ? result.trim() : '';
  };

  const checkExistingAuth = async () => {
    try {
      const accessToken = localStorage.getItem('hejvi_access_token');
      const expiryTime = localStorage.getItem('hejvi_token_expiry');
      const userData = localStorage.getItem('hejvi_user');

      if (accessToken && expiryTime && userData) {
        const now = Date.now();
        const expiry = parseInt(expiryTime);

        if (now < expiry) {
          // Token is still valid
          setUser(JSON.parse(userData));
          // Initialize cached logo URL from stored user if available
          try {
            const parsed = JSON.parse(userData);
            const logo = extractLogoUrl(parsed);
            if (logo) {
              setClientLogoUrl(logo);
              localStorage.setItem('hejvi_client_logo_url', logo);
            } else {
              const cached = localStorage.getItem('hejvi_client_logo_url');
              if (cached) setClientLogoUrl(cached);
            }
          } catch (_) {}
        } else {
          // Token expired, try to refresh
          const refreshResult = await refreshToken();
          if (refreshResult.success) {
            setUser(JSON.parse(localStorage.getItem('hejvi_user')));
            // Try to restore logo from storage after refresh
            const cached = localStorage.getItem('hejvi_client_logo_url');
            if (cached) setClientLogoUrl(cached);
          } else {
            clearStoredAuth();
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing auth:', error);
      clearStoredAuth();
    } finally {
      setLoading(false);
    }
  };

  const login = async (pin) => {
    try {
      setError(null);
      setLoading(true);

  

      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        body: JSON.stringify({ pin })
      });



      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        const errorMessage = 'Invalid server response';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }

      if (response.ok) {
        storeTokens(data.access_token, data.refresh_token);
        storeUserData(data.user);
        // Cache logo URL from login response (may include client array)
        const logo = extractLogoUrl(data) || extractLogoUrl(data.user);
        if (logo) {
          setClientLogoUrl(logo);
          localStorage.setItem('hejvi_client_logo_url', logo);
        }
        
        // Store available languages from login response
        if (data.available_languages) {
          localStorage.setItem('hejvi_available_languages', JSON.stringify(data.available_languages));
        }
        
        setUser(data.user);
        return { success: true, data };
      } else {
        // Handle specific error responses from server
        const errorMessage = data.message || data.error || 'Login failed';
        
        // Check if it's a PIN-related error (broadened)
        const lower = String(errorMessage).toLowerCase();
        if (lower.includes('invalid pin') ||
            lower.includes('wrong pin') ||
            lower.includes('incorrect pin') ||
            lower.includes('alphanumeric') ||
            lower.includes('pin')) {
          setError('wrong_pin');
          return { success: false, error: 'wrong_pin' };
        }
        
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('Login error:', error);

      // Check if it's a network error or server error
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        // Network error - can't connect to server
        const errorMessage = 'Unable to connect to server';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } else if (error.message && error.message.includes('HTTP')) {
        // HTTP error response - extract the actual error message
        const errorMessage = error.message.replace(/^HTTP \d+: /, '');
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } else {
        // Generic error
        const errorMessage = 'Login failed. Please try again.';
        setError(errorMessage);
        return { success: false, error: errorMessage };
      }
    } finally {
      setLoading(false);
    }
  };



  const refreshToken = async () => {
    const refreshTokenValue = localStorage.getItem('hejvi_refresh_token');

    if (!refreshTokenValue) {
      return { success: false, error: 'No refresh token available' };
    }

    try {
      const response = await fetch(`${API_BASE}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshTokenValue}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        storeTokens(data.access_token, refreshTokenValue);
        return { success: true, data };
      } else {
        clearStoredAuth();
        return { success: false, error: data.message || 'Token refresh failed' };
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      clearStoredAuth();
      return { success: false, error: 'Unable to refresh token' };
    }
  };

  const logout = async () => {
    const accessToken = localStorage.getItem('hejvi_access_token');

    if (accessToken) {
      try {
        await fetch(`${API_BASE}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    clearStoredAuth();
    setUser(null);
    setError(null);
  };

  const storeTokens = (accessToken, refreshTokenValue) => {
    localStorage.setItem('hejvi_access_token', accessToken);
    localStorage.setItem('hejvi_refresh_token', refreshTokenValue);

    // Set token expiry (15 minutes for access token)
    const expiryTime = Date.now() + (15 * 60 * 1000);
    localStorage.setItem('hejvi_token_expiry', expiryTime.toString());
  };

  const storeUserData = (userData) => {
    localStorage.setItem('hejvi_user', JSON.stringify(userData));
  };

  const clearStoredAuth = () => {
    localStorage.removeItem('hejvi_access_token');
    localStorage.removeItem('hejvi_refresh_token');
    localStorage.removeItem('hejvi_token_expiry');
    localStorage.removeItem('hejvi_user');
  };

  // Utility method to make authenticated API calls
  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    const accessToken = localStorage.getItem('hejvi_access_token');

    if (!accessToken) {
      throw new Error('No access token available');
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      let response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      if (response.status === 401) {
        // Token might be expired, try to refresh
        const refreshResult = await refreshToken();
        if (refreshResult.success) {
          // Retry the request with new token
          headers.Authorization = `Bearer ${localStorage.getItem('hejvi_access_token')}`;
          response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
        } else {
          // Refresh failed, redirect to login
          logout();
          throw new Error('Authentication failed');
        }
      }

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch (_) {
          errorText = `HTTP ${response.status}`;
        }
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return response;
    } catch (error) {
      console.error('Authenticated request failed:', error);
      throw error;
    }
  };

  // API helper methods for the new endpoints
  const getFeed = async (filters = {}) => {
    try {
      // Build query parameters for filtering
      const queryParams = new URLSearchParams();
      // Prefer comma-separated 'tags' like challenges endpoint; keep backward-compatible repeated 'tag'
      if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
        const cleaned = filters.tags.filter(Boolean).map(String);
        if (cleaned.length > 0) {
          queryParams.append('tags', cleaned.join(','));
          // Back-compat: also append singular tag entries if backend supports it
          cleaned.forEach((tag) => queryParams.append('tag', tag));
        }
      }
      if (filters.language_id) {
        queryParams.append('language_id', filters.language_id);
      }
      if (filters.page) {
        queryParams.append('page', filters.page);
      }
      if (filters.per_page) {
        queryParams.append('per_page', filters.per_page);
      }

      const url = `/feed${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await makeAuthenticatedRequest(url);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch feed:', error);
      throw error;
    }
  };

  // Search elements/collections by term
  const searchByTerm = async (query, options = {}) => {
    if (!query || !String(query).trim()) {
      return { status: 'success', data: { collections: [], elements: [], tags: [] } };
    }
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('q', String(query).trim());
      if (options.limit) queryParams.append('limit', String(options.limit));
      if (options.type) queryParams.append('type', String(options.type));
      if (options.language_id) queryParams.append('language_id', String(options.language_id));

      const url = `/byterm?${queryParams.toString()}`;
      const response = await makeAuthenticatedRequest(url);
      return await response.json();
    } catch (error) {
      console.error('Failed to search by term:', error);
      throw error;
    }
  };

  const getFavourites = async () => {
    try {
      const response = await makeAuthenticatedRequest('/favourites');
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch favourites:', error);
      throw error;
    }
  };

  const getElement = async (hashId) => {
    try {
      const response = await makeAuthenticatedRequest(`/element/${hashId}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch element:', error);
      throw error;
    }
  };

  const getCollection = async (hashId) => {
    try {
      const response = await makeAuthenticatedRequest(`/collection/${hashId}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch collection:', error);
      throw error;
    }
  };

  const getUser = async () => {
    try {
      const response = await makeAuthenticatedRequest('/user');
      if (!response.ok) {
        throw new Error(`Failed to fetch /user: ${response.status}`);
      }
      const data = await response.json();
      // Update cached logo URL from /user response
      const logo = extractLogoUrl(data) || extractLogoUrl(data?.data);
      if (logo) {
        setClientLogoUrl(logo);
        localStorage.setItem('hejvi_client_logo_url', logo);
      }
      return data;
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      // Fallback to stored user data from context or localStorage
      if (user) return user;
      const stored = localStorage.getItem('hejvi_user');
      if (stored) return JSON.parse(stored);
      throw error;
    }
  };

  // Toggle favourites by hash_id (GET endpoint supported by server)
  const toggleFavourites = async (hashId) => {
    if (!hashId) {
      throw new Error('toggleFavourites: hashId is required');
    }
    try {
      // Try GET endpoint first
      let response = await makeAuthenticatedRequest(`/toggle-favourites/${hashId}`);
      return await response.json();
    } catch (error) {
      // Fallback to POST endpoint with body { hash_id }
      try {
        const response = await makeAuthenticatedRequest('/toggle-favourites', {
          method: 'POST',
          body: JSON.stringify({ hash_id: hashId })
        });
        return await response.json();
      } catch (postError) {
        console.error('Failed to toggle favourites:', postError);
        throw postError;
      }
    }
  };

  // Set progress for an element or collection by hash_id
  const setProgress = async (hashId, progress) => {
    if (!hashId) {
      throw new Error('setProgress: hashId is required');
    }
    
    // Validate progress value
    const progressValue = Math.min(100, Math.max(0, Number(progress) || 0));
    
    try {
      const response = await makeAuthenticatedRequest('/set-progress', {
        method: 'POST',
        body: JSON.stringify({
          progress: String(progressValue),
          hash_id: hashId
        })
      });
      
      const result = await response.json();
      
      // Log successful progress updates for debugging
      if (result?.status === 'success') {
        console.log(`Progress updated: ${hashId} -> ${progressValue}%`, result.data);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to set progress:', error);
      throw error;
    }
  };

  // Optional: set user settings (language etc.)
  const setSettings = async (settings) => {
    try {
      const response = await makeAuthenticatedRequest('/set-settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to set settings:', error);
      throw error;
    }
  };

  // My courses list (if supported by backend)
  const getMyCourses = async () => {
    try {
      const response = await makeAuthenticatedRequest('/mycourses');
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch my courses:', error);
      throw error;
    }
  };

  // Contact support (if supported by backend)
  const contactSupport = async (contactData) => {
    try {
      const response = await makeAuthenticatedRequest('/support', {
        method: 'POST',
        body: JSON.stringify(contactData)
      });
      return response;
    } catch (error) {
      console.error('Failed to send support message:', error);
      throw error;
    }
  };

  // Get all challenges
  const getChallenges = async (filters = {}) => {
    try {
      // Build query parameters for filtering
      const queryParams = new URLSearchParams();
      if (filters.tags && filters.tags.length > 0) {
        queryParams.append('tags', filters.tags.join(','));
      }
      if (filters.language_id) {
        queryParams.append('language_id', filters.language_id);
      }
      if (filters.page) {
        queryParams.append('page', filters.page);
      }
      if (filters.per_page) {
        queryParams.append('per_page', filters.per_page);
      }
      
      const url = `/challenges${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await makeAuthenticatedRequest(url);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch challenges:', error);
      throw error;
    }
  };

  // Get current active challenges
  const getCurrentChallenges = async () => {
    try {
      const response = await makeAuthenticatedRequest('/current-challenges');
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch current challenges:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    error,
    clientLogoUrl,
    login,
    logout,
    refreshToken,
    makeAuthenticatedRequest,
    getFeed,
    getFavourites,
    getElement,
    getCollection,
    getUser,
    toggleFavourites,
    setProgress,
    setSettings,
    getMyCourses,
    contactSupport,
    getChallenges,
    getCurrentChallenges,
    searchByTerm,
    clearError: () => setError(null)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
import { appConfig } from '../config';
const API_BASE = appConfig.apiBaseUrl;

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
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

export const getElementByHash = async (hashId) => {
  try {
    const response = await makeAuthenticatedRequest(`/element/${hashId}`, {
      method: 'GET'
    });
    return response;
  } catch (error) {
    console.error('Error fetching element:', error);
    throw error;
  }
};

export const getCollectionByHash = async (hashId) => {
  try {
    const response = await makeAuthenticatedRequest(`/collection/${hashId}`, {
      method: 'GET'
    });
    return response;
  } catch (error) {
    console.error('Error fetching collection:', error);
    throw error;
  }
};

export const getContentByHash = async (hashId) => {
  try {
    try {
      const elementResponse = await getElementByHash(hashId);
      return { type: 'element', data: elementResponse };
    } catch (elementError) {
      console.log('Not an element, trying collection...');
      
      try {
        const collectionResponse = await getCollectionByHash(hashId);
        return { type: 'collection', data: collectionResponse };
      } catch (collectionError) {
        throw new Error(`Content not found: ${hashId}`);
      }
    }
  } catch (error) {
    console.error('Error fetching content by hash:', error);
    throw error;
  }
};

export const voiceSearch = async (audioFile, options = {}) => {
  try {
    const accessToken = localStorage.getItem('hejvi_access_token');

    if (!accessToken) {
      throw new Error('No access token available');
    }

    console.log('Voice search request:', {
      fileSize: audioFile.size,
      fileType: audioFile.type,
      fileName: audioFile.name,
      options
    });

    const formData = new FormData();
    formData.append('audio', audioFile);

    const queryParams = new URLSearchParams();
    if (options.limit) queryParams.append('limit', options.limit);
    if (options.type) queryParams.append('type', options.type);
    if (options.language_id) queryParams.append('language_id', options.language_id);

    const url = `${API_BASE}/voice-search${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    console.log('Making voice search request to:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    console.log('Voice search response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Voice search error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('Voice search result:', result);
    return result;
  } catch (error) {
    console.error('Voice search error:', error);
    throw error;
  }
};

// Set progress for an element or collection
export const setProgress = async (hashId, progress) => {
  try {
    const progressValue = Math.min(100, Math.max(0, Number(progress) || 0));
    
    const response = await makeAuthenticatedRequest('/set-progress', {
      method: 'POST',
      body: JSON.stringify({
        progress: String(progressValue),
        hash_id: hashId
      })
    });

    const result = await response.json();
    
    if (result?.status === 'success') {
      console.log(`Progress updated: ${hashId} -> ${progressValue}%`, result.data);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to set progress:', error);
    throw error;
  }
};

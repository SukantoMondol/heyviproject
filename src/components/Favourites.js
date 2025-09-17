import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getContentByHash } from '../services/apiService';
import GlobalLayout from './GlobalLayout';
import './Dashboard.css';

const Favourites = () => {
  const navigate = useNavigate();
  const { getFavourites, toggleFavourites } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleRemoveFavorite = async (hashId, event) => {
    event.stopPropagation(); // Prevent card click
    try {
      console.log('Removing favorite with hashId:', hashId);
      const toggleResponse = await toggleFavourites(hashId);
      console.log('Toggle response:', toggleResponse);
      
      // Refresh the favorites list
      const response = await getFavourites();
      console.log('Refreshed favourites response:', response);
      
      if (response && response.status === 'success' && Array.isArray(response.data)) {
        setItems(response.data);
      } else if (Array.isArray(response)) {
        setItems(response);
      } else if (response && Array.isArray(response.items)) {
        setItems(response.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.error('Error removing favorite:', err);
      setError('Failed to remove favorite');
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await getFavourites();
        
        console.log('Favourites API response:', response);
        
        // Handle the API response structure: { status: "success", data: [...] }
        if (response && response.status === 'success' && Array.isArray(response.data)) {
          console.log('Setting favourites from response.data:', response.data);
          setItems(response.data);
        } else if (Array.isArray(response)) {
          // Fallback for direct array response
          console.log('Setting favourites from direct array:', response);
          setItems(response);
        } else if (response && Array.isArray(response.items)) {
          // Fallback for items property
          console.log('Setting favourites from response.items:', response.items);
          setItems(response.items);
        } else {
          console.log('No favourites found, setting empty array');
          setItems([]);
        }
      } catch (err) {
        console.error('Error loading favourites:', err);
        setError('Failed to load favourites');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [getFavourites]);

  // Resolve unknown hash ids and navigate to the right screen
  const openFavourite = async (id) => {
    try {
      const hashId = String(id || '').trim();
      if (!hashId) return;

      // Route by prefix when possible
      if (hashId.startsWith('el-')) {
        navigate(`/element/${hashId}`, { state: { sourcePage: '/favourites' } });
        return;
      }
      if (hashId.startsWith('col-')) {
        navigate(`/course/${hashId}`, { state: { sourcePage: '/favourites' } });
        return;
      }

      // Fallback: ask backend what this id is
      const content = await getContentByHash(hashId);
      if (content?.type === 'element') {
        navigate(`/element/${hashId}`, { state: { sourcePage: '/favourites', elementData: content.data?.data } });
      } else if (content?.type === 'collection') {
        navigate(`/course/${hashId}`, { state: { sourcePage: '/favourites', collectionData: content.data?.data } });
      } else {
        setError('Failed to load element');
      }
    } catch (e) {
      console.error('Open favourite failed:', e);
      setError('Failed to load element');
    }
  };

  return (
    <GlobalLayout title="Favorites">
      {loading && (
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading favorites...</p>
        </div>
      )}

      {!loading && error && (
        <div className="error-section">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="favorites-grid">
          {items.length === 0 && (
            <div className="favorites-empty-state">
              <p>No favorites yet.</p>
            </div>
          )}
          {items.map((item, idx) => (
            <div
              key={item.hash_id || item.id || idx}
              className="favorite-card"
              onClick={() => {
                const id = item.hash_id || item.id;
                if (id) openFavourite(id);
              }}
            >
              <div className="favorite-card-content">
                <div className="favorite-card-header">
                  <h3 className="favorite-card-title">{item.name || item.title || 'Untitled'}</h3>
                  <button
                    className="favorite-remove-button"
                    onClick={(e) => handleRemoveFavorite(item.hash_id || item.id, e)}
                    title="Remove from favorites"
                  >
                    ×
                  </button>
                </div>
                <p className="favorite-card-description">
                  {item.description || 'Favorite item'}
                </p>
                {item.url_thumbnail && (
                  <div className="favorite-card-thumbnail">
                    <img src={item.url_thumbnail} alt={item.name || 'Thumbnail'} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlobalLayout>
  );
};

export default Favourites;



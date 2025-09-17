import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import GlobalAppBar from './GlobalAppBar';
import { appConfig } from '../config';
import BottomNavigation from './BottomNavigation';


import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { makeAuthenticatedRequest, toggleFavourites, setProgress, getFeed, searchByTerm } = useAuth();
  const { t, currentLanguage } = useLanguage();
  const [feedData, setFeedData] = useState([]);
  const [allFeedData, setAllFeedData] = useState([]);
  const [favourites, setFavourites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeNavItem, setActiveNavItem] = useState('Home');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [metaAllTags, setMetaAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef(null);
  const feedContainerRef = useRef(null);
  const observerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const [isTwoColumnLayout, setIsTwoColumnLayout] = useState(true); // Default to 2-column

  // Helper function to calculate collection progress based on elements
  const calculateCollectionProgress = (item) => {
    if (!item.isCollection || !Array.isArray(item.elements) || item.elements.length === 0) {
      return parseFloat(item.progress || 0);
    }
    
    // Calculate average progress of all elements in the collection
    const totalProgress = item.elements.reduce((sum, el) => {
      return sum + parseFloat(el.progress || 0);
    }, 0);
    
    return Math.round(totalProgress / item.elements.length);
  };

  // Load display preference from localStorage on component mount
  useEffect(() => {
    const savedLayout = localStorage.getItem('hejvi_display_layout');
    if (savedLayout !== null) {
      setIsTwoColumnLayout(savedLayout === 'two-column');
    }
  }, []);

  // Save display preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('hejvi_display_layout', isTwoColumnLayout ? 'two-column' : 'single-column');
  }, [isTwoColumnLayout]);


  useEffect(() => {
    fetchFeedData(true); // Force refresh on initial load
    fetchFavourites();
  }, []);

  // Clear tag filters when navigation requests it
  useEffect(() => {
    if (location?.state?.clearFilters) {
      setSelectedTags([]);
      setSearchQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.state?.clearFilters]);

  // Handle voice search results from navigation state
  useEffect(() => {
    if (location?.state?.fromVoiceSearch && location?.state?.voiceSearchResults) {
      console.log('Dashboard received voice search results from navigation:', location.state.voiceSearchResults);
      handleVoiceSearchResults(location.state.voiceSearchResults);
      // Clear the navigation state to prevent re-processing
      navigate('/dashboard', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.state?.fromVoiceSearch, location?.state?.voiceSearchResults]);

  // When tag filters change, reset pagination and fetch fresh from server
  useEffect(() => {
    if (searchQuery.trim()) return;
    setLoading(true);
    setHasMore(true);
    setAllFeedData([]);
    setFeedData([]);
    setPage(1);
    isFetchingRef.current = false;
    // Kick off an immediate fetch for page 1 rather than waiting
    // for the [page, perPage] effect to avoid any races
    (async () => {
      await fetchFeedData(true);
      // Scroll to top after applying new filter
      try { feedContainerRef.current && (feedContainerRef.current.scrollTop = 0); } catch(_) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  // Load data when page/perPage changes (for lazy loading)
  useEffect(() => {
    if (!searchQuery.trim()) {
      fetchFeedData(page === 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Infinite scroll: observe sentinel to load next page
  const handleIntersect = useCallback((entries) => {
    const first = entries[0];
    if (first.isIntersecting && hasMore && !loading && !isSearchActive && !isFetchingRef.current) {
      isFetchingRef.current = true;
      setPage(prev => prev + 1);
    }
  }, [hasMore, loading, isSearchActive]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (loadMoreRef.current) {
      observerRef.current = new IntersectionObserver(handleIntersect, {
        root: null,
        rootMargin: '100px',
        threshold: 0.1
      });
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleIntersect, hasMore, loading, isSearchActive]);




  const fetchFeedData = async (forceRefresh = false) => {
    try {
      isFetchingRef.current = true;
      setLoading(true);
      
      const raw = await getFeed({
        page,
        tags: selectedTags.length > 0 ? selectedTags : undefined
      });

      // Extract items array from API response
      let list = [];
      if (raw?.status === 'success' && Array.isArray(raw?.data)) {
        list = raw.data;
      } else if (Array.isArray(raw)) {
        list = raw;
      } else if (Array.isArray(raw?.data)) {
        list = raw.data;
      }

      // Capture meta all_tags for multilingual tag rendering (preserve existing if new is empty)
      const apiAllTags = raw?.meta?.all_tags || [];
      if (apiAllTags.length > 0) {
        setMetaAllTags(apiAllTags);
      }

      // Check if there are more pages
      const received = Array.isArray(list) ? list.length : 0;
      setHasMore(received > 0);

      // Simple append for pagination - let backend handle deduplication
      if (page === 1 || forceRefresh) {
        setAllFeedData(list);
        setFeedData(list);
      } else {
        const nextAll = [...allFeedData, ...list];
        setAllFeedData(nextAll);
        setFeedData(prev => [...prev, ...list]);
      }

      // Tags list will be driven by metaAllTags effect below
      
    } catch (error) {
      console.error('Failed to fetch feed data:', error);
      if (page === 1) {
        setFeedData([]);
        setAllFeedData([]);
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Helper to aggregate tags from a list of feed items
  const aggregateTagsFromList = (items) => {
    const tagSet = new Set();
    items.forEach((item) => {
      (Array.isArray(item.tags) ? item.tags : []).forEach((tag) => {
        const tagName = tag?.name || tag;
        const tagType = tag?.type ?? tag?.type_id;
        if (tagName && Number(tagType) === 1) tagSet.add(tagName);
      });
      (Array.isArray(item.elements) ? item.elements : []).forEach((el) => {
        (Array.isArray(el.tags) ? el.tags : []).forEach((tag) => {
          const tagName = tag?.name || tag;
          const tagType = tag?.type ?? tag?.type_id;
          if (tagName && Number(tagType) === 1) tagSet.add(tagName);
        });
      });
    });
    return Array.from(tagSet).sort();
  };

  // Fetch tags from current feed data (preserve tags during search mode)
  useEffect(() => {
    // Choose display name by current language; default to English field 'name'
    const displayed = (Array.isArray(metaAllTags) ? metaAllTags : [])
      .filter(tg => Number(tg?.type) === 1) // only type 1 tags
      .map(tg => (currentLanguage === 'de' ? (tg.german_name || tg.name) : (tg.name || tg.german_name)))
      .filter(Boolean);
    // Deduplicate and sort
    const unique = Array.from(new Set(displayed)).sort((a, b) => a.localeCompare(b));
    // Only update if we have tags to show, preserve existing tags during search
    if (unique.length > 0 || !isSearchActive) {
      setAvailableTags(unique);
    }
  }, [metaAllTags, currentLanguage, isSearchActive]);


  const fetchFavourites = async () => {
    try {
      const response = await makeAuthenticatedRequest('/favourites');
      const data = await response.json();
      
      console.log('Raw favourites response:', data); // Debug log
      
      // Handle the actual API response: { status: "success", data: { collections: [...], elements: [...] } }
      let favouritesList = [];
      if (data?.status === 'success' && data?.data) {
        // Combine collections and elements into a single list
        const collections = data.data.collections || [];
        const elements = data.data.elements || [];
        
        favouritesList = [
          ...collections.map(item => ({ ...item, type: 'collection' })),
          ...elements.map(item => ({ ...item, type: 'element' }))
        ];
      }
      

      setFavourites(favouritesList);
    } catch (error) {
      console.error('Failed to fetch favourites:', error);
      setFavourites([]);
    }
  };

  const toggleFavorite = async (elementId) => {
    try {
      // Update local state immediately for better UX
      setFeedData(prev => (Array.isArray(prev) ? prev : []).map(item => {
        const itemId = item.hash_id ?? item.hashId ?? item.id;
        if (itemId !== elementId) return item;
        const currentFav = Number(item?.favourite_value) === 1;
        return {
          ...item,
          isFavorite: !currentFav,
          favourite_value: currentFav ? 0 : 1
        };
      }));

      // Try to update on server via supported endpoint
      const res = await toggleFavourites(elementId);
      // If server returns definitive favourite_value, sync it
      if (res && res.data && typeof res.data.favourite_value !== 'undefined') {
        const serverFav = Number(res.data.favourite_value) === 1 ? 1 : 0;
        setFeedData(prev => (Array.isArray(prev) ? prev : []).map(item => {
          const itemId = item.hash_id ?? item.hashId ?? item.id;
          if (itemId !== elementId) return item;
          return {
            ...item,
            isFavorite: serverFav === 1,
            favourite_value: serverFav
          };
        }));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      // Revert local state if API call fails
      setFeedData(prev => (Array.isArray(prev) ? prev : []).map(item => {
        const itemId = item.hash_id ?? item.hashId ?? item.id;
        if (itemId !== elementId) return item;
        const currentFav = Number(item?.favourite_value) === 1;
        return {
          ...item,
          isFavorite: currentFav,
          favourite_value: currentFav ? 1 : 0
        };
      }));
    }
  };



  const handleSearchToggle = () => {
    setIsSearchActive(!isSearchActive);
    if (isSearchActive) {
      // Clear search when closing and restore original feed data
      setSearchQuery('');
      // Restore the original feed data without triggering API calls
      if (allFeedData.length > 0) {
        setFeedData(allFeedData);
      }
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    // Restore the original feed data without triggering API calls
    if (allFeedData.length > 0) {
      setFeedData(allFeedData);
    }
  };

  const handleSearchQuery = (query) => {
    // Only update the display query, don't trigger API call
    setSearchQuery(query);
  };

  const handleSearchSubmit = async (query) => {
    if (!query.trim()) {
      // If search is empty, restore original feed data without API call
      if (allFeedData.length > 0) {
        setFeedData(allFeedData);
      } else {
        // Only fetch if we don't have any data
        await fetchFeedData();
      }
      return;
    }
    
    try {
      setLoading(true);
      const result = await searchByTerm(query, { limit: 20 });
      
      console.log('Raw search result:', result);
      
      // Fetch feed data to get proper image URLs
      const feedResponse = await getFeed();
      const feedData = feedResponse?.data || [];
      
      console.log('Feed data for image mapping:', {
        feedDataLength: feedData.length,
        sampleFeedItem: feedData[0] || null,
        feedItemKeys: feedData[0] ? Object.keys(feedData[0]) : []
      });
      
      // Create a map of hash_id to feed item for quick lookup
      const feedMap = new Map();
      const nameMap = new Map(); // Fallback: map by name
      feedData.forEach(item => {
        feedMap.set(item.hash_id, item);
        if (item.name) {
          nameMap.set(item.name.toLowerCase(), item);
        }
      });
      

      
      const normalizeSearch = (data) => {
        if (!data) return [];
        
        // Handle the API response structure: { collections: [...], elements: [...] }
        const collections = Array.isArray(data?.collections) ? data.collections : [];
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        

        
        const mapCollection = (c) => {
          // Get the corresponding feed item to get the proper image URL
          let feedItem = feedMap.get(c.hash_id);
          
          // Fallback: try to find by name if hash_id mapping fails
          if (!feedItem && c.name) {
            feedItem = nameMap.get(c.name.toLowerCase());
          }
          
          // Try multiple image sources from the search result
          const searchResultImage = c.url_thumbnail || c.image || c.thumbnail || c.thumb_url;
          

          
          return {
            ...c,
            id: c.hash_id ?? c.id,
            name: c.name,
            title: c.name,
            image: feedItem?.url_thumbnail || searchResultImage,
            url_thumbnail: feedItem?.url_thumbnail || searchResultImage,
            progress: parseFloat(c.progress || 0),
            isCollection: true,
            isFavorite: c.favourite_value === 1,
            favourite_value: c.favourite_value || 0,
            // Ensure type is set correctly for feed card logic
            type: 1, // Collections should have type 1
            elements: (c.elements || []).map(el => ({
              ...el,
              isFavorite: el.favourite_value === 1,
              progress: parseFloat(el.progress || 0)
            }))
          };
        };
        
        const mapElement = (e) => {
          // Get the corresponding feed item to get the proper image URL
          let feedItem = feedMap.get(e.hash_id);
          
          // Fallback: try to find by name if hash_id mapping fails
          if (!feedItem && e.name) {
            feedItem = nameMap.get(e.name.toLowerCase());
          }
          
          // Try multiple image sources from the search result
          const searchResultImage = e.url_thumbnail || e.image || e.thumbnail || e.thumb_url;
          

          
          return {
            ...e,
            id: e.hash_id ?? e.id,
            name: e.name,
            title: e.name,
            image: feedItem?.url_thumbnail || searchResultImage,
            url_thumbnail: feedItem?.url_thumbnail || searchResultImage,
            progress: parseFloat(e.progress || 0),
            isCollection: false,
            type: 2, // Elements should have type 2, not 1
            isFavorite: e.favourite_value === 1,
            favourite_value: e.favourite_value || 0
          };
        };
        
        const result = [
          ...collections.map(mapCollection),
          ...elements.map(mapElement)
        ];
        
        console.log('Normalized search results:', result.map(item => ({
          name: item.name,
          type: item.isCollection ? 'collection' : 'element',
          image: item.image,
          hash_id: item.hash_id
        })));
        
        return result;
      };
      
      // Pass the correct data structure to normalizeSearch
      const list = normalizeSearch(result.data || result);
      console.log('Final search results:', list);
      setFeedData(list);
    } catch (error) {
      console.error('Search failed:', error);
      // On error, restore original feed data
      if (allFeedData.length > 0) {
        setFeedData(allFeedData);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceSearchResults = async (results) => {
    console.log('Voice search results received:', results);
    
    if (results.status === 'success' && results.data) {
      try {
        console.log('Voice search data structure:', {
          hasCollections: !!results.data.collections,
          collectionsLength: results.data.collections?.length || 0,
          hasElements: !!results.data.elements,
          elementsLength: results.data.elements?.length || 0,
          transcript: results.transcript,
          fullData: results.data
        });

        // Fetch feed data to get proper image URLs
        const feedResponse = await getFeed();
        const feedData = feedResponse?.data || [];
        
        // Create a map of hash_id to feed item for quick lookup
        const feedMap = new Map();
        const nameMap = new Map(); // Fallback: map by name
        feedData.forEach(item => {
          feedMap.set(item.hash_id, item);
          if (item.name) {
            nameMap.set(item.name.toLowerCase(), item);
          }
        });
        
        // Use the same normalization logic as handleSearchSubmit
        const normalizeSearch = (data) => {
          if (!data) return [];
          
          // Handle the API response structure: { collections: [...], elements: [...] }
          const collections = Array.isArray(data?.collections) ? data.collections : [];
          const elements = Array.isArray(data?.elements) ? data.elements : [];
          

          
          const mapCollection = (c) => {
            // Get the corresponding feed item to get the proper image URL
            let feedItem = feedMap.get(c.hash_id);
            
            // Fallback: try to find by name if hash_id mapping fails
            if (!feedItem && c.name) {
              feedItem = nameMap.get(c.name.toLowerCase());
            }
            
            return {
              ...c,
              id: c.hash_id ?? c.id,
              name: c.name,
              title: c.name,
              image: feedItem?.url_thumbnail || c.url_thumbnail,
              url_thumbnail: feedItem?.url_thumbnail || c.url_thumbnail,
              progress: parseFloat(c.progress || 0),
              isCollection: true,
              isFavorite: c.favourite_value === 1,
              favourite_value: c.favourite_value || 0,
              // Ensure type is set correctly for feed card logic
              type: 1, // Collections should have type 1
              elements: (c.elements || []).map(el => ({
                ...el,
                isFavorite: el.favourite_value === 1,
                progress: parseFloat(el.progress || 0)
              }))
            };
          };
          
          const mapElement = (e) => {
            // Get the corresponding feed item to get the proper image URL
            let feedItem = feedMap.get(e.hash_id);
            
            // Fallback: try to find by name if hash_id mapping fails
            if (!feedItem && e.name) {
              feedItem = nameMap.get(e.name.toLowerCase());
            }
            
            return {
              ...e,
              id: e.hash_id ?? e.id,
              name: e.name,
              title: e.name,
              image: feedItem?.url_thumbnail || e.url_thumbnail,
              url_thumbnail: feedItem?.url_thumbnail || e.url_thumbnail,
              progress: parseFloat(e.progress || 0),
              isCollection: false,
              type: 2, // Elements should have type 2, not 1
              isFavorite: e.favourite_value === 1,
              favourite_value: e.favourite_value || 0
            };
          };
          
          const result = [
            ...collections.map(mapCollection),
            ...elements.map(mapElement)
          ];
          

          
          return result;
        };
        
        const list = normalizeSearch(results.data);

        console.log('Voice search processing:', {
          transcript: results.transcript,
          resultsCount: list.length,
          searchActive: true,
          feedDataLength: list.length,
          searchQuery: results.transcript,
          isSearchActive: true,
          normalizedResults: list.map(item => ({
            name: item.name,
            hash_id: item.hash_id,
            type: item.isCollection ? 'collection' : 'element'
          }))
        });

        // Store the original feed data if we haven't already (for search state management)
        if (allFeedData.length === 0) {
          console.log('Storing original feed data for search state management');
          setAllFeedData(feedData);
        }

        // Set the search results and activate search state
        console.log('Setting voice search results as feed data');
        setFeedData(list);
        setSearchQuery(results.transcript || '');
        setIsSearchActive(true);
        
        // Force a re-render to ensure the search state is properly displayed
        setTimeout(() => {
          console.log('Search state after voice search:', {
            actualFeedDataLength: list.length,
            actualSearchQuery: results.transcript,
            shouldBeSearchActive: true,
            originalResults: list.length
          });
        }, 200);
        
      } catch (error) {
        console.error('Voice search failed:', error);
      }
    } else {
      console.error('Voice search failed - invalid response:', results);
    }
  };

  const handleDisplayToggle = () => {
    setIsTwoColumnLayout(!isTwoColumnLayout);
  };

  // Monitor search state changes for debugging
  useEffect(() => {
    console.log('Search state changed:', {
      isSearchActive,
      searchQuery,
      feedDataLength: feedData.length,
      allFeedDataLength: allFeedData.length
    });
  }, [isSearchActive, searchQuery, feedData.length, allFeedData.length]);

  // Ensure feedData is always an array before filtering
  const filteredFeedData = Array.isArray(feedData) ? feedData : [];



  if (loading && page === 1) {
    return (
      <>
        <div className="dashboard-container">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading feed...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="dashboard-container">
        {/* Global App Bar */}
        <GlobalAppBar 
          title="HeyVi"
          showSearch={true}
          showDisplayToggle={true}
          isTwoColumnLayout={isTwoColumnLayout}
          onDisplayToggle={handleDisplayToggle}
          onSearchToggle={handleSearchToggle}
          onSearchQuery={handleSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          searchQuery={searchQuery}
          isSearchActive={isSearchActive}
        />



        {/* Tag Filters (always visible) */}
        <div className="tags-container">
          <div className="tags-scroll">
            {/* All tag to reset filters */}
            <button
              key="__all__"
              className={`tag-button ${selectedTags.length === 0 ? 'active' : ''}`}
              onClick={() => {
                setSelectedTags([]);
                setPage(1);
              }}
              title="Show all"
            >
              #all
            </button>
            {availableTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  className={`tag-button ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    console.log('Tag clicked:', tag, 'Current selected tags:', selectedTags);
                    const next = isSelected
                      ? selectedTags.filter(tg => tg !== tag)
                      : [...selectedTags, tag];
                    console.log('New selected tags:', next);
                    setSelectedTags(next);
                    // Reset to first page when filters change
                    setPage(1);
                    console.log('Tag filter will trigger API call with tags:', next);
                  }}
                  title={`Filter by ${tag}`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feed Content */}
        <div className="feed-container" ref={feedContainerRef}>
          {filteredFeedData.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              <p>No feed data available</p>
            </div>
          ) : (
            <>
            <div className={`feed-grid ${isTwoColumnLayout ? 'feed-grid-two-column' : 'feed-grid-single-column'}`}>
              {feedData
                .map((item) => {
                  const hashId = item?.hash_id ?? item?.hashId ?? null;
                  const routeId = hashId || item?.id || 'local';
                  // Heuristic: treat as collection if any common indicator matches
                  const isCollection = (
                    Number(item?.type) === 1 ||
                    item?.type === 'collection' ||
                    Array.isArray(item?.elements) ||
                    item?.isCollection === true ||
                    Number(item?.is_collection) === 1 ||
                    item?.kind === 'collection'
                  );
                  let image = item?.url_thumbnail || item?.image || '';
                  // Fix image URLs by adding /api prefix if missing
                  if (image && image.includes('app.hejvi.de/img/') && !image.includes('/api/img/')) {
                    image = image.replace('app.hejvi.de/img/', 'app.hejvi.de/api/img/');
                  }
                  // Add fallback image when missing
                  if (!image) {
                    const fallbackItem = feedData.find(item => item.url_thumbnail);
                    image = fallbackItem?.url_thumbnail || 'https://app.hejvi.de/api/img/thumb_metal.jpg';
                  }
                  const title = item?.name || item?.title;
                  return (
                    <div 
                      key={hashId || 'unknown-' + Math.random()}
                      className="feed-card"
                      onClick={async (e) => {
                        // Only handle clicks on the card itself, not on interactive elements
                        if (e.target.closest('.feed-fav') || e.target.closest('.feed-play')) {
                          return;
                        }
                        
                        // Allow navigation for collections even without hashId; block only non-collections with no identifier
                        if (!hashId && !isCollection) return;
                        
                        // Mark as started if progress is 0
                        if (parseFloat(item?.progress) === 0) {
                          try {
                            await setProgress(hashId, 1);

                          } catch (error) {
                            console.error('Failed to update progress:', error);
                          }
                        }
                        
                        // Route based on hash_id prefix: el- -> /element/, col- -> /course/
                        if (hashId && hashId.startsWith('el-')) {
                          navigate(`/element/${hashId}`);
                        } else if (hashId && hashId.startsWith('col-')) {
                          navigate(`/course/${hashId}`, { state: { collectionData: item, sourcePage: '/dashboard' } });
                        } else {
                          // Fallback to type-based routing
                          if (isCollection) {
                            navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/dashboard' } });
                          } else {
                            navigate(`/element/${hashId}`);
                          }
                        }
                      }}
                    >
                      <div className="feed-media" style={{ backgroundImage: `url(${image})` }}>
                        {/* Mandatory badge */}
                        {Number(item?.is_mandatory) === 1 && (
                          <div className="feed-badge">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="#FFFFFF" strokeWidth="2"/>
                              <path d="M7 12.5L10.2 15.7L17 9" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>{t('mandatory')}</span>
                          </div>
                        )}

                        {/* Play Button */}
                        <button 
                          className="feed-play"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Allow navigation for collections even without hashId; block only non-collections with no identifier
                            if (!hashId && !isCollection) return;
                            // Route based on hash_id prefix: el- -> /element/, col- -> /course/
                            if (hashId && hashId.startsWith('el-')) {
                              navigate(`/element/${hashId}`);
                            } else if (hashId && hashId.startsWith('col-')) {
                              navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/dashboard' } });
                            } else {
                              // Fallback to type-based routing
                              if (isCollection) {
                                navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/dashboard' } });
                              } else {
                                navigate(`/element/${hashId}`);
                              }
                            }
                          }}
                        >
                          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                            <circle cx="40" cy="40" r="40" fill="rgba(255,255,255,0.95)"/>
                            <path d="M32 25L55 40L32 55V25Z" fill="#FF6407"/>
                          </svg>
                        </button>

                        {/* Favorite */}
                        <button 
                          className={`feed-fav ${Number(item?.favourite_value) === 1 ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            e.nativeEvent.stopImmediatePropagation();
                            hashId && toggleFavorite(hashId);
                            return false;
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          aria-label="toggle-favourite"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 17.3L6.5 20.5L7.9 14.2L3 9.9L9.4 9L12 3L14.6 9L21 9.9L16.1 14.2L17.5 20.5L12 17.3Z" 
                              fill={Number(item?.favourite_value) === 1 ? '#FF6407' : '#A3A3A3'} />
                          </svg>
                        </button>

                        {/* Footer content */}
                        <div className="feed-footer">
                          {title && <h3 className="feed-title">{title}</h3>}
                          {(() => {
                            const progressValue = calculateCollectionProgress(item);
                            return progressValue > 0 && (
                              <div className="feed-progress">
                                <div className="feed-progress-fill" style={{ width: `${progressValue}%` }}></div>
                              </div>
                            );
                          })()}
                        </div>

                      </div>
                    </div>
                  );
                })}
            </div>
            {/* Infinite scroll trigger */}
            {!isSearchActive && hasMore && (
              <div ref={loadMoreRef} style={{ padding: '20px', textAlign: 'center' }}>
                {loading && page > 1 ? (
                  <div className={`feed-grid ${isTwoColumnLayout ? 'feed-grid-two-column' : 'feed-grid-single-column'}`}>
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div key={`skeleton-${idx}`} className="feed-card skeleton">
                        <div className="feed-media skeleton-block"></div>
                        <div className="feed-footer">
                          <div className="skeleton-line title"></div>
                          <div className="skeleton-line small"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#6B7280', fontSize: '14px' }}>
                    Scroll down to load more
                  </div>
                )}
              </div>
            )}
            </>

          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation onVoiceSearchResults={handleVoiceSearchResults} />
        
      </div>
    </>
  );
  };
  
  export default Dashboard;
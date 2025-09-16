import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import GlobalAppBar from './GlobalAppBar';
import BottomNavigation from './BottomNavigation';
import { appConfig } from '../config';
import { getContentByHash } from '../services/apiService';
import './MyCourses.css';

const MyCourses = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, getMyCourses, searchByTerm, toggleFavourites, setProgress, getElement } = useAuth();
  const [coursesData, setCoursesData] = useState([]);
  const [allCoursesData, setAllCoursesData] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const { t } = useLanguage();
  const [activeNavItem, setActiveNavItem] = useState(t('myCourses'));
  const [isTwoColumnLayout, setIsTwoColumnLayout] = useState(true); // Default to 2-column

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

  // Simple function to check if element exists before navigation
  const checkElementExists = async (hashId) => {
    try {
      await getElement(hashId);
      return true;
    } catch (error) {
      if (String(error?.message || '').includes('404') || String(error?.message || '').toLowerCase().includes('not found')) {
        alert(`Element not found: ${hashId}`);
        return false;
      }
      return true;
    }
  };

  // Resolve unknown hash IDs (no prefix) by asking backend and navigating accordingly
  const resolveAndNavigate = async (hashId, item, routeId, sourcePage) => {
    try {
      const content = await getContentByHash(hashId);
      if (content?.type === 'element') {
        navigate(`/element/${hashId}`, {
          state: {
            elementData: content.data?.data,
            chapters: content.data?.chapters,
            related: content.data?.related,
            sourcePage
          }
        });
        return;
      }
      if (content?.type === 'collection') {
        navigate(`/collection/${hashId}`, {
          state: {
            collectionData: content.data?.data,
            chapters: content.data?.chapters,
            related: content.data?.related,
            sourcePage
          }
        });
        return;
      }
    } catch (e) {
      console.error('Failed to resolve content by hash:', hashId, e);
    }
    alert(`Content not found: ${hashId}`);
  };

  // Normalize various possible tag representations to an array of strings
  const normalizeTags = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          if (item && typeof item === 'object') {
            const val = item.name || item.tag || item.title || item.label || item.value;
            return (val !== undefined && val !== null ? String(val) : '').trim();
          }
          return String(item || '').trim();
        })
        .filter(Boolean);
    }
    if (typeof raw === 'string') {
      // Prefer comma-separated, then space-separated
      const byComma = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (byComma.length > 1) return byComma;
      return raw.split(' ').map((s) => s.trim()).filter(Boolean);
    }
    return String(raw).trim() ? [String(raw).trim()] : [];
  };

  useEffect(() => {
    fetchCoursesData();
  }, []);

  // Clear tag filters when navigation requests it
  useEffect(() => {
    if (location?.state?.clearFilters) {
      setSelectedTags([]);
      setSearchQuery('');
    }
  }, [location?.state?.clearFilters]);

  // Handle tag changes - use client-side filtering for smooth UX
  useEffect(() => {
    if (allCoursesData.length > 0) {
      filterCourses();
    }
  }, [allCoursesData, selectedTags]);

  const fetchCoursesData = async () => {
    try {
      setLoading(true);
      const data = await getMyCourses();
      
      // Collect ALL possible items from API (courses, collections, favourites, raw arrays)
      let coursesList = [];
      if (data?.status === 'success') {
        if (Array.isArray(data?.data)) coursesList.push(...data.data);
        if (Array.isArray(data?.collections)) coursesList.push(...data.collections);
      }
      if (Array.isArray(data)) coursesList.push(...data);
      if (Array.isArray(data?.data)) coursesList.push(...data.data);
      if (Array.isArray(data?.favourites)) coursesList.push(...data.favourites);
      if (Array.isArray(data?.collections)) coursesList.push(...data.collections);

      // Dedupe by hash_id
      const uniqueByHash = new Map();
      for (const item of coursesList) {
        if (item?.hash_id && !uniqueByHash.has(item.hash_id)) {
          uniqueByHash.set(item.hash_id, item);
        }
      }
      coursesList = Array.from(uniqueByHash.values());
      
      // Transform the data to match the expected format
      const transformedCourses = coursesList.map(course => ({
        hash_id: course.hash_id,
        title: course.name || course.title,
        name: course.name || course.title,
        description: course.description,
        image: course.url_thumbnail || course.image,
        url_thumbnail: course.url_thumbnail || course.image,
        duration: course.duration ? `${Math.floor(course.duration / 60)} min` : '0 min',
        progress: course.progress || 0,
        mandatory: course.is_mandatory || false,
        is_mandatory: course.is_mandatory || false,
        favourite_value: course.favourite_value ?? 0,
        type: course.type,
        order: course.order || 999999, // Preserve order field for sorting
        // Use only real tags
        tags: normalizeTags(course.tags),
        search_terms: course.search_terms || null
      }));
      
      // Extract unique filter options from tags only (not search_terms)
      const tagSet = new Set();
      transformedCourses.forEach(course => {
        // Add only real tags if they exist
        if (course.tags && Array.isArray(course.tags) && course.tags.length > 0) {
          course.tags.forEach(tag => {
            const tagName = typeof tag === 'string' ? tag : (tag?.name || tag?.tag || '');
            if (tagName && tagName.trim()) {
              tagSet.add(tagName.trim());
            }
          });
        }
      });
      const availableTagsArray = Array.from(tagSet).sort();

      setAvailableTags(availableTagsArray);
      
      // Do not inject demo items; reflect backend results exactly
      
      // Keep ONLY real collections (exclude single elements)
      const onlyCollections = transformedCourses.filter((c) => {
        const hid = String(c?.hash_id || '');
        const typeNum = Number(c?.type);
        if (hid.startsWith('el-')) return false;
        return hid.startsWith('col-') || typeNum === 2;
      });

      // Sort courses by order field to maintain proper sequence
      const sortedCourses = onlyCollections.sort((a, b) => {
        const orderA = parseInt(a?.order) || 999999;
        const orderB = parseInt(b?.order) || 999999;
        return orderA - orderB;
      });

      setAllCoursesData(sortedCourses);
      setCoursesData(sortedCourses);
    } catch (error) {
      console.error('Failed to fetch courses data:', error);
      setCoursesData([]);
      setAllCoursesData([]);
    } finally {
      setLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = [...allCoursesData];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(course =>
        course.title.toLowerCase().includes(query) ||
        course.description.toLowerCase().includes(query)
      );
    }

    // Filter by selected tags (only real tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter(course => {
        const courseTags = Array.isArray(course.tags) ? course.tags.map(tag => {
          const tagName = typeof tag === 'string' ? tag : (tag?.name || tag?.tag || '');
          return tagName && tagName.trim() ? tagName.trim() : null;
        }).filter(Boolean) : [];
        
        // Only show courses that have at least one of the selected tags
        return selectedTags.some(tag => courseTags.includes(tag));
      });
    }

    setFilteredCourses(filtered);
  };

  // Enhanced search with server-side support
  const performSearch = async (query) => {
    if (!query.trim()) {
      // If no query, just filter locally
      filterCourses();
      return;
    }

    try {
      setLoading(true);
      const searchResults = await searchByTerm(query, { limit: 50 });
      
      if (searchResults?.status === 'success' && searchResults?.data) {
        // Transform search results to match course format
        const searchCourses = [];
        
        // Add elements from search results (based on the API response structure)
        if (searchResults.data.elements && Array.isArray(searchResults.data.elements)) {
          searchResults.data.elements.forEach(element => {
            // Include both course type (1) and element type (2) for search results
            searchCourses.push({
              hash_id: element.hash_id,
              title: element.name || element.title,
              name: element.name || element.title,
              description: element.description,
              image: element.url_thumbnail || element.image,
              url_thumbnail: element.url_thumbnail || element.image,
              duration: element.duration ? `${Math.floor(element.duration / 60)} min` : '0 min',
              progress: element.progress || 0,
              mandatory: element.is_mandatory || false,
              is_mandatory: element.is_mandatory || false,
              favourite_value: element.favourite_value || 0, // Keep original favorite value for search results
              type: element.type || 2, // Default to element type
              tags: normalizeTags(element.tags),
              isCollection: element.type === 1
            });
          });
        }
        
        // Add collections from search results
        if (searchResults.data.collections && Array.isArray(searchResults.data.collections)) {
          searchResults.data.collections.forEach(collection => {
            searchCourses.push({
              hash_id: collection.hash_id,
              title: collection.name || collection.title,
              name: collection.name || collection.title,
              description: collection.description,
              image: collection.url_thumbnail || collection.image,
              url_thumbnail: collection.url_thumbnail || collection.image,
              duration: collection.duration ? `${Math.floor(collection.duration / 60)} min` : '0 min',
              progress: collection.progress || 0,
              mandatory: collection.is_mandatory || false,
              is_mandatory: collection.is_mandatory || false,
              favourite_value: collection.favourite_value || 0, // Keep original favorite value for search results
              type: collection.type || 1, // Default to collection type
              tags: normalizeTags(collection.tags),
              isCollection: true
            });
          });
        }
        
        // Set search results and apply local filtering
        setFilteredCourses(searchCourses);
        // Apply tag filtering locally
        if (selectedTags.length > 0) {
          const tagFiltered = searchCourses.filter(course =>
            course.tags && course.tags.some(tag => selectedTags.includes(tag))
          );
          setFilteredCourses(tagFiltered);
        }
      } else {
        // Fallback to local filtering
        filterCourses();
      }
    } catch (error) {
      console.error('Search failed:', error);
      // Fallback to local filtering
      filterCourses();
    } finally {
      setLoading(false);
    }
  };

  const handleSearchToggle = () => {
    setIsSearchActive(!isSearchActive);
    if (isSearchActive) {
      // Clear search when closing
      setSearchQuery('');
      setFilteredCourses(allCoursesData);
    }
  };

  const handleSearchClear = () => {
    setSearchQuery('');
    setFilteredCourses(allCoursesData);
  };

  const handleSearchQuery = (query) => {
    setSearchQuery(query);
    // Only do local filtering on input change, not server search
    if (!query.trim()) {
      filterCourses();
    }
  };

  const handleSearchSubmit = async (query) => {
    if (!query.trim()) {
      // If search is empty, just filter locally
      filterCourses();
      return;
    }
    
    // Perform server-side search only on form submission
    await performSearch(query);
  };

  const handleTagToggle = (tag) => {
    setSelectedTags(prev => {
      const next = prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag];
      return next;
    });
  };

  const toggleFavorite = async (elementId) => {
    try {
      // Update local state immediately for better UX
      setFilteredCourses(prev => {
        const currentItem = prev.find(item => (item.hash_id ?? item.hashId ?? item.id) === elementId);
        const currentFav = Number(currentItem?.favourite_value) === 1;
        
        if (currentFav) {
          // If removing favorite, remove from the list entirely (since this is My Courses)
          return prev.filter(item => (item.hash_id ?? item.hashId ?? item.id) !== elementId);
        } else {
          // If adding favorite, update the item
          return prev.map(item => {
            const itemId = item.hash_id ?? item.hashId ?? item.id;
            if (itemId !== elementId) return item;
            return {
              ...item,
              isFavorite: true,
              favourite_value: 1
            };
          });
        }
      });

      // Also update the main courses data
      setCoursesData(prev => {
        const currentItem = prev.find(item => (item.hash_id ?? item.hashId ?? item.id) === elementId);
        const currentFav = Number(currentItem?.favourite_value) === 1;
        
        if (currentFav) {
          // If removing favorite, remove from the list entirely
          return prev.filter(item => (item.hash_id ?? item.hashId ?? item.id) !== elementId);
        } else {
          // If adding favorite, update the item
          return prev.map(item => {
            const itemId = item.hash_id ?? item.hashId ?? item.id;
            if (itemId !== elementId) return item;
            return {
              ...item,
              isFavorite: true,
              favourite_value: 1
            };
          });
        }
      });

      // Try to update on server via supported endpoint
      const res = await toggleFavourites(elementId);
      
      // If server call fails, revert the changes
      if (!res || res.error) {
        throw new Error('Server update failed');
      }
      
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      // Revert local state if API call fails by refetching the data
      fetchCoursesData();
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleDisplayToggle = () => {
    setIsTwoColumnLayout(!isTwoColumnLayout);
  };

  if (loading) {
    return (
      <>
        <div className="dashboard-container">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{t('loadingCourses')}</p>
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
          title={t('myCourses')}
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
      {/* Tags Filter */}
      {availableTags.length > 0 && (
        <div className="tags-container">
          <div className="tags-scroll">
            {/* All tag to reset filters */}
            <button
              key="__all__"
              className={`tag-button ${selectedTags.length === 0 ? 'active' : ''}`}
              onClick={() => {
                setSelectedTags([]);
              }}
              title="Show all"
            >
              #all
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                className={`tag-button ${selectedTags.includes(tag) ? 'active' : ''}`}
                onClick={() => handleTagToggle(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section Header */}
      <div className="section-header">
        <div className="section-icon">
          <svg width="18" height="24" viewBox="0 0 18 24" fill="none">
            <path d="M8 5V19L19 12L8 5Z" fill="#F97316"/>
          </svg>
        </div>
        <h2 className="section-title">{t('myCourses')}</h2>
      </div>

        {/* Feed Content */}
        <div className="feed-container">
          {filteredCourses.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              <p>{searchQuery || selectedTags.length > 0 ? t('noResults') || 'No courses found' : t('noCourses')}</p>
            </div>
          ) : (
            <>
            <div className={`feed-grid ${isTwoColumnLayout ? 'feed-grid-two-column' : 'feed-grid-single-column'}`}>
              {filteredCourses.map((item) => {
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
                  const fallbackItem = filteredCourses.find(item => item.url_thumbnail);
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
                        const exists = await checkElementExists(hashId);
                        if (exists) navigate(`/element-feed/${hashId}`, { state: { lessons: [item], startIndex: 0, collectionData: null, sourcePage: '/my-courses' } });
                      } else if (hashId && hashId.startsWith('col-')) {
                        navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/my-courses' } });
                      } else {
                        // Fallback to type-based routing
                        if (isCollection) {
                          navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/my-courses' } });
                        } else if (hashId) {
                          // Unknown format like schn-99876: resolve via backend
                          await resolveAndNavigate(hashId, item, routeId, '/my-courses');
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
                        onClick={async (e) => {
                          e.stopPropagation();
                          // Allow navigation for collections even without hashId; block only non-collections with no identifier
                          if (!hashId && !isCollection) return;
                          // Route based on hash_id prefix: el- -> /element/, col- -> /course/
                          if (hashId && hashId.startsWith('el-')) {
                            const exists = await checkElementExists(hashId);
                            if (exists) navigate(`/element/${hashId}`);
                          } else if (hashId && hashId.startsWith('col-')) {
                            navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/my-courses' } });
                          } else {
                            // Fallback to type-based routing
                            if (isCollection) {
                              navigate(`/course/${routeId}`, { state: { collectionData: item, sourcePage: '/my-courses' } });
                            } else if (hashId) {
                              // Unknown format like schn-99876: resolve via backend
                              await resolveAndNavigate(hashId, item, routeId, '/my-courses');
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
                          const progressValue = parseFloat(item?.progress || 0);
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
            </>
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNavigation />
        
      </div>
    </>
  );
};

export default MyCourses;
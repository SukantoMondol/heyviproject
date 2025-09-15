import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import GlobalLayout from './GlobalLayout';
import './Challenges.css';

import crownIcon from '../assets/icons/crown.svg';
import trophyIcon from '../assets/icons/trophy.svg';
import toolsIcon from '../assets/icons/tools.svg';
import searchIcon from '../assets/icons/search.svg';

const Challenges = () => {
  const navigate = useNavigate();
  const { getChallenges, getCurrentChallenges, setProgress } = useAuth();
  const { t } = useLanguage();
  const [challenges, setChallenges] = useState([]);
  const [currentChallenges, setCurrentChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [allChallengesData, setAllChallengesData] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  // Default categories with icons and colors (fallback if API doesn't provide them)
  const defaultCategories = [
    { 
      name: 'Must-See', 
      icon: '🔥', 
      color: '#EA580C', 
      bgColor: '#FFEDD5', 
      borderColor: '#FED7AA',
      tags: ['important', 'featured', 'must-see']
    },
    { 
      name: 'Safety', 
      icon: '🛡️', 
      color: '#2563EB', 
      bgColor: '#DBEAFE', 
      borderColor: '#BFDBFE',
      tags: ['safety', 'security', 'protection']
    },
    { 
      name: 'Tools', 
      icon: '🔧', 
      color: '#16A34A', 
      bgColor: '#DCFCE7', 
      borderColor: '#BBF7D0',
      tags: ['tools', 'equipment', 'machinery']
    },
    { 
      name: 'Law', 
      icon: '⚖️', 
      color: '#4B5563', 
      bgColor: '#F3F4F6', 
      borderColor: '#E5E7EB',
      tags: ['law', 'legal', 'compliance', 'regulations']
    }
  ];

  // Function to analyze challenges and create dynamic categories
  const createDynamicCategories = (challengesData) => {
    if (!challengesData || challengesData.length === 0) {
      return defaultCategories;
    }

    // Collect all search terms and analyze challenge content
    const allSearchTerms = [];
    const challengeTexts = [];
    
    challengesData.forEach(challenge => {
      if (challenge.search_terms) {
        allSearchTerms.push(challenge.search_terms.toLowerCase());
      }
      
      // Combine name, description, and search terms for analysis
      const challengeText = `${challenge.name} ${challenge.description} ${challenge.search_terms || ''}`.toLowerCase();
      challengeTexts.push(challengeText);
    });

    // Define category patterns based on common themes
    const categoryPatterns = [
      {
        name: 'Safety & Security',
        icon: '🛡️',
        color: '#2563EB',
        bgColor: '#DBEAFE',
        borderColor: '#BFDBFE',
        keywords: ['safety', 'security', 'protection', 'secure', 'safe', 'guard', 'shield']
      },
      {
        name: 'Tools & Equipment',
        icon: '🔧',
        color: '#16A34A',
        bgColor: '#DCFCE7',
        borderColor: '#BBF7D0',
        keywords: ['tool', 'equipment', 'machinery', 'device', 'instrument', 'gear', 'apparatus']
      },
      {
        name: 'Cutting & Processing',
        icon: '✂️',
        color: '#DC2626',
        bgColor: '#FEE2E2',
        borderColor: '#FECACA',
        keywords: ['cut', 'cutting', 'schn', 'process', 'slice', 'trim', 'chop']
      },
      {
        name: 'Important & Featured',
        icon: '🔥',
        color: '#EA580C',
        bgColor: '#FFEDD5',
        borderColor: '#FED7AA',
        keywords: ['important', 'featured', 'must', 'essential', 'critical', 'key']
      },
      {
        name: 'Compliance & Law',
        icon: '⚖️',
        color: '#4B5563',
        bgColor: '#F3F4F6',
        borderColor: '#E5E7EB',
        keywords: ['law', 'legal', 'compliance', 'regulation', 'rule', 'policy', 'standard']
      },
      {
        name: 'Training & Learning',
        icon: '📚',
        color: '#7C3AED',
        bgColor: '#EDE9FE',
        borderColor: '#DDD6FE',
        keywords: ['training', 'learning', 'education', 'course', 'lesson', 'tutorial', 'guide']
      }
    ];

    // Create dynamic categories based on actual challenge content
    const dynamicCategories = [];
    
    categoryPatterns.forEach(pattern => {
      // Count how many challenges match this category
      const matchingChallenges = challengeTexts.filter(text => 
        pattern.keywords.some(keyword => text.includes(keyword))
      );
      
      // Only create category if there are matching challenges
      if (matchingChallenges.length > 0) {
        dynamicCategories.push({
          ...pattern,
          tags: pattern.keywords,
          count: matchingChallenges.length
        });
      }
    });

    // Add "All Challenges" category at the beginning
    const allCategory = {
      name: 'All Challenges',
      icon: '📋',
      color: '#6B7280',
      bgColor: '#F9FAFB',
      borderColor: '#E5E7EB',
      tags: [],
      count: challengesData.length
    };

    return [allCategory, ...dynamicCategories];
  };

  useEffect(() => {
    fetchChallenges(null, true); // Force refresh on initial load
  }, []);

  const fetchChallenges = async (categoryFilter = null, forceRefresh = false) => {
    // Don't show loading if we already have data and this isn't a force refresh
    if (!forceRefresh && challenges.length > 0) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Prepare filters for API call
      const filters = {};
      if (categoryFilter && categoryFilter.tags && categoryFilter.tags.length > 0) {
        filters.tags = categoryFilter.tags;
      }
      
      // Fetch both all challenges and current challenges
      const [challengesResponse, currentChallengesResponse] = await Promise.all([
        getChallenges(filters),
        getCurrentChallenges()
      ]);

      

      if (challengesResponse?.status === 'success' && challengesResponse?.data) {
        // Only use type = 2 items for challenges feed
        const rawChallengesData = challengesResponse.data;
        const challengesData = (Array.isArray(rawChallengesData) ? rawChallengesData : [])
          .filter(item => Number(item?.type) === 2);
        
        // Store all challenges data for filtering
        if (!categoryFilter) {
          setAllChallengesData(challengesData);
          
          // Build available tags from API data only (not search_terms)
          const filterSet = new Set();
          (Array.isArray(challengesData) ? challengesData : []).forEach(item => {
            // Item tags
            (Array.isArray(item?.tags) ? item.tags : []).forEach(tag => {
              const tagName = typeof tag === 'string' ? tag : (tag?.name || tag?.tag || '');
              const tagType = tag?.type || tag?.type_id;
              if (tagName && tagName.trim() && tagType === 1) {
                filterSet.add(tagName.trim());
              }
            });
            // Nested element tags (if present)
            (Array.isArray(item?.elements) ? item.elements : []).forEach(el => {
              (Array.isArray(el?.tags) ? el.tags : []).forEach(tag => {
                const tagName = typeof tag === 'string' ? tag : (tag?.name || tag?.tag || '');
                const tagType = tag?.type || tag?.type_id;
                if (tagName && tagName.trim() && tagType === 1) {
                  filterSet.add(tagName.trim());
                }
              });
            });
          });
          const availableTagsArray = Array.from(filterSet).sort();

          setAvailableTags(availableTagsArray);
          
          // Create dynamic categories based on actual challenge data (kept for potential future use)
          const dynamicCategories = createDynamicCategories(challengesData);
          setCategories(dynamicCategories);
          if (dynamicCategories.length > 0) {
            setActiveCategory(dynamicCategories[0]);
          }
        }
        
        setChallenges(challengesData);
      }

      if (currentChallengesResponse?.status === 'success' && currentChallengesResponse?.data) {
        setCurrentChallenges(currentChallengesResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch challenges:', error);
      setError(t('failedToLoadChallenges'));
      // Fallback to mock data
      setChallenges([
        {
          id: 6,
          name: 'Tool Caching Challenge',
          description: 'Find specific tools in your work place! You have got 3 Days to complete',
          hash_id: '32422234sdfsdf',
          url_thumbnail: 'https://app.hejvi.de/api/img/different-tools-are-on-the-workbench-focus-on-the-2025-01-08-03-32-12-utc.jpg',
          level_complexity: 4,
          experience_points: 500,
          duration: 200,
          challenge_start: '2025-08-20 10:49:00',
          challenge_end: '2025-08-22 15:49:00',
          progress: '0.0000',
          favourite_value: null
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Local filtering by selected tags (only tags shown in the bar)
  useEffect(() => {
    if (!Array.isArray(allChallengesData) || allChallengesData.length === 0) return;
    if (!selectedTags || selectedTags.length === 0) {
      setChallenges(allChallengesData);
      return;
    }
    const filtered = allChallengesData.filter(item => {
      const itemTags = (Array.isArray(item?.tags) ? item.tags : []).map(tag => {
        const tagName = typeof tag === 'string' ? tag : (tag?.name || tag?.tag || '');
        return tagName && tagName.trim() ? tagName.trim() : null;
      }).filter(Boolean);
      const nestedTags = (Array.isArray(item?.elements) ? item.elements : [])
        .flatMap(el => (Array.isArray(el?.tags) ? el.tags : []).map(tag => {
          const tagName = typeof tag === 'string' ? tag : (tag?.name || tag?.tag || '');
          return tagName && tagName.trim() ? tagName.trim() : null;
        })).filter(Boolean);
      
      // Combine only real tags
      const combined = [...itemTags, ...nestedTags];
      return selectedTags.some(tag => combined.includes(tag));
    });
    

    
    setChallenges(filtered);
  }, [selectedTags, allChallengesData]);

  const handleChallengeClick = async (challenge) => {
    // More robust hash_id detection
    const hashId = challenge.hash_id || challenge.hashId || challenge.id;
    
    if (!hashId) {
      console.error('Challenge has no valid identifier:', challenge);
      return;
    }
    
    try {
      // Mark challenge as started if progress is 0
      if (parseFloat(challenge.progress || 0) === 0) {
        await setProgress(hashId, 1);
      }
      
      // Determine navigation type based on challenge structure
      const isCollection = (
        Number(challenge.type) === 1 ||
        challenge.type === 'collection' ||
        Array.isArray(challenge.elements) ||
        challenge.isCollection === true ||
        Number(challenge.is_collection) === 1 ||
        challenge.kind === 'collection'
      );
      
      // Route all challenges to /course/ instead of /element/
      navigate(`/course/${hashId}`, { state: { collectionData: challenge, sourcePage: '/challenges' } });
    } catch (error) {
      console.error('Failed to start challenge:', error);
      // Fallback navigation even if progress update fails
      const hashId = challenge.hash_id || challenge.hashId || challenge.id;
      if (hashId) {
        const isCollection = (
          Number(challenge.type) === 1 ||
          challenge.type === 'collection' ||
          Array.isArray(challenge.elements) ||
          challenge.isCollection === true ||
          Number(challenge.is_collection) === 1 ||
          challenge.kind === 'collection'
        );
        
        // Route all challenges to /course/ instead of /element/
        navigate(`/course/${hashId}`, { state: { collectionData: challenge, sourcePage: '/challenges' } });
      }
    }
  };

  const handleCategoryChange = async (category) => {
    // Categories are deprecated in favor of API-driven tags, keep no-op
    setActiveCategory(category);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0 min';
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const formatTimeLeft = (endDate) => {
    if (!endDate) return t('noDeadline');
    const end = new Date(endDate);
    const now = new Date();
    const diff = end - now;
    
    if (diff <= 0) return t('expired');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d left`;
    if (hours > 0) return `${hours}h left`;
    return t('lessThan1hLeft');
  };

  const getLevelText = (level) => {
    const levels = {
      1: t('beginner'),
      2: t('intermediate'), 
      3: t('advanced'),
      4: t('expert')
    };
    return levels[level] || t('beginner');
  };

  // Transform API data to match component structure
  const transformChallenges = (challengeList) => {
    return challengeList.map(challenge => {
      // Ensure we have a valid hash_id
      const hashId = challenge.hash_id || challenge.hashId || challenge.id;
      
      if (!hashId) {
        console.warn('Challenge missing hash_id:', challenge);
      }
      
      return {
        id: challenge.id,
        hash_id: hashId,
        type: challenge.type,
        title: challenge.name,
        desc: challenge.description,
        progressText: `${Math.round(parseFloat(challenge.progress || 0))}%`,
        xpText: `+${challenge.experience_points} XP`,
        status: parseFloat(challenge.progress || 0) === 100 ? t('completed') : 
                parseFloat(challenge.progress || 0) > 0 ? t('continue') : t('start'),
        statusVariant: parseFloat(challenge.progress || 0) === 100 ? 'success' : 
                      parseFloat(challenge.progress || 0) > 0 ? 'secondary' : 'primary',
        image: challenge.url_thumbnail,
        duration: formatDuration(challenge.duration),
        level: getLevelText(challenge.level_complexity),
        timeLeft: formatTimeLeft(challenge.challenge_end),
        isFavorite: challenge.favourite_value === 1,
        progress: parseFloat(challenge.progress || 0),
        // Preserve original challenge data for navigation
        originalChallenge: challenge
      };
    });
  };

    const transformedChallenges = transformChallenges(challenges);
  const transformedCurrentChallenges = transformChallenges(currentChallenges);

  // Calculate dynamic weekly progress statistics
  const calculateWeeklyProgress = () => {
    const totalChallenges = transformedChallenges.length;
    const completedChallenges = transformedChallenges.filter(challenge => 
      parseFloat(challenge.progress || 0) === 100
    ).length;
    
    // Calculate progress percentage based on individual challenge progress
    const totalProgress = transformedChallenges.reduce((sum, challenge) => {
      return sum + parseFloat(challenge.progress || 0);
    }, 0);
    
    const averageProgress = totalChallenges > 0 ? totalProgress / totalChallenges : 0;
    
    return {
      total: totalChallenges,
      completed: completedChallenges,
      progressPercentage: Math.round(averageProgress)
    };
  };

  const weeklyStats = calculateWeeklyProgress();

  if (loading) {
    return (
      <GlobalLayout title={t('challenges')} showNavbar>
        <div className="challenges-page">
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{t('loadingChallenges')}</p>
          </div>
        </div>
      </GlobalLayout>
    );
  }

  if (error) {
    return (
      <GlobalLayout title={t('challenges')} showNavbar>
        <div className="challenges-page">
          <div className="error-state">
            <p>{error}</p>
            <button onClick={fetchChallenges} className="ch-btn ch-btn-primary">{t('retry')}</button>
          </div>
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout title={t('challenges')} showNavbar>
      <div className="challenges-page">
        {/* Subtle tip row */}
        <div className="ch-tip">
          <span className="ch-tip-icon">⚡</span>
          <span className="ch-tip-text">{t('stayMotivated')}</span>
        </div>

        {/* Current Active Challenges */}
        {transformedCurrentChallenges.length > 0 && (
          <section className="ch-card ch-feature">
            <div className="ch-feature-left">
              <div className="ch-feature-icon-wrap">
                <img src={crownIcon} alt="crown" />
              </div>
              <div className="ch-feature-texts">
                <h3 className="ch-feature-title">{t('activeChallenges')}</h3>
                <p className="ch-feature-sub">
                  {transformedCurrentChallenges[0]?.desc || t('completeChallengesEarnXP')}
                </p>
                <div className="ch-feature-meta">
                  <span className="ch-chip ch-chip-soft">
                    {transformedCurrentChallenges[0]?.timeLeft || t('noDeadline')}
                  </span>
                  <span className="ch-chip ch-chip-soft">
                    {transformedCurrentChallenges[0]?.xpText || '+50 XP'}
                  </span>
                </div>
              </div>
            </div>
            <div className="ch-feature-right">
              <span className="ch-badge ch-badge-orange">{t('active')}</span>
              <button 
                className="ch-btn ch-btn-orange"
                onClick={() => handleChallengeClick(transformedCurrentChallenges[0].originalChallenge)}
              >
                {transformedCurrentChallenges[0]?.status || t('startNow')}
              </button>
            </div>
          </section>
        )}

        {/* Weekly Progress */}
        <section className="ch-weekly">
          <div className="ch-weekly-top">
            <span className="ch-weekly-title">{t('weeklyProgress')}</span>
            <span className="ch-weekly-count">
              <img src={trophyIcon} alt="trophy" /> {weeklyStats.completed} / {weeklyStats.total} {t('doneChallenges')}
            </span>
          </div>
          <div className="ch-progress-bar">
            <div className="ch-progress-fill" style={{ width: `${weeklyStats.progressPercentage}%` }} />
          </div>
        </section>

        {/* Tag Filters (from API) */}
        {(() => {
          console.log('Challenges - Render check for tags filter:', {
            availableTagsLength: availableTags.length,
            availableTags: availableTags,
            shouldShow: availableTags.length > 0
          });
          return availableTags.length > 0 && (
            <div className="tags-container">
              <div className="tags-scroll">
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
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`tag-button ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        const next = isSelected
                          ? selectedTags.filter(tg => tg !== tag)
                          : [...selectedTags, tag];
                        setSelectedTags(next);
                      }}
                      title={`Filter by ${tag}`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* All Challenges header */}
        <div className="ch-list-header">
          <h4>
            {t('allChallenges')} 
            ({transformedChallenges.length})
          </h4>
          <button 
            className="ch-chip ch-chip-orange-light" 
            onClick={() => fetchChallenges()}
            style={{ visibility: 'hidden' }}
          >
            {t('refresh')}
          </button>
        </div>

        {/* All Challenges list */}
        <div className="ch-list">
          {transformedChallenges.length > 0 ? (
            transformedChallenges.map((item) => (
              <div key={item.id} className="ch-item" onClick={() => handleChallengeClick(item.originalChallenge)}>
                <div className="ch-item-icon">
                  {item.image ? (
                    <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                  ) : (
                    <img src={toolsIcon} alt="icon" />
                  )}
                </div>
                <div className="ch-item-body">
                  <div className="ch-item-title">{item.title}</div>
                  <div className="ch-item-sub">{item.desc}</div>
                  <div className="ch-item-chips">
                    <span className="ch-chip ch-chip-plain">{item.progressText}</span>
                    <span className="ch-chip ch-chip-soft">
                      <i>
                        <svg width="8" height="8" viewBox="0 0 14 13" fill="none">
                          <path d="M7 0L8.5 4L12.5 4.5L9.5 7.5L10.5 13L7 10.5L3.5 13L4.5 7.5L1.5 4.5L5.5 4L7 0Z" fill="#FA7F29"/>
                        </svg>
                      </i>
                      {item.xpText}
                    </span>
                    <span className="ch-chip ch-chip-soft">{item.level}</span>
                    <span className="ch-chip ch-chip-soft">{item.timeLeft}</span>
                  </div>
                </div>
                <div className="ch-item-cta">
                  {item.statusVariant === 'success' ? (
                    <span className="ch-badge ch-badge-green">{item.status}</span>
                  ) : (
                    <button className={`ch-btn ${item.statusVariant === 'primary' ? 'ch-btn-primary' : 'ch-btn-secondary'}`}>
                      {item.status}
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="ch-empty-state">
              <p>{t('noChallenges')}</p>
              <button onClick={fetchChallenges} className="ch-btn ch-btn-primary">{t('retry')}</button>
            </div>
          )}
        </div>

        {/* Discover more */}
        <div className="ch-discover">
          <button 
            className="ch-btn ch-btn-discover"
            style={{ visibility: 'hidden' }}
          >
            <img src={searchIcon} alt="search" />
            <span>{t('discoverMore')}</span>
          </button>
        </div>
      </div>
    </GlobalLayout>
  );
};

export default Challenges;



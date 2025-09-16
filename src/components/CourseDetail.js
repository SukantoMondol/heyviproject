import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import GlobalLayout from './GlobalLayout';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { getCollectionByHash } from '../services/apiService';
import { useExternalBackButton } from '../hooks/useExternalBackButton';
import './CourseDetail.css';

const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes} min${minutes !== 1 ? '' : ''}${remaining ? ` ${remaining}s` : ''}`;
};

const CourseDetail = () => {
  const { courseId, hashId } = useParams();
  const resolvedId = courseId ?? hashId;
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleFavourites } = useAuth();
  const { t } = useLanguage();
  
  // Set up external back button handling
  const { handleBackClick } = useExternalBackButton('/dashboard');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [collection, setCollection] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [lessons, setLessons] = useState([]);
  const touchStartX = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        // If we have collection data from navigation, use it as optimistic data
        const optimistic = location?.state?.collectionData;
        if (optimistic) {
          setCollection(optimistic);
          const optimisticLessons = Array.isArray(optimistic.elements) ? optimistic.elements : [];
          // Remove duplicates based on hash_id OR id to prevent double lessons and enforce order
          const uniqMap = new Map();
          optimisticLessons.forEach((l) => {
            const key = l?.hash_id || `id-${l?.id}`;
            if (!uniqMap.has(key)) uniqMap.set(key, l);
          });
          setLessons(Array.from(uniqMap.values()));
        }

        // Only fetch from API if resolvedId looks like a hash (string) and not a placeholder
        if (resolvedId && typeof resolvedId === 'string') {
          const res = await getCollectionByHash(resolvedId);
          const payload = res || {};
          const data = payload.data || {};
          setCollection(data || null);
          setChapters(Array.isArray(payload.chapters) ? payload.chapters : (Array.isArray(data.chapters) ? data.chapters : []));
          const fromElements = Array.isArray(data.elements) ? data.elements : [];
          const fromRelated = Array.isArray(payload.related) ? payload.related : [];
          // Use elements if available, otherwise use related, but avoid duplicates
          const finalLessons = fromElements.length ? fromElements : fromRelated;
          // Remove duplicates based on hash_id OR id to prevent double lessons and enforce order
          const uniqMap2 = new Map();
          finalLessons.forEach((l) => {
            const key = l?.hash_id || `id-${l?.id}`;
            if (!uniqMap2.has(key)) uniqMap2.set(key, l);
          });
          setLessons(Array.from(uniqMap2.values()));
        } else if (!optimistic) {
          // Without a valid id and no optimistic data, show not found state
          setCollection(null);
        }
      } catch (e) {
        // If fetch fails but we have optimistic data, keep showing it with empty elements
        if (!location?.state?.collectionData) {
          setError('Failed to load course');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resolvedId, location?.state?.collectionData]);

  const totalDuration = useMemo(() => {
    if (!lessons.length) return collection?.duration || 0;
    return lessons.reduce((sum, l) => sum + (Number(l.duration) || 0), 0);
  }, [lessons, collection]);

  const levelLabel = useMemo(() => {
    const level = Number(collection?.level_complexity);
    if (level === 1) return t('beginner') || 'Beginner';
    if (level === 2) return t('intermediate') || 'Intermediate';
    if (level === 3) return t('advanced') || 'Advanced';
    return level ? `${t('levelComplexity') || 'Level Complexity'} ${level}` : '';
  }, [collection, t]);

  const hasMandatory = useMemo(() => {
    return (chapters || []).some((c) => String(c.is_mandatory) === '1');
  }, [chapters]);

  const backNavigationUrl = useMemo(() => {
    // Check if we have a source page in the navigation state
    const sourcePage = location?.state?.sourcePage;
    console.log('CourseDetail backNavigationUrl - sourcePage:', sourcePage, 'location.state:', location?.state);
    
    if (sourcePage) {
      console.log('CourseDetail using sourcePage:', sourcePage);
      return sourcePage;
    }
    
    // Default fallback to dashboard
    console.log('CourseDetail defaulting to dashboard');
    return '/dashboard';
  }, [location?.state?.sourcePage]);

  const getNextLesson = () => {
    if (!Array.isArray(lessons) || lessons.length === 0) return null;
    // prefer first lesson with progress < 100 if available
    const notCompleted = lessons.find((l) => Number(l.progress) < 100);
    return notCompleted || lessons[0];
  };

  const handleHeroPlay = () => {
    const next = getNextLesson();
    if (next?.hash_id) {
      const nextIndex = lessons.findIndex(l => l.hash_id === next.hash_id);
      navigate(`/element-feed/${next.hash_id}`, { 
        state: { 
          collectionData: collection,
          sourcePage: location?.state?.sourcePage,
          lessons: lessons,
          startIndex: nextIndex >= 0 ? nextIndex : 0,
          forceRotate: true,
          playlistContext: {
            lessons: lessons,
            currentIndex: nextIndex >= 0 ? nextIndex : 0,
            collectionId: collection?.hash_id
          }
        } 
      });
    } else if (collection?.url_element) {
      // fallback: open collection media if present
      window.open(collection.url_element, '_blank');
    }
  };

  // Basic swipe handling: left -> next lesson, right -> back
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      try { touchStartX.current = e.changedTouches[0].clientX; } catch (_) { touchStartX.current = null; }
    };
    const onTouchEnd = (e) => {
      if (touchStartX.current == null) return;
      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - touchStartX.current;
      const threshold = 60; // px
      if (deltaX <= -threshold) {
        const next = getNextLesson();
        if (next?.hash_id) {
          const nextIndex = lessons.findIndex(l => l.hash_id === next.hash_id);
          navigate(`/element/${next.hash_id}`, { 
            state: { 
              elementData: next,
              collectionData: collection,
              sourcePage: location?.state?.sourcePage,
              playlistContext: {
                lessons: lessons,
                currentIndex: nextIndex >= 0 ? nextIndex : 0,
                collectionId: collection?.hash_id
              }
            } 
          });
        }
      } else if (deltaX >= threshold) {
        navigate(backNavigationUrl);
      }
      touchStartX.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [lessons, navigate]);

  const handleToggleFavourite = async () => {
    if (!collection?.hash_id) return;
    try {
      const res = await toggleFavourites(collection.hash_id);
      const favVal = Number(res?.data?.favourite_value) || 0;
      setCollection((prev) => ({ ...(prev || {}), favourite_value: favVal }));
    } catch (e) {
      // no-op UI; keep previous state on failure
      console.error('Toggle favourite failed', e);
    }
  };

  if (loading) {
    return (
      <GlobalLayout title="" showBackButton onBackClick={handleBackClick} showNavbar>
        <div className="loading-area">
          <div className="spinner" />
          <p>{t('loading') || 'Loading…'}</p>
        </div>
      </GlobalLayout>
    );
  }

  if (error || !collection) {
    return (
      <GlobalLayout title="" showBackButton onBackClick={handleBackClick} showNavbar>
        <div className="error-area">
          <p>{error || (t('notFound') || 'Content not found.')}</p>
          <button onClick={() => navigate(backNavigationUrl)}>{t('back') || 'Back'}</button>
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout title={collection.name || ''} showBackButton onBackClick={handleBackClick} backTo={backNavigationUrl} showNavbar={true}>
      <div className="course-detail-container" ref={containerRef}>
        <div className="course-scroll">
          <div className="hero">
            <div className="hero-media">
              <img
                src={collection.url_thumbnail}
                alt={collection.name}
              />
              <button className="hero-play" onClick={handleHeroPlay}>
                <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="12" fill="#FFFFFF" />
                  <path d="M9 7.5V16.5L17 12L9 7.5Z" fill="#FF6407" />
                </svg>
              </button>
            </div>
          </div>

          <div className="course-header">
            <div className="course-title-area">
              <h2>{collection.name}</h2>
              <button
                type="button"
                className={`fav-pill ${Number(collection.favourite_value) ? 'active' : ''}`}
                aria-label="Toggle favourite"
                aria-pressed={Number(collection.favourite_value) ? 'true' : 'false'}
                onClick={handleToggleFavourite}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="11.5" fill="#FFEBD8" stroke="#E5D3BF"/>
                  <path d="M12 6.5l1.73 3.5 3.87.56-2.8 2.73.66 3.86L12 14.98 8.54 17.15l.66-3.86-2.8-2.73 3.87-.56L12 6.5Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
            <div className="meta-row">
              {Number(collection.duration) > 0 && (
                <span className="meta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 7v6l4 2" stroke="#FF6407" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9" stroke="#FF6407" strokeWidth="2" fill="none"/></svg>{formatDuration(Number(collection.duration))}</span>
              )}
              {levelLabel && (
                <span className="meta"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 17l4-10 4 10M5 17h14" stroke="#344054" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>{levelLabel}</span>
              )}
            </div>
                          {(hasMandatory) && (
                <div className="chips">
                  <span className="chip mandatory">{t('mandatory') || 'Mandatory'}</span>
                </div>
              )}
          </div>

          {collection.description && collection.description.trim() && (
            <div className="description-card">
              <p>{collection.description}</p>
            </div>
          )}

          <div className="lessons-card">
            <h3>{t('lessons') || 'Lessons'}</h3>
            {Array.isArray(lessons) && lessons.length > 0 ? (
              <div className="lessons-list">
                {lessons.map((l, idx) => (
                  <button className="lesson-item" key={l.id || idx} onClick={() => {
                    navigate(`/element-feed/${l.hash_id}`, { 
                      state: { 
                        collectionData: collection,
                        sourcePage: location?.state?.sourcePage,
                        lessons: lessons,
                        startIndex: idx,
                        forceRotate: true,
                        playlistContext: {
                          lessons: lessons,
                          currentIndex: idx,
                          collectionId: collection?.hash_id
                        }
                      } 
                    });
                  }}>
                    <div className="lesson-icon">
                      {parseFloat(l.progress || 0) === 100 ? '✓' : '▶'}
                    </div>
                    <div className="lesson-info">
                      <div className="lesson-title">{l.name}</div>
                      {typeof l.progress !== 'undefined' && parseFloat(l.progress) > 0 && (
                        <div className="lesson-progress">
                          <div className="lesson-progress-bar">
                            <div 
                              className="lesson-progress-fill" 
                              style={{ width: `${Math.min(100, parseFloat(l.progress))}%` }}
                            />
                          </div>
                          <span className="lesson-progress-text">{Math.round(parseFloat(l.progress))}%</span>
                        </div>
                      )}
                    </div>
                    <div className="lesson-duration">{formatDuration(Number(l.duration) || 0)}</div>
                  </button>
                ))}
              </div>
                          ) : (
                <div className="error-area" style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                  <p>{t('contentNotFound') || 'Content not found'}</p>
                </div>
              )}
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
};

export default CourseDetail;
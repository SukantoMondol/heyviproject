import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import GlobalLayout from './GlobalLayout';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useExternalBackButton } from '../hooks/useExternalBackButton';
import './ElementPage.css';

const formatMinutes = (seconds) => {
  if (!seconds && seconds !== 0) return '';
  const mins = Math.max(0, Math.floor(Number(seconds) / 60));
  return `${mins} min`;
};

const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const ElementPage = () => {
  const { hashId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { getElement, toggleFavourites } = useAuth();
  const { t } = useLanguage();
  
  // Set up external back button handling
  const { handleBackClick } = useExternalBackButton('/dashboard');

  const initialFromState = useMemo(() => {
    const s = location?.state?.elementData;
    return s && typeof s === 'object' ? s : null;
  }, [location]);

  const fromQRScan = useMemo(() => {
    return Boolean(location?.state?.fromQRScan);
  }, [location]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [element, setElement] = useState(initialFromState);
  const [chapters, setChapters] = useState([]);
  const [related, setRelated] = useState([]);
  const [tags, setTags] = useState([]);
  const [isFavorite, setIsFavorite] = useState(Boolean(initialFromState?.favourite_value === 1));
  const containerRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  
  const hasMandatory = useMemo(() => {
    return (chapters || []).some((c) => String(c.is_mandatory) === '1');
  }, [chapters]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getElement(hashId);
        const payload = res || {};
        const data = payload.data || {};
        if (!isMounted) return;
        setElement(data);
        const ch = Array.isArray(payload.chapters) ? payload.chapters : [];
        // Normalize numeric start_time and sort by order/start_time
        const normalized = ch
          .map((c) => ({ ...c, _start: Math.max(0, Number(c.start_time || 0)) }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a._start - b._start);
        setChapters(normalized);
        const rel = Array.isArray(payload.related) 
          ? [...payload.related].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          : [];
        setRelated(rel);
        // Normalize tags from payload or element
        const rawTags = Array.isArray(payload.tags) ? payload.tags : (Array.isArray(data.tags) ? data.tags : []);
        const normalizedTags = rawTags.map((t) => {
          if (!t) return null;
          if (typeof t === 'string') return t;
          if (typeof t === 'object') return t.name || t.label || null;
          return null;
        }).filter(Boolean);
        setTags(normalizedTags);
        setIsFavorite(data?.favourite_value === 1);
        setError(null);
      } catch (e) {
        if (!isMounted) return;
        setError('Failed to load element');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [getElement, hashId]);

  const onToggleFavourite = async () => {
    try {
      const res = await toggleFavourites(hashId);
      const favVal = Number(res?.data?.favourite_value);
      if (Number.isFinite(favVal)) {
        setIsFavorite(favVal === 1);
      } else {
        setIsFavorite((prev) => !prev);
      }
    } catch (_) {}
  };

  const handlePlayButton = (chapterStartTime = null) => {
    if (chapterStartTime && typeof chapterStartTime === 'object') {
      chapterStartTime = null;
    }
    // Build a robust playlist of lessons:
    // 1) If collectionData.elements exists, prefer it
    // 2) Else use related
    // 3) Ensure current element is included exactly once
    const collectionLessons = Array.isArray(location?.state?.collectionData?.elements)
      ? location.state.collectionData.elements
      : [];
    const baseLessons = collectionLessons.length > 0 ? collectionLessons : (Array.isArray(related) ? related : []);

    // Deduplicate by hash_id and ensure current element is present
    const mapByHash = new Map();
    const pushUnique = (item) => {
      const hid = item?.hash_id || item?.hashId || item?.id;
      if (!hid) return;
      if (!mapByHash.has(hid)) mapByHash.set(hid, item);
    };

    baseLessons.forEach(pushUnique);
    if (element) pushUnique(element);

    const lessons = Array.from(mapByHash.values());
    const currentIndex = Math.max(0, lessons.findIndex(l => (l?.hash_id || l?.hashId || l?.id) === hashId));

    navigate(`/element-feed/${hashId}`, {
      state: {
        lessons,
        startIndex: currentIndex >= 0 ? currentIndex : 0,
        collectionData: location?.state?.collectionData || null,
        sourcePage: location?.state?.sourcePage,
        chapterStartTime
      }
    });
  };

  const handleChapterClick = (chapter) => {
    const startTime = Number(chapter.start_time || 0);
    handlePlayButton(startTime);
  };

  // Swipe: left -> open first related (next), right -> back
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (e) => {
      try { 
        touchStartX.current = e.changedTouches[0].clientX;
        touchStartY.current = e.changedTouches[0].clientY;
      } catch (_) { 
        touchStartX.current = null;
        touchStartY.current = null;
      }
    };
    const onTouchEnd = (e) => {
      if (touchStartX.current == null || touchStartY.current == null) return;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const deltaX = endX - touchStartX.current;
      const deltaY = endY - touchStartY.current;
      const threshold = 60;
      
      // Only trigger horizontal swipe if it's clearly horizontal (deltaX is significantly larger than deltaY)
      // and the horizontal movement is substantial enough
      if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > threshold) {
        if (deltaX <= -threshold) {
          const next = Array.isArray(related) && related.length > 0 ? related[0] : null;
          if (next?.hash_id) {
            navigate(`/element/${next.hash_id}`, { state: { elementData: next } });
          }
        } else if (deltaX >= threshold) {
          navigate(-1);
        }
      }
      
      touchStartX.current = null;
      touchStartY.current = null;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [related, navigate]);


  if (loading) {
    return (
      <GlobalLayout 
        title="" 
        showBackButton 
        onBackClick={handleBackClick}
        showNavbar
      >
        <div className="mobile-container">
          <div className="loading-screen">
            <div className="spinner"></div>
            <p>{t('loading') || 'Loading...'}</p>
          </div>
        </div>
      </GlobalLayout>
    );
  }

  if (error) {
    return (
      <GlobalLayout 
        title="" 
        showBackButton 
        onBackClick={handleBackClick}
        showNavbar
      >
        <div className="mobile-container">
          <div className="error-screen">
            <p>{error}</p>
            <button className="btn" onClick={() => navigate(-1)}>{t('back') || 'Back'}</button>
          </div>
        </div>
      </GlobalLayout>
    );
  }

  if (!element) return null;

  return (
    <GlobalLayout 
      title={element?.name || ''} 
      showBackButton 
      onBackClick={handleBackClick}
      backTo={fromQRScan ? '/my-courses' : undefined}
      showNavbar
    >
      <div className="element-page" ref={containerRef}>

      <section className="ep-hero">
        <div className="ep-hero-img-wrapper" style={{ position: 'relative' }}>
          <img className="ep-hero-img" src={element.url_thumbnail} alt={element.name} />
          {hasMandatory && (
            <div className="ep-hero-badges-left">
              <span className="badge">{t('mandatory') || 'Mandatory'}</span>
            </div>
          )}
          <button className={`fav ${isFavorite ? 'active' : ''}`} onClick={onToggleFavourite} aria-label={isFavorite ? (t('unfavorite') || 'Unfavorite') : (t('favorite') || 'Favorite')} style={{ position: 'absolute', top: 22, right: 22, zIndex: 10 }}>★</button>
        </div>
        <button className="hero-play" onClick={() => handlePlayButton()} aria-label={t('play') || 'Play'}>
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="12" fill="#FFFFFF" />
            <path d="M10 8 L16 12 L10 16 Z" fill="#FF6B00" />
          </svg>
        </button>
        {Number(element?.progress) > 0 && (
          <div className="ep-video-overlay" aria-hidden>
            <div className="progress" aria-label="Video progress">
              <div className="bar" style={{ width: `${Math.min(100, Number(element.progress))}%` }} />
            </div>
          </div>
        )}
      </section>

      <section className="ep-card ep-title-block">
        <h1 className="ep-title">{element.name}</h1>
        <div className="ep-meta">
          <span className="meta meta--duration" aria-label={t('duration') || 'Duration'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 7v6l4 2" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="9" stroke="#EA580C" strokeWidth="2" fill="none"/>
            </svg>
            {formatMinutes(element.duration)}
          </span>
          <span className="meta" aria-label={t('number_of_views') || 'Views'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="3" stroke="#6B7280" strokeWidth="2"/>
            </svg>
            {element.number_of_views}
          </span>
          <span className="meta" aria-label={t('number_of_likes') || 'Likes'}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {element.number_of_likes}
          </span>
        </div>
        <div className="ep-tags">
          {Number(element?.level_complexity) > 0 && (
            <span className="chip chip-beginner">
              {Number(element.level_complexity) === 1 && (t('beginner') || 'Beginner')}
              {Number(element.level_complexity) === 2 && (t('intermediate') || 'Intermediate')}
              {Number(element.level_complexity) === 3 && (t('advanced') || 'Advanced')}
              {![1,2,3].includes(Number(element.level_complexity)) && `${t('levelComplexity') || 'Level Complexity'} ${element.level_complexity}`}
            </span>
          )}
          {tags.map((tag, idx) => (
            <span key={`${tag}-${idx}`} className="chip chip-safety">{tag}</span>
          ))}
        </div>
        {element.description && element.description.trim() && (
          <p className="ep-desc">{element.description}</p>
        )}
        {/* Progress shown in hero overlay before playback when available */}
      </section>

      {chapters && chapters.length > 0 && (
        <section className="ep-steps">
          <div className="section-title">{t('stepsInThisVideo') || 'Steps in this video'}</div>
          <div className="steps-list">
            {chapters.map((c, idx) => {
              return (
                <button 
                  key={c.id || idx} 
                  className="step-item step-item-clickable"
                  onClick={() => handleChapterClick(c)}
                  aria-label={`${t('playFrom') || 'Play from'} ${c.name} ${formatTime(c.start_time || 0)}`}
                >
                  <div className="step-index">{idx + 1}</div>
                  <div className="step-name">{c.name}</div>
                  <div className="step-time">{formatTime(c.start_time || 0)}</div>
                  <div className="step-dot">•</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {related && related.length > 0 && (
        <section className="ep-related">
          <div className="section-title">{t('relatedVideos') || 'Related Videos'}</div>
          <div className="related-grid">
            {related.map((r, idx) => (
              <button
                key={r.id || idx}
                className="related-card"
                onClick={() => navigate(`/element/${r.hash_id}`, { state: { elementData: r } })}
              >
                <img src={r.url_thumbnail} alt={r.name} />
                <div className="related-name">{r.name}</div>
              </button>
            ))}
          </div>
        </section>
      )}
      </div>
    </GlobalLayout>
  );
};

export default ElementPage;



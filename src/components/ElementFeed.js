import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import useScrollSnap from 'react-use-scroll-snap';
import GlobalLayout from './GlobalLayout';
import './ElementFeed.css';
// import { useAuth } from '../context/AuthContext';
import { getCollectionByHash, getElementByHash } from '../services/apiService';
import { useLanguage } from '../context/LanguageContext';
import { useExternalBackButton } from '../hooks/useExternalBackButton';

const ElementFeed = () => {
  const { hashId } = useParams(); // collection hash
  const location = useLocation();
  const { t } = useLanguage();
  
  // Set up external back button handling
  const { handleBackClick } = useExternalBackButton('/dashboard');

  const [lessons, setLessons] = useState(() => {
    const fromState = location?.state?.lessons;
    return Array.isArray(fromState) ? fromState : [];
  }, [location]);

  const startIndex = useMemo(() => {
    const idx = Number(location?.state?.startIndex ?? 0);
    return Number.isFinite(idx) ? Math.max(0, idx) : 0;
  }, [location]);

  const collectionData = useMemo(() => location?.state?.collectionData || null, [location?.state?.collectionData]);
  const isDebug = useMemo(() => {
    try {
      const sp = new URLSearchParams(location?.search || window.location.search || '');
      return sp.get('debug') === '1';
    } catch (_) {
      return false;
    }
  }, [location]);
  const chapterStartTime = useMemo(() => location?.state?.chapterStartTime || null, [location]);
  const hasAppliedChapterSeekRef = useRef(false);
  const hasRotatedForElementDetailRef = useRef(false);

  const containerRef = useRef(null);
  useScrollSnap({ ref: containerRef, duration: 280, snapStop: true, threshold: 0.1 });

  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [isSimFullscreen, setIsSimFullscreen] = useState(true);
  const [isMuted, setIsMuted] = useState(() => {
    // Try to get saved mute preference from localStorage
    const savedMuteState = localStorage.getItem('hejvi_video_muted');
    return savedMuteState !== null ? savedMuteState === 'true' : true;
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewportHeight, setViewportHeight] = useState('100vh');
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [showEndPopup, setShowEndPopup] = useState(false);
  const [endPopupTimer, setEndPopupTimer] = useState(3);
  const [showSkipIndicator, setShowSkipIndicator] = useState(null); // 'forward' or 'backward'
  const [challengeState, setChallengeState] = useState({}); // idx -> { status: 'idle'|'success'|'failure', playing: 'success'|'failure'|null }
  const [hintHighlights, setHintHighlights] = useState({}); // idx -> 'yes' | 'no' | null
  const hintTimersRef = useRef({});
  const [responseVideos, setResponseVideos] = useState({}); // hash -> { url: string, loading: boolean, error: string }
  // Helpers to resolve success/incorrect element IDs to media URLs from current lessons
  const resolveElementMediaById = useCallback((elementId) => {
    if (!elementId) return { url: '', thumbnail: '' };
    const idStr = String(elementId);
    const element = (lessons || []).find((el) => {
      if (idStr.startsWith('el-')) {
        return String(el?.hash_id || el?.hashId) === idStr;
      }
      return Number(el?.id) === Number(elementId);
    });
    return {
      url: normalizeMediaUrl(element?.url_element || ''),
      thumbnail: normalizeMediaUrl(element?.url_thumbnail || '')
    };
  }, [lessons]);

  // Fetch response video by hash from API
  const fetchResponseVideo = useCallback(async (hash) => {
    if (!hash) {
      console.log('[HEJVI DEBUG] fetchResponseVideo: No hash provided');
      return { url: '', thumbnail: '' };
    }
    
    console.log('[HEJVI DEBUG] fetchResponseVideo called with hash:', hash);
    
    // Check if already cached
    if (responseVideos[hash]) {
      console.log('[HEJVI DEBUG] fetchResponseVideo: Using cached result:', responseVideos[hash]);
      return responseVideos[hash];
    }

    console.log('[HEJVI DEBUG] fetchResponseVideo: Fetching from API...');
    // Mark as loading
    setResponseVideos(prev => ({ ...prev, [hash]: { loading: true, url: '', thumbnail: '', error: '' } }));

    try {
      const element = await getElementByHash(hash);
      console.log('[HEJVI DEBUG] fetchResponseVideo: API response:', element);
      
      const result = {
        url: normalizeMediaUrl(element?.url_element || ''),
        thumbnail: normalizeMediaUrl(element?.url_thumbnail || ''),
        loading: false,
        error: ''
      };
      
      console.log('[HEJVI DEBUG] fetchResponseVideo: Final result:', result);
      setResponseVideos(prev => ({ ...prev, [hash]: result }));
      return result;
    } catch (error) {
      console.log('[HEJVI DEBUG] fetchResponseVideo: Error:', error);
      const result = {
        url: '',
        thumbnail: '',
        loading: false,
        error: error.message || 'Failed to fetch video'
      };
      
      setResponseVideos(prev => ({ ...prev, [hash]: result }));
      return result;
    }
  }, [responseVideos]);


  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);
  const singleTapTimeout = useRef(null);
  const videoRefs = useRef([]);
  const [videoErrors, setVideoErrors] = useState({});
  const hlsInstancesRef = useRef({});

  // Normalize media URLs to avoid common issues (protocol-less, missing /api prefix)
  const normalizeMediaUrl = (raw) => {
    if (!raw) return '';
    let url = String(raw).trim();
    // Encode spaces and unsafe chars in path without breaking protocol
    try {
      const u = new URL(url, /^https?:\/\//i.test(url) ? undefined : 'https://dummy');
      u.pathname = u.pathname
        .split('/')
        .map(seg => encodeURIComponent(decodeURIComponent(seg)))
        .join('/');
      url = u.href.replace('https://dummy', '');
    } catch (_) {}
    if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith('//')) url = `https:${url}`; else if (url.startsWith('/')) url = url; else url = `https://${url}`;
    }
    // Ensure /api/ segment for app.hejvi.de assets when missing
    if (url.includes('app.hejvi.de/') && !url.includes('/api/')) {
      url = url.replace('app.hejvi.de/', 'app.hejvi.de/api/');
    }
    return url;
  };

  // Format seconds to H:MM:SS or M:SS
  const formatTime = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const backCourseUrl = useMemo(() => {
    const courseHash = collectionData?.hash_id || hashId;
    console.log('ElementFeed backCourseUrl - courseHash:', courseHash, 'sourcePage:', location?.state?.sourcePage, 'location.state:', location?.state);
    
    // Check if this is a direct access (no state information) - likely from external QR scan
    const isDirectAccess = !location?.state || Object.keys(location.state).length === 0;
    if (isDirectAccess) {
      console.log('ElementFeed detected direct access - going to dashboard');
      return '/dashboard';
    }
    
    // Always go back to the collection first if we have one
    if (courseHash && courseHash.startsWith('col-')) {
      console.log('ElementFeed going back to collection:', `/collection/${courseHash}`);
      return `/collection/${courseHash}`;
    }
    
    // Only use sourcePage if we don't have a collection context and it's a valid path
    const sourcePage = location?.state?.sourcePage;
    if (sourcePage && sourcePage !== '/login' && sourcePage !== '/') {
      console.log('ElementFeed using sourcePage:', sourcePage);
      return sourcePage;
    }
    
    // Default fallback to dashboard for safety
    console.log('ElementFeed defaulting to dashboard');
    return '/dashboard';
  }, [collectionData, hashId, location?.state?.sourcePage]);

  // Set viewport height immediately on mount
  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.innerHeight;
      setViewportHeight(`${height}px`);
      document.documentElement.style.setProperty('--vh', `${height * 0.01}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
    };
  }, []);

  // Ensure we scroll to the selected item on mount
  useEffect(() => {
    const node = videoRefs.current[startIndex]?.closest('[data-snap-section]');
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    setActiveIndex(startIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure initial position respects startIndex or forceRotate
  useEffect(() => {
    if (!Array.isArray(lessons) || lessons.length === 0) return;
    const idx = Number(location?.state?.startIndex ?? startIndex ?? 0);
    const forceRotate = Boolean(location?.state?.forceRotate);
    if (!Number.isFinite(idx) || idx < 0 || idx >= lessons.length) return;

    // Don't rotate the lessons array - just set the correct active index
    // This ensures the correct video plays when clicking on a specific lesson
    setActiveIndex(idx);
      hasRotatedForElementDetailRef.current = true;
      setTimeout(() => {
        const node = videoRefs.current[idx]?.closest('[data-snap-section]');
        if (node && node.scrollIntoView) {
          try { node.scrollIntoView({ behavior: 'instant', block: 'start' }); } catch (_) {}
        }
      }, 0);
  }, [lessons, startIndex, location?.state?.startIndex]);

  // If lessons not provided, fetch by id pattern (el- or col-)
  useEffect(() => {
    const id = hashId;
    if ((lessons || []).length > 0 || !id) return;

    (async () => {
      try {
        if (id.startsWith('col-')) {
          const res = await getCollectionByHash(id);
          const data = res?.data || {};
          const elements = Array.isArray(data.elements) ? data.elements : [];
          setLessons(elements);
        } else if (id.startsWith('el-')) {
          // Fetch element and try to find its collection from location.state
          const res = await getElementByHash(id);
          const elem = res?.data || null;
          const collection = location?.state?.collectionData || null;

          if (collection && Array.isArray(collection.elements)) {
            setLessons(collection.elements);
          } else {
            // As a minimal fallback, show only this element in the feed
            setLessons(elem ? [elem] : []);
          }
        }
      } catch (_) {
        // Leave lessons as is
      }
    })();
  }, [hashId, lessons.length]);

  // Track visibility of videos to update activeIndex (do not directly play here)
  useEffect(() => {
    const elements = videoRefs.current.filter(Boolean);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (() => {
        let pending = null;
        return (entries) => {
          entries.forEach((entry) => {
            const vid = entry.target;
            if (!(vid instanceof HTMLVideoElement)) return;
            const idxAttr = vid.getAttribute('data-idx');
            const idxNum = Number(idxAttr);
            if (entry.isIntersecting && entry.intersectionRatio > 0.6 && Number.isFinite(idxNum)) {
              if (pending) clearTimeout(pending);
              pending = setTimeout(() => setActiveIndex(idxNum), 100); // debounce 100ms
            }
          });
        };
      })(),
      { threshold: [0, 0.6, 1] }
    );

    elements.forEach((v) => observer.observe(v));

    return () => observer.disconnect();
  }, [lessons.length]);

  // Ensure only the active video's plays; pause all others
  useEffect(() => {
    videoRefs.current.forEach((vid, i) => {
      if (!(vid instanceof HTMLVideoElement)) return;
      try {
        if (i === activeIndex) {
          vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      } catch (_) {}
    });
  }, [activeIndex]);

  const onToggleFullscreenSim = () => {
    const next = !isSimFullscreen;
    setIsSimFullscreen(next);
  };

  const onToggleMute = () => {
    const vid = videoRefs.current[activeIndex];
    if (!vid) return;

    const next = !isMuted;
    try {
      vid.muted = next;
    } catch (_) {}
    setIsMuted(next);
    
    // Save mute preference to localStorage
    localStorage.setItem('hejvi_video_muted', next.toString());

    if (!next) {
      // User gesture unmuted; ensure playback
      vid.play().catch(() => {});
    }
  };

  const onTogglePlayPause = (idx) => {
    const vid = videoRefs.current[idx];
    if (!vid) return;

    if (vid.paused) {
      vid.play().catch(() => {});
      setIsVideoPaused(false);
    } else {
      try {
        vid.pause();
        setIsVideoPaused(true);
      } catch (_) {}
    }
  };

  const onReplay = (idx) => {
    const vid = videoRefs.current[idx];
    if (!vid) return;
    
    vid.currentTime = 0;
    vid.play().catch(() => {});
    setIsVideoPaused(false);
    setShowEndPopup(false);
  };

  const onSkipBackward = (idx) => {
    const vid = videoRefs.current[idx];
    if (!vid) return;
    
    vid.currentTime = Math.max(0, vid.currentTime - 10);
  };

  const onSkipForward = (idx) => {
    const vid = videoRefs.current[idx];
    if (!vid) return;
    
    vid.currentTime = Math.min(vid.duration || 0, vid.currentTime + 10);
  };

  const onProgressBarClick = (idx, event) => {
    event.stopPropagation(); // Prevent event from bubbling to video element
    
    const vid = videoRefs.current[idx];
    if (!vid || !vid.duration) return;
    
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * vid.duration;
    
    vid.currentTime = Math.max(0, Math.min(vid.duration, newTime));
  };

  // Function to play a random video from the lessons
  const playRandomVideo = useCallback(() => {
    const total = (lessons || []).length;
    if (total === 0) return;
    
    // Get a random index different from current
    let randomIdx;
    do {
      randomIdx = Math.floor(Math.random() * total);
    } while (randomIdx === activeIndex && total > 1);
    
    console.log('[HEJVI DEBUG] Playing random video at index:', randomIdx);
    
    if (randomIdx !== activeIndex) {
      setActiveIndex(randomIdx);
      
      // Try to scroll to the random section
      setTimeout(() => {
        const randomSection = videoRefs.current[randomIdx]?.closest('[data-snap-section]');
        if (randomSection) {
          try {
            randomSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (_) {}
        }
      }, 100);
    }
  }, [activeIndex, lessons]);

  const onNextVideo = useCallback(() => {
    const total = (lessons || []).length;
    if (total === 0) return;
    
    // Debug logging
    console.log('[HEJVI DEBUG] onNextVideo called', {
      activeIndex,
      total,
      currentLesson: lessons[activeIndex],
      currentType: lessons[activeIndex]?.type,
      allLessons: lessons.map((l, i) => ({ 
        index: i, 
        type: l?.type, 
        title: l?.title || l?.name,
        challenge_type: l?.challenge_type,
        question: l?.question
      }))
    });
    
    // Look for the next challenge - check multiple possible challenge indicators
    let targetIdx = -1;
    for (let i = activeIndex + 1; i < total; i += 1) {
      const lesson = lessons[i];
      const isChallenge = (
        Number(lesson?.type) === 3 || // Original type check
        Number(lesson?.challenge_type) !== undefined || // Has challenge_type field
        lesson?.question || // Has question field
        lesson?.correct_option !== undefined // Has correct_option field
      );
      
      if (isChallenge) { 
        targetIdx = i; 
        console.log('[HEJVI DEBUG] Found challenge at index', i, {
          type: lesson?.type,
          challenge_type: lesson?.challenge_type,
          question: lesson?.question,
          title: lesson?.title || lesson?.name
        });
        break; 
      }
    }
    
    // If no challenge ahead, just move to the very next item
    if (targetIdx === -1) {
      targetIdx = activeIndex + 1;
      if (targetIdx >= total) {
        console.log('[HEJVI DEBUG] Reached end of playlist');
        setShowEndPopup(false);
        return;
      }
      console.log('[HEJVI DEBUG] No challenge found, moving to next item at index', targetIdx);
    }

    console.log('[HEJVI DEBUG] Target index:', targetIdx, 'Current index:', activeIndex);

    if (targetIdx !== activeIndex && targetIdx < total) {
      console.log('[HEJVI DEBUG] Navigating from index', activeIndex, 'to', targetIdx);
      
      // Force the navigation by directly setting the active index
      setActiveIndex(targetIdx);
      
      // Try multiple approaches to ensure navigation works
      const forceNavigation = () => {
        // Approach 1: Direct scroll to section
        const nextSection = videoRefs.current[targetIdx]?.closest('[data-snap-section]');
        if (nextSection) {
        try {
          nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('[HEJVI DEBUG] Successfully scrolled to target section');
            return true;
          } catch (e) {
            console.log('[HEJVI DEBUG] Scroll failed:', e);
          }
        }
        
        // Approach 2: Direct scroll to video element
        const nextVideo = videoRefs.current[targetIdx];
        if (nextVideo) {
          try {
            nextVideo.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('[HEJVI DEBUG] Successfully scrolled to target video');
            return true;
          } catch (e) {
            console.log('[HEJVI DEBUG] Video scroll failed:', e);
          }
        }
        
        // Approach 3: Manual scroll calculation
        if (containerRef.current) {
          try {
            const container = containerRef.current;
            const sectionHeight = window.innerHeight;
            const targetScrollTop = targetIdx * sectionHeight;
            container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
            console.log('[HEJVI DEBUG] Successfully scrolled to calculated position');
            return true;
          } catch (e) {
            console.log('[HEJVI DEBUG] Manual scroll failed:', e);
          }
        }
        
        return false;
      };
      
      // Try immediate navigation
      if (!forceNavigation()) {
        // Retry with delay
        setTimeout(() => {
          forceNavigation();
        }, 100);
      }
    } else {
      console.log('[HEJVI DEBUG] No navigation needed or invalid target index');
    }
    setShowEndPopup(false);
  }, [activeIndex, lessons]);

  // Cleanup single tap timeout and dismiss end popup when active video changes
  useEffect(() => {
    if (singleTapTimeout.current) {
      clearTimeout(singleTapTimeout.current);
      singleTapTimeout.current = null;
    }
    
    // Dismiss end popup timer when active video changes (user scrolled or navigated)
    setShowEndPopup(false);
  }, [activeIndex]);

  // Keep progress for the active video
  useEffect(() => {
    const vid = videoRefs.current[activeIndex];
    if (!vid) return;

    const onTime = () => {
      setCurrentTime(vid.currentTime || 0);
      setDuration(vid.duration || 0);
    };

    const onLoaded = () => {
      setDuration(vid.duration || 0);
      // Seek to chapter start time only once for the initially opened video
      if (!hasAppliedChapterSeekRef.current && activeIndex === startIndex && chapterStartTime && Number(chapterStartTime) > 0) {
        vid.currentTime = Math.min(Number(chapterStartTime), vid.duration || 0);
        hasAppliedChapterSeekRef.current = true;
      }
    };

    const onPlay = () => {
      setIsVideoPaused(false);
    };

    const onPause = () => {
      setIsVideoPaused(true);
    };

    const onEnded = () => {
      setIsVideoPaused(true);
      // Respect per-lesson timer_on_end (default 1 = show 3s timer)
      const lesson = lessons[activeIndex];
      const timerOnEnd = Number(lesson?.timer_on_end ?? 1);
      console.log('[HEJVI DEBUG] Video ended', {
        activeIndex,
        lesson: lesson?.title || lesson?.name,
        timerOnEnd,
        lessonType: lesson?.type
      });
      if (timerOnEnd === 0) {
        console.log('[HEJVI DEBUG] Timer disabled, calling onNextVideo immediately');
        onNextVideo();
      } else {
        console.log('[HEJVI DEBUG] Timer enabled, showing 3s countdown');
        setShowEndPopup(true);
        setEndPopupTimer(3);
      }
    };

    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('loadedmetadata', onLoaded);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('ended', onEnded);

    // Sync mute state to element
    try {
      vid.muted = isMuted;
    } catch (_) {}

    return () => {
      vid.removeEventListener('timeupdate', onTime);
      vid.removeEventListener('loadedmetadata', onLoaded);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('ended', onEnded);
    };
  }, [activeIndex, isMuted, lessons, chapterStartTime]);

  // Timer effect for end popup
  useEffect(() => {
    if (!showEndPopup) return;
    if (endPopupTimer > 0) {
      const timer = setTimeout(() => {
        setEndPopupTimer(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
    // When countdown hits zero, immediately advance and reset UI state
    if (endPopupTimer === 0) {
      console.log('[HEJVI DEBUG] Timer expired, calling onNextVideo');
      setShowEndPopup(false);
      setEndPopupTimer(3);
      // Force immediate navigation
      setTimeout(() => {
      onNextVideo();
      }, 50);
    }
  }, [showEndPopup, endPopupTimer, onNextVideo]);

  // Apply fullscreen body class on mount and when toggled
  useEffect(() => {
    if (isSimFullscreen) {
      document.body.classList.add('fullscreen-mode');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('fullscreen-mode');
      document.body.style.overflow = '';
    }

    return () => {
      document.body.classList.remove('fullscreen-mode');
      document.body.style.overflow = '';
    };
  }, [isSimFullscreen]);


  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (singleTapTimeout.current) {
        clearTimeout(singleTapTimeout.current);
      }
    };
  }, []);

  return (
    <GlobalLayout
      title={collectionData?.name || (t('lessons') || 'Lessons')}
      showBackButton
      backTo={backCourseUrl}
      showNavbar={!isSimFullscreen}
    >
      <div
        ref={containerRef}
        className={`snap-container${isSimFullscreen ? ' sim-fullscreen' : ''}`}
        style={{
          height: isSimFullscreen ? viewportHeight : 'calc(100vh - 80px)',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          overscrollBehavior: 'none',
          maxHeight: isSimFullscreen ? viewportHeight : 'calc(100vh - 80px)',
          width: '100%',
          margin: 0,
          padding: 0,
          position: 'relative'
        }}
        onTouchStart={(e) => {
          try {
            touchStartX.current = e.changedTouches[0].clientX;
            touchStartY.current = e.changedTouches[0].clientY;
          } catch (_) {
            touchStartX.current = null;
            touchStartY.current = null;
          }
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null || touchStartY.current == null) return;

          const endX = e.changedTouches[0].clientX;
          const endY = e.changedTouches[0].clientY;
          const deltaX = endX - touchStartX.current;
          const deltaY = endY - touchStartY.current;
          const threshold = 60;

          // Only trigger horizontal swipe if it's clearly horizontal (deltaX is significantly larger than deltaY)
          // and the horizontal movement is substantial enough
          if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > threshold) {
              // Horizontal swipe: treat swipe right-to-left (deltaX < 0) as back to course
              if (deltaX < 0) {
                handleBackClick();
              }
          }

          touchStartX.current = null;
          touchStartY.current = null;
        }}
        onScroll={(e) => {
          const container = e.currentTarget;
          const sections = Array.from(container.querySelectorAll('[data-snap-section]'));
          const top = container.scrollTop;
          const h = container.clientHeight;
          const maxScroll = container.scrollHeight - h;

          // Prevent scrolling past the last video
          if (top >= maxScroll - 1) {
            container.scrollTop = maxScroll;
            setActiveIndex(sections.length - 1);
            // Dismiss timer if user manually scrolled to last video
            setShowEndPopup(false);
            return;
          }

          // Update active index by nearest child to top
          let bestIdx = 0;
          let bestDist = Infinity;
          sections.forEach((sec, i) => {
            const dist = Math.abs(sec.offsetTop - top);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          });
          
          // If user scrolled to a different video, dismiss the end popup timer
          if (bestIdx !== activeIndex) {
            setShowEndPopup(false);
          }
          
          setActiveIndex(bestIdx);
        }}
      >
        {lessons.map((lesson, idx) => (
          <section
            key={lesson?.hash_id || (lesson?.id != null ? `${lesson.id}-${idx}` : `idx-${idx}`)}
            data-snap-section
            style={{
              height: isSimFullscreen ? viewportHeight : '100vh',
              scrollSnapAlign: 'start',
              position: 'relative',
              width: '100%',
              margin: 0,
              padding: 0
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: '#000',
                width: '100%',
                height: '100%'
              }}
            >
              {/* Render challenge element (type = 3) */}
              {Number(lesson?.type) === 3 ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 18,
                    padding: '24px',
                    background: '#2D1653'
                  }}
                >
                  {/* Header spacing removed to center content vertically */}
                  <div style={{ height: 0, width: '100%' }} />

                  {/* Thumbnail area mimicking your Figma */}
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 420,
                      aspectRatio: '3/4',
                      backgroundImage: `url(${normalizeMediaUrl(lesson.url_thumbnail)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      borderRadius: 16,
                      overflow: 'hidden',
                      boxShadow: '0 20px 40px rgba(0,0,0,.35)',
                      position: 'relative'
                    }}
                  >
                    {/* static image only per Figma: remove play overlay */}
                  </div>

                  {/* Question and input/buttons based on challenge_type */}
                  <div style={{ width: '100%', maxWidth: 780 }}>
                    {isDebug && (() => {
                      const { url: successElUrl } = resolveElementMediaById(lesson?.element_correct_id);
                      const { url: failureElUrl } = resolveElementMediaById(lesson?.element_incorrect_id);
                      const successUrl = successElUrl || normalizeMediaUrl(lesson?.url_success || lesson?.success_url);
                      const failureUrl = failureElUrl || normalizeMediaUrl(lesson?.url_failure || lesson?.failure_url);
                      console.info('[HEJVI DEBUG] Challenge', {
                        name: lesson?.name,
                        id: lesson?.id,
                        challenge_type: lesson?.challenge_type,
                        correct_option: lesson?.correct_option,
                        fulltext: lesson?.fulltext,
                        element_correct_id: lesson?.element_correct_id,
                        element_incorrect_id: lesson?.element_incorrect_id,
                        resolved_success_url: successUrl,
                        resolved_failure_url: failureUrl
                      });
                      return (
                        <div style={{
                          background: 'rgba(17,24,39,0.72)',
                          color: '#fff',
                          padding: '8px 12px',
                          borderRadius: 10,
                          marginBottom: 8,
                          fontSize: 12
                        }}>
                          <div>debug: type={String(lesson?.challenge_type)} opt={String(lesson?.correct_option)}</div>
                          <div>ok: {successUrl ? 'success✔' : 'success✖'} / {failureUrl ? 'failure✔' : 'failure✖'}</div>
                        </div>
                      );
                    })()}
                    <div style={{
                      padding: '4px 8px',
                      marginTop: 18,
                      textAlign: 'left'
                    }}>
                      <div style={{ color: '#E5E7EB', fontSize: 12, marginBottom: 6, fontWeight: 700 }}>Q #1</div>
                      <div style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 800, marginBottom: 14, lineHeight: 1.2 }}>
                        {(() => {
                          const q = String(lesson?.question || t('challengeQuestion') || '').trim();
                          return /[?！？]$/.test(q) ? q : `${q}?`;
                        })()}
                      </div>
                      {/* challenge_type 0 = yes/no; 1 = free text */}
                      {Number(lesson?.challenge_type ?? 0) === 0 ? (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button
                          onClick={async () => {
                            // Determine if "Yes" is the correct answer based on the actual content
                            const correctAnswer = String(lesson?.correct_option ?? lesson?.correct_answer ?? lesson?.correct ?? '1').toLowerCase();
                            const isYesCorrect = correctAnswer === 'yes' || correctAnswer === 'true' || correctAnswer === '1';
                            
                            console.log('[HEJVI DEBUG] Yes button clicked', {
                              correctAnswer,
                              isYesCorrect,
                              lesson: lesson?.title || lesson?.name,
                              correctHash: lesson?.response_correct_hash,
                              incorrectHash: lesson?.response_incorrect_hash,
                              correctElementId: lesson?.element_correct_id,
                              incorrectElementId: lesson?.element_incorrect_id
                            });
                            
                            // Use new hash-based system first, fallback to old system
                            const correctHash = lesson?.response_correct_hash;
                            const incorrectHash = lesson?.response_incorrect_hash;
                            const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                            const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;
                            
                            if (isYesCorrect) {
                              // User clicked "Yes" and it's correct
                              if (correctHash) {
                                console.log('[HEJVI DEBUG] Yes is correct - Using correct hash:', correctHash);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetHash: correctHash } }));
                                fetchResponseVideo(correctHash);
                              } else if (correctElementId) {
                                console.log('[HEJVI DEBUG] Yes is correct - Using correct element ID:', correctElementId);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetElementId: correctElementId } }));
                              } else {
                                console.log('[HEJVI DEBUG] Yes is correct - No video, continuing to next');
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: null } }));
                                if (activeIndex === idx) onNextVideo();
                              }
                            } else {
                              // User clicked "Yes" but it's wrong
                              if (incorrectHash) {
                                console.log('[HEJVI DEBUG] Yes is wrong - Using incorrect hash:', incorrectHash);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetHash: incorrectHash } }));
                                fetchResponseVideo(incorrectHash);
                              } else if (incorrectElementId) {
                                console.log('[HEJVI DEBUG] Yes is wrong - Using incorrect element ID:', incorrectElementId);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetElementId: incorrectElementId } }));
                              } else {
                                console.log('[HEJVI DEBUG] Yes is wrong - No video, showing retry options');
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: null } }));
                              }
                            }
                          }}
                          style={{
                            flex: 1,
                            maxWidth: 240,
                            background: hintHighlights[idx] === 'yes' ? '#EF4444' : '#E74A3B',
                            color: '#fff',
                            border: 0,
                            borderRadius: 12,
                            padding: '10px 12px',
                            fontWeight: 700,
                            fontSize: 14,
                            boxShadow: hintHighlights[idx] === 'yes' ? '0 0 0 3px rgba(239,68,68,0.45), 0 6px 12px rgba(231,74,59,0.28)' : '0 6px 12px rgba(231,74,59,0.28)',
                            transform: hintHighlights[idx] === 'yes' ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 160ms ease-out'
                          }}
                          aria-label="Yes"
                        >
                          ✓ {t('yes') || 'Yes'}
                        </button>
                        <button
                          onClick={async () => {
                            // Determine if "No" is the correct answer based on the actual content
                            const correctAnswer = String(lesson?.correct_option ?? lesson?.correct_answer ?? lesson?.correct ?? '1').toLowerCase();
                            const isNoCorrect = correctAnswer === 'no' || correctAnswer === 'false' || correctAnswer === '0';
                            
                            console.log('[HEJVI DEBUG] No button clicked', {
                              correctAnswer,
                              isNoCorrect,
                              lesson: lesson?.title || lesson?.name,
                              correctHash: lesson?.response_correct_hash,
                              incorrectHash: lesson?.response_incorrect_hash,
                              correctElementId: lesson?.element_correct_id,
                              incorrectElementId: lesson?.element_incorrect_id
                            });
                            
                            // Use new hash-based system first, fallback to old system
                            const correctHash = lesson?.response_correct_hash;
                            const incorrectHash = lesson?.response_incorrect_hash;
                            const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                            const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;
                            
                            if (isNoCorrect) {
                              // User clicked "No" and it's correct
                              if (correctHash) {
                                console.log('[HEJVI DEBUG] No is correct - Using correct hash:', correctHash);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetHash: correctHash } }));
                                fetchResponseVideo(correctHash);
                              } else if (correctElementId) {
                                console.log('[HEJVI DEBUG] No is correct - Using correct element ID:', correctElementId);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetElementId: correctElementId } }));
                              } else {
                                console.log('[HEJVI DEBUG] No is correct - No video, continuing to next');
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: null } }));
                                if (activeIndex === idx) onNextVideo();
                              }
                            } else {
                              // User clicked "No" but it's wrong
                              if (incorrectHash) {
                                console.log('[HEJVI DEBUG] No is wrong - Using incorrect hash:', incorrectHash);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetHash: incorrectHash } }));
                                fetchResponseVideo(incorrectHash);
                              } else if (incorrectElementId) {
                                console.log('[HEJVI DEBUG] No is wrong - Using incorrect element ID:', incorrectElementId);
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetElementId: incorrectElementId } }));
                              } else {
                                console.log('[HEJVI DEBUG] No is wrong - No video, showing retry options');
                                setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: null } }));
                              }
                            }
                          }}
                          style={{
                            flex: 1,
                            maxWidth: 240,
                            background: hintHighlights[idx] === 'no' ? '#22C55E' : '#36B24A',
                            color: '#fff',
                            border: 0,
                            borderRadius: 12,
                            padding: '10px 12px',
                            fontWeight: 700,
                            fontSize: 14,
                            boxShadow: hintHighlights[idx] === 'no' ? '0 0 0 3px rgba(34,197,94,0.45), 0 6px 12px rgba(54,178,74,0.28)' : '0 6px 12px rgba(54,178,74,0.28)',
                            transform: hintHighlights[idx] === 'no' ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 160ms ease-out'
                          }}
                          aria-label="No"
                        >
                          ✗ {t('no') || 'No'}
                        </button>
                      </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder={t('challengeAnswer') || 'Type your answer'}
                            style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', fontSize: 16 }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = String(e.currentTarget.value || '').trim().toLowerCase();
                                const expected = String(lesson?.fulltext || lesson?.correct_option || '').trim().toLowerCase();
                                const isCorrect = expected && val === expected;
                                
                                console.log('[HEJVI DEBUG] Text input submitted', {
                                  userInput: val,
                                  expected,
                                  isCorrect,
                                  lesson: lesson?.title || lesson?.name
                                });
                                
                                // Use new hash-based system first, fallback to old system
                                const correctHash = lesson?.response_correct_hash;
                                const incorrectHash = lesson?.response_incorrect_hash;
                                const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                                const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;
                                
                                if (isCorrect) {
                                  if (correctHash) {
                                    console.log('[HEJVI DEBUG] Text answer correct - Using correct hash:', correctHash);
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetHash: correctHash } }));
                                    fetchResponseVideo(correctHash);
                                  } else if (correctElementId) {
                                    console.log('[HEJVI DEBUG] Text answer correct - Using correct element ID:', correctElementId);
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetElementId: correctElementId } }));
                                  } else if (activeIndex === idx) {
                                    onNextVideo();
                                  }
                                } else {
                                  if (incorrectHash) {
                                    console.log('[HEJVI DEBUG] Text answer wrong - Using incorrect hash:', incorrectHash);
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetHash: incorrectHash } }));
                                    fetchResponseVideo(incorrectHash);
                                  } else if (incorrectElementId) {
                                    console.log('[HEJVI DEBUG] Text answer wrong - Using incorrect element ID:', incorrectElementId);
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetElementId: incorrectElementId } }));
                                  } else {
                                    console.log('[HEJVI DEBUG] Text answer wrong - No video, showing retry options');
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: null } }));
                                  }
                                }
                              }
                            }}
                          />
                          <button
                            onClick={(e) => {
                              const input = (e.currentTarget.previousSibling);
                              if (!(input && input.value != null)) return;
                              const val = String(input.value || '').trim().toLowerCase();
                              const expected = String(lesson?.fulltext || lesson?.correct_option || '').trim().toLowerCase();
                              const isCorrect = expected && val === expected;
                              
                              console.log('[HEJVI DEBUG] Submit button clicked', {
                                userInput: val,
                                expected,
                                isCorrect,
                                lesson: lesson?.title || lesson?.name
                              });
                              
                              // Use new hash-based system first, fallback to old system
                              const correctHash = lesson?.response_correct_hash;
                              const incorrectHash = lesson?.response_incorrect_hash;
                              const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                              const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;
                              
                              if (isCorrect) {
                                if (correctHash) {
                                  console.log('[HEJVI DEBUG] Submit answer correct - Using correct hash:', correctHash);
                                  setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetHash: correctHash } }));
                                  fetchResponseVideo(correctHash);
                                } else if (correctElementId) {
                                  console.log('[HEJVI DEBUG] Submit answer correct - Using correct element ID:', correctElementId);
                                  setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: 'success', targetElementId: correctElementId } }));
                                } else if (activeIndex === idx) {
                                  onNextVideo();
                                }
                              } else {
                                if (incorrectHash) {
                                  console.log('[HEJVI DEBUG] Submit answer wrong - Using incorrect hash:', incorrectHash);
                                  setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetHash: incorrectHash } }));
                                  fetchResponseVideo(incorrectHash);
                                } else if (incorrectElementId) {
                                  console.log('[HEJVI DEBUG] Submit answer wrong - Using incorrect element ID:', incorrectElementId);
                                  setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: 'failure', targetElementId: incorrectElementId } }));
                                } else {
                                  console.log('[HEJVI DEBUG] Submit answer wrong - No video, showing retry options');
                                  setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: null } }));
                                }
                              }
                            }}
                            style={{ background: '#111827', color: '#fff', border: 0, borderRadius: 12, padding: '14px 18px', fontWeight: 800 }}
                          >
                            {t('submitAnswer') || 'Submit'}
                          </button>
                        </div>
                      )}
                      {/* Hint row */}
                      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div onClick={() => {
                          const correctRaw = String(lesson?.correct_option ?? lesson?.correct_answer ?? lesson?.correct ?? '1').toLowerCase();
                          const correctIsYes = correctRaw === 'yes' || correctRaw === 'true' || correctRaw === '1';
                          const newVal = correctIsYes ? 'yes' : 'no';
                          setHintHighlights((prev) => ({ ...prev, [idx]: newVal }));
                          if (hintTimersRef.current[idx]) {
                            try { clearTimeout(hintTimersRef.current[idx]); } catch (_) {}
                          }
                          hintTimersRef.current[idx] = setTimeout(() => {
                            setHintHighlights((prev) => ({ ...prev, [idx]: null }));
                            hintTimersRef.current[idx] = null;
                          }, 1600);
                        }} style={{
                          background: '#FFFFFF',
                          borderRadius: 14,
                          padding: '18px 22px',
                          width: '100%',
                          maxWidth: 420,
                          boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          color: '#111827',
                          fontWeight: 800,
                          fontSize: 16,
                          cursor: 'pointer',
                          transform: hintHighlights[idx] ? 'scale(1.02)' : 'scale(1)',
                          transition: 'all 160ms ease-out'
                        }}>
                          <span role="img" aria-label="hint">💡</span>
                          {(() => {
                            const raw = String(t('needHint') || 'Need a hint?').trim();
                            const cap = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Need a hint?';
                            return /[?！？]$/.test(cap) ? cap : `${cap}?`;
                          })()}
                        </div>
                      </div>

                      {/* Inline retry options when there is no failure video */}
                      {challengeState[idx]?.status === 'failure' && !lesson?.response_incorrect_hash && !lesson?.element_incorrect_id && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center' }}>
                          <button
                            onClick={() => {
                              // Replay the challenge - reset to idle state
                              setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null } }));
                            }}
                            style={{ background: '#fff', border: 0, borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}
                          >
                            {t('replay') || 'Replay'}
                          </button>
                          <button
                            onClick={() => {
                              // Continue to random video (not next in sequence)
                              console.log('[HEJVI DEBUG] Continue button clicked - playing random video');
                              setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null } }));
                              if (activeIndex === idx) playRandomVideo();
                            }}
                            style={{ background: '#111827', color: '#fff', border: 0, borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}
                          >
                            {t('continue') || 'Continue'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Success/Failure video overlay */}
                  {(() => {
                    const playing = challengeState[idx]?.playing;
                    const targetElementId = challengeState[idx]?.targetElementId;
                    const targetHash = challengeState[idx]?.targetHash;
                    
                    console.log('[HEJVI DEBUG] Overlay check', {
                      idx,
                      playing,
                      targetElementId,
                      targetHash,
                      responseVideos: responseVideos[targetHash]
                    });
                    
                    // Find the target element video URL - prioritize hash-based system
                    let overlayUrl = '';
                    if (playing && targetHash) {
                      // Use hash-based system - get from responseVideos cache
                      const responseVideo = responseVideos[targetHash];
                      if (responseVideo && !responseVideo.loading && responseVideo.url) {
                        overlayUrl = responseVideo.url;
                        console.log('[HEJVI DEBUG] Using hash-based video URL:', overlayUrl);
                      } else {
                        console.log('[HEJVI DEBUG] Hash-based video not ready:', responseVideo);
                      }
                    } else if (playing && targetElementId) {
                      // Fallback to old element ID system
                      const targetElement = lessons.find(l => Number(l.id) === Number(targetElementId) || l.hash_id === targetElementId);
                      if (targetElement) {
                        overlayUrl = normalizeMediaUrl(targetElement.url_element);
                        console.log('[HEJVI DEBUG] Using element ID-based video URL:', overlayUrl);
                      } else {
                        console.log('[HEJVI DEBUG] Element not found for ID:', targetElementId);
                      }
                    }
                    
                    console.log('[HEJVI DEBUG] Final overlay URL:', overlayUrl);
                    
                    return playing && overlayUrl ? (
                    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999 }} onMouseDown={(e)=>e.stopPropagation()} onTouchStart={(e)=>e.stopPropagation()}>
                      {(() => { try { document.body.style.overflow = 'hidden'; } catch (_) {} return null; })()}
                      <video
                        src={overlayUrl}
                        poster={normalizeMediaUrl(lesson?.url_thumbnail)}
                        playsInline
                        autoPlay
                        controls={false}
                        muted={true}
                        crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        ref={(el) => {
                          if (el) {
                            try {
                              el.muted = true; // ensure autoplay works on iOS/Safari
                              const p = el.play();
                              if (p && typeof p.catch === 'function') p.catch(() => {});
                            } catch (_) {}
                          }
                        }}
                        onEnded={() => {
                          try { document.body.style.overflow = ''; } catch (_) {}
                          if (challengeState[idx]?.playing === 'success') {
                            // Success: continue to the next video
                            setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: null, targetElementId: null, targetHash: null } }));
                            if (activeIndex === idx) onNextVideo();
                          } else {
                            // Failure: show replay/continue options
                            setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: null, targetElementId: null, targetHash: null } }));
                          }
                        }}
                      />

                      {challengeState[idx]?.playing == null && challengeState[idx]?.status === 'failure' && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 24,
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'center',
                            gap: 12
                          }}
                        >
                          <button
                            onClick={() => {
                              // Replay the challenge - reset to idle state
                              setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null } }));
                            }}
                            style={{ background: '#fff', border: 0, borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}
                          >
                            {t('replay') || 'Replay'}
                          </button>
                          <button
                            onClick={() => {
                              // Continue to random video (not next in sequence)
                              console.log('[HEJVI DEBUG] Continue button clicked - playing random video');
                              setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null } }));
                              if (activeIndex === idx) playRandomVideo();
                            }}
                            style={{ background: '#111827', color: '#fff', border: 0, borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}
                          >
                            {t('continue') || 'Continue'}
                          </button>
                        </div>
                      )}
                    </div>
                    ) : null;
                  })()}
                </div>
              ) : (
              <video
                ref={(el) => (videoRefs.current[idx] = el)}
                data-idx={idx}
                src={/\.m3u8(\?|$)/i.test(String(lesson.url_element || '')) ? undefined : normalizeMediaUrl(lesson.url_element)}
                poster={normalizeMediaUrl(lesson.url_thumbnail)}
                playsInline
                muted={isMuted}
                controls={false}
                preload="metadata"
                crossOrigin="anonymous"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'block',
                  touchAction: 'manipulation',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none'
                }}
                onClick={(e) => {
                  const now = Date.now();
                  const timeDiff = now - lastTapTime.current;
                  const x = e.clientX;
                  const y = e.clientY;
                  const xDiff = Math.abs(x - lastTapX.current);
                  const yDiff = Math.abs(y - lastTapY.current);
                  
                  // Clear any pending single tap timeout
                  if (singleTapTimeout.current) {
                    clearTimeout(singleTapTimeout.current);
                    singleTapTimeout.current = null;
                  }
                  
                  // Check if this is a double tap (within 300ms and 50px of previous tap)
                  if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
                    const videoWidth = e.currentTarget.offsetWidth;
                    const tapX = e.clientX - e.currentTarget.getBoundingClientRect().left;
                    
                    // Left half = skip backward, right half = skip forward
                    if (tapX < videoWidth / 2) {
                      onSkipBackward(idx);
                      setShowSkipIndicator('backward');
                    } else {
                      onSkipForward(idx);
                      setShowSkipIndicator('forward');
                    }
                    
                    // Hide indicator after 1 second
                    setTimeout(() => setShowSkipIndicator(null), 1000);
                  } else {
                    // Single tap - delay execution to allow for potential double tap
                    singleTapTimeout.current = setTimeout(() => {
                      onTogglePlayPause(idx);
                      singleTapTimeout.current = null;
                    }, 300); // Wait 300ms to see if another tap comes
                  }
                  
                  lastTapTime.current = now;
                  lastTapX.current = x;
                  lastTapY.current = y;
                }}
                autoPlay={idx === startIndex}
                onLoadedMetadata={() => {
                  // HLS fallback if needed
                  const src = String(lesson.url_element || '');
                  const isHls = /\.m3u8(\?|$)/i.test(src);
                  const video = videoRefs.current[idx];
                  if (!isHls || !video) return;
                  try {
                    const canPlayNative = video.canPlayType('application/vnd.apple.mpegURL');
                    if (canPlayNative === 'probably' || canPlayNative === 'maybe') {
                      video.src = normalizeMediaUrl(src);
                      return;
                    }
                    // Dynamic import hls.js only when needed
                    import('hls.js').then((mod) => {
                      const Hls = mod.default || mod;
                      if (Hls && Hls.isSupported()) {
                        if (hlsInstancesRef.current[idx]) {
                          try { hlsInstancesRef.current[idx].destroy(); } catch (_) {}
                        }
                        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                        hls.attachMedia(video);
                        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                          hls.loadSource(normalizeMediaUrl(src));
                        });
                        hlsInstancesRef.current[idx] = hls;
                      } else {
                        // Fallback: set src anyway and hope the browser can play
                        video.src = normalizeMediaUrl(src);
                      }
                    }).catch(() => {
                      // Last resort
                      try { video.src = normalizeMediaUrl(src); } catch (_) {}
                    });
                  } catch (_) {}
                }}
                onError={(e) => {
                  const err = e?.currentTarget?.error;
                  const code = err?.code || 'unknown';
                  console.error('Video error', { idx, code, lesson });
                  setVideoErrors((prev) => ({ ...prev, [idx]: code }));
                }}
              />
              )}

              {/* Overlay controls */}
              <div className="ef-overlay">
                {/* Back button top-left */}
                <button
                  className="ef-back"
                  onClick={handleBackClick}
                  aria-label="Back"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M19 12H5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 19L5 12L12 5"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* Mute toggle top-right */}
                <button
                  className="ef-mute"
                  onClick={onToggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M23 9L17 15" />
                      <path d="M17 9L23 15" />
                    </svg>
                  ) : (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>

                {/* Pause controls - show when video is paused (hide for challenge type=3) */}
                {Number(lesson?.type) !== 3 && isVideoPaused && idx === activeIndex && !showEndPopup && (
                  <div className="ef-pause-controls">
                    <button
                      className="ef-control-btn ef-play-btn"
                      onClick={() => onTogglePlayPause(idx)}
                      aria-label="Play"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M8 5V19L19 12L8 5Z"
                          fill="#fff"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      className="ef-control-btn ef-replay-btn"
                      onClick={() => onReplay(idx)}
                      aria-label="Replay"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M1 4V10H7"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M23 20V14H17"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                )}

                {/* End popup - show when video ends (hide for challenge type=3) */}
                {Number(lesson?.type) !== 3 && showEndPopup && idx === activeIndex && (
                  <div className="ef-end-popup">
                    <div className="ef-end-popup-content">
                      <div className="ef-end-timer">
                        {t('nextVideoIn')} {endPopupTimer}{t('seconds')}
                      </div>
                      <div className="ef-end-buttons">
                        <button
                          className="ef-end-btn ef-end-replay-btn"
                          onClick={() => onReplay(idx)}
                          aria-label={t('replay')}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M1 4V10H7"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M23 20V14H17"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {t('replay')}
                        </button>
                        <button
                          className="ef-end-btn ef-end-next-btn"
                          onClick={() => {
                            // Dismiss popup and go to next immediately on user action
                            console.log('[HEJVI DEBUG] Next button clicked manually');
                            setShowEndPopup(false);
                            setEndPopupTimer(3);
                            onNextVideo();
                          }}
                          aria-label={t('next')}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 4V20L16 12L5 4Z"
                              fill="#fff"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M19 5V19"
                              stroke="#fff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {t('next')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Skip indicator - show when double tapping (hide for challenge type=3) */}
                {Number(lesson?.type) !== 3 && showSkipIndicator && idx === activeIndex && (
                  <div className={`ef-skip-indicator ef-skip-${showSkipIndicator}`}>
                    <div className="ef-skip-icon">
                      {showSkipIndicator === 'forward' ? (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M13 5L22 12L13 19V5Z"
                            fill="#fff"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M2 5L11 12L2 19V5Z"
                            fill="#fff"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M11 19L2 12L11 5V19Z"
                            fill="#fff"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M22 19L13 12L22 5V19Z"
                            fill="#fff"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                {/* Bottom progress bar and title (hide progress/time for challenge type=3) */}
                <div className="ef-bottom">
                  <div className="ef-title">{lesson.name}</div>
                  {Number(lesson?.type) !== 3 && (
                    <>
                      {/* Show small error indicator when a video fails */}
                      {videoErrors[idx] && (
                        <div className="ef-error" style={{ color: '#ffb4b4', fontSize: 12 }}>
                          {t('error') || 'Error'}
                        </div>
                      )}
                      <div 
                        className="ef-progress"
                        onClick={(e) => onProgressBarClick(idx, e)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div
                          className="ef-progress-fill"
                          style={{
                            width:
                              duration > 0 && idx === activeIndex
                                ? `${Math.min(100, Math.floor((currentTime / duration) * 100))}%`
                                : '0%'
                          }}
                        />
                      </div>
                      {idx === activeIndex && (
                        <div className="ef-time">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </GlobalLayout>
  );
};

export default ElementFeed;
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import useScrollSnap from 'react-use-scroll-snap';
import GlobalLayout from './GlobalLayout';
import './ElementFeed.css';
import { getCollectionByHash, getElementByHash, getElementById } from '../services/apiService';
import { useLanguage } from '../context/LanguageContext';
import { useExternalBackButton } from '../hooks/useExternalBackButton';
import { appConfig } from '../config';

const ElementFeed = () => {
  const { hashId } = useParams(); // collection hash
  const location = useLocation();
  const { t } = useLanguage();

  // Set up external back button handling
  const { handleBackClick } = useExternalBackButton('/dashboard');

  const [lessons, setLessons] = useState(() => {
    const fromState = location?.state?.lessons;
    return Array.isArray(fromState) ? fromState : [];
  });

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
    const savedMuteState = localStorage.getItem('hejvi_video_muted');
    return savedMuteState !== null ? savedMuteState === 'true' : true;
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewportHeight, setViewportHeight] = useState('100vh');
  const [isVideoPaused, setIsVideoPaused] = useState(false);
  const [showEndPopup, setShowEndPopup] = useState(false);
  const [endPopupTimer, setEndPopupTimer] = useState(3);
  const [showSkipIndicator, setShowSkipIndicator] = useState(null);
  const [challengeState, setChallengeState] = useState({});
  const [hintHighlights, setHintHighlights] = useState({});
  const hintTimersRef = useRef({});
  const [responseVideos, setResponseVideos] = useState({});
  const [returnToChallenge, setReturnToChallenge] = useState(null);
  const [overlayProgress, setOverlayProgress] = useState({});

  // Helpers to resolve success/incorrect element IDs to media URLs
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

    if (responseVideos[hash] && !responseVideos[hash].error) {
      console.log('[HEJVI DEBUG] fetchResponseVideo: Using cached result:', responseVideos[hash]);
      return responseVideos[hash];
    }
    
    if (responseVideos[hash] && responseVideos[hash].error) {
      console.log('[HEJVI DEBUG] fetchResponseVideo: Cached result has error, will try variants:', responseVideos[hash]);
    }

    setResponseVideos(prev => ({ ...prev, [hash]: { loading: true, url: '', thumbnail: '', error: '' } }));

    // Try different hash formats if the original fails
    const hashVariants = [
      hash, // Original hash
      hash.startsWith('el-') ? hash : `el-${hash}`, // Add el- prefix if missing
      hash.replace('prod_', 'el-'), // Replace prod_ with el-
      hash.replace('_', '-'), // Replace underscore with dash
    ];
    
    console.log('[HEJVI DEBUG] fetchResponseVideo: Original hash:', hash);
    console.log('[HEJVI DEBUG] fetchResponseVideo: Generated variants:', hashVariants);
    console.log('[HEJVI DEBUG] fetchResponseVideo: Will try hash variants:', hashVariants);

    for (const hashVariant of hashVariants) {
      try {
        console.log('[HEJVI DEBUG] fetchResponseVideo: Trying hash variant:', hashVariant);
        const res = await getElementByHash(hashVariant);
      const element = res?.data || res || {};
      console.log('[HEJVI DEBUG] fetchResponseVideo: API response:', res);
      console.log('[HEJVI DEBUG] fetchResponseVideo: Element data:', element);
      console.log('[HEJVI DEBUG] fetchResponseVideo: Element url_element:', element?.url_element);
      console.log('[HEJVI DEBUG] fetchResponseVideo: Element url:', element?.url);

      const rawUrl = element?.url_element || element?.url || '';
      const normalizedUrl = normalizeMediaUrl(rawUrl);
      console.log('[HEJVI DEBUG] fetchResponseVideo: Raw URL:', rawUrl);
      console.log('[HEJVI DEBUG] fetchResponseVideo: Normalized URL:', normalizedUrl);
      
      const result = {
        url: normalizedUrl,
        thumbnail: normalizeMediaUrl(element?.url_thumbnail || element?.thumbnail || ''),
        loading: false,
        error: ''
      };
      
      console.log('[HEJVI DEBUG] fetchResponseVideo: Normalized result:', result);

        setResponseVideos(prev => ({ ...prev, [hash]: result }));
        console.log('[HEJVI DEBUG] fetchResponseVideo: Final result:', result);
        return result;
      } catch (error) {
        console.log('[HEJVI DEBUG] fetchResponseVideo: Error with variant', hashVariant, ':', error);
        if (hashVariant === hashVariants[hashVariants.length - 1]) {
          // All hash variants failed, try fallback approaches
          console.log('[HEJVI DEBUG] fetchResponseVideo: All hash variants failed, trying fallback approaches');
          
          // Check if we have a numeric ID to try (from element_correct_id or element_incorrect_id)
          const currentLesson = lessons.find(lesson => 
            lesson.response_correct_hash === hash || lesson.response_incorrect_hash === hash
          );
          
          if (currentLesson) {
            const numericId = hash === currentLesson.response_correct_hash 
              ? currentLesson.element_correct_id 
              : currentLesson.element_incorrect_id;
              
            if (numericId) {
              console.log('[HEJVI DEBUG] fetchResponseVideo: Trying numeric ID fallback:', numericId);
              try {
                const res = await getElementById(numericId);
                console.log('[HEJVI DEBUG] fetchResponseVideo: Numeric ID success:', res);
                
                const result = {
                  url: res.data.url_element || '',
                  thumbnail: res.data.url_thumbnail || '',
                  loading: false,
                  error: ''
                };
                setResponseVideos(prev => ({ ...prev, [hash]: result }));
                console.log('[HEJVI DEBUG] fetchResponseVideo: Final result (numeric ID):', result);
                return result;
              } catch (numericError) {
                console.log('[HEJVI DEBUG] fetchResponseVideo: Numeric ID also failed:', numericError);
              }
            }
          }
          
          // If numeric ID also fails, try using existing elements as fallback
          console.log('[HEJVI DEBUG] fetchResponseVideo: Trying existing element fallback');
          
          // Use different fallback elements for correct vs incorrect responses
          const isCorrectResponse = hash === currentLesson?.response_correct_hash;
          const fallbackElements = isCorrectResponse 
            ? ['el-uuid-001', 'el-uuid-002'] // Different elements for correct responses
            : ['el-uuid-003', 'el-uuid-006']; // Different elements for incorrect responses
          
          console.log('[HEJVI DEBUG] fetchResponseVideo: Using fallback elements for', isCorrectResponse ? 'correct' : 'incorrect', 'response:', fallbackElements);
          
          for (const fallbackHash of fallbackElements) {
            try {
              console.log('[HEJVI DEBUG] fetchResponseVideo: Trying fallback element:', fallbackHash);
              const res = await getElementByHash(fallbackHash);
              console.log('[HEJVI DEBUG] fetchResponseVideo: Fallback element success:', fallbackHash);
              
              const result = {
                url: res.data.url_element || '',
                thumbnail: res.data.url_thumbnail || '',
                loading: false,
                error: ''
              };
              setResponseVideos(prev => ({ ...prev, [hash]: result }));
              console.log('[HEJVI DEBUG] fetchResponseVideo: Final result (fallback element):', result);
              return result;
            } catch (fallbackError) {
              console.log('[HEJVI DEBUG] fetchResponseVideo: Fallback element failed:', fallbackHash, fallbackError.message);
              continue;
            }
          }
          
          // All attempts failed, return error with helpful message
          const result = {
            url: '',
            thumbnail: '',
            loading: false,
            error: `Response video not found. Tried variants: ${hashVariants.join(', ')}`
          };
          setResponseVideos(prev => ({ ...prev, [hash]: result }));
          console.log('[HEJVI DEBUG] fetchResponseVideo: All attempts failed, returning error:', result);
          return result;
        }
        // Continue to next variant
      }
    }
  }, [responseVideos, lessons]);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const lastTapTime = useRef(0);
  const lastTapX = useRef(0);
  const lastTapY = useRef(0);
  const singleTapTimeout = useRef(null);
  const videoRefs = useRef([]);
  const [videoErrors, setVideoErrors] = useState({});
  const hlsInstancesRef = useRef({});
  const navigatingRef = useRef(false);

  const normalizeMediaUrl = (raw) => {
    if (!raw) return '';
    let url = String(raw).trim();
    try {
      const u = new URL(url, /^https?:\/\//i.test(url) ? undefined : 'https://dummy');
      u.pathname = u.pathname
        .split('/')
        .map(seg => encodeURIComponent(decodeURIComponent(seg)))
        .join('/');
      url = u.href.replace('https://dummy', '');
    } catch (_) {}
    if (!/^https?:\/\//i.test(url)) {
      if (url.startsWith('//')) url = `https:${url}`;
      else if (url.startsWith('/')) url = url;
      else url = `https://${url}`;
    }
    if (url.includes('app.hejvi.de/') && !url.includes('/api/')) {
      url = url.replace('app.hejvi.de/', 'app.hejvi.de/api/');
    }
    return url;
  };

  const buildMediaUrl = (path) => {
    const safePath = String(path || '').startsWith('/') ? path : `/${path || ''}`;
    const base = String(appConfig.apiBaseUrl || '').replace(/\/$/, '');
    let url = `${base}${safePath}`;
    // Ensure absolute for media playback (avoids dev proxy edge-cases)
    if (!/^https?:\/\//i.test(url)) {
      url = `https://app.hejvi.de${url}`;
    }
    return normalizeMediaUrl(url);
  };

  // Fetch element video URL given an element ID or hash-like ID
  const fetchElementVideo = useCallback(async (elementId) => {
    try {
      const { url } = resolveElementMediaById(elementId);
      if (url) return url;

      const idStr = String(elementId || '');
      if (idStr.startsWith('el-')) {
        const res = await getElementByHash(idStr);
        const apiUrl = res?.data?.data?.url_element || res?.data?.url_element || '';
        return normalizeMediaUrl(apiUrl);
      }
      const res = await getElementById(Number(elementId));
      const apiUrl = res?.data?.data?.url_element || res?.data?.url_element || '';
      return normalizeMediaUrl(apiUrl);
    } catch (_) {
      return '';
    }
  }, [resolveElementMediaById]);

  // playChallengeVideo is defined later, after its dependencies

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

    const isDirectAccess = !location?.state || Object.keys(location.state).length === 0;
    if (isDirectAccess) {
      console.log('ElementFeed detected direct access - going to dashboard');
      return '/dashboard';
    }

    if (courseHash && courseHash.startsWith('col-')) {
      console.log('ElementFeed going back to collection:', `/collection/${courseHash}`);
      return `/collection/${courseHash}`;
    }

    const sourcePage = location?.state?.sourcePage;
    if (sourcePage && sourcePage !== '/login' && sourcePage !== '/') {
      console.log('ElementFeed using sourcePage:', sourcePage);
      return sourcePage;
    }

    console.log('ElementFeed defaulting to dashboard');
    return '/dashboard';
  }, [collectionData, hashId, location?.state?.sourcePage]);

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

  useEffect(() => {
    const node = videoRefs.current[startIndex]?.closest('[data-snap-section]');
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    setActiveIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    if (!Array.isArray(lessons) || lessons.length === 0) return;
    const idx = Number(location?.state?.startIndex ?? startIndex ?? 0);
    if (!Number.isFinite(idx) || idx < 0 || idx >= lessons.length) return;

    setActiveIndex(idx);
    hasRotatedForElementDetailRef.current = true;
    setTimeout(() => {
      const node = videoRefs.current[idx]?.closest('[data-snap-section]');
      if (node && node.scrollIntoView) {
        try { node.scrollIntoView({ behavior: 'instant', block: 'start' }); } catch (_) {}
      }
    }, 0);
  }, [lessons, startIndex, location?.state?.startIndex]);

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
          const res = await getElementByHash(id);
          const elem = res?.data || null;
          const collection = location?.state?.collectionData || null;

          if (collection && Array.isArray(collection.elements)) {
            setLessons(collection.elements);
          } else {
            setLessons(elem ? [elem] : []);
          }
        }
      } catch (_) {}
    })();
  }, [hashId, lessons.length]);

  useEffect(() => {
    const elements = videoRefs.current.filter(Boolean);
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let pending = null;
        entries.forEach((entry) => {
          const vid = entry.target;
          if (!(vid instanceof HTMLVideoElement)) return;
          const idxAttr = vid.getAttribute('data-idx');
          const idxNum = Number(idxAttr);
          if (entry.isIntersecting && entry.intersectionRatio > 0.6 && Number.isFinite(idxNum)) {
            if (pending) clearTimeout(pending);
            pending = setTimeout(() => {
              if (!navigatingRef.current) setActiveIndex(idxNum);
            }, 100);
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );

    elements.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [lessons.length]);

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
    setIsSimFullscreen(!isSimFullscreen);
  };

  const onToggleMute = () => {
    const vid = videoRefs.current[activeIndex];
    if (!vid) return;

    const next = !isMuted;
    try {
      vid.muted = next;
    } catch (_) {}
    setIsMuted(next);
    localStorage.setItem('hejvi_video_muted', next.toString());

    if (!next) {
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
    event.stopPropagation();
    const vid = videoRefs.current[idx];
    if (!vid || !vid.duration) return;

    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * vid.duration;

    vid.currentTime = Math.max(0, Math.min(vid.duration, newTime));
  };

  const playRandomVideo = useCallback(() => {
    const total = (lessons || []).length;
    if (total === 0) return;

    let randomIdx;
    do {
      randomIdx = Math.floor(Math.random() * total);
    } while (randomIdx === activeIndex && total > 1);

    console.log('[HEJVI DEBUG] Playing random video at index:', randomIdx);

    if (randomIdx !== activeIndex) {
      setActiveIndex(randomIdx);
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

  const getRandomLessonVideoUrl = useCallback(() => {
    const pool = (lessons || []).filter((l, i) => Number(l?.type) !== 3 && i !== activeIndex && l?.url_element);
    if (pool.length === 0) {
      const anyPool = (lessons || []).filter((l, i) => i !== activeIndex && l?.url_element);
      if (anyPool.length === 0) return '';
      const pick = anyPool[Math.floor(Math.random() * anyPool.length)];
      return normalizeMediaUrl(pick.url_element);
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return normalizeMediaUrl(pick.url_element);
  }, [lessons, activeIndex]);

  const onNextVideo = useCallback(() => {
    const total = (lessons || []).length;
    if (total === 0) return;

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

    let targetIdx = -1;
    for (let i = activeIndex + 1; i < total; i += 1) {
      const lesson = lessons[i];
      const isChallenge = (
        Number(lesson?.type) === 3 ||
        Number(lesson?.challenge_type) !== undefined ||
        lesson?.question ||
        lesson?.correct_option !== undefined
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
      navigatingRef.current = true;
      setActiveIndex(targetIdx);

      const forceNavigation = () => {
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

      if (!forceNavigation()) {
        setTimeout(() => forceNavigation(), 100);
      }
      setTimeout(() => { navigatingRef.current = false; }, 500);
    } else {
      console.log('[HEJVI DEBUG] No navigation needed or invalid target index');
    }
    setShowEndPopup(false);
  }, [activeIndex, lessons]);

  /**
   * Play challenge video based on user answer
   */
  const playChallengeVideo = useCallback(async ({
    isYesCorrect,
    idx,
    lesson,
    correctElementId,
    incorrectElementId,
    correctHash,
    incorrectHash
  }) => {
    console.log('[HEJVI DEBUG] Challenge hash values:', {
      correctHash,
      incorrectHash,
      lessonName: lesson?.name,
      lessonId: lesson?.id,
      lessonHashId: lesson?.hash_id
    });

    const setSuccessState = (url, targetId = null, hash = null) => {
      setChallengeState((p) => ({
        ...p,
        [idx]: {
          status: 'success',
          playing: 'success',
          targetElementId: targetId,
          targetHash: hash,
          randomUrl: url
        }
      }));
    };

    const setFailureState = (url, targetId = null, hash = null) => {
      setChallengeState((p) => ({
        ...p,
        [idx]: {
          status: 'failure',
          playing: 'failure',
          targetElementId: targetId,
          targetHash: hash,
          randomUrl: url
        }
      }));
    };

    try {
      if (isYesCorrect) {
        if (correctElementId) {
          console.log('[HEJVI DEBUG] Correct answer - Fetching video for element ID:', correctElementId);
          const url = await fetchElementVideo(correctElementId);
          if (url) setSuccessState(url, correctElementId);
          else setSuccessState(null);
        } else if (correctHash) {
          console.log('[HEJVI DEBUG] Correct answer - Using hash:', correctHash);
          const res = await fetchResponseVideo(correctHash);
          const url = res?.url || '';
          if (url) setSuccessState(url, null, correctHash);
          else setSuccessState(null);
        } else {
          console.log('[HEJVI DEBUG] Correct answer - No video, moving to next');
          setSuccessState(null);
          if (activeIndex === idx) onNextVideo();
        }
      } else {
        if (incorrectElementId) {
          console.log('[HEJVI DEBUG] Incorrect answer - Fetching video for element ID:', incorrectElementId);
          const url = await fetchElementVideo(incorrectElementId);
          if (url) setFailureState(url, incorrectElementId);
          else setFailureState(null);
        } else if (incorrectHash) {
          console.log('[HEJVI DEBUG] Incorrect answer - Using hash:', incorrectHash);
          const res = await fetchResponseVideo(incorrectHash);
          const url = res?.url || '';
          if (url) setFailureState(url, null, incorrectHash);
          else setFailureState(null);
        } else {
          // No incorrectElementId and no incorrectHash: do NOT play random content.
          // Show failure controls immediately without overlay playback.
          console.log('[HEJVI DEBUG] Incorrect answer - No video available; showing failure controls');
          setChallengeState((p) => ({
            ...p,
            [idx]: {
              status: 'failure',
              playing: null,
              targetElementId: null,
              targetHash: null,
              randomUrl: null
            }
          }));
        }
      }
    } catch (error) {
      console.error('[HEJVI DEBUG] Error handling challenge video:', error);
    }
  }, [activeIndex, fetchElementVideo, getRandomLessonVideoUrl, onNextVideo]);

  useEffect(() => {
    if (singleTapTimeout.current) {
      clearTimeout(singleTapTimeout.current);
      singleTapTimeout.current = null;
    }
    setShowEndPopup(false);
  }, [activeIndex]);

  useEffect(() => {
    const vid = videoRefs.current[activeIndex];
    if (!vid) return;

    const onTime = () => {
      setCurrentTime(vid.currentTime || 0);
      setDuration(vid.duration || 0);
    };

    const onLoaded = () => {
      setDuration(vid.duration || 0);
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
      const lesson = lessons[activeIndex];
      const timerOnEnd = Number(lesson?.timer_on_end ?? 1);
      console.log('[HEJVI DEBUG] Video ended', {
        activeIndex,
        lesson: lesson?.title || lesson?.name,
        timerOnEnd,
        lessonType: lesson?.type
      });

      if (returnToChallenge && Number(lesson?.type) !== 3) {
        console.log('[HEJVI DEBUG] Finished replay target, showing end popup before returning to challenge', returnToChallenge);
        setShowEndPopup(true);
        setEndPopupTimer(3);
        return;
      }
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
  }, [activeIndex, isMuted, lessons, chapterStartTime, returnToChallenge, onNextVideo, startIndex]);

  useEffect(() => {
    if (!showEndPopup) return;
    if (endPopupTimer > 0) {
      const timer = setTimeout(() => {
        setEndPopupTimer(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
    if (endPopupTimer === 0) {
      console.log('[HEJVI DEBUG] Timer expired');
      setShowEndPopup(false);
      setEndPopupTimer(3);
      setTimeout(() => {
        if (returnToChallenge) {
          const target = Math.min(Math.max(0, Number(returnToChallenge.targetIdx || 0)), (lessons || []).length - 1);
          console.log('[HEJVI DEBUG] Returning to challenge at index', target);
          try {
            setActiveIndex(target);
            const section = videoRefs.current[target]?.closest('[data-snap-section]');
            if (section) {
              try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
            }
          } finally {
            setReturnToChallenge(null);
          }
        } else {
          onNextVideo();
        }
      }, 50);
    }
  }, [showEndPopup, endPopupTimer, onNextVideo, returnToChallenge, lessons]);

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

          if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > threshold) {
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

          if (top >= maxScroll - 1) {
            container.scrollTop = maxScroll;
            setActiveIndex(sections.length - 1);
            setShowEndPopup(false);
            return;
          }

          let bestIdx = 0;
          let bestDist = Infinity;
          sections.forEach((sec, i) => {
            const dist = Math.abs(sec.offsetTop - top);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          });

          if (bestIdx !== activeIndex) {
            setShowEndPopup(false);
          }

          setActiveIndex(bestIdx);
        }}
      >
        {lessons.map((lesson, idx) => {
          return (
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
                    <div style={{ height: 0, width: '100%' }} />
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
                    />
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
                        {Number(lesson?.challenge_type ?? 0) === 0 ? (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button
                              onClick={async () => {
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

                                const correctHash = lesson?.response_correct_hash;
                                const incorrectHash = lesson?.response_incorrect_hash;
                                const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                                const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;

                                console.log('[HEJVI DEBUG] Challenge hash values:', {
                                  correctHash,
                                  incorrectHash,
                                  lessonName: lesson?.name,
                                  lessonId: lesson?.id,
                                  lessonHashId: lesson?.hash_id
                                });

                                playChallengeVideo({
                                  isYesCorrect,
                                  idx,
                                  lesson,
                                  correctElementId: lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id,
                                  incorrectElementId: lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id,
                                  correctHash: lesson?.response_correct_hash,
                                  incorrectHash: lesson?.response_incorrect_hash
                                });
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

                                const correctHash = lesson?.response_correct_hash;
                                const incorrectHash = lesson?.response_incorrect_hash;
                                const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                                const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;

                                playChallengeVideo({
                                  isYesCorrect: isNoCorrect,
                                  idx,
                                  lesson,
                                  correctElementId: lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id,
                                  incorrectElementId: lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id,
                                  correctHash: lesson?.response_correct_hash,
                                  incorrectHash: lesson?.response_incorrect_hash
                                });
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

                                  const correctHash = lesson?.response_correct_hash;
                                  const incorrectHash = lesson?.response_incorrect_hash;
                                  const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                                  const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;

                                  playChallengeVideo({
                                    isYesCorrect: isCorrect,
                                    idx,
                                    lesson,
                                    correctElementId: lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id,
                                    incorrectElementId: lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id,
                                    correctHash: lesson?.response_correct_hash,
                                    incorrectHash: lesson?.response_incorrect_hash
                                  });
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.currentTarget.previousSibling;
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

                                const correctHash = lesson?.response_correct_hash;
                                const incorrectHash = lesson?.response_incorrect_hash;
                                const correctElementId = lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id;
                                const incorrectElementId = lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id;

                                playChallengeVideo({
                                  isYesCorrect: isCorrect,
                                  idx,
                                  lesson,
                                  correctElementId: lesson?.element_correct_id ?? lesson?.correct_element_id ?? lesson?.element_correct_hash_id ?? lesson?.correct_element_hash_id,
                                  incorrectElementId: lesson?.element_incorrect_id ?? lesson?.incorrect_element_id ?? lesson?.element_incorrect_hash_id ?? lesson?.incorrect_element_hash_id,
                                  correctHash: lesson?.response_correct_hash,
                                  incorrectHash: lesson?.response_incorrect_hash
                                });
                              }}
                              style={{ background: '#111827', color: '#fff', border: 0, borderRadius: 12, padding: '14px 18px', fontWeight: 800 }}
                            >
                              {t('submitAnswer') || 'Submit'}
                            </button>
                          </div>
                        )}
                        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div
                            onClick={() => {
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
                            }}
                            style={{
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
                            }}
                          >
                            <span role="img" aria-label="hint">💡</span>
                            {(() => {
                              const raw = String(t('needHint') || 'Need a hint?').trim();
                              const cap = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Need a hint?';
                              return /[?！？]$/.test(cap) ? cap : `${cap}?`;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const playing = challengeState[idx]?.playing;
                      const targetElementId = challengeState[idx]?.targetElementId;
                      const targetHash = challengeState[idx]?.targetHash;
                      const randomUrl = challengeState[idx]?.randomUrl;

                      console.log('[HEJVI DEBUG] Overlay check', {
                        idx,
                        playing,
                        targetElementId,
                        targetHash,
                        randomUrl,
                        responseVideos: responseVideos[targetHash]
                      });

                      let overlayUrl = '';
                      let isHls = false;
                      if (playing && targetHash) {
                        const responseVideo = responseVideos[targetHash];
                        console.log('[HEJVI DEBUG] Checking responseVideo for targetHash:', targetHash, responseVideo);
                        if (responseVideo && !responseVideo.loading && responseVideo.url) {
                          overlayUrl = responseVideo.url;
                          isHls = /\.m3u8(\?|$)/i.test(overlayUrl);
                          console.log('[HEJVI DEBUG] Using hash-based video URL:', overlayUrl);
                        } else {
                          console.log('[HEJVI DEBUG] Hash-based video not ready:', {
                            responseVideo,
                            hasResponseVideo: !!responseVideo,
                            isLoading: responseVideo?.loading,
                            hasUrl: !!responseVideo?.url,
                            url: responseVideo?.url
                          });
                        }
                      } else if (playing && targetElementId) {
                        const targetElement = lessons.find(l => Number(l.id) === Number(targetElementId) || l.hash_id === targetElementId);
                        if (targetElement) {
                          overlayUrl = normalizeMediaUrl(targetElement.url_element);
                          isHls = /\.m3u8(\?|$)/i.test(overlayUrl);
                          console.log('[HEJVI DEBUG] Using element ID-based video URL:', overlayUrl);
                        } else {
                          console.log('[HEJVI DEBUG] Element not found for ID:', targetElementId);
                        }
                      } else if (playing && randomUrl) {
                        overlayUrl = normalizeMediaUrl(randomUrl);
                        isHls = /\.m3u8(\?|$)/i.test(overlayUrl);
                        console.log('[HEJVI DEBUG] Using random failure video URL:', overlayUrl);
                      }

                      console.log('[HEJVI DEBUG] Final overlay URL:', overlayUrl, 'isHLS:', isHls);

                      if (!playing && !(challengeState[idx]?.playing == null && challengeState[idx]?.status === 'failure')) return null;

                      return (
                        <div className="ef-overlay-fixed" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                          {(() => { try { document.body.style.overflow = 'hidden'; } catch (_) {} return null; })()}
                          <div className="ef-overlay-stage">
                            <button
                              onClick={onToggleMute}
                              aria-label={isMuted ? 'Unmute' : 'Mute'}
                              style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                zIndex: 30,
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                background: 'rgba(17,24,39,0.7)',
                                border: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {isMuted ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                  <path d="M23 9L17 15" />
                                  <path d="M17 9L23 15" />
                                </svg>
                              ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                                </svg>
                              )}
                            </button>
                            {!overlayUrl && playing && targetHash && responseVideos[targetHash]?.error && !responseVideos[targetHash]?.loading && (
                              <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                color: '#fff',
                                fontSize: '16px',
                                fontWeight: '600',
                                textAlign: 'center',
                                background: 'rgba(220,38,38,0.8)',
                                padding: '20px',
                                borderRadius: '10px',
                                maxWidth: '300px'
                              }}>
                                <div style={{ marginBottom: '10px' }}>⚠️ Response video not found</div>
                                <div style={{ fontSize: '14px', opacity: 0.9 }}>
                                  The response video for this challenge doesn't exist yet.
                                </div>
                              </div>
                            )}
                            {overlayUrl && (() => {
                              console.log('[HEJVI DEBUG] Rendering video element with URL:', overlayUrl);
                              return (
                              <video
                                className="ef-overlay-video"
                                src={!isHls ? overlayUrl : undefined}
                                poster={normalizeMediaUrl(lesson?.url_thumbnail)}
                                playsInline
                                autoPlay
                                controls={false}
                                muted={isMuted}
                                crossOrigin="anonymous"
                                onLoadStart={() => console.log('[HEJVI DEBUG] Video load started:', overlayUrl)}
                                onLoadedData={() => console.log('[HEJVI DEBUG] Video data loaded:', overlayUrl)}
                                onCanPlay={() => console.log('[HEJVI DEBUG] Video can play:', overlayUrl)}
                                onError={(e) => console.error('[HEJVI DEBUG] Video error:', e, overlayUrl)}
                              ref={(el) => {
                                if (el) {
                                  try {
                                    el.muted = isMuted;
                                    if (isHls) {
                                      import('hls.js').then((mod) => {
                                        const Hls = mod.default || mod;
                                        if (Hls && Hls.isSupported()) {
                                          const hlsKey = `overlay-${idx}`;
                                          if (hlsInstancesRef.current[hlsKey]) {
                                            try { hlsInstancesRef.current[hlsKey].destroy(); } catch (_) {}
                                          }
                                          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                                          hls.attachMedia(el);
                                          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                                            hls.loadSource(overlayUrl);
                                          });
                                          hlsInstancesRef.current[hlsKey] = hls;
                                        } else {
                                          el.src = overlayUrl;
                                          el.play().catch(() => {});
                                        }
                                      }).catch(() => {
                                        el.src = overlayUrl;
                                        el.play().catch(() => {});
                                      });
                                    } else {
                                      el.play().catch(() => {});
                                    }
                                  } catch (_) {}
                                }
                              }}
                              onLoadedMetadata={(e) => {
                                const v = e.currentTarget;
                                setOverlayProgress((p) => ({ ...p, [idx]: { current: 0, duration: Number(v.duration || 0) } }));
                              }}
                              onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                setOverlayProgress((p) => ({ ...p, [idx]: { current: Number(v.currentTime || 0), duration: Number(v.duration || 0) } }));
                              }}
                              onEnded={() => {
                                try { document.body.style.overflow = ''; } catch (_) {}
                                const hlsKey = `overlay-${idx}`;
                                if (hlsInstancesRef.current[hlsKey]) {
                                  try { hlsInstancesRef.current[hlsKey].destroy(); } catch (_) {}
                                  delete hlsInstancesRef.current[hlsKey];
                                }
                                if (challengeState[idx]?.playing === 'success') {
                                  setChallengeState((p) => ({ ...p, [idx]: { status: 'success', playing: null, targetElementId: null, targetHash: null, randomUrl: null } }));
                                  if (activeIndex === idx) onNextVideo();
                                    } else {
                                      setChallengeState((p) => ({ ...p, [idx]: { status: 'failure', playing: null, targetElementId: null, targetHash: null, randomUrl: null } }));
                                    }
                              }}
                            />
                            );
                            })()}
                            {overlayUrl && (() => {
                              const prog = overlayProgress[idx] || { current: 0, duration: 0 };
                              const pct = prog.duration > 0 ? Math.min(100, Math.floor((prog.current / prog.duration) * 100)) : 0;
                              return (
                                <div className="ef-overlay-hud">
                                  <div className="ef-overlay-progress" onClick={(e) => {
                                    const stage = e.currentTarget.closest('.ef-overlay-stage');
                                    const videoEl = stage ? stage.querySelector('.ef-overlay-video') : null;
                                    if (!videoEl || !videoEl.duration) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const clickX = e.clientX - rect.left;
                                    const percentage = clickX / rect.width;
                                    const newTime = percentage * videoEl.duration;
                                    try { videoEl.currentTime = Math.max(0, Math.min(videoEl.duration, newTime)); } catch (_) {}
                                  }}>
                                    <div className="ef-overlay-progress-fill" style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="ef-overlay-time">
                                    {formatTime(prog.current)} / {formatTime(prog.duration)}
                                  </div>
                                </div>
                              );
                            })()}
                            {challengeState[idx]?.playing == null && challengeState[idx]?.status === 'failure' && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  display: 'flex',
                                  justifyContent: 'center',
                                  gap: 12,
                                  zIndex: 20
                                }}
                              >
                                <button
                                  onClick={() => {
                                    console.log('[HEJVI DEBUG] Replay clicked at quiz index', idx);
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null, randomUrl: null } }));
                                    setReturnToChallenge({ targetIdx: idx });
                                    const targetPlayableIdx = 0;
                                    console.log('[HEJVI DEBUG] Replay targetPlayableIdx hardcoded to first video:', targetPlayableIdx);
                                    if (lessons.length > 0 && lessons[0]?.url_element) {
                                      navigatingRef.current = true;
                                      setActiveIndex(targetPlayableIdx);
                                      setTimeout(() => {
                                        const section = videoRefs.current[targetPlayableIdx]?.closest('[data-snap-section]');
                                        if (section) {
                                          try {
                                            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            console.log('[HEJVI DEBUG] Scrolled to first video');
                                          } catch (_) {}
                                        }
                                        const v = videoRefs.current[targetPlayableIdx];
                                        if (v) {
                                          try {
                                            v.currentTime = 0;
                                            v.play().catch((e) => console.log('[HEJVI DEBUG] Play failed:', e));
                                            console.log('[HEJVI DEBUG] Playing first video');
                                          } catch (_) {}
                                        }
                                        navigatingRef.current = false;
                                      }, 100);
                                    } else {
                                      console.log('[HEJVI DEBUG] First video not playable for replay');
                                      setReturnToChallenge(null);
                                      setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null, randomUrl: null } }));
                                    }
                                  }}
                                  style={{ 
                                    background: '#fff', 
                                    border: 0, 
                                    borderRadius: 10, 
                                    padding: '12px 16px', 
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 4V10H7" />
                                    <path d="M23 20V14H17" />
                                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" />
                                  </svg>
                                  {t('replay') || 'Replay'}
                                </button>
                                <button
                                  onClick={() => {
                                    console.log('[HEJVI DEBUG] Continue button clicked - advancing to next video');
                                    setChallengeState((p) => ({ ...p, [idx]: { status: 'idle', playing: null, targetElementId: null, targetHash: null, randomUrl: null } }));
                                    if (activeIndex === idx) onNextVideo();
                                  }}
                                  style={{ 
                                    background: '#111827', 
                                    color: '#fff', 
                                    border: 0, 
                                    borderRadius: 10, 
                                    padding: '12px 16px', 
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 4V20L16 12L5 4Z" />
                                    <path d="M19 5V19" />
                                  </svg>
                                  {t('continue') || 'Continue'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
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

                      if (singleTapTimeout.current) {
                        clearTimeout(singleTapTimeout.current);
                        singleTapTimeout.current = null;
                      }

                      if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
                        const videoWidth = e.currentTarget.offsetWidth;
                        const tapX = e.clientX - e.currentTarget.getBoundingClientRect().left;

                        if (tapX < videoWidth / 2) {
                          onSkipBackward(idx);
                          setShowSkipIndicator('backward');
                        } else {
                          onSkipForward(idx);
                          setShowSkipIndicator('forward');
                        }

                        setTimeout(() => setShowSkipIndicator(null), 1000);
                      } else {
                        singleTapTimeout.current = setTimeout(() => {
                          onTogglePlayPause(idx);
                          singleTapTimeout.current = null;
                        }, 300);
                      }

                      lastTapTime.current = now;
                      lastTapX.current = x;
                      lastTapY.current = y;
                    }}
                    autoPlay={idx === activeIndex}
                    onLoadedMetadata={() => {
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
                            video.src = normalizeMediaUrl(src);
                          }
                        }).catch(() => {
                          video.src = normalizeMediaUrl(src);
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
                <div className="ef-overlay">
                  <button
                    className="ef-back"
                    onClick={handleBackClick}
                    aria-label="Back"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M19 12H5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12 19L5 12L12 5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    className="ef-mute"
                    onClick={onToggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M23 9L17 15" />
                        <path d="M17 9L23 15" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </svg>
                    )}
                  </button>
                  {Number(lesson?.type) !== 3 && isVideoPaused && idx === activeIndex && !showEndPopup && (
                    <div className="ef-pause-controls">
                      <button className="ef-control-btn ef-play-btn" onClick={() => onTogglePlayPause(idx)} aria-label="Play">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M8 5V19L19 12L8 5Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button className="ef-control-btn ef-replay-btn" onClick={() => onReplay(idx)} aria-label="Replay">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M1 4V10H7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M23 20V14H17" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {Number(lesson?.type) !== 3 && showEndPopup && idx === activeIndex && Number(lesson?.timer_on_end ?? 1) !== 0 && (
                    <div className="ef-end-popup">
                      <div className="ef-end-popup-content">
                        <div className="ef-end-timer">
                          {t('nextVideoIn')} {endPopupTimer}{t('seconds')}
                        </div>
                        <div className="ef-end-buttons">
                          <button className="ef-end-btn ef-end-replay-btn" onClick={() => onReplay(idx)} aria-label={t('replay')}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M1 4V10H7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M23 20V14H17" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14L18.36 18.36A9 9 0 0 1 3.51 15" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {t('replay')}
                          </button>
                          <button
                            className="ef-end-btn ef-end-next-btn"
                            onClick={() => {
                              console.log('[HEJVI DEBUG] Next button clicked manually');
                              setShowEndPopup(false);
                              setEndPopupTimer(3);
                              onNextVideo();
                            }}
                            aria-label={t('next')}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                              <path d="M5 4V20L16 12L5 4Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M19 5V19" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {t('next')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {Number(lesson?.type) !== 3 && showSkipIndicator && idx === activeIndex && (
                    <div className={`ef-skip-indicator ef-skip-${showSkipIndicator}`}>
                      <div className="ef-skip-icon">
                        {showSkipIndicator === 'forward' ? (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path d="M13 5L22 12L13 19V5Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 5L11 12L2 19V5Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <path d="M11 19L2 12L11 5V19Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M22 19L13 12L22 5V19Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="ef-bottom">
                    <div className="ef-title">{lesson.name}</div>
                    {Number(lesson?.type) !== 3 && (
                      <>
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
          );
        })}
      </div>
    </GlobalLayout>
  );
};

export default ElementFeed;
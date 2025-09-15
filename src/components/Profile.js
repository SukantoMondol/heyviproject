import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import GlobalLayout from './GlobalLayout';
import LanguageSwitcher from './LanguageSwitcher';
import './Profile.css';
import defaultUserIcon from '../assets/icons/users.svg';
import defaultAchievementIcon from '../assets/icons/trophy.svg';

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout, getUser, contactSupport } = useAuth();
  const { t, languageName, getAvailableLanguages } = useLanguage();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeNavItem, setActiveNavItem] = useState('Profile');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    message: ''
  });

  useEffect(() => {
    fetchProfileData(true); // Force refresh on initial load
  }, []);

  useEffect(() => {
    if (profileData) {
      setContactForm(prev => ({
        ...prev,
        name: profileData.name || '',
        email: '' // Email not provided in the API response, keep empty
      }));
    }
  }, [profileData]);

  const fetchProfileData = async (forceRefresh = false) => {
    // Don't show loading if we already have data and this isn't a force refresh
    if (!forceRefresh && profileData) {
      return;
    }
    
    try {
      setLoading(true);
  
      const data = await getUser();
      

      // The API may return a wrapper: { status, data: {..user..}, achievements: [...], userlevel: {...} }
      const userObj = (data && data.data) ? data.data : data;

      // Validate API data shape (expects object)
      if (!userObj || typeof userObj !== 'object') {
        throw new Error('No data received from API');
      }

      // Extract optional sections from wrapper
      const apiAchievements = Array.isArray(data?.achievements) ? data.achievements : [];
      const apiUserLevel = data?.userlevel?.name || null;

      // Helper to extract year from date string
      const getYearFromDateString = (value) => {
        if (!value) return new Date().getFullYear();
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
      };

      // Transform the API data to match our component structure
      const transformedData = {
        id: userObj.hash_id || userObj.id || 'N/A',
        name: userObj.name || 'Unknown User',
        status: userObj.status || 0,
        avatar: userObj.avatar || '',
        groups: Array.isArray(userObj.groups) ? userObj.groups : (userObj.group ? [{ id: userObj.group, name: String(userObj.group) }] : []),
        clients: Array.isArray(userObj.clients) ? userObj.clients : (userObj.client_id ? [{ id: userObj.client_id, name: String(userObj.client_id), status: 1 }] : []),
        progress: Array.isArray(userObj.progress) ? userObj.progress : [],
        // Calculate stats from progress data
        stats: calculateStats(userObj.progress || []),
        // Determine level: prefer API userlevel name if available, otherwise infer
        level: apiUserLevel || determineUserLevel(userObj.groups || [], userObj.progress || []),
        // Derive joined year from created or last_update
        joinedYear: getYearFromDateString(userObj.created || userObj.last_update),
        // Prefer API-provided achievements; map to UI-friendly shape, fallback to generated
        achievements: (apiAchievements.length > 0)
          ? apiAchievements.map(a => ({ name: a.name || 'Achievement', avatar: a.avatar || '' }))
          : generateAchievements(userObj.progress || [])
      };
      
  
      setProfileData(transformedData);
    } catch (error) {
      console.error('Failed to fetch profile data:', error);
      // Fallback data with more realistic values
      setProfileData({
        name: 'Elias Becker',
        id: 'ZZ72300',
        level: 'Beginner',
        joinedYear: '2024',
        avatar: '',
        progress: [
          { element_id: 101, progress: 100, element_type: 0, last_update: new Date().toISOString() },
          { element_id: 102, progress: 75, element_type: 0, last_update: new Date().toISOString() },
          { element_id: 103, progress: 50, element_type: 0, last_update: new Date().toISOString() }
        ],
        groups: [{ id: 1, name: 'Beginners' }],
        clients: [{ id: 1, name: 'Demo Client' }],
        stats: {
          totalCourses: 12,
          completed: 7,
          inProgress: 5
        },
        achievements: [
          { name: 'First Steps', avatar: '' },
          { name: 'Learner', avatar: '' }
        ],
        status: 1
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (progressData) => {
    const completed = progressData.filter(p => p.progress === 100).length;
    const inProgress = progressData.filter(p => p.progress > 0 && p.progress < 100).length;
    const totalCourses = progressData.length;
    
    return {
      totalCourses,
      completed,
      inProgress
    };
  };

  const determineUserLevel = (groups, progressData) => {
    // Check if user has a specific group that indicates level
    if (groups.length > 0) {
      const groupName = groups[0].name.toLowerCase();
      if (groupName.includes('advanced')) return 'Advanced';
      if (groupName.includes('intermediate')) return 'Intermediate';
      if (groupName.includes('beginner')) return 'Beginner';
    }
    
    // Fallback to progress-based level determination
    const completedCount = progressData.filter(p => p.progress === 100).length;
    if (completedCount >= 10) return 'Advanced';
    if (completedCount >= 5) return 'Intermediate';
    return 'Beginner';
  };

  const generateAchievements = (progressData) => {
    const achievements = [];
    const completedCount = progressData.filter(p => p.progress === 100).length;
    
    if (completedCount >= 1) {
      achievements.push({ name: 'First Steps', icon: '🎯' });
    }
    if (completedCount >= 5) {
      achievements.push({ name: 'Learner', icon: '📚' });
    }
    if (completedCount >= 10) {
      achievements.push({ name: 'Dedicated', icon: '🏆' });
    }
    if (progressData.some(p => p.progress === 100)) {
      achievements.push({ name: 'Finisher', icon: '✅' });
    }
    
    return achievements;
  };

  const calculateOverallProgress = (progressData) => {
    if (progressData.length === 0) return 0;
    const totalProgress = progressData.reduce((sum, p) => sum + p.progress, 0);
    return Math.round(totalProgress / progressData.length);
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await contactSupport(contactForm);
      if (response?.ok || response?.status === 'success') {
        alert(t('messageSent'));
        setContactForm({ name: '', email: '', message: '' });
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert(t('messageSendError'));
    }
  };

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return (
      <div className="profile-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <GlobalLayout title={t('myProfile')}>
      {/* User Info Section */}
      <div className="user-info-section">
        <img
          className="user-avatar"
          src={profileData?.avatar || defaultUserIcon}
          onError={(e) => {
            if (e.currentTarget.src !== window.location.origin + defaultUserIcon) {
              e.currentTarget.src = defaultUserIcon;
            }
          }}
          alt={profileData?.name || 'User avatar'}
        />
        <div className="user-details">
          <h2 className="user-name">{profileData?.name || 'Loading...'}</h2>
          <p className="user-id">ID: {profileData?.id || 'Loading...'}</p>
          {profileData?.groups && profileData.groups.length > 0 && (
            <p className="user-group">{t('group')}: {profileData.groups[0].name}</p>
          )}
          {profileData?.clients && profileData.clients.length > 0 && (
            <p className="user-client">{t('client')}: {profileData.clients[0].name}</p>
          )}
        </div>
        <div className="user-badges">
          <span className="badge beginner-badge">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 0L8.5 4.5L12 5L9 8L10 12L7 10L4 12L5 8L2 5L5.5 4.5L7 0Z" fill="currentColor"/>
            </svg>
            {t(profileData?.level?.toLowerCase() || 'beginner')}
          </span>
          <span className="badge joined-badge">
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
              <path d="M6 0L7.5 3.5L11 4L8 7L9 10.5L6 8.5L3 10.5L4 7L1 4L4.5 3.5L6 0Z" fill="currentColor"/>
            </svg>
            {t('joined')} {profileData?.joinedYear || '2024'}
          </span>
          {profileData?.status === 1 && (
            <span className="badge status-badge active">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="6" fill="#10B981"/>
              </svg>
              {t('active')}
            </span>
          )}
        </div>
      </div>

      {/* Progress Section */}
      <div className="progress-section">
        <div className="progress-header">
          <h3>{t('myProgress')}</h3>
          <div className="progress-percentage">
            <svg className="progress-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 17L9 11L13 15L21 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {profileData ? calculateOverallProgress(profileData.progress) : 0}%
          </div>
        </div>
        <div className="progress-bar-container">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${profileData ? calculateOverallProgress(profileData.progress) : 0}%` }}
            ></div>
          </div>
        </div>
        <div className="stats-container">
          <div className="stat-item">
            <span className="stat-number courses">{profileData?.stats?.totalCourses || 0}</span>
            <span className="stat-label">{t('courses')}</span>
          </div>
          <div className="stat-item">
            <span className="stat-number completed">{profileData?.stats?.completed || 0}</span>
            <span className="stat-label">{t('completed')}</span>
          </div>
          <div className="stat-item">
            <span className="stat-number in-progress">{profileData?.stats?.inProgress || 0}</span>
            <span className="stat-label">{t('inProgress')}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <button className="action-button" onClick={() => navigate('/favourites')}>
          <div className="action-icon">
            <svg width="16" height="15" viewBox="0 0 16 15" fill="none">
              <path d="M8 0L10 5L15 5L11.5 8L13 13L8 10.5L3 13L4.5 8L1 5L6 5L8 0Z" fill="white"/>
            </svg>
          </div>
          <span>{t('favorites')}</span>
        </button>
        <button className="action-button" onClick={() => navigate('/my-courses')}>
          <div className="action-icon">
            <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
              <path d="M1 1H10V11H1V1ZM2 2V10H9V2H2ZM3 4H8V5H3V4ZM3 6H8V7H3V6Z" fill="white"/>
            </svg>
          </div>
          <span>{t('myCourses')}</span>
        </button>
        <button className="action-button" onClick={() => navigate('/challenges')}>
          <div className="action-icon">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 0L9 4L13 4.5L10 7.5L11 12L7.5 10L4 12L5 7.5L2 4.5L6 4L7.5 0Z" fill="white"/>
            </svg>
          </div>
          <span>{t('challenges')}</span>
        </button>
      </div>

      {/* Achievements Section */}
      <div className="achievements-section">
        <div className="achievements-header">
          <h3>{t('achievements')}</h3>
          <button className="see-all-button" style={{ visibility: 'hidden' }}>See All</button>
        </div>
        <div className="achievements-grid">
          {profileData?.achievements && profileData.achievements.length > 0 ? (
            profileData.achievements.slice(0, 4).map((achievement, index) => (
              <div key={index} className="achievement-item">
                <div className="achievement-icon">
                  <img
                    src={achievement.avatar || defaultAchievementIcon}
                    onError={(e) => {
                      if (e.currentTarget.src !== window.location.origin + defaultAchievementIcon) {
                        e.currentTarget.src = defaultAchievementIcon;
                      }
                    }}
                    alt={achievement.name || 'Achievement'}
                  />
                </div>
                <span className="achievement-name">{achievement.name}</span>
              </div>
            ))
          ) : (
            // Fallback to default achievements if none from API
            <>
              <div className="achievement-item">
                <div className="achievement-icon">
                  <img src={defaultAchievementIcon} alt={t('topLearner')} />
                </div>
                <span className="achievement-name">{t('topLearner')}</span>
              </div>
              <div className="achievement-item">
                <div className="achievement-icon">
                  <img src={defaultAchievementIcon} alt={t('safetyStar')} />
                </div>
                <span className="achievement-name">{t('safetyStar')}</span>
              </div>
              <div className="achievement-item">
                <div className="achievement-icon">
                  <img src={defaultAchievementIcon} alt="Helper" />
                </div>
                <span className="achievement-name">Helper</span>
              </div>
              <div className="achievement-item">
                <div className="achievement-icon">
                  <img src={defaultAchievementIcon} alt="Tool Pro" />
                </div>
                <span className="achievement-name">Tool Pro</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contact Support Section */}
      <div className="contact-section" style={{ display: 'none' }}>
        <div className="contact-header">
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <path d="M8.5 0C3.81 0 0 3.81 0 8.5S3.81 17 8.5 17S17 13.19 17 8.5S13.19 0 8.5 0Z" fill="currentColor"/>
          </svg>
          <h3>{t('contactSupport')}</h3>
        </div>
        <form className="contact-form" onSubmit={handleContactSubmit}>
          <div className="form-group">
            <input
              type="text"
              className="form-input"
              placeholder={t('yourName')}
              value={contactForm.name}
              onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <input
              type="email"
              className="form-input"
              placeholder={t('emailAddress')}
              value={contactForm.email}
              onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <textarea
              className="form-textarea"
              placeholder={t('describeIssue')}
              value={contactForm.message}
              onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
              required
            />
          </div>
          <button type="submit" className="send-button">
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path d="M16 0L0 8L4 10L6 16L16 0Z" fill="white"/>
            </svg>
            {t('sendMessage')}
          </button>
        </form>
      </div>

      {/* Settings Section */}
      <div className="settings-section">
        <div className="language-setting">
          <div className="setting-header">
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path d="M8.5 0C3.81 0 0 3.81 0 8.5S3.81 17 8.5 17S17 13.19 17 8.5S13.19 0 8.5 0Z" fill="currentColor"/>
            </svg>
            <h3>{t('language')}</h3>
          </div>
          <LanguageSwitcher />
        </div>

        <div className="settings-menu">
          <button className="setting-item" onClick={() => navigate('/error')} style={{ display: 'none' }}>
            <svg width="17" height="16" viewBox="0 0 17 16" fill="none">
              <path d="M8.5 0L10.5 2L8.5 4L6.5 2L8.5 0ZM0 8.5L2 6.5L4 8.5L2 10.5L0 8.5ZM13 8.5L15 6.5L17 8.5L15 10.5L13 8.5ZM8.5 13L10.5 15L8.5 17L6.5 15L8.5 13Z" fill="currentColor"/>
            </svg>
            {t('settings')}
          </button>
          <button className="setting-item" onClick={() => navigate('/error')} style={{ display: 'none' }}>
            <svg width="17" height="16" viewBox="0 0 17 16" fill="none">
              <path d="M8.5 0L10.5 2L8.5 4L6.5 2L8.5 0ZM0 8.5L2 6.5L4 8.5L2 10.5L0 8.5ZM13 8.5L15 6.5L17 8.5L15 10.5L13 8.5ZM8.5 13L10.5 15L8.5 17L6.5 15L8.5 13Z" fill="currentColor"/>
            </svg>
            {t('privacy')}
          </button>
          <button className="setting-item" onClick={() => navigate('/error')} style={{ display: 'none' }}>
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path d="M8.5 0C3.81 0 0 3.81 0 8.5S3.81 17 8.5 17S17 13.19 17 8.5S13.19 0 8.5 0Z" fill="currentColor"/>
            </svg>
            {t('help')}
          </button>
          <button className="setting-item logout-item" onClick={handleLogout}>
            <svg width="17" height="15" viewBox="0 0 17 15" fill="none">
              <path d="M6 14H2C1.45 14 1 13.55 1 13V2C1 1.45 1.45 1 2 1H6V3H3V12H6V14ZM11.5 10L10.09 8.59L12.17 6.5H6V4.5H12.17L10.09 2.41L11.5 1L16 5.5L11.5 10Z" fill="currentColor"/>
            </svg>
            {t('logout')}
          </button>
        </div>
      </div>

    </GlobalLayout>
  );
};

export default Profile;
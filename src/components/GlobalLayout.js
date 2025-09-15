import React from 'react';
import GlobalAppBar from './GlobalAppBar';
import BottomNavigation from './BottomNavigation';
import './GlobalLayout.css';

const GlobalLayout = ({ 
  children, 
  title, 
  showBackButton = false, 
  onBackClick,
  backTo,
  showNavbar = true,
  showCategoryFilters = false,
  activeCategory = 'Must-See',
  onCategoryChange,
  showSearch = false,
  onSearchToggle,
  onSearchQuery,
  onSearchSubmit,
  searchQuery = '',
  isSearchActive = false
}) => {
  return (
    <div className="global-layout-container">
      <GlobalAppBar 
        title={title} 
        showBackButton={showBackButton} 
        onBackClick={onBackClick}
        backTo={backTo}
        showSearch={showSearch}
        onSearchToggle={onSearchToggle}
        onSearchQuery={onSearchQuery}
        onSearchSubmit={onSearchSubmit}
        searchQuery={searchQuery}
        isSearchActive={isSearchActive}
      />
      
      {showCategoryFilters && (
        <div className="category-filters">
          {[
            { name: 'Must-See', icon: '🔥', color: '#EA580C', bgColor: '#FFEDD5', borderColor: '#FED7AA' },
            { name: 'Safety', icon: '🛡️', color: '#2563EB', bgColor: '#DBEAFE', borderColor: '#BFDBFE' },
            { name: 'Tools', icon: '🔧', color: '#16A34A', bgColor: '#DCFCE7', borderColor: '#BBF7D0' },
            { name: 'Law', icon: '⚖️', color: '#4B5563', bgColor: '#F3F4F6', borderColor: '#E5E7EB' }
          ].map((category) => (
            <button
              key={category.name}
              className={`category-button ${activeCategory === category.name ? 'active' : ''}`}
              onClick={() => onCategoryChange && onCategoryChange(category.name)}
              style={{
                backgroundColor: activeCategory === category.name ? category.bgColor : '#F3F4F6',
                borderColor: activeCategory === category.name ? category.borderColor : '#E5E7EB',
                color: activeCategory === category.name ? category.color : '#4B5563'
              }}
            >
              <span className="category-icon">{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>
      )}
      
      <div className="content-container">
        {children}
      </div>
      
      {showNavbar && <BottomNavigation />}
    </div>
  );
};

export default GlobalLayout;

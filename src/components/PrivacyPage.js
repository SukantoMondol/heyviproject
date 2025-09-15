import React from 'react';
import GlobalLayout from './GlobalLayout';

const PrivacyPage = ({ content = 'Privacy content will be supplied.' }) => {
  return (
    <GlobalLayout title="Privacy">
      <div style={{ padding: '16px' }}>
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 16 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Privacy</h2>
          <div style={{ color: '#333', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{content}</div>
        </div>
      </div>
    </GlobalLayout>
  );
};

export default PrivacyPage;



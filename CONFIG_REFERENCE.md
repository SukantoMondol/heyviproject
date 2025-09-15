# Configuration Reference Guide

## 📁 Main Configuration File

**Location**: `src/config.js`

## 🔧 Configuration Options

### API Configuration
```javascript
const appConfig = {
  // Your API server base URL
  apiBaseUrl: 'https://your-api-domain.com/api',
  
  // Your web application domain (for QR code validation)
  webAppBaseUrl: 'your-domain.com'
};
```

### Environment Examples

#### Development
```javascript
const appConfig = {
  apiBaseUrl: 'http://localhost:8000/api',
  webAppBaseUrl: 'localhost:3000'
};
```

#### Production
```javascript
const appConfig = {
  apiBaseUrl: 'https://api.hejvi.com/api',
  webAppBaseUrl: 'hejvi.com'
};
```

## 🚨 Critical Configuration Steps

### 1. Update API Base URL
**File**: `src/config.js`
**Line**: Find `apiBaseUrl` and replace with your API server URL

```javascript
// BEFORE
apiBaseUrl: 'https://your-api-domain.com/api',

// AFTER (example)
apiBaseUrl: 'https://api.yourcompany.com/api',
```

### 2. Update Web App Base URL
**File**: `src/config.js`
**Line**: Find `webAppBaseUrl` and replace with your domain

```javascript
// BEFORE
webAppBaseUrl: 'your-domain.com',

// AFTER (example)
webAppBaseUrl: 'yourcompany.com',
```

## 🔍 Configuration Validation

### Test Your Configuration
1. Start the app: `npm start`
2. Check browser console for API errors
3. Test QR scanner with your domain URLs
4. Verify voice search functionality

### Common Configuration Issues

| Issue | Solution |
|-------|----------|
| API calls failing | Check `apiBaseUrl` format and server availability |
| QR scanner blocking URLs | Update `webAppBaseUrl` to match your domain |
| CORS errors | Configure your API server to allow your domain |
| Authentication issues | Verify API endpoints and token handling |


*This configuration reference is part of the Hejvi Mobile App project documentation.*

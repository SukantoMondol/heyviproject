const isProduction = process.env.NODE_ENV === 'production';

export const appConfig = {

  baseUrl: 'https://www.killspam.de/hejvi/',

  // Base URL for the web app (used for QR code validation)
  webAppBaseUrl: 'killspam.de',

  apiBaseUrl: isProduction ? 'https://app.hejvi.de/api' : '/api',

  pagination: {
    feedPerPage: 5,
    defaultPerPage: 5,
    maxPerPage: 50
  }
};

export default appConfig;



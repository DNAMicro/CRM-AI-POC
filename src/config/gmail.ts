// Google OAuth2 credentials for Gmail integration.
// Get these from https://console.cloud.google.com/apis/credentials
// Create an OAuth 2.0 Client ID (Web application type)
// Add http://localhost:3000/api/auth/gmail/callback as an authorized redirect URI

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

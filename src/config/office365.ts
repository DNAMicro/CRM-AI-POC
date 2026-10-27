// Microsoft 365 OAuth2 credentials for Outlook integration.
// Get these from https://portal.azure.com -> App Registrations -> New Registration
// Platform: Web, Redirect URI: http://localhost:5555/api/auth/office365/callback
// API Permissions: Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Contacts.Read, User.Read, offline_access

export const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
export const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
export const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID ?? "common";

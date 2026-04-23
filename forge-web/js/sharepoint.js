'use strict';

// ProjectCoachAI SharePoint Integration
// Uses Microsoft Graph API with MSAL (browser-based OAuth2)
// No backend needed - tokens stored in sessionStorage

const SHAREPOINT = (function() {
  const CLIENT_ID = ''; // User provides their Azure App Registration Client ID
  const SCOPES = ['Files.ReadWrite', 'Sites.ReadWrite.All', 'offline_access'];
  const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
  
  let accessToken = sessionStorage.getItem('sp_token') || null;
  let tokenExpiry = parseInt(sessionStorage.getItem('sp_token_expiry') || '0');
  
  function isConnected() {
    return !!accessToken && Date.now() < tokenExpiry;
  }
  
  // Connect via Microsoft OAuth popup
  async function connect(clientId) {
    const cid = clientId || sessionStorage.getItem('sp_client_id');
    if (!cid) throw new Error('Azure Client ID required');
    sessionStorage.setItem('sp_client_id', cid);
    
    const redirectUri = encodeURIComponent(window.location.origin + '/sharepoint-callback.html');
    const scope = encodeURIComponent(SCOPES.join(' '));
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem('sp_state', state);
    
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` +
      `?client_id=${cid}&response_type=token&redirect_uri=${redirectUri}` +
      `&scope=${scope}&state=${state}&response_mode=fragment`;
    
    const popup = window.open(authUrl, 'sp_auth', 'width=500,height=600,left=200,top=100');
    
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(timer);
            if (isConnected()) resolve(true);
            else reject(new Error('Authentication cancelled'));
          }
        } catch(_) {}
      }, 500);
      
      window.addEventListener('message', function handler(e) {
        if (e.data?.type === 'sp_auth_success') {
          accessToken = e.data.token;
          tokenExpiry = Date.now() + (e.data.expiresIn * 1000);
          sessionStorage.setItem('sp_token', accessToken);
          sessionStorage.setItem('sp_token_expiry', tokenExpiry.toString());
          clearInterval(timer);
          window.removeEventListener('message', handler);
          popup.close();
          resolve(true);
        }
      });
    });
  }
  
  function disconnect() {
    accessToken = null;
    sessionStorage.removeItem('sp_token');
    sessionStorage.removeItem('sp_token_expiry');
    sessionStorage.removeItem('sp_client_id');
  }
  
  async function graphRequest(path, options = {}) {
    if (!isConnected()) throw new Error('Not connected to SharePoint');
    const res = await fetch(GRAPH_URL + path, {
      ...options,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Graph API error ' + res.status);
    }
    return options.raw ? res : res.json();
  }
  
  // Get user's SharePoint sites
  async function getSites() {
    const data = await graphRequest('/sites?search=*');
    return data.value || [];
  }
  
  // Get drives (document libraries) for a site
  async function getDrives(siteId) {
    const data = await graphRequest(`/sites/${siteId}/drives`);
    return data.value || [];
  }
  
  // Get items in a drive folder
  async function getItems(driveId, folderId = 'root') {
    const data = await graphRequest(`/drives/${driveId}/items/${folderId}/children`);
    return data.value || [];
  }
  
  // Export content as Word doc to SharePoint
  async function exportToSharePoint(siteId, driveId, folderId, fileName, htmlContent) {
    // Convert HTML to docx-compatible format
    const docHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;margin:40px;}
      h1,h2{color:#ff6b35;}strong{font-weight:bold;}</style>
      </head><body>${htmlContent}</body></html>`;
    
    const blob = new Blob([docHtml], { type: 'application/msword' });
    const parentPath = folderId === 'root' ? 'root' : `items/${folderId}`;
    
    const uploadRes = await graphRequest(
      `/drives/${driveId}/${parentPath}:/${fileName}.doc:/content`,
      { method: 'PUT', body: blob, headers: { 'Content-Type': 'application/msword' } }
    );
    return uploadRes;
  }
  
  // Download Excel file from SharePoint
  async function downloadFile(driveId, itemId) {
    const res = await graphRequest(`/drives/${driveId}/items/${itemId}/content`, { raw: true });
    return res.blob();
  }
  
  // Generate share link for a file
  async function createShareLink(driveId, itemId) {
    const data = await graphRequest(`/drives/${driveId}/items/${itemId}/createLink`, {
      method: 'POST',
      body: JSON.stringify({ type: 'view', scope: 'organization' })
    });
    return data.link?.webUrl || null;
  }

  return { isConnected, connect, disconnect, getSites, getDrives, getItems, exportToSharePoint, downloadFile, createShareLink };
})();

window.SHAREPOINT = SHAREPOINT;

// Preload script for BrowserView panes
// Bridges communication between injected capture script and Electron main process

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to injected scripts
contextBridge.exposeInMainWorld('electronAPI', {
    // Send captured response to main process
    sendCapturedResponse: (data) => {
        ipcRenderer.send('captured-ai-response', data);
    }
});

// Listen for postMessage from injected capture script
window.addEventListener('message', (event) => {
    // Only accept messages from same origin (security)
    if (event.source !== window) {
        return;
    }
    
    // Handle captured AI response
    if (event.data && event.data.type === 'AI_RESPONSE_CAPTURED') {
        const captureData = event.data.data;
        const _iv2_len = typeof captureData?.response === 'string' ? captureData.response.length : -1;
        console.log(`[INCOMING_V2_DEBUG] pane_extract provider=${captureData?.aiTool ?? 'unknown'} len=${_iv2_len} url=${location.href}`);
        // Forward to main process via IPC
        ipcRenderer.send('captured-ai-response', captureData);
        
        console.log('[Preload] Forwarded captured response to main process:', captureData.aiTool);
    }
});

console.log('[Preload] Pane preload script loaded - ready to capture responses');

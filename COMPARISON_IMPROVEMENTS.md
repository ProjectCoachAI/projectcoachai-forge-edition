# Comparison View Improvements - Minimal Changes

## 🎯 Goal
Make the comparison view auto-populate from workspace responses when user clicks "Compare" - seamless, no manual paste.

## ✅ What's Working (Keep This)
- Share Prompt feature works perfectly
- Side-by-side pane layout is clean and friendly
- Compare button opens comparison window
- Current UI design is solid

## 🔧 The Minimal Fix

### Change 1: Extract Responses from BrowserViews (User-Initiated)
When user clicks "Compare", extract text from active panes and send to comparison view.

**File: `main.js`** - Update `open-visual-comparison` handler:

```javascript
ipcMain.handle('open-visual-comparison', async (event, options) => {
    try {
        console.log('📊 [IPC] Opening visual comparison...');
        
        // NEW: Extract responses from active panes (user-initiated action)
        const paneResponses = await Promise.all(
            activePanes.map(async (pane, index) => {
                try {
                    // Extract visible text from BrowserView
                    const responseText = await extractResponseFromPane(pane);
                    
                    return {
                        tool: pane.tool.name,
                        icon: pane.tool.icon,
                        index: pane.index,
                        response: responseText || '', // Empty if extraction fails
                        hasResponse: !!responseText
                    };
                } catch (error) {
                    console.error(`Error extracting from pane ${index}:`, error);
                    return {
                        tool: pane.tool.name,
                        icon: pane.tool.icon,
                        index: pane.index,
                        response: '',
                        hasResponse: false
                    };
                }
            })
        );
        
        const comparisonWindow = new BrowserWindow({
            width: 1600,
            height: 900,
            title: 'Visual Comparison - ProjectCoachAI',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        comparisonWindow.loadFile('visual-comparison.html');
        
        await new Promise(resolve => {
            comparisonWindow.webContents.once('did-finish-load', resolve);
        });
        
        // Send pane info WITH responses
        comparisonWindow.webContents.send('setup-comparison', {
            panes: paneResponses,
            mode: options.mode || 'visual',
            timestamp: new Date().toISOString(),
            autoPopulated: true // Flag to indicate responses are pre-filled
        });
        
        comparisonWindows.set(comparisonWindow.id, comparisonWindow);
        
        comparisonWindow.on('closed', () => {
            comparisonWindows.delete(comparisonWindow.id);
        });
        
        return {
            success: true,
            comparisonId: `visual_${Date.now()}`,
            windowId: comparisonWindow.id
        };
    } catch (error) {
        console.error('❌ Error opening visual comparison:', error);
        return { success: false, error: error.message };
    }
});

// NEW: Helper function to extract text from BrowserView
async function extractResponseFromPane(pane) {
    try {
        const webContents = pane.view.webContents;
        
        if (!webContents || webContents.isDestroyed()) {
            return null;
        }
        
        // Execute JavaScript in the BrowserView to extract visible text
        const extractedText = await webContents.executeJavaScript(`
            (function() {
                // Try multiple selectors to find response content
                const selectors = [
                    '[class*="message"]',
                    '[class*="response"]',
                    '[class*="content"]',
                    'main',
                    'article',
                    '[role="main"]'
                ];
                
                let text = '';
                
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        // Get text from the last few elements (most recent responses)
                        const recentElements = Array.from(elements).slice(-3);
                        text = recentElements.map(el => el.innerText || el.textContent).join('\\n\\n');
                        if (text.trim().length > 50) break; // Found substantial content
                    }
                }
                
                // Fallback: get all visible text
                if (!text || text.length < 50) {
                    text = document.body.innerText || document.body.textContent || '';
                }
                
                // Clean up: remove navigation, buttons, etc.
                return text
                    .replace(/\\s+/g, ' ')
                    .replace(/\\n{3,}/g, '\\n\\n')
                    .trim()
                    .substring(0, 10000); // Limit length
            })()
        `);
        
        return extractedText || null;
    } catch (error) {
        console.error('Error extracting response:', error);
        return null;
    }
}
```

### Change 2: Auto-Populate Comparison View
Update `visual-comparison.html` to auto-fill panes when responses are provided.

**File: `visual-comparison.html`** - Update `setupPanes` method:

```javascript
setupPanes(panes) {
    const container = document.getElementById('comparisonContainer');
    container.innerHTML = '';
    
    panes.forEach((pane, index) => {
        const toolName = pane.tool || pane.name || 'AI Tool';
        const toolIcon = pane.icon || '🤖';
        const hasResponse = pane.hasResponse || !!pane.response;
        const responseText = pane.response || '';
        
        const paneContainer = document.createElement('div');
        paneContainer.className = 'pane-container';
        
        // If response exists, show it; otherwise show paste instructions
        const contentHTML = hasResponse 
            ? `<div class="pane-content auto-filled" data-pane-index="${index}">
                <div style="padding: 15px; background: rgba(16, 185, 129, 0.1); border-radius: 6px; margin-bottom: 15px; font-size: 12px; color: #10b981;">
                    ✅ Auto-filled from workspace
                </div>
                <div class="response-content" style="white-space: pre-wrap; line-height: 1.6;">
                    ${this.escapeHtml(responseText)}
                </div>
              </div>`
            : `<div class="pane-content" data-pane-index="${index}">
                <div style="margin-bottom: 15px;">
                    <div class="step-indicator">
                        <span class="step-number">1</span>
                        <span>Go to your workspace ${toolName} pane</span>
                    </div>
                    <div class="step-indicator">
                        <span class="step-number">2</span>
                        <span>Copy the response text (Ctrl/Cmd+C)</span>
                    </div>
                    <div class="step-indicator">
                        <span class="step-number">3</span>
                        <span>Click below and paste (Ctrl/Cmd+V)</span>
                    </div>
                </div>
                <div class="response-editable" contenteditable="true" data-pane-index="${index}" style="min-height: 300px; padding: 15px; background: rgba(255,255,255,0.05); border: 2px dashed var(--border); border-radius: 6px; white-space: pre-wrap; line-height: 1.6; outline: none;">
                    <div style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 40px 20px;">
                        <div style="font-size: 48px; margin-bottom: 10px;">📋</div>
                        <div style="font-size: 14px; font-weight: 500; margin-bottom: 5px;">Paste ${toolName} response here</div>
                        <div style="font-size: 12px;">Click this area and paste (Ctrl/Cmd+V)</div>
                    </div>
                </div>
              </div>`;
        
        paneContainer.innerHTML = `
            <div class="pane-header">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">${toolIcon}</span>
                    <div>
                        <strong>${toolName}</strong>
                    </div>
                </div>
                <div class="score-badge">Score: --</div>
            </div>
            ${contentHTML}
        `;
        
        container.appendChild(paneContainer);
        
        this.panes.push({
            element: paneContainer,
            content: responseText,
            tool: toolName,
            icon: toolIcon
        });
    });
    
    // Auto-highlight if all panes have responses
    const allHaveResponses = panes.every(p => p.hasResponse || p.response);
    if (allHaveResponses && panes.length >= 2) {
        setTimeout(() => {
            this.toggleHighlight(); // Auto-trigger highlighting
        }, 1000);
    }
    
    // Initialize ranking table
    this.initializeRankingTable(panes);
}
```

### Change 3: Update Welcome Banner
Show different message if responses are auto-filled.

**File: `visual-comparison.html`** - Update welcome banner logic:

```javascript
// In init() method, check if auto-populated
async init() {
    if (window.electronAPI && window.electronAPI.on) {
        window.electronAPI.on('setup-comparison', (data) => {
            console.log('📊 [VisualComparison] Received setup data:', data);
            
            // Update welcome banner if auto-populated
            if (data.autoPopulated) {
                const banner = document.getElementById('welcomeBanner');
                if (banner) {
                    banner.querySelector('.welcome-title').textContent = '✅ Responses Auto-Loaded from Workspace';
                    banner.querySelector('.welcome-text').innerHTML = `
                        <strong>Great!</strong> Your AI responses have been automatically loaded from your workspace panes.<br>
                        <strong>Next:</strong> Review the highlighted differences below, or use the Ranking Panel to score each response.
                    `;
                }
            }
            
            this.setupPanes(data.panes || []);
        });
    }
}
```

## 🎯 Result

**Before:**
1. User clicks "Share Prompt" → Responses appear in workspace
2. User clicks "Compare" → Empty comparison window opens
3. User manually copies from each pane
4. User manually pastes into comparison
5. User clicks "Highlight Diffs"

**After:**
1. User clicks "Share Prompt" → Responses appear in workspace
2. User clicks "Compare" → Comparison window opens with responses auto-filled
3. Differences are automatically highlighted
4. User can immediately rank and synthesize

## ✅ Benefits

- **Seamless**: No manual copy-paste
- **Fast**: Instant comparison
- **Smart**: Auto-highlights when all responses loaded
- **Flexible**: Still allows manual paste if extraction fails
- **Non-breaking**: Falls back gracefully if extraction doesn't work

## 🔒 Compliance Note

This is **user-initiated** extraction (user clicks "Compare"), not automatic monitoring. The user explicitly requests the comparison, so extracting responses at that moment is compliant with user intent.

## 📝 Testing Checklist

- [ ] Share Prompt works (already working)
- [ ] Click Compare after Share Prompt
- [ ] Verify responses auto-populate in comparison view
- [ ] Verify auto-highlighting triggers
- [ ] Test with 2 panes
- [ ] Test with 4 panes
- [ ] Test fallback if extraction fails (shows paste instructions)
- [ ] Verify ranking panel still works
- [ ] Verify synthesis still works












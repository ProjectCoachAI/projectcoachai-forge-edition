// main.js - FINAL SIMPLIFIED VERSION
// ProjectCoachAI - Swiss Privacy Edition
// Xencore Global GmbH
const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Import API proxy modules
const AIProxyClient = require('./api-proxy-client.js');
const { getAIConfig, getAvailableProviders } = require('./ai-config.js');

// Import Stripe & Pricing modules
const { PRICING_TIERS, getTier, getUserTier, hasFeature, canUseAI, getMaxPanes } = require('./stripe-config.js');
const StripeClient = require('./stripe-client.js');
const SubscriptionTracker = require('./subscription-tracker.js');

let mainWindow;
let activePanes = [];
let apiProxyClient = null; // API proxy client instance
let useAPIMode = false; // Toggle between BrowserView and API mode
let workspaceMode = 'compare'; // 'quick' (single-pane) or 'compare' (multi-pane)

// Store workspace state for comparison
let workspaceState = {
    lastPrompt: null,
    lastPromptTimestamp: null,
    storedResponses: {}, // Store responses when first received to avoid re-fetching
    responseStates: new Map() // Track response states: 'pending', 'streaming', 'captured', 'failed'
};

// Subscription management
let userSubscription = {
    tier: 'unregistered', // Default to unregistered - requires registration
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: 'inactive',
    expiresAt: null,
    registered: false // Track if user has completed registration
};

// Subscription tracking
let subscriptionTracker = null;

// User account management
let currentUser = {
    email: null,
    name: null,
    userId: null
};

// Load user account from storage
function loadUser() {
    try {
        const userPath = path.join(app.getPath('userData'), 'user.json');
        if (fs.existsSync(userPath)) {
            const data = fs.readFileSync(userPath, 'utf8');
            currentUser = JSON.parse(data);
            console.log('✅ User loaded:', currentUser.email);
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Save user account to storage
function saveUser() {
    try {
        const userPath = path.join(app.getPath('userData'), 'user.json');
        fs.writeFileSync(userPath, JSON.stringify(currentUser, null, 2));
    } catch (error) {
        console.error('Error saving user:', error);
    }
}

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Load subscription from storage
function loadSubscription() {
    try {
        const subscriptionPath = path.join(app.getPath('userData'), 'subscription.json');
        if (fs.existsSync(subscriptionPath)) {
            const data = fs.readFileSync(subscriptionPath, 'utf8');
            const saved = JSON.parse(data);
            userSubscription = { ...userSubscription, ...saved };
            
            // If tier is set and not unregistered, mark as registered
            if (saved.tier && saved.tier !== 'unregistered') {
                userSubscription.registered = true;
            }
            
            console.log('✅ Subscription loaded:', userSubscription.tier, userSubscription.registered ? '(registered)' : '(unregistered)');
        }
        
        // Grant full access for testing/development
        // Upgrade to enterprise tier (16 panes, all features)
        if (userSubscription.tier === 'unregistered' || userSubscription.tier === 'starter') {
            userSubscription.tier = 'enterprise';
            userSubscription.registered = true;
            userSubscription.status = 'active';
            userSubscription.expiresAt = null; // Never expires for dev access
            saveSubscription();
            console.log('🎯 Full access granted: Upgraded to Enterprise tier (16 panes, all features)');
        }
    } catch (error) {
        console.error('Error loading subscription:', error);
    }
}

// Save subscription to storage
function saveSubscription() {
    try {
        const subscriptionPath = path.join(app.getPath('userData'), 'subscription.json');
        fs.writeFileSync(subscriptionPath, JSON.stringify(userSubscription, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving subscription:', error);
    }
}

// Theme system
const THEMES = {
    modern: 'toolshelf-ex1.html',
    brutalist: 'toolshelf-ex2.html',
    forge: 'toolshelf.html'
};

const DEFAULT_THEME = 'modern';

function getThemeFile(theme) {
    return THEMES[theme] || THEMES[DEFAULT_THEME];
}

// Tool registry - expanded list of AI chatbots
// AI Tools Configuration
// Each tool should support:
// - Clean extraction (text + images)
// - API integration (if available)
// - Consistent user experience
// See QUALITY_STANDARDS.md for quality guidelines
const TOOLS = [
    { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: '💬', category: 'conversational' },
    { id: 'claude', name: 'Claude', url: 'https://claude.ai', icon: '🧠', category: 'conversational' },
    { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', icon: '🤖', category: 'conversational' },
    { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai', icon: '🔍', category: 'search' },
    { id: 'poe', name: 'Poe', url: 'https://poe.com', icon: '📚', category: 'conversational' },
    { id: 'grok', name: 'Grok', url: 'https://x.ai', icon: '🚀', category: 'conversational' },
    { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: '🔮', category: 'conversational' },
    { id: 'mistral', name: 'Mistral', url: 'https://chat.mistral.ai', icon: '🌊', category: 'conversational' },
    { id: 'pi', name: 'Pi', url: 'https://pi.ai', icon: '🥧', category: 'conversational' },
    { id: 'character', name: 'Character.AI', url: 'https://character.ai', icon: '🎭', category: 'conversational' },
    { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com', icon: '💻', category: 'coding' },
    { id: 'you', name: 'You.com', url: 'https://you.com', icon: '🔎', category: 'search' },
    { id: 'phind', name: 'Phind', url: 'https://www.phind.com', icon: '🔬', category: 'coding' },
    { id: 'cursor', name: 'Cursor', url: 'https://cursor.sh', icon: '⌨️', category: 'coding' },
    { id: 'custom', name: 'Custom AI', url: '', icon: '⚙️', category: 'custom' }
];

function createWindow() {
    console.log('🪟 Creating main window...');
    try {
        mainWindow = new BrowserWindow({
            width: 1600,
            height: 1100, // Increased height to accommodate devtools
            title: 'ProjectCoachAI Forge Edition V1 - Your AI Workspace',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            },
            show: false
        });
        console.log('✅ BrowserWindow created');
        
        // Handle devtools opening - keep window positioned and ensure DevTools is visible
        mainWindow.webContents.on('devtools-opened', () => {
            console.log('🔧 [Main] DevTools opened - keeping window positioned on left');
            // Keep window on left side to make room for DevTools
            const bounds = mainWindow.getBounds();
            mainWindow.setBounds({
                x: 0, // Keep on left
                y: 0,
                width: bounds.width,
                height: bounds.height
            });
            // Resize panes if they exist
            if (activePanes.length > 0) {
                setTimeout(() => resizePanes(), 100);
            }
        });
        
        mainWindow.webContents.on('devtools-closed', () => {
            console.log('🔧 [Main] DevTools closed');
            // Resize panes if they exist
            if (activePanes.length > 0) {
                setTimeout(() => resizePanes(), 100);
            }
        });
        
        // Start with tool selection - load theme-based file
        const userTheme = getUserTheme();
        const themeFile = getThemeFile(userTheme);
        console.log(`📄 Loading theme file: ${themeFile} (theme: ${userTheme})`);
        
        mainWindow.loadFile(themeFile).then(() => {
            console.log('✅ Theme file loaded successfully');
        }).catch((error) => {
            console.error('❌ Error loading theme file:', error);
        });
        
        mainWindow.once('ready-to-show', () => {
            console.log('✅ Window ready to show - displaying window...');
            
            // Position window to the left to make room for DevTools on the right
            const { screen } = require('electron');
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width: screenWidth } = primaryDisplay.workAreaSize;
            
            // Position window on the left side of screen
            mainWindow.setPosition(0, 0);
            mainWindow.show();
            
            // DevTools disabled - users can manually open with Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) if needed
            // mainWindow.webContents.openDevTools({ mode: 'detach' });
            
            // Focus window
            mainWindow.focus();
            console.log('✅ Window displayed and focused');
        });
        
        mainWindow.on('closed', () => {
            console.log('⚠️ Main window closed');
            mainWindow = null;
        });
        
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('❌ Failed to load window:', errorCode, errorDescription);
        });
        
        mainWindow.webContents.on('crashed', (event, killed) => {
            console.error('❌ Window crashed! Killed:', killed);
        });
        
        // Handle window resize
        mainWindow.on('resize', () => {
            resizePanes();
        });
        
    } catch (error) {
        console.error('❌ Error creating window:', error);
        console.error('❌ Stack:', error.stack);
    }
    
    // DevTools handlers disabled for production
    // Users can manually open DevTools with Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) if needed
    /*
    if (mainWindow) {
        mainWindow.webContents.on('devtools-opened', () => {
            console.log('✅ DevTools opened - console is visible');
            mainWindow.focus();
            if (activePanes.length > 0) {
                resizePanes();
            }
        });
        
        mainWindow.webContents.on('devtools-closed', () => {
            console.log('⚠️ DevTools closed');
            if (activePanes.length > 0) {
                resizePanes();
            }
        });
    }
    */
}

async function createWorkspace(toolIds) {
    try {
        if (!toolIds || toolIds.length === 0) {
            throw new Error('No tools selected');
        }
        
        // Allow single tool for Quick Chat mode
        // If only 1 tool selected, assume Quick Chat mode
        if (toolIds.length === 1) {
            workspaceMode = 'quick';
            console.log('💬 [createWorkspace] Single tool selected - setting Quick Chat mode');
        } else if (toolIds.length >= 2) {
            // Multiple tools = Compare mode
            workspaceMode = 'compare';
            console.log('🔄 [createWorkspace] Multiple tools selected - setting Compare mode');
        }
        
        if (!mainWindow || mainWindow.isDestroyed()) {
            throw new Error('Main window not available');
        }
        
        // Clear existing views - hide first, then remove
        if (activePanes.length > 0) {
            // First hide all views by setting bounds to 0
            activePanes.forEach(pane => {
                try {
                    if (pane.view) {
                        const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
                        if (!isDestroyed) {
                            pane.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
                        }
                    }
                } catch (error) {
                    console.error('Error hiding pane:', error);
                }
            });
            
            // Wait a moment for hide to take effect
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Then remove them
            activePanes.forEach(pane => {
                try {
                    if (pane.view) {
                        const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
                        if (!isDestroyed) {
                            mainWindow.removeBrowserView(pane.view);
                        }
                    }
                } catch (error) {
                    console.error('Error removing pane:', error);
                }
            });
        }
        activePanes = [];
        
        // Filter out invalid tools and create panes
        const validTools = toolIds
            .map(toolId => TOOLS.find(t => t.id === toolId))
            .filter(tool => tool && tool.url);
        
        if (validTools.length === 0) {
            throw new Error('No valid tools found');
        }
        
        // Create panes for selected tools
        validTools.forEach((tool, index) => {
            try {
                const pane = createPane(tool, index, validTools.length);
                activePanes.push(pane);
            } catch (error) {
                console.error(`Error creating pane for ${tool.name}:`, error);
            }
        });
        
        if (activePanes.length === 0) {
            throw new Error('Failed to create any panes');
        }
        
        // Switch to workspace view
        try {
            await mainWindow.loadFile('workspace-from-hero.html');
            console.log('✅ Workspace frame HTML loaded successfully');
            
            // DevTools disabled - users can manually open with Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux) if needed
            // if (!mainWindow.webContents.isDevToolsOpened()) {
            //     mainWindow.webContents.openDevTools();
            // }
        } catch (error) {
            console.error('❌ Error loading workspace-frame.html:', error);
            throw new Error(`Failed to load workspace view: ${error.message}`);
        }
        
        // Resize panes after workspace loads (respects current workspaceMode)
        setTimeout(() => {
            resizePanes();
        }, 500);
        
        return { 
            success: true, 
            paneCount: activePanes.length,
            panes: activePanes.map((p, i) => ({
                index: i,
                tool: p.tool.name,
                icon: p.tool.icon
            })),
            mode: workspaceMode // Return current mode
        };
    } catch (error) {
        console.error('Error in createWorkspace:', error);
        return {
            success: false,
            error: error.message || 'Unknown error creating workspace'
        };
    }
}

function createPane(tool, index, totalPanes) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window not available');
    }
    
    if (!tool || !tool.url) {
        throw new Error(`Invalid tool configuration for ${tool?.name || 'unknown'}`);
    }
    
    try {
        // Create BrowserView as overlay on HTML panes (same structure as comparison page)
        const view = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                partition: `persist:${tool.id}`, // Persistent per tool ID (cookies/emails persist)
                preload: path.join(__dirname, 'pane-preload.js'),
                contentSecurityPolicy: "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        mainWindow.addBrowserView(view);
        
        // Initial bounds - will be repositioned in resizePanes() to match HTML panes
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        
        // Calculate layout - account for DevTools if open
        const { width, height } = mainWindow.getBounds();
        const headerHeight = 40;
        const promptBarHeight = 200; // Reserve space at bottom for ranking panel
        
        // Check if DevTools is open and adjust width accordingly
        // DevTools typically takes ~400-600px when open
        // Full width available (DevTools disabled)
        const devToolsWidth = 0;
        const availableWidth = width - devToolsWidth;
        
        // Calculate multi-column layout (max 4 panes per column)
        // This matches the resizePanes() logic for consistency
        const maxPanesPerColumn = 4;
        const numColumns = Math.ceil(totalPanes / maxPanesPerColumn);
        const paneWidth = Math.floor(availableWidth / numColumns);
        const paneHeight = Math.floor((height - headerHeight - promptBarHeight) / maxPanesPerColumn);
        
        // Calculate column and row position
        const column = Math.floor(index / maxPanesPerColumn);
        const row = index % maxPanesPerColumn;
        
        // TEMPORARILY DISABLED: BrowserView operations - showing only HTML panes
        // view.setBounds({
        //     x: column * paneWidth,
        //     y: headerHeight + (row * paneHeight),
        //     width: paneWidth,
        //     height: paneHeight
        // });
        
        // Create pane object - BrowserView will be positioned in resizePanes() to match HTML panes
        const pane = {
            view,
            tool,
            index,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            ready: false // Will be set to true when page loads
        };
        
        // TEMPORARILY DISABLED: BrowserView script injection
        // const injectCaptureScript = () => {
        //     try {
        //         const captureScriptPath = path.join(__dirname, 'response-capture.js');
        //         const captureScript = fs.readFileSync(captureScriptPath, 'utf8');
        //         
        //         // Inject capture script when page loads
        //         view.webContents.once('did-finish-load', () => {
        //             setTimeout(() => {
        //                 // Check if view still exists and is not destroyed (defensive check)
        //                 if (!view || typeof view.isDestroyed !== 'function' || view.isDestroyed() || !view.webContents || typeof view.webContents.isDestroyed !== 'function' || view.webContents.isDestroyed()) {
        //                     console.warn(`⚠️ [Capture] Cannot inject script for ${tool.name}: view destroyed`);
        //                     return;
        //                 }
        //                 view.webContents.executeJavaScript(captureScript).catch(err => {
        //                     console.error(`[Capture] Failed to inject capture script for ${tool.name}:`, err.message);
        //                 });
        //                 console.log(`✅ [Capture] Injected capture script for ${tool.name}`);
        //             }, 1000); // Wait 1 second for page to stabilize
        //         });
        //     } catch (error) {
        //         console.error(`[Capture] Error loading capture script for ${tool.name}:`, error.message);
        //     }
        // };
        // 
        // // TEMPORARILY DISABLED: BrowserView script injection
        // // injectCaptureScript();
        // 
        // // TEMPORARILY DISABLED: BrowserView overflow prevention
        // // const enforceOverflowFix = () => {
        //     const currentBounds = view.getBounds();
        //     const paneWidth = currentBounds.width;
        //     
        //     // Inject CSS first
        //     const overflowCSS = `
        //         html {
        //             overflow-x: hidden !important;
        //             width: 100% !important;
        //             max-width: 100% !important;
        //         }
        //         body {
        //             overflow-x: hidden !important;
        //             width: 100% !important;
        //             max-width: 100% !important;
        //             margin: 0 !important;
        //             padding: 0 !important;
        //         }
        //         * {
        //             max-width: 100% !important;
        //             box-sizing: border-box !important;
        //         }
        //     `;
        //     
        //     view.webContents.insertCSS(overflowCSS).catch(() => {});
        //     
        //     // Then inject JavaScript that DIRECTLY manipulates the DOM
        //     // Check if view still exists before executing (defensive check)
        //     if (!view || typeof view.isDestroyed !== 'function' || view.isDestroyed() || !view.webContents || typeof view.webContents.isDestroyed !== 'function' || view.webContents.isDestroyed()) {
        //         return; // View destroyed or invalid, skip injection
        //     }
        //     view.webContents.executeJavaScript(`
        //         (function() {
        //             // Get actual viewport width
        //             const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        //             
        //             // DIRECTLY set overflow on html and body elements
        //             const htmlEl = document.documentElement;
        //             const bodyEl = document.body;
        //             
        //             htmlEl.style.overflowX = 'hidden';
        //             htmlEl.style.width = viewportWidth + 'px';
        //             htmlEl.style.maxWidth = viewportWidth + 'px';
        //             
        //             bodyEl.style.overflowX = 'hidden';
        //             bodyEl.style.width = viewportWidth + 'px';
        //             bodyEl.style.maxWidth = viewportWidth + 'px';
        //             
        //             // Force remove horizontal scrollbar
        //             htmlEl.style.overflow = 'hidden';
        //             bodyEl.style.overflow = 'hidden';
        //             htmlEl.style.overflowY = 'auto';
        //             bodyEl.style.overflowY = 'auto';
        //             
        //             // Function to aggressively enforce bounds
        //             const enforceBounds = () => {
        //                 const vw = window.innerWidth || document.documentElement.clientWidth;
        //                 
        //                 // Always enforce on html and body
        //                 htmlEl.style.overflowX = 'hidden';
        //                 htmlEl.style.width = vw + 'px';
        //                 htmlEl.style.maxWidth = vw + 'px';
        //                 bodyEl.style.overflowX = 'hidden';
        //                 bodyEl.style.width = vw + 'px';
        //                 bodyEl.style.maxWidth = vw + 'px';
        //                 
        //                 // Check document width and force it
        //                 if (document.documentElement.scrollWidth > vw) {
        //                     htmlEl.style.width = vw + 'px';
        //                     bodyEl.style.width = vw + 'px';
        //                 }
        //                 
        //                 // Force all direct children of body
        //                 Array.from(bodyEl.children).forEach(child => {
        //                     const rect = child.getBoundingClientRect();
        //                     if (rect.right > vw || child.scrollWidth > vw) {
        //                         child.style.overflowX = 'hidden';
        //                         child.style.maxWidth = '100%';
        //                         child.style.width = '100%';
        //                     }
        //                 });
        //             };
        //             
        //             // Run immediately
        //             enforceBounds();
        //             
        //             // Run multiple times to catch dynamic content
        //             setTimeout(enforceBounds, 50);
        //             setTimeout(enforceBounds, 100);
        //             setTimeout(enforceBounds, 200);
        //             setTimeout(enforceBounds, 500);
        //             setTimeout(enforceBounds, 1000);
        //             
        //             // Continuous monitoring
        //             const observer = new MutationObserver(() => {
        //                 enforceBounds();
        //             });
        //             observer.observe(document.body, { 
        //                 childList: true, 
        //                 subtree: true,
        //                 attributes: true
        //             });
        //             
        //             // Resize handler
        //             window.addEventListener('resize', () => {
        //                 enforceBounds();
        //                 setTimeout(enforceBounds, 50);
        //             });
        //             
        //             // Periodic enforcement
        //             setInterval(enforceBounds, 1000);
        //         })();
        //     `).catch(() => {});
        // };
        // 
        // // Inject on dom-ready (as early as possible)
        // view.webContents.once('dom-ready', () => {
        //     enforceOverflowFix();
        // });
        // 
        // // Remove API status indicators aggressively on every navigation and continuously
        // const removeBanners = () => {
        //     // Check if view still exists and is not destroyed (defensive check)
        //     if (!view || typeof view.isDestroyed !== 'function' || view.isDestroyed() || !view.webContents || typeof view.webContents.isDestroyed !== 'function' || view.webContents.isDestroyed()) {
        //         return; // View destroyed or invalid, skip banner removal
        //     }
        //     view.webContents.executeJavaScript(`
        //         (function() {
        //             // Remove by ID
        //             const byId = document.querySelectorAll('[id^="projectcoach-api-status-"]');
        //             byId.forEach(el => el.remove());
        //             
        //             // Remove by content - look for "API: READY" or "API:" with "Status:" text
        //             const allDivs = Array.from(document.querySelectorAll('div'));
        //             allDivs.forEach(div => {
        //                 const text = (div.textContent || '').trim();
        //                 // Check if it contains API status text
        //                 if (text.includes('API: READY') || (text.includes('API:') && text.includes('Status:')) || text.includes('API:') && text.includes('Coords:')) {
        //                     const style = window.getComputedStyle(div);
        //                     // Check if it's fixed at the bottom (banner style)
        //                     if (style.position === 'fixed' && (style.bottom === '0px' || parseFloat(style.bottom) === 0)) {
        //                         div.remove();
        //                         return;
        //                     }
        //                     // Also check parent if this div is inside a fixed container
        //                     let parent = div.parentElement;
        //                     let depth = 0;
        //                     while (parent && parent !== document.body && depth < 3) {
        //                         const parentStyle = window.getComputedStyle(parent);
        //                         if (parentStyle.position === 'fixed' && (parentStyle.bottom === '0px' || parseFloat(parentStyle.bottom) === 0)) {
        //                             parent.remove();
        //                             return;
        //                         }
        //                         parent = parent.parentElement;
        //                         depth++;
        //                     }
        //                 }
        //             });
        //         })();
        //     `).catch(() => {});
        // };
        
        // TEMPORARILY DISABLED: All BrowserView operations - showing only HTML panes
        // Run on all navigation events
        // view.webContents.on('did-finish-load', removeBanners);
        // 
        // // Quick Chat mode - no constraints, let it display naturally
        // view.webContents.on('did-finish-load', () => {
        //     if (workspaceMode === 'quick') {
        //         // Let the AI tool display naturally without any width constraints
        //         console.log(`✅ [createPane] Quick Chat mode - ${tool.name} will display naturally`);
        //     }
        // });
        // view.webContents.on('dom-ready', () => {
        //     removeBanners();
        //     // Run again after a short delay to catch late injections
        //     setTimeout(removeBanners, 500);
        //     setTimeout(removeBanners, 1500);
        // });
        // view.webContents.on('did-navigate', removeBanners);
        // 
        // // Also run periodically to catch any late injections
        // const bannerInterval = setInterval(removeBanners, 500);
        // 
        // // Clean up interval when view is destroyed
        // view.webContents.on('destroyed', () => {
        //     clearInterval(bannerInterval);
        // });
        // 
        // // Mark pane as ready when loaded
        // view.webContents.once('did-finish-load', () => {
        //     console.log(`✅ ${tool.name} pane loaded and ready`);
        //     pane.ready = true;
        //     pane.bounds = view.getBounds();
        //     
        //     // Handle Perplexity navigation - redirect from library to main chat if needed
        //     if (tool.id === 'perplexity') {
        //         const currentUrl = view.webContents.getURL();
        //         if (currentUrl.includes('/library') || currentUrl.includes('/threads')) {
        //             console.log(`🔄 [Perplexity] Detected library/threads page, navigating to main chat...`);
        //             // Navigate to main chat page
        //             view.webContents.loadURL('https://www.perplexity.ai').catch(err => {
        //                 console.warn(`⚠️ [Perplexity] Could not navigate to main chat:`, err);
        //             });
        //         }
        //     }
        //     
        //     // Re-enforce immediately after load
        //     enforceOverflowFix();
        //     
        //     // And again after a short delay to catch late-loading content
        //     setTimeout(() => {
        //         enforceOverflowFix();
        //     }, 100);
        //     
        //     setTimeout(() => {
        //         enforceOverflowFix();
        //     }, 500);
        //     
        //     // Send API status to workspace.html (not injected into pane)
        //     setTimeout(() => {
        //         sendAPIStatusToWorkspace(tool, index, pane.bounds);
        //     }, 2000); // Wait longer for page to fully load
        // });
        // 
        // // Handle Perplexity navigation events
        // if (tool.id === 'perplexity') {
        //     view.webContents.on('did-navigate', (event, url) => {
        //         console.log(`🔄 [Perplexity] Navigated to: ${url}`);
        //         // If navigated to library/threads, try to go to main chat
        //         if (url.includes('/library') || url.includes('/threads')) {
        //             setTimeout(() => {
        //                 console.log(`🔄 [Perplexity] Redirecting from ${url} to main chat...`);
        //                 view.webContents.executeJavaScript(`
        //                     if (window.location.href.includes('/library') || window.location.href.includes('/threads')) {
        //                         window.location.href = 'https://www.perplexity.ai';
        //                     }
        //                 `).catch(() => {});
        //             }, 1000);
        //         }
        //     });
        // }
        // 
        // view.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        //     console.error(`❌ ${tool.name} pane failed to load:`, errorCode, errorDescription);
        //     pane.ready = false;
        // });
        // 
        // // Load the tool URL
        // view.webContents.loadURL(tool.url).catch(error => {
        //     console.error(`Error loading URL for ${tool.name}:`, error);
        // });
        
        // Inject capture script for response capture (same as comparison page uses)
        const injectCaptureScript = () => {
            try {
                const captureScriptPath = path.join(__dirname, 'response-capture.js');
                const captureScript = fs.readFileSync(captureScriptPath, 'utf8');
                
                view.webContents.once('did-finish-load', () => {
                    setTimeout(() => {
                        if (!view || view.webContents?.isDestroyed?.()) return;
                        view.webContents.executeJavaScript(captureScript).catch(err => {
                            console.error(`[Capture] Failed to inject for ${tool.name}:`, err.message);
                        });
                        console.log(`✅ [Capture] Injected capture script for ${tool.name}`);
                    }, 1000);
                });
            } catch (error) {
                console.error(`[Capture] Error loading capture script for ${tool.name}:`, error.message);
            }
        };
        injectCaptureScript();
        
        // Mark pane as ready when loaded - POE needs special handling
        view.webContents.once('did-finish-load', () => {
            console.log(`✅ ${tool.name} pane loaded and ready`);
            
            // POE-specific initialization: Clear conversation history and ensure fresh state
            if (tool.id === 'poe') {
                console.log(`🔧 [POE] Initializing POE with conversation clearing...`);
                // Wait longer for POE's React components to fully initialize
                setTimeout(() => {
                    clearPoeConversation(view).then(() => {
                        console.log(`✅ [POE] Conversation cleared, pane ready`);
                        pane.ready = true;
                    }).catch(err => {
                        console.warn(`⚠️ [POE] Could not clear conversation, marking ready anyway:`, err.message);
                        pane.ready = true; // Mark ready even if clearing fails
                    });
                }, 2000); // Wait 2 seconds for POE to fully load
            } else {
                pane.ready = true;
            }
        });
        
        view.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error(`❌ ${tool.name} pane failed to load:`, errorCode, errorDescription);
            pane.ready = false;
        });
        
        // Load the tool URL
        view.webContents.loadURL(tool.url).catch(error => {
            console.error(`Error loading URL for ${tool.name}:`, error);
        });
        
        console.log(`✅ [createPane] BrowserView created for ${tool.name} - will be positioned in resizePanes()`);
        
        return pane;
    } catch (error) {
        console.error(`Error creating pane for ${tool.name}:`, error);
        throw error;
    }
}

// Clear POE conversation history to ensure fresh state
async function clearPoeConversation(view) {
    if (!view || !view.webContents || view.webContents.isDestroyed()) {
        console.warn('⚠️ [POE] View not available for conversation clearing');
        return;
    }
    
    try {
        const result = await view.webContents.executeJavaScript(`
            (function() {
                console.log('[POE Clear] Attempting to clear conversation...');
                
                // Method 1: Look for "New Chat" or "New Conversation" button and click it
                let cleared = false;
                
                // First, try to find all buttons and filter for "New Chat" text
                try {
                    const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], [data-testid]'));
                    const newChatBtn = allButtons.find(btn => {
                        if (!btn.offsetParent || btn.disabled) return false;
                        const rect = btn.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0 || window.getComputedStyle(btn).display === 'none') return false;
                        
                        // Check button text
                        const btnText = (btn.textContent || '').toLowerCase();
                        const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                        const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                        const btnTestId = (btn.getAttribute('data-testid') || '').toLowerCase();
                        const btnHref = (btn.getAttribute('href') || '').toLowerCase();
                        
                        // Check for "New" in various forms
                        const hasNewText = btnText.includes('new') || btnLabel.includes('new') || 
                                          btnTitle.includes('new') || btnTestId.includes('new');
                        const hasChatLink = btnHref.includes('/chat/new') || btnHref.includes('/chat') && btnHref !== '/chat';
                        
                        // Check for plus icon (often used for "New")
                        const hasPlusIcon = btn.querySelector('svg') && (
                            (btn.querySelector('svg').getAttribute('aria-label') || '').toLowerCase().includes('plus') ||
                            (btn.querySelector('svg').getAttribute('aria-label') || '').toLowerCase().includes('add') ||
                            (btn.querySelector('svg').getAttribute('aria-label') || '').toLowerCase().includes('new')
                        );
                        
                        return hasNewText || hasChatLink || hasPlusIcon;
                    });
                    
                    if (newChatBtn) {
                        console.log('[POE Clear] Found New Chat button, clicking...');
                        newChatBtn.click();
                        cleared = true;
                    }
                } catch (e) {
                    console.log('[POE Clear] Error finding New Chat button:', e.message);
                }
                
                // Method 2: Navigate to a fresh chat URL if no button was found
                if (!cleared) {
                    console.log('[POE Clear] No New Chat button found, trying to navigate to fresh chat...');
                    try {
                        // Navigate to base chat URL to ensure fresh state
                        if (window.location.href.includes('poe.com')) {
                            const currentPath = window.location.pathname;
                            // If we're on a specific chat page, navigate to base chat
                            if (currentPath !== '/' && currentPath !== '/chat' && !currentPath.match(/^\/chat\/?$/)) {
                                console.log('[POE Clear] Navigating to base chat URL...');
                                window.location.href = window.location.origin + '/chat';
                                cleared = true; // Mark as cleared since navigation will reset state
                            } else {
                                // Already on base chat, just clear input fields (don't reload to avoid disruption)
                                console.log('[POE Clear] Already on base chat, clearing input fields only...');
                                // Input clearing will happen in Method 3
                            }
                        }
                    } catch (e) {
                        console.log('[POE Clear] Navigation failed:', e.message);
                    }
                }
                
                // Method 3: If navigation not possible, try to clear messages directly
                if (!cleared) {
                    console.log('[POE Clear] Trying to clear messages directly...');
                    try {
                        // Clear any textarea/input that might have old content FIRST
                        const inputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
                        inputs.forEach(input => {
                            if (input.value && input.value.trim().length > 0) {
                                input.value = '';
                            }
                            if (input.textContent && input.textContent.trim().length > 0) {
                                input.textContent = '';
                                input.innerText = '';
                            }
                            // Trigger events to update React state
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        
                        // Look for message containers and clear them (more conservative approach)
                        const messageContainers = Array.from(document.querySelectorAll('[class*="Message"], [class*="message"], [data-testid*="message"], [class*="ChatMessage"], [class*="chat-message"]'));
                        let messageCount = 0;
                        messageContainers.forEach(msg => {
                            // Only remove if it's clearly a message (has content but no input fields)
                            const hasInput = msg.querySelector('textarea') || msg.querySelector('input[type="text"]') || msg.tagName === 'BUTTON';
                            const hasText = (msg.textContent || '').trim().length > 10; // At least 10 chars to be a real message
                            
                            if (hasText && !hasInput) {
                                // Additional check: make sure it's not the main container
                                const parent = msg.parentElement;
                                if (parent && parent !== document.body) {
                                    msg.remove();
                                    messageCount++;
                                }
                            }
                        });
                        
                        if (messageCount > 0) {
                            console.log('[POE Clear] Removed', messageCount, 'message elements');
                            cleared = true;
                        }
                    } catch (e) {
                        console.log('[POE Clear] Error clearing messages:', e.message);
                    }
                }
                
                
                // Return result
                return new Promise(resolve => {
                    setTimeout(() => {
                        console.log('[POE Clear] Conversation clearing completed, cleared:', cleared);
                        resolve({ success: true, cleared: cleared, method: cleared ? 'button_click' : 'partial' });
                    }, cleared ? 1000 : 500); // Wait longer if we clicked a button (for navigation)
                });
            })()
        `);
        
        console.log(`✅ [POE] Conversation clearing result:`, result);
        return result;
    } catch (error) {
        console.error(`❌ [POE] Error clearing conversation:`, error.message);
        throw error;
    }
}

// Send API status to workspace.html (displayed at bottom of page)
function sendAPIStatusToWorkspace(tool, index, bounds) {
    try {
        const currentBounds = bounds || { x: 0, y: 0, width: 0, height: 0 };
        
        // Send status update to workspace window
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('api-status-update', {
                toolName: tool.name,
                index: index,
                status: 'READY',
                coords: { x: currentBounds.x, y: currentBounds.y },
                size: { width: currentBounds.width, height: currentBounds.height }
            });
        }
    } catch (error) {
        console.warn(`Error sending API status for ${tool.name}:`, error.message);
    }
}

// DISABLED - API status is shown in workspace.html footer, not injected into panes
// This function is completely disabled - API status should only appear in workspace.html footer
// If you see API status banners in panes, they are from old cached code - clear browser cache
function injectAPIStatusIndicator_DISABLED(view, tool, index, bounds) {
    // Function completely disabled - do nothing
    // API status is displayed in workspace.html footer only
    return;
}

function resizePanes() {
    if (activePanes.length === 0) return;
    
    const { width, height } = mainWindow.getBounds();
    const headerHeight = 40;
    const promptBarHeight = 200; // Reserve space at bottom for ranking panel
    const quickChatSelectorHeight = workspaceMode === 'quick' ? 50 : 0; // Space for AI selector in quick mode
    
    // Full width available (DevTools disabled)
    const devToolsWidth = 0;
    const availableWidth = width - devToolsWidth;
    
    // In quick mode, show only first pane with natural sizing
    if (workspaceMode === 'quick' && activePanes.length > 0) {
        console.log(`💬 [resizePanes] Quick Chat mode - showing only first pane (${activePanes.length} total panes)`);
        activePanes.forEach((pane, index) => {
            try {
                if (pane.view) {
                    const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
                    if (!isDestroyed) {
                        if (index === 0) {
                            // Show first pane with natural sizing (full available width)
                            const bounds = {
                                x: 0,
                                y: headerHeight + quickChatSelectorHeight,
                                width: availableWidth,
                                height: height - headerHeight - quickChatSelectorHeight - promptBarHeight
                            };
                            pane.view.setBounds(bounds);
                            // BrowserView doesn't have show()/hide() - setting bounds is enough
                            console.log(`✅ [resizePanes] Pane 0 (${pane.tool.name}) set to natural size: ${bounds.width}x${bounds.height}`);
                        } else {
                            // Hide other panes completely by setting bounds to 0
                            pane.view.setBounds({
                                x: 0,
                                y: 0,
                                width: 0,
                                height: 0
                            });
                            // BrowserView doesn't have show()/hide() - setting bounds to 0 effectively hides it
                            console.log(`🚫 [resizePanes] Pane ${index} (${pane.tool.name}) hidden`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error resizing pane ${index}:`, error);
            }
        });
    } else {
        // Compare mode: show all panes horizontally, with multiple rows if needed
        // Layout strategy: max 4 panes horizontally per row (like original)
        // 1-4 panes: 1 row with panes side-by-side (backward compatible)
        // 5-8 panes: 2 rows, each with up to 4 panes horizontally
        // 9-12 panes: 3 rows, each with up to 4 panes horizontally
        // IMPORTANT: Each row uses full available height - user scrolls window to see additional rows
        const totalPanes = activePanes.length;
        const maxPanesPerRow = 4;
        const numRows = Math.ceil(totalPanes / maxPanesPerRow);
        
        // Calculate required height: base height per row (same as single-row layout)
        // DO NOT resize window - keep original height so user can scroll to see additional rows
        const baseRowHeight = height - headerHeight - promptBarHeight;
        const rowHeight = baseRowHeight; // Fixed row height: full available height (same for all rows)
        
        // Calculate total content height needed (for scrolling)
        const totalContentHeight = headerHeight + (numRows * rowHeight) + promptBarHeight;
        
        // Get current dimensions (don't resize window)
        // Reserve space for scrollbar (typically 15-20px on the right)
        const scrollbarWidth = 20; // Reserve space for scrollbar
        // Panes must operate within the frame - account for container padding
        const containerPadding = 32; // 2rem = 32px (left + right padding)
        const availableWidth = width - devToolsWidth - scrollbarWidth - containerPadding;
        const availableHeight = height - headerHeight - promptBarHeight;
        const paneWidth = Math.floor(availableWidth / maxPanesPerRow);
        
        // Set body min-height for scrolling support (allows scrolling to see all rows)
        // CRITICAL: BrowserViews are positioned relative to window, not document
        // So we need to ensure the document has enough height and can scroll
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`
                (function() {
                    const totalHeight = ${totalContentHeight};
                    const currentHeight = window.innerHeight || document.documentElement.clientHeight;
                    const rowHeight = ${rowHeight};
                    const headerHeight = ${headerHeight};
                    
                    // Use hero page structure - create HTML panes in workspace container
                    const workspaceContainer = document.getElementById('workspaceContainer');
                    
                    if (workspaceContainer) {
                        workspaceContainer.innerHTML = '';
                        
                        // Group panes into rows (max 4 per row)
                        const maxPanesPerRow = 4;
                        const totalPanes = ${activePanes.length};
                        const rows = [];
                        for (let i = 0; i < totalPanes; i += maxPanesPerRow) {
                            rows.push(Array.from({length: Math.min(maxPanesPerRow, totalPanes - i)}, (_, j) => i + j));
                        }
                        
                        // Create row containers and panes - like hero page structure
                        rows.forEach((rowPanes, rowIndex) => {
                            const rowContainer = document.createElement('div');
                            rowContainer.className = 'pane-row';
                            
                            rowPanes.forEach((paneIndex) => {
                                const paneContainer = document.createElement('div');
                                paneContainer.className = 'pane-container';
                                paneContainer.setAttribute('data-pane-index', paneIndex);
                                paneContainer.setAttribute('data-browserview-placeholder', 'true');
                                
                                // Ensure pane-container clips content
                                paneContainer.style.overflow = 'hidden';
                                paneContainer.style.position = 'relative';
                                
                                // Get tool info
                                const toolInfo = ${JSON.stringify(activePanes.map((p, i) => ({ index: i, name: p.tool.name, icon: p.tool.icon })))};
                                const tool = toolInfo[paneIndex] || { name: 'AI Tool', icon: '🤖' };
                                
                                // Create pane structure
                                paneContainer.innerHTML = \`
                                    <div class="pane-header" style="flex-shrink: 0; height: 50px;">
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <span>\${tool.icon || '🤖'}</span>
                                            <span>\${tool.name || 'AI Tool ' + (paneIndex + 1)}</span>
                                        </div>
                                    </div>
                                    <div class="pane-content" style="position: relative; overflow: hidden; flex: 1; min-height: 0; padding: 0;">
                                        <!-- BrowserView will be positioned inside this content area -->
                                    </div>
                                \`;
                                
                                rowContainer.appendChild(paneContainer);
                            });
                            
                            workspaceContainer.appendChild(rowContainer);
                        });
                        
                        console.log('📏 [resizePanes] Created \${rows.length} rows with HTML panes (hero page structure)');
                    } else {
                        console.warn('⚠️ [resizePanes] workspaceContainer element not found!');
                    }
                    
                    // DON'T manipulate document/body heights - let them scroll naturally
                    // Just ensure body has padding for fixed header
                    document.body.style.paddingTop = headerHeight + 'px';
                    
                    // Scroll handler is already set up in workspace-from-hero.html
                    // Just verify scrolling is enabled
                    const container = document.querySelector('.workspace-container');
                    if (container) {
                        console.log('📏 [resizePanes] Workspace container height: ' + container.offsetHeight + 'px, scrollHeight: ' + container.scrollHeight + 'px');
                    }
                })();
            `).catch(() => {});
        }
        
        activePanes.forEach((pane, index) => {
            try {
                // TEMPORARILY DISABLED: Skip BrowserView positioning - showing only HTML panes
                if (pane.view && pane.view !== null) {
                    const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
                    if (!isDestroyed) {
                        // Calculate row and position within row (horizontal position)
                        const row = Math.floor(index / maxPanesPerRow);
                        const positionInRow = index % maxPanesPerRow;
                        
                        // Count how many panes are in this row (for last row that might be incomplete)
                        const panesInThisRow = Math.min(maxPanesPerRow, totalPanes - (row * maxPanesPerRow));
                        const actualPaneWidth = Math.floor(availableWidth / panesInThisRow);
                        
                        // Position BrowserView on top of the corresponding HTML pane
                        // Get the HTML pane element and use its position (like comparison page panes)
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            // Wait a bit for HTML panes to be created, then position BrowserView
                            setTimeout(() => {
                                mainWindow.webContents.executeJavaScript(`
                                    (function() {
                                        // Find the pane container
                                        const paneContainer = document.querySelector('[data-pane-index="${index}"][data-browserview-placeholder="true"]');
                                        if (paneContainer) {
                                            // Get the pane-content area (inside the pane, below header)
                                            const paneContent = paneContainer.querySelector('.pane-content');
                                            if (paneContent) {
                                                // Force layout recalculation
                                                paneContent.offsetHeight;
                                                
                                                const rect = paneContent.getBoundingClientRect();
                                                const containerRect = paneContainer.getBoundingClientRect();
                                                
                                                // Verify pane-content is inside container
                                                const isInside = rect.left >= containerRect.left && 
                                                                 rect.top >= containerRect.top &&
                                                                 rect.right <= containerRect.right &&
                                                                 rect.bottom <= containerRect.bottom;
                                                
                                                console.log(\`[Position Debug] Pane \${${index}}:\`, {
                                                    container: { x: containerRect.left, y: containerRect.top, w: containerRect.width, h: containerRect.height },
                                                    content: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
                                                    isInside: isInside
                                                });
                                                
                                                return {
                                                    x: Math.round(rect.left),
                                                    y: Math.round(rect.top),
                                                    width: Math.round(rect.width),
                                                    height: Math.round(rect.height),
                                                    found: true,
                                                    isInside: isInside
                                                };
                                            }
                                        }
                                        return { found: false };
                                    })();
                                `).then((paneRect) => {
                                    if (paneRect && paneRect.found) {
                                        // Store original position for scroll adjustment
                                        if (!pane.originalY) pane.originalY = paneRect.y;
                                        if (!pane.originalX) pane.originalX = paneRect.x;
                                        
                                        // Position BrowserView EXACTLY inside pane-content area
                                        // BrowserViews are window-level overlays, so we position them to match pane-content exactly
                                        // This makes them appear "inside" the pane visually
                        const bounds = {
                                            x: Math.round(paneRect.x),
                                            y: Math.round(paneRect.y),
                                            width: Math.max(1, Math.round(paneRect.width)),
                                            height: Math.max(1, Math.round(paneRect.height))
                                        };
                                        
                                        // Verify bounds are valid
                                        if (bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0) {
                        pane.view.setBounds(bounds);
                                            console.log(`📍 [resizePanes] Pane ${index} (${pane.tool.name}) positioned INSIDE pane-content: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
                                            
                                            // Verify positioning after a short delay
                                            setTimeout(() => {
                                                const actualBounds = pane.view.getBounds();
                                                console.log(`✅ [resizePanes] Pane ${index} actual bounds: x=${actualBounds.x}, y=${actualBounds.y}, w=${actualBounds.width}, h=${actualBounds.height}`);
                                            }, 200);
                                        } else {
                                            console.warn(`⚠️ [resizePanes] Invalid bounds for pane ${index}:`, bounds);
                                        }
                                    } else {
                                        // Fallback to calculated position if HTML pane not found yet
                                        const containerLeftPadding = 0;
                                        const containerTopPadding = 60;
                                        const originalY = headerHeight + containerTopPadding + (row * rowHeight);
                                        const originalX = containerLeftPadding + (positionInRow * actualPaneWidth);
                                        
                                        if (!pane.originalY) pane.originalY = originalY;
                                        if (!pane.originalX) pane.originalX = originalX;
                                        
                                        const bounds = {
                                            x: originalX,
                                            y: originalY,
                                            width: actualPaneWidth,
                                            height: rowHeight
                                        };
                                        pane.view.setBounds(bounds);
                                        console.log(`📍 [resizePanes] Pane ${index} (${pane.tool.name}) fallback position: x=${bounds.x}, y=${bounds.y}, w=${bounds.width}, h=${bounds.height}`);
                                    }
                                }).catch((error) => {
                                    console.error(`❌ [resizePanes] Error positioning pane ${index}:`, error);
                                });
                            }, 100); // Small delay to ensure HTML panes are created
                        }
                        
                        // Re-enforce overflow prevention after resize
                        setTimeout(() => {
                            const overflowCSS = `
                                html {
                                    overflow-x: hidden !important;
                                    width: 100% !important;
                                    max-width: 100% !important;
                                }
                                body {
                                    overflow-x: hidden !important;
                                    width: 100% !important;
                                    max-width: 100% !important;
                                }
                            `;
                            pane.view.webContents.insertCSS(overflowCSS).catch(() => {});
                            
                            // Direct DOM manipulation
                            pane.view.webContents.executeJavaScript(`
                                (function() {
                                    const vw = window.innerWidth || document.documentElement.clientWidth;
                                    const htmlEl = document.documentElement;
                                    const bodyEl = document.body;
                                    htmlEl.style.overflowX = 'hidden';
                                    htmlEl.style.width = vw + 'px';
                                    htmlEl.style.maxWidth = vw + 'px';
                                    bodyEl.style.overflowX = 'hidden';
                                    bodyEl.style.width = vw + 'px';
                                    bodyEl.style.maxWidth = vw + 'px';
                                })();
                            `).catch(() => {});
                        }, 50);
                    }
                }
            } catch (error) {
                console.error(`Error resizing pane ${index}:`, error);
            }
        });
    }
}

// Helper function: Retry logic with exponential backoff
async function callWithRetry(fn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.initialDelay || 1000;
    const timeout = options.timeout || 30000; // 30 seconds default
    const context = options.context || 'operation';
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Wrap function call with timeout using Promise.race
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Operation timed out after ${timeout/1000}s`)), timeout)
            );
            
            const result = await Promise.race([fn(), timeoutPromise]);
            if (attempt > 0) {
                console.log(`✅ [Retry] ${context} succeeded on attempt ${attempt + 1}/${maxRetries}`);
            }
            return result;
        } catch (error) {
            const isRetryable = error.message.includes('timeout') || 
                               error.message.includes('network') ||
                               error.message.includes('ETIMEDOUT') ||
                               error.code === 'ETIMEDOUT';
            
            if (!isRetryable || attempt === maxRetries - 1) {
                // Don't retry non-retryable errors or if we've exhausted retries
                if (attempt === maxRetries - 1) {
                    console.error(`❌ [Retry] ${context} failed after ${maxRetries} attempts:`, error.message);
                }
                throw error;
            }
            
            // Exponential backoff: 1s, 2s, 4s
            const delay = initialDelay * Math.pow(2, attempt);
            console.log(`⏳ [Retry] ${context} failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Helper function: Get user-friendly error message
function getUserFriendlyError(error, toolName) {
    const errorMsg = error?.message || error?.error || String(error) || 'Unknown error';
    
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
        return `${toolName} did not respond within 30 seconds. This may be due to network issues or the service being temporarily unavailable. Please try again.`;
    }
    
    if (errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ETIMEDOUT')) {
        return `${toolName} is experiencing network connectivity issues. Please check your internet connection and try again.`;
    }
    
    if (errorMsg.includes('not ready') || errorMsg.includes('not available')) {
        return `${toolName} is still initializing. Please wait a moment and try again.`;
    }
    
    if (errorMsg.includes('destroyed') || errorMsg.includes('not available')) {
        return `${toolName} pane was closed. Please restart the comparison.`;
    }
    
    if (errorMsg.includes('No input field found')) {
        return `${toolName}'s interface has changed. We're working on updating support for this tool.`;
    }
    
    // Generic error message
    return `${toolName} encountered an error: ${errorMsg}. Please try again or contact support if the issue persists.`;
}

async function sendPromptToPanes(prompt, paneIndices = null) {
    const panesToUse = paneIndices 
        ? activePanes.filter((_, i) => paneIndices.includes(i))
        : activePanes;
    
    console.log(`📤 [sendPromptToPanes] Sending to ${panesToUse.length} panes:`, panesToUse.map(p => p.tool.name));
    
    const results = [];
    const errors = [];
    
    // Process all panes in parallel with graceful degradation
    // Use Promise.allSettled to continue even if some fail
    const promises = panesToUse.map(async (pane, index) => {
        console.log(`📤 [sendPromptToPanes] Processing pane ${pane.index}: ${pane.tool.name}`);
        
        try {
            // Wait for pane to be ready - POE needs longer wait time
            const isPoe = pane.tool.id === 'poe';
            const maxWaitTime = isPoe ? 10000 : 5000; // POE gets 10 seconds, others 5 seconds
            
            if (!pane.ready) {
                console.log(`⏳ [sendPromptToPanes] Pane ${pane.tool.name} not ready, waiting... (max ${maxWaitTime/1000}s)`);
                await new Promise(resolve => {
                    const checkReady = setInterval(() => {
                        if (pane.ready) {
                            clearInterval(checkReady);
                            resolve();
                        }
                    }, 100);
                    // Timeout after maxWaitTime (longer for POE)
                    setTimeout(() => {
                        clearInterval(checkReady);
                        if (!pane.ready) {
                            console.warn(`⚠️ [sendPromptToPanes] ${pane.tool.name} not ready after ${maxWaitTime/1000}s, proceeding anyway`);
                        }
                        resolve();
                    }, maxWaitTime);
                });
            }
            
            // POE-specific: Additional wait to ensure conversation is cleared
            if (isPoe) {
                console.log(`⏳ [sendPromptToPanes] POE: Waiting additional 1s for conversation state to stabilize...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Inject text with retry logic and timeout (30s per AI)
            console.log(`🔍 [sendPromptToPanes] Injecting into ${pane.tool.name}...`);
            const success = await callWithRetry(
                () => injectText(pane.view, prompt),
                {
                    maxRetries: 3,
                    initialDelay: 1000,
                    timeout: 30000, // 30 seconds per AI
                    context: `${pane.tool.name} injection`
                }
            );
            
            console.log(`${success ? '✅' : '❌'} [sendPromptToPanes] ${pane.tool.name}: ${success ? 'SUCCESS' : 'FAILED'}`);
            
            return {
                paneIndex: pane.index,
                tool: pane.tool.name,
                success,
                error: null
            };
        } catch (error) {
            const friendlyError = getUserFriendlyError(error, pane.tool.name);
            console.error(`❌ [sendPromptToPanes] Error with ${pane.tool.name}:`, error.message);
            console.error(`📋 [sendPromptToPanes] User-friendly message:`, friendlyError);
            
            errors.push({
                tool: pane.tool.name,
                error: error.message,
                friendlyError: friendlyError
            });
            
            // Return failure result instead of throwing - graceful degradation
            return {
                paneIndex: pane.index,
                tool: pane.tool.name,
                success: false,
                error: error.message,
                friendlyError: friendlyError
            };
        }
    });
    
    // Use Promise.allSettled to continue even if some panes fail
    const allResults = await Promise.allSettled(promises);
    
    // Extract results and handle any promise rejections
    allResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            results.push(result.value);
        } else {
            // This shouldn't happen since we catch errors, but handle it anyway
            const pane = panesToUse[index];
            const friendlyError = getUserFriendlyError(result.reason, pane?.tool?.name || 'Unknown');
            results.push({
                paneIndex: pane?.index || index,
                tool: pane?.tool?.name || 'Unknown',
                success: false,
                error: result.reason?.message || 'Unknown error',
                friendlyError: friendlyError
            });
            errors.push({
                tool: pane?.tool?.name || 'Unknown',
                error: result.reason?.message || 'Unknown error',
                friendlyError: friendlyError
            });
        }
    });
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    console.log(`✅ [sendPromptToPanes] Sent prompt to ${successCount}/${results.length} panes`);
    
    // Log successful results
    results.filter(r => r.success).forEach(r => {
        console.log(`   ✅ ${r.tool}: Success`);
    });
    
    // Log failed results with user-friendly messages
    results.filter(r => !r.success).forEach(r => {
        console.log(`   ❌ ${r.tool}: ${r.friendlyError || r.error || 'Failed'}`);
    });
    
    // If we have at least one success, return success with partial results
    if (successCount > 0) {
        if (failureCount > 0) {
            console.warn(`⚠️ [sendPromptToPanes] Partial success: ${successCount} succeeded, ${failureCount} failed`);
            console.warn(`⚠️ [sendPromptToPanes] Continuing with available AI tools...`);
        }
        return { 
            success: true, 
            results,
            partial: failureCount > 0,
            errors: errors.length > 0 ? errors : undefined,
            successCount,
            failureCount
        };
    } else {
        // All failed - this is a real error
        console.error(`❌ [sendPromptToPanes] All ${results.length} panes failed`);
        return { 
            success: false, 
            results,
            errors,
            error: 'All AI tools failed to respond. Please check your internet connection and try again.'
        };
    }
}

async function injectText(view, text) {
    // AI-specific text injection - user controls this action
    try {
        // Check if view is ready
        if (!view || !view.webContents || typeof view.webContents.isDestroyed !== 'function' || view.webContents.isDestroyed()) {
            console.error('❌ View is destroyed or not available');
            return false;
        }
        
        const url = view.webContents.getURL();
        console.log(`🔍 Injecting text into: ${url.substring(0, 50)}...`);
        
        // POE-specific: Clear conversation before injecting to prevent mixing with past data
        if (url.includes('poe.com')) {
            console.log(`🔧 [POE] Clearing conversation before injecting new prompt...`);
            try {
                await clearPoeConversation(view);
                // Wait longer for POE's UI to stabilize after clearing
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log(`✅ [POE] Conversation cleared, ready for injection`);
            } catch (err) {
                console.warn(`⚠️ [POE] Could not clear conversation, proceeding anyway:`, err.message);
                // Still wait a bit for POE to be ready
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } else {
            // Wait a moment for page to be interactive (non-POE)
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const result = await view.webContents.executeJavaScript(`
        (function() {
            const textToInject = ${JSON.stringify(text)};
            const url = window.location.href;
            
            console.log('[INJECT] URL:', url);
            console.log('[INJECT] Text:', textToInject);
            
            // AI-specific selectors
            let selectors = [];
            if (url.includes('chat.openai.com')) {
                // ChatGPT
                selectors = [
                    'textarea#prompt-textarea',
                    'textarea[data-id]',
                    'textarea[placeholder*="Message"]',
                    'textarea'
                ];
            } else if (url.includes('claude.ai')) {
                // Claude
                selectors = [
                    'textarea[placeholder*="Message"]',
                    'div[contenteditable="true"]',
                    'textarea'
                ];
            } else if (url.includes('gemini.google.com')) {
                // Gemini
                selectors = [
                    'textarea[aria-label*="chat"]',
                    'textarea[aria-label*="Enter"]',
                    'textarea',
                    'div[contenteditable="true"]'
                ];
            } else if (url.includes('perplexity.ai')) {
                // Perplexity - handle both main chat and library pages
                // First try main chat selectors, then library page selectors
                if (url.includes('/library') || url.includes('/threads')) {
                    // Library/Threads page - try to find search or input
                    selectors = [
                        'input[type="text"][placeholder*="Search"]',
                        'input[type="text"][placeholder*="search"]',
                        'textarea[placeholder*="Search"]',
                        'textarea[placeholder*="search"]',
                        'div[contenteditable="true"][role="textbox"]',
                        'div[contenteditable="true"]',
                        '[role="textbox"]',
                        '[contenteditable="true"]',
                        'input[type="text"]',
                        'textarea'
                    ];
                } else {
                    // Main chat page selectors
                    selectors = [
                        'textarea[placeholder*="Ask"]',
                        'textarea[placeholder*="ask"]',
                        'textarea[placeholder*="Ask anything"]',
                        'div[contenteditable="true"][role="textbox"]',
                        'div[contenteditable="true"]',
                        'textarea[aria-label*="Ask"]',
                        'textarea[aria-label*="message"]',
                        'textarea',
                        'input[type="text"][placeholder*="Ask"]',
                        '[role="textbox"]',
                        '[contenteditable="true"]'
                    ];
                }
            } else if (url.includes('chat.deepseek.com')) {
                // DeepSeek
                selectors = [
                    'textarea[placeholder*="Message"]',
                    'textarea[placeholder*="message"]',
                    'textarea',
                    'div[contenteditable="true"]',
                    '[role="textbox"]'
                ];
            } else if (url.includes('chat.mistral.ai')) {
                // Mistral (Le Chat)
                selectors = [
                    'textarea[placeholder*="Ask"]',
                    'textarea[placeholder*="ask"]',
                    'textarea',
                    'div[contenteditable="true"]',
                    '[role="textbox"]'
                ];
            } else if (url.includes('x.ai') || url.includes('grok.com')) {
                // Grok
                selectors = [
                    'div[contenteditable="true"]',
                    'textarea[placeholder*="What do you want to know"]',
                    'textarea[placeholder*="know"]',
                    'textarea',
                    '[role="textbox"]'
                ];
            } else if (url.includes('poe.com')) {
                // Poe
                selectors = [
                    'textarea[placeholder*="Message"]',
                    'textarea[placeholder*="message"]',
                    'textarea',
                    'div[contenteditable="true"]',
                    '[role="textbox"]'
                ];
            } else {
                // Generic fallback
                selectors = [
                    'textarea',
                    'input[type="text"]',
                    '[contenteditable="true"]',
                    '[role="textbox"]'
                ];
            }
            
            console.log('[INJECT] Trying selectors:', selectors);
            
            // Try each selector
            for (const selector of selectors) {
                const inputs = document.querySelectorAll(selector);
                console.log('[INJECT] Found', inputs.length, 'elements for', selector);
                
                if (inputs.length > 0) {
                    // Use the last/largest visible input
                    const visibleInputs = Array.from(inputs).filter(el => {
                        const rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    });
                    
                    if (visibleInputs.length === 0) {
                        console.log('[INJECT] No visible inputs for', selector);
                        continue;
                    }
                    
                    const input = visibleInputs
                        .sort((a, b) => {
                            const aSize = a.offsetHeight * a.offsetWidth;
                            const bSize = b.offsetHeight * b.offsetWidth;
                            return bSize - aSize;
                        })[0];
                    
                    console.log('[INJECT] Selected input:', input.tagName, input.className, 'contentEditable:', input.contentEditable);
                    
                    // Set value based on input type
                    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                        // For React-controlled inputs, we need to trigger React's onChange
                        // First, get the native setter to bypass React
                        const elementProto = (window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype) || 
                                            (window.HTMLInputElement && window.HTMLInputElement.prototype);
                        const valueDescriptor = elementProto ? Object.getOwnPropertyDescriptor(elementProto, 'value') : null;
                        const nativeInputValueSetter = valueDescriptor ? valueDescriptor.set : null;
                        
                        if (nativeInputValueSetter) {
                            nativeInputValueSetter.call(input, textToInject);
                        } else {
                            input.value = textToInject;
                        }
                        
                        input.focus();
                        
                        // Also set selection to end of text
                        if (input.setSelectionRange) {
                            input.setSelectionRange(textToInject.length, textToInject.length);
                        }
                        
                        // Trigger React's onChange by dispatching InputEvent (more React-compatible)
                        try {
                            const reactInputEvent = new InputEvent('input', {
                                bubbles: true,
                                cancelable: true,
                                inputType: 'insertText',
                                data: textToInject
                            });
                            Object.defineProperty(reactInputEvent, 'target', {
                                writable: false,
                                value: input
                            });
                            input.dispatchEvent(reactInputEvent);
                        } catch (e) {
                            // Fallback to regular Event if InputEvent not available
                            const reactInputEvent = new Event('input', { bubbles: true, cancelable: true });
                            Object.defineProperty(reactInputEvent, 'target', {
                                writable: false,
                                value: input
                            });
                            input.dispatchEvent(reactInputEvent);
                        }
                    } else if (input.contentEditable === 'true' || input.isContentEditable) {
                        // For contenteditable divs, set content carefully
                        // Only clear HTML for Perplexity (which needs it), preserve structure for others like Gemini
                        if (url.includes('perplexity.ai')) {
                            // Perplexity: Clear first, then set
                            input.innerHTML = '';
                            input.textContent = textToInject;
                            input.innerText = textToInject;
                        } else {
                            // Other AIs (Gemini, etc): Preserve structure, just update text
                            input.textContent = textToInject;
                            input.innerText = textToInject;
                        }
                        
                        // Set cursor position
                        input.focus();
                        const range = document.createRange();
                        const selection = window.getSelection();
                        range.selectNodeContents(input);
                        range.collapse(false); // Collapse to end
                        selection.removeAllRanges();
                        selection.addRange(range);
                        
                        // Also set data attribute if needed
                        if (input.dataset) {
                            input.dataset.value = textToInject;
                        }
                    }
                    
                    // Trigger comprehensive events (skip 'input' for textarea/input as we already dispatched it above)
                    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                        // For textarea/input, trigger change and other events with proper target
                        const events = ['change', 'keyup', 'keydown', 'keypress'];
                        events.forEach(eventType => {
                            const evt = new Event(eventType, { bubbles: true, cancelable: true });
                            Object.defineProperty(evt, 'target', {
                                writable: false,
                                value: input
                            });
                            input.dispatchEvent(evt);
                        });
                    } else {
                        // For contenteditable, trigger all events normally
                        const events = ['input', 'change', 'keyup', 'keydown'];
                        events.forEach(eventType => {
                            input.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
                        });
                    }
                    
                    // For contenteditable, also trigger input event with proper data
                    if (input.contentEditable === 'true' || input.isContentEditable) {
                        const inputEvent = new InputEvent('input', {
                            bubbles: true,
                            cancelable: true,
                            inputType: 'insertText',
                            data: textToInject
                        });
                        input.dispatchEvent(inputEvent);
                        
                        // Only trigger composition events for Perplexity (which may need them)
                        // Other AIs like Gemini work fine without them
                        if (url.includes('perplexity.ai')) {
                            try {
                                if (typeof CompositionEvent !== 'undefined') {
                                    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
                                    input.dispatchEvent(new CompositionEvent('compositionupdate', { data: textToInject, bubbles: true }));
                                    input.dispatchEvent(new CompositionEvent('compositionend', { data: textToInject, bubbles: true }));
                                }
                            } catch (e) {
                                // CompositionEvent not available, skip
                            }
                        }
                    }
                    
                    console.log('[INJECT] Text set, triggering submit...');
                    
                    // Try to submit after a delay (with AI-specific handling)
                    // Add delay to give React time to process the input change (150ms for React state updates)
                    setTimeout(() => {
                        // Grok-specific handling: needs both keydown and keyup, and may need button click
                        if (url.includes('x.ai') || url.includes('grok.com')) {
                            console.log('[INJECT] Grok-specific submit logic...');
                            // First try to find and click the submit button (Grok often has a send button)
                            // Try to find button near the input field first
                            let submitBtn = null;
                            const inputRect = input.getBoundingClientRect();
                            const buttons = document.querySelectorAll('button');
                            
                            // First pass: Look for buttons near the input field
                            const nearbyButtons = Array.from(buttons).filter(btn => {
                                if (!btn.offsetParent || btn.disabled) return false;
                                const btnRect = btn.getBoundingClientRect();
                                // Check if button is near the input (within 200px vertically, same horizontal area)
                                const verticalDistance = Math.abs(btnRect.top - inputRect.bottom);
                                const horizontalOverlap = !(btnRect.right < inputRect.left || btnRect.left > inputRect.right);
                                return verticalDistance < 200 && horizontalOverlap;
                            });
                            
                            if (nearbyButtons.length > 0) {
                                submitBtn = nearbyButtons.find(btn => {
                                    const btnText = (btn.textContent || '').toLowerCase();
                                    const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                    const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                                    const btnSvg = btn.querySelector('svg');
                                    const svgAriaLabel = btnSvg ? (btnSvg.getAttribute('aria-label') || '').toLowerCase() : '';
                                    return btnText.includes('send') || 
                                           btnText.includes('submit') || 
                                           btnLabel.includes('send') ||
                                           btnLabel.includes('submit') ||
                                           btnTitle.includes('send') ||
                                           btnTitle.includes('submit') ||
                                           svgAriaLabel.includes('send') ||
                                           svgAriaLabel.includes('submit') ||
                                           btn.querySelector('svg[aria-label*="send"]') ||
                                           btn.querySelector('svg[aria-label*="Send"]');
                                });
                            }
                            
                            // Second pass: If no nearby button found, check all buttons
                            if (!submitBtn) {
                                submitBtn = Array.from(buttons).find(btn => {
                                    if (!btn.offsetParent || btn.disabled) return false;
                                    const btnText = (btn.textContent || '').toLowerCase();
                                    const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                    const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                                    const btnSvg = btn.querySelector('svg');
                                    const svgAriaLabel = btnSvg ? (btnSvg.getAttribute('aria-label') || '').toLowerCase() : '';
                                    return btnText.includes('send') || 
                                           btnText.includes('submit') || 
                                           btnLabel.includes('send') ||
                                           btnLabel.includes('submit') ||
                                           btnTitle.includes('send') ||
                                           btnTitle.includes('submit') ||
                                           svgAriaLabel.includes('send') ||
                                           svgAriaLabel.includes('submit') ||
                                           btn.querySelector('svg[aria-label*="send"]') ||
                                           btn.querySelector('svg[aria-label*="Send"]');
                                });
                            }
                            
                            if (submitBtn) {
                                console.log('[INJECT] Grok: Found submit button, clicking...');
                                submitBtn.click();
                            } else {
                                // For Grok with contenteditable, we need both keydown and keyup Enter events
                                console.log('[INJECT] Grok: No button found, trying Enter key (keydown + keyup)...');
                                input.focus();
                                
                                // Keydown
                                const enterKeyDown = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    which: 13,
                                    bubbles: true,
                                    cancelable: true
                                });
                                input.dispatchEvent(enterKeyDown);
                                
                                // Keyup (needed for some React apps)
                                setTimeout(() => {
                                    const enterKeyUp = new KeyboardEvent('keyup', {
                                        key: 'Enter',
                                        code: 'Enter',
                                        keyCode: 13,
                                        which: 13,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    input.dispatchEvent(enterKeyUp);
                                    
                                    // Also try keypress for maximum compatibility
                                    const enterKeyPress = new KeyboardEvent('keypress', {
                                        key: 'Enter',
                                        code: 'Enter',
                                        keyCode: 13,
                                        which: 13,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    input.dispatchEvent(enterKeyPress);
                                }, 50);
                            }
                        } else if (url.includes('chat.deepseek.com')) {
                            // DeepSeek submit handling (keep working logic untouched)
                            console.log('[INJECT] DeepSeek-specific submit logic...');
                            let submitBtn = null;
                            const inputRect = input.getBoundingClientRect();
                            const buttons = document.querySelectorAll('button');
                            
                            // First pass: Look for buttons near the input field
                            const nearbyButtons = Array.from(buttons).filter(btn => {
                                if (!btn.offsetParent || btn.disabled) return false;
                                const btnRect = btn.getBoundingClientRect();
                                const verticalDistance = Math.abs(btnRect.top - inputRect.bottom);
                                const horizontalOverlap = !(btnRect.right < inputRect.left || btnRect.left > inputRect.right);
                                return verticalDistance < 200 && horizontalOverlap;
                            });
                            
                            if (nearbyButtons.length > 0) {
                                submitBtn = nearbyButtons.find(btn => {
                                    const btnText = (btn.textContent || '').toLowerCase();
                                    const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                    const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                                    const btnSvg = btn.querySelector('svg');
                                    const svgAriaLabel = btnSvg ? (btnSvg.getAttribute('aria-label') || '').toLowerCase() : '';
                                    return btnText.includes('send') || 
                                           btnText.includes('submit') || 
                                           btnLabel.includes('send') ||
                                           btnLabel.includes('submit') ||
                                           btnTitle.includes('send') ||
                                           btnTitle.includes('submit') ||
                                           svgAriaLabel.includes('send') ||
                                           svgAriaLabel.includes('submit') ||
                                           btn.querySelector('svg[aria-label*="send"]') ||
                                           btn.querySelector('svg[aria-label*="Send"]');
                                });
                            }
                            
                            if (!submitBtn) {
                                submitBtn = Array.from(buttons).find(btn => {
                                    if (!btn.offsetParent || btn.disabled) return false;
                                    const btnText = (btn.textContent || '').toLowerCase();
                                    const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                    const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                                    const btnSvg = btn.querySelector('svg');
                                    const svgAriaLabel = btnSvg ? (btnSvg.getAttribute('aria-label') || '').toLowerCase() : '';
                                    return btnText.includes('send') || 
                                           btnText.includes('submit') || 
                                           btnLabel.includes('send') ||
                                           btnLabel.includes('submit') ||
                                           btnTitle.includes('send') ||
                                           btnTitle.includes('submit') ||
                                           svgAriaLabel.includes('send') ||
                                           svgAriaLabel.includes('submit') ||
                                           btn.querySelector('svg[aria-label*="send"]') ||
                                           btn.querySelector('svg[aria-label*="Send"]');
                                });
                            }
                            
                            if (submitBtn) {
                                console.log('[INJECT] DeepSeek: Found submit button, clicking...');
                                submitBtn.click();
                            } else {
                                console.log('[INJECT] DeepSeek: No button found, trying Enter key (keydown + keyup + keypress)...');
                                input.focus();
                                
                                // Keydown
                                const enterKeyDown = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    which: 13,
                                    bubbles: true,
                                    cancelable: true
                                });
                                input.dispatchEvent(enterKeyDown);
                                
                                // Keyup (needed for React textareas)
                                setTimeout(() => {
                                    const enterKeyUp = new KeyboardEvent('keyup', {
                                        key: 'Enter',
                                        code: 'Enter',
                                        keyCode: 13,
                                        which: 13,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    input.dispatchEvent(enterKeyUp);
                                    
                                    // Also try keypress for maximum compatibility
                                    const enterKeyPress = new KeyboardEvent('keypress', {
                                        key: 'Enter',
                                        code: 'Enter',
                                        keyCode: 13,
                                        which: 13,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    input.dispatchEvent(enterKeyPress);
                                }, 50);
                            }
                        } else if (url.includes('chat.mistral.ai') || url.includes('mistral.ai')) {
                            // Mistral-specific submit handling (ULTRA-AGGRESSIVE approach - ONLY for Mistral)
                            console.log('[INJECT] Mistral-specific submit logic (ultra-aggressive)...');
                            
                            // Step 1: Ensure input value is set and React sees it
                            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                                // Trigger multiple events to ensure React state updates
                                const events = ['input', 'change', 'blur', 'focus'];
                                events.forEach(eventType => {
                                    const evt = new Event(eventType, { bubbles: true, cancelable: true });
                                    Object.defineProperty(evt, 'target', { writable: false, value: input });
                                    input.dispatchEvent(evt);
                                });
                            }
                            
                            input.focus();
                            
                            // Step 2: Wait longer for React to fully process (Mistral needs more time)
                            setTimeout(() => {
                                let submitBtn = null;
                                const inputRect = input.getBoundingClientRect();
                                
                                // Strategy 1: Look for button RIGHT next to the textarea (Mistral-specific)
                                const allButtons = document.querySelectorAll('button, [role="button"], [type="submit"], [data-testid], button svg, [aria-label*="send"], [aria-label*="submit"]');
                                const veryNearby = Array.from(allButtons).filter(el => {
                                    if (!el.offsetParent || el.disabled) return false;
                                    const elRect = el.getBoundingClientRect();
                                    const verticalDist = Math.abs(elRect.top - inputRect.bottom);
                                    const horizontalDist = Math.abs(elRect.left - inputRect.right);
                                    // Very tight proximity for Mistral
                                    return (verticalDist < 100 && horizontalDist < 100) || 
                                           (verticalDist < 50 && horizontalDist < 200);
                                });
                                
                                if (veryNearby.length > 0) {
                                    // Prioritize: button with SVG > button > any clickable
                                    submitBtn = veryNearby.find(el => {
                                        const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button';
                                        const hasSvg = el.querySelector('svg') || el.tagName === 'SVG' || el.closest('svg');
                                        return isButton && hasSvg;
                                    }) || veryNearby.find(el => el.tagName === 'BUTTON') || veryNearby[0];
                                }
                                
                                // Strategy 2: Search ALL buttons for any send/submit indicator
                                if (!submitBtn) {
                                    submitBtn = Array.from(allButtons).find(btn => {
                                        if (!btn.offsetParent || btn.disabled) return false;
                                        const text = (btn.textContent || '').toLowerCase();
                                        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                                        const title = (btn.getAttribute('title') || '').toLowerCase();
                                        const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
                                        const svg = btn.querySelector('svg');
                                        const svgLabel = svg ? (svg.getAttribute('aria-label') || '').toLowerCase() : '';
                                        return text.includes('send') || text.includes('submit') || text.includes('ask') ||
                                               label.includes('send') || label.includes('submit') || label.includes('ask') ||
                                               title.includes('send') || title.includes('submit') ||
                                               testId.includes('send') || testId.includes('submit') ||
                                               svgLabel.includes('send') || svgLabel.includes('submit') ||
                                               btn.querySelector('svg[aria-label*="send"]') || btn.querySelector('svg[aria-label*="Send"]');
                                    });
                                }
                                
                                // Strategy 3: Try form submission if input is in a form
                                const form = input.closest('form');
                                if (form) {
                                    console.log('[INJECT] Mistral: Found form, trying form submission...');
                                    try {
                                        // Try form.submit() first
                                        form.submit();
                                        // Also try dispatching submit event
                                        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                                        form.dispatchEvent(submitEvent);
                                    } catch (e) {
                                        console.log('[INJECT] Mistral: Form submit failed, continuing with button/key...');
                                    }
                                }
                                
                                // Strategy 4: MULTIPLE submission attempts (button + Enter key)
                                let submissionAttempted = false;
                                
                                if (submitBtn) {
                                    console.log('[INJECT] Mistral: Found submit button, attempting multiple click methods...');
                                    submissionAttempted = true;
                                    
                                    // Attempt 1: Focus and click
                                    submitBtn.focus();
                                    submitBtn.click();
                                    
                                    // Attempt 2: Full mouse event sequence
                                    const mouseEvents = [
                                        new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }),
                                        new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0 }),
                                        new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 })
                                    ];
                                    mouseEvents.forEach(evt => submitBtn.dispatchEvent(evt));
                                    
                                    // Attempt 3: Delayed retry (React might need time)
                                    setTimeout(() => {
                                        submitBtn.focus();
                                        submitBtn.click();
                                        submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                    }, 150);
                                    
                                    // Attempt 4: Another delayed retry
                                    setTimeout(() => {
                                        submitBtn.click();
                                    }, 300);
                                }
                                
                                // Strategy 5: ALWAYS try Enter key as well (even if button was found)
                                console.log('[INJECT] Mistral: Also trying Enter key sequence...');
                                input.focus();
                                
                                // Full Enter key sequence with multiple attempts
                                const enterSequence = () => {
                                    const events = [
                                        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, view: window }),
                                        new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, view: window }),
                                        new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, view: window })
                                    ];
                                    events.forEach(evt => input.dispatchEvent(evt));
                                };
                                
                                // Try Enter immediately
                                enterSequence();
                                
                                // Try Enter again after delays
                                setTimeout(enterSequence, 100);
                                setTimeout(enterSequence, 250);
                                setTimeout(enterSequence, 500);
                                
                                if (!submissionAttempted) {
                                    console.log('[INJECT] Mistral: No button found, relying on Enter key sequence only');
                                }
                            }, 500); // Increased to 500ms delay for Mistral
                        } else if (url.includes('poe.com')) {
                            // POE-specific submit logic - ensure we're in a clean conversation state
                            console.log('[INJECT] POE-specific submit logic...');
                            
                            // First, verify the input is ready and clear any old content
                            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                                // Ensure value is set correctly
                                if (input.value !== textToInject) {
                                    console.log('[INJECT] POE: Fixing input value mismatch...');
                                    const elementProto = (window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype) || 
                                                        (window.HTMLInputElement && window.HTMLInputElement.prototype);
                                    const valueDescriptor = elementProto ? Object.getOwnPropertyDescriptor(elementProto, 'value') : null;
                                    const nativeInputValueSetter = valueDescriptor ? valueDescriptor.set : null;
                                    if (nativeInputValueSetter) {
                                        nativeInputValueSetter.call(input, textToInject);
                        } else {
                                        input.value = textToInject;
                                    }
                                    // Trigger React update
                                    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: textToInject }));
                                }
                            }
                            
                            input.focus();
                            
                            // POE typically uses Enter key, but also check for send button
                            setTimeout(() => {
                                // Method 1: Try Enter key (most reliable for POE)
                                const enterEvent = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    which: 13,
                                    bubbles: true,
                                    cancelable: true
                                });
                                input.dispatchEvent(enterEvent);
                                
                                // Also try keyup and keypress for better React compatibility
                                setTimeout(() => {
                                    input.dispatchEvent(new KeyboardEvent('keyup', {
                                        key: 'Enter',
                                        code: 'Enter',
                                        keyCode: 13,
                                        bubbles: true,
                                        cancelable: true
                                    }));
                                    input.dispatchEvent(new KeyboardEvent('keypress', {
                                        key: 'Enter',
                                        code: 'Enter',
                                        keyCode: 13,
                                        bubbles: true,
                                        cancelable: true
                                    }));
                                }, 50);
                                
                                // Method 2: Look for send button as fallback
                                const buttons = document.querySelectorAll('button');
                                const submitBtn = Array.from(buttons).find(btn => {
                                    if (!btn.offsetParent || btn.disabled) return false;
                                    const btnText = (btn.textContent || '').toLowerCase();
                                    const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                    const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                                    const btnSvg = btn.querySelector('svg');
                                    const svgLabel = btnSvg ? (btnSvg.getAttribute('aria-label') || '').toLowerCase() : '';
                                    return btnText.includes('send') || 
                                           btnText.includes('submit') || 
                                           btnLabel.includes('send') ||
                                           btnLabel.includes('submit') ||
                                           btnTitle.includes('send') ||
                                           btnTitle.includes('submit') ||
                                           svgLabel.includes('send') ||
                                           svgLabel.includes('submit') ||
                                           btn.querySelector('svg[aria-label*="send"]') ||
                                           btn.querySelector('svg[aria-label*="Send"]');
                                });
                                
                                if (submitBtn) {
                                    console.log('[INJECT] POE: Found submit button, clicking as backup...');
                                    setTimeout(() => submitBtn.click(), 100);
                                }
                            }, 200); // Wait 200ms for POE's React to process the input
                        } else {
                            // Unified submit logic for other AIs (ChatGPT, Claude, Gemini, Perplexity, etc.)
                            // Method 1: Press Enter
                            const enterEvent = new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true,
                                cancelable: true
                            });
                            input.dispatchEvent(enterEvent);
                            
                            // Method 2: Find and click submit button
                            const buttons = document.querySelectorAll('button');
                            const submitBtn = Array.from(buttons).find(btn => {
                                if (!btn.offsetParent || btn.disabled) return false;
                                const btnText = (btn.textContent || '').toLowerCase();
                                const btnLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                                const btnTitle = (btn.getAttribute('title') || '').toLowerCase();
                                return btnText.includes('send') || 
                                       btnText.includes('submit') || 
                                       btnLabel.includes('send') ||
                                       btnLabel.includes('submit') ||
                                       btnTitle.includes('send') ||
                                       btnTitle.includes('submit') ||
                                       btn.querySelector('svg[aria-label*="send"]') ||
                                       btn.querySelector('svg[aria-label*="Send"]');
                            });
                            
                            if (submitBtn) {
                                console.log('[INJECT] Found submit button, clicking...');
                                submitBtn.click();
                            } else {
                                console.log('[INJECT] No submit button found, trying Enter key...');
                                // Try Enter key again
                                input.dispatchEvent(new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    bubbles: true,
                                    cancelable: true
                                }));
                            }
                        }
                    }, 150);
                    
                    return { success: true, selector: selector, method: 'injected', url: url };
                }
            }
            
            console.error('[INJECT] No suitable input found');
            return { success: false, error: 'No input field found' };
        })()
    `);
        
        if (result && result.success) {
            console.log(`✅ Text injected successfully into ${result.selector || 'input'}`);
            return true;
        } else {
            console.error(`❌ Text injection failed:`, result?.error || 'Unknown error');
            return false;
        }
    } catch (error) {
        console.error('❌ Text injection error:', error);
        return false;
    }
}

// IPC Handlers
ipcMain.handle('get-tools', () => TOOLS);

// Handle scroll adjustment for BrowserViews - make them scroll with the frame
ipcMain.on('adjust-panes-for-scroll', (event, scrollY) => {
    if (!activePanes || activePanes.length === 0) return;
    
    activePanes.forEach((pane, index) => {
        try {
            if (pane.view && pane.originalY !== undefined) {
                const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
                if (!isDestroyed) {
                    const currentBounds = pane.view.getBounds();
                    // Adjust y position: subtract scroll offset from original position
                    // This makes BrowserViews appear to scroll with the frame
                    const adjustedY = pane.originalY - scrollY;
                    // Never move above the header
                    const headerHeight = 40;
                    const finalY = Math.max(headerHeight, adjustedY);
                    
                    pane.view.setBounds({
                        ...currentBounds,
                        y: finalY
                    });
                }
            }
        } catch (error) {
            // Silently ignore errors for destroyed views
        }
    });
});

// Handle individual pane position adjustment based on HTML pane position
ipcMain.on('adjust-pane-position', (event, index, bounds) => {
    if (!activePanes || !activePanes[index]) return;
    
    const pane = activePanes[index];
    try {
        if (pane.view) {
            const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
            if (!isDestroyed) {
                pane.view.setBounds({
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height
                });
            }
        }
    } catch (error) {
        // Silently ignore errors for destroyed views
    }
});

// IPC Handler: Get response states (for smart compare button)
ipcMain.handle('get-response-states', () => {
    try {
        const states = Array.from(workspaceState.responseStates.entries()).map(([tool, state]) => ({
            aiTool: tool,
            ...state
        }));
        
        const available = {
            captured: states.filter(s => s.status === 'captured' && s.source === 'captured'),
            streaming: states.filter(s => s.status === 'streaming'),
            api: states.filter(s => s.status === 'captured' && s.source === 'api'),
            any: states.filter(s => s.status !== 'pending' && s.content && s.content.length > 0),
            total: states.length
        };
        
        return {
            success: true,
            states: states,
            available: available,
            hasEnoughForComparison: available.any.length >= 2
        };
    } catch (error) {
        console.error('❌ [IPC] Error getting response states:', error);
        return {
            success: false,
            error: error.message,
            states: [],
            available: { captured: [], streaming: [], api: [], any: [], total: 0 },
            hasEnoughForComparison: false
        };
    }
});

// IPC Handler: Receive captured AI responses from BrowserView panes
ipcMain.on('captured-ai-response', (event, captureData) => {
    try {
        // CRITICAL: Define toolNameLower FIRST - used throughout this handler
        const toolNameLower = captureData.aiTool.toLowerCase();
        const existingResponse = workspaceState.storedResponses[toolNameLower];
        
        // CRITICAL: Check if new response is framework data (CSS, React internals, etc.)
        // Reject framework data even if it's "longer" - it's not a real response
        const isFrameworkData = /@keyframes|@media|\.css|intercom|app-launcher|self\.__next_f|__next_f|\["\$","\$L/i.test(captureData.response);
        if (isFrameworkData && captureData.response.length > 4000) {
            console.log(`⚠️ [Capture] Rejecting framework data for ${captureData.aiTool} (${captureData.response.length} chars)`);
            console.log(`   Preview: ${captureData.response.substring(0, 200)}...`);
            return; // Don't store framework data
        }
        
        // Only update if new response is significantly longer (30% more) or completely different
        // This prevents overwriting complete responses with partial ones during streaming
        // BUT: Never overwrite a good response with framework data
        // Also: Always update if existing response is very short (< 100 chars) - likely partial
        const shouldUpdate = !existingResponse || 
            !existingResponse.hasResponse ||
            (existingResponse.response.length < 100) || // Always update if existing is very short
            (captureData.response.length > existingResponse.response.length * 1.3 && !isFrameworkData) || // 30% longer
            (captureData.response.substring(0, 100) !== existingResponse.response.substring(0, 100) && !isFrameworkData && captureData.response.length >= existingResponse.response.length);
        
        if (shouldUpdate) {
            console.log(`📥 [Capture] Received response from ${captureData.aiTool} (${captureData.response.length} chars)${existingResponse ? ` - UPDATED (was ${existingResponse.response.length} chars)` : ' - NEW'}`);
            
            workspaceState.storedResponses[toolNameLower] = {
                tool: captureData.aiTool,
                prompt: captureData.prompt || workspaceState.lastPrompt || 'Unknown prompt',
                response: captureData.response,
                html: captureData.response, // Use text as HTML for now
                hasResponse: true,
                hasImages: false,
                hasVideos: false,
                images: [],
                videos: [],
                links: [],
                metadata: {
                    timestamp: captureData.timestamp,
                    url: captureData.url,
                    source: 'auto-capture',
                    captureTime: new Date(captureData.timestamp).toISOString(),
                    length: captureData.response.length
                },
                source: 'captured', // Flag: from BrowserView capture, not API
                lastUpdated: Date.now() // Track when last updated
            };
            
            // CRITICAL: Update response state to 'captured'
            workspaceState.responseStates.set(toolNameLower, {
                status: 'captured',
                content: captureData.response,
                html: captureData.response,
                timestamp: Date.now(),
                source: 'captured',
                metadata: {
                    length: captureData.response.length,
                    wordCount: captureData.response.split(/\s+/).filter(w => w.length > 0).length
                }
            });
            
            console.log(`✅ [Capture] Stored response for ${captureData.aiTool} in workspaceState`);
            console.log(`📊 [Capture] Total stored responses: ${Object.keys(workspaceState.storedResponses).length}`);
            
            // Log which panes have responses
            const storedTools = Object.keys(workspaceState.storedResponses);
            console.log(`📋 [Capture] Stored responses for: ${storedTools.join(', ')}`);
            
            // CRITICAL: Notify comparison window if it's open (dynamic update)
            // This allows comparison window to update with workspace responses even if it opened with API responses
            // This is the KEY to solving the timing issue - window can open with API responses, then update with captured ones
            // Check both activeComparisonWindow and all comparison windows
            // NOTE: toolNameLower is already defined at the top of this handler (line 1585)
            let notified = false;
            const storedResponse = workspaceState.storedResponses[toolNameLower];
            
            // Try active window first
            if (activeComparisonWindow && !activeComparisonWindow.isDestroyed()) {
                try {
                    if (storedResponse && storedResponse.hasResponse) {
                        console.log(`🔄 [Capture] 🔄 DYNAMIC UPDATE: Notifying comparison window of captured response for ${captureData.aiTool} (${storedResponse.response.length} chars)`);
                        console.log(`🔄 [Capture] This replaces any API response with the actual workspace response`);
                        // Format response text for better display (consistent with initial setup)
                        const formattedResponse = formatResponseText(storedResponse.response);
                        activeComparisonWindow.webContents.send('update-pane-response', {
                            tool: captureData.aiTool,
                            toolNameLower: toolNameLower,
                            response: formattedResponse,
                            html: formattedResponse,
                            hasResponse: true,
                            hasImages: storedResponse.hasImages || false,
                            source: 'captured',
                            status: 'captured', // State status
                            metadata: storedResponse.metadata || {}
                        });
                        notified = true;
                    }
                } catch (error) {
                    console.error('❌ [Capture] Error notifying comparison window:', error);
                }
            }
            
            // Fallback: Try all comparison windows
            if (!notified && comparisonWindows.size > 0) {
                for (const [windowId, window] of comparisonWindows) {
                    if (window && !window.isDestroyed()) {
                        try {
                            if (storedResponse && storedResponse.hasResponse) {
                                console.log(`🔄 [Capture] Notifying comparison window ${windowId} of captured response for ${captureData.aiTool}`);
                                // Format response text for better display (consistent with initial setup)
                                const formattedResponse = formatResponseText(storedResponse.response);
                                window.webContents.send('update-pane-response', {
                                    tool: captureData.aiTool,
                                    toolNameLower: toolNameLower,
                                    response: formattedResponse,
                                    html: formattedResponse,
                                    hasResponse: true,
                                    hasImages: storedResponse.hasImages || false,
                                    source: 'captured',
                                    status: 'captured',
                                    metadata: storedResponse.metadata || {}
                                });
                                notified = true;
                                break; // Only notify one window
                            }
                        } catch (error) {
                            console.error(`❌ [Capture] Error notifying comparison window ${windowId}:`, error);
                        }
                    }
                }
            }
            
            if (!notified) {
                console.log(`⏭️ [Capture] No active comparison window to update (${comparisonWindows.size} windows tracked, active: ${activeComparisonWindow ? 'set' : 'null'})`);
            }
        } else {
            // New response is not significantly different - keep existing
            const lengthDiff = existingResponse.response.length - captureData.response.length;
            const percentDiff = ((lengthDiff / existingResponse.response.length) * 100).toFixed(1);
            console.log(`⏭️ [Capture] Skipping update for ${captureData.aiTool} (existing: ${existingResponse.response.length} chars, new: ${captureData.response.length} chars, ${percentDiff}% difference - keeping existing)`);
        }
        
    } catch (error) {
        console.error('❌ [Capture] Error storing captured response:', error);
    }
});

// Subscription & Feature Gating IPC Handlers
// Remove existing handlers before registering (prevents duplicate registration errors)
ipcMain.removeHandler('get-subscription');
ipcMain.removeHandler('get-pricing-tiers');
ipcMain.removeHandler('upgrade-subscription');
ipcMain.removeHandler('verify-subscription');
ipcMain.removeHandler('open-customer-portal');
ipcMain.removeHandler('check-feature-access');
ipcMain.removeHandler('check-ai-access');
ipcMain.removeHandler('open-pricing-page');

ipcMain.handle('get-subscription', () => {
    // If unregistered, return starter tier info but mark as unregistered
    const tier = userSubscription.tier === 'unregistered' ? 'starter' : userSubscription.tier;
    // Get max panes - null means unlimited (user can choose any configuration)
    const maxPanes = userSubscription.tier === 'unregistered' ? 0 : getMaxPanes(userSubscription.tier);
    // null means unlimited - return 999 as "unlimited" for compatibility
    const maxPanesDisplay = maxPanes === null ? 999 : maxPanes;
    
    return {
        tier: userSubscription.tier,
        registered: userSubscription.registered || false,
        features: getTier(tier).features,
        maxPanes: maxPanesDisplay, // null converted to 999 for unlimited
        maxPanesUnlimited: maxPanes === null, // Flag indicating unlimited
        allowedAIs: userSubscription.tier === 'unregistered' ? [] : getTier(userSubscription.tier).allowedAIs
    };
});

ipcMain.handle('get-pricing-tiers', () => {
    return Object.values(PRICING_TIERS).map(tier => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        priceDisplay: tier.priceDisplay,
        billing: tier.billing,
        description: tier.description,
        badge: tier.badge || null,
        features: tier.features
    }));
});

ipcMain.handle('upgrade-subscription', async (event, tierId) => {
    try {
        const tier = getTier(tierId);
        
        if (tier.price === 0) {
            // Free tier - just update and mark as registered
            const fromTier = userSubscription.tier;
            userSubscription.tier = tierId;
            userSubscription.registered = true;
            userSubscription.status = 'active';
            saveSubscription();
            
            // Track free tier selection (registration)
            if (subscriptionTracker) {
                if (fromTier === 'unregistered') {
                    subscriptionTracker.trackEvent('registration_completed', {
                        tier: tierId,
                        price: 0,
                        timestamp: new Date().toISOString()
                    });
                }
                subscriptionTracker.trackUpgrade(fromTier, tierId, 0, null);
            }
            
            return { success: true, tier: tierId, registered: true };
        }
        
        if (tierId === 'enterprise') {
            // Enterprise - open contact page (local HTML file)
            try {
                const contactWindow = new BrowserWindow({
                    width: 900,
                    height: 800,
                    title: 'Enterprise Pricing - ProjectCoachAI',
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        preload: path.join(__dirname, 'preload.js'),
                        contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
                    }
                });
                
                contactWindow.loadFile('contact-enterprise.html');
                
                // Track enterprise contact request
                if (subscriptionTracker) {
                    subscriptionTracker.trackEvent('enterprise_contact_requested', {
                        timestamp: new Date().toISOString()
                    });
                }
                
                return { success: true, requiresContact: true };
            } catch (error) {
                console.error('Error opening contact page:', error);
                // Fallback to external URL
                const { shell } = require('electron');
                await shell.openExternal('https://projectcoachai.com/contact-enterprise');
                return { success: true, requiresContact: true };
            }
        }
        
        // Paid tier - open Stripe checkout
        const stripeClient = new StripeClient();
        const result = await stripeClient.openCheckout(tierId);
        
        if (result.success) {
            // Store pending upgrade
            userSubscription.pendingTier = tierId;
            userSubscription.pendingSessionId = result.sessionId;
            saveSubscription();
        }
        
        return result;
    } catch (error) {
        console.error('Upgrade error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('verify-subscription', async (event, sessionId) => {
    try {
        const stripeClient = new StripeClient();
        const verification = await stripeClient.verifySubscription(sessionId);
        
        if (verification.success && verification.tier) {
            const fromTier = userSubscription.tier;
            const tier = getTier(verification.tier);
            
            userSubscription.tier = verification.tier;
            userSubscription.stripeCustomerId = verification.customerId;
            userSubscription.stripeSubscriptionId = verification.subscriptionId;
            userSubscription.status = 'active';
            userSubscription.expiresAt = verification.expiresAt;
            delete userSubscription.pendingTier;
            delete userSubscription.pendingSessionId;
            saveSubscription();
            
            // Track successful upgrade
            if (subscriptionTracker) {
                subscriptionTracker.trackUpgrade(
                    fromTier,
                    verification.tier,
                    tier.price,
                    sessionId
                );
            }
            
            return { success: true, tier: verification.tier };
        }
        
        return { success: false, error: 'Subscription verification failed' };
    } catch (error) {
        console.error('Verification error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-customer-portal', async (event) => {
    try {
        if (!userSubscription.stripeCustomerId) {
            return { success: false, error: 'No active subscription' };
        }
        
        const stripeClient = new StripeClient();
        const portalUrl = await stripeClient.getCustomerPortalUrl(userSubscription.stripeCustomerId);
        
        const { shell } = require('electron');
        await shell.openExternal(portalUrl);
        
        return { success: true };
    } catch (error) {
        console.error('Customer portal error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('check-feature-access', (event, feature) => {
    return hasFeature(userSubscription.tier, feature);
});

ipcMain.handle('check-ai-access', (event, aiId) => {
    return canUseAI(userSubscription.tier, aiId);
});

ipcMain.handle('get-subscription-summary', () => {
    if (subscriptionTracker) {
        return subscriptionTracker.getSummary();
    }
    return null;
});

// Open external URL handler (for contact pages, etc.)
ipcMain.handle('open-external-url', async (event, url) => {
    try {
        const { shell } = require('electron');
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('Error opening external URL:', error);
        return { success: false, error: error.message };
    }
});

// Open contact page handler
// Open help page handler
ipcMain.handle('open-help-page', async (event) => {
    try {
        console.log('🆘 [IPC] Opening help page...');
        const helpWindow = new BrowserWindow({
            width: 1000,
            height: 800,
            title: 'Help - ProjectCoachAI Forge Edition',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        helpWindow.once('ready-to-show', () => {
            console.log('✅ Help page ready, showing window');
            helpWindow.show();
            helpWindow.focus();
        });
        
        await helpWindow.loadFile('help.html');
        return { success: true };
    } catch (error) {
        console.error('Error opening help page:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-contact-page', async (event) => {
    try {
        console.log('📧 [IPC] Opening contact page...');
        const contactWindow = new BrowserWindow({
            width: 900,
            height: 800,
            title: 'Contact Us - ProjectCoachAI',
            show: false, // Don't show until ready
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        // Show window when ready
        contactWindow.once('ready-to-show', () => {
            console.log('✅ Contact page ready, showing window');
            contactWindow.show();
            contactWindow.focus();
        });
        
        // Load the contact page
        const contactPath = path.join(__dirname, 'contact-enterprise.html');
        console.log('📄 Loading contact page from:', contactPath);
        await contactWindow.loadFile('contact-enterprise.html');
        
        console.log('✅ Contact page window created successfully');
        return { success: true };
    } catch (error) {
        console.error('❌ Error opening contact page:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('open-pricing-page', async (event, source) => {
    try {
        // Track pricing page view
        if (subscriptionTracker) {
            subscriptionTracker.trackPricingViewed(source || 'button_click');
        }
        
        const pricingWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            title: 'Pricing - ProjectCoachAI',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        pricingWindow.loadFile('pricing.html');
        return { success: true };
    } catch (error) {
        console.error('Error opening pricing page:', error);
        return { success: false, error: error.message };
    }
});

// Open registration page
ipcMain.handle('open-register', async (event) => {
    try {
        const registerWindow = new BrowserWindow({
            width: 500,
            height: 700,
            title: 'Register - ProjectCoachAI',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;"
            }
        });
        
        registerWindow.loadFile('register.html');
        return { success: true };
    } catch (error) {
        console.error('Error opening register page:', error);
        return { success: false, error: error.message };
    }
});

// Open sign-in page
ipcMain.handle('open-sign-in', async (event) => {
    try {
        const signInWindow = new BrowserWindow({
            width: 500,
            height: 600,
            title: 'Sign In - ProjectCoachAI',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;"
            }
        });
        
        signInWindow.loadFile('signin.html');
        return { success: true };
    } catch (error) {
        console.error('Error opening sign-in page:', error);
        return { success: false, error: error.message };
    }
});

// Register new user
ipcMain.handle('register-user', async (event, userData) => {
    try {
        const { name, email, password } = userData;
        
        if (!name || !email || !password) {
            return { success: false, error: 'All fields are required' };
        }
        
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { success: false, error: 'Invalid email address' };
        }
        
        // Validate password
        if (password.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters' };
        }
        
        // Check if user already exists
        const usersPath = path.join(app.getPath('userData'), 'users.json');
        let users = {};
        if (fs.existsSync(usersPath)) {
            const data = fs.readFileSync(usersPath, 'utf8');
            users = JSON.parse(data);
        }
        
        if (users[email]) {
            return { success: false, error: 'An account with this email already exists' };
        }
        
        // Create user account
        const userId = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password);
        
        users[email] = {
            userId,
            name,
            email,
            passwordHash,
            createdAt: new Date().toISOString(),
            stripeCustomerId: null // Will be created when they subscribe
        };
        
        // Save users
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
        
        // Set current user
        currentUser = {
            userId,
            name,
            email
        };
        saveUser();
        
        // Mark as registered (starter tier)
        userSubscription.registered = true;
        userSubscription.tier = 'starter';
        userSubscription.status = 'active';
        saveSubscription();
        
        console.log('✅ User registered:', email);
        
        return { success: true, userId, name, email };
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message || 'Registration failed' };
    }
});

// Sign in user
ipcMain.handle('sign-in-user', async (event, credentials) => {
    try {
        const { email, password } = credentials;
        
        if (!email || !password) {
            return { success: false, error: 'Email and password are required' };
        }
        
        // Load users
        const usersPath = path.join(app.getPath('userData'), 'users.json');
        if (!fs.existsSync(usersPath)) {
            return { success: false, error: 'Invalid email or password' };
        }
        
        const data = fs.readFileSync(usersPath, 'utf8');
        const users = JSON.parse(data);
        
        const user = users[email];
        if (!user) {
            return { success: false, error: 'Invalid email or password' };
        }
        
        // Verify password
        const passwordHash = hashPassword(password);
        if (user.passwordHash !== passwordHash) {
            return { success: false, error: 'Invalid email or password' };
        }
        
        // Set current user
        currentUser = {
            userId: user.userId,
            name: user.name,
            email: user.email
        };
        saveUser();
        
        // Update subscription if user has Stripe customer ID
        if (user.stripeCustomerId) {
            userSubscription.stripeCustomerId = user.stripeCustomerId;
        }
        
        // Ensure user is marked as registered
        userSubscription.registered = true;
        if (userSubscription.tier === 'unregistered') {
            userSubscription.tier = 'starter';
        }
        saveSubscription();
        
        console.log('✅ User signed in:', email);
        
        return { 
            success: true, 
            userId: user.userId, 
            name: user.name, 
            email: user.email 
        };
    } catch (error) {
        console.error('Sign-in error:', error);
        return { success: false, error: error.message || 'Sign-in failed' };
    }
});

// Get current user
ipcMain.handle('get-current-user', async (event) => {
    try {
        // If currentUser is not loaded, try to load it
        if (!currentUser.email) {
            loadUser();
        }
        
        return {
            success: true,
            user: currentUser.email ? {
                userId: currentUser.userId,
                name: currentUser.name,
                email: currentUser.email
            } : null
        };
    } catch (error) {
        console.error('Get current user error:', error);
        return { success: false, error: error.message };
    }
});

// Sign out user
ipcMain.handle('sign-out-user', async (event) => {
    try {
        // Clear current user
        currentUser = {
            email: null,
            name: null,
            userId: null
        };
        saveUser();
        
        // Reset subscription to unregistered (but keep tier if they had one)
        // Don't clear subscription completely, just mark as not signed in
        userSubscription.registered = false;
        saveSubscription();
        
        console.log('✅ User signed out');
        
        return { success: true };
    } catch (error) {
        console.error('Sign-out error:', error);
        return { success: false, error: error.message || 'Sign-out failed' };
    }
});

ipcMain.handle('create-workspace', async (event, toolIds) => {
    console.log('📦 [IPC] Creating workspace with tools:', toolIds);
    try {
        if (!toolIds || !Array.isArray(toolIds) || toolIds.length === 0) {
            throw new Error('Invalid tool selection');
        }
        
        // Auto-detect mode based on tool count
        // Single tool = Quick Chat mode, Multiple tools = Compare mode
        if (toolIds.length === 1) {
            workspaceMode = 'quick';
            console.log('💬 [IPC] Single tool detected - Quick Chat mode');
        } else if (toolIds.length >= 2) {
            workspaceMode = 'compare';
            console.log('🔄 [IPC] Multiple tools detected - Compare mode');
        }
        
        // ENFORCE REGISTRATION: Check if user has a valid subscription
        // Even Starter (free) plan requires registration
        if (!userSubscription.registered || userSubscription.tier === 'unregistered') {
            // Track registration prompt
            if (subscriptionTracker) {
                subscriptionTracker.trackEvent('registration_required', {
                    attemptedTools: toolIds.length,
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                success: false,
                error: 'Registration required. Please select a plan to continue.',
                requiresRegistration: true,
                showPricing: true
            };
        }
        
        // Check subscription limits
        const maxPanes = getMaxPanes(userSubscription.tier);
        // null means unlimited - allow any number of panes
        if (maxPanes !== null && toolIds.length > maxPanes) {
            return {
                success: false,
                error: `Maximum ${maxPanes} panes allowed on ${getTier(userSubscription.tier).name} plan. Upgrade to use more.`,
                requiresUpgrade: true,
                currentTier: userSubscription.tier,
                maxPanes: maxPanes
            };
        }
        
        // Check AI access for each tool
        const invalidAIs = toolIds.filter(aiId => !canUseAI(userSubscription.tier, aiId));
        if (invalidAIs.length > 0) {
            // Track limit hit event
            if (subscriptionTracker) {
                subscriptionTracker.trackLimitHit(
                    userSubscription.tier,
                    'ai_access',
                    invalidAIs.length,
                    0 // No max for AI access, it's binary
                );
            }
            
            // Get tool names for better error message
            const invalidToolNames = invalidAIs.map(id => {
                const tool = TOOLS.find(t => t.id === id);
                return tool ? tool.name : id;
            }).join(', ');
            
            return {
                success: false,
                error: `Some AI tools are not available on ${getTier(userSubscription.tier).name} plan: ${invalidToolNames}. Upgrade to access all AIs.`,
                requiresUpgrade: true,
                invalidAIs: invalidAIs,
                invalidToolNames: invalidToolNames,
                currentTier: userSubscription.tier,
                showPricing: true // Flag to show pricing page
            };
        }
        
        const result = await createWorkspace(toolIds);
        console.log('✅ [IPC] Workspace creation result:', result);
        return result;
    } catch (error) {
        console.error('❌ [IPC] Error creating workspace:', error);
        return {
            success: false,
            error: error.message || 'Failed to create workspace'
        };
    }
});

ipcMain.handle('send-prompt-to-all', async (event, prompt) => {
    console.log('📤 [IPC] send-prompt-to-all handler called');
    console.log('📤 [IPC] Prompt received:', prompt ? prompt.substring(0, 50) + '...' : 'EMPTY');
    console.log('📤 [IPC] Active panes count:', activePanes.length);
    
    if (!prompt || prompt.trim().length === 0) {
        console.error('❌ [IPC] Empty prompt received');
        return { success: false, error: 'Empty prompt' };
    }
    
    if (activePanes.length === 0) {
        console.error('❌ [IPC] No active panes to send to');
        return { success: false, error: 'No active panes' };
    }
    
    // Store prompt for later use in comparison (modern API approach)
    workspaceState.lastPrompt = prompt;
    workspaceState.lastPromptTimestamp = Date.now();
    console.log('💾 [IPC] Stored prompt for comparison:', prompt.substring(0, 50) + '...');
    
    // DON'T clear stored responses immediately - they might still be needed for comparison
    // Only clear them when new responses start arriving (handled in capture handler)
    // This prevents race condition where comparison opens before new responses are captured
    console.log('💡 [IPC] Keeping previous stored responses until new ones arrive (prevents race condition)');
    console.log(`💡 [IPC] Current stored responses: ${Object.keys(workspaceState.storedResponses || {}).length} (will be replaced as new ones arrive)`);
    
    try {
        // Check if API mode is enabled
        if (useAPIMode && apiProxyClient) {
            console.log('🌐 [API Mode] Sending prompt via API proxy...');
            return await sendPromptViaAPI(prompt);
        } else {
            // Use BrowserView mode (existing behavior)
            console.log('🖥️ [BrowserView Mode] Sending prompt to BrowserViews...');
            const result = await sendPromptToPanes(prompt);
            console.log('✅ [IPC] sendPromptToPanes result:', result);
            return result;
        }
    } catch (error) {
        console.error('❌ [IPC] Error in send-prompt-to-all:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('send-prompt-to-selected', async (event, prompt, paneIndices) => {
    console.log('📤 Sending prompt to selected panes:', paneIndices);
    return await sendPromptToPanes(prompt, paneIndices);
});

ipcMain.handle('get-workspace-config', () => {
    return {
        panes: activePanes.map((p, i) => ({
            index: i,
            name: p.tool.name,
            icon: p.tool.icon,
            status: 'ready'
        })),
        mode: workspaceMode
    };
});

// Handle workspace mode switching (1-pane vs 2-pane)
ipcMain.handle('set-workspace-mode', async (event, mode) => {
    console.log(`🔄 [IPC] Setting workspace mode to: ${mode}`);
    workspaceMode = mode; // 'quick' (single-pane) or 'compare' (multi-pane)
    
    // Quick Chat mode - no constraints, let it display naturally
    if (mode === 'quick') {
        // Let the AI tools display naturally without any width constraints
        console.log(`✅ [set-workspace-mode] Quick Chat mode - panes will display naturally`);
        // No CSS or JavaScript constraints needed - let the AI tools use their natural layout
    }
    
    // Resize panes based on mode - call immediately and after a short delay
    resizePanes();
    
    // Resize panes based on mode - call immediately and after a short delay
    resizePanes();
    
    // Also call after a delay to ensure it takes effect
    setTimeout(() => {
        resizePanes();
        console.log(`✅ [IPC] Panes resized for ${mode} mode`);
    }, 100);
    
    return { success: true, mode: workspaceMode };
});

ipcMain.handle('return-to-toolshelf', async () => {
    console.log('🔄 Returning to toolshelf...');
    try {
        if (!mainWindow || mainWindow.isDestroyed()) {
            throw new Error('Main window not available');
        }
        
        // Aggressively remove all BrowserViews
        if (activePanes.length > 0) {
            console.log(`Removing ${activePanes.length} BrowserViews...`);
            
            // Create a copy of the array to avoid modification during iteration
            const panesToRemove = [...activePanes];
            
            for (const pane of panesToRemove) {
                try {
                    // Check if BrowserView exists and is not destroyed
                    if (pane.view) {
                        // BrowserView doesn't have isDestroyed(), check webContents instead
                        const isDestroyed = pane.view.webContents?.isDestroyed?.() || false;
                        if (isDestroyed) continue;
                        // Step 1: Hide by setting bounds to 0
                        try {
                            pane.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
                        } catch (e) {
                            console.warn('Could not set bounds to 0:', e);
                        }
                        
                        // Step 2: Remove from window
                        try {
                            mainWindow.removeBrowserView(pane.view);
                        } catch (e) {
                            console.warn('Could not remove BrowserView:', e);
                        }
                        
                        // Step 3: Destroy the webContents to ensure cleanup
                        try {
                            if (pane.view.webContents && !pane.view.webContents.isDestroyed()) {
                                pane.view.webContents.destroy();
                            }
                        } catch (e) {
                            console.warn('Could not destroy webContents:', e);
                        }
                        
                        console.log(`✅ Removed and destroyed pane: ${pane.tool.name}`);
                    }
                } catch (error) {
                    console.error(`Error removing pane ${pane.tool.name}:`, error);
                }
            }
        }
        
        // Clear the array immediately
        activePanes = [];
        
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Load toolshelf - use current theme
        const userTheme = getUserTheme();
        const themeFile = getThemeFile(userTheme);
        await mainWindow.loadFile(themeFile);
        console.log('✅ Toolshelf loaded successfully');
        
        // Focus and show the main window to bring it to the front
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
        
        // Force multiple repaints to ensure BrowserViews are gone
        mainWindow.webContents.invalidate();
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.invalidate();
            }
        }, 100);
        
        return { success: true };
    } catch (error) {
        console.error('❌ Error returning to toolshelf:', error);
        return {
            success: false,
            error: error.message || 'Failed to return to toolshelf'
        };
    }
});

// Theme management functions
function getUserTheme() {
    try {
        const themePath = path.join(app.getPath('userData'), 'theme.json');
        if (fs.existsSync(themePath)) {
            const data = fs.readFileSync(themePath, 'utf8');
            const theme = JSON.parse(data);
            return theme.theme || DEFAULT_THEME;
        }
    } catch (error) {
        console.error('Error reading theme:', error);
    }
    return DEFAULT_THEME;
}

function saveUserTheme(theme) {
    try {
        const themePath = path.join(app.getPath('userData'), 'theme.json');
        fs.writeFileSync(themePath, JSON.stringify({ theme }), 'utf8');
    } catch (error) {
        console.error('Error saving theme:', error);
    }
}

// IPC Handlers for theme
ipcMain.handle('get-theme', () => {
    return getUserTheme();
});

ipcMain.handle('set-theme', async (event, theme) => {
    if (THEMES[theme]) {
        saveUserTheme(theme);
        // Reload toolshelf with new theme
        if (mainWindow && !mainWindow.isDestroyed()) {
            const themeFile = getThemeFile(theme);
            await mainWindow.loadFile(themeFile);
        }
        return { success: true, theme };
    }
    return { success: false, error: 'Invalid theme' };
});

// Prompt bar visibility handlers - focus main window when prompt bar is shown
ipcMain.on('prompt-bar-shown', (event) => {
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Focus the main window to ensure prompt bar is interactive
            mainWindow.webContents.focus();
            
            // Scroll to bottom to ensure prompt bar is visible (especially for multi-row layouts)
            mainWindow.webContents.executeJavaScript(`
                (function() {
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: 'smooth'
                    });
                    console.log('📜 [prompt-bar-shown] Scrolled to bottom to show prompt bar');
                })();
            `).catch(() => {});
            
            console.log('✅ Prompt bar shown - main window focused and scrolled to bottom');
        }
    } catch (error) {
        console.error('❌ Error in prompt-bar-shown handler:', error);
    }
});

ipcMain.on('prompt-bar-hidden', (event) => {
    // No action needed when prompt bar is hidden
    console.log('✅ Prompt bar hidden');
});

// Store references to comparison windows
let comparisonWindows = new Map();
let activeComparisonWindow = null; // Track the most recent comparison window for dynamic updates

// ⚠️ EXTRACTION FUNCTION DISABLED FOR LEGAL/COMPLIANCE REASONS
// DOM scraping/extraction may violate:
// - Terms of Service of AI platforms (ChatGPT, Claude, Gemini, etc.)
// - Computer Fraud and Abuse Act (CFAA) in the US
// - Data protection laws (GDPR, CCPA, etc.)
// - Anti-scraping provisions
// - Copyright and intellectual property laws
//
// ✅ USE API APPROACH INSTEAD - This is the ONLY legitimate automated method
// ✅ MANUAL PASTE is the fallback when API is unavailable
//
// This function is kept for reference but should NOT be called
// If extraction is needed, it must be done with explicit user consent and legal review
async function extractResponseFromPane(pane) {
    // ⚠️ EXTRACTION DISABLED - DO NOT USE
    console.error('❌ [extractResponseFromPane] Extraction disabled for legal compliance');
    console.error('❌ [extractResponseFromPane] Use API approach or manual paste instead');
    return null;
    try {
        const webContents = pane.view.webContents;
        
        if (!webContents || webContents.isDestroyed()) {
            console.log(`⚠️ [extractResponseFromPane] WebContents not available for ${pane.tool.name}`);
            return null;
        }
        
        // Check if page is loaded
        const isReady = await webContents.executeJavaScript('document.readyState');
        if (isReady !== 'complete') {
            console.log(`⚠️ [extractResponseFromPane] Page not fully loaded for ${pane.tool.name}`);
            // Wait a bit and try again
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Execute JavaScript in the BrowserView to extract content (text + images)
        // This is user-initiated (they clicked "Compare"), so it's compliant
        // But we expect this to fail sometimes - that's why manual paste exists
        const extractedContent = await webContents.executeJavaScript(`
            (function() {
                // Helper: Clean HTML content from element, preserving images but removing UI
                function cleanElementHTML(el) {
                    if (!el) return { html: '', text: '' };
                    const clone = el.cloneNode(true);
                    
                    // Remove all script, style, and code elements (but keep their text content)
                    clone.querySelectorAll('script, style').forEach(n => n.remove());
                    
                    // Remove UI elements (buttons, nav, etc.) but preserve their text if needed
                    clone.querySelectorAll('button, nav, header, footer, aside, [class*="button"], [class*="nav"], [class*="sidebar"], [class*="menu"], [class*="toolbar"], [role="button"], [role="navigation"]').forEach(n => {
                        // Keep text content but remove element
                        const text = n.textContent || '';
                        if (text.trim().length > 0) {
                            const textNode = document.createTextNode(' ' + text + ' ');
                            n.parentNode.insertBefore(textNode, n);
                        }
                        n.remove();
                    });
                    
                    // Remove input fields and forms
                    clone.querySelectorAll('input, textarea, form, [class*="input"], [class*="form"]').forEach(n => n.remove());
                    
                    // Remove common chat UI elements
                    clone.querySelectorAll('[class*="chat-list"], [class*="conversation-list"], [class*="history"], [class*="sidebar"], [class*="thread"], [class*="nav"], [class*="header"], [class*="footer"]').forEach(n => n.remove());
                    
                    // Remove disclaimers and UI text patterns
                    clone.querySelectorAll('[class*="disclaimer"], [class*="warning"], [class*="notice"], [class*="cookie"], [class*="privacy"]').forEach(n => {
                        const text = n.textContent || '';
                        // Remove if it's just a disclaimer
                        if (/can make mistakes|double-check|privacy|cookie|terms|conditions/i.test(text)) {
                            n.remove();
                        }
                    });
                    
                    // Convert images to base64 or preserve URLs
                    const images = clone.querySelectorAll('img');
                    images.forEach(img => {
                        // Try to get image as base64
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        try {
                            // If image is loaded, convert to base64
                            if (img.complete && img.naturalWidth > 0) {
                                canvas.width = img.naturalWidth;
                                canvas.height = img.naturalHeight;
                                ctx.drawImage(img, 0, 0);
                                const dataURL = canvas.toDataURL('image/png');
                                img.src = dataURL;
                            } else {
                                // Keep original URL if can't convert
                                const originalSrc = img.src || img.getAttribute('src') || '';
                                if (originalSrc && !originalSrc.startsWith('data:')) {
                                    img.setAttribute('data-original-src', originalSrc);
                                }
                            }
                        } catch (e) {
                            // Keep original src if conversion fails
                            const originalSrc = img.src || img.getAttribute('src') || '';
                            if (originalSrc) {
                                img.setAttribute('data-original-src', originalSrc);
                            }
                        }
                    });
                    
                    // Get both HTML and text
                    const html = clone.innerHTML || '';
                    const text = clone.innerText || clone.textContent || '';
                    
                    // Clean text from JavaScript patterns and UI elements
                    let cleanedText = text
                        .replace(/window\\.[_a-zA-Z]+/g, '')
                        .replace(/requestAnimationFrame[^\\n]*/g, '')
                        .replace(/\\[object [^\\]]+\\]/g, '')
                        .replace(/function[^\\n]*\\{[^\\}]*\\}/g, '')
                        .replace(/console\\.[^\\n]*/g, '')
                        .replace(/\\$\\{[^\\}]+\\}/g, '')
                        .replace(/(Sign in|Log in|Sign up|Menu|Settings|Help|Contact|Privacy|Terms|Cookie|Accept|Decline|Skip|Next|Previous|Close|×|✕|New chat|Chats|Projects|Recents|Hide|Show|Edit|Delete|Share|Copy|Paste)[\\s\\n]*/gi, '')
                        // Remove common disclaimers
                        .replace(/(can make mistakes|double-check|verify|check important|see cookie|privacy policy|terms of service)[\\s\\n]*/gi, '')
                        // Remove chat history topics (lines that look like topic titles)
                        .replace(/^(Capital of|What is|Why|How|When|Where|Who|Meaning of|Location of|Causes of|Purpose of|Origins of|Timeline of)[\\s\\n]*/gmi, '')
                        // Remove standalone topic phrases (likely from chat history)
                        .replace(/^([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+)(\\s|\\n|$)/gm, '')
                        // Remove lines that are just topic names (very short, capitalized)
                        .replace(/^([A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)$/gm, '')
                        // Remove error messages
                        .replace(/(Cursor AI|file read error|chat history storage|Reverting file|Continuing previous conversation)[\\s\\n]*/gi, '')
                        .trim();
                    
                    return { html: html.trim(), text: cleanedText };
                }
                
                // Helper: Clean text only (for fallback)
                function cleanElementText(el) {
                    const result = cleanElementHTML(el);
                    return result.text;
                }
                
                // Strategy 1: Tool-specific selectors for LAST message only
                // Each AI tool has different DOM structure - target the actual last response
                const toolSpecificSelectors = [
                    // ChatGPT specific
                    '[data-testid*="conversation-turn"]:last-of-type [class*="markdown"]',
                    '[data-testid*="conversation-turn"]:last-child [class*="markdown"]',
                    '[data-testid*="conversation-turn"]:last-of-type [class*="prose"]',
                    
                    // Claude specific - look for last assistant message
                    '[class*="Message"]:last-of-type[class*="assistant"]',
                    '[class*="message"]:last-of-type[class*="assistant"]',
                    'article:last-of-type',
                    
                    // Gemini specific
                    '[class*="response"]:last-of-type',
                    '[class*="message"]:last-of-type:not([class*="user"])',
                    
                    // Generic but more specific
                    '[data-testid*="message"]:last-of-type [class*="markdown"]',
                    '[class*="message"][class*="assistant"]:last-of-type',
                    '[class*="response"][class*="assistant"]:last-of-type',
                    '[class*="message"]:last-of-type:not([class*="user"]):not([class*="human"]):not([class*="system"])',
                    '[class*="conversation"] [class*="message"]:last-of-type:not([class*="user"])',
                    '[class*="chat"] [class*="message"]:last-of-type:not([class*="user"])',
                    
                    // Fallback - last article in main
                    'main article:last-of-type',
                    'main [role="article"]:last-of-type'
                ];
                
                // Also try finding by position (last message in conversation)
                const positionBasedSelectors = [
                    '[data-testid*="conversation-turn"]:nth-last-child(1) [class*="markdown"]',
                    '[class*="message"]:nth-last-child(1):not([class*="user"])',
                    '[class*="response"]:nth-last-child(1)'
                ];
                
                const lastMessageSelectors = [...toolSpecificSelectors, ...positionBasedSelectors];
                
                let bestText = '';
                let bestLength = 0;
                
                let bestContent = { html: '', text: '', length: 0 };
                
                // Try each selector to find the most recent AI response
                for (const selector of lastMessageSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            // Get the LAST element (most recent response)
                            const lastElement = elements[elements.length - 1];
                            const cleaned = cleanElementHTML(lastElement);
                            
                            // Prefer longer, substantial content
                            if (cleaned.text.length > bestContent.length && cleaned.text.split(' ').length > 15) {
                                bestContent = {
                                    html: cleaned.html,
                                    text: cleaned.text,
                                    length: cleaned.text.length
                                };
                            }
                        }
                    } catch (e) {
                        // Continue to next selector
                    }
                }
                
                // Strategy 2: If we found good content, validate and clean it
                if (bestContent.text.length > 100 && bestContent.text.split(' ').length > 15) {
                    // Additional validation: Check if it's actually a response, not chat history
                    const text = bestContent.text;
                    const words = text.split(/\\s+/);
                    
                    // Filter out responses that are mostly topic names (chat history)
                    const topicPattern = /^(Capital|What|Why|How|When|Where|Who|Meaning|Location|Causes|Purpose|Origins|Timeline)/i;
                    const topicLines = text.split('\\n').filter(line => topicPattern.test(line.trim()));
                    const topicRatio = topicLines.length / Math.max(1, text.split('\\n').length);
                    
                    // If more than 30% of lines are topic names, it's likely chat history
                    if (topicRatio > 0.3) {
                        console.log('⚠️ Detected chat history pattern, filtering...');
                        // Try to extract just the actual response (last substantial paragraph)
                        const paragraphs = text.split(/\\n\\n+/).filter(p => p.trim().length > 50);
                        if (paragraphs.length > 0) {
                            const lastPara = paragraphs[paragraphs.length - 1];
                            // Check if last paragraph is actually a response (not a topic)
                            if (!topicPattern.test(lastPara.trim()) && lastPara.split(' ').length > 20) {
                                bestContent.text = lastPara;
                                bestContent.length = lastPara.length;
                            }
                        }
                    }
                    
                    // Clean up HTML
                    let cleanHTML = bestContent.html
                        .replace(/\\s+/g, ' ')
                        .replace(/\\n{3,}/g, '\\n\\n')
                        .replace(/^[\\s\\n]+|[\\s\\n]+$/g, '')
                        .trim();
                    
                    // Clean up text - remove remaining topic lines
                    let cleanText = bestContent.text
                        .split('\\n')
                        .filter(line => {
                            const trimmed = line.trim();
                            // Remove very short lines that are just topics
                            if (trimmed.length < 10) return false;
                            // Remove lines that are just topic names
                            if (topicPattern.test(trimmed) && trimmed.split(' ').length < 5) return false;
                            return true;
                        })
                        .join('\\n')
                        .replace(/\\s+/g, ' ')
                        .replace(/\\n{3,}/g, '\\n\\n')
                        .replace(/^[\\s\\n]+|[\\s\\n]+$/g, '')
                        .trim();
                    
                    // Final validation - must have substantial content
                    if (cleanText.length > 50 && cleanText.split(' ').length > 10) {
                        return {
                            html: cleanHTML,
                            text: cleanText,
                            hasImages: cleanHTML.includes('<img') || cleanHTML.includes('data:image')
                        };
                    }
                }
                
                // Strategy 3: Look for main content area, but focus on last message
                // Try to find the actual last response, not accumulated history
                const mainContent = document.querySelector('main, [role="main"], article, [class*="main"]');
                if (mainContent) {
                    // Get all potential response blocks
                    const allTextBlocks = Array.from(mainContent.querySelectorAll('p, div, section, [class*="message"], [class*="response"], article'));
                    
                    // Work backwards to find the last substantial response
                    for (let i = allTextBlocks.length - 1; i >= 0; i--) {
                        const block = allTextBlocks[i];
                        const cleaned = cleanElementHTML(block);
                        const text = cleaned.text;
                        
                        // Skip if it's just a topic name or disclaimer
                        if (text.length < 50) continue;
                        if (/^(Capital of|What is|Why|How|When|Where|Who|Meaning of|Location of|Causes of|Purpose of|Origins of|Timeline of)/i.test(text.trim())) continue;
                        if (/(can make mistakes|double-check|verify|check important|see cookie|privacy policy)/i.test(text) && text.split(' ').length < 20) continue;
                        
                        // Check if it's a substantial response
                        if (text.length > 100 && text.split(' ').length > 15) {
                            // Additional check: make sure it's not just a list of topics
                            const topicCount = (text.match(/^(Capital of|What is|Why|How|When|Where|Who|Meaning of|Location of|Causes of|Purpose of|Origins of|Timeline of)/gmi) || []).length;
                            const lineCount = text.split('\\n').length;
                            const topicRatio = topicCount / Math.max(1, lineCount);
                            
                            // If less than 20% are topics, it's likely a real response
                            if (topicRatio < 0.2) {
                                return {
                                    html: cleaned.html, // No truncation - capture full content
                                    text: cleaned.text, // No truncation - capture full content
                                    hasImages: cleaned.html.includes('<img') || cleaned.html.includes('data:image')
                                };
                            }
                        }
                    }
                }
                
                // Strategy 4: Last resort - get visible text but heavily filter
                const bodyText = document.body.innerText || document.body.textContent || '';
                if (bodyText.length > 200) {
                    // Split into lines and filter
                    const lines = bodyText.split('\\n')
                        .map(line => line.trim())
                        .filter(line => {
                            // Filter out UI patterns
                            if (line.length < 5) return false;
                            if (/^(Sign|Log|Menu|Settings|Help|Contact|Privacy|Terms|Cookie|Accept|Decline|Skip|Next|Previous|Close|×|✕|New chat|Chats|Projects|Recents|Hide|Show|Edit|Delete|Share|Copy|Paste)/i.test(line)) return false;
                            if (/window\\.|requestAnimationFrame|console\\.|function\\s*\\{/.test(line)) return false;
                            if (line.split(' ').length < 3) return false;
                            return true;
                        });
                    
                    const filtered = lines.join('\\n');
                    if (filtered.length > 100 && filtered.split(' ').length > 15) {
                        return {
                            html: '', // No HTML available in fallback
                            text: filtered
                                .replace(/\\s+/g, ' ')
                                .replace(/\\n{3,}/g, '\\n\\n')
                                .trim(), // No truncation - capture full content
                            hasImages: false
                        };
                    }
                }
                
                return { html: '', text: '', hasImages: false };
            })()
        `);
        
        // Handle extracted content (can be string for backward compatibility or object with html/text)
        if (extractedContent) {
            let html = '';
            let text = '';
            let hasImages = false;
            
            if (typeof extractedContent === 'string') {
                // Backward compatibility: old format (text only)
                text = extractedContent.trim();
            } else if (typeof extractedContent === 'object') {
                // New format: object with html, text, hasImages
                html = extractedContent.html || '';
                text = extractedContent.text || '';
                hasImages = extractedContent.hasImages || false;
            }
            
            // Validate content
            if (text.length > 50 && text.split(' ').length > 10) {
                console.log(`✅ [extractResponseFromPane] Extracted ${text.length} chars from ${pane.tool.name}${hasImages ? ' (with images)' : ''}`);
                // Return object with both HTML and text
                return {
                    text: text,
                    html: html || text, // Use HTML if available, fallback to text
                    hasImages: hasImages
                };
            }
        }
        
        console.log(`⚠️ [extractResponseFromPane] Insufficient content extracted from ${pane.tool.name}`);
        return null;
    } catch (error) {
        console.error(`❌ [extractResponseFromPane] Error extracting from ${pane.tool.name}:`, error.message);
        return null;
    }
}

// Comparison, Ranking, Synthesis IPC Handlers
ipcMain.handle('open-visual-comparison', async (event, options) => {
    // Set loading cursor on main window for user feedback
    // Use CSS injection since Electron doesn't have setCursor on BrowserWindow
    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Inject CSS to show wait cursor
            await mainWindow.webContents.executeJavaScript(`
                (function() {
                    const style = document.createElement('style');
                    style.id = 'loading-cursor-style';
                    style.textContent = '* { cursor: wait !important; }';
                    document.head.appendChild(style);
                })();
            `);
            console.log('⏳ [UI] Loading cursor (hourglass) activated via CSS');
        }
    } catch (e) {
        console.warn('⚠️ [UI] Could not set loading cursor:', e.message);
    }
    
    try {
        console.log('🎯 SIMPLE CAPTURE: Starting on-demand capture when Compare clicked...');
        
        // Send loading message to renderer for visual feedback
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('comparison-loading', {
                    status: 'capturing',
                    message: 'Capturing responses from AI tools...'
                });
            }
        } catch (e) {
            // Ignore if window is closed
        }
        
        // SIMPLE APPROACH: Just grab what's visible in each pane right now
        // No waiting, no complex logic - just extract text from DOM
        console.log('📋 [Capture] Simple extraction: grabbing visible responses from panes...');
        
        // GLOBAL SOLUTION: Get the actual prompt dynamically (not hardcoded!)
        const actualPrompt = workspaceState.lastPrompt || 'Where is Paris?';
        console.log(`📋 [Capture] Using dynamic prompt: "${actualPrompt}"`);
        
        // Escape prompt for regex (escape special regex characters)
        const escapedPrompt = actualPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const capturedResponses = {};
        
        for (const pane of activePanes) {
            const toolKey = pane.tool.name.toLowerCase();
            let response = '';
            
            if (!pane.view || !pane.view.webContents || typeof pane.view.webContents.isDestroyed !== 'function' || pane.view.webContents.isDestroyed()) {
                console.log(`⚠️ [Capture] Pane ${pane.tool.name} has no valid BrowserView`);
            } else {
                try {
                    const browserView = pane.view;
                    
                    // SIMPLE APPROACH: Shared prompt + DOM end-markers (keep it simple!)
                    // GLOBAL: Use actual prompt dynamically, not hardcoded
                    response = await browserView.webContents.executeJavaScript(`
                        (function() {
                            // STEP 1: Get all visible text (shared prompt approach - proven superior)
                            const bodyText = document.body.textContent || document.body.innerText || '';
                            
                            // GLOBAL: Use the actual prompt dynamically
                            const actualPrompt = ${JSON.stringify(actualPrompt)};
                            // Escape prompt for regex (escape special regex characters)
                            const escapedPrompt = actualPrompt.replace(/[.*+?^\\$\\{\\}\\(\\)\\|\\[\\]\\\\]/g, '\\$&');
                            
                            // DEBUG: Check if prompt exists and in what format
                            const promptPattern = new RegExp(escapedPrompt, 'i');
                            const promptIndex = bodyText.search(promptPattern);
                            
                            // If not found, try variations to understand the issue
                            if (promptIndex < 0) {
                                // Check what's actually in the text (first 500 chars for debugging)
                                const sampleText = bodyText.substring(0, 500).toLowerCase();
                                const promptLower = actualPrompt.toLowerCase();
                                const hasPromptWords = promptLower.split(' ').some(word => sampleText.includes(word));
                                
                                // Return diagnostic info instead of empty string
                                return JSON.stringify({
                                    error: 'prompt_not_found',
                                    bodyTextLength: bodyText.length,
                                    sampleText: bodyText.substring(0, 200),
                                    actualPrompt: actualPrompt,
                                    hasPromptWords: hasPromptWords,
                                    promptVariations: {
                                        withQuestion: bodyText.search(new RegExp(escapedPrompt, 'i')),
                                        withoutQuestion: bodyText.search(new RegExp(escapedPrompt.replace(/\\?$/, ''), 'i')),
                                        lowercase: bodyText.search(new RegExp(escapedPrompt.toLowerCase(), 'i')),
                                        lowercaseNoQ: bodyText.search(new RegExp(escapedPrompt.toLowerCase().replace(/\\?$/, ''), 'i'))
                                    }
                                });
                            }
                            
                            // Get text after the prompt (GLOBAL - same for all tools, uses actual prompt length)
                            let responseText = bodyText.substring(promptIndex + actualPrompt.length).trim();
                            
                            // GLOBAL FIX: Skip UI elements that appear immediately after prompt
                            // These patterns appear right after the actual prompt but before the actual response
                            
                            // First, remove zero-width spaces and other invisible characters
                            responseText = responseText.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
                            
                            const uiSkipPatterns = [
                                /^\\d+\\/\\d+/,  // "2/2", "1/3", etc. (page indicators)
                                /^Reviewed\\s+\\d+\\s+sources/i,  // "Reviewed 9 sources" (more flexible spacing)
                                /^\\s*$/,  // Just whitespace
                            ];
                            
                            // Skip over UI elements at the start (try multiple times to catch nested patterns)
                            let previousLength = responseText.length;
                            for (let i = 0; i < 5; i++) { // Max 5 iterations
                                for (const pattern of uiSkipPatterns) {
                                    const match = responseText.match(pattern);
                                    if (match) {
                                        responseText = responseText.substring(match[0].length).trim();
                                    }
                                }
                                // Stop if no change
                                if (responseText.length === previousLength) break;
                                previousLength = responseText.length;
                            }
                            
                            // Also skip common AI response prefixes that might be UI
                            const responseStartPatterns = [
                                /^(ChatGPT|Claude|DeepSeek|Perplexity) (said|says|responded|replied):/i,
                                /^(AI|Assistant) (said|says|responded|replied):/i,
                            ];
                            
                            for (const pattern of responseStartPatterns) {
                                const match = responseText.match(pattern);
                                if (match) {
                                    // Skip the prefix and take what comes after
                                    responseText = responseText.substring(match[0].length).trim();
                                    break; // Only skip first match
                                }
                            }
                            
                            // DIAGNOSTIC: If response is still too short, return diagnostic info
                            if (!responseText || responseText.length < 10) {
                                const diagnostic = {
                                    error: 'response_too_short',
                                    bodyTextLength: bodyText.length,
                                    promptIndex: promptIndex,
                                    promptFound: true,
                                    responseTextLength: responseText ? responseText.length : 0,
                                    responseText: responseText || '(empty)',
                                    textBeforePrompt: bodyText.substring(Math.max(0, promptIndex - 100), promptIndex),
                                    textAfterPrompt: bodyText.substring(promptIndex, Math.min(promptIndex + 300, bodyText.length)),
                                    first500Chars: bodyText.substring(0, 500)
                                };
                                return JSON.stringify(diagnostic);
                            }
                            
                            // STEP 3: Use DOM structure to find where buttons/icons start (end-markers)
                            // Find all button/icon elements in the DOM
                            const buttonSelectors = [
                                'button',
                                '[role="button"]',
                                'svg',
                                '[class*="icon"]',
                                '[class*="button"]',
                                '[class*="action"]',
                                '[class*="toolbar"]',
                                '[class*="controls"]',
                                '[aria-label*="copy"]',
                                '[aria-label*="share"]',
                                '[aria-label*="like"]',
                                '[aria-label*="dislike"]',
                                '[aria-label*="thumbs"]',
                                'input[type="text"]',
                                'textarea',
                                '[contenteditable="true"]'
                            ];
                            
                            // GLOBAL END-MARKER DETECTION: Look for patterns that ALWAYS appear at the END
                            // These are reliable indicators that the actual response has ended
                            // Strategy: Only match patterns in the LAST 30% of text to avoid false positives
                            let earliestEndMarker = responseText.length;
                            const minEndMarkerPosition = Math.max(100, Math.floor(responseText.length * 0.7)); // Last 30% of response
                            
                            // END-MARKERS that are ALWAYS at the end (only search in last 30% to avoid false positives)
                            // These patterns indicate the response has ended and UI has started
                            const endMarkerPatterns = [
                                // Input field labels (always at the very end)
                                /\\s+Ask a follow-up/i,
                                /\\s+\\+ Ask anything/i,
                                /\\s+Reply\\.\\.\\./i,
                                /\\s+Message (ChatGPT|Claude|DeepSeek|Perplexity)/i,
                                // Disclaimers (always at the end)
                                /\\s+ChatGPT can make mistakes/i,
                                /\\s+Claude is AI and can make mistakes/i,
                                /\\s+AI-generated.*for reference only/i,
                                // "Related" sections (always after response)
                                /\\s+Related\\s+/i,
                                // Citation markers followed by "Related"
                                /[a-z]+\\d+Related/i,
                                /[a-z]+\\+\\d+Related/i,
                                // Follow-up questions that are clearly UI (not content)
                                // Only match if they appear as standalone questions at the end
                                /\\s+Do you want (me to|to|me)\\?/i,
                                /\\s+Is this conversation helpful/i,
                                /\\s+Would you like me to.*\\?/i,
                                // Model version indicators
                                /\\s+Sonnet \\d+\\.\\d+/i,
                                // UI buttons and disclaimers (flexible patterns - allow optional whitespace)
                                /\\s*Deep Think/i,  // "Deep Think" (with or without leading space)
                                /\\s*Search\\s*$/i,  // "Search" at end (with or without leading space)
                                /\\s*Deep Think Search/i,  // Full button text (with or without leading space)
                                /\\s*One more step before you proceed/i,  // DeepSeek UI message (with or without leading space)
                                /\\s*AI-generated, for reference only/i,  // DeepSeek disclaimer (with or without leading space)
                                /Deep Think Search.*AI-generated.*for reference only/i,  // Combined pattern (catches the full contamination)
                                // UI elements and disclaimers
                                /\\s+Gemini can make mistakes/i,  // Gemini disclaimer
                                /\\s+Your privacy and Gemini/i,  // Gemini privacy text
                                /\\s+Opens in a new window/i,  // Gemini link text
                                /\\s+Sources Fast/i,  // Gemini "Sources" button
                                /\\s+Would you like me to create a map image/i,  // Gemini follow-up question
                                /\\s+Would you like me to find a map/i,  // Gemini follow-up: "Would you like me to find a map of..."
                                /\\s+or perhaps help you plan a route/i,  // Gemini follow-up: "or perhaps help you plan a route to get there"
                                /\\s+or perhaps help you plan a travel itinerary/i,  // Gemini follow-up: "or perhaps help you plan a travel itinerary to one of its cities"
                                /\\s+Would you like me to find more information/i,  // Gemini follow-up question
                                /\\s+or perhaps provide a list/i,  // Gemini follow-up question continuation
                                /\\s+Are you planning a trip/i,  // Gemini follow-up: "Are you planning a trip there..."
                                /\\s+or perhaps looking for a specific landmark/i,  // Gemini follow-up: "or perhaps looking for a specific landmark..."
                                /\\s+like Big Ben or the Tower of London/i,  // Gemini follow-up: "like Big Ben or the Tower of London"
                                /\\s+Ask Gemini/i,  // Gemini input field label
                                /\\s+Think Harder/i,  // Gemini "Think Harder" button
                                // Timestamps and tool calls
                                /\\d{1,2}:\\d{2}\\s*PM/i,  // Poe timestamps: "6:42 PM", "8:09 PM"
                                /\\d{1,2}:\\d{2}\\s*AM/i,  // Poe timestamps: "6:42 AM"
                                /\\d{1,2}Hamburg location\\d{1,2}:\\d{2}\\s*PM/i,  // Poe: "1Hamburg location8:09 PM"
                                /Assistant:/i,  // Poe: "Assistant:" prefix
                                /PMAssistant/i,  // Poe: "PMAssistant" prefix
                                /Speak@Eleven Labs/i,  // Poe tool call: "Speak@Eleven Labs-v2.5-Turbo"
                                /Drop files here/i,  // Poe file drop text
                                /Message.*$/i,  // Poe: "Message" input field
                            ];
                            
                            // Search for end-markers, prioritizing matches in the last 30% of text
                            // This prevents false positives from content that happens to contain these words
                            // Some patterns are ALWAYS end-markers (no position restriction), others only in last 30%
                            const alwaysEndMarkerPatterns = [
                                // UI buttons and disclaimers that are always at the end
                                /\\s*Deep Think Search/i,
                                /\\s*AI-generated, for reference only/i,
                                /\\s*One more step before you proceed/i,
                                /Deep Think Search.*AI-generated.*for reference only/i,
                            ];
                            
                            // First, check for patterns that are always end-markers (no position restriction)
                            for (const pattern of alwaysEndMarkerPatterns) {
                                const match = responseText.search(pattern);
                                if (match >= 0 && match < earliestEndMarker) {
                                    earliestEndMarker = match;
                                }
                            }
                            
                            // Then check other end-markers, but only in the last 30% of text
                            for (const pattern of endMarkerPatterns) {
                                // Skip patterns already checked above
                                const isAlwaysEndMarker = alwaysEndMarkerPatterns.some(dp => dp.toString() === pattern.toString());
                                if (isAlwaysEndMarker) continue;
                                
                                const match = responseText.search(pattern);
                                // Only use this match if it's in the last 30% of the text
                                if (match >= 0 && match >= minEndMarkerPosition && match < earliestEndMarker) {
                                    earliestEndMarker = match;
                                }
                            }
                            
                            // Use end-marker if found
                            if (earliestEndMarker < responseText.length) {
                                responseText = responseText.substring(0, earliestEndMarker).trim();
                            }
                            
                            // GLOBAL CODE DETECTION: Stop at JavaScript/CSS code patterns (PRIORITY - do this FIRST)
                            // These patterns indicate we've hit internal code, not the actual response
                            // Code detection is more reliable than button detection, so check it first
                            // CRITICAL: Code can appear anywhere, so no position threshold - cut immediately
                            const codePatterns = [
                                // JavaScript internal code patterns
                                /\\?\\._oai_SSR_HTML/i,  // Internal code: ?._oai_SSR_HTML=
                                /window\\._oai_/i,  // Internal code (catches all variations: window._oai_log, window._oai_SSR, etc.)
                                /window\\._oai_[a-zA-Z0-9_]*/i,  // Internal code: window._oai_log, window._oai_SSR, etc.
                                /window\\._oai_[a-zA-Z0-9_]*\\s*HTML/i,  // Internal code: window._oai_log HTML, window._oai_SSR_HTML
                                /window\\._oai_[a-zA-Z0-9_]*\\s*\\(/i,  // Internal code: window._oai_log(), window._oai_SSR()
                                /window\\._oai_[a-zA-Z0-9_]*\\s*HTML\\s*[?()]/i,  // Internal code: window._oai_log HTML?, window._oai_log HTML()
                                // Internal code patterns
                                /this\\.gbar_/i,  // Internal code: this.gbar_=this.gbar_ll{};(
                                /windowthis\\.gbar_/i,  // Internal code: windowthis.gbar_=this.gbar_ll{};(
                                /gbar_ll/i,  // Internal code
                                // React/JSX patterns (code contamination from React-based tools)
                                /\\$\\$typeof/i,  // React internals: $$typeof
                                /\\$L\\d+/i,  // React internals: $L25, $L26, etc.
                                /\\["\\$",\\s*"[^"]*",/i,  // React internals: ["$", "body", null, ...]
                                /\\["\\$",\\s*"script",/i,  // React script tags: ["$", "script", ...]
                                /\\["\\$",\\s*"link",/i,  // React link tags: ["$", "link", ...]
                                /\\["\\$",\\s*"div",/i,  // React div tags: ["$", "div", ...]
                                /\\["\\$",\\s*"span",/i,  // React span tags: ["$", "span", ...]
                                /\\[\\d+,\\s*"[^"]*",/i,  // React array patterns: [0, "text", ...]
                                /\\[\\d+,\\s*\\d+,\\s*"[^"]*"/i,  // React array patterns: [0, 1, "text", ...]
                                /self\\.self\\.self/i,  // React internals: self.self.self.self...
                                // JSON/config patterns (Grok contamination)
                                /"ry_time":true/i,  // Config: "ry_time":true
                                /"show_open_in_app_dialog_download_default":true/i,  // Config patterns
                                /"enable_code_execution":true/i,  // Config patterns
                                /"title":"[^"]*","description"/i,  // Config: "title":"...","description"
                                /"workspace Id"/i,  // Config: "workspace Id"
                                /"Cover Letter Writer"/i,  // Config: "Cover Letter Writer"
                                // Grok UI contamination patterns
                                /\\d+\\s+sources/i,  // "13 sources", "15 sources", etc.
                                /\\d+\\.\\d+s\\s+Fast/i,  // "1.4s Fast", "1.8s Fast", etc.
                                /Think Harder/i,  // "Think Harder" button
                                /Auto Upgrade to Super/i,  // "Auto Upgrade to Super" button
                                /alamy\\.com/i,  // URL contamination: "alamy.com"
                                /kids\\.nationalgeographic/i,  // URL contamination: "kids.nationalgeographic.com"
                                /britannica\\.com/i,  // URL contamination: "britannica.com"
                                /en\\.wikipedia/i,  // URL contamination: "en.wikipedia.org"
                                /stock\\.adobe/i,  // URL contamination: "stock.adobe.com"
                                /skylinescenes\\.com/i,  // URL contamination: "skylinescenes.com"
                                /ontheworldmap\\.com/i,  // URL contamination: "ontheworldmap.com"
                                // Generic URL patterns (catch domain names that indicate UI contamination)
                                // Make pattern more specific: require http:// or https:// or www. prefix to avoid false positives
                                /(https?:\\/\\/|www\\.)[a-z0-9-]+\\.(com|org|net|edu|gov|io|co\\.uk)\\s*[a-z]/i,  // Domain with protocol followed by text (URL contamination)
                                /(https?:\\/\\/|www\\.)[a-z0-9-]+\\.(com|org|net|edu|gov|io|co\\.uk)\\s*:/i,  // Domain with protocol followed by colon (URL list)
                                /Zollverein Coal Mine/i,  // UI suggestion: "Zollverein Coal Mine history"
                                /Dortmund city overview/i,  // UI suggestion: "Dortmund city overview"
                                /The Belgian flag/i,  // UI text: "The Belgian flag (vertical black, yellow, and red stripes)"
                                /Views of.*the capital/i,  // UI text: "Views of Brussels, the capital"
                                /_next_f\\.push/i,  // React internals: _next_f.push
                                /self\\._next_f/i,  // React internals: self._next_f
                                /"show_streaming_response_pivot_button"/i,  // React config: "show_streaming_response_pivot_button":true
                                /"enable_imagine_query_bar_v2"/i,  // React config
                                /"enable_memory_v2_management"/i,  // React config
                                /"hide_map_during_tiles_load"/i,  // React config
                                /\\(self\\._next_f=self\\._next_f/i,  // React internals: (self._next_f=self._next_f||[]).push
                                /\\[0\\]self\\.__/i,  // React internals: [0]self.__
                                /"nonce":"[^"]*"/i,  // React nonce attributes
                                /Date\\.now\\(\\)/i,  // Date.now() calls
                                /requestAnimationFrame/i,  // requestAnimationFrame calls
                                /document\\.(addEventListener|removeEventListener|getElementById|querySelector|createElement)/i,  // DOM manipulation
                                /function\\s*\\([^)]*\\)\\s*\\{/i,  // Function definitions
                                /if\\s*\\([^)]*\\)\\s*\\{[^}]*\\}/i,  // If statements
                                /var\\s+[a-zA-Z_$][a-zA-Z0-9_$]*\\s*=/i,  // Variable declarations
                                /\\(function\\s*\\([^)]*\\)\\s*\\{[^}]*\\}\\)\\s*\\(\\)/i,  // IIFE patterns
                                // CSS patterns
                                /@keyframes/i,  // CSS animations (@keyframes intercom-lightweight-app-launcher)
                                /@media/i,  // CSS media queries
                                /\\.intercom-/i,  // Intercom CSS classes (.intercom-lightweight-app)
                                /from\\s*\\{/i,  // CSS animation keyframes (from { opacity: 0; })
                                /to\\s*\\{/i,  // CSS animation keyframes (to { opacity: 1; })
                                /opacity:\\s*[01];/i,  // CSS opacity declarations (common in animations)
                                /transform:\\s*scale/i,  // CSS transform (transform: scale(0.5))
                                /\\{[^}]*opacity[^}]*\\}/i,  // CSS blocks with opacity
                            ];
                            
                            let earliestCodeIndex = responseText.length;
                            // GLOBAL CODE DETECTION: No minimum threshold - code is ALWAYS an end-marker, even if it appears early
                            // This catches all code contamination patterns (ChatGPT window._oai_, Grok React/JSX, Gemini gbar_, etc.)
                            // Limit search to first 10k chars as safety measure for massive contamination (reduced from 20k for better detection)
                            const maxSearchLength = 10000;
                            const searchText = responseText.length > maxSearchLength ? responseText.substring(0, maxSearchLength) : responseText;
                            
                            for (const pattern of codePatterns) {
                                const match = searchText.search(pattern);
                                if (match >= 0 && match < earliestCodeIndex) {
                                    earliestCodeIndex = match;
                                }
                            }
                            
                            // Cut at code if found (code is a reliable end-marker, no matter where it appears)
                            if (earliestCodeIndex < responseText.length) {
                                responseText = responseText.substring(0, earliestCodeIndex).trim();
                            } else if (responseText.length > maxSearchLength) {
                                // If no code found but response is very long, cut at maxSearchLength as safety measure
                                // This prevents massive contamination from any tool
                                responseText = responseText.substring(0, maxSearchLength).trim();
                            }
                            
                            // Note: End-marker detection (above) handles UI elements that appear at the END
                            // Code detection (below) handles JavaScript contamination
                            // No need for additional button detection - it was causing false positives
                            
                            // Clean up whitespace
                            responseText = responseText
                                .split('\\n')
                                .map(line => line.trim())
                                .filter(line => line.length > 0)
                                .join('\\n')
                                .replace(/\\s{3,}/g, ' ')
                                .trim();
                            
                            // FINAL CHECK: If after all processing, response is too short, return diagnostic
                            if (!responseText || responseText.length < 10) {
                                return JSON.stringify({
                                    error: 'response_too_short_after_processing',
                                    bodyTextLength: bodyText.length,
                                    promptIndex: promptIndex,
                                    finalResponseLength: responseText ? responseText.length : 0,
                                    finalResponseText: responseText || '(empty)',
                                    textBeforePrompt: bodyText.substring(Math.max(0, promptIndex - 100), promptIndex),
                                    textAfterPrompt: bodyText.substring(promptIndex, Math.min(promptIndex + 300, bodyText.length)),
                                    first500Chars: bodyText.substring(0, 500)
                                });
                            }
                            
                            return responseText;
                        })();
                    `);
                    
                    // SIMPLE CLEANING: DOM extraction already stops at buttons, so just clean inline content
                    // Check if response is diagnostic JSON (prompt not found)
                    console.log(`🔍 [Capture] Raw response for ${pane.tool.name}: type=${typeof response}, length=${response ? response.length : 0}, startsWith=${response ? response.substring(0, 50) : 'null'}`);
                    
                    if (response && typeof response === 'string' && response.trim().startsWith('{"error"')) {
                        try {
                            const diagnostic = JSON.parse(response);
                            console.log(`🔍 [Capture] DIAGNOSTIC for ${pane.tool.name}:`, diagnostic.error);
                            console.log(`   BodyText length: ${diagnostic.bodyTextLength}`);
                            
                            if (diagnostic.error === 'prompt_not_found') {
                                console.log(`   Sample text: ${diagnostic.sampleText}`);
                                console.log(`   Has "where": ${diagnostic.hasWhere}, "paris": ${diagnostic.hasParis}, " is ": ${diagnostic.hasIs}`);
                                console.log(`   Prompt variations:`, diagnostic.promptVariations);
                            } else if (diagnostic.error === 'response_too_short' || diagnostic.error === 'response_too_short_after_processing') {
                                console.log(`   ⚠️ PROMPT FOUND but response too short!`);
                                console.log(`   Prompt index: ${diagnostic.promptIndex}`);
                                console.log(`   Response text (${diagnostic.responseTextLength || diagnostic.finalResponseLength} chars): "${diagnostic.responseText || diagnostic.finalResponseText}"`);
                                console.log(`   Text before prompt: "${diagnostic.textBeforePrompt}"`);
                                console.log(`   Text after prompt: "${diagnostic.textAfterPrompt}"`);
                                console.log(`   First 500 chars of bodyText: "${diagnostic.first500Chars}"`);
                            }
                            response = '';
                        } catch (e) {
                            console.log(`⚠️ [Capture] Could not parse diagnostic for ${pane.tool.name}:`, e.message);
                            console.log(`   Response was: ${response.substring(0, 200)}`);
                        }
                    } else if (!response || response.length === 0) {
                        console.log(`⚠️ [Capture] Empty response for ${pane.tool.name} - prompt likely not found in bodyText`);
                    }
                    
                    if (response && response.length > 0) {
                        const originalLength = response.length;
                        const originalResponse = response; // Keep original for fallback
                        
                        // Step 1: Find the question and take everything after it (if present)
                        // GLOBAL: Use actual prompt dynamically
                        const actualPrompt = workspaceState.lastPrompt || 'Where is Paris?';
                        const escapedPrompt = actualPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const questionIndex = response.search(new RegExp(escapedPrompt, 'i'));
                        if (questionIndex >= 0) {
                            response = response.substring(questionIndex + actualPrompt.length).trim();
                        }
                        
                        // Step 2: Remove timestamps at start
                        response = response.replace(/^\d{1,2}:\d{2}/, '');
                        
                        // Step 3: Remove duplicate sentences (handle multiple versions)
                        const sentences = response.split(/(?<=[.!?])\s+/);
                        const seen = new Set();
                        const uniqueSentences = [];
                        for (const sentence of sentences) {
                            const normalized = sentence.trim().toLowerCase();
                            // Skip if we've seen this sentence before (allowing for minor variations)
                            if (normalized.length > 20 && seen.has(normalized)) {
                                continue;
                            }
                            if (normalized.length > 20) {
                                seen.add(normalized);
                            }
                            uniqueSentences.push(sentence.trim());
                        }
                        response = uniqueSentences.join(' ').trim();
                        
                        // Step 4: Remove inline citation markers (but keep the content)
                        response = response.replace(/\s+[a-z]+\+\d+/gi, '');
                        response = response.replace(/\s+\[\d+\]/g, '');
                        response = response.replace(/Reviewed \d+ sources\s*>/gi, '');
                        
                        // Step 5: Remove obvious UI text that might have leaked through
                        response = response.replace(/\b(New chat|Chats|Projects|Artifacts|Code|Recents|Hide|Today|Daniel Jones)\b/gi, '');
                        
                        // Step 5.5: AGGRESSIVE CODE/JAVASCRIPT REMOVAL (GLOBAL - for all tools)
                        // Detect and remove JavaScript code patterns that leak through
                        // CRITICAL: If we find code patterns, cut everything from that point forward
                        const codeStartPatterns = [
                            /window\._oai_/i,
                            /Date\.now\(\)/i,
                            /requestAnimationFrame/i,
                            /document\.(addEventListener|getElementById|querySelector)/i,
                            /function\s*\([^)]*\)\s*\{/i,
                        ];
                        
                        let codeStartIndex = response.length;
                        // Code detection: No minimum threshold - code is ALWAYS an end-marker
                        for (const pattern of codeStartPatterns) {
                            const match = response.search(pattern);
                            if (match >= 0 && match < codeStartIndex) {
                                codeStartIndex = match;
                            }
                        }
                        
                        // If code found, cut everything from that point (no matter where it appears)
                        if (codeStartIndex < response.length) {
                            response = response.substring(0, codeStartIndex).trim();
                        }
                        
                        // Also remove any remaining code fragments (aggressive cleanup)
                        // BUT: Only match actual JavaScript/CSS patterns, not normal English text
                        response = response.replace(/window\._oai_[^\n\.!?]*/gi, '');
                        response = response.replace(/window\\._oai_[^\n\.!?]*/gi, ''); // Double-escaped version
                        response = response.replace(/Date\.now\(\)[^\n\.!?]*/gi, '');
                        response = response.replace(/requestAnimationFrame[^\n\.!?]*/gi, '');
                        // CSS pattern removal (DeepSeek contamination)
                        response = response.replace(/@keyframes[^\n]*\{[^}]*\}/gi, ''); // @keyframes blocks
                        response = response.replace(/@media[^\n]*\{[^}]*\}/gi, ''); // @media blocks
                        response = response.replace(/\.intercom-[^\n\.!?]*/gi, ''); // Intercom CSS classes
                        response = response.replace(/from\s*\{[^}]*\}/gi, ''); // CSS from { }
                        response = response.replace(/to\s*\{[^}]*\}/gi, ''); // CSS to { }
                        response = response.replace(/\{[^}]*opacity[^}]*\}/gi, ''); // CSS blocks with opacity
                        response = response.replace(/\{[^}]*transform[^}]*\}/gi, ''); // CSS blocks with transform
                        // Remove JavaScript code patterns (but NOT normal English text)
                        // Only match if followed by JavaScript identifiers/methods (not normal words)
                        response = response.replace(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*|_oai_)[^\n\.!?]*/gi, '');
                        response = response.replace(/document\.(addEventListener|removeEventListener|getElementById|querySelector|createElement|body|head)[^\n\.!?]*/gi, '');
                        
                        // Pattern 2: Function definitions and calls (document.addEventListener, etc.)
                        response = response.replace(/document\.(addEventListener|removeEventListener|getElementById|querySelector|createElement)\s*\([^)]*\)/gi, '');
                        response = response.replace(/window\.(addEventListener|removeEventListener)\s*\([^)]*\)/gi, '');
                        
                        // Pattern 3: JavaScript code blocks (if/else, function(), var/let/const declarations)
                        response = response.replace(/if\s*\([^)]*\)\s*\{[^}]*\}/g, '');
                        response = response.replace(/else\s*if\s*\([^)]*\)\s*\{[^}]*\}/g, '');
                        response = response.replace(/else\s*\{[^}]*\}/g, '');
                        response = response.replace(/function\s*\([^)]*\)\s*\{[^}]*\}/g, '');
                        response = response.replace(/(var|let|const)\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*[^;]+;/g, '');
                        
                        // Pattern 4: JavaScript object/array patterns
                        response = response.replace(/\{[^}]*\}/g, (match) => {
                            // Only remove if it looks like code (has colons, quotes, etc.)
                            if (match.includes(':') && (match.includes('"') || match.includes("'") || match.includes('function'))) {
                                return '';
                            }
                            return match;
                        });
                        
                        // Pattern 5: JavaScript method chains and property access
                        response = response.replace(/[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)/g, (match) => {
                            // Only remove if it looks like code (has parentheses with complex args)
                            if (match.includes('(') && match.length > 30) {
                                return '';
                            }
                            return match;
                        });
                        
                        // Pattern 6: Remove lines that are mostly code (high ratio of special chars)
                        const lines = response.split('\n');
                        const cleanedLines = lines.filter(line => {
                            const trimmed = line.trim();
                            if (trimmed.length === 0) return true;
                            
                            // Count special characters typical of code
                            const specialChars = (trimmed.match(/[{}();=<>\[\]\/\\]/g) || []).length;
                            const totalChars = trimmed.length;
                            
                            // If more than 30% special chars, it's likely code
                            if (specialChars / totalChars > 0.3) {
                                return false;
                            }
                            
                            // Remove lines with common code patterns
                            if (/^(var|let|const|function|if|else|return|window\.|document\.)/.test(trimmed)) {
                                return false;
                            }
                            
                            return true;
                        });
                        response = cleanedLines.join('\n').trim();
                        
                        // Pattern 7: Remove UI contamination that appears after the response
                        // Remove "Reviewed X sources" if it appears in the middle/end (should only be at start)
                        response = response.replace(/\s+Reviewed\s+\d+\s+sources\s*/gi, ' ');
                        
                        // Remove "Related" sections and follow-up questions (Perplexity, ChatGPT, etc.)
                        response = response.replace(/\s+Related\s+.*$/i, '');
                        // Remove citation markers followed by "Related"
                        response = response.replace(/[a-z]+\d+Related.*$/gi, ''); // "wikipedia10Related"
                        response = response.replace(/[a-z]+\+\d+Related.*$/gi, ''); // "britannica+310Related"
                        // Remove follow-up questions (catch all variations)
                        response = response.replace(/\s+How far is.*$/i, '');
                        response = response.replace(/\s+What (arrondissement|county|region|major|are).*$/i, '');
                        response = response.replace(/\s+Which (region|county|major).*$/i, '');
                        response = response.replace(/\s+How long does it take.*$/i, '');
                        response = response.replace(/\s+Ask a follow-up.*$/i, '');
                        // Remove follow-up questions
                        response = response.replace(/\s+Do you want (me to|to|me).*$/i, '');
                        response = response.replace(/\s+Is this conversation helpful.*$/i, '');
                        response = response.replace(/\s+Would you like.*$/i, '');
                        response = response.replace(/\s+If you want.*$/i, '');
                        response = response.replace(/\s+Can I help.*$/i, '');
                        
                        // Remove citation markers that appear at the end
                        response = response.replace(/[a-z]+\+\d+\s*$/gi, ''); // "britannica+1"
                        response = response.replace(/[a-z]+\d+\s*$/gi, ''); // "wikipedia10" (no + sign)
                        response = response.replace(/\.wikipedia\d*\s*$/gi, ''); // ".wikipedia10" (with dot)
                        
                        // Remove repeated disclaimers
                        response = response.replace(/\s*Claude is AI and can make mistakes\. Please double-check responses\.\s*/gi, '');
                        response = response.replace(/\s*Sonnet \d+\.\d+\s*/gi, '');
                        response = response.replace(/\s*Share\s*$/i, '');
                        
                        // Remove UI contamination (fallback if end-marker detection missed it)
                        // Make patterns more aggressive - match with or without leading whitespace
                        response = response.replace(/\s*Deep Think Search.*$/i, ''); // UI button text
                        response = response.replace(/\s*AI-generated, for reference only.*$/i, ''); // UI disclaimer
                        response = response.replace(/\s*One more step before you proceed.*$/i, ''); // UI message
                        // Combined pattern to catch the full contamination string
                        response = response.replace(/Deep Think Search.*AI-generated.*for reference only.*One more step.*$/i, ''); // Full contamination block
                        
                        // Remove UI contamination
                        response = response.replace(/\s+Gemini can make mistakes.*$/i, ''); // UI disclaimer
                        response = response.replace(/\s+Your privacy and Gemini.*$/i, ''); // UI privacy text
                        response = response.replace(/\s+Opens in a new window.*$/i, ''); // UI link text
                        response = response.replace(/\s+Would you like me to find more information.*$/i, ''); // UI follow-up
                        response = response.replace(/\s+or perhaps provide a list.*$/i, ''); // UI follow-up continuation
                        response = response.replace(/\s+Are you planning a trip.*$/i, ''); // Gemini follow-up: "Are you planning a trip there..."
                        response = response.replace(/\s+or perhaps looking for a specific landmark.*$/i, ''); // Gemini follow-up: "or perhaps looking for a specific landmark..."
                        response = response.replace(/\s+like Big Ben or the Tower of London.*$/i, ''); // Gemini follow-up: "like Big Ben or the Tower of London"
                        response = response.replace(/\s+Would you like me to find a map.*$/i, ''); // Gemini follow-up: "Would you like me to find a map of..."
                        response = response.replace(/\s+or perhaps help you plan a route.*$/i, ''); // Gemini follow-up: "or perhaps help you plan a route to get there"
                        response = response.replace(/\s+or perhaps help you plan a travel itinerary.*$/i, ''); // Gemini follow-up: "or perhaps help you plan a travel itinerary to one of its cities"
                        response = response.replace(/\s+Ask Gemini.*$/i, ''); // UI input field
                        response = response.replace(/\s+Think Harder.*$/i, ''); // UI button
                        response = response.replace(/windowthis\.gbar_.*$/i, ''); // Internal code: windowthis.gbar_=this.gbar_ll{};(
                        response = response.replace(/this\.gbar_.*$/i, ''); // Internal code: this.gbar_=this.gbar_ll{};(
                        response = response.replace(/gbar_ll.*$/i, ''); // Internal code
                        
                        // Remove UI contamination
                        response = response.replace(/\d{1,2}:\d{2}\s*PM.*$/i, ''); // UI timestamps: "6:42 PM", "8:09 PM"
                        response = response.replace(/\d{1,2}:\d{2}\s*AM.*$/i, ''); // UI timestamps: "6:42 AM"
                        response = response.replace(/\d{1,2}Hamburg location\d{1,2}:\d{2}\s*PM.*$/i, ''); // UI timestamp contamination
                        response = response.replace(/^Assistant:\s*/i, ''); // UI prefix at start
                        response = response.replace(/^PMAssistant\s*/i, ''); // UI prefix at start
                        response = response.replace(/Speak@Eleven Labs.*$/i, ''); // UI tool call
                        response = response.replace(/Drop files here.*$/i, ''); // UI file drop text
                        response = response.replace(/\s+Message.*$/i, ''); // UI input field
                        // Remove Gemini follow-up questions
                        response = response.replace(/\s+Are you planning a trip.*$/i, ''); // Gemini follow-up: "Are you planning a trip there..."
                        response = response.replace(/\s+or perhaps looking for a specific landmark.*$/i, ''); // Gemini follow-up: "or perhaps looking for a specific landmark..."
                        response = response.replace(/\s+like Big Ben or the Tower of London.*$/i, ''); // Gemini follow-up: "like Big Ben or the Tower of London"
                        
                        // Remove React/JSX code contamination (global - catches all React-based tools)
                        response = response.replace(/\$\$typeof.*$/i, ''); // React internals
                        response = response.replace(/\$L\d+.*$/i, ''); // React internals: $L25, $L26
                        response = response.replace(/\["\$",\s*"[^"]*",.*$/i, ''); // React internals: ["$", "body", ...
                        response = response.replace(/\["\$",\s*"div",.*$/i, ''); // React internals: ["$", "div", ...
                        response = response.replace(/\["\$",\s*"span",.*$/i, ''); // React internals: ["$", "span", ...
                        response = response.replace(/\[\d+,\s*"[^"]*",.*$/i, ''); // React array patterns: [0, "text", ...
                        response = response.replace(/\[\d+,\s*\d+,\s*"[^"]*".*$/i, ''); // React array patterns: [0, 1, "text", ...
                        response = response.replace(/self\.self\.self.*$/i, ''); // React internals: self.self.self...
                        // Remove JSON/config contamination (Grok)
                        response = response.replace(/"ry_time":true.*$/i, ''); // Config: "ry_time":true
                        response = response.replace(/"show_open_in_app_dialog_download_default":true.*$/i, ''); // Config
                        response = response.replace(/"enable_code_execution":true.*$/i, ''); // Config
                        response = response.replace(/"title":"[^"]*","description".*$/i, ''); // Config: "title":"...","description"
                        response = response.replace(/"workspace Id".*$/i, ''); // Config: "workspace Id"
                        response = response.replace(/"Cover Letter Writer".*$/i, ''); // Config: "Cover Letter Writer"
                        response = response.replace(/_next_f\.push.*$/i, ''); // Grok: _next_f.push
                        response = response.replace(/self\._next_f.*$/i, ''); // Grok: self._next_f
                        response = response.replace(/"show_streaming_response_pivot_button".*$/i, ''); // Grok config
                        response = response.replace(/"enable_imagine_query_bar_v2".*$/i, ''); // Grok config
                        response = response.replace(/"enable_memory_v2_management".*$/i, ''); // Grok config
                        response = response.replace(/"hide_map_during_tiles_load".*$/i, ''); // Grok config
                        response = response.replace(/\(self\._next_f=self\._next_f.*$/i, ''); // Grok: (self._next_f=self._next_f||[]).push
                        response = response.replace(/\[0\]self\.__.*$/i, ''); // Grok: [0]self.__
                        response = response.replace(/"nonce":"[^"]*".*$/i, ''); // React nonce attributes
                        // Remove Grok UI contamination
                        response = response.replace(/\d+\s+sources.*$/i, ''); // "13 sources", "15 sources", etc.
                        response = response.replace(/\d+\.\d+s\s+Fast.*$/i, ''); // "1.4s Fast", "1.8s Fast", etc.
                        response = response.replace(/Think Harder.*$/i, ''); // "Think Harder" button
                        response = response.replace(/Auto Upgrade to Super.*$/i, ''); // "Auto Upgrade to Super" button
                        response = response.replace(/alamy\.com.*$/i, ''); // URL contamination: "alamy.com"
                        response = response.replace(/kids\.nationalgeographic.*$/i, ''); // URL contamination: "kids.nationalgeographic.com"
                        response = response.replace(/britannica\.com.*$/i, ''); // URL contamination: "britannica.com"
                        response = response.replace(/en\.wikipedia.*$/i, ''); // URL contamination: "en.wikipedia.org"
                        response = response.replace(/stock\.adobe.*$/i, ''); // URL contamination: "stock.adobe.com"
                        response = response.replace(/skylinescenes\.com.*$/i, ''); // URL contamination: "skylinescenes.com"
                        response = response.replace(/ontheworldmap\.com.*$/i, ''); // URL contamination: "ontheworldmap.com"
                        // Remove generic URL patterns (but be careful not to remove normal text)
                        // Only match URLs with protocol or www prefix to avoid false positives (e.g., "NIH" in text)
                        response = response.replace(/\s+(https?:\/\/|www\.)[a-z0-9-]+\.(com|org|net|edu|gov|io|co\.uk)\s*/gi, ' '); // Generic domain patterns with protocol
                        response = response.replace(/Zollverein Coal Mine.*$/i, ''); // UI suggestion: "Zollverein Coal Mine history"
                        response = response.replace(/Dortmund city overview.*$/i, ''); // UI suggestion: "Dortmund city overview"
                        response = response.replace(/The Belgian flag.*$/i, ''); // UI text: "The Belgian flag (vertical black, yellow, and red stripes)"
                        response = response.replace(/Views of.*the capital.*$/i, ''); // UI text: "Views of Brussels, the capital"
                        
                        // Remove code contamination (aggressive - catch all variations)
                        response = response.replace(/\?\._oai_SSR_HTML=.*$/i, '');
                        response = response.replace(/\\?\\._oai_SSR_HTML.*$/i, ''); // Double-escaped for safety
                        response = response.replace(/window\._oai_.*$/i, '');
                        // Also remove any remaining _oai_ patterns
                        response = response.replace(/[^a-zA-Z]_oai_[a-zA-Z0-9_]*.*$/i, '');
                        
                        // Remove trailing punctuation contamination (ChatGPT: "?." at the end)
                        response = response.replace(/\?\.\s*$/, '.'); // Replace "?." with "."
                        response = response.replace(/\?\s*$/, '.'); // Replace trailing "?" with "."
                        response = response.replace(/\.{2,}\s*$/, '.'); // Replace multiple periods with single period
                        response = response.replace(/\s+$/, ''); // Remove trailing whitespace
                        
                        // Step 6: Fix spacing and formatting (especially for DeepSeek)
                        // Fix missing spaces after colons (e.g., "Country:France" -> "Country: France")
                        response = response.replace(/([a-zA-Z]):([A-Z])/g, '$1: $2');
                        response = response.replace(/([a-zA-Z]):([a-z])/g, '$1: $2');
                        // Fix missing spaces after periods
                        response = response.replace(/([a-z])\.([A-Z])/g, '$1. $2');
                        // Fix missing spaces between words (e.g., "CountryFrance" -> "Country France")
                        response = response.replace(/([a-z])([A-Z])/g, '$1 $2');
                        // Fix bullet points formatting
                        response = response.replace(/•\\s*/g, '• ');
                        response = response.replace(/\\s{2,}/g, ' ').trim();
                        response = response.replace(/\n{2,}/g, '\n').trim();
                        
                        if (originalLength !== response.length) {
                            console.log(`🧹 [Capture] Cleaned ${pane.tool.name}: ${originalLength} → ${response.length} chars`);
                        }
                        
                        // SAFEGUARD: If cleaning removed everything, something went wrong
                        // Restore a portion of the original (first 80% before cleaning) to prevent total loss
                        if (response.length === 0 && originalResponse.length > 0) {
                            console.log(`⚠️ [Capture] ${pane.tool.name}: Cleaning removed everything! Restoring original...`);
                            // Take first 80% of original (before any cleaning) as fallback
                            const fallbackLength = Math.floor(originalResponse.length * 0.8);
                            response = originalResponse.substring(0, fallbackLength).trim();
                            console.log(`🔄 [Capture] ${pane.tool.name}: Restored ${response.length} chars from original`);
                        }
                    }
                    
                    if (response && response.length > 50) {
                        console.log(`✅ [Capture] Extracted ${pane.tool.name}: ${response.length} chars`);
                    } else {
                        console.log(`⚠️ [Capture] No response found for ${pane.tool.name}`);
                        response = '';
                    }
                } catch (error) {
                    console.error(`❌ [Capture] Error extracting ${pane.tool.name}:`, error.message);
                    console.error(`   Error details:`, error.stack);
                    // For Mistral and other tools that might have script execution issues,
                    // try a simpler fallback extraction
                    if (pane.tool.name === 'Mistral' || error.message.includes('Script failed to execute')) {
                        console.log(`   🔄 [Capture] Attempting fallback extraction for ${pane.tool.name}...`);
                        try {
                            // Check if pane.view exists and is not destroyed
                            if (!pane.view || typeof pane.view.isDestroyed !== 'function' || pane.view.isDestroyed() || !pane.view.webContents || typeof pane.view.webContents.isDestroyed !== 'function' || pane.view.webContents.isDestroyed()) {
                                console.error(`   ❌ [Capture] Cannot use fallback for ${pane.tool.name}: view destroyed`);
                                response = '';
                            } else {
                                // Simple fallback: try multiple strategies to find response
                                const fallbackResponse = await pane.view.webContents.executeJavaScript(`
                                    (function() {
                                        try {
                                            // Strategy 1: Try to find prompt in body text (case-insensitive)
                                            const bodyText = document.body.textContent || document.body.innerText || '';
                                            const prompt = ${JSON.stringify(actualPrompt)};
                                            const promptLower = prompt.toLowerCase();
                                            const bodyTextLower = bodyText.toLowerCase();
                                            let promptIndex = bodyTextLower.indexOf(promptLower);
                                            
                                            // Strategy 2: If prompt not found, try to find response in common message containers
                                            if (promptIndex < 0) {
                                                // Look for message containers (common in chat UIs) - more aggressive search
                                                const selectors = [
                                                    '[class*="message"]',
                                                    '[class*="response"]',
                                                    '[class*="content"]',
                                                    '[class*="chat"]',
                                                    '[class*="assistant"]',
                                                    '[class*="answer"]',
                                                    '[class*="reply"]',
                                                    'article',
                                                    'main > div',
                                                    '[role="article"]',
                                                    '[role="main"] > div'
                                                ];
                                                
                                                let foundText = '';
                                                let bestMatch = null;
                                                let bestLength = 0;
                                                
                                                for (const selector of selectors) {
                                                    try {
                                                        const containers = document.querySelectorAll(selector);
                                                        for (const container of containers) {
                                                            const text = container.textContent || container.innerText || '';
                                                            // Look for responses that are reasonable length and don't look like code
                                                            if (text.length > 50 && text.length < 10000 && text.length > bestLength) {
                                                                // Check if this looks like a response (not code)
                                                                // More strict: count code indicators as percentage of text length
                                                                const codeIndicators = text.match(/(function|=>|document\\.|window\\.|\\[\\d+,\\s*"[^"]*"|\\$\\$typeof|self\\.self|\\(a,b,c,d,e,f,g,h\\)|let i=document)/gi);
                                                                const codeRatio = codeIndicators ? codeIndicators.length / (text.length / 100) : 0;
                                                                // Only reject if code ratio is high (more than 2% of text is code indicators)
                                                                if (!codeIndicators || codeRatio < 2) {
                                                                    // Check if it has normal sentence structure (periods, spaces, capital letters)
                                                                    const hasNormalText = (text.match(/[.!?]\\s+[A-Z]/g) || []).length > 0 || 
                                                                                          (text.match(/[A-Z][a-z]+\\s+[a-z]+/g) || []).length > 5;
                                                                    // Check if it contains common response words
                                                                    const hasResponseWords = /(is|are|was|were|the|a|an|in|on|at|for|with|from|to|of|and|or|but|country|city|located|capital)/i.test(text);
                                                                    if (hasNormalText && hasResponseWords) {
                                                                        bestMatch = text.trim();
                                                                        bestLength = text.length;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    } catch(e) {
                                                        // Skip invalid selectors
                                                    }
                                                }
                                                
                                                // Strategy 3: If still no match, try to find text that looks like a geographic/location response
                                                // This is a last resort for Mistral when prompt isn't found
                                                if (!bestMatch) {
                                                    const allTextElements = document.querySelectorAll('p, div, span, article, section');
                                                    for (const el of allTextElements) {
                                                        const text = el.textContent || el.innerText || '';
                                                        // Look for geographic response patterns
                                                        if (text.length > 100 && text.length < 3000) {
                                                            const hasGeoWords = /(country|city|located|capital|borders|north|south|east|west|europe|asia|africa|america|continent)/i.test(text);
                                                            const hasLocationWords = /(is|are|was|were|in|on|at|between|near|along)/i.test(text);
                                                            const codeIndicators = text.match(/(function|=>|document\\.|window\\.|\\[\\d+,\\s*"[^"]*"|\\$\\$typeof|self\\.self|\\(a,b,c,d,e,f,g,h\\)|let i=document)/gi);
                                                            const codeRatio = codeIndicators ? codeIndicators.length / (text.length / 100) : 0;
                                                            if (hasGeoWords && hasLocationWords && (!codeIndicators || codeRatio < 1)) {
                                                                if (text.length > bestLength) {
                                                                    bestMatch = text.trim();
                                                                    bestLength = text.length;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                
                                                if (bestMatch) {
                                                    // Basic cleanup: remove UI elements
                                                    foundText = bestMatch.replace(/Ask Le Chat.*$/i, '');
                                                    foundText = foundText.replace(/Message.*$/i, '');
                                                    foundText = foundText.replace(/Reply.*$/i, '');
                                                    foundText = foundText.replace(/Ask anything.*$/i, '');
                                                    foundText = foundText.replace(/\\s{2,}/g, ' ').trim();
                                                    return foundText.substring(0, 5000);
                                                }
                                                
                                                return '';
                                            }
                                            
                                            // Found prompt, extract response
                                            let responseText = bodyText.substring(promptIndex + prompt.length).trim();
                                            
                                            // Skip over UI elements that might appear immediately after prompt
                                            responseText = responseText.replace(/^\\d+\\/\\d+/, '').trim();
                                            responseText = responseText.replace(/^Reviewed\\s+\\d+\\s+sources/i, '').trim();
                                            
                                            // Basic cleanup: remove UI elements
                                            responseText = responseText.replace(/Ask Le Chat.*$/i, '');
                                            responseText = responseText.replace(/Message.*$/i, '');
                                            responseText = responseText.replace(/Reply.*$/i, '');
                                            responseText = responseText.replace(/Ask anything.*$/i, '');
                                            responseText = responseText.replace(/\\s{2,}/g, ' ').trim();
                                            
                                            return responseText.substring(0, 5000);
                                        } catch(e) {
                                            return '';
                                        }
                                    })();
                                `);
                                if (fallbackResponse && fallbackResponse.length > 50) {
                                    console.log(`   ✅ [Capture] Fallback extraction succeeded for ${pane.tool.name}: ${fallbackResponse.length} chars`);
                                    response = fallbackResponse;
                                } else {
                                    response = '';
                                }
                            }
                        } catch (fallbackError) {
                            console.error(`   ❌ [Capture] Fallback extraction also failed for ${pane.tool.name}:`, fallbackError.message);
                            response = '';
                        }
                    } else {
                        response = '';
                    }
                }
            }
            
            // Build response object
            if (response && response.length > 50) {
                capturedResponses[toolKey] = {
                                tool: pane.tool.name,
                                icon: pane.tool.icon,
                                index: pane.index,
                    response: response,
                    html: response,
                                hasResponse: true,
                    hasImages: false,
                    hasVideos: false,
                    source: 'simple-extraction',
                    timestamp: Date.now()
                            };
                        } else {
                console.log(`⚠️ [Capture] No response available for ${pane.tool.name}`);
                capturedResponses[toolKey] = {
                                tool: pane.tool.name,
                                icon: pane.tool.icon,
                                index: pane.index,
                                response: '',
                                html: '',
                                hasResponse: false,
                                hasImages: false,
                    source: 'none',
                    timestamp: Date.now()
                };
            }
        }
        
        // Step 2: Build paneResponses array in the format expected by comparison window
        const paneResponses = activePanes.map((pane) => {
            const toolKey = pane.tool.name.toLowerCase();
            const captured = capturedResponses[toolKey];
            
            if (captured && captured.hasResponse) {
                // Format response text for better display (doesn't affect capture, only display)
                const formattedResponse = formatResponseText(captured.response);
                return {
                    ...captured,
                    response: formattedResponse,
                    html: formattedResponse
                };
            } else {
                return {
                    tool: pane.tool.name,
                    icon: pane.tool.icon,
                    index: pane.index,
                    response: '',
                    html: '',
                    hasResponse: false,
                    hasImages: false,
                    source: 'on-demand-capture'
                };
            }
        });
        
        const responseCount = paneResponses.filter(p => p.hasResponse).length;
        console.log(`📊 [Capture] CAPTURE RESULTS: ${responseCount}/${paneResponses.length} responses captured`);
        
        // Store captured responses globally for ranking and synthesis
        storedPaneResponses = {};
        paneResponses.forEach(pane => {
            if (pane.hasResponse && pane.response) {
                const toolKey = pane.tool.toLowerCase();
                storedPaneResponses[toolKey] = {
                    tool: pane.tool,
                    icon: pane.icon,
                    index: pane.index,
                    response: pane.response,
                    html: pane.html || pane.response,
                    hasResponse: pane.hasResponse,
                    hasImages: pane.hasImages || false,
                    hasVideos: pane.hasVideos || false,
                    source: pane.source || 'on-demand-capture',
                    timestamp: pane.timestamp || Date.now()
                };
            }
        });
        console.log(`💾 [Capture] Stored ${Object.keys(storedPaneResponses).length} responses for ranking/synthesis`);
        
        // Step 3: Create comparison window
        const comparisonWindow = new BrowserWindow({
            width: 1600,
            height: 900,
            title: 'Visual Comparison - ProjectCoachAI',
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        // Set up event listeners BEFORE loading
        let loadResolved = false;
        const loadPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!loadResolved) {
                    loadResolved = true;
                    console.error('❌ [IPC] Timeout waiting for comparison window to load');
                    try {
                        if (!comparisonWindow.isDestroyed() && !comparisonWindow.webContents.isLoading()) {
                            console.log('⚠️ [IPC] Timeout but window appears loaded, proceeding anyway...');
                            setTimeout(() => resolve(), 100);
                            return;
                        }
                    } catch (e) {}
                    reject(new Error('Timeout waiting for comparison window to load (10 seconds)'));
                }
            }, 10000);
            
            const cleanup = () => {
                if (!loadResolved) {
                    loadResolved = true;
                    clearTimeout(timeout);
                }
            };
            
            const onLoadComplete = () => {
                if (!loadResolved) {
                    cleanup();
                    console.log('✅ [IPC] Comparison window finished loading');
                    setTimeout(() => resolve(), 300);
                }
            };
            
            comparisonWindow.webContents.once('did-finish-load', onLoadComplete);
            
            let domReadyFired = false;
            comparisonWindow.webContents.once('dom-ready', () => {
                domReadyFired = true;
                console.log('✅ [IPC] Comparison window DOM ready');
                setTimeout(() => {
                    if (!loadResolved && domReadyFired) {
                        console.log('⚠️ [IPC] Using dom-ready as fallback');
                        onLoadComplete();
                    }
                }, 2000);
            });
            
            comparisonWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                if (!loadResolved) {
                    cleanup();
                    console.error(`❌ [IPC] Failed to load: ${errorDescription} (${errorCode})`);
                    reject(new Error(`Failed to load: ${errorDescription} (${errorCode})`));
                }
            });
        });
        
        // Load the file
        try {
            console.log('📂 [IPC] Loading visual-comparison.html...');
            const filePath = path.join(__dirname, 'visual-comparison.html');
            console.log('📂 [IPC] File path:', filePath);
            
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            
            await comparisonWindow.loadFile('visual-comparison.html');
            console.log('📂 [IPC] loadFile() completed, waiting for did-finish-load...');
        } catch (loadError) {
            console.error('❌ [IPC] Failed to load visual-comparison.html:', loadError);
            if (!comparisonWindow.isDestroyed()) {
                comparisonWindow.close();
            }
            return { 
                success: false, 
                error: `Failed to load comparison view: ${loadError.message}` 
            };
        }
        
        // Wait for load to complete
        try {
            await Promise.race([
                loadPromise,
                new Promise((resolve) => {
                    const checkInterval = setInterval(() => {
                        if (loadResolved) {
                            clearInterval(checkInterval);
                            return;
                        }
                        try {
                            if (!comparisonWindow.isDestroyed() && 
                                !comparisonWindow.webContents.isLoading() &&
                                comparisonWindow.webContents.getURL().includes('visual-comparison.html')) {
                                console.log('✅ [IPC] Window appears ready (polling check)');
                                clearInterval(checkInterval);
                                if (!loadResolved) {
                                    loadResolved = true;
                                    resolve();
                                }
                            }
                        } catch (e) {}
                    }, 500);
                    setTimeout(() => clearInterval(checkInterval), 8000);
                })
            ]);
        } catch (loadError) {
            console.error('❌ [IPC] Load promise rejected:', loadError);
            if (!comparisonWindow.isDestroyed()) {
                comparisonWindow.close();
            }
            throw loadError;
        }
        
        // Final check: Verify window is ready
        try {
            const isReady = await comparisonWindow.webContents.executeJavaScript(`
                document.readyState === 'complete' && typeof window.visualComparison !== 'undefined'
            `).catch(() => false);
            
            if (!isReady) {
                console.log('⏳ [IPC] Window loaded but scripts not ready, waiting a bit more...');
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (e) {
            console.warn('⚠️ [IPC] Could not verify window readiness, proceeding anyway:', e.message);
        }
        
        // Send pane information with captured responses
        try {
            const withContent = paneResponses.filter(p => p.response && p.response.length > 0).length;
            console.log(`📊 [IPC] Sending comparison data: ${withContent}/${paneResponses.length} panes have content`);
            
            comparisonWindow.webContents.send('setup-comparison', {
                panes: paneResponses,
                mode: options.mode || 'visual',
                timestamp: new Date().toISOString(),
                autoPopulated: responseCount > 0,
                responseCount: responseCount,
                totalPanes: paneResponses.length,
                captureMethod: 'on-demand-simple'
            });
            console.log(`✅ [IPC] Sent setup-comparison with ${paneResponses.length} panes (${withContent} with content)`);
        } catch (sendError) {
            console.error('❌ [IPC] Failed to send setup-comparison:', sendError);
            throw new Error(`Failed to send comparison data: ${sendError.message}`);
        }
        
        // Store window reference
        comparisonWindows.set(comparisonWindow.id, comparisonWindow);
        activeComparisonWindow = comparisonWindow;
        console.log(`✅ [IPC] Set activeComparisonWindow (ID: ${comparisonWindow.id}) for dynamic updates`);
        
        // Show and focus the window
        comparisonWindow.show();
        comparisonWindow.focus();
        
        // Clean up on close
        comparisonWindow.on('closed', () => {
            comparisonWindows.delete(comparisonWindow.id);
            if (activeComparisonWindow && activeComparisonWindow.id === comparisonWindow.id) {
                activeComparisonWindow = null;
            }
        });
        
        // Restore cursor and send completion message
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                // Remove the loading cursor CSS
                await mainWindow.webContents.executeJavaScript(`
                    (function() {
                        const style = document.getElementById('loading-cursor-style');
                        if (style) style.remove();
                    })();
                `);
                mainWindow.webContents.send('comparison-loading', {
                    status: 'complete',
                    message: 'Comparison ready'
                });
                console.log('✅ [UI] Loading cursor restored to default');
            }
        } catch (e) {
            // Ignore if window is closed
        }
        
        return {
            success: true,
            comparisonId: `visual_${Date.now()}`,
            windowId: comparisonWindow.id,
            responsesExtracted: responseCount
        };
    } catch (error) {
        console.error('❌ Error opening visual comparison:', error);
        
        // Restore cursor on error
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                // Remove the loading cursor CSS
                await mainWindow.webContents.executeJavaScript(`
                    (function() {
                        const style = document.getElementById('loading-cursor-style');
                        if (style) style.remove();
                    })();
                `);
                mainWindow.webContents.send('comparison-loading', {
                    status: 'error',
                    message: 'Failed to open comparison'
                });
            }
        } catch (e) {
            // Ignore if window is closed
        }
        
        return { success: false, error: error.message };
    }
});

// Simple on-demand capture integration complete - old API/stored response code removed

ipcMain.handle('open-ranking-view', async (event) => {
    try {
        console.log('📊 [IPC] Opening ranking view...');
        const rankingWindow = new BrowserWindow({
            width: 800,
            height: 600,
            title: 'Rank AI Responses - ProjectCoachAI',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });
        
        rankingWindow.loadFile('manual-rank.html');
        
        await new Promise(resolve => {
            rankingWindow.webContents.once('did-finish-load', resolve);
        });
        
        // Build pane responses from stored captured responses
        const rankingPanes = activePanes.map(pane => {
            const toolKey = pane.tool.name.toLowerCase();
            const stored = storedPaneResponses[toolKey];
            
            if (stored && stored.hasResponse) {
                return {
                    tool: pane.tool.name,
                    icon: pane.tool.icon,
                    index: pane.index,
                    response: stored.response,
                    html: stored.html || stored.response,
                    hasResponse: true,
                    hasImages: stored.hasImages || false,
                    source: stored.source || 'on-demand-capture'
                };
            } else {
                return {
                    tool: pane.tool.name,
                    icon: pane.tool.icon,
                    index: pane.index,
                    response: '',
                    html: '',
                    hasResponse: false,
                    hasImages: false,
                    source: 'on-demand-capture'
                };
            }
        });
        
        const rankingResponseCount = rankingPanes.filter(p => p.hasResponse).length;
        console.log(`📊 [Ranking] Sending ${rankingResponseCount}/${rankingPanes.length} panes with captured responses`);
        
        rankingWindow.webContents.send('setup-ranking', {
            panes: rankingPanes
        });
        
        // Store window reference
        comparisonWindows.set(rankingWindow.id, rankingWindow);
        
        // Clean up on close
        rankingWindow.on('closed', () => {
            comparisonWindows.delete(rankingWindow.id);
        });
        
        return { success: true };
    } catch (error) {
        console.error('❌ Error opening ranking view:', error);
        return { success: false, error: error.message };
    }
});

// Simple on-demand capture integration complete - old API/stored response code removed

// Format response text with proper line breaks and paragraphs
function formatResponseText(text) {
    if (!text || typeof text !== 'string') {
        return text || '';
    }
    
    // Remove excessive whitespace
    let formatted = text.trim();
    
    // Add line breaks after sentences (periods, exclamation marks, question marks)
    // But only if followed by a capital letter (new sentence)
    formatted = formatted.replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2');
    
    // Add line breaks after colons if followed by a capital letter (lists)
    formatted = formatted.replace(/:\s+([A-Z][a-z]+)/g, ':\n$1');
    
    // Add line breaks before common section headers (Capitalized words followed by colon)
    formatted = formatted.replace(/\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):\s+/g, '\n\n$1:\n');
    
    // Clean up multiple consecutive line breaks (max 2)
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    // Remove line breaks at the start
    formatted = formatted.replace(/^\n+/, '');
    
    // Remove line breaks at the end
    formatted = formatted.replace(/\n+$/, '');
    
    return formatted;
}

ipcMain.handle('open-synthesis-view', async (event, comparisonData) => {
    try {
        console.log('✨ [IPC] Opening synthesis view...');
        const synthesisWindow = new BrowserWindow({
            width: 1600,
            height: 1100, // Increased height to accommodate devtools
            title: 'AI Response Synthesis - 7 Analysis Modes',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: true, // Allow external API calls (OpenAI)
                contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
            }
        });
        
        // Handle devtools opening - resize window to accommodate it
        synthesisWindow.webContents.on('devtools-opened', () => {
            console.log('🔧 [Synthesis] DevTools opened - adjusting window size');
            // Increase window height when devtools opens
            const bounds = synthesisWindow.getBounds();
            synthesisWindow.setBounds({
                ...bounds,
                height: Math.max(bounds.height, 1200) // Ensure minimum height for devtools
            });
        });
        
        synthesisWindow.webContents.on('devtools-closed', () => {
            console.log('🔧 [Synthesis] DevTools closed');
            // Optionally restore original size when devtools closes
            // const bounds = synthesisWindow.getBounds();
            // synthesisWindow.setBounds({ ...bounds, height: 1100 });
        });
        
        synthesisWindow.loadFile('synthesis.html');
        
        await new Promise(resolve => {
            synthesisWindow.webContents.once('did-finish-load', resolve);
        });
        
        // Use stored captured responses for synthesis
        // If comparisonData is provided, merge with stored responses
        // Otherwise, build from storedPaneResponses directly
        let synthesisPanes;
        
        if (comparisonData && comparisonData.panes) {
            // Merge comparison data with stored captured responses
            // First, filter to only include panes with actual responses
            const panesWithContent = comparisonData.panes.filter(pane => {
                // Check if pane has a response in the comparison data
                const hasResponseInData = pane.hasResponse && (pane.response || pane.content) && (pane.response || pane.content).trim().length > 0;
                // Check if stored response exists
                const toolKey = pane.tool.toLowerCase();
                const stored = storedPaneResponses[toolKey];
                const hasStoredResponse = stored && stored.hasResponse && stored.response && stored.response.trim().length > 0;
                
                return hasResponseInData || hasStoredResponse;
            });
            
            console.log(`📊 [Synthesis] Filtered ${panesWithContent.length} panes with content from ${comparisonData.panes.length} total panes`);
            
            // Now map these filtered panes
            synthesisPanes = panesWithContent.map(pane => {
                const toolKey = pane.tool.toLowerCase();
                const stored = storedPaneResponses[toolKey];
                
                // Prefer stored captured response if available
                if (stored && stored.hasResponse && stored.response && stored.response.trim().length > 0) {
                    console.log(`✅ [Synthesis] Using stored captured response for ${pane.tool}: ${stored.response.length} chars`);
                    // Format response text with proper line breaks and paragraphs
                    const formattedResponse = formatResponseText(stored.response);
                    return {
                        ...pane,
                        tool: pane.tool || stored.tool,
                        icon: pane.icon || stored.icon,
                        response: formattedResponse,
                        html: formattedResponse,
                        hasResponse: true,
                        hasImages: stored.hasImages || false,
                        hasVideos: stored.hasVideos || false,
                        source: stored.source || 'on-demand-capture'
                    };
                }
                // If pane already has response, format and use it
                if (pane.response && pane.response.trim().length > 0) {
                    const formattedResponse = formatResponseText(pane.response);
                    return {
                        ...pane,
                        response: formattedResponse,
                        html: formattedResponse,
                        hasResponse: true
                    };
                }
                // If pane has content (old format), use it
                if (pane.content && pane.content.trim().length > 0) {
                    const formattedResponse = formatResponseText(pane.content);
                    return {
                        ...pane,
                        response: formattedResponse,
                        html: formattedResponse,
                        hasResponse: true
                    };
                }
                // Should not reach here due to filter, but return null to filter out
                return null;
            }).filter(pane => pane !== null); // Remove any null entries
        } else {
            // Build from storedPaneResponses if no comparisonData provided
            // Only include panes with actual responses
            synthesisPanes = activePanes
                .map(pane => {
                    const toolKey = pane.tool.name.toLowerCase();
                    const stored = storedPaneResponses[toolKey];
                    
                    if (stored && stored.hasResponse && stored.response && stored.response.trim().length > 0) {
                        // Format response text with proper line breaks and paragraphs
                        const formattedResponse = formatResponseText(stored.response);
                        return {
                            tool: pane.tool.name,
                            icon: pane.tool.icon,
                            index: pane.index,
                            response: formattedResponse,
                            html: formattedResponse,
                            hasResponse: true,
                            hasImages: stored.hasImages || false,
                            hasVideos: stored.hasVideos || false,
                            source: stored.source || 'on-demand-capture'
                        };
                    }
                    // Return null for panes without responses - will be filtered out
                    return null;
                })
                .filter(pane => pane !== null); // Remove panes without responses
            
            console.log(`📊 [Synthesis] Built ${synthesisPanes.length} panes with responses from storedPaneResponses (out of ${activePanes.length} active panes)`);
        }
        
        // Filter to only include panes with actual responses for synthesis
        const panesWithResponses = synthesisPanes.filter(p => 
            p.hasResponse && 
            (p.response || p.content) && 
            (p.response || p.content).trim().length > 0
        );
        
        const withContent = panesWithResponses.length;
        console.log(`📊 [Synthesis] Filtered to ${withContent}/${synthesisPanes.length} panes with actual responses`);
        console.log(`📊 [Synthesis] Panes with responses: ${panesWithResponses.map(p => p.tool).join(', ')}`);
        
        // Update comparisonData with only panes that have responses
        if (!comparisonData) {
            comparisonData = {
                panes: panesWithResponses, // Only panes with responses
                mode: 'synthesis',
                timestamp: new Date().toISOString(),
                autoPopulated: withContent > 0,
                responseCount: withContent,
                totalPanes: panesWithResponses.length,
                captureMethod: 'on-demand-capture'
            };
        } else {
            // Filter out empty panes and ranking data for empty panes
            comparisonData.panes = panesWithResponses; // Only panes with responses
            if (comparisonData.rankings) {
                // Filter rankings to only include tools that have responses
                const toolsWithResponses = new Set(panesWithResponses.map(p => p.tool.toLowerCase()));
                comparisonData.rankings = comparisonData.rankings.filter(ranking => 
                    toolsWithResponses.has(ranking.tool.toLowerCase())
                );
                console.log(`📊 [Synthesis] Filtered rankings to ${comparisonData.rankings.length} (only tools with responses)`);
            }
            comparisonData.responseCount = withContent;
            comparisonData.autoPopulated = withContent > 0;
            comparisonData.totalPanes = panesWithResponses.length;
        }
        
        synthesisWindow.webContents.send('setup-synthesis', comparisonData);
        
        // Store window reference
        comparisonWindows.set(synthesisWindow.id, synthesisWindow);
        
        // Clean up on close
        synthesisWindow.on('closed', () => {
            comparisonWindows.delete(synthesisWindow.id);
        });
        
        return {
            success: true,
            instruction: 'OpenAI API access included in pricing',
            privacy: 'API key stored securely in main process'
        };
    } catch (error) {
        console.error('❌ Error opening synthesis view:', error);
        return { success: false, error: error.message };
    }
});

// Handle close window request
ipcMain.on('close-comparison-window', (event) => {
    // Find the window that sent this message and close it
    const allWindows = BrowserWindow.getAllWindows();
    const senderWindow = allWindows.find(w => w.webContents.id === event.sender.id);
    
    if (senderWindow && senderWindow !== mainWindow) {
        senderWindow.close();
        console.log('✅ Closed comparison window');
    }
});

ipcMain.handle('export-comparison', async (event, data) => {
    try {
        const { dialog } = require('electron');
        const fs = require('fs');
        
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Comparison',
            defaultPath: `comparison-${new Date().toISOString().split('T')[0]}.json`,
            filters: [
                { name: 'JSON', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
            return { success: true, filePath: result.filePath };
        }
        
        return { success: false, cancelled: true };
    } catch (error) {
        console.error('❌ Error exporting comparison:', error);
        return { success: false, error: error.message };
    }
});

// Close comparison window (for navigation from synthesis to toolshelf)
ipcMain.handle('close-comparison-window-for-navigation', async () => {
    try {
        if (activeComparisonWindow && !activeComparisonWindow.isDestroyed()) {
            console.log('🔄 Closing comparison window for navigation to toolshelf');
            activeComparisonWindow.close();
            activeComparisonWindow = null;
            return { success: true };
        }
        // Also try to find and close any comparison windows
        const allWindows = BrowserWindow.getAllWindows();
        const comparisonWindows = allWindows.filter(w => 
            w !== mainWindow && 
            !w.isDestroyed() && 
            (w.getTitle().toLowerCase().includes('comparison') || 
             w.webContents.getURL().includes('visual-comparison'))
        );
        if (comparisonWindows.length > 0) {
            comparisonWindows.forEach(w => w.close());
            console.log(`✅ Closed ${comparisonWindows.length} comparison window(s)`);
            return { success: true };
        }
        return { success: true, message: 'No comparison window found' };
    } catch (error) {
        console.error('❌ Error closing comparison window:', error);
        return { success: false, error: error.message };
    }
});

// Claude API Key Management
function getClaudeAPIKey() {
    // Option 1: Read from project file (primary source)
    const possiblePaths = [
        path.join(__dirname, 'Claude sk for ProjectCoachAI.txt'),
        path.join(__dirname, 'Claude sk for ProjectCoachAI'),
        path.join(__dirname, 'Anthropic sk for ProjectCoachAI.txt'),
        path.join(__dirname, 'Anthropic sk for ProjectCoachAI')
    ];
    
    for (const keyFilePath of possiblePaths) {
        try {
            if (fs.existsSync(keyFilePath)) {
                const apiKey = fs.readFileSync(keyFilePath, 'utf8').trim();
                if (apiKey && (apiKey.startsWith('sk-ant-') || apiKey.length > 20)) {
                    console.log('✅ [Claude] API key loaded from project file:', path.basename(keyFilePath));
                    return apiKey;
                }
            }
        } catch (error) {
            console.error('❌ [Claude] Error reading API key file:', keyFilePath, error);
        }
    }
    
    // Option 2: Environment variable (fallback)
    if (process.env.ANTHROPIC_API_KEY) {
        console.log('✅ [Claude] API key loaded from ANTHROPIC_API_KEY environment variable');
        return process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.CLAUDE_API_KEY) {
        console.log('✅ [Claude] API key loaded from CLAUDE_API_KEY environment variable');
        return process.env.CLAUDE_API_KEY;
    }
    
    // Option 3: Config file (fallback)
    try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.claudeApiKey || config.anthropicApiKey) {
                console.log('✅ [Claude] API key loaded from config file');
                return config.claudeApiKey || config.anthropicApiKey;
            }
        }
    } catch (error) {
        console.error('❌ [Claude] Error reading config:', error);
    }
    
    // No key found
    console.warn('⚠️ [Claude] API key not found. Will use OpenAI as fallback.');
    return null;
}

// OpenAI API Key Management (Included in Pricing)
function getOpenAIAPIKey() {
    // Option 1: Read from project file (primary source)
    // Try both with and without .txt extension
    const possiblePaths = [
        path.join(__dirname, 'OpenAI sk for ProjectCoachAI'),
        path.join(__dirname, 'OpenAI sk for ProjectCoachAI.txt')
    ];
    
    for (const keyFilePath of possiblePaths) {
        try {
            if (fs.existsSync(keyFilePath)) {
                const apiKey = fs.readFileSync(keyFilePath, 'utf8').trim();
                if (apiKey && apiKey.startsWith('sk-')) {
                    console.log('✅ OpenAI API key loaded from project file:', keyFilePath);
                    return apiKey;
                }
            }
        } catch (error) {
            console.error('Error reading API key file:', keyFilePath, error);
        }
    }
    
    // Option 2: Environment variable (fallback)
    if (process.env.OPENAI_API_KEY) {
        console.log('✅ OpenAI API key loaded from environment variable');
        return process.env.OPENAI_API_KEY;
    }
    
    // Option 3: Config file (fallback)
    try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.openaiApiKey) {
                console.log('✅ OpenAI API key loaded from config file');
                return config.openaiApiKey;
            }
        }
    } catch (error) {
        console.error('Error reading config:', error);
    }
    
    // No key found
    console.error('❌ OpenAI API key not found. Please extract the key from "OpenAI sk for ProjectCoachAI.docx" and save it as a plain text file with the same name (without .docx extension).');
    return null;
}

// OpenAI API Call Handler (Server-side for security)
ipcMain.handle('call-openai-api', async (event, requestData) => {
    try {
        console.log('🔑 [OpenAI] Checking for API key...');
        const apiKey = getOpenAIAPIKey();
        
        if (!apiKey) {
            console.error('❌ [OpenAI] API key not found!');
            return {
                success: false,
                error: 'OpenAI API key not configured. Please extract the key from "OpenAI sk for ProjectCoachAI.docx" and save it as a plain text file named "OpenAI sk for ProjectCoachAI" (without .docx extension) in the project directory.'
            };
        }
        
        console.log('✅ [OpenAI] API key found, preparing API call...');
        console.log('📊 [OpenAI] Request details:', {
            model: requestData.model || 'gpt-4',
            messagesCount: requestData.messages ? requestData.messages.length : 0,
            temperature: requestData.temperature || 0.7,
            maxTokens: requestData.max_tokens || 'default'
        });
        
        const requestBody = JSON.stringify({
            model: requestData.model || 'gpt-4',
            messages: requestData.messages || [],
            temperature: requestData.temperature || 0.7,
            max_tokens: requestData.max_tokens || 2000
        });
        
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Length': Buffer.byteLength(requestBody)
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            console.log('✅ [OpenAI] API call successful!');
                            console.log('📥 [OpenAI] Response details:', {
                                hasChoices: !!(result.choices && result.choices.length > 0),
                                choicesCount: result.choices ? result.choices.length : 0,
                                model: result.model,
                                usage: result.usage ? {
                                    promptTokens: result.usage.prompt_tokens,
                                    completionTokens: result.usage.completion_tokens,
                                    totalTokens: result.usage.total_tokens
                                } : 'no usage data'
                            });
                            resolve({
                                success: true,
                                result: result
                            });
                        } else {
                            console.error(`❌ [OpenAI] API call failed with status ${res.statusCode}`);
                            console.error('❌ [OpenAI] Error response:', result);
                            resolve({
                                success: false,
                                error: result.error?.message || `API Error: ${res.statusCode}`
                            });
                        }
                    } catch (error) {
                        console.error('❌ [OpenAI] Failed to parse API response:', error);
                        reject({
                            success: false,
                            error: 'Failed to parse API response: ' + error.message
                        });
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error('❌ [OpenAI] Network error during API call:', error);
                reject({
                    success: false,
                    error: 'Network error: ' + error.message
                });
            });
            
            console.log('📤 [OpenAI] Sending API request to OpenAI...');
            req.write(requestBody);
            req.end();
            console.log('✅ [OpenAI] API request sent, waiting for response...');
        });
    } catch (error) {
        console.error('❌ Error calling OpenAI API:', error);
        return {
            success: false,
            error: error.message || 'Unknown error'
        };
    }
});

// Claude API Call Handler (Anthropic API format)
ipcMain.handle('call-claude-api', async (event, requestData) => {
    try {
        console.log('🔑 [Claude] Checking for API key...');
        const apiKey = getClaudeAPIKey();
        
        if (!apiKey) {
            console.error('❌ [Claude] API key not found!');
            return {
                success: false,
                error: 'Claude API key not configured. Please add it to "Claude sk for ProjectCoachAI.txt" file in the project directory.',
                fallbackAvailable: true
            };
        }
        
        console.log('✅ [Claude] API key found, preparing API call...');
        console.log('📊 [Claude] Request details:', {
            model: requestData.model || 'claude-3-5-haiku-20241022',
            messagesCount: requestData.messages ? requestData.messages.length : 0,
            temperature: requestData.temperature || 0.7,
            maxTokens: requestData.max_tokens || 2048
        });
        
        // Convert OpenAI format to Anthropic format
        // Anthropic uses messages array differently - need system and user messages
        const anthropicMessages = [];
        let systemMessage = '';
        
        if (requestData.messages && requestData.messages.length > 0) {
            requestData.messages.forEach(msg => {
                if (msg.role === 'system') {
                    systemMessage = msg.content;
                } else {
                    // Convert role format: 'user' or 'assistant' for Anthropic
                    anthropicMessages.push({
                        role: msg.role === 'system' ? 'user' : msg.role,
                        content: msg.content
                    });
                }
            });
        }
        
        // Ensure we have at least one user message
        if (anthropicMessages.length === 0) {
            console.error('❌ [Claude] No user messages found in request data');
            return {
                success: false,
                error: 'No user messages provided for Claude API call',
                fallbackAvailable: true,
                provider: 'claude'
            };
        }
        
        // Build Anthropic API request body
        const requestBody = JSON.stringify({
            model: requestData.model || 'claude-3-5-haiku-20241022',
            max_tokens: requestData.max_tokens || 2048,
            temperature: requestData.temperature || 0.7,
            system: systemMessage || 'You are a helpful AI assistant.',
            messages: anthropicMessages // Always has at least one user message now
        });
        
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.anthropic.com',
                port: 443,
                path: '/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Length': Buffer.byteLength(requestBody)
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            console.log('✅ [Claude] API call successful!');
                            console.log('📥 [Claude] Response details:', {
                                hasContent: !!(result.content && result.content.length > 0),
                                contentBlocks: result.content ? result.content.length : 0,
                                model: result.model,
                                usage: result.usage ? {
                                    inputTokens: result.usage.input_tokens,
                                    outputTokens: result.usage.output_tokens
                                } : 'no usage data'
                            });
                            
                            // Convert Anthropic format back to OpenAI-like format for compatibility
                            // Anthropic returns content as array of blocks: [{ type: 'text', text: '...' }, ...]
                            let textContent = '';
                            if (result.content && Array.isArray(result.content)) {
                                // Extract all text blocks and join them
                                textContent = result.content
                                    .filter(block => block.type === 'text' && block.text)
                                    .map(block => block.text)
                                    .join('\n\n');
                                
                                // If no text blocks found, try direct text access (fallback)
                                if (!textContent && result.content.length > 0 && result.content[0].text) {
                                    textContent = result.content[0].text;
                                }
                            }
                            
                            const convertedResult = {
                                choices: [{
                                    message: {
                                        role: 'assistant',
                                        content: textContent || ''
                                    },
                                    finish_reason: result.stop_reason || 'stop'
                                }],
                                model: result.model,
                                usage: result.usage ? {
                                    prompt_tokens: result.usage.input_tokens,
                                    completion_tokens: result.usage.output_tokens,
                                    total_tokens: result.usage.input_tokens + result.usage.output_tokens
                                } : null
                            };
                            
                            if (!textContent) {
                                console.warn('⚠️ [Claude] No text content found in response. Content blocks:', result.content);
                            }
                            
                            resolve({
                                success: true,
                                result: convertedResult,
                                provider: 'claude'
                            });
                        } else {
                            console.error(`❌ [Claude] API call failed with status ${res.statusCode}`);
                            console.error('❌ [Claude] Error response:', result);
                            
                            // Check if it's a model not found error
                            const isModelNotFound = res.statusCode === 404 && 
                                (result.error?.type === 'not_found_error' || 
                                 result.error?.message?.includes('model:') ||
                                 result.error?.message?.includes('not_found'));
                            
                            let errorMessage = result.error?.message || `API Error: ${res.statusCode}`;
                            
                            if (isModelNotFound) {
                                const requestedModel = requestData.model || 'unknown';
                                errorMessage = `Model '${requestedModel}' not found (404). This model may be deprecated, unavailable for your API key, or require a different model name. Recommended: Try 'claude-3-5-haiku-20241022' for testing, or verify model availability at https://docs.anthropic.com/en/api/pricing`;
                                console.error(`🚨 [Claude] MODEL NOT FOUND: ${requestedModel}`);
                                console.error(`💡 [Claude] Suggestion: Check if your API key has access to this model, or try using 'claude-3-5-haiku-20241022' instead`);
                            }
                            
                            resolve({
                                success: false,
                                error: errorMessage,
                                fallbackAvailable: true,
                                provider: 'claude',
                                isModelNotFound: isModelNotFound,
                                requestedModel: requestData.model
                            });
                        }
                    } catch (error) {
                        console.error('❌ [Claude] Failed to parse API response:', error);
                        reject({
                            success: false,
                            error: 'Failed to parse API response: ' + error.message,
                            fallbackAvailable: true,
                            provider: 'claude'
                        });
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error('❌ [Claude] Network error during API call:', error);
                reject({
                    success: false,
                    error: 'Network error: ' + error.message,
                    fallbackAvailable: true,
                    provider: 'claude'
                });
            });
            
            console.log('📤 [Claude] Sending API request to Anthropic...');
            req.write(requestBody);
            req.end();
            console.log('✅ [Claude] API request sent, waiting for response...');
        });
    } catch (error) {
        console.error('❌ Error calling Claude API:', error);
        return {
            success: false,
            error: error.message || 'Unknown error calling Claude API',
            fallbackAvailable: true,
            provider: 'claude'
        };
    }
});

// App lifecycle
app.whenReady().then(() => {
    console.log('🚀 Electron app ready - initializing...');
    
    // Initialize subscription tracker
    subscriptionTracker = new SubscriptionTracker();
    
    // Initialize API proxy client (for modern comparison approach)
    // Your organization's backend API URL - set via environment variable or config
    // For local testing: http://localhost:3001 (see test-backend/README.md)
    const apiProxyURL = process.env.API_PROXY_URL || process.env.PROXY_URL || 'http://localhost:3001';
    try {
        // Create API client wrapper for main process (uses Node.js https module)
        apiProxyClient = {
            baseURL: apiProxyURL,
            userId: 'forge-edition',
            queryMultiple: async (providers, prompt) => {
                // Use Node.js https module to call your backend API
                const results = await Promise.all(
                    providers.map(async (provider) => {
                        return new Promise((resolve) => {
                            const url = new URL(`${apiProxyURL}/api/ai/query`);
                            const postData = JSON.stringify({ 
                                aiProvider: provider, 
                                prompt, 
                                userId: 'forge-edition' 
                            });
                            
                            const options = {
                                hostname: url.hostname,
                                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                                path: url.pathname,
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': Buffer.byteLength(postData)
                                }
                            };
                            
                            // Handle SSL certificate issues
                            if (url.protocol === 'https:') {
                                // For development/testing: allow self-signed certificates
                                // In production, this should be properly configured
                                options.rejectUnauthorized = false; // Allow invalid certificates (for testing)
                            }
                            
                            const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
                                let data = '';
                                res.on('data', (chunk) => { data += chunk; });
                                res.on('end', () => {
                                    try {
                                        if (res.statusCode === 200) {
                                            const json = JSON.parse(data);
                                            resolve({ provider, content: json.content, success: true, ...json });
                                        } else {
                                            // Try to parse error response body for detailed error message
                                            let errorMsg = `HTTP ${res.statusCode}`;
                                            try {
                                                const errorJson = JSON.parse(data);
                                                // Extract meaningful error message from response
                                                if (errorJson.error) {
                                                    if (typeof errorJson.error === 'string') {
                                                        errorMsg = errorJson.error;
                                                    } else if (errorJson.error.message) {
                                                        errorMsg = errorJson.error.message;
                                                    } else if (errorJson.error.error) {
                                                        errorMsg = errorJson.error.error;
                                                    }
                                                } else if (errorJson.message) {
                                                    errorMsg = errorJson.message;
                                                }
                                            } catch (parseError) {
                                                // If parsing fails, use status code message
                                                if (data && data.length > 0) {
                                                    errorMsg = `HTTP ${res.statusCode}: ${data.substring(0, 200)}`;
                                                }
                                            }
                                            resolve({ provider, success: false, error: errorMsg });
                                        }
                                    } catch (error) {
                                        resolve({ provider, success: false, error: error.message });
                                    }
                                });
                            });
                            
                            req.on('error', (error) => {
                                // Handle SSL/certificate errors gracefully
                                let errorMsg = error.message;
                                if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                                    errorMsg = `API server not available (${error.code})`;
                                } else if (error.code === 'CERT_HAS_EXPIRED' || error.message.includes('certificate')) {
                                    errorMsg = `SSL certificate issue - API server configuration needed`;
                                }
                                console.error(`API request error for ${provider}:`, errorMsg);
                                resolve({ provider, success: false, error: errorMsg });
                            });
                            
                            // Increase timeout to 60 seconds for AI API calls (they can take longer)
                            req.setTimeout(60000, () => {
                                req.destroy();
                                resolve({ provider, success: false, error: 'Request timeout' });
                            });
                            
                            req.write(postData);
                            req.end();
                        });
                    })
                );
                return results;
            }
        };
        console.log(`✅ API Proxy Client initialized: ${apiProxyURL}`);
        console.log(`📋 API Status: ${apiProxyClient ? '✅ Ready - Will use API for clean, quality data' : '❌ Not Available - Manual paste required'}`);
        console.log(`💡 API is the ONLY automated method - backend ResponseExtractor ensures clean responses`);
        console.log(`⚠️ Extraction disabled for legal compliance - API or manual paste only`);
        if (!apiProxyClient) {
            console.warn(`⚠️ To use API mode, set API_PROXY_URL environment variable to your backend URL`);
            console.warn(`⚠️ See BACKEND_API_GUIDE.md for server-side ResponseExtractor implementation`);
        }
    } catch (error) {
        console.warn('⚠️ API Proxy Client initialization failed - manual paste will be required:', error.message);
        apiProxyClient = null;
    }
    
    // Load subscription before creating window
    loadSubscription();
    loadUser();
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Cookie/Email Management IPC Handlers
ipcMain.handle('set-auto-accept-cookies', async (event, enabled) => {
    // Send to all active panes
    for (const pane of activePanes) {
        if (pane.view && pane.view.webContents && !pane.view.webContents.isDestroyed()) {
            try {
                await pane.view.webContents.executeJavaScript(`
                    if (window.paneAPI) {
                        window.paneAPI.setAutoAcceptCookies(${enabled});
                    } else {
                        localStorage.setItem('pane_setting_autoAcceptCookies', JSON.stringify(${enabled}));
                    }
                `);
            } catch (error) {
                console.error(`Error setting auto-accept cookies for ${pane.tool.name}:`, error);
            }
        }
    }
    return { success: true, enabled };
});

ipcMain.handle('get-auto-accept-cookies', async () => {
    // Get from first pane (they should all be synced)
    if (activePanes.length > 0 && activePanes[0].view && !activePanes[0].view.webContents.isDestroyed()) {
        try {
            const result = await activePanes[0].view.webContents.executeJavaScript(`
                (function() {
                    if (window.paneAPI) {
                        return window.paneAPI.getAutoAcceptCookies();
                    }
                    try {
                        return JSON.parse(localStorage.getItem('pane_setting_autoAcceptCookies') || 'false');
                    } catch {
                        return false;
                    }
                })();
            `);
            return { enabled: result };
        } catch (error) {
            console.error('Error getting auto-accept cookies:', error);
        }
    }
    return { enabled: false };
});

ipcMain.handle('get-saved-emails', async () => {
    // Get from first pane
    if (activePanes.length > 0 && activePanes[0].view && !activePanes[0].view.webContents.isDestroyed()) {
        try {
            const result = await activePanes[0].view.webContents.executeJavaScript(`
                (function() {
                    if (window.paneAPI) {
                        return window.paneAPI.getSavedEmails();
                    }
                    try {
                        return JSON.parse(localStorage.getItem('saved_emails') || '[]');
                    } catch {
                        return [];
                    }
                })();
            `);
            return { emails: result };
        } catch (error) {
            console.error('Error getting saved emails:', error);
        }
    }
    return { emails: [] };
});

// IPC: Get pane info for preload script
// Store pane responses for synthesis
let storedPaneResponses = {};

ipcMain.handle('get-pane-info', (event) => {
    // Find the pane that matches this webContents
    const pane = activePanes.find(p => p.view && p.view.webContents.id === event.sender.id);
    if (pane) {
        return {
            tool: pane.tool,
            index: pane.index,
            bounds: pane.view.getBounds(),
            ready: pane.ready
        };
    }
    return null;
});

// Error handlers to catch crashes
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    console.error('❌ Stack:', error.stack);
    // Don't exit - let Electron handle it
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('❌ Reason:', reason);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

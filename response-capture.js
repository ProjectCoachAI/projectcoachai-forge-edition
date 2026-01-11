// Automated Response Capture Script
// Injected into BrowserView webContents to capture AI responses in real-time

(function() {
    'use strict';
    
    // Prevent multiple injections
    if (window.__projectcoachCaptureActive) {
        return;
    }
    window.__projectcoachCaptureActive = true;
    
    class AICapture {
        constructor() {
            this.lastPrompt = '';
            this.lastResponse = '';
            this.capturedResponses = [];
            this.aiTool = this.detectAITool();
            this.pendingResponse = null; // Track response being built
            this.stableResponseTimeout = null; // Timeout for stable response
            this.init();
        }
        
        detectAITool() {
            const hostname = window.location.hostname;
            const url = window.location.href;
            
            if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
                return 'ChatGPT';
            }
            if (hostname.includes('claude.ai') || hostname.includes('anthropic.com')) {
                return 'Claude';
            }
            if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) {
                return 'Gemini';
            }
            if (hostname.includes('perplexity.ai')) {
                return 'Perplexity';
            }
            if (hostname.includes('deepseek.com')) {
                return 'DeepSeek';
            }
            if (hostname.includes('x.ai') || hostname.includes('grok')) {
                return 'Grok';
            }
            if (hostname.includes('mistral.ai')) {
                return 'Mistral';
            }
            if (hostname.includes('poe.com')) {
                return 'Poe';
            }
            
            return 'Unknown';
        }
        
        init() {
            console.log(`[ProjectCoach Capture] 🚀 Initialized for ${this.aiTool}`);
            console.log(`[ProjectCoach Capture] 📍 URL: ${window.location.href}`);
            
            // Wait for page to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.startCapture());
            } else {
                this.startCapture();
            }
            
            // Add debug helper to window for manual testing
            window.__projectcoachDebug = {
                scan: () => {
                    console.log(`[Debug] Manual scan triggered for ${this.aiTool}`);
                    this.scanExistingContent();
                },
                checkElement: (selector) => {
                    const elements = document.querySelectorAll(selector);
                    console.log(`[Debug] Found ${elements.length} elements matching "${selector}"`);
                    elements.forEach((el, i) => {
                        const text = el.textContent.trim();
                        console.log(`[Debug] Element ${i}: ${text.substring(0, 100)}... (${text.length} chars)`);
                    });
                    return elements;
                },
                getLastResponse: () => this.lastResponse,
                getCapturedCount: () => this.capturedResponses.length
            };
        }
        
        startCapture() {
            // Strategy 1: DOM Mutation Observer (works for most AI tools)
            this.setupMutationObserver();
            
            // Strategy 2: Network interception (for API-based tools)
            this.setupNetworkCapture();
            
            // Strategy 3: Event listeners (for specific AI tools)
            this.setupEventListeners();
            
            // Strategy 4: Periodic check (fallback)
            this.setupPeriodicCheck();
        }
        
        setupMutationObserver() {
            let mutationCount = 0;
            const observer = new MutationObserver((mutations) => {
                mutationCount++;
                // Log every 50th mutation for debugging (not too spammy)
                if (mutationCount % 50 === 0) {
                    console.log(`[ProjectCoach Capture] 🔄 ${this.aiTool}: ${mutationCount} mutations observed`);
                }
                
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' || mutation.type === 'characterData') {
                        // Check if this mutation added substantial content
                        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const text = node.textContent?.trim() || '';
                                    // Log if substantial content was added
                                    if (text.length > 50) {
                                        console.log(`[ProjectCoach Capture] ➕ ${this.aiTool}: Added ${text.length} chars: ${text.substring(0, 80)}...`);
                                    }
                                }
                            });
                        }
                        
                        this.checkForNewResponse(mutation.target);
                    }
                });
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
            
            console.log(`[ProjectCoach Capture] 👁️ MutationObserver active for ${this.aiTool}`);
            
            // AGGRESSIVE SCANNING: Check existing content multiple times to catch delayed responses
            // Some AIs take 10-30 seconds to fully render responses
            // DeepSeek and Perplexity need more frequent scanning
            const baseIntervals = [2000, 5000, 8000, 12000, 18000, 25000, 35000];
            const isSlowTool = this.aiTool === 'DeepSeek' || this.aiTool === 'Perplexity';
            const scanIntervals = isSlowTool 
                ? [1000, 2000, 3000, 5000, 7000, 10000, 15000, 20000, 25000, 30000, 35000, 40000] // More frequent for slow tools
                : baseIntervals;
            
            scanIntervals.forEach((delay, index) => {
                setTimeout(() => {
                    console.log(`[ProjectCoach Capture] 🔍 ${this.aiTool}: Scan ${index + 1}/${scanIntervals.length} (${delay/1000}s)`);
                    this.scanExistingContent();
                }, delay);
            });
            
            // Also set up a periodic check every 5 seconds for the first minute
            let periodicCheckCount = 0;
            const periodicInterval = setInterval(() => {
                periodicCheckCount++;
                if (periodicCheckCount <= 12) { // 12 * 5s = 60s
                    console.log(`[ProjectCoach Capture] 🔄 ${this.aiTool}: Periodic check ${periodicCheckCount}/12`);
                    this.scanExistingContent();
                } else {
                    clearInterval(periodicInterval);
                    console.log(`[ProjectCoach Capture] ✅ ${this.aiTool}: Stopped periodic checks after 60s`);
                }
            }, 5000);
        }
        
        checkForNewResponse(element) {
            // ChatGPT detection
            if (this.aiTool === 'ChatGPT') {
                const assistantMessage = element.closest('[data-message-author-role="assistant"]');
                if (assistantMessage) {
                    const markdown = assistantMessage.querySelector('.markdown, .prose, [class*="markdown"]');
                    if (markdown) {
                        const text = markdown.textContent.trim();
                        if (text && text !== this.lastResponse && text.length > 20) {
                            this.captureResponse(text);
                        }
                    }
                }
                
                // Also check for streaming text
                const streamingText = element.querySelector?.('.result-streaming, .streaming, [class*="streaming"]');
                if (streamingText) {
                    const text = streamingText.textContent.trim();
                    if (text && text.length > 20) {
                        this.captureResponse(text);
                    }
                }
            }
            
            // Claude detection - Enhanced with multiple selectors
            if (this.aiTool === 'Claude') {
                // Try multiple Claude-specific selectors
                const claudeSelectors = [
                    '[data-role="assistant"]',
                    '[class*="Message--assistant"]',
                    '[class*="message-assistant"]',
                    '.claude-message',
                    '[class*="AssistantMessage"]',
                    'div[class*="assistant"]',
                    'div[class*="Message"]:not([class*="user"]):not([class*="human"])'
                ];
                
                for (const selector of claudeSelectors) {
                    const claudeMessage = element.matches?.(selector) ? element : element.closest?.(selector);
                    if (claudeMessage) {
                        // Try to find content within the message
                        const contentSelectors = [
                            '.message-content',
                            '[class*="Content"]',
                            '.prose',
                            '[class*="prose"]',
                            'div[class*="text"]',
                            'p'
                        ];
                        
                        for (const contentSelector of contentSelectors) {
                            const content = claudeMessage.querySelector?.(contentSelector);
                            if (content) {
                                // CRITICAL: Remove script tags, style tags, and framework elements before extracting text
                                const clonedContent = content.cloneNode(true);
                                // Remove framework elements
                                clonedContent.querySelectorAll('script, style, [data-reactroot], [data-nextjs], [class*="intercom"], [id*="intercom"], [class*="keyframes"]').forEach(el => el.remove());
                                let text = clonedContent.textContent.trim();
                                
                                // Filter out CSS/framework patterns from text
                                text = this.filterFrameworkPatterns(text);
                                
                                // Claude responses are usually longer
                                if (text && text !== this.lastResponse && text.length > 30 && text.length < 50000) {
                                    // Check if it looks like an AI response (not a button or UI element)
                                    if (!text.match(/^(Click|Button|Send|Submit|Copy|Share)$/i)) {
                                        // Additional validation: should be natural language, not code/data
                                        const hasNaturalLanguage = text.split(/\s+/).length > 10 && 
                                                                  (text.match(/[a-zA-Z]/g) || []).length > text.length * 0.5;
                                        // Check it's not framework data
                                        const isFrameworkData = /self\.__next_f|__next_f|\["\$","\$L|requiresExplicitConsent|gpcDetected|appId|initializeDelay/.test(text);
                                        
                                        if (hasNaturalLanguage && !isFrameworkData) {
                                            this.captureResponse(text);
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Fallback: Use the message itself but filter out framework data
                        const allText = claudeMessage.textContent.trim();
                        if (allText && allText.length > 30 && allText.length < 50000) { // Reasonable max length
                            // Check it's not framework data
                            const isFrameworkData = /self\.__next_f|__next_f|\["\$","\$L|requiresExplicitConsent|gpcDetected|appId|initializeDelay/.test(allText);
                            if (!isFrameworkData) {
                                const hasNaturalLanguage = allText.split(/\s+/).length > 10 && 
                                                          (allText.match(/[a-zA-Z]/g) || []).length > allText.length * 0.5;
                                if (hasNaturalLanguage) {
                                    this.captureResponse(allText);
                                    return;
                                }
                            }
                        }
                    }
                }
                
                // Fallback: Check if element itself is a Claude response
                if (element.textContent && element.textContent.trim().length > 30) {
                    const parent = element.parentElement;
                    if (parent && (
                        parent.classList?.toString().includes('assistant') ||
                        parent.getAttribute('data-role') === 'assistant' ||
                        !parent.closest('[data-role="user"], [class*="user"], [class*="human"]')
                    )) {
                        const text = element.textContent.trim();
                        if (text && text !== this.lastResponse && text.length > 30) {
                            this.captureResponse(text);
                        }
                    }
                }
            }
            
            // DeepSeek detection - Enhanced
            if (this.aiTool === 'DeepSeek') {
                const deepseekSelectors = [
                    '[class*="message-assistant"]',
                    '[class*="assistant-message"]',
                    '[class*="ai-message"]',
                    '[data-role="assistant"]',
                    'div[class*="DeepSeek"]',
                    'div[class*="response"]:not([class*="user"])'
                ];
                
                for (const selector of deepseekSelectors) {
                    const deepseekMessage = element.matches?.(selector) ? element : element.closest?.(selector);
                    if (deepseekMessage) {
                        const text = deepseekMessage.textContent.trim();
                        if (text && text !== this.lastResponse && text.length > 30) {
                            // Exclude UI elements
                            if (!text.match(/^(Message|Send|Search|DeepThink)$/i) && 
                                !deepseekMessage.closest('button, input, textarea')) {
                                this.captureResponse(text);
                                return;
                            }
                        }
                    }
                }
                
                // Fallback: Look for content in common chat structures
                const chatContent = element.closest('[class*="chat"], [class*="conversation"], [class*="message"]');
                if (chatContent && !chatContent.closest('[class*="user"], [class*="human"]')) {
                    const text = chatContent.textContent.trim();
                    if (text && text !== this.lastResponse && text.length > 30) {
                        this.captureResponse(text);
                    }
                }
            }
            
            // Gemini detection - Enhanced with multiple selectors (Designer's recommendation)
            if (this.aiTool === 'Gemini') {
                const geminiSelectors = [
                    '[data-testid="conversation-turn"]:last-child',
                    '[data-message-author-role="model"]',
                    '[data-role="model"]',
                    '.model-response',
                    '[class*="model"]',
                    '[data-message-id]:last-child',
                    'div[class*="message"]:not([class*="user"]):not([class*="human"])',
                    // Look for markdown content (Gemini uses markdown)
                    '.markdown:has([data-message-author-role="model"])',
                    'div > div > div:last-child:has(p)'
                ];
                
                for (const selector of geminiSelectors) {
                    try {
                        const geminiResponse = element.matches?.(selector) ? element : element.closest?.(selector);
                        if (geminiResponse) {
                            // Try nested structures (Gemini often has nested divs)
                            const possibleContainers = [
                                geminiResponse.querySelector('.markdown'),
                                geminiResponse.querySelector('[data-message-text]'),
                                geminiResponse.querySelector('div > div > div:last-child'),
                                geminiResponse
                            ];
                            
                            for (const container of possibleContainers) {
                                if (container) {
                                    const text = container.textContent.trim();
                                    // Exclude UI elements and framework data
                                    if (text && text !== this.lastResponse && text.length > 50 && 
                                        !this.isFramework(text) && !container.closest('button, input, textarea')) {
                                        this.captureResponse(text);
                                        return;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Selector might not work - continue to next
                    }
                }
            }
            
            // Grok detection - Enhanced
            if (this.aiTool === 'Grok') {
                const grokSelectors = [
                    '[data-testid*="message"]',
                    '[class*="message"]:not([class*="user"]):not([class*="human"])',
                    '[class*="response"]',
                    '[class*="answer"]',
                    'div[class*="content"]:not([class*="input"])',
                    'main > div:last-child:has(p)',
                    'article:last-child:has(p)'
                ];
                
                for (const selector of grokSelectors) {
                    try {
                        const grokResponse = element.matches?.(selector) ? element : element.closest?.(selector);
                        if (grokResponse) {
                            const text = grokResponse.textContent.trim();
                            if (text && text !== this.lastResponse && text.length > 50 && 
                                !this.isFramework(text) && !grokResponse.closest('button, input, textarea')) {
                                this.captureResponse(text);
                                return;
                            }
                        }
                    } catch (e) {
                        // Selector might not work - continue
                    }
                }
            }
            
            // Perplexity detection - Enhanced with multiple strategies
            if (this.aiTool === 'Perplexity') {
                // Strategy 1: Look for answer containers
                const answerSelectors = [
                    '[class*="answer"]',
                    '[class*="Answer"]',
                    '[class*="response"]',
                    '[class*="Response"]',
                    '[data-role="assistant"]',
                    'div[class*="prose"]',
                    'div[class*="Prose"]'
                ];
                
                for (const selector of answerSelectors) {
                    const perplexityAnswer = element.matches?.(selector) ? element : element.closest?.(selector);
                    if (perplexityAnswer) {
                        // CRITICAL: Exclude UI elements (headers, nav, buttons, etc.)
                        if (perplexityAnswer.closest('header, nav, [class*="header"], [class*="nav"], [class*="sidebar"], [class*="toolbar"], [class*="banner"], [id*="header"], [id*="nav"]')) {
                            continue;
                        }
                        
                        // Exclude citation/source elements
                        if (perplexityAnswer.closest('[class*="citation"], [class*="source"], [class*="reference"]')) {
                            continue;
                        }
                        
                        let textContent = perplexityAnswer.textContent.trim();
                        
                        // Exclude if it's clearly UI text (download buttons, etc.)
                        if (textContent.match(/^(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Comet|Assistant|Power|Browser)$/i)) {
                            continue;
                        }
                        
                        // Perplexity citation removal (Designer's recommendation)
                        // Remove citation numbers like [1], [2], etc. but keep the text
                        textContent = textContent.replace(/\[\d+\]/g, '');
                        // Remove source URLs
                        textContent = textContent.replace(/https?:\/\/[^\s]+/g, '');
                        // Clean up extra whitespace
                        textContent = textContent.replace(/\s+/g, ' ').trim();
                        
                        const text = textContent;
                        
                        if (text && text !== this.lastResponse && text.length > 50) {
                            // Exclude if it's ONLY citations or URLs
                            if (!text.match(/^(\[\d+\]|\s)+$/) && 
                                !this.isFramework(text) &&
                                text.split(/\s+/).length > 10) { // At least 10 words
                                this.captureResponse(text);
                                return;
                            }
                        }
                    }
                }
                
                // Strategy 2: Look for main content area
                const mainContent = element.closest('[class*="main"], [class*="content"], [class*="answer-container"]');
                if (mainContent && !mainContent.closest('[class*="input"], [class*="question"], [class*="prompt"]')) {
                    const text = mainContent.textContent.trim();
                    if (text && text !== this.lastResponse && text.length > 50) {
                        // Check if it contains actual answer content (not just UI)
                        if (text.split(' ').length > 10) { // At least 10 words
                            this.captureResponse(text);
                        }
                    }
                }
            }
            
            // POE detection - Enhanced with better filtering to reduce contamination
            if (this.aiTool === 'Poe') {
                const poeSelectors = [
                    '[class*="Message_botMessage"]',
                    '[class*="botMessage"]',
                    '[class*="Message"]:not([class*="user"]):not([class*="human"]):not([class*="input"])',
                    '[class*="chatMessage"]:not([class*="user"])',
                    '[class*="BotMessage"]',
                    '[data-role="assistant"]',
                    '[data-author="bot"]'
                ];
                
                for (const selector of poeSelectors) {
                    try {
                        const poeMessage = element.matches?.(selector) ? element : element.closest?.(selector);
                        if (poeMessage) {
                            // CRITICAL: Exclude UI elements (navigation, buttons, headers, footers)
                            if (poeMessage.closest('header, nav, [class*="header"], [class*="nav"], [class*="sidebar"], [class*="toolbar"], [class*="banner"], [class*="menu"], [id*="header"], [id*="nav"], button, [class*="button"]')) {
                                continue;
                            }
                            
                            // Try to find content within the message (POE uses nested structures)
                            const contentSelectors = [
                                '[class*="Message_textContent"]',
                                '[class*="textContent"]',
                                '[class*="content"]:not([class*="input"]):not([class*="button"]):not([class*="link"])',
                                '[class*="markdown"]',
                                'div[class*="text"]:not([class*="button"]):not([class*="link"])',
                                'p:not([class*="button"])'
                            ];
                            
                            for (const contentSelector of contentSelectors) {
                                const content = poeMessage.querySelector?.(contentSelector);
                                if (content) {
                                    // CRITICAL: Exclude if content is in UI elements
                                    if (content.closest('button, a[href*="poe"], [class*="button"], [class*="link"], [class*="nav"], [class*="menu"], header, nav')) {
                                        continue;
                                    }
                                    
                                    // Clone to avoid modifying original
                                    const clonedContent = content.cloneNode(true);
                                    // Remove UI elements more aggressively
                                    clonedContent.querySelectorAll('button, a[href*="poe"], [class*="button"], [class*="link"], [class*="nav"], [class*="menu"], [class*="header"], [class*="sidebar"], [class*="toolbar"]').forEach(el => el.remove());
                                    let text = clonedContent.textContent.trim();
                                    
                                    // Filter out common POE UI patterns
                                    const poeUIPatterns = [
                                        /^(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account)$/i,
                                        /poe\.com/i,
                                        /Subscribe to/i,
                                        /Upgrade to/i,
                                        /Get started/i,
                                        /Sign (in|up)/i
                                    ];
                                    
                                    // Check if text starts with UI pattern
                                    if (poeUIPatterns.some(pattern => pattern.test(text.substring(0, 50)))) {
                                        continue;
                                    }
                                    
                                    // Filter out framework patterns
                                    text = this.filterFrameworkPatterns(text);
                                    
                                    // Additional POE-specific filtering
                                    // Remove common POE UI contamination
                                    text = text.replace(/\b(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account)\b/gi, '');
                                    text = text.replace(/poe\.com/gi, '');
                                    text = text.replace(/\s+/g, ' ').trim();
                                    
                                    if (text && text !== this.lastResponse && text.length > 50 && text.length < 50000) {
                                        // Check if it looks like an AI response (not UI)
                                        const hasNaturalLanguage = text.split(/\s+/).length > 10 && 
                                                                  (text.match(/[a-zA-Z]/g) || []).length > text.length * 0.5;
                                        
                                        // Check it's not mostly UI text
                                        const uiWordCount = (text.match(/\b(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account|poe\.com)\b/gi) || []).length;
                                        const totalWords = text.split(/\s+/).length;
                                        const uiRatio = uiWordCount / Math.max(totalWords, 1);
                                        
                                        if (hasNaturalLanguage && !this.isFramework(text) && uiRatio < 0.1) {
                                            this.captureResponse(text);
                                            return;
                                        }
                                    }
                                }
                            }
                            
                            // Fallback: Use the message itself, but with strict filtering
                            const allText = poeMessage.textContent.trim();
                            if (allText && allText.length > 50 && allText.length < 50000) {
                                // Exclude if it's clearly UI
                                if (poeUIPatterns.some(pattern => pattern.test(allText.substring(0, 50)))) {
                                    continue;
                                }
                                
                                if (!this.isFramework(allText)) {
                                    const hasNaturalLanguage = allText.split(/\s+/).length > 10 && 
                                                              (allText.match(/[a-zA-Z]/g) || []).length > allText.length * 0.5;
                                    
                                    // Check UI contamination
                                    const uiWordCount = (allText.match(/\b(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account|poe\.com)\b/gi) || []).length;
                                    const totalWords = allText.split(/\s+/).length;
                                    const uiRatio = uiWordCount / Math.max(totalWords, 1);
                                    
                                    if (hasNaturalLanguage && uiRatio < 0.1) {
                                        this.captureResponse(allText);
                                        return;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Selector might not work - continue
                    }
                }
            }
            
            // Universal fallback: Look for common patterns
            const commonPatterns = [
                '[data-role="assistant"]',
                '[data-author="assistant"]',
                '.assistant-message',
                '.ai-response',
                '.bot-message',
                '.model-response'
            ];
            
            for (const pattern of commonPatterns) {
                const match = element.matches?.(pattern) || element.closest?.(pattern);
                if (match) {
                    const text = match.textContent.trim();
                    if (text && text !== this.lastResponse && text.length > 20) {
                        // Check if it's not a user message
                        if (!match.closest('[data-role="user"], .user-message, [data-author="user"]')) {
                            this.captureResponse(text);
                        }
                    }
                }
            }
        }
        
        scanExistingContent() {
            // Scan for existing responses on page load - AI-specific
            let selectors = [];
            
            if (this.aiTool === 'ChatGPT') {
                selectors = [
                    '[data-message-author-role="assistant"]',
                    '[class*="assistant"]',
                    '.markdown'
                ];
            } else if (this.aiTool === 'Claude') {
                selectors = [
                    '[data-role="assistant"]',
                    '[class*="Message--assistant"]',
                    '[class*="assistant"]',
                    'div[class*="Message"]:not([class*="user"]):not([class*="human"])'
                ];
            } else if (this.aiTool === 'DeepSeek') {
                selectors = [
                    '[class*="assistant"]',
                    '[class*="ai-message"]',
                    '[class*="message-assistant"]',
                    '[class*="assistant-message"]',
                    '[data-role="assistant"]',
                    'div[class*="message"]:not([class*="user"]):not([class*="human"])',
                    'div[class*="DeepSeek"]',
                    'div[class*="response"]:not([class*="user"])',
                    '[class*="chat"] [class*="message"]:not([class*="user"])',
                    'main [class*="content"]:not([class*="input"])'
                ];
            } else if (this.aiTool === 'Grok') {
                // Grok-specific selectors
                selectors = [
                    '[data-testid*="message"]',
                    '[class*="message"]:not([class*="user"]):not([class*="human"])',
                    '[class*="response"]',
                    '[class*="answer"]',
                    'div[class*="content"]:not([class*="input"])',
                    'main > div:last-child:has(p)'
                ];
            } else if (this.aiTool === 'Gemini') {
                // Enhanced Gemini selectors (Designer's recommendation)
                selectors = [
                    '[data-testid="conversation-turn"]:last-child',
                    '[data-message-author-role="model"]',
                    '[data-role="model"]',
                    '.model-response',
                    '[class*="model"]',
                    '[data-message-id]:last-child',
                    '.markdown:has([data-message-author-role="model"])',
                    'div[class*="message"]:not([class*="user"]):not([class*="human"])'
                ];
            } else if (this.aiTool === 'Perplexity') {
                // Enhanced Perplexity selectors (Designer's recommendation)
                selectors = [
                    '[data-testid="search-result"]:last-child',
                    '[class*="answer"]',
                    '[class*="Answer"]',
                    '[class*="prose"]',
                    '[class*="Prose"]',
                    '.prose:has(.answer-content)',
                    'div[class*="content"]:not([class*="input"])',
                    'main > div:last-child:has(p)',
                    '[class*="response"]:not([class*="input"])',
                    '[class*="Response"]:not([class*="input"])',
                    '[data-role="assistant"]',
                    'article[class*="answer"]',
                    'section[class*="answer"]'
                ];
            } else if (this.aiTool === 'Poe') {
                // Enhanced POE selectors for comprehensive capture
                selectors = [
                    '[class*="Message_botMessage"]',
                    '[class*="botMessage"]',
                    '[class*="message"]:not([class*="user"]):not([class*="human"])',
                    '[class*="response"]',
                    '[class*="chatMessage"]',
                    '[class*="Message"]:not([class*="user"]):not([class*="human"])',
                    'div[class*="bot"]',
                    '[class*="BotMessage"]',
                    '[data-role="assistant"]',
                    '[data-author="bot"]',
                    'article[class*="message"]:not([class*="user"])',
                    '[class*="Message_textContent"]',
                    '[class*="textContent"]',
                    '[class*="content"]:not([class*="input"]):not([class*="prompt"])',
                    'main > div:last-child:has(p)',
                    'div[class*="text"]:not([class*="input"])'
                ];
            } else {
                // Universal fallback
                selectors = [
                    '[data-message-author-role="assistant"]',
                    '[data-role="assistant"]',
                    '.assistant-message',
                    '.ai-response',
                    '.model-response'
                ];
            }
            
                    selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        // Exclude UI elements - Enhanced filtering
                        if (el.closest('button, input, textarea, nav, header, footer, [class*="header"], [class*="nav"], [class*="sidebar"], [class*="menu"], [class*="toolbar"], [id*="header"], [id*="nav"]')) {
                            return;
                        }
                        
                        // Additional UI element checks
                        const elText = el.textContent?.trim() || '';
                        
                        // POE-specific UI filtering
                        if (this.aiTool === 'Poe') {
                            // Exclude POE-specific UI patterns
                            if (elText.match(/^(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account)$/i) ||
                                elText.match(/poe\.com/i) ||
                                elText.match(/Subscribe to|Upgrade to|Get started|Sign (in|up)/i)) {
                                return;
                            }
                            
                            // Check UI contamination ratio
                            const uiWordCount = (elText.match(/\b(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account|poe\.com)\b/gi) || []).length;
                            const totalWords = elText.split(/\s+/).length;
                            const uiRatio = uiWordCount / Math.max(totalWords, 1);
                            
                            if (uiRatio > 0.1) {
                                return; // Too much UI contamination
                            }
                        } else {
                            // Exclude common UI text patterns for other tools
                            if (elText.match(/^(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support)$/i)) {
                                return;
                            }
                        }
                        
                        // Exclude if element contains only links/buttons
                        const hasOnlyLinksOrButtons = el.querySelectorAll('a, button').length > 0 && 
                                                      el.querySelectorAll('p, div, span').length <= 1;
                        if (hasOnlyLinksOrButtons) {
                            return;
                        }
                        
                        const text = el.textContent.trim();
                        // Minimum lengths: Perplexity, Gemini, and Grok need more content
                        const minLength = (this.aiTool === 'Perplexity' || this.aiTool === 'Gemini' || this.aiTool === 'Grok') ? 50 : 30;
                        
                        if (text && text.length > minLength) {
                            // Check if it's actual content (not just UI text)
                            const wordCount = text.split(/\s+/).length;
                            // More words needed for longer responses
                            const minWords = (this.aiTool === 'Perplexity' || this.aiTool === 'Gemini') ? 10 : 5;
                            
                            if (wordCount > minWords && !this.isFramework(text)) {
                                console.log(`[ProjectCoach Capture] ✅ ${this.aiTool}: Captured ${text.length} chars from selector "${selector}"`);
                                this.captureResponse(text);
                            }
                        }
                    });
                } catch (e) {
                    // Selector might not be valid - skip
                }
            });
            
            // Also do a broader scan for any large text blocks that might be responses
            // This is a fallback for tools that don't match specific selectors
            setTimeout(() => {
                console.log(`[ProjectCoach Capture] 🔍 Starting broad scan for ${this.aiTool}...`);
                const allDivs = document.querySelectorAll('div, p, article, section');
                let foundCount = 0;
                
                allDivs.forEach(div => {
                    const text = div.textContent.trim();
                    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
                    
                    // Look for substantial text blocks (likely responses)
                    // Minimum: 100 chars and 15 words
                    if (text.length > 100 && wordCount > 15) {
                        // Check if it's not in a UI element
                        const isUIElement = div.closest('button, input, textarea, nav, header, footer, [class*="input"], [class*="prompt"], [class*="button"], [class*="menu"]');
                        
                        if (!isUIElement) {
                            // Check if parent doesn't have user/human class
                            const isUserMessage = div.closest('[class*="user"], [class*="human"], [data-role="user"], [data-author="user"]');
                            
                            if (!isUserMessage) {
                                // Check if it's not already captured
                                const isDuplicate = this.capturedResponses.some(r => {
                                    const existingStart = r.response.substring(0, 100);
                                    return existingStart === text.substring(0, 100);
                                });
                                
                                if (!isDuplicate) {
                                    console.log(`[ProjectCoach Capture] 📦 Broad scan found potential response (${text.length} chars, ${wordCount} words)`);
                                    console.log(`[ProjectCoach Capture] Preview: ${text.substring(0, 150)}...`);
                                    foundCount++;
                                    this.captureResponse(text);
                                }
                            }
                        }
                    }
                });
                
                console.log(`[ProjectCoach Capture] 🔍 Broad scan complete: found ${foundCount} potential responses`);
            }, 3000); // Wait 3 seconds for page to fully load
            
            // Even more aggressive: scan all text nodes
            setTimeout(() => {
                console.log(`[ProjectCoach Capture] 🔍 Starting text node scan for ${this.aiTool}...`);
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null
                );
                
                let node;
                const textBlocks = [];
                
                while (node = walker.nextNode()) {
                    const text = node.textContent.trim();
                    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
                    
                    if (text.length > 150 && wordCount > 20) {
                        // Check if parent is not a UI element
                        const parent = node.parentElement;
                        if (parent && !parent.closest('button, input, textarea, nav, header, footer, [class*="input"], [class*="prompt"]')) {
                            // Check if it's not a user message
                            if (!parent.closest('[class*="user"], [class*="human"], [data-role="user"]')) {
                                textBlocks.push({
                                    text: text,
                                    parent: parent,
                                    length: text.length,
                                    words: wordCount
                                });
                            }
                        }
                    }
                }
                
                // Sort by length (longest first) and capture top candidates
                textBlocks.sort((a, b) => b.length - a.length);
                textBlocks.slice(0, 3).forEach(block => { // Top 3 candidates
                    const isDuplicate = this.capturedResponses.some(r => {
                        const existingStart = r.response.substring(0, 100);
                        return existingStart === block.text.substring(0, 100);
                    });
                    
                    if (!isDuplicate) {
                        console.log(`[ProjectCoach Capture] 📦 Text node scan found: ${block.length} chars, ${block.words} words`);
                        this.captureResponse(block.text);
                    }
                });
            }, 5000); // Wait 5 seconds for responses to fully render
        }
        
        setupNetworkCapture() {
            // Intercept fetch requests
            const originalFetch = window.fetch;
            window.fetch = async (...args) => {
                const response = await originalFetch(...args);
                
                // Clone to read without affecting original
                const cloned = response.clone();
                
                try {
                    const data = await cloned.json();
                    
                    // OpenAI/ChatGPT
                    if (data?.choices?.[0]?.message?.content) {
                        this.captureResponse(data.choices[0].message.content);
                    }
                    
                    // Anthropic/Claude
                    if (data?.content?.[0]?.text) {
                        this.captureResponse(data.content[0].text);
                    }
                    
                    // Google/Gemini
                    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                        this.captureResponse(data.candidates[0].content.parts[0].text);
                    }
                } catch (e) {
                    // Not JSON or already consumed
                }
                
                return response;
            };
        }
        
        setupEventListeners() {
            // Listen for common events that indicate new responses
            document.addEventListener('click', (e) => {
                // Check if send button was clicked (new prompt)
                if (e.target.matches?.('button[type="submit"], button[data-testid*="send"], button[aria-label*="Send"]')) {
                    setTimeout(() => {
                        this.extractPrompt();
                    }, 500);
                }
            });
        }
        
        setupPeriodicCheck() {
            // AGGRESSIVE FALLBACK: Check frequently for new content
            // Some AIs (Grok, DeepSeek, Perplexity) may not trigger MutationObserver reliably
            // Check more frequently for the first 60 seconds after page load
            // DeepSeek and Perplexity need even more frequent checks
            const isSlowTool = this.aiTool === 'DeepSeek' || this.aiTool === 'Perplexity';
            const interval = isSlowTool ? 1000 : 2000; // Check every 1s for slow tools, 2s for others
            
            let checkCount = 0;
            const maxChecks = isSlowTool ? 60 : 30; // 60 checks for slow tools (60s), 30 for others (60s)
            
            const periodicInterval = setInterval(() => {
                checkCount++;
                
                // Always scan for the first 60 seconds (30 checks)
                // After that, only scan if we haven't captured a response recently
                const lastCapture = this.capturedResponses[this.capturedResponses.length - 1];
                const timeSinceLastCapture = lastCapture ? Date.now() - lastCapture.timestamp : Infinity;
                const shouldScan = checkCount <= maxChecks || timeSinceLastCapture > 10000;
                
                if (shouldScan) {
                    if (checkCount % 5 === 0) { // Log every 5th check (every 10s)
                        console.log(`[ProjectCoach Capture] 🔄 ${this.aiTool}: Periodic check ${checkCount}/${maxChecks}`);
                    }
                    this.scanExistingContent();
                }
                
                // Stop after maxChecks if we've captured a response
                if (checkCount >= maxChecks && lastCapture && timeSinceLastCapture < 5000) {
                    clearInterval(periodicInterval);
                    console.log(`[ProjectCoach Capture] ✅ ${this.aiTool}: Stopped periodic checks (response captured)`);
                }
            }, interval);
        }
        
        extractPrompt() {
            // Try to extract the last user prompt
            const promptSelectors = [
                '[data-message-author-role="user"]',
                '[data-role="user"]',
                '.user-message',
                'textarea[placeholder*="message"], textarea[placeholder*="ask"], textarea[placeholder*="prompt"]'
            ];
            
            for (const selector of promptSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const text = element.textContent || element.value || '';
                    if (text.trim().length > 5) {
                        this.lastPrompt = text.trim();
                        return this.lastPrompt;
                    }
                }
            }
            
            return this.lastPrompt;
        }
        
        // Enhanced framework pattern filtering (Designer's recommendation)
        filterFrameworkPatterns(text) {
            if (!text) return '';
            
            // Remove CSS/JS framework patterns
            const patterns = [
                /@keyframes\s+\w+\s*{[^}]*}/g,  // CSS keyframes
                /@media\s+[^{]*{[^}]*}/g,  // CSS media queries
                /\.\w+\s*{[^}]*}/g,  // CSS class definitions
                /__next_f.*?\n/g,  // Next.js internals
                /React\.[A-Z][a-zA-Z]*/g,  // React components
                /intercom-[a-z-]*/g,  // Intercom widgets
                /app-launcher/g,  // Intercom app launcher
                /animation.*:/g,  // CSS animations
                /transform.*scale/g  // CSS transforms
            ];
            
            patterns.forEach(pattern => {
                text = text.replace(pattern, '');
            });
            
            return text.trim();
        }
        
        // Enhanced framework detection (Designer's recommendation)
        isFramework(text) {
            if (!text) return false;
            
            // Check for framework patterns
            const frameworkPatterns = [
                '@keyframes', '@media', '.css', 'animation', 'transform', 'opacity',
                'useState', 'useEffect', 'Component', 'React.', '__next_f',
                'intercom', 'app-launcher', 'self.__next_f'
            ];
            
            // Check if text starts with CSS/framework indicators
            if (text.trim().startsWith('@') || text.trim().startsWith('.')) {
                return true;
            }
            
            // Check for framework keywords
            const hasFramework = frameworkPatterns.some(pattern => 
                text.includes(pattern)
            );
            
            return hasFramework;
        }
        
        captureResponse(text, immediate = false) {
            // POE-specific cleaning: Remove UI contamination before other checks
            if (this.aiTool === 'Poe' && text) {
                // Remove common POE UI patterns
                text = text.replace(/\b(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account)\b/gi, '');
                text = text.replace(/poe\.com/gi, '');
                text = text.replace(/Subscribe to|Upgrade to|Get started|Sign (in|up)/gi, '');
                // Clean up extra whitespace
                text = text.replace(/\s+/g, ' ').trim();
                
                // Check UI contamination ratio
                const uiWordCount = (text.match(/\b(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Settings|Profile|Account|poe\.com)\b/gi) || []).length;
                const totalWords = text.split(/\s+/).length;
                const uiRatio = uiWordCount / Math.max(totalWords, 1);
                
                // If too much UI contamination, reject
                if (uiRatio > 0.15) {
                    console.log(`[ProjectCoach Capture] ⚠️ Rejecting POE response with high UI contamination (${(uiRatio * 100).toFixed(1)}%)`);
                    return;
                }
            }
            
            // CRITICAL: Filter out React/Next.js internal data and framework code
            // These patterns indicate we're capturing internal state, not actual responses
            const frameworkPatterns = [
                /self\.__next_f\.push/i,
                /__next_f/i,
                /\["\$","\$L\d+/i,  // React internal markers
                /requiresExplicitConsent/i,
                /gpcDetected/i,
                /appId/i,
                /initializeDelay/i,
                /locale/i,
                /messages/i,
                /organizationName/i,
                /subscription/i,
                /renew.*plan/i,
                /^\s*\{.*"children":/i,  // JSON-like structures
                /^\s*\[.*"\$"/i,  // React internal arrays
                /@keyframes/i,  // CSS animations (framework data)
                /intercom/i,  // Intercom widget code
                /app-launcher/i,  // Intercom app launcher
                /\.css/i,  // CSS references
                /style.*\{/i,  // Inline styles
                /animation.*:/i,  // CSS animations
                /transform.*scale/i  // CSS transforms (common in framework code)
            ];
            
            // Check if text contains framework internals
            const isFrameworkData = frameworkPatterns.some(pattern => pattern.test(text));
            if (isFrameworkData) {
                console.log(`[ProjectCoach Capture] ⚠️ Rejecting framework/internal data (${text.length} chars)`);
                console.log(`[ProjectCoach Capture] Preview: ${text.substring(0, 200)}...`);
                return;
            }
            
            // CRITICAL: Check for specific suspicious patterns that indicate framework data
            // CRITICAL: Filter out framework data that's often exactly 5268 chars (React/Next.js internal data)
            // This pattern appears in Claude, Mistral, and other React-based AI interfaces
            if (text.length > 4000 && text.length < 6000) {
                // Check if it's mostly special characters or has suspicious patterns
                const specialCharRatio = (text.match(/[{}[\]:,"<>()]/g) || []).length / Math.max(text.length, 1);
                
                // Check for React/component patterns that indicate framework data
                const hasReactPatterns = /self\.__next_f|__next_f|React\.|Component|useState|useEffect|props\.|state\./i.test(text);
                
                // Check for JSON-like structures that are too large (likely framework data)
                const jsonLikeRatio = (text.match(/[{}\[\]:,"]/g) || []).length / Math.max(text.length, 1);
                const hasSuspiciousPatterns = /__next|react|component|props|state|render|hydrate/i.test(text);
                
                // ENHANCED: Also check word count - framework data has many short "words" (JSON keys)
                const words = text.split(/\s+/).filter(w => w.length > 0);
                const shortWords = words.filter(w => w.length <= 3).length;
                const shortWordRatio = shortWords / Math.max(words.length, 1);
                
                // CRITICAL: Also check for CSS/framework patterns in the suspicious size range
                const hasCSSPatterns = /@keyframes|@media|\.css|style.*\{|animation.*:|transform.*scale|intercom|app-launcher/i.test(text);
                
                // REJECT if ANY of these conditions are true:
                // 1. High special char ratio (>15%)
                // 2. Has React/framework patterns
                // 3. High JSON ratio (>20%) for long texts
                // 4. Too many short words (>40% are 3 chars or less) - indicates JSON keys
                // 5. Has CSS patterns (keyframes, animations, etc.) - framework data
                if (specialCharRatio > 0.15 || hasSuspiciousPatterns || hasReactPatterns || 
                    (jsonLikeRatio > 0.20 && text.length > 3000) || shortWordRatio > 0.40 || hasCSSPatterns) {
                    console.log(`[ProjectCoach Capture] ⚠️ Rejecting suspicious ${text.length} char capture:`);
                    console.log(`   Special char ratio: ${(specialCharRatio * 100).toFixed(1)}%`);
                    console.log(`   Has React patterns: ${hasReactPatterns}`);
                    console.log(`   Has suspicious patterns: ${hasSuspiciousPatterns}`);
                    console.log(`   JSON-like ratio: ${(jsonLikeRatio * 100).toFixed(1)}%`);
                    console.log(`   Short word ratio: ${(shortWordRatio * 100).toFixed(1)}%`);
                    console.log(`   Preview: ${text.substring(0, 200)}...`);
                    return; // Reject this capture
                }
            }
            
            // Check if text is mostly JSON-like structures (not natural language)
            const jsonLikeRatio = (text.match(/[{}[\]:,"]/g) || []).length / Math.max(text.length, 1);
            if (jsonLikeRatio > 0.1 && text.length > 1000) {
                // If more than 10% of characters are JSON syntax and it's long, likely not a response
                console.log(`[ProjectCoach Capture] ⚠️ Rejecting JSON-like data (ratio: ${(jsonLikeRatio * 100).toFixed(1)}%)`);
                return;
            }
            
            // Minimum length varies by AI tool
            const minLength = (this.aiTool === 'Perplexity' || this.aiTool === 'Gemini' || this.aiTool === 'Grok') ? 50 : 30;
            
            // Avoid capturing very short text
            if (text.length < minLength) {
                return;
            }
            
            // CRITICAL: Reject UI text patterns (headers, navigation, buttons, banners)
            const uiTextPatterns = [
                /^(Download|Get|Sign|Log|Subscribe|Upgrade|Buy|Shop|Menu|Home|About|Contact|Help|Support|Comet|Assistant|Power|Browser)/i,
                /Get AI power in your browser/i,
                /Comet Assistant/i,
                /What do you want to know\?/i,
                /Ask anything\.\.\./i,
                /Search.*2025.*Review/i,
                /The Questions, Themes, and Moments/i
            ];
            
            if (uiTextPatterns.some(pattern => pattern.test(text))) {
                console.log(`[ProjectCoach Capture] ⚠️ Rejecting UI text: ${text.substring(0, 100)}...`);
                return;
            }
            
            // Check if text is substantial (not just UI elements)
            const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
            const minWords = (this.aiTool === 'Perplexity' || this.aiTool === 'Gemini') ? 10 : 5;
            if (wordCount < minWords) {
                return;
            }
            
            // Check if text looks like natural language (not code/data structures)
            // Natural language should have more letters than special characters
            const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
            const specialCharCount = (text.match(/[{}[\]:,"<>]/g) || []).length;
            if (specialCharCount > letterCount * 0.3 && text.length > 500) {
                // Too many special characters relative to letters - likely code/data
                console.log(`[ProjectCoach Capture] ⚠️ Rejecting code-like data (special chars: ${specialCharCount}, letters: ${letterCount})`);
                return;
            }
            
            // CRITICAL: Notify state manager of streaming progress
            // This allows comparison window to show real-time updates
            if (typeof window !== 'undefined' && window.responseStateManager) {
                window.responseStateManager.setState(this.aiTool, {
                    status: 'streaming',
                    content: text,
                    html: text,
                    timestamp: Date.now(),
                    source: 'streaming'
                });
            }
            
            // Update pending response if this is longer (more complete)
            if (!this.pendingResponse || text.length > this.pendingResponse.length) {
                this.pendingResponse = {
                    text: text,
                    length: text.length,
                    timestamp: Date.now()
                };
                this.lastMutationTime = Date.now();
            }
            
            // If immediate capture requested (e.g., from network), capture now
            if (immediate) {
                this.finalizeCapture();
                return;
            }
            
            // Debounce: Wait for response to stabilize (no mutations for 3-4 seconds)
            // Longer debounce for better quality - prevents capturing partial/contaminated responses
            // Clear existing timer
            if (this.stableResponseTimeout) {
                clearTimeout(this.stableResponseTimeout);
            }
            
            // Use longer debounce for slower tools or when response is still growing
            // If response is getting longer, wait longer to ensure it's complete
            const isStillGrowing = this.pendingResponse && text.length > this.pendingResponse.length * 1.1;
            const isSlowTool = this.aiTool === 'DeepSeek' || this.aiTool === 'Perplexity' || this.aiTool === 'Gemini';
            const debounceTime = (isStillGrowing || isSlowTool) ? 4000 : 3000; // 4s for growing/slow, 3s for others
            
            // Set new timer - capture after debounce time of inactivity
            this.stableResponseTimeout = setTimeout(() => {
                this.finalizeCapture();
            }, debounceTime);
        }
        
        finalizeCapture() {
            if (!this.pendingResponse) {
                return;
            }
            
            const text = this.pendingResponse.text;
            
            // CRITICAL: Reject if response is getting significantly shorter - indicates partial/contaminated capture
            // But be less aggressive - only reject if it's MUCH shorter (50%+ reduction)
            // This prevents rejecting valid responses that are just slightly shorter
            if (this.lastResponse && text.length < this.lastResponse.length * 0.5) {
                console.log(`[ProjectCoach Capture] ⚠️ Rejecting much shorter response (${text.length} < ${this.lastResponse.length} chars, ${((1 - text.length/this.lastResponse.length) * 100).toFixed(1)}% reduction) - likely partial/contaminated`);
                console.log(`[ProjectCoach Capture] Preview: ${text.substring(0, 150)}...`);
                this.pendingResponse = null;
                return;
            }
            
            // Check if this is significantly different from last captured response
            // (at least 20% longer or first 100 chars are different)
            const isSignificantlyDifferent = !this.lastResponse || 
                text.length > this.lastResponse.length * 1.2 ||
                text.substring(0, 100) !== this.lastResponse.substring(0, 100);
            
            if (!isSignificantlyDifferent && this.lastResponse) {
                // If new response is shorter or similar, keep the longer one
                // But only if it's not a significant improvement (more than 10% longer)
                if (text.length <= this.lastResponse.length * 1.1) {
                    console.log(`[ProjectCoach Capture] ⏭️ Keeping existing response (${this.lastResponse.length} vs ${text.length} chars, difference: ${((text.length - this.lastResponse.length) / this.lastResponse.length * 100).toFixed(1)}%)`);
                    this.pendingResponse = null;
                    return;
                }
            }
            
            // This is a new or significantly longer response - capture it
            this.lastResponse = text;
            this.pendingResponse = null;
            
            // Extract prompt if not already captured
            const prompt = this.extractPrompt() || this.lastPrompt || 'Unknown prompt';
            
            const captureData = {
                aiTool: this.aiTool,
                prompt: prompt,
                response: text,
                timestamp: Date.now(),
                url: window.location.href,
                source: 'auto-capture'
            };
            
            this.capturedResponses.push(captureData);
            
            // CRITICAL: Update state manager to 'captured' status
            // This notifies all listeners (including comparison window) that response is complete
            if (typeof window !== 'undefined' && window.responseStateManager) {
                window.responseStateManager.setState(this.aiTool, {
                    status: 'captured',
                    content: text,
                    html: text,
                    timestamp: Date.now(),
                    source: 'captured',
                    metadata: {
                        length: text.length,
                        wordCount: text.split(/\s+/).filter(w => w.length > 0).length
                    }
                });
            }
            
            // Send to Electron main process via postMessage
            // The preload script will forward this via IPC
            window.postMessage({
                type: 'AI_RESPONSE_CAPTURED',
                data: captureData
            }, '*');
            
            console.log(`[ProjectCoach Capture] ✅ Captured ${this.aiTool} response (${text.length} chars) - STABLE`);
            console.log(`[ProjectCoach Capture] Preview: ${text.substring(0, 100)}...`);
            
            // Also try direct IPC if available (for Electron)
            if (window.electronAPI && window.electronAPI.sendCapturedResponse) {
                try {
                    window.electronAPI.sendCapturedResponse(captureData);
                } catch (e) {
                    // Fallback to postMessage if direct IPC fails
                }
            }
        }
    }
    
    // Initialize capture
    const captureInstance = new AICapture();
    
    // Expose captureCurrentResponse function for on-demand capture
    window.captureCurrentResponse = function() {
        // Return the last captured response
        if (captureInstance.lastResponse && captureInstance.lastResponse.length > 30) {
            return captureInstance.lastResponse;
        }
        
        // Fallback: Try to get the most recent response from capturedResponses array
        if (captureInstance.capturedResponses && captureInstance.capturedResponses.length > 0) {
            const latest = captureInstance.capturedResponses[captureInstance.capturedResponses.length - 1];
            if (latest && latest.response && latest.response.length > 30) {
                return latest.response;
            }
        }
        
        // Final fallback: Try scanning the page right now
        try {
            captureInstance.scanExistingContent();
            // Wait a moment for scan to complete, then return lastResponse
            if (captureInstance.lastResponse && captureInstance.lastResponse.length > 30) {
                return captureInstance.lastResponse;
            }
        } catch (e) {
            console.log('[ProjectCoach Capture] Error in fallback scan:', e);
        }
        
        return '';
    };
    
    console.log('[ProjectCoach Capture] ✅ captureCurrentResponse function exposed');
})();


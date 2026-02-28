/**
 * Test Backend Server for ProjectCoachAI
 * Run this locally to test the ResponseExtractor before deploying
 * 
 * Usage:
 *   1. npm install express cors
 *   2. Set API keys in .env file
 *   3. node server.js
 *   4. Test with: curl -X POST http://localhost:3001/api/ai/query ...
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
// Load .env from current directory (test-backend)
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Use node-fetch for Node.js (fetch may not be available in older versions)
let fetch;
try {
    fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
    // If node-fetch not installed, we'll install it
    console.warn('⚠️  node-fetch not found. Installing...');
    try {
        fetch = require('node-fetch');
    } catch (e2) {
        console.error('❌ Please install node-fetch: npm install node-fetch@2');
        process.exit(1);
    }
}

// Import ResponseExtractor (copy from parent directory)
const ResponseExtractor = require('../ResponseExtractor');

// Import Content Capture Metrics
const ContentCaptureMetrics = require('./content-capture-metrics.js');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
// Increase body size limit to handle large AI responses (50MB should be more than enough)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Normalize provider names (accept multiple variations for each provider)
function normalizeProvider(aiProvider) {
    const normalizedProvider = aiProvider.toLowerCase();
    const providerMap = {
        // OpenAI/ChatGPT variations
        'openai': 'chatgpt',
        'chatgpt': 'chatgpt',
        // Anthropic/Claude
        'claude': 'claude',
        'anthropic': 'claude',
        // Google/Gemini
        'gemini': 'gemini',
        'google': 'gemini',
        'vertex': 'gemini', // Google Vertex AI
        // Perplexity
        'perplexity': 'perplexity',
        // DeepSeek
        'deepseek': 'deepseek',
        // Grok (xAI)
        'grok': 'grok',
        'xai': 'grok',
        // Azure OpenAI
        'azure': 'azure',
        'azure-openai': 'azure',
        'azureopenai': 'azure',
        // Mistral
        'mistral': 'mistral',
        // Poe
        'poe': 'poe'
    };
    
    const mappedProvider = providerMap[normalizedProvider];
    if (!mappedProvider) {
        throw new Error(`Unsupported AI: ${aiProvider}. Supported: chatgpt, claude, gemini, perplexity, deepseek, grok, azure, mistral, poe`);
    }
    
    return mappedProvider;
}

// AI Service Adapters
// AI Provider Configuration - Unified approach based on ChatGPT's working pattern
const AI_CONFIGS = {
    chatgpt: {
        apiKeyEnv: 'OPENAI_API_KEY',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o',
        providerName: 'OpenAI',
        // ChatGPT pattern: standard OpenAI-compatible API
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        getBody: (prompt) => ({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    },
    perplexity: {
        apiKeyEnv: 'PERPLEXITY_API_KEY',
        endpoint: 'https://api.perplexity.ai/chat/completions',
        model: 'sonar',  // Try simple model name first
        providerName: 'Perplexity',
        // Same pattern as ChatGPT (OpenAI-compatible)
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        getBody: (prompt) => ({
            model: 'sonar',  // Try simple model name first
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    },
    claude: {
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307', // Unified: configurable via env (like Azure), using commonly available model
        providerName: 'Anthropic',
        // Minor enhancement: different header format
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        }),
        getBody: (prompt) => ({
            model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307', // Unified: configurable via env (like Azure), using commonly available model
            max_tokens: 4096, // Claude Haiku max is 4096 (other models like Sonnet/Opus support 8192)
            messages: [{ role: 'user', content: prompt }]
        }),
        // Minor enhancement: different response structure
        extractContent: (data) => {
            if (data.content && Array.isArray(data.content)) {
                return data.content.map(block => block.text || '').join('\n\n');
            }
            return data.content?.[0]?.text || '';
        }
    },
    gemini: {
        apiKeyEnv: 'GOOGLE_API_KEY',
        endpoint: (apiKey) => `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        model: 'gemini-2.5-flash',
        providerName: 'Gemini',
        // Minor enhancement: API key in URL, different body structure
        getHeaders: () => ({
            'Content-Type': 'application/json'
        }),
        getBody: (prompt) => ({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 8000 }
        }),
        // Minor enhancement: extract from parts, handle media
        extractContent: (data) => {
            if (!data.candidates?.[0]?.content?.parts) {
                throw new Error(`Invalid response format - ${JSON.stringify(data)}`);
            }
            const parts = data.candidates[0].content.parts || [];
            const mediaItems = [];
            let fullContent = '';
            
            parts.forEach(part => {
                if (part.text) {
                    fullContent += (fullContent ? '\n\n' : '') + part.text;
                }
                if (part.inlineData) {
                    mediaItems.push({
                        type: 'image',
                        mimeType: part.inlineData.mimeType,
                        data: part.inlineData.data,
                        format: 'base64'
                    });
                }
                if (part.fileData) {
                    mediaItems.push({
                        type: part.fileData.mimeType?.startsWith('video/') ? 'video' : 'file',
                        mimeType: part.fileData.mimeType,
                        fileUri: part.fileData.fileUri
                    });
                }
            });
            
            // Return structured response with media (minor enhancement for Gemini)
            return {
                text: fullContent || '',
                media: mediaItems,
                rawApiResponse: data
            };
        }
    },
    // DeepSeek - OpenAI-compatible API
    deepseek: {
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat',
        providerName: 'DeepSeek',
        // Same pattern as ChatGPT (OpenAI-compatible)
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        getBody: (prompt) => ({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    },
    // Grok (xAI) - OpenAI-compatible API
    grok: {
        apiKeyEnv: 'XAI_API_KEY',
        endpoint: 'https://api.x.ai/v1/chat/completions',
        model: 'grok-3',
        providerName: 'Grok (xAI)',
        // Same pattern as ChatGPT (OpenAI-compatible)
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        getBody: (prompt) => ({
            model: 'grok-3',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    },
    // Azure OpenAI - OpenAI-compatible API with custom endpoint
    azure: {
        apiKeyEnv: 'AZURE_OPENAI_API_KEY',
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || '', // Will be set via env var
        model: process.env.AZURE_OPENAI_MODEL || 'gpt-4',
        providerName: 'Azure OpenAI',
        // Same pattern as ChatGPT but with Azure-specific headers
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'api-key': apiKey // Azure uses 'api-key' instead of 'Authorization'
        }),
        getBody: (prompt) => ({
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    },
    // Mistral AI - OpenAI-compatible API
    mistral: {
        apiKeyEnv: 'MISTRAL_API_KEY',
        endpoint: 'https://api.mistral.ai/v1/chat/completions',
        model: 'mistral-large-latest',
        providerName: 'Mistral AI',
        // Same pattern as ChatGPT (OpenAI-compatible)
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        getBody: (prompt) => ({
            model: 'mistral-large-latest',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    },
    // Poe - OpenAI-compatible API
    poe: {
        apiKeyEnv: 'POE_API_KEY',
        endpoint: 'https://api.poe.com/v1/chat/completions',
        model: 'Claude-Sonnet-4', // Default model, can be changed via env var
        providerName: 'Poe',
        // Same pattern as ChatGPT (OpenAI-compatible)
        getHeaders: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        getBody: (prompt) => ({
            model: process.env.POE_MODEL || 'Claude-Sonnet-4', // Allow model selection via env
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        }),
        extractContent: (data) => data.choices?.[0]?.message?.content || ''
    }
};

// Unified AI call function - based on ChatGPT's working pattern
async function callAIService(aiProvider, prompt) {
    const normalizedProvider = normalizeProvider(aiProvider);
    const config = AI_CONFIGS[normalizedProvider];
    
    if (!config) {
        throw new Error(`Unsupported AI: ${aiProvider}`);
    }
    
    // Get API key
    const apiKey = process.env[config.apiKeyEnv] || 
                   (config.apiKeyEnv === 'GOOGLE_API_KEY' ? process.env.GEMINI_API_KEY : null);
    
    if (!apiKey) {
        throw new Error(`${config.providerName} API key not set (${config.apiKeyEnv})`);
    }
    
    // Build endpoint (may be function for some providers like Gemini, or env var for Azure)
    let endpoint;
    if (typeof config.endpoint === 'function') {
        endpoint = config.endpoint(apiKey);
    } else if (normalizedProvider === 'azure') {
        // Azure requires endpoint from env var
        endpoint = config.endpoint || process.env.AZURE_OPENAI_ENDPOINT;
        if (!endpoint) {
            throw new Error('Azure OpenAI endpoint not set (AZURE_OPENAI_ENDPOINT)');
        }
        // Azure endpoint format: https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview
        if (!endpoint.includes('/chat/completions')) {
            endpoint = `${endpoint.replace(/\/$/, '')}/chat/completions?api-version=2024-02-15-preview`;
        }
    } else {
        endpoint = config.endpoint;
    }
    
    // Debug logging
    console.log(`🔍 [${config.providerName}] Calling endpoint: ${endpoint.substring(0, 80)}...`);
    
    // Make API call - same pattern for all AIs (based on ChatGPT's working pattern)
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: config.getHeaders(apiKey),
            body: JSON.stringify(config.getBody(prompt))
        });
        
        if (!response.ok) {
            const error = await response.text();
            console.error(`❌ [${config.providerName}] API error ${response.status}:`, error);
            throw new Error(`${config.providerName} API error: ${response.status} - ${error}`);
        }
        
        const data = await response.json();
        
        // Extract content using provider-specific extractor (minor enhancement)
        const content = config.extractContent(data);
        
        // Log response (handle both string and object responses)
        const contentLength = typeof content === 'string' ? content.length : content.text?.length || 0;
        console.log(`📥 [${config.providerName}] Raw response: ${contentLength} chars`);
        
        return content;
    } catch (error) {
        // Enhanced error logging for debugging
        console.error(`❌ [${config.providerName}] API call failed for model '${config.model}':`, error.message);
        if (error.message.includes('Invalid model')) {
            console.error(`💡 [${config.providerName}] Model name issue - current model: ${config.model}`);
        }
        throw error;
    }
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        responseExtractor: 'loaded'
    });
});

// Single AI query
app.post('/api/ai/query', async (req, res) => {
    try {
        const { aiProvider, prompt, userId } = req.body;
        
        if (!aiProvider || !prompt) {
            return res.status(400).json({ error: 'Missing aiProvider or prompt' });
        }
        
        console.log(`📡 Calling ${aiProvider} with prompt: "${prompt.substring(0, 50)}..."`);
        
        // Initialize content capture metrics (reusable for all AI tools)
        const captureMetrics = new ContentCaptureMetrics(aiProvider, prompt);
        
        // Normalize provider name for ResponseExtractor (expects 'chatgpt', not 'openai')
        const normalizedProvider = normalizeProvider(aiProvider);
        
        // 1. Call AI service - capture RAW response from API
        const rawResponseData = await callAIService(aiProvider, prompt);
        
        // Handle Gemini's structured response (with media) vs other providers' text responses
        let rawResponse = '';
        let apiMediaItems = [];
        let rawApiResponse = null;
        
        if (typeof rawResponseData === 'object' && rawResponseData.text) {
            // Gemini returns structured response with media
            rawResponse = rawResponseData.text;
            apiMediaItems = rawResponseData.media || [];
            rawApiResponse = rawResponseData.rawApiResponse;
        } else {
            // Other providers return plain text
            rawResponse = String(rawResponseData);
        }
        
        captureMetrics.recordStage('api_raw', rawResponse, {
            source: 'api',
            note: 'Direct response from AI provider API',
            mediaCount: apiMediaItems.length
        });
        console.log(`📥 Raw response length: ${rawResponse.length} chars${apiMediaItems.length > 0 ? ` (${apiMediaItems.length} media items from API)` : ''}`);
        
        // 2. Clean the response using ResponseExtractor (use normalized provider name)
        const cleanContent = ResponseExtractor.extract(normalizedProvider, rawResponse);
        captureMetrics.recordStage('after_extraction', cleanContent, {
            extractionMethod: 'ResponseExtractor',
            provider: normalizedProvider
        });
        console.log(`✨ Clean response length: ${cleanContent.length} chars`);
        
        // 3. Extract media content (images, videos, links) if available (use normalized provider name)
        // First, extract from API response structure (for Gemini)
        let images = [];
        let videos = [];
        
        // Add media from API response structure
        apiMediaItems.forEach(item => {
            if (item.type === 'image') {
                images.push({
                    type: 'base64',
                    data: `data:${item.mimeType};base64,${item.data}`,
                    source: 'api_structure'
                });
            } else if (item.type === 'video') {
                videos.push({
                    type: 'file',
                    uri: item.fileUri,
                    mimeType: item.mimeType,
                    source: 'api_structure'
                });
            }
        });
        
        // Then, extract from text content (markdown, HTML, URLs)
        console.log(`🔍 [Media] Extracting from text content (${rawResponse.length} chars)...`);
        const textImages = ResponseExtractor.extractImages(rawResponse, normalizedProvider);
        const textVideos = ResponseExtractor.extractVideos ? ResponseExtractor.extractVideos(rawResponse, normalizedProvider) : [];
        
        console.log(`🔍 [Media] Text extraction found: ${textImages.length} images, ${textVideos.length} videos`);
        if (textVideos.length > 0) {
            console.log(`   🎥 Video details:`, textVideos.map(v => ({ type: v.type, url: v.url || v.embedUrl || v.uri || 'N/A' })));
        }
        
        // Check for video-related keywords in text (for debugging and info bubble)
        const videoKeywords = ['youtube', 'youtu.be', 'vimeo', '.mp4', '.webm', 'video', 'watch'];
        const imageKeywords = ['image', 'photo', 'picture', 'img', 'screenshot', 'graphic'];
        const foundVideoKeywords = videoKeywords.filter(keyword => rawResponse.toLowerCase().includes(keyword));
        const foundImageKeywords = imageKeywords.filter(keyword => rawResponse.toLowerCase().includes(keyword));
        const hasMediaKeywords = foundVideoKeywords.length > 0 || foundImageKeywords.length > 0;
        
        if (foundVideoKeywords.length > 0) {
            console.log(`🔍 [Media] Found video-related keywords in text: ${foundVideoKeywords.join(', ')}`);
        }
        if (foundImageKeywords.length > 0) {
            console.log(`🔍 [Media] Found image-related keywords in text: ${foundImageKeywords.join(', ')}`);
        }
        
        // Merge API structure media with text-extracted media (avoid duplicates)
        const existingUrls = new Set([...images.map(i => i.data || i.url), ...videos.map(v => v.url || v.uri || v.embedUrl)]);
        textImages.forEach(img => {
            const url = img.url || img.data;
            if (url && !existingUrls.has(url)) {
                images.push(img);
                existingUrls.add(url);
            }
        });
        textVideos.forEach(vid => {
            const url = vid.url || vid.uri || vid.embedUrl;
            if (url && !existingUrls.has(url)) {
                videos.push(vid);
                existingUrls.add(url);
            }
        });
        
        const links = ResponseExtractor.extractLinks ? ResponseExtractor.extractLinks(rawResponse, normalizedProvider) : [];
        
        // Log media extraction results (always log, even if empty, for debugging)
        console.log(`🖼️ [Media] Final extraction from ${aiProvider}: ${images.length} images, ${videos.length} videos, ${links.length} links`);
        if (images.length > 0) {
            console.log(`   📸 Images:`, images.map(img => ({ type: img.type, hasData: !!img.data, hasUrl: !!img.url, url: (img.url || img.data || '').substring(0, 80) })));
        }
        if (videos.length > 0) {
            console.log(`   🎥 Videos:`, videos.map(vid => ({ type: vid.type, hasUri: !!vid.uri, hasUrl: !!vid.url, hasEmbed: !!vid.embedUrl, url: (vid.url || vid.embedUrl || vid.uri || '').substring(0, 80) })));
        }
        if (images.length === 0 && videos.length === 0 && hasMediaKeywords) {
            console.warn(`   ⚠️ Media keywords found but no media extracted - AI may have mentioned media without providing URLs`);
        }
        
        // 4. Validate quality
        const quality = ResponseExtractor.validateResponse(cleanContent, rawResponse.length);
        
        // 5. Validate content capture completeness
        const validation = captureMetrics.validate();
        if (!validation.valid) {
            console.error(`❌ [Metrics] ${aiProvider} - Content capture validation failed:`, validation.errors);
        }
        if (validation.warnings.length > 0) {
            console.warn(`⚠️ [Metrics] ${aiProvider} - Warnings:`, validation.warnings);
        }
        
        // 6. Get final metrics summary
        const metricsSummary = captureMetrics.getSummary();
        console.log(`📊 [Metrics] ${aiProvider} Summary:`, {
            finalLength: metricsSummary.finalLength,
            rawLength: metricsSummary.rawLength,
            lossPercent: metricsSummary.lossPercent,
            valid: validation.valid
        });
        
        // 7. Return VERBATIM original response as primary content.
        // Keep cleaned content for diagnostics only.
        res.json({
            provider: aiProvider,
            content: rawResponse, // ✅ VERBATIM provider response
            html: rawResponse,
            cleanedContent: cleanContent,
            images: images, // Extracted images
            videos: videos || [], // Extracted videos (YouTube, Vimeo, direct links)
            links: links || [], // Extracted links (for reference)
            mediaKeywords: hasMediaKeywords && images.length === 0 && videos.length === 0, // Flag: keywords detected but no media extracted
            quality: {
                score: quality.score,
                isValid: quality.isValid,
                failedChecks: quality.failedChecks
            },
            metadata: {
                rawLength: rawResponse.length,
                cleanLength: cleanContent.length,
                reduction: `${((1 - cleanContent.length / rawResponse.length) * 100).toFixed(1)}%`,
                fullContent: true,
                format: 'verbatim_original',
                captureMetrics: metricsSummary, // Full capture metrics for debugging
                validation: {
                    valid: validation.valid,
                    warnings: validation.warnings,
                    errors: validation.errors
                }
            },
            timestamp: new Date().toISOString(),
            success: true
        });
        
    } catch (error) {
        console.error('❌ API error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message,
            provider: req.body.aiProvider
        });
    }
});

// Batch query (multiple AIs)
app.post('/api/ai/batch', async (req, res) => {
    try {
        const { aiProviders, prompt, userId } = req.body;
        
        if (!aiProviders || !Array.isArray(aiProviders) || aiProviders.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid aiProviders array' });
        }
        
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt' });
        }
        
        console.log(`📡 Batch query: ${aiProviders.length} AIs - "${prompt.substring(0, 50)}..."`);
        
        // Call all AIs in parallel
        const promises = aiProviders.map(provider => {
            // Normalize provider name for ResponseExtractor
            const normalizedProvider = normalizeProvider(provider);
            
            // Initialize metrics for this provider
            const captureMetrics = new ContentCaptureMetrics(provider, prompt);
            
            return callAIService(provider, prompt)
                .then(rawResponse => {
                    // Record raw API response
                    captureMetrics.recordStage('api_raw', rawResponse, {
                        source: 'api',
                        note: 'Direct response from AI provider API'
                    });
                    
                    // Cleaned output is diagnostics-only; do not replace original content.
                    const cleanContent = ResponseExtractor.extract(normalizedProvider, rawResponse);
                    
                    // Extract all media content
                    const images = ResponseExtractor.extractImages(rawResponse, normalizedProvider);
                    const videos = ResponseExtractor.extractVideos(rawResponse, normalizedProvider);
                    const links = ResponseExtractor.extractLinks(rawResponse, normalizedProvider);
                    captureMetrics.recordStage('after_extraction', cleanContent, {
                        extractionMethod: 'ResponseExtractor',
                        provider: normalizedProvider,
                        imagesCount: images.length,
                        videosCount: videos.length,
                        linksCount: links.length
                    });
                    const quality = ResponseExtractor.validateResponse(cleanContent, rawResponse.length);
                    
                    // Validate capture completeness
                    const validation = captureMetrics.validate();
                    const metricsSummary = captureMetrics.getSummary();
                    
                    if (!validation.valid) {
                        console.error(`❌ [Batch] ${provider} - Validation failed:`, validation.errors);
                    }
                    
                    console.log(`✅ ${provider}: ${rawResponse.length} → ${cleanContent.length} chars (quality: ${quality.score}, loss: ${metricsSummary.lossPercent}%)`);
                    
                    return {
                        provider,
                        content: rawResponse, // ✅ VERBATIM provider response
                        html: rawResponse,
                        cleanedContent: cleanContent,
                        images, // Extracted images
                        videos: videos || [], // Extracted videos
                        links: links || [], // Extracted links
                        quality: {
                            score: quality.score,
                            isValid: quality.isValid
                        },
                        metadata: {
                            rawLength: rawResponse.length,
                            cleanLength: cleanContent.length,
                            fullContent: true,
                            format: 'verbatim_original',
                            captureMetrics: metricsSummary, // Full capture metrics
                            validation: {
                                valid: validation.valid,
                                warnings: validation.warnings,
                                errors: validation.errors
                            }
                        },
                        success: true
                    };
                })
                .catch(error => {
                    console.error(`❌ ${provider} error:`, error.message);
                    return {
                        provider,
                        content: '',
                        error: error.message,
                        success: false
                    };
                });
        });
        
        const results = await Promise.all(promises);
        
        const successful = results.filter(r => r.success).length;
        console.log(`📊 Batch result: ${successful}/${results.length} successful`);
        
        res.json({
            success: true,
            responses: results,
            metadata: {
                total: results.length,
                successful: successful,
                failed: results.length - successful
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Batch API error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
});

// Test endpoint (no API keys needed)
app.post('/api/test/clean', (req, res) => {
    try {
        const { aiProvider, rawResponse } = req.body;
        
        if (!aiProvider || !rawResponse) {
            return res.status(400).json({ error: 'Missing aiProvider or rawResponse' });
        }
        
        // Test the ResponseExtractor with provided raw response
        const cleanContent = ResponseExtractor.extract(aiProvider, rawResponse);
        const images = ResponseExtractor.extractImages(rawResponse, aiProvider);
        const quality = ResponseExtractor.validateResponse(cleanContent, rawResponse.length);
        
        res.json({
            success: true,
            provider: aiProvider,
            original: rawResponse,
            cleaned: cleanContent,
            images: images,
            quality: quality,
            metadata: {
                originalLength: rawResponse.length,
                cleanedLength: cleanContent.length,
                reduction: `${((1 - cleanContent.length / rawResponse.length) * 100).toFixed(1)}%`
            }
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
});

// Synthesis endpoint for generating analysis templates
app.post('/api/synthesize', async (req, res) => {
    try {
        const { comparisonData, mode } = req.body;
        
        if (!comparisonData || !mode) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing comparisonData or mode' 
            });
        }
        
        // Get AI responses from comparison data
        const responses = comparisonData.panes || [];
        if (responses.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'No comparison data provided' 
            });
        }
        
        // Generate template prompt based on mode
        const modePrompts = {
            comprehensive: `Generate an empty template for comprehensive analysis. The template should have sections for: key differences, strengths, accuracy assessment, and recommendations. DO NOT fill in any content - only provide the structure.`,
            executive: `Generate an empty template for an executive summary. The template should have sections for: overview, key findings, and action items. DO NOT fill in any content - only provide the structure.`,
            consensus: `Generate an empty template for consensus mapping. The template should have sections for: agreed points, common themes, and shared conclusions. DO NOT fill in any content - only provide the structure.`,
            divergence: `Generate an empty template for divergence analysis. The template should have sections for: conflicting points, different approaches, and unique perspectives. DO NOT fill in any content - only provide the structure.`,
            quality: `Generate an empty template for quality scoring. The template should have sections for: coherence, creativity, accuracy, and overall score with justification fields. DO NOT fill in any content - only provide the structure.`,
            improvement: `Generate an empty template for an improvement guide. The template should have sections for: identified gaps, suggested enhancements, and best practices. DO NOT fill in any content - only provide the structure.`,
            bestof: `Generate an empty template for best-of-best synthesis. The template should have sections for: ideal answer structure, combined insights, and unified recommendations. DO NOT fill in any content - only provide the structure.`
        };
        
        const templatePrompt = modePrompts[mode] || modePrompts.comprehensive;
        
        // Use OpenAI for template generation (primary)
        let template = '';
        let provider = 'openai';
        
        try {
            if (process.env.OPENAI_API_KEY) {
                template = await callOpenAI(templatePrompt);
                provider = 'openai';
            } else if (process.env.ANTHROPIC_API_KEY) {
                template = await callAnthropic(templatePrompt);
                provider = 'claude';
            } else if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
                template = await callGoogleAI(templatePrompt);
                provider = 'gemini';
            } else {
                return res.status(500).json({
                    success: false,
                    error: 'No AI API keys configured for template generation'
                });
            }
        } catch (apiError) {
            console.error('❌ Template generation error:', apiError);
            return res.status(500).json({
                success: false,
                error: `Template generation failed: ${apiError.message}`
            });
        }
        
        res.json({
            success: true,
            mode: mode,
            template: template,
            provider: provider,
            timestamp: new Date().toISOString(),
            note: 'This is an empty template framework. You must fill in all analysis content yourself.'
        });
        
    } catch (error) {
        console.error('❌ Synthesis error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Batch synthesis endpoint (generate all 7 templates)
app.post('/api/synthesize/batch', async (req, res) => {
    try {
        const { comparisonData } = req.body;
        
        if (!comparisonData) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing comparisonData' 
            });
        }
        
        const modes = ['comprehensive', 'executive', 'consensus', 'divergence', 'quality', 'improvement', 'bestof'];
        const results = {};
        
        // Generate templates for all modes (in parallel for speed)
        const promises = modes.map(async (mode) => {
            try {
                const response = await fetch(`http://localhost:${PORT}/api/synthesize`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ comparisonData, mode })
                });
                const data = await response.json();
                return { mode, ...data };
            } catch (error) {
                return { mode, success: false, error: error.message };
            }
        });
        
        const templates = await Promise.all(promises);
        
        templates.forEach(t => {
            results[t.mode] = t;
        });
        
        res.json({
            success: true,
            templates: results,
            timestamp: new Date().toISOString(),
            note: 'All templates are empty frameworks. You must fill in all analysis content yourself.'
        });
        
    } catch (error) {
        console.error('❌ Batch synthesis error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Test Backend Server Running!');
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log('');
    console.log('📋 Available Endpoints:');
    console.log(`   GET  /health - Health check`);
    console.log(`   POST /api/ai/query - Single AI query`);
    console.log(`   POST /api/ai/batch - Multiple AIs query`);
    console.log(`   POST /api/synthesize - Generate single analysis template`);
    console.log(`   POST /api/synthesize/batch - Generate all 7 analysis templates`);
    console.log(`   POST /api/test/clean - Test ResponseExtractor (no API keys needed)`);
    console.log('');
    console.log('💡 To test:');
    console.log(`   curl -X POST http://localhost:${PORT}/api/test/clean \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"aiProvider":"claude","rawResponse":"Your test text here"}'`);
    console.log('');
    
    // Check API keys
    const hasKeys = {
        openai: !!process.env.OPENAI_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google: !!process.env.GOOGLE_API_KEY || !!process.env.GEMINI_API_KEY,
        perplexity: !!process.env.PERPLEXITY_API_KEY,
        deepseek: !!process.env.DEEPSEEK_API_KEY,
        grok: !!process.env.XAI_API_KEY,
        azure: !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT),
        mistral: !!process.env.MISTRAL_API_KEY,
        poe: !!process.env.POE_API_KEY
    };
    
    console.log('🔑 API Keys Status:');
    console.log(`   OpenAI: ${hasKeys.openai ? '✅' : '❌'}`);
    console.log(`   Anthropic: ${hasKeys.anthropic ? '✅' : '❌'}`);
    console.log(`   Google/Gemini: ${hasKeys.google ? '✅' : '❌'}`);
    console.log(`   Perplexity: ${hasKeys.perplexity ? '✅' : '❌'}`);
    console.log(`   DeepSeek: ${hasKeys.deepseek ? '✅' : '❌'}`);
    console.log(`   Grok (xAI): ${hasKeys.grok ? '✅' : '❌'}`);
    console.log(`   Azure OpenAI: ${hasKeys.azure ? '✅' : '❌'}`);
    console.log(`   Mistral AI: ${hasKeys.mistral ? '✅' : '❌'}`);
    console.log(`   Poe: ${hasKeys.poe ? '✅' : '❌'}`);
    console.log('');
    
    if (!Object.values(hasKeys).some(v => v)) {
        console.warn('⚠️  No API keys found! Set them in .env file to test real AI calls.');
        console.warn('   You can still test ResponseExtractor with /api/test/clean endpoint');
    }
});


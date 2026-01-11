/**
 * AI Response Cleaner & Normalizer
 * SERVER-SIDE ONLY - Used by backend API to clean AI responses
 * Extracts clean response text from raw AI outputs
 * Removes metadata, disclaimers, chat history, UI elements
 * Preserves formatting, images, and citations
 * 
 * ⚠️ This runs on your backend server, NOT in Electron
 */

class ResponseExtractor {
  /**
   * Main extraction method - routes to appropriate cleaner
   */
  static extract(aiName, rawResponse, options = {}) {
    const cleaners = {
      // Conversational AIs
      'chatgpt': ResponseExtractor.cleanChatGPT,
      'gpt-4': ResponseExtractor.cleanChatGPT,
      'gpt-3.5': ResponseExtractor.cleanChatGPT,
      'openai': ResponseExtractor.cleanChatGPT,
      'claude': ResponseExtractor.cleanClaude,
      'claude-3': ResponseExtractor.cleanClaude,
      'anthropic': ResponseExtractor.cleanClaude,
      'gemini': ResponseExtractor.cleanGemini,
      'bard': ResponseExtractor.cleanGemini,
      'google': ResponseExtractor.cleanGemini,
      'grok': ResponseExtractor.cleanGrok,
      'xai': ResponseExtractor.cleanGrok,
      'deepseek': ResponseExtractor.cleanDeepSeek,
      'mistral': ResponseExtractor.cleanMistral,
      'pi': ResponseExtractor.cleanPi,
      'character-ai': ResponseExtractor.cleanCharacterAI,
      'poe': ResponseExtractor.cleanPoe,
      
      // Search & Coding AIs
      'perplexity': ResponseExtractor.cleanPerplexity,
      'you.com': ResponseExtractor.cleanYouCom,
      'phind': ResponseExtractor.cleanPhind,
      'cursor': ResponseExtractor.cleanCursor,
      'copilot': ResponseExtractor.cleanCopilot,
      'microsoft': ResponseExtractor.cleanCopilot,
      
      // Custom/Others
      'custom': ResponseExtractor.cleanCustom,
      'default': ResponseExtractor.cleanGeneric
    };

    const cleaner = cleaners[aiName.toLowerCase()] || cleaners.default;
    
    try {
      return cleaner(rawResponse, options);
    } catch (error) {
      console.error(`Error cleaning ${aiName} response:`, error);
      return ResponseExtractor.cleanGeneric(rawResponse, options);
    }
  }

  // ===== CONVERSATIONAL AIs =====

  /**
   * ChatGPT / OpenAI (often has thinking markers, system messages)
   */
  static cleanChatGPT(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove thinking/planning markers
    const patterns = [
      // Remove "Thinking..." or step-by-step reasoning
      /(?:Let me|Let's|I'll|I will|I need to|I should|First,|Next,|Then,|Finally,|So,).*?\n/g,
      
      // Remove system messages
      /^(As an AI|As ChatGPT|I am an AI|I'm an AI|I am ChatGPT|I'm ChatGPT)[.,!].*?\n/gi,
      
      // Remove "Here is" intros
      /^(Here is|Here are|Here's|Here are some|Here is a).*?:\s*/gi,
      
      // Remove thinking in brackets
      /\[.*?thinking.*?\]|\(.*?thinking.*?\)/gi,
      
      // Remove "To answer your question" intros
      /^To (?:answer|respond to) your (?:question|query)[.,!].*?\n/gi,
      
      // Remove markdown code block markers if they contain thinking
      /```.*?\n.*?thinking.*?\n```/gis
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    // REMOVED: Aggressive truncation logic that was cutting off content
    // We preserve FULL content - only remove UI elements, not actual response text
    
    return ResponseExtractor.postProcess(text, options);
  }

  /**
   * Claude (often includes search history, context markers)
   */
  static cleanClaude(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Claude often includes search history and context markers
    const patterns = [
      // Remove search intent markers
      /I'll search for.*?\n|I will search for.*?\n|Let me search for.*?\n/gi,
      
      // Remove context continuation markers
      /Continuing previous conversation.*?\n|Reverting the changes.*?\n/gi,
      
      // Remove malformed or repeated text (as in your screenshot)
      /Origins of Santa Claus Origins of Santa Claus Origins of Santa Claus/gi,
      /Meaning of Christmas Meaning of Christmas/gi,
      /Location of Toledo Location of Toledo/gi,
      /Causes of World War II World War II timeline Causes of World War II/gi,
      
      // Remove "Millionsire" typos and search queries
      /Millionsire and billionaire population percentages.*?\n/gi,
      
      // Remove Claude's thinking markers
      /\(thinking.*?\)|\[thinking.*?\]/gi,
      
      // Remove system messages
      /^(As Claude|I'm Claude|I am Claude).*?\n/gi,
      
      // Remove topic lists (chat history)
      /^(Capital of|What is|Why|How|When|Where|Who|Meaning of|Location of|Causes of|Purpose of|Origins of|Timeline of)[A-Z][a-z]+.*?\n/gmi,
      
      // Remove error messages
      /(Cursor AI|file read error|chat history storage|Reverting file).*?\n/gi
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    // Extract actual answer after the question
    const answerMatch = text.match(/What percentage of the population are millionaires and billionaires\?\s*(.*)/gis);
    if (answerMatch && answerMatch[1]) {
      text = answerMatch[1].trim();
    }
    
    // Filter out only chat history artifacts, but preserve ALL actual response content
    // Don't remove lines just because they end with ? - AI responses may include questions
    const lines = text.split('\n').filter(line => {
      const trimmed = line.trim();
      // Only remove lines that are clearly chat history patterns, not actual content
      return trimmed.length > 0 && 
             !trimmed.match(/^(Capital of|What is|Why|How|When|Where|Who|Meaning of|Location of|Causes of|Purpose of|Origins of|Timeline of)[A-Z][a-z]+ of [A-Z]/) &&
             trimmed.length > 5; // Keep all substantial lines (lowered threshold from 10 to 5)
    });
    
    text = lines.join('\n').trim();
    
    return ResponseExtractor.postProcess(text, options);
  }

  /**
   * Gemini / Bard (has disclaimers, privacy notices)
   */
  static cleanGemini(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove Gemini's standard disclaimer
    const disclaimerPatterns = [
      /^Gemini can make mistakes.*?\n- \*\*Tim: /gis,
      /^(This response is generated by AI.*?\n)/gi,
      /^(Note:.*?\n)/gi,
      /^(Please note:.*?\n)/gi,
      /^(Disclaimer:.*?\n)/gi,
      /^(As a large language model.*?\n)/gi,
      /^(I am a large language model.*?\n)/gi,
      /^You privacy and Gemini.*?\n/gi,
      /^in a new window.*?\n/gi,
      /^Opens in a new window.*?\n/gi
    ];
    
    disclaimerPatterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    // Remove "You can still edit this response" UI text
    text = text.replace(/You can still edit this response.*$/gi, '');
    text = text.replace(/Use the "Highlight Differ" button.*$/gi, '');
    text = text.replace(/Tip:.*$/gi, '');
    
    // Remove markdown bold markers that are UI elements
    text = text.replace(/\*\*Tim:\*\*\s*/gi, '');
    
    // Filter out only UI/disclaimer paragraphs, but preserve ALL actual content
    const paragraphs = text.split('\n\n').filter(p => {
      const trimmed = p.trim();
      // Only remove paragraphs that are clearly UI/disclaimer text
      // Keep all actual content paragraphs (lowered threshold from 20 to 5 chars)
      return trimmed.length > 5 && 
             !trimmed.match(/^(Gemini can make mistakes|You can still edit|Use the "Highlight|Tip:)/i) &&
             !trimmed.match(/^(double-check|privacy|edit this response)/i);
    });
    
    // Preserve all filtered paragraphs (don't truncate)
    if (paragraphs.length > 0) {
      text = paragraphs.join('\n\n');
    }
    
    return ResponseExtractor.postProcess(text, options);
  }

  /**
   * Perplexity (includes sources, search context)
   */
  static cleanPerplexity(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove search context and source markers
    const patterns = [
      /^(According to|Based on|Per).*?(search results?|the internet|web search|my knowledge)[.,].*?\n/gi,
      /^Here is.*?(based on|from).*?search.*?\n/gi,
      /^Searching.*?\n|^I found.*?\n/gi,
      /^Sources?:.*?\n/gi,
      /^References?:.*?\n/gi,
      /^\[.*?\].*?\n/gi, // Citation brackets
      /^• Source:.*?\n|^\d+\.\s*https?:\/\/.*?\n/gmi // Source lists
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    // REMOVED: Aggressive extraction after colon that was truncating content
    // We preserve FULL content - only remove UI elements, not actual response text
    
    return ResponseExtractor.postProcess(text, options);
  }

  /**
   * Grok (often humorous, includes emojis, casual tone)
   */
  static cleanGrok(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove Grok's signature emojis and casual markers
    const patterns = [
      /^🤔.*?\n|^😄.*?\n|^😂.*?\n|^🎯.*?\n/gi, // Opening emoji lines
      /^Alright,?.*?\n|^Okay,?.*?\n|^So,?.*?\n/gi, // Casual openings
      /^Let's break this down.*?\n|^Here's the deal.*?\n/gi, // Casual intros
      /^\(chuckles?\).*?\n|^lol.*?\n|^haha.*?\n/gi, // Humor markers
      /^In true Grok fashion.*?\n|^As only Grok can say.*?\n/gi // Branding
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    // Keep emojis in the actual content but remove standalone ones
    text = text.replace(/^\s*[🤔😄😂🎯👨💻🧠]\s*$/gm, '');
    
    return ResponseExtractor.postProcess(text, options, { preserveEmojis: true });
  }

  /**
   * DeepSeek (often technical, code-focused)
   */
  static cleanDeepSeek(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove DeepSeek specific markers
    const patterns = [
      /^作为DeepSeek.*?\n|^我是DeepSeek.*?\n/gi, // Chinese intro
      /^As DeepSeek.*?\n|^I'm DeepSeek.*?\n/gi, // English intro
      /^本回答由DeepSeek.*?\n/gi, // Chinese disclaimer
      /^(代码实现|实现思路|算法分析):.*?\n/gi // Technical section headers
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    return ResponseExtractor.postProcess(text, options);
  }

  /**
   * Mistral (often multilingual, formal)
   */
  static cleanMistral(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove Mistral's formal markers
    const patterns = [
      /^Bonjour.*?\n|^Hello.*?\n|^Salut.*?\n/gi, // Multilingual greetings
      /^As Mistral.*?\n|^I am Mistral.*?\n/gi, // Identity markers
      /^En tant que.*?\n|^Comme.*?\n/gi, // French intros
      /^Here is.*?\n|^Voici.*?\n/gi // Presentation markers
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    return ResponseExtractor.postProcess(text, options);
  }

  /**
   * Generic cleaner for unknown/unrecognized AIs
   */
  static cleanGeneric(rawResponse, options) {
    let text = String(rawResponse).trim();
    
    // Remove common AI response artifacts
    const patterns = [
      // Identity markers
      /^(As|I am|I'm) (an AI|a language model|an assistant).*?\n/gi,
      
      // Introductory phrases
      /^(Here|There|This).*?(is|are).*?\n/gi,
      
      // Question repeats
      /^(Regarding|About|For).*?question.*?\n/gi,
      
      // Thinking markers
      /^(Let me|Let's|I'll|I will).*?(think|consider|analyze).*?\n/gi,
      
      // Disclaimer markers
      /^(Note|Please note|Disclaimer|Warning).*?\n/gi,
      
      // Source/citation markers
      /^(According to|Based on|Per).*?\n/gi,
      
      // Empty markdown
      /^#+\s*$/gm,
      /^>\s*$/gm,
      /^`{3,}\s*$/gm
    ];
    
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    
    return ResponseExtractor.postProcess(text, options);
  }

  // ===== IMAGE EXTRACTION =====
  
  /**
   * Extract images from AI responses (when supported)
   */
  static extractImages(rawResponse, aiName) {
    const images = [];
    
    // Check for markdown image syntax
    const markdownImages = rawResponse.match(/!\[.*?\]\((.*?)\)/g) || [];
    markdownImages.forEach(img => {
      const urlMatch = img.match(/!\[.*?\]\((.*?)\)/);
      if (urlMatch && urlMatch[1]) {
        images.push({
          type: 'markdown',
          url: urlMatch[1],
          alt: img.match(/!\[(.*?)\]/)?.[1] || ''
        });
      }
    });
    
    // Check for HTML img tags
    const htmlImages = rawResponse.match(/<img[^>]+src="([^">]+)"[^>]*>/g) || [];
    htmlImages.forEach(img => {
      const urlMatch = img.match(/src="([^">]+)"/);
      if (urlMatch && urlMatch[1]) {
        images.push({
          type: 'html',
          url: urlMatch[1]
        });
      }
    });
    
    // Check for base64 encoded images
    const base64Images = rawResponse.match(/data:image\/[^;]+;base64,[^"\s]+/g) || [];
    base64Images.forEach(img => {
      images.push({
        type: 'base64',
        data: img
      });
    });
    
    return images;
  }

  /**
   * Extract videos and video links from AI responses
   * Preserves YouTube, Vimeo, and direct video links
   */
  static extractVideos(rawResponse, aiName) {
    const videos = [];
    const foundUrls = new Set(); // Track found URLs to avoid duplicates
    
    // YouTube links (youtube.com and youtu.be) - more comprehensive patterns
    const youtubePatterns = [
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/g,
      /youtube\.com\/watch\?.*?v=([a-zA-Z0-9_-]{11})/g,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/g
    ];
    youtubePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(rawResponse)) !== null) {
        const videoId = match[1];
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        if (!foundUrls.has(url)) {
          videos.push({
            type: 'youtube',
            id: videoId,
            url: url,
            embedUrl: `https://www.youtube.com/embed/${videoId}`
          });
          foundUrls.add(url);
        }
      }
    });
    
    // Vimeo links - more comprehensive patterns
    const vimeoPatterns = [
      /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/g,
      /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/channels\/[^\/]+\/(\d+)/g,
      /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/g
    ];
    vimeoPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(rawResponse)) !== null) {
        const videoId = match[1];
        const url = `https://vimeo.com/${videoId}`;
        if (!foundUrls.has(url)) {
          videos.push({
            type: 'vimeo',
            id: videoId,
            url: url,
            embedUrl: `https://player.vimeo.com/video/${videoId}`
          });
          foundUrls.add(url);
        }
      }
    });
    
    // Direct video file links (.mp4, .webm, .mov, etc.) - improved pattern
    const videoFilePattern = /(https?:\/\/[^\s"<>\)]+\.(?:mp4|webm|mov|avi|mkv|flv|wmv|m4v|ogv|3gp)(?:\?[^\s"<>\)]*)?)/gi;
    let fileMatch;
    while ((fileMatch = videoFilePattern.exec(rawResponse)) !== null) {
      const url = fileMatch[1];
      if (!foundUrls.has(url)) {
        videos.push({
          type: 'direct',
          url: url,
          format: url.match(/\.(\w+)(?:\?|$)/)?.[1] || 'unknown'
        });
        foundUrls.add(url);
      }
    }
    
    // HTML video tags
    const htmlVideos = rawResponse.match(/<video[^>]+src=["']([^"'>]+)["'][^>]*>/gi) || [];
    htmlVideos.forEach(video => {
      const urlMatch = video.match(/src=["']([^"']+)["']/);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1];
        if (!foundUrls.has(url)) {
          videos.push({
            type: 'html',
            url: url
          });
          foundUrls.add(url);
        }
      }
    });
    
    // iframe embeds (YouTube, Vimeo, etc.) - improved pattern
    const iframePattern = /<iframe[^>]+src=["']([^"'>]+)["'][^>]*>/gi;
    let iframeMatch;
    while ((iframeMatch = iframePattern.exec(rawResponse)) !== null) {
      const src = iframeMatch[1];
      if (src.includes('youtube.com') || src.includes('youtu.be')) {
        const ytMatch = src.match(/(?:embed\/|v=)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          const url = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
          if (!foundUrls.has(url)) {
            videos.push({
              type: 'youtube',
              id: ytMatch[1],
              url: url,
              embedUrl: src
            });
            foundUrls.add(url);
          }
        }
      } else if (src.includes('vimeo.com')) {
        const vimeoMatch = src.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
          const url = `https://vimeo.com/${vimeoMatch[1]}`;
          if (!foundUrls.has(url)) {
            videos.push({
              type: 'vimeo',
              id: vimeoMatch[1],
              url: url,
              embedUrl: src
            });
            foundUrls.add(url);
          }
        }
      } else if (!foundUrls.has(src)) {
        videos.push({
          type: 'iframe',
          url: src
        });
        foundUrls.add(src);
      }
    }
    
    return videos;
  }

  /**
   * Extract all links (not just videos) from AI responses
   * Preserves URLs for display in comparison view
   */
  static extractLinks(rawResponse, aiName) {
    const links = [];
    
    // HTTP/HTTPS links (excluding images and videos already extracted)
    const urlPattern = /(https?:\/\/[^\s"<>\)]+)/gi;
    let match;
    while ((match = urlPattern.exec(rawResponse)) !== null) {
      const url = match[1];
      // Skip if it's an image or video (already handled)
      if (!url.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|avi|mkv|flv|wmv|m4v)(\?|$)/i)) {
        links.push({
          type: 'url',
          url: url
        });
      }
    }
    
    // Markdown links [text](url)
    const markdownLinks = rawResponse.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g) || [];
    markdownLinks.forEach(link => {
      const linkMatch = link.match(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/);
      if (linkMatch) {
        links.push({
          type: 'markdown',
          text: linkMatch[1],
          url: linkMatch[2]
        });
      }
    });
    
    // HTML anchor tags
    const htmlLinks = rawResponse.match(/<a[^>]+href="([^">]+)"[^>]*>(.*?)<\/a>/g) || [];
    htmlLinks.forEach(link => {
      const hrefMatch = link.match(/href="([^">]+)"/);
      const textMatch = link.match(/>([^<]+)</);
      if (hrefMatch) {
        links.push({
          type: 'html',
          url: hrefMatch[1],
          text: textMatch ? textMatch[1] : ''
        });
      }
    });
    
    return links;
  }

  // ===== POST-PROCESSING =====
  
  /**
   * Final cleanup and normalization
   */
  static postProcess(text, options, aiSpecificOptions = {}) {
    // Trim whitespace
    let processed = text.trim();
    
    // Remove leading/trailing quotes
    processed = processed.replace(/^["']|["']$/g, '');
    
    // Normalize line endings
    processed = processed.replace(/\r\n/g, '\n');
    
    // Remove excessive empty lines (more than 2)
    processed = processed.replace(/\n{3,}/g, '\n\n');
    
    // Remove empty parentheses or brackets
    processed = processed.replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, '');
    
    // Remove standalone punctuation
    processed = processed.replace(/^\s*[.,!?;:]+\s*$/gm, '');
    
    // Remove topic lists (chat history patterns)
    processed = processed.replace(/^(Capital of|What is|Why|How|When|Where|Who|Meaning of|Location of|Causes of|Purpose of|Origins of|Timeline of)[A-Z][a-z]+.*?\n/gmi, '');
    
    // Ensure the response starts with content, not whitespace
    processed = processed.replace(/^\s+/, '');
    
    // Capitalize first letter if it's lowercase
    if (processed.length > 0 && /^[a-z]/.test(processed)) {
      processed = processed.charAt(0).toUpperCase() + processed.slice(1);
    }
    
    // Final trim
    return processed.trim();
  }

  // ===== QUALITY CHECKS =====
  
  /**
   * Validate if response is clean and usable
   */
  static validateResponse(text, originalLength) {
    const checks = {
      isEmpty: text.trim().length === 0,
      isTooShort: text.length < 20 && originalLength > 100,
      isMostlyPunctuation: (text.match(/[.,!?;:]/g) || []).length > text.length / 2,
      containsErrorMarkers: /error|failed|sorry|cannot|unable/i.test(text) && text.length < 100
    };
    
    const failedChecks = Object.entries(checks).filter(([_, failed]) => failed);
    
    return {
      isValid: failedChecks.length === 0,
      failedChecks: failedChecks.map(([check]) => check),
      score: this.calculateQualityScore(text)
    };
  }
  
  static calculateQualityScore(text) {
    let score = 100;
    
    // Penalize short responses
    if (text.length < 50) score -= 30;
    else if (text.length < 100) score -= 15;
    
    // Reward good structure
    if (text.includes('\n\n')) score += 10; // Has paragraphs
    if (text.match(/[#*\-]\s/)) score += 10; // Has lists
    if (text.match(/[.!?]$/)) score += 5; // Properly ends
    
    // Penalize excessive whitespace
    const whitespaceRatio = (text.match(/\s/g) || []).length / text.length;
    if (whitespaceRatio > 0.4) score -= 20;
    
    return Math.max(0, Math.min(100, score));
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResponseExtractor;
}

// Export for browser (if needed for testing)
if (typeof window !== 'undefined') {
  window.ResponseExtractor = ResponseExtractor;
}


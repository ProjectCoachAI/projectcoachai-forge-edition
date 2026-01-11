# Backend API Guide - Clean Response Architecture

## 🎯 Overview

This guide shows how to implement the **server-side ResponseExtractor** in your backend API. The ResponseExtractor runs on your server to clean AI responses before sending them to the Electron app.

## ✅ Why Server-Side?

- **Legal Compliance**: No DOM scraping in Electron
- **Quality Guaranteed**: Clean responses every time
- **Consistent**: Same cleaning logic for all clients
- **Secure**: API keys stay on server
- **Maintainable**: Update cleaning logic in one place

---

## 📁 File Structure

```
your-backend/
├── ResponseExtractor.js    # Response cleaning engine
├── server.js               # Main API server
├── package.json
└── .env                    # API keys
```

---

## 🔧 Implementation

### Step 1: Add ResponseExtractor to Your Backend

Copy `ResponseExtractor.js` to your backend server.

### Step 2: Update Your API Endpoint

```javascript
// server.js
const express = require('express');
const ResponseExtractor = require('./ResponseExtractor');

const app = express();
app.use(express.json());

// Main comparison endpoint
app.post('/api/ai/query', async (req, res) => {
  try {
    const { aiProvider, prompt, userId } = req.body;
    
    // 1. Call AI service (OpenAI, Anthropic, etc.)
    const rawResponse = await callAIService(aiProvider, prompt);
    
    // 2. CLEAN the response (CRITICAL STEP)
    const cleanContent = ResponseExtractor.extract(aiProvider, rawResponse);
    
    // 3. Extract images if available
    const images = ResponseExtractor.extractImages(rawResponse, aiProvider);
    
    // 4. Validate quality
    const quality = ResponseExtractor.validateResponse(cleanContent, rawResponse.length);
    
    // 5. Return clean response
    res.json({
      provider: aiProvider,
      content: cleanContent, // ✅ CLEAN content
      images: images,
      quality: quality.score,
      isValid: quality.isValid,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      error: error.message,
      provider: req.body.aiProvider
    });
  }
});

// Batch endpoint for multiple AIs
app.post('/api/ai/batch', async (req, res) => {
  try {
    const { aiProviders, prompt, userId } = req.body;
    
    // Call all AIs in parallel
    const promises = aiProviders.map(provider => 
      callAIService(provider, prompt)
        .then(rawResponse => {
          // Clean each response
          const cleanContent = ResponseExtractor.extract(provider, rawResponse);
          const images = ResponseExtractor.extractImages(rawResponse, provider);
          const quality = ResponseExtractor.validateResponse(cleanContent, rawResponse.length);
          
          return {
            provider,
            content: cleanContent,
            images,
            quality: quality.score,
            isValid: quality.isValid,
            success: true
          };
        })
        .catch(error => ({
          provider,
          content: '',
          error: error.message,
          success: false
        }))
    );
    
    const results = await Promise.all(promises);
    
    res.json({
      success: true,
      responses: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Step 3: AI Service Adapters

```javascript
// ai-adapters.js
async function callAIService(aiProvider, prompt) {
  const adapters = {
    chatgpt: callOpenAI,
    claude: callAnthropic,
    gemini: callGoogleAI,
    perplexity: callPerplexity
  };
  
  const adapter = adapters[aiProvider.toLowerCase()];
  if (!adapter) {
    throw new Error(`Unsupported AI: ${aiProvider}`);
  }
  
  return await adapter(prompt);
}

async function callAnthropic(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  const data = await response.json();
  return data.content[0].text; // Raw response
}

async function callGoogleAI(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );
  
  const data = await response.json();
  return data.candidates[0].content.parts[0].text; // Raw response
}

// ... other adapters
```

---

## 🎯 What Gets Cleaned

### Claude
- ❌ Removed: Search history, topic lists, context markers
- ✅ Kept: Actual answer content

### Gemini
- ❌ Removed: Disclaimers, privacy notices, UI text
- ✅ Kept: Response content

### Perplexity
- ❌ Removed: "According to search results...", source lists
- ✅ Kept: Core answer

### ChatGPT
- ❌ Removed: Thinking markers, system messages
- ✅ Kept: Response content

---

## 📊 Response Format

Your API should return:

```json
{
  "provider": "claude",
  "content": "Clean response text here...",
  "images": [
    {
      "type": "markdown",
      "url": "https://example.com/image.png"
    }
  ],
  "quality": {
    "score": 95,
    "isValid": true
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## ✅ Benefits

1. **Clean Data**: No chat history, no disclaimers, no metadata
2. **Consistent**: Same format for all AIs
3. **Legal**: No DOM scraping in Electron
4. **Quality**: Validated responses
5. **Images**: Extracted when available
6. **Maintainable**: Update cleaning logic in one place

---

## 🚀 Next Steps

1. Copy `ResponseExtractor.js` to your backend
2. Update your API endpoints to use it
3. Test with sample responses
4. Deploy to Railway/your server
5. Update Electron app to use clean API responses

---

**The Electron app will receive clean, quality data from your API - no extraction needed!**












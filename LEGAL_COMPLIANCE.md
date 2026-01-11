# Legal Compliance - ProjectCoachAI

## ⚖️ Extraction/Scraping Policy

### ❌ DOM Extraction is DISABLED

**DOM scraping/extraction has been removed from the codebase for legal compliance reasons.**

### Legal Issues with Extraction

DOM extraction/scraping may violate:

1. **Terms of Service**
   - ChatGPT, Claude, Gemini, and other AI platforms prohibit automated scraping
   - Violation can result in account termination

2. **Computer Fraud and Abuse Act (CFAA)**
   - US federal law prohibiting unauthorized access to computer systems
   - Scraping without authorization may constitute a violation

3. **Data Protection Laws**
   - GDPR (EU)
   - CCPA (California)
   - Other regional data protection regulations

4. **Anti-Scraping Provisions**
   - Many jurisdictions have laws against automated data collection
   - May violate website terms of use

5. **Copyright and Intellectual Property**
   - Unauthorized extraction may infringe on copyright
   - Content belongs to AI providers

---

## ✅ Approved Methods

### 1. API Approach (PRIMARY - RECOMMENDED)

**✅ Legal and Compliant**
- Uses official API endpoints
- Authorized access through API keys
- Complies with Terms of Service
- Clean, structured data

**Setup:**
- Configure backend API proxy
- Set `API_PROXY_URL` environment variable
- See `API_SETUP_GUIDE.md` for details

### 2. Manual Paste (FALLBACK)

**✅ Legal and Compliant**
- User manually copies and pastes content
- User-initiated action
- No automated scraping
- Complies with all legal requirements

**How it works:**
- User copies response from AI tool
- User pastes into comparison view
- No automated extraction involved

---

## 🚫 What is NOT Allowed

### ❌ DOM Extraction/Scraping
- Automated reading of DOM elements
- JavaScript injection for content extraction
- Programmatic content scraping
- Any automated data collection from BrowserViews

### ❌ Why It's Disabled
- Legal compliance
- Terms of Service compliance
- User safety
- Platform integrity

---

## 📋 Implementation Status

### Current State
- ✅ Extraction function disabled
- ✅ API approach implemented
- ✅ Manual paste mode available
- ✅ Clear warnings in code
- ✅ Legal compliance documentation

### Code Changes
- `extractResponseFromPane()` function disabled
- Extraction fallback removed
- Manual paste mode as fallback
- API as only automated method

---

## 🔒 Compliance Checklist

- [x] Extraction functionality disabled
- [x] API approach implemented
- [x] Manual paste fallback available
- [x] Legal warnings in code
- [x] Documentation updated
- [x] Terms of Service compliance
- [x] No automated scraping

---

## 💡 Recommendations

1. **Always use API approach** when possible
2. **Manual paste** when API unavailable
3. **Never enable extraction** without legal review
4. **Review Terms of Service** of all AI platforms
5. **Consult legal counsel** if unsure about compliance

---

## 📞 Questions?

If you have questions about legal compliance:
1. Review Terms of Service of AI platforms
2. Consult with legal counsel
3. Ensure API approach is properly configured
4. Use manual paste as fallback

---

**Last Updated:** After removing extraction for legal compliance
**Status:** Compliant - Extraction disabled, API + Manual paste only












# Claude API Model Troubleshooting Guide

## 🚨 Current Issue: Model 404 Errors

If you're seeing 404 errors for `claude-3-5-sonnet-20241022`, this guide will help diagnose and fix the issue.

## ✅ Quick Fix: Test with Haiku First

The system now automatically falls back to Haiku if Sonnet fails. However, to verify your API key works, test with Haiku directly:

### Test Command:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-haiku-20241022",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, test"}
    ]
  }'
```

**Expected**: 200 status with response  
**If 404**: Your API key may not have access to this model

## 🔍 Diagnosis Steps

### 1. Verify API Key Access

**Check if your API key has access to the model:**

- Go to: https://console.anthropic.com/
- Check your API key permissions
- Verify billing is set up
- Check if there are any restrictions on models

### 2. Verify Model Name

**Current Model Names (January 2025):**
- ✅ `claude-3-5-haiku-20241022` - Should work (free tier)
- ❓ `claude-3-5-sonnet-20241022` - May require paid access
- ❓ `claude-sonnet-4-20250514` - Alternative Sonnet model

**Check Anthropic's official model list:**
- URL: https://docs.anthropic.com/en/api/pricing
- Look for current available models

### 3. Check API Version Header

**Current version**: `2023-06-01`

If models aren't working, try updating to a newer version:
- `2024-06-01` (if available)
- Check: https://docs.anthropic.com/en/api/versioning

### 4. Common Issues & Solutions

#### Issue 1: Model Not Available for Your Account
**Symptoms**: 404 error for specific models  
**Solution**: 
- Use Haiku model instead (works for most accounts)
- Upgrade your Anthropic account for Sonnet access
- Check billing status

#### Issue 2: Model Name Typo
**Symptoms**: 404 error  
**Solution**:
- Verify exact model name from Anthropic docs
- Check for typos (extra spaces, dashes, etc.)
- Use exact format: `claude-3-5-haiku-20241022`

#### Issue 3: API Key Permissions
**Symptoms**: 404 or 403 errors  
**Solution**:
- Verify API key is valid
- Check if key has model access restrictions
- Regenerate API key if needed

#### Issue 4: Deprecated Model
**Symptoms**: 404 error, model worked before  
**Solution**:
- Check deprecation notices: https://docs.anthropic.com/en/docs/about-claude/model-deprecations
- Update to recommended replacement model
- Use model recommendation function in code

## 🛠️ Current Workaround

The system has been updated to:

1. **Auto-fallback**: If Sonnet returns 404, automatically try Haiku
2. **Better error messages**: More diagnostic information in errors
3. **Graceful degradation**: Falls back to OpenAI if both Claude models fail

**This means synthesis will still work**, but paid tier users will temporarily use Haiku instead of Sonnet.

## 📋 Action Items

### Immediate Actions:

1. **Test API Key with Haiku**:
   ```bash
   # Test if Haiku works
   curl -X POST https://api.anthropic.com/v1/messages \
     -H "x-api-key: YOUR_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model": "claude-3-5-haiku-20241022", "max_tokens": 100, "messages": [{"role": "user", "content": "test"}]}'
   ```

2. **Verify Model Access**:
   - Log into Anthropic console
   - Check account tier and permissions
   - Verify billing is active

3. **Check Model Availability**:
   - Visit: https://docs.anthropic.com/en/api/pricing
   - Verify current available models
   - Check for any announcements

### Next Steps:

1. **Contact Anthropic Support** (if needed):
   - Support: support@anthropic.com
   - Question: "Does my API key have access to claude-3-5-sonnet-20241022?"
   - Include: Your API key prefix (first 10 chars)

2. **Alternative Solutions**:
   - Use Haiku for all tiers (works, slightly lower quality)
   - Try `claude-sonnet-4-20250514` if available
   - Use OpenAI GPT-4 as primary for paid tier

3. **Update Configuration** (once resolved):
   ```javascript
   // In preload.js, restore original model selection:
   const claudeModel = isFreeTier 
       ? 'claude-3-5-haiku-20241022' 
       : 'claude-3-5-sonnet-20241022';
   ```

## 💡 Recommendations

### Short Term (Until Issue Resolved):
- ✅ Use Haiku for all tiers (working solution)
- ✅ Keep OpenAI fallback active
- ✅ Monitor for Anthropic announcements

### Long Term:
- ✅ Set up automated model availability checking
- ✅ Implement model health monitoring
- ✅ Create admin dashboard for model status
- ✅ Add automatic model recommendation based on API key capabilities

## 🔗 Resources

- **Anthropic Pricing**: https://docs.anthropic.com/en/api/pricing
- **Model Deprecations**: https://docs.anthropic.com/en/docs/about-claude/model-deprecations
- **API Errors**: https://docs.anthropic.com/en/api/errors
- **API Versioning**: https://docs.anthropic.com/en/api/versioning
- **Support**: support@anthropic.com

## 📊 Current Status

**Working Models:**
- ✅ `claude-3-5-haiku-20241022` - Tested, works
- ❌ `claude-3-5-sonnet-20241022` - 404 errors (requires investigation)

**Fallback Strategy:**
- ✅ Haiku auto-fallback if Sonnet fails
- ✅ OpenAI fallback if Claude fails
- ✅ System remains functional

**Next Review**: Check model availability weekly until issue resolved

---

**Last Updated**: January 10, 2025  
**Status**: Active troubleshooting

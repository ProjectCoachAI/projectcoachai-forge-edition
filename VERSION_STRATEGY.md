# Version Numbering Strategy

## Current Status

**Product Name**: ProjectCoachAI Forge Edition  
**Current Version**: 1.0.0 (in package.json)

## Version Numbering Proposal

### Semantic Versioning (SemVer)
Format: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes, major feature additions
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes, small improvements

### Recommended Version for Launch

**Version 1.0.0** - Initial Release (Forge Edition Desktop)

This represents:
- ✅ First stable desktop release
- ✅ All core features implemented
- ✅ Ready for public launch
- ✅ Production-ready quality

## Version History

### v1.0.0 (Planned - Launch)
**ProjectCoachAI Forge Edition - Desktop**
- Initial desktop application release
- 7 AI tools comparison (ChatGPT, Claude, Gemini, Perplexity, Grok, DeepSeek, Poe)
- Comparison workspace with multi-pane view
- 7 synthesis modes (analysis frameworks)
- Ranking & scoring system
- Export functionality (PDF, JSON, Markdown)
- Stripe subscription integration
- Swiss privacy compliance (local processing)

## Future Versions

### v1.1.0 (Post-Launch Updates)
- Bug fixes and improvements
- Additional AI tools (as compatible)
- Enhanced synthesis modes
- UI/UX improvements

### v1.2.0 (Hybrid Web Version)
- Web version of Forge Edition
- Sync between desktop and web
- Shared subscription
- Cloud workspace (optional)

### v2.0.0 (ProjectCoachAI Lite - Browser Extension)
- Browser extension version
- Simplified interface
- Quick comparison tool
- Free tier focus

## Version Display

Consider showing version in:
1. **About/Help menu**: "ProjectCoachAI Forge Edition v1.0.0"
2. **Window title**: "ProjectCoachAI Forge Edition - v1.0.0"
3. **Settings/Preferences**: Version info
4. **Update checker**: For future auto-updates

## Version File Location

- `package.json`: `"version": "1.0.0"`
- Electron Builder uses this for:
  - App version in metadata
  - Installer versioning
  - Auto-updater (if implemented)

## Discussion Points for Tomorrow

1. **Version number for launch**: Confirm 1.0.0 or use 0.9.0 (beta) first?
2. **Hybrid solution architecture**: How desktop + web will sync
3. **Website integration**: How website serves both marketing and web app
4. **ProjectCoachAI Lite**: Feature set and relationship to Forge Edition
5. **Versioning across platforms**: Desktop, Web, Lite versioning strategy





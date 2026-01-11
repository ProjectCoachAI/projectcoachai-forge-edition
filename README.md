# ProjectCoachAI - Swiss Privacy Edition

**Your AI Workspace Manager**

A simple, privacy-focused desktop application that lets you compare multiple AI tools side-by-side. Built with Electron for Xencore Global GmbH.

## 🇨🇭 Swiss Privacy Guarantee

- **Zero Data Collection**: We never see your data
- **Local Storage Only**: Everything stays on your device
- **User Control**: You select tools, you log in, you compare
- **No Extraction**: We provide windows, you do the work

## Features

- **Tool Selection**: Choose from 5+ AI tools or add your own
- **Multi-Pane Workspace**: View 2-16 AI tools simultaneously
- **Prompt Sharing**: Type once, send to all panes
- **Visual Comparison**: Side-by-side view of responses
- **Swiss Compliance**: Fully compliant with Swiss privacy laws

## Installation

```bash
npm install
npm start
```

## How It Works

1. **Select Tools**: Choose AI tools from the toolshelf
2. **Log In**: Use your own accounts for each tool
3. **Compare**: View responses side-by-side
4. **Control**: All data stays on your device

## Architecture

- **Main Process**: Simple window manager (~200 lines)
- **Renderer**: Clean HTML/CSS/JS interfaces
- **BrowserViews**: Isolated sessions per AI tool
- **No Data Processing**: Zero extraction or analysis

## Legal

This software is provided as a workspace management tool. Users are responsible for:
- Their own AI tool accounts
- Compliance with each tool's Terms of Service
- Data they choose to share or export

Xencore Global GmbH provides workspace management only. We do not:
- Access user data from AI tools
- Store conversations or prompts
- Handle user credentials
- Process or analyze AI responses

## License

MIT License - Xencore Global GmbH

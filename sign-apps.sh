#!/bin/bash
# Post-build script to sign apps with ad-hoc signature

echo "🔐 Signing Apps with Ad-Hoc Signature"
echo ""

# Sign Intel Mac app
if [ -d "dist/mac/ProjectCoachAI Forge Edition V1.app" ]; then
    echo "Signing Intel Mac app..."
    codesign --force --deep --sign - "dist/mac/ProjectCoachAI Forge Edition V1.app"
    echo "✅ Intel Mac app signed"
else
    echo "⚠️  Intel Mac app not found"
fi

# Sign Apple Silicon app
if [ -d "dist/mac-arm64/ProjectCoachAI Forge Edition V1.app" ]; then
    echo "Signing Apple Silicon app..."
    codesign --force --deep --sign - "dist/mac-arm64/ProjectCoachAI Forge Edition V1.app"
    echo "✅ Apple Silicon app signed"
else
    echo "⚠️  Apple Silicon app not found"
fi

echo ""
echo "✅ Signing complete!"
echo ""
echo "Note: The DMG files need to be rebuilt to include the signed apps."
echo "Run: npm run build:mac (the apps are already signed, so DMG will contain signed versions)"

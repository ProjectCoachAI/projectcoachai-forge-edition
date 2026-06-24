#!/bin/bash
# Syncs forge-extension-v2 to the duplicate folder used by Chrome
SRC="/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/forge-extension-v2"
DST="/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/projectcoachai-forge-edition/forge-extension-v2"
rsync -av --exclude='.DS_Store' "$SRC/" "$DST/"
echo "✅ Extension synced"

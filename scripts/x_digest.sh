#!/bin/bash
# X/Twitter Digest Generator using bird
# Runs every 4 hours during active hours

OUTPUT_FILE="$HOME/workspace/memory/x_digest.md"

# Set environment variables
export AUTH_TOKEN="c4e6be9b6c2b605c4536c63847e1e33ccbca2cfb"
export CT0="79931aacea8e9421bfd4302452afc5904db67faa5d701f1261ba62376cda0f6dc9f8d35bc5e64c996058786059b3d27218ddaa84291ec5b69e22e555f987b884480caa1dda6ac726cdc693de046dc4a0"

now=$(date "+%Y-%m-%d %H:%M")

echo "=== X/Twitter Digest $now ===" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Check if bird is available
if ! command -v bird &> /dev/null; then
    echo "Error: bird command not found" >> "$OUTPUT_FILE"
    exit 1
fi

# Get trending news
echo "## Trending News" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
bird trending -n 10 --plain >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

# Get AI-related search results
echo "## AI & Tech Search" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
bird search "AI OR LLM OR Agent" -n 5 --plain >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "Saved: $OUTPUT_FILE"

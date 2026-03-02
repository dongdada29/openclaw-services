#!/bin/bash
# Unified Social Media Digest Generator
# Combines: Moltbook + X/Twitter + RSS Feeds
# Runs every 4 hours during active hours (9:59, 13:59, 17:59, 21:59)

OUTPUT_FILE="$HOME/workspace/memory/social_digest.md"
MOLTBOOK_FILE="$HOME/workspace/memory/moltbook_digest.md"
X_FILE="$HOME/workspace/memory/x_digest.md"
RSS_FILE="$HOME/workspace/memory/rss_digest.md"

now=$(date "+%Y-%m-%d %H:%M")

echo "=== Social Media Digest $now ===" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 1. Moltbook
echo "## 📱 Moltbook" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
if [ -f "$MOLTBOOK_FILE" ]; then
    # Get last 20 lines
    tail -20 "$MOLTBOOK_FILE" >> "$OUTPUT_FILE" 2>&1
else
    echo "Run: /Users/louis/workspace/scripts/moltbook_digest.sh" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# 2. X/Twitter
echo "## 🐦 X/Twitter" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
if [ -f "$X_FILE" ]; then
    tail -25 "$X_FILE" >> "$OUTPUT_FILE" 2>&1
else
    echo "Run: /Users/louis/workspace/scripts/x_digest.sh" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "Note: X requires authentication. Configure with:" >> "$OUTPUT_FILE"
    echo "  bird check  # after logging into x.com" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

# 3. RSS Feeds
echo "## 📰 RSS Feeds (AI/Tech)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
if [ -f "$RSS_FILE" ]; then
    tail -30 "$RSS_FILE" >> "$OUTPUT_FILE" 2>&1
else
    echo "Run: /Users/louis/workspace/scripts/rss_digest.sh" >> "$OUTPUT_FILE"
fi
echo "" >> "$OUTPUT_FILE"

echo "✅ Digest saved: $OUTPUT_FILE"
echo ""
echo "Individual digests:"
echo "  Moltbook: $MOLTBOOK_FILE"
echo "  X/Twitter: $X_FILE"
echo "  RSS: $RSS_FILE"

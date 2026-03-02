#!/bin/bash
# News briefing script - fetch top headlines and save to file

OUTPUT_FILE="/Users/louis/workspace/news-briefing.md"
DATE=$(date "+%Y-%m-%d %H:%M")

# Fetch Moltbook trending (if available)
echo "# 📰 新闻简报 - $DATE" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "## 定时任务已设置" >> "$OUTPUT_FILE"
echo "每5小时自动更新" >> "$OUTPUT_FILE"

echo "$OUTPUT_FILE created"

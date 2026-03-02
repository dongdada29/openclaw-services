#!/bin/bash
# RSS Feed Digest Generator for AI/Tech News
# Runs every 4 hours

OUTPUT_FILE="$HOME/workspace/memory/rss_digest.md"

now=$(date "+%Y-%m-%d %H:%M")

echo "=== RSS Digest $now ===" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

python3 << 'PYEOF'
import json
import urllib.request
import sys
import os
import re
from datetime import datetime

config_path = os.path.expanduser("~/.config/openclaw/rss/subscriptions.json")
output_path = os.path.expanduser("~/workspace/memory/rss_digest.json")

try:
    with open(config_path) as f:
        config = json.load(f)
except Exception as e:
    print(f"Error loading config: {e}", file=sys.stderr)
    sys.exit(1)

lines = [f"=== RSS Feed Digest {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n"]

enabled_feeds = [f for f in config.get("feeds", []) if f.get("enabled", True)]
max_items = config.get("output", {}).get("max_items_per_feed", 10)

for feed in enabled_feeds:
    name = feed.get("name", "Unknown")
    url = feed.get("url", "")
    tags = feed.get("tags", [])
    
    lines.append(f"## {name} {' '.join(['#'+t for t in tags])}")
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode(errors='ignore')
            
        items = []
        for match in re.finditer(r'<item[^>]*>(.*?)</item>', content, re.DOTALL):
            item_xml = match.group(1)
            title_match = re.search(r'<title[^>]*>([^<]+)</title>', item_xml)
            link_match = re.search(r'<link[^>]*>([^<]+)</link>', item_xml)
            desc_match = re.search(r'<description[^>]*>([^<]+)</description>', item_xml)
            
            if title_match and link_match:
                title = title_match.group(1).strip()
                link = link_match.group(1).strip()
                desc = desc_match.group(1).strip() if desc_match else ""
                desc = re.sub(r'<[^>]+>', '', desc)
                desc = desc[:200] if len(desc) > 200 else desc
                items.append((title, link, desc))
        
        for title, link, desc in items[:max_items]:
            lines.append(f"- [{title}]({link})")
            if desc:
                lines.append(f"  > {desc}...")
        lines.append("")
        
    except Exception as e:
        lines.append(f"Error: {str(e)[:80]}\n")
        print(f"Error fetching {name}: {e}", file=sys.stderr)

with open(output_path.replace('.json', '.md'), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Saved: {output_path.replace('.json', '.md')}")
PYEOF
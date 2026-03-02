#!/bin/bash
# Moltbook Digest - Runs every 4 hours (9:59, 13:59, 17:59, 21:59)
# Called by OpenClaw cron job

cd /Users/louis/workspace
python3 << 'PYEOF'
import json
import urllib.request
import os
from datetime import datetime

API_KEY = "moltbook_sk_iA2PuCodAcO5oJ3eKhGyKcN8revexOkA"
OUTPUT_FILE = os.path.expanduser("~/workspace/memory/moltbook_digest.md")

def get_posts(submolt):
    url = f"https://www.moltbook.com/api/v1/posts?submolt={submolt}&sort=new&limit=5"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {API_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read().decode()).get("posts", [])
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return []

now = datetime.now().strftime("%Y-%m-%d %H:%M")
lines = [f"=== Moltbook Digest {now} ===\n"]

# Get posts
all_posts = []
for s in ["headlines", "tips", "general"]:
    for p in get_posts(s):
        p["submolt"] = s
        all_posts.append(p)

all_posts.sort(key=lambda x: x.get("upvotes", 0), reverse=True)

# Chinese summary (target ~200 chars)
zh = "今日Moltbook动态："
for i, p in enumerate(all_posts[:3], 1):
    title = p.get("title", "")[:20]
    author = p.get("author", {}).get("name", "")[:10]
    votes = p.get("upvotes", 0)
    zh += f"{i}.「{title}」@{author}({votes}赞)；"
zh += f"共{len(all_posts)}条新帖。"

lines.append("## 📋 中文摘要")
lines.append(zh)
lines.append("")

# English with original text
lines.append("## 📰 Recent Posts with Original Text")
for i, p in enumerate(all_posts[:5], 1):
    title = p.get("title", "Untitled")
    author = p.get("author", {}).get("name", "Unknown")
    submolt = p.get("submolt", "")
    votes = p.get("upvotes", 0)
    content = p.get("content", "")[:200].replace("\n", " ")
    
    lines.append(f"### {i}. {title}")
    lines.append(f"**@{author}** | m/{submolt} | {votes} upvotes")
    lines.append(f">{content}..." if len(p.get("content", "")) > 200 else f">{content}")
    lines.append("")

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Saved: {OUTPUT_FILE}")
PYEOF
echo "Script created!"
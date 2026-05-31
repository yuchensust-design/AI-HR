#!/usr/bin/env bash
# 资产入仓脚本(PRD §3.9.5 资产管理)
# 用途: 把 ~/Documents/AI-HR/... 下的开发期资产 cp 到 offer-catcher-web 仓库内,
#       保证 Vercel 部署时直接打包(Web 代码绝不读本地绝对路径)
# 运行: bash scripts/copy-assets.sh

set -e

SRC="$HOME/Documents/Project/AI-HR"
DST="$(cd "$(dirname "$0")/.." && pwd)"

echo "📁 SRC: $SRC"
echo "📁 DST: $DST"
echo ""

# 1. Skill prompts × 3
mkdir -p "$DST/lib/prompts"

echo "📋 Copying Skill 1(经历挖掘)..."
cp "$SRC/excavating-work-experience-skill/SKILL.md" "$DST/lib/prompts/skill-excavating.md"
cp -r "$SRC/excavating-work-experience-skill/references" "$DST/lib/prompts/skill-excavating-refs"

echo "📋 Copying Skill 2(项目设计)..."
cp "$SRC/designing-bridge-projects-skill/SKILL.md" "$DST/lib/prompts/skill-designing-bridge.md"
cp -r "$SRC/designing-bridge-projects-skill/references" "$DST/lib/prompts/skill-designing-bridge-refs"

echo "📋 Copying Skill 3(简历匹配)..."
cp "$SRC/matching-and-augmenting-resume-skill/SKILL.md" "$DST/lib/prompts/skill-matching.md"
cp -r "$SRC/matching-and-augmenting-resume-skill/references" "$DST/lib/prompts/skill-matching-refs"

# 2. esther IP 头像 + 字体
mkdir -p "$DST/public/esther-assets"
echo "🖼️  Copying esther IP avatar..."
cp "$SRC/esther-design-system/assets/avatar.jpg" "$DST/public/esther-assets/avatar.jpg"

echo ""
echo "✅ 资产入仓完成"
echo ""
echo "Next steps:"
echo "  1. esther brand-dna 已手工翻译为 lib/design-tokens.ts(脚本不做这步)"
echo "  2. git add . && git commit -m 'chore: import skill prompts + esther assets'"

#!/usr/bin/env bash
set -euo pipefail

echo "📥 Pull perubahan terbaru dari Git..."
git pull

echo ""
echo "� Stop & hapus container lama..."
docker compose down

echo ""
echo "🔨 Rebuild image & jalankan container..."
docker compose up -d --build

echo ""
echo "🧹 Hapus image lama yang tidak terpakai..."
docker image prune -f

echo ""
echo "📋 Status container:"
docker compose ps

echo ""
echo "📋 Log terbaru (5 baris):"
docker compose logs --tail 5

echo ""
echo "✅ Restart selesai!"

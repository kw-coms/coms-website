#!/usr/bin/env bash
set -euo pipefail

npx playwright install chromium

verify_browser() {
  local korean_fonts
  korean_fonts="$(fc-list :lang=ko family)" && [[ -n "$korean_fonts" ]] &&
    node --input-type=module -e 'import { chromium } from "@playwright/test"; const browser = await chromium.launch({ timeout: 15000 }); await browser.close();'
}

if verify_browser; then
  echo 'Chromium and Korean fonts are ready.'
  exit 0
fi

# Keep slow package mirrors from consuming the job's full test budget.
if [[ -f /etc/apt/apt-mirrors.txt ]]; then
  printf '%s\tpriority:1\n%s\tpriority:2\n' 'https://archive.ubuntu.com/ubuntu/' 'https://mirrors.edge.kernel.org/ubuntu/' |
    sudo tee /etc/apt/apt-mirrors.txt >/dev/null
fi
printf '%s\n' 'Acquire::Retries "1";' 'Acquire::http::Timeout "20";' 'Acquire::https::Timeout "20";' |
  sudo tee /etc/apt/apt.conf.d/99-coms-ci-network >/dev/null
timeout --kill-after=15s 4m npx playwright install-deps chromium
verify_browser

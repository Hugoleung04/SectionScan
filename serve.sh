#!/bin/bash
cd "$(dirname "$0")"
echo "剖形 SectionScan  http://127.0.0.1:8080"
python3 -m http.server 8080

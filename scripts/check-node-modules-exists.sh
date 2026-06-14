#!/bin/bash
# Check if node_modules directory exists at the repo root
# Returns "exists" or "missing" to stdout

if [ -d node_modules ]; then
    echo "exists"
else
    echo "missing"
fi

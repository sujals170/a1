#!/usr/bin/env bash
# Generates config.js from Render environment variables.
set -e

cat > config.js << EOF
window.APP_CONFIG = {
  firebase: {
    apiKey: "${apiKey:-}",
    authDomain: "${authDomain:-}",
    databaseURL: "${databaseURL:-}",
    projectId: "${projectId:-}",
    storageBucket: "${storageBucket:-}",
    messagingSenderId: "${messagingSenderId:-}",
    appId: "${appId:-}"
  }
};
EOF

echo "config.js generated from environment variables"

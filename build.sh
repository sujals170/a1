#!/usr/bin/env bash
set -e

echo "Starting build script..."
echo "Checking for FIREBASE_API_KEY: ${FIREBASE_API_KEY:-(empty)}"

# Strip any accidental newlines or whitespace from env vars
_apiKey=$(echo "${FIREBASE_API_KEY:-}" | tr -d '\r\n\t ')
_authDomain=$(echo "${FIREBASE_AUTH_DOMAIN:-}" | tr -d '\r\n\t ')
_databaseURL=$(echo "${FIREBASE_DATABASE_URL:-}" | tr -d '\r\n\t ')
_projectId=$(echo "${FIREBASE_PROJECT_ID:-}" | tr -d '\r\n\t ')
_storageBucket=$(echo "${FIREBASE_STORAGE_BUCKET:-}" | tr -d '\r\n\t ')
_messagingSenderId=$(echo "${FIREBASE_MESSAGING_SENDER_ID:-}" | tr -d '\r\n\t ')
_appId=$(echo "${FIREBASE_APP_ID:-}" | tr -d '\r\n\t ')

echo "apiKey length: ${#_apiKey}"
echo "authDomain: ${_authDomain}"

# Generate config.js using pure bash
cat > config.js << EOF
window.APP_CONFIG = {
  firebase: {
    apiKey: '${_apiKey}',
    authDomain: '${_authDomain}',
    databaseURL: '${_databaseURL}',
    projectId: '${_projectId}',
    storageBucket: '${_storageBucket}',
    messagingSenderId: '${_messagingSenderId}',
    appId: '${_appId}'
  }
};
EOF

echo "Firebase config.js generated successfully"
cat config.js

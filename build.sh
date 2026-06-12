#!/usr/bin/env bash
set -e

# Function to clean environment variable values (stripping extra quotes, commas, and newlines)
clean_value() {
  local val="$1"
  # 1. Remove leading/trailing whitespace
  # 2. Remove leading/trailing " or '
  # 3. Remove trailing comma or \n (literal backslash-n)
  echo "$val" | sed -E 's/^[[:space:]"'\'' ]+//; s/[[:space:]"'\', ]+$//; s/\\n$//' | xargs echo -n
}

# Collect values from both styles of environment variables
_apiKey=$(clean_value "${FIREBASE_API_KEY:-${apiKey:-}}")
_authDomain=$(clean_value "${FIREBASE_AUTH_DOMAIN:-${authDomain:-}}")
_databaseURL=$(clean_value "${FIREBASE_DATABASE_URL:-${databaseURL:-}}")
_projectId=$(clean_value "${FIREBASE_PROJECT_ID:-${projectId:-}}")
_storageBucket=$(clean_value "${FIREBASE_STORAGE_BUCKET:-${storageBucket:-}}")
_messagingSenderId=$(clean_value "${FIREBASE_MESSAGING_SENDER_ID:-${messagingSenderId:-}}")
_appId=$(clean_value "${FIREBASE_APP_ID:-${appId:-}}")
_measurementId=$(clean_value "${FIREBASE_MEASUREMENT_ID:-${measurementId:-}}")

echo "Building project and injecting Firebase configuration..."

node -e "
const fs = require('fs');
const config = \`window.APP_CONFIG = {
  firebase: {
    apiKey: '${_apiKey}',
    authDomain: '${_authDomain}',
    databaseURL: '${_databaseURL}',
    projectId: '${_projectId}',
    storageBucket: '${_storageBucket}',
    messagingSenderId: '${_messagingSenderId}',
    appId: '${_appId}',
    measurementId: '${_measurementId}'
  }
};\`;

['index.html', 'admin.html'].forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('<!-- FIREBASE_CONFIG -->')) {
      content = content.replace('<!-- FIREBASE_CONFIG -->', '<script>' + config + '</script>');
      fs.writeFileSync(file, content);
      console.log('Injected into ' + file);
    } else {
      console.warn('Warning: Placeholder not found in ' + file);
    }
  }
});
"

echo "Build complete."

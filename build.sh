]#!/usr/bin/env bash
set -e

clean_value() {
  local val="$1"
  echo "$val" | sed -E "s/^[[:space:]\"']+//; s/[[:space:]\"',]+\$//; s/\\\\n\$//" | tr -d '\n'
}

_apiKey=$(clean_value "${FIREBASE_API_KEY:-${apiKey:-}}")
_authDomain=$(clean_value "${FIREBASE_AUTH_DOMAIN:-${authDomain:-}}")
_databaseURL=$(clean_value "${FIREBASE_DATABASE_URL:-${databaseURL:-}}")
_projectId=$(clean_value "${FIREBASE_PROJECT_ID:-${projectId:-}}")
_storageBucket=$(clean_value "${FIREBASE_STORAGE_BUCKET:-${storageBucket:-}}")
_messagingSenderId=$(clean_value "${FIREBASE_MESSAGING_SENDER_ID:-${messagingSenderId:-}}")
_appId=$(clean_value "${FIREBASE_APP_ID:-${appId:-}}")
_measurementId=$(clean_value "${FIREBASE_MEASUREMENT_ID:-${measurementId:-}}")

echo "Building project and injecting Firebase configuration..."

node << 'EOF'
const fs = require('fs');
const config = `window.APP_CONFIG = {
  firebase: {
    apiKey: '${process.env._apiKey}',
    authDomain: '${process.env._authDomain}',
    databaseURL: '${process.env._databaseURL}',
    projectId: '${process.env._projectId}',
    storageBucket: '${process.env._storageBucket}',
    messagingSenderId: '${process.env._messagingSenderId}',
    appId: '${process.env._appId}',
    measurementId: '${process.env._measurementId}'
  }
};`;

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
EOF

echo "Build complete."

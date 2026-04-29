#!/usr/bin/env bash
set -e

# Strip any accidental newlines or whitespace from env vars
_apiKey=$(echo "${apiKey:-}" | tr -d '\r\n\t ')
_authDomain=$(echo "${authDomain:-}" | tr -d '\r\n\t ')
_databaseURL=$(echo "${databaseURL:-}" | tr -d '\r\n\t ')
_projectId=$(echo "${projectId:-}" | tr -d '\r\n\t ')
_storageBucket=$(echo "${storageBucket:-}" | tr -d '\r\n\t ')
_messagingSenderId=$(echo "${messagingSenderId:-}" | tr -d '\r\n\t ')
_appId=$(echo "${appId:-}" | tr -d '\r\n\t ')

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
    appId: '${_appId}'
  }
};\`;
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<!-- FIREBASE_CONFIG -->', '<script>' + config + '</script>');
fs.writeFileSync('index.html', html);
console.log('Firebase config injected successfully');
"

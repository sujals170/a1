#!/usr/bin/env bash
set -e

_apiKey=$(echo "${FIREBASE_API_KEY:-}" | tr -d '\r\n\t ')
_authDomain=$(echo "${FIREBASE_AUTH_DOMAIN:-}" | tr -d '\r\n\t ')
_databaseURL=$(echo "${FIREBASE_DATABASE_URL:-}" | tr -d '\r\n\t ')
_projectId=$(echo "${FIREBASE_PROJECT_ID:-}" | tr -d '\r\n\t ')
_storageBucket=$(echo "${FIREBASE_STORAGE_BUCKET:-}" | tr -d '\r\n\t ')
_messagingSenderId=$(echo "${FIREBASE_MESSAGING_SENDER_ID:-}" | tr -d '\r\n\t ')
_appId=$(echo "${FIREBASE_APP_ID:-}" | tr -d '\r\n\t ')

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

const tag = '<script>' + config + '<\/script>';

const html = fs.readFileSync('index.html', 'utf8');
const admin = fs.readFileSync('admin.html', 'utf8');

// ✅ Each file uses its OWN content
fs.writeFileSync('index.html', html.replace('<!-- FIREBASE_CONFIG -->', tag));
fs.writeFileSync('admin.html', admin.replace('<!-- FIREBASE_CONFIG -->', tag));

console.log('Firebase config injected into index.html and admin.html');
"

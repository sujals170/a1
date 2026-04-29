#!/usr/bin/env bash
set -e

node -e "
const fs = require('fs');
const config = \`window.APP_CONFIG = {
  firebase: {
    apiKey: '${apiKey:-}',
    authDomain: '${authDomain:-}',
    databaseURL: '${databaseURL:-}',
    projectId: '${projectId:-}',
    storageBucket: '${storageBucket:-}',
    messagingSenderId: '${messagingSenderId:-}',
    appId: '${appId:-}'
  }
};\`;
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<!-- FIREBASE_CONFIG -->', '<script>' + config + '</script>');
fs.writeFileSync('index.html', html);
console.log('Firebase config injected into index.html');
"

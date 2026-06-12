#!/usr/bin/env bash
set -e

echo "Building project and generating Firebase config..."

node <<'NODE'
const fs = require('fs');

function clean(val) {
  if (!val) return '';
  return String(val).trim()
    .replace(/^[ "',]+/, '')
    .replace(/[ "',]+$/, '')
    .replace(/\\n$/, '');
}

const config = {
  apiKey: clean(process.env.FIREBASE_API_KEY),
  authDomain: clean(process.env.FIREBASE_AUTH_DOMAIN),
  databaseURL: clean(process.env.FIREBASE_DATABASE_URL),
  projectId: clean(process.env.FIREBASE_PROJECT_ID),
  storageBucket: clean(process.env.FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(process.env.FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(process.env.FIREBASE_APP_ID),
  measurementId: clean(process.env.FIREBASE_MEASUREMENT_ID)
};

const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];
const missing = required.filter((key) => !config[key]);
if (missing.length) {
  console.error('Missing required Firebase environment variables:', missing.join(', '));
  console.error('Set these on Render (Dashboard → Environment):');
  console.error('  FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_DATABASE_URL,');
  console.error('  FIREBASE_PROJECT_ID, FIREBASE_APP_ID');
  process.exit(1);
}

const lines = [
  'window.APP_CONFIG = {',
  '  firebase: {',
  `    apiKey: ${JSON.stringify(config.apiKey)},`,
  `    authDomain: ${JSON.stringify(config.authDomain)},`,
  `    databaseURL: ${JSON.stringify(config.databaseURL)},`,
  `    projectId: ${JSON.stringify(config.projectId)},`,
  `    storageBucket: ${JSON.stringify(config.storageBucket)},`,
  `    messagingSenderId: ${JSON.stringify(config.messagingSenderId)},`,
  `    appId: ${JSON.stringify(config.appId)},`,
  `    measurementId: ${JSON.stringify(config.measurementId)}`,
  '  }',
  '};',
  ''
];

fs.writeFileSync('config.js', lines.join('\n'));
console.log('Generated config.js');
NODE

echo "Build complete."

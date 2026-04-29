#!/usr/bin/env bash
# Injects Firebase config as an inline script into index.html
set -e

cat > /tmp/firebase_config.js << EOF
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

python3 -c "
content = open('index.html').read()
config = open('/tmp/firebase_config.js').read()
inline = '<script>' + config + '</script>'
content = content.replace('<!-- FIREBASE_CONFIG -->', inline)
open('index.html', 'w').write(content)
"

echo "Firebase config injected into index.html"

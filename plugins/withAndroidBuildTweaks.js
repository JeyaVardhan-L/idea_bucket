// - Release signing from env vars (CI secrets / local keystore); falls back to debug signing if absent.
// - Only arm64-v8a (phones) + x86_64 (emulator): whisper.cpp native builds are slow and large.
// - Keep whisper.rn classes if minification is ever enabled.
const { withAppBuildGradle, withGradleProperties, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SIGNING = `
        release {
            if (System.getenv("IB_KEYSTORE_PATH")) {
                storeFile file(System.getenv("IB_KEYSTORE_PATH"))
                storePassword System.getenv("IB_KEYSTORE_PASSWORD")
                keyAlias System.getenv("IB_KEY_ALIAS")
                keyPassword System.getenv("IB_KEY_PASSWORD")
            }
        }`;

module.exports = function withAndroidBuildTweaks(config) {
  config = withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (!g.includes('IB_KEYSTORE_PATH')) {
      g = g.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
      // in buildTypes.release, use the release config when available
      g = g.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig System.getenv("IB_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug',
      );
    }
    c.modResults.contents = g;
    return c;
  });
  config = withGradleProperties(config, (c) => {
    const set = (key, value) => {
      c.modResults = c.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      c.modResults.push({ type: 'property', key, value });
    };
    set('reactNativeArchitectures', 'arm64-v8a,x86_64');
    set('org.gradle.jvmargs', '-Xmx6g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8');
    return c;
  });
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const f = path.join(c.modRequest.platformProjectRoot, 'app/proguard-rules.pro');
      const rule = '-keep class com.rnwhisper.** { *; }';
      const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      if (!cur.includes(rule)) fs.writeFileSync(f, `${cur}\n${rule}\n`);
      return c;
    },
  ]);
  return config;
};

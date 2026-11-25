// Adds a static Android app shortcut: long-press the icon → "Record thought",
// which opens ideabucket://record and starts recording immediately.
const { withAndroidManifest, withDangerousMod, withStringsXml, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function shortcutsXml(pkg) {
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
    android:shortcutId="record"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/shortcut_record_short"
    android:shortcutLongLabel="@string/shortcut_record_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity"
      android:data="ideabucket://record" />
    <categories android:name="android.shortcut.conversation" />
  </shortcut>
</shortcuts>
`;
}

module.exports = function withAppShortcut(config) {
  const pkg = config.android.package;
  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [
        { $: { name: 'shortcut_record_short', translatable: 'false' }, _: 'Record thought' },
        { $: { name: 'shortcut_record_long', translatable: 'false' }, _: 'Record a thought' },
      ],
      c.modResults,
    );
    return c;
  });
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shortcuts.xml'), shortcutsXml(pkg));
      return c;
    },
  ]);
  config = withAndroidManifest(config, (c) => {
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    main['meta-data'] = (main['meta-data'] || []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    main['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    return c;
  });
  return config;
};

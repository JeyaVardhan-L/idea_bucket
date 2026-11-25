// Quick Settings tile "Record thought": pull down the shade, tap the tile, speak.
// The tile opens ideabucket://record, which starts recording immediately.
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const kotlin = (pkg) => `package ${pkg}

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class RecordTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    qsTile?.let {
      it.state = Tile.STATE_INACTIVE
      it.updateTile()
    }
  }

  @SuppressLint("StartActivityAndCollapseDeprecated")
  override fun onClick() {
    super.onClick()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("ideabucket://record")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val launch = Runnable {
      if (Build.VERSION.SDK_INT >= 34) {
        val pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        startActivityAndCollapse(pi)
      } else {
        @Suppress("DEPRECATION")
        startActivityAndCollapse(intent)
      }
    }
    if (isLocked) unlockAndRun(launch) else launch.run()
  }
}
`;

const ICON = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF"
      android:pathData="M12,14c1.66,0 3,-1.34 3,-3V5c0,-1.66 -1.34,-3 -3,-3S9,3.34 9,5v6C9,12.66 10.34,14 12,14zM17.3,11c0,3 -2.54,5.1 -5.3,5.1S6.7,14 6.7,11H5c0,3.41 2.72,6.23 6,6.72V21h2v-3.28c3.28,-0.48 6,-3.3 6,-6.72H17.3z"/>
</vector>
`;

module.exports = function withQuickSettingsTile(config) {
  const pkg = config.android.package;
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const root = c.modRequest.platformProjectRoot;
      const javaDir = path.join(root, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'RecordTileService.kt'), kotlin(pkg));
      const drawable = path.join(root, 'app/src/main/res/drawable');
      fs.mkdirSync(drawable, { recursive: true });
      fs.writeFileSync(path.join(drawable, 'ic_tile_mic.xml'), ICON);
      return c;
    },
  ]);
  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.service = (app.service || []).filter((s) => s.$['android:name'] !== '.RecordTileService');
    app.service.push({
      $: {
        'android:name': '.RecordTileService',
        'android:exported': 'true',
        'android:label': 'Record thought',
        'android:icon': '@drawable/ic_tile_mic',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
    });
    return c;
  });
  return config;
};

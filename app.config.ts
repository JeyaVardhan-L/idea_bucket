import type { ConfigContext, ExpoConfig } from 'expo/config';

// CI passes these so every release has a higher versionCode than the last.
const versionCode = Number(process.env.IB_VERSION_CODE ?? '1');
const versionName = process.env.IB_VERSION_NAME ?? '0.1.0';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Idea Bucket',
  slug: 'idea-bucket',
  scheme: 'ideabucket',
  version: versionName,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: { supportsTablet: true, bundleIdentifier: 'com.jeyavardhan.ideabucket' },
  android: {
    package: 'com.jeyavardhan.ideabucket',
    versionCode,
    adaptiveIcon: {
      backgroundColor: '#111214',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['android.permission.RECORD_AUDIO', 'android.permission.POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-audio', { microphonePermission: 'Idea Bucket records your spoken thoughts.', enableBackgroundRecording: false }],
    'expo-sqlite',
    'expo-secure-store',
    'expo-sharing',
    ['expo-splash-screen', { backgroundColor: '#111214', image: './assets/splash-icon.png', imageWidth: 120 }],
    'expo-background-task',
    ['expo-notifications', { color: '#7C8CF8' }],
    'expo-document-picker',
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: 'RecordWidget',
            label: 'Record thought',
            description: 'One tap to record a thought',
            minWidth: '180dp',
            minHeight: '60dp',
            targetCellWidth: 3,
            targetCellHeight: 1,
            resizeMode: 'horizontal',
            previewImage: './assets/widget-preview.png',
            updatePeriodMillis: 0,
          },
        ],
      },
    ],
    './plugins/withAppShortcut',
    './plugins/withAndroidBuildTweaks',
    './plugins/withQuickSettingsTile',
  ],
  experiments: { typedRoutes: false },
});

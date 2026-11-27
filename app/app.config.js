// One app, two installs. The dev build (the default) loads its code live from the PC. The preview build
// (APP_VARIANT=preview) is a separate app beside it, with its own name, ID and data. It runs the last update
// published to it from its own storage, so it keeps working away from the PC: closing it, reloading, no Wi-Fi.
// Its code changes by `eas update --channel preview`, not a rebuild. A rebuild is needed only when a native
// library is added.

const PROJECT_ID = '6e00e1ad-5e6d-4d04-87dd-c4c8937c233e'; // the Expo project this app publishes updates to (@nicholas-cox/app)

module.exports = ({ config }) => {
  const preview = process.env.APP_VARIANT === 'preview';
  const updates = PROJECT_ID
    ? {
        url: `https://u.expo.dev/${PROJECT_ID}`,
        enabled: preview,
        checkAutomatically: 'ON_LOAD',
        requestHeaders: { 'expo-channel-name': 'preview' },
      }
    : { enabled: false };
  return {
    ...config,
    name: preview ? 'Trackbench Preview' : config.name,
    scheme: preview ? 'trackbench-preview' : config.scheme,
    ios: { ...config.ios, bundleIdentifier: preview ? 'app.trackbench.preview' : config.ios.bundleIdentifier },
    android: { ...config.android, package: preview ? 'app.trackbench.preview' : config.android.package },
    runtimeVersion: { policy: 'appVersion' },
    updates,
    extra: { ...(config.extra ?? {}), ...(PROJECT_ID ? { eas: { projectId: PROJECT_ID } } : {}) },
  };
};

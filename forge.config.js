const { buildNative, executable } = require('./scripts/build-native.cjs');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MathPad',
    ignore: [/^\/(?:test|native|scripts)(?:\/|$)/],
    extraResource: [executable],
    electronZipDir: process.env.MATHPAD_ELECTRON_ZIP_DIR || undefined,
  },
  hooks: { generateAssets: buildNative },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }],
};

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MathPad',
    ignore: [/^\/test(?:\/|$)/],
    electronZipDir: process.env.MATHPAD_ELECTRON_ZIP_DIR || undefined,
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }],
};

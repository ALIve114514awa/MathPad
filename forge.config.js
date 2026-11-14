module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MathPad',
    ignore: [
      /^\/(?:test|native|scripts|runtime|locales|resources)(?:\/|$)/,
      /^\/(?:MathPad\.exe|LICENSE|LICENSES\.chromium\.html|portable-manifest\.json|vk_swiftshader_icd\.json|chrome_\d+_percent\.pak|[^/]+\.(?:dll|dat|bin|pak))$/,
    ],
    electronZipDir: process.env.MATHPAD_ELECTRON_ZIP_DIR || undefined,
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }],
};

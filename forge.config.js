const browserAssets = [
  'katex/package.json', 'katex/LICENSE',
  'katex/dist/katex.min.js', 'katex/dist/katex.min.css', 'katex/dist/fonts',
  'nerdamer/package.json', 'nerdamer/LICENSE.md',
  'nerdamer/dist/bundle.js', 'nerdamer/dist/bundle.js.LICENSE.txt',
];

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MathPad',
    icon: './assets/mathpad',
    extraResource: ['THIRD_PARTY_NOTICES.md', 'docs/licenses'],
    ignore(file) {
      file = file.replaceAll('\\', '/');
      if (!file || file === '/package.json' || /^\/(?:src|assets|vendor)(?:\/|$)/.test(file)) return false;
      if (file === '/node_modules') return false;
      if (!file.startsWith('/node_modules/')) return true;
      const relative = file.slice('/node_modules/'.length);
      // The app serves browser bundles; Node entry points, CLI tools and sources are unused.
      return !browserAssets.some(asset => asset === relative || asset.startsWith(`${relative}/`) || relative.startsWith(`${asset}/`));
    },
    electronZipDir: process.env.MATHPAD_ELECTRON_ZIP_DIR || undefined,
  },
  hooks: {
    prePackage: async () => require('./scripts/verify-geogebra.cjs').verifyGeoGebra(),
    generateAssets: async () => require('./scripts/verify-licenses.cjs').verifyLicenses(),
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }],
};

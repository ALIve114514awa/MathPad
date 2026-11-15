const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const copies = [
  ['node_modules/nerdamer/LICENSE.md', 'Nerdamer-LICENSE.txt'],
  ['node_modules/nerdamer/dist/bundle.js.LICENSE.txt', 'Nerdamer-bundle-NOTICE.txt'],
  ['node_modules/decimal.js/LICENCE.md', 'decimal.js-LICENSE.txt'],
  ['node_modules/katex/LICENSE', 'KaTeX-LICENSE.txt'],
  ['node_modules/commander/LICENSE', 'Commander-LICENSE.txt'],
  ['vendor/geogebra/LICENSE.txt', 'GeoGebra-LICENSE.txt'],
  ['vendor/geogebra/NOTICE.md', 'GeoGebra-NOTICE.md'],
];
function verifyLicenses(root = path.resolve(__dirname, '..')) {
  // Git may check out text with different line endings on Windows.
  const normalized = name => readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n').trimEnd();
  for (const [source, name] of copies) {
    assert.equal(normalized(`docs/licenses/${name}`), normalized(source), `${name}: bundled license differs from upstream`);
  }
  assert.match(normalized('THIRD_PARTY_NOTICES.md'), /Copyright \(c\) 2026 kwhyu/);
  assert.match(normalized('docs/licenses/README.md'), /GeoGebra/);
  console.log(`Verified ${copies.length} third-party license copies and Overlet attribution.`);
}
module.exports = { verifyLicenses };
if (require.main === module) verifyLicenses();

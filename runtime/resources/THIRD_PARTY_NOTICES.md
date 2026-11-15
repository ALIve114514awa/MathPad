# Third-party code notices

## Overlet

The floating button's edge proximity snapping follows the approach in
[Overlet](https://github.com/kwhyu/overlet/blob/main/src/main/overlayManager.js).
Math Pad uses its own floating window, controls, persistence and application integration.

MIT License

Copyright (c) 2026 kwhyu and Overlet contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Other bundled components

| Component | Version | Terms and preserved notices |
| --- | --- | --- |
| Electron / Chromium | Electron 45.2.3 | Electron MIT license and Chromium's component notices are supplied in `runtime/LICENSE` and `runtime/LICENSES.chromium.html`. |
| Nerdamer | 2.0.1 | Apache-2.0; `docs/licenses/Nerdamer-LICENSE.txt`. |
| decimal.js | 10.6.0 | MIT; `docs/licenses/decimal.js-LICENSE.txt` and `Nerdamer-bundle-NOTICE.txt`. |
| KaTeX | 0.19.1 | MIT; `docs/licenses/KaTeX-LICENSE.txt`. |
| Commander.js (KaTeX CLI dependency) | 15.1.0 | MIT; `docs/licenses/Commander-LICENSE.txt`. |
| GeoGebra official compiled resources | 5.4.936.0 | GeoGebra's applicable non-commercial terms; `vendor/geogebra/LICENSE.txt` and `NOTICE.md`, also copied under `docs/licenses/`. |

For the portable application these license copies are directly readable under
`runtime/resources/licenses/`, alongside this notice under `runtime/resources/`.
GeoGebra's upstream README and font notices remain with the unmodified resources
in `vendor/geogebra/` and in the application's ASAR archive. Official terms:
https://www.geogebra.org/license.

The application loads WIRIS MathType Hand from its official online demo only
when handwriting is requested. No WIRIS script or recognition server is
redistributed here. The demo is for prototype integration; production use
requires a valid MathType license and an appropriately licensed deployment.
See https://docs.wiris.com/en_US/mathtype-html-generic-integration/embed-mathtype-hand-in-a-web-page.

These notices do not relicense any component or grant an open-source license to
Math Pad's original code. The repository currently specifies UNLICENSED for that
code; public access does not override the applicable copyright or component terms.

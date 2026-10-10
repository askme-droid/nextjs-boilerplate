lcms-wasm 1.0.5 (https://github.com/mattdesl/lcms-wasm), MIT - see LICENSE.md.
Little CMS compiled to WebAssembly; the colour engine behind the CMYK PDF in
the flyer print tool (lib/flyer-print/cmyk.ts). Included as-is (dist/lcms.min.js
and dist/lcms.wasm) rather than as an npm dependency, because the package pulls
in a test runner and ~18 other packages as dependencies.
Little CMS itself is MIT-licensed too (the same licence text applies).

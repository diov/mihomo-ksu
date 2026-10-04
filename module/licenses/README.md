# Third-party notices

mihomo-ksu itself is MIT licensed (see `LICENSE` in the module root). The module zip also
distributes the components below, unmodified, each under its own license; the full texts are
in this directory.

| Component | Used as | License | Source |
|---|---|---|---|
| mihomo | `bin/mihomo`, the proxy core | MIT (`mihomo.txt`) | https://github.com/MetaCubeX/mihomo |
| metacubexd | dashboard, copied to `ui/` in the data directory | MIT (`metacubexd.txt`) | https://github.com/MetaCubeX/metacubexd |
| meta-rules-dat | `GeoIP.dat`, `GeoSite.dat` in the data directory | GPL-3.0 (`meta-rules-dat.txt`) | https://github.com/MetaCubeX/meta-rules-dat |
| js-yaml | `webroot/vendor/js-yaml.js` | MIT (`js-yaml.txt`) | https://github.com/nodeca/js-yaml |
| kernelsu (npm) | `webroot/vendor/kernelsu.js` | Apache-2.0 (`kernelsu.txt`) | https://github.com/tiann/KernelSU/tree/main/js |

The geo data files are separate works shipped alongside the module, not combined with its code.
Their corresponding source, including the lists and the workflow that builds them, is in the
meta-rules-dat repository linked above.

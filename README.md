# mihomo-ksu

KernelSU / APatch module that runs [mihomo](https://github.com/MetaCubeX/mihomo) in Tun mode, with a module WebUI for config management.

Work in progress — see [docs/plans/v0.1.md](docs/plans/v0.1.md).

## Install

- arm64 only.
- Disable or remove other Tun proxy modules (e.g. the old `Clash` module) first: they compete for the same tun device, routes and ports.
- Turn off **Private DNS** (Settings → Network → Private DNS → Off). While it is on (including the default "Automatic"), Android may send DNS over TLS directly, bypassing mihomo's DNS hijacking and fake-ip. `scripts/ctl.sh status` warns about this.

## Usage

- The core starts at boot. Disabling the module in the manager stops it immediately; enabling starts it again. The module's action button restarts it.
- Dashboard (metacubexd): `http://127.0.0.1:9090/ui`. The API secret is generated at install time and stored in `/data/adb/mihomo-ksu/secret`.
- Shell: `su -c /data/adb/modules/mihomo-ksu/scripts/ctl.sh start|stop|restart|status`.

## Data

Runtime data lives in `/data/adb/mihomo-ksu/` (config, subscriptions cache, geo data, dashboard, logs, secret). It survives upgrades and uninstalling. To remove it after uninstalling:

```sh
su -c rm -rf /data/adb/mihomo-ksu
```

## License

MIT. The module zip also bundles mihomo, metacubexd, the meta-rules-dat geo data, js-yaml and the kernelsu JS library under their own licenses; see [`module/licenses/README.md`](module/licenses/README.md) (`licenses/` in the zip, with the full texts).

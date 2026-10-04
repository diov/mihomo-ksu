# mihomo-ksu

KernelSU / APatch module that runs [mihomo](https://github.com/MetaCubeX/mihomo) in Tun mode, with a module WebUI for config management.

## Install

- KernelSU or APatch (Magisk isn't supported), arm64 only.
- Download `mihomo-ksu-<version>.zip` from [Releases](https://github.com/diov/mihomo-ksu/releases) and install it in the manager. Later versions show up as updates in the manager.
- Disable or remove other Tun proxy modules (e.g. the old `Clash` module) first: they compete for the same tun device, routes and ports.
- Turn off **Private DNS** (Settings → Network → Private DNS → Off). While it is on (including the default "Automatic"), Android may send DNS over TLS directly, bypassing mihomo's DNS hijacking and fake-ip. `scripts/ctl.sh status` warns about this.

## Usage

- Open the module's WebUI in the manager to manage the config: subscriptions (link or local file), custom rules before or after the template's rules, and the raw override YAML. Saving validates the result with `mihomo -t` and reloads it. The final config is the bundled template `base.yaml` plus your `override.yaml`; see [docs/override.md](docs/override.md) for the merge rules.
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

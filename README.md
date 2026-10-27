# Burrow

Free encrypted windows and bookmarks for Firefox. All themes and automatic session saving are included without a license key.

[Website](https://barryanders.github.io/burrow/) · [Source releases](https://github.com/barryanders/Burrow/releases) · [Firefox listing](https://addons.mozilla.org/en-US/firefox/addon/burrowmarks/)

## Build and test

Requires Node.js 20 or later. No runtime dependencies.

```sh
npm test
npm run build
npm run package
```

For development, open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `dist/firefox/manifest.json`. The Firefox source ZIP is not Mozilla-signed; normal installation requires a signed AMO release. The store version can lag behind this source release.

## Privacy and recovery

Vaults are encrypted locally. Saving windows requests tab access when needed. Burrow does not provide anonymous browsing or erase Firefox history. Keep an encrypted export and your recovery key: uninstalling the extension or losing its browser profile can remove local data. Automatic session saving is opt-in and runs only while the vault is unlocked.

## License and source

MIT. This repository contains the extension, tests, recovery tool, and build scripts. Former sales-site code and business records are excluded.

## Support

[Buy me a coffee](https://buymeacoffee.com/barryanders). Donations are optional and do not unlock features. No donation links appear inside Burrow.

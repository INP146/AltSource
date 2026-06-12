# iOS Source Deployment

This directory can be deployed as a static AltStore / SideStore source.

## How it works

- `source.config.json` is the only file you normally edit.
- `scripts/build-source-site.mjs` reads GitHub Releases for each configured app.
- `dist/source.json` and `dist/apps.json` are generated AltSource files.
- `dist/index.html` is a small landing page with AltStore and SideStore buttons.

## Add another app

Add another object to `source.config.json`:

```json
{
  "name": "AnotherApp",
  "bundleIdentifier": "com.example.AnotherApp",
  "githubOwner": "INP146",
  "githubRepository": "AnotherApp",
  "assetNamePattern": "^AnotherApp-v.*\\.ipa$",
  "subtitle": "Short app summary",
  "localizedDescription": "Longer app description.",
  "iconPath": "icons/another-app.png",
  "tintColor": "0D96F6",
  "minOSVersion": "17.0"
}
```

Then add the icon to `staticAssets`, or use a public `iconURL`.

## Build locally

```bash
npm run build
```

The source file will be available at:

```text
dist/source.json
```

## GitHub Pages

The workflow in `.github/workflows/deploy-source.yml` builds and deploys `dist/`.

In repository settings:

1. Open Settings -> Pages.
2. Set Source to GitHub Actions.
3. Run the `Deploy iOS Source` workflow.

For this repository, the default source URL will be:

```text
https://INP146.github.io/AltSource/source.json
```

## Cloudflare Pages

Create a Cloudflare Pages project from this repository:

- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `20`

Set `SITE_URL` to the production URL, for example:

```text
https://ios.example.com
```

Cloudflare preview builds can use `CF_PAGES_URL` automatically, but a stable `SITE_URL`
is better for the source JSON because app icons and screenshots need stable absolute URLs.

## Buttons

AltStore source link:

```text
https://altstore.io/source/INP146.github.io/AltSource/source.json
```

SideStore source link:

```text
sidestore://source?url=https%3A%2F%2FINP146.github.io%2FAltSource%2Fsource.json
```

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const configPath = path.resolve(rootDir, process.env.SOURCE_CONFIG || "source.config.json");
const publicDir = path.resolve(rootDir, "public");
const distDir = path.resolve(rootDir, "dist");

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const site = config.site || {};
const baseURL = normalizeBaseURL(
  process.env.SITE_URL ||
    process.env.CF_PAGES_URL ||
    site.baseURL ||
    "http://localhost:8080"
);
const sourceFileName = config.sourceFileName || "source.json";
const sourceURL = absoluteURL(sourceFileName);

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

if (await exists(publicDir)) {
  await fs.cp(publicDir, distDir, { recursive: true });
}

for (const asset of config.staticAssets || []) {
  await copyStaticAsset(asset);
}

const apps = await Promise.all((config.apps || []).map(buildApp));
const repository = {
  ...(config.source || {}),
  apps,
  news: config.news || []
};

await writeJSON(path.join(distDir, sourceFileName), repository);
await writeJSON(path.join(distDir, "apps.json"), repository);
await writeJSON(path.join(distDir, "metadata.json"), {
  site: {
    ...site,
    baseURL,
    sourceURL
  },
  apps: apps.map((app) => ({
    name: app.name,
    bundleIdentifier: app.bundleIdentifier,
    subtitle: app.subtitle || "",
    iconURL: app.iconURL,
    latestVersion: app.versions[0]?.version || null
  }))
});

await renderIndex(apps);
await renderInstallPages(apps);

console.log(`Built ${repository.apps.length} app(s) into ${relative(distDir)}`);
console.log(`Source URL: ${sourceURL}`);

async function buildApp(appConfig) {
  const defaults = config.defaults || {};
  const releases = await fetchReleases(appConfig.githubOwner, appConfig.githubRepository);
  const includePrereleases = appConfig.includePrereleases ?? defaults.includePrereleases ?? false;
  const maxVersions = appConfig.maxVersions ?? defaults.maxVersions ?? 10;

  const versions = [];
  for (const release of releases) {
    if (release.draft) {
      continue;
    }
    if (!includePrereleases && release.prerelease) {
      continue;
    }

    const asset = selectIPAAsset(appConfig, release.assets || []);
    if (!asset) {
      continue;
    }

    versions.push({
      version: normalizeVersion(release.tag_name),
      date: release.published_at || release.created_at,
      localizedDescription: release.body || `${appConfig.name} ${release.tag_name}`,
      downloadURL: asset.browser_download_url,
      size: asset.size,
      ...(appConfig.minOSVersion ? { minOSVersion: appConfig.minOSVersion } : {})
    });

    if (versions.length >= maxVersions) {
      break;
    }
  }

  if (versions.length === 0 && (appConfig.failOnMissingVersions ?? true)) {
    throw new Error(
      `No matching IPA release asset found for ${appConfig.name}. ` +
        `Check ${appConfig.githubOwner}/${appConfig.githubRepository} and assetNamePattern.`
    );
  }

  const app = {
    name: appConfig.name,
    bundleIdentifier: appConfig.bundleIdentifier,
    developerName: appConfig.developerName || defaults.developerName,
    localizedDescription: appConfig.localizedDescription,
    iconURL: appConfig.iconURL || absoluteURL(appConfig.iconPath),
    versions
  };

  copyIfPresent(app, appConfig, "subtitle");
  copyIfPresent(app, appConfig, "tintColor");
  copyIfPresent(app, appConfig, "screenshotURLs");
  copyIfPresent(app, appConfig, "appPermissions");
  copyIfPresent(app, appConfig, "beta");

  return app;
}

async function fetchReleases(owner, repo) {
  if (!owner || !repo) {
    throw new Error("Each app must define githubOwner and githubRepository.");
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ios-source-builder",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub releases request failed for ${owner}/${repo}: ${response.status} ${body}`);
  }

  return response.json();
}

function selectIPAAsset(appConfig, assets) {
  if (appConfig.assetName) {
    return assets.find((asset) => asset.name === appConfig.assetName);
  }

  if (appConfig.assetNamePattern) {
    const pattern = new RegExp(appConfig.assetNamePattern);
    const match = assets.find((asset) => pattern.test(asset.name));
    if (match) {
      return match;
    }
  }

  return assets.find((asset) => asset.name.toLowerCase().endsWith(".ipa"));
}

async function copyStaticAsset(asset) {
  if (!asset.from || !asset.to) {
    throw new Error("staticAssets entries must include from and to.");
  }

  const source = path.resolve(rootDir, asset.from);
  const target = path.resolve(distDir, asset.to);

  if (!target.startsWith(distDir)) {
    throw new Error(`Refusing to copy outside dist: ${asset.to}`);
  }

  if (!(await exists(source))) {
    throw new Error(`Static asset not found: ${asset.from}`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

async function renderIndex(apps) {
  const indexPath = path.join(distDir, "index.html");
  if (!(await exists(indexPath))) {
    return;
  }

  const appCards = apps.map(renderAppCard).join("\n");
  const firstInstall = firstInstallLinks(apps);
  const html = (await fs.readFile(indexPath, "utf8"))
    .replaceAll("%%SOURCE_NAME%%", escapeHTML(site.name || config.source?.name || "iOS Apps"))
    .replaceAll("%%SOURCE_DESCRIPTION%%", escapeHTML(site.description || "AltStore and SideStore source."))
    .replaceAll("%%SOURCE_URL%%", escapeHTML(sourceURL))
    .replaceAll("%%AVATAR_URL%%", escapeHTML(site.avatarURL || config.source?.iconURL || ""))
    .replaceAll("%%ALTSTORE_URL%%", escapeHTML(firstInstall.altstore || sourceURL))
    .replaceAll("%%SIDESTORE_URL%%", escapeHTML(firstInstall.sidestore || sourceURL))
    .replaceAll("%%GITHUB_URL%%", escapeHTML(site.githubURL || ""))
    .replaceAll("%%APP_COUNT%%", String(apps.length))
    .replaceAll("%%APP_CARDS%%", appCards);

  await fs.writeFile(indexPath, html);
}

async function renderInstallPages(apps) {
  for (const app of apps) {
    const latest = app.versions[0];
    if (!latest?.downloadURL) {
      continue;
    }

    await writeInstallPage({
      app,
      service: "altstore",
      title: `Install ${app.name} with AltStore`,
      badge: "badges/DownloadBadge_dark.png",
      appURL: `altstore://install?url=${encodeURIComponent(latest.downloadURL)}`,
      fallbackURL: latest.downloadURL
    });

    await writeInstallPage({
      app,
      service: "sidestore",
      title: `Install ${app.name} with SideStore`,
      badge: "badges/add-source-to-sidestore.png",
      appURL: `sidestore://install?url=${encodeURIComponent(latest.downloadURL)}`,
      fallbackURL: latest.downloadURL
    });
  }
}

async function writeInstallPage({ app, service, title, badge, appURL, fallbackURL }) {
  const filePath = path.join(distDir, "install", service, `${app.bundleIdentifier}.html`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  await fs.writeFile(
    filePath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHTML(title)}</title>
    <meta http-equiv="refresh" content="0; url=${escapeAttribute(appURL)}">
    <link rel="icon" href="${escapeAttribute(site.avatarURL || config.source?.iconURL || "")}">
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f7f8fa;
        color: #17202a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(420px, calc(100% - 32px));
        text-align: center;
      }

      img {
        max-width: 245px;
        width: 100%;
        height: auto;
      }

      p {
        color: #5d6978;
      }

      a {
        color: #0d96f6;
        font-weight: 650;
      }
    </style>
  </head>
  <body>
    <main>
      <a href="${escapeAttribute(appURL)}"><img src="../../${escapeAttribute(badge)}" alt="${escapeAttribute(title)}"></a>
      <p>If nothing opens, tap the badge again. You can also <a href="${escapeAttribute(fallbackURL)}">download the IPA</a>.</p>
    </main>
    <script>location.href = ${JSON.stringify(appURL)};</script>
  </body>
</html>
`
  );
}

function renderAppCard(app) {
  const version = app.versions[0];
  const versionText = version ? `Latest ${version.version}` : "No release yet";
  const minOS = version?.minOSVersion ? `iOS ${version.minOSVersion}+` : "iOS";

  return `
      <article class="app-card">
        <img class="app-icon" src="${escapeAttribute(app.iconURL)}" alt="" loading="lazy">
        <div class="app-info">
          <h2>${escapeHTML(app.name)}</h2>
          <p>${escapeHTML(app.subtitle || app.localizedDescription || "")}</p>
          <div class="meta">
            <span>${escapeHTML(versionText)}</span>
            <span>${escapeHTML(minOS)}</span>
          </div>
        </div>
      </article>`;
}

function normalizeVersion(tagName = "") {
  return tagName.startsWith("v") ? tagName.slice(1) : tagName;
}

function normalizeBaseURL(value) {
  return String(value).replace(/\/+$/, "");
}

function absoluteURL(value = "") {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `${baseURL}/${String(value).replace(/^\/+/, "")}`;
}

function firstInstallLinks(apps) {
  const first = apps.find((app) => app.versions[0]?.downloadURL);
  if (!first) {
    return {};
  }

  return {
    altstore: absoluteURL(`install/altstore/${first.bundleIdentifier}.html`),
    sidestore: absoluteURL(`install/sidestore/${first.bundleIdentifier}.html`)
  };
}

function copyIfPresent(target, source, key) {
  if (source[key] !== undefined && source[key] !== null) {
    target[key] = source[key];
  }
}

async function writeJSON(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHTML(value);
}

function relative(filePath) {
  return path.relative(rootDir, filePath) || ".";
}

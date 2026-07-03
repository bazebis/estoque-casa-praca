import { readdir, writeFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { defineConfig } from "vite";

function toPublicPath(filePath) {
    return filePath.split(sep).join(posix.sep);
}

async function listBuildFiles(directory, rootDirectory = directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            return listBuildFiles(entryPath, rootDirectory);
        }

        return toPublicPath(relative(rootDirectory, entryPath));
    }));

    return files.flat();
}

function createServiceWorkerSource({ cacheName, urls, base }) {
    return `const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(urls, null, 4)};
const BASE_PATH = ${JSON.stringify(base)};
const APP_SHELL_URL = new URL("index.html", self.registration.scope).toString();

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

function isSameOriginAppRequest(request) {
    const url = new URL(request.url);

    return url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH);
}

function cacheStaticRequest(request) {
    return caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
            return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
            }

            return networkResponse;
        });
    });
}

self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET" || !isSameOriginAppRequest(request)) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(() => caches.match(APP_SHELL_URL))
        );
        return;
    }

    event.respondWith(cacheStaticRequest(request));
});
`;
}

function pwaServiceWorkerPlugin() {
    let resolvedConfig;

    return {
        name: "estoque-pwa-service-worker",
        apply: "build",
        configResolved(config) {
            resolvedConfig = config;
        },
        async closeBundle() {
            const outputDirectory = join(resolvedConfig.root, resolvedConfig.build.outDir);
            const base = resolvedConfig.base.endsWith("/") ? resolvedConfig.base : `${resolvedConfig.base}/`;
            const files = await listBuildFiles(outputDirectory);
            const urls = files
                .filter((file) => file !== "sw.js")
                .map((file) => `${base}${file}`)
                .sort();
            const cacheName = `estoque-casa-praca-${Date.now()}`;
            const serviceWorkerSource = createServiceWorkerSource({ cacheName, urls, base });

            await writeFile(join(outputDirectory, "sw.js"), serviceWorkerSource);
        }
    };
}

export default defineConfig({
    plugins: [pwaServiceWorkerPlugin()]
});

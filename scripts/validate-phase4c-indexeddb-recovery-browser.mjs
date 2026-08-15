import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = process.cwd();
const expectedRoundId = "count_round_e7625bed-0b8e-44bc-a47f-d35880f51cff";
const expectedSessionId = "location_count_595a5f68-0347-4219-bf68-480ade396890";
const expectedEntryId = "location_entry_phase4c_browser_recovery";

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8"
};

function createPlannedItems() {
    return Array.from({ length: 152 }, (_, index) => ({
        itemCode: `ITEM-${String(index + 1).padStart(3, "0")}`,
        itemNameSnapshot: `Item ${index + 1}`,
        groupId: "group-cozinha",
        groupNameSnapshot: "COZINHA",
        linkId: `link-cozinha-${index + 1}`,
        locationId: "cozinha",
        locationPathSnapshot: ["COZINHA"],
        reportArea: "COZINHA",
        order: index,
        active: true
    }));
}

function createBrowserHarnessSource() {
    const plannedItems = createPlannedItems();
    return `<!doctype html>
<html lang="pt-BR">
<body data-result="pending">PENDING</body>
<script type="module">
const stage = new URLSearchParams(location.search).get("stage") || "recover";
const databaseName = "estoqueCasaPracaDB";
const databaseVersion = 7;
const roundId = ${JSON.stringify(expectedRoundId)};
const sessionId = ${JSON.stringify(expectedSessionId)};
const entryId = ${JSON.stringify(expectedEntryId)};
const templateId = "template-casa-da-praca";
const createdAt = "2026-08-15T12:00:00.000Z";
const progressedAt = "2026-08-15T13:00:00.000Z";
const plannedItems = ${JSON.stringify(plannedItems)};

const initialRound = {
    id: roundId,
    templateId,
    templateNameSnapshot: "Contagem Casa da Praça",
    status: "active",
    activeTemplateId: templateId,
    locations: [{
        locationId: "cozinha",
        locationPathSnapshot: ["COZINHA"],
        reportAreaSnapshot: "COZINHA",
        presentationOrder: 0,
        plannedItems,
        sessionId: null
    }],
    createdAt,
    updatedAt: createdAt,
    finishedAt: null,
    completion: null
};

const fallbackSession = {
    id: sessionId,
    templateId,
    templateNameSnapshot: "Contagem Casa da Praça",
    locationId: "cozinha",
    locationPathSnapshot: ["COZINHA"],
    reportAreaSnapshot: "COZINHA",
    status: "in_progress",
    plannedItems,
    plannedItemCount: plannedItems.length,
    activeLinkCountSnapshot: plannedItems.length,
    createdAt,
    updatedAt: progressedAt,
    startedAt: progressedAt,
    finishedAt: null,
    canceledAt: null,
    notes: "Criada pela rodada de contagem."
};

const fallbackEntry = {
    id: entryId,
    sessionId,
    templateId,
    locationId: "cozinha",
    linkId: plannedItems[0].linkId,
    itemCode: plannedItems[0].itemCode,
    itemNameSnapshot: plannedItems[0].itemNameSnapshot,
    groupId: plannedItems[0].groupId,
    groupNameSnapshot: plannedItems[0].groupNameSnapshot,
    reportAreaSnapshot: "COZINHA",
    rawQuantityText: "1",
    quantityDecimal: "1",
    rawUnit: "un",
    normalizedUnit: "un",
    notes: "",
    active: true,
    createdAt: progressedAt,
    updatedAt: progressedAt,
    removedAt: null
};

function requestResult(request) {
    return new Promise((resolveRequest, rejectRequest) => {
        request.onsuccess = () => resolveRequest(request.result);
        request.onerror = () => rejectRequest(request.error);
    });
}

function transactionComplete(transaction) {
    return new Promise((resolveTransaction, rejectTransaction) => {
        transaction.oncomplete = () => resolveTransaction();
        transaction.onerror = () => rejectTransaction(transaction.error);
        transaction.onabort = () => rejectTransaction(transaction.error || new Error("Transação abortada."));
    });
}

async function resetDatabase() {
    await new Promise((resolveDelete, rejectDelete) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolveDelete();
        request.onerror = () => rejectDelete(request.error);
        request.onblocked = () => rejectDelete(new Error("Exclusão do banco de teste bloqueada."));
    });
}

async function openSeedDatabase() {
    return new Promise((resolveOpen, rejectOpen) => {
        const request = indexedDB.open(databaseName, databaseVersion);
        request.onupgradeneeded = () => {
            const database = request.result;
            const stores = [
                ["appState", "key"], ["catalog", "id"], ["customUnits", "id"],
                ["countingDraft", "key"], ["countingHistory", "id"], ["backups", "key"],
                ["countTemplates", "id"], ["locationNodes", "id"], ["itemLocationLinks", "id"],
                ["locationCountSessions", "id"], ["locationCountEntries", "id"], ["countRounds", "id"]
            ];
            stores.forEach(([name, keyPath]) => database.createObjectStore(name, { keyPath }));
            request.transaction.objectStore("countRounds")
                .createIndex("activeTemplateId", "activeTemplateId", { unique: true });
        };
        request.onsuccess = () => resolveOpen(request.result);
        request.onerror = () => rejectOpen(request.error);
    });
}

async function seedIndexedDb(database) {
    const transaction = database.transaction(["appState", "countRounds"], "readwrite");
    const appState = transaction.objectStore("appState");
    [
        "localStorageMigrationCompleted",
        "countTemplatesLocalStorageMigrationCompleted",
        "locationNodesLocalStorageMigrationCompleted",
        "itemLocationLinksLocalStorageMigrationCompleted",
        "locationCountSessionsLocalStorageMigrationCompleted",
        "locationCountEntriesLocalStorageMigrationCompleted"
    ].forEach((key) => appState.put({ key, value: true, completedAt: createdAt }));
    transaction.objectStore("countRounds").put(initialRound);
    await transactionComplete(transaction);
    database.close();
}

function seedFallbackMirror() {
    const fallbackRound = structuredClone(initialRound);
    fallbackRound.locations[0].sessionId = sessionId;
    fallbackRound.updatedAt = progressedAt;
    localStorage.clear();
    localStorage.setItem("countRounds", JSON.stringify([fallbackRound]));
    localStorage.setItem("locationCountSessions", JSON.stringify([fallbackSession]));
    localStorage.setItem("locationCountEntries", JSON.stringify([fallbackEntry]));
}

async function readStore(storeName) {
    const database = await requestResult(indexedDB.open(databaseName, databaseVersion));
    const transaction = database.transaction(storeName, "readonly");
    const records = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionComplete(transaction);
    database.close();
    return records;
}

async function runStage() {
    if (stage === "recover") {
        await resetDatabase();
        const seedDatabase = await openSeedDatabase();
        await seedIndexedDb(seedDatabase);
        seedFallbackMirror();
    }

    // Cada estágio roda em um novo processo/realm e importa storage.js pela primeira vez.
    const storage = await import("/src/storage.js?phase4c-browser-stage=" + stage);
    const status = await storage.initializeStorage();
    const rounds = await readStore("countRounds");
    const sessions = await readStore("locationCountSessions");
    const entries = await readStore("locationCountEntries");
    const indexedDbRound = rounds.find((round) => round.id === roundId) || null;
    const indexedDbSession = sessions.find((session) => session.id === sessionId) || null;
    const indexedDbEntry = entries.find((entry) => entry.id === entryId) || null;
    return {
        stage,
        status,
        localMapping: JSON.parse(localStorage.getItem("countRounds"))[0].locations[0].sessionId,
        indexedDbMapping: indexedDbRound?.locations?.[0]?.sessionId || null,
        indexedDbSessionId: indexedDbSession?.id || null,
        indexedDbSessionStatus: indexedDbSession?.status || null,
        indexedDbPlannedItemCount: indexedDbSession?.plannedItemCount ?? null,
        indexedDbEntryId: indexedDbEntry?.id || null,
        indexedDbEntryActive: indexedDbEntry?.active ?? null,
        roundCount: rounds.length,
        sessionCount: sessions.length,
        entryCount: entries.length
    };
}

try {
    const result = await runStage();
    document.body.dataset.result = "complete";
    document.body.textContent = JSON.stringify({ ok: true, result });
} catch (error) {
    document.body.dataset.result = "complete";
    document.body.textContent = JSON.stringify({
        ok: false,
        error: { name: error?.name || "Error", message: error?.message || String(error) }
    });
}
</script>
</html>`;
}

function resolveProjectFile(requestPath) {
    const normalizedPath = normalize(decodeURIComponent(requestPath));
    const filePath = resolve(projectRoot, `.${normalizedPath}`);
    if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}/`)) return null;
    return filePath;
}

async function serveRequest(request, response) {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname === "/__phase4c_indexeddb_recovery") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(createBrowserHarnessSource());
        return;
    }

    const filePath = resolveProjectFile(requestUrl.pathname);
    if (!filePath) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }
    try {
        const contents = await readFile(filePath);
        response.writeHead(200, {
            "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
            "cache-control": "no-store"
        });
        response.end(contents);
    } catch {
        response.writeHead(404);
        response.end("Not found");
    }
}

async function findChromiumExecutable() {
    const candidates = [
        process.env.CHROMIUM_BIN,
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/snap/bin/chromium"
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // Continuar permite usar qualquer navegador compatível já instalado.
        }
    }
    throw new Error("Chromium/Chrome não encontrado. Defina CHROMIUM_BIN para executar este validator.");
}

async function waitForDevToolsPort(profileDirectory) {
    const portFile = join(profileDirectory, "DevToolsActivePort");
    for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
            const [port] = (await readFile(portFile, "utf8")).trim().split("\n");
            if (port) return Number(port);
        } catch {
            // O endpoint aparece de forma assíncrona durante o startup do Chromium.
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    throw new Error("O Chromium não abriu o endpoint de depuração.");
}

function createDevToolsClient(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    const pendingCommands = new Map();
    let nextCommandId = 1;
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        const pending = pendingCommands.get(message.id);
        if (!pending) return;
        pendingCommands.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
    });
    return {
        ready: new Promise((resolveReady, rejectReady) => {
            socket.addEventListener("open", resolveReady, { once: true });
            socket.addEventListener("error", rejectReady, { once: true });
        }),
        send(method, params = {}) {
            const id = nextCommandId;
            nextCommandId += 1;
            return new Promise((resolveCommand, rejectCommand) => {
                pendingCommands.set(id, { resolve: resolveCommand, reject: rejectCommand });
                socket.send(JSON.stringify({ id, method, params }));
            });
        },
        close: () => socket.close()
    };
}

async function readHarnessResult(client) {
    const evaluation = await client.send("Runtime.evaluate", {
        expression: `(async () => {
            const deadline = Date.now() + 20000;
            while (document.body?.dataset.result !== "complete") {
                if (Date.now() > deadline) throw new Error("Timeout aguardando o harness.");
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
            return document.body.textContent;
        })()`,
        awaitPromise: true,
        returnByValue: true
    });
    if (evaluation.exceptionDetails) {
        throw new Error(evaluation.exceptionDetails.exception?.description || "Falha no harness.");
    }
    return JSON.parse(evaluation.result.value);
}

async function stopChromium(child) {
    if (child.exitCode !== null) return;
    const exited = once(child, "close");
    child.kill("SIGTERM");
    const graceful = await Promise.race([
        exited.then(() => true),
        new Promise((resolveWait) => setTimeout(() => resolveWait(false), 5000))
    ]);
    if (graceful || child.exitCode !== null) return;
    const forcedExit = once(child, "close");
    child.kill("SIGKILL");
    await forcedExit;
}

async function runBrowserStage({ chromiumExecutable, profileDirectory, url }) {
    // O perfil é reutilizado para persistir os dados, mas a porta CDP pertence a cada processo.
    await rm(join(profileDirectory, "DevToolsActivePort"), { force: true });
    const child = spawn(chromiumExecutable, [
        "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
        `--user-data-dir=${profileDirectory}`, "--remote-debugging-port=0", "about:blank"
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    try {
        const port = await waitForDevToolsPort(profileDirectory);
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, {
            signal: AbortSignal.timeout(5000)
        })).json();
        const page = targets.find((target) => target.type === "page");
        if (!page?.webSocketDebuggerUrl) throw new Error("Página do Chromium não encontrada.");
        const client = createDevToolsClient(page.webSocketDebuggerUrl);
        await client.ready;
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Page.navigate", { url });
        const result = await readHarnessResult(client);
        client.close();
        return result;
    } catch (error) {
        throw new Error(`${error.message}\n${errorOutput}`.trim());
    } finally {
        await stopChromium(child);
    }
}

function assertRecoveredState(browserResult, expectedStage) {
    assert.equal(browserResult.ok, true, browserResult.error?.message);
    const result = browserResult.result;
    assert.equal(result.stage, expectedStage);
    assert.equal(result.status.isIndexedDBAvailable, true);
    assert.equal(result.status.isUsingIndexedDB, true);
    assert.equal(result.status.warning, "");
    assert.equal(result.localMapping, expectedSessionId);
    assert.equal(result.indexedDbMapping, expectedSessionId);
    assert.equal(result.indexedDbSessionId, expectedSessionId);
    assert.equal(result.indexedDbSessionStatus, "in_progress");
    assert.equal(result.indexedDbPlannedItemCount, 152);
    assert.equal(result.indexedDbEntryId, expectedEntryId);
    assert.equal(result.indexedDbEntryActive, true);
    assert.deepEqual(
        [result.roundCount, result.sessionCount, result.entryCount],
        [1, 1, 1],
        "A inicialização não pode duplicar round, session ou entry."
    );
}

const server = createServer((request, response) => {
    serveRequest(request, response).catch((error) => {
        if (response.headersSent) {
            response.destroy(error);
            return;
        }
        response.writeHead(500);
        response.end(error.message);
    });
});
const profileDirectory = await mkdtemp(join(tmpdir(), "phase4c-indexeddb-recovery-"));

try {
    const chromiumExecutable = await findChromiumExecutable();
    await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}/__phase4c_indexeddb_recovery`;
    const firstInitialization = await runBrowserStage({
        chromiumExecutable,
        profileDirectory,
        url: `${baseUrl}?stage=recover`
    });
    assertRecoveredState(firstInitialization, "recover");
    const secondInitialization = await runBrowserStage({
        chromiumExecutable,
        profileDirectory,
        url: `${baseUrl}?stage=idempotent`
    });
    assertRecoveredState(secondInitialization, "idempotent");
    console.log("PHASE4C_INDEXEDDB_RECOVERY_BROWSER: PASS");
    console.log(`round=${expectedRoundId} session=${expectedSessionId} entry=${expectedEntryId}`);
    console.log("initializations=2 counts=1/1/1 backend=indexeddb");
} finally {
    await new Promise((resolveServer) => server.close(resolveServer));
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        .catch((error) => console.warn(`Aviso: perfil temporário não removido: ${error.message}`));
}

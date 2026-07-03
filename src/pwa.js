function createUpdateNotice(registration) {
    const existingNotice = document.getElementById("pwa-update-notice");

    if (existingNotice) {
        return existingNotice;
    }

    const notice = document.createElement("section");
    notice.id = "pwa-update-notice";
    notice.className = "pwa-update-notice";
    notice.setAttribute("aria-live", "polite");

    const message = document.createElement("span");
    message.textContent = "Nova versão disponível.";

    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = "Recarregar";
    reloadButton.addEventListener("click", () => {
        reloadButton.disabled = true;
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    });

    notice.append(message, reloadButton);
    document.body.appendChild(notice);
    return notice;
}

function watchForUpdates(registration) {
    registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;

        if (!installingWorker) {
            return;
        }

        installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                createUpdateNotice(registration);
            }
        });
    });
}

export function registerPwa() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    window.addEventListener("load", () => {
        let isRefreshing = false;

        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (isRefreshing) {
                return;
            }

            isRefreshing = true;
            window.location.reload();
        });

        const baseUrl = import.meta.env.BASE_URL || "/";
        const serviceWorkerUrl = new URL(`${baseUrl}sw.js`, window.location.origin);

        navigator.serviceWorker.register(serviceWorkerUrl.href, { scope: baseUrl })
            .then((registration) => {
                watchForUpdates(registration);

                if (registration.waiting && navigator.serviceWorker.controller) {
                    createUpdateNotice(registration);
                }
            })
            .catch((error) => {
                console.warn("Não foi possível registrar a PWA.", error);
            });
    });
}

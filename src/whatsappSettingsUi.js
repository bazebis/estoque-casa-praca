function getElement(id) {
    return document.getElementById(id);
}

function formatUpdatedAt(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Ainda não salvo.";
    return `Última atualização: ${date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
}

function getFormValues() {
    return {
        recipientName: getElement("whatsapp-recipient-name").value,
        whatsappNumberRaw: getElement("whatsapp-number").value,
        defaultMessage: getElement("whatsapp-default-message").value
    };
}

export function renderWhatsappSettings(settings) {
    getElement("whatsapp-recipient-name").value = settings.recipientName || "";
    getElement("whatsapp-number").value = settings.whatsappNumberRaw || "";
    getElement("whatsapp-default-message").value = settings.defaultMessage || "";
    getElement("whatsapp-settings-updated-at").textContent = formatUpdatedAt(settings.updatedAt);
}

export function showWhatsappSettingsFeedback(message, tone = "") {
    const feedback = getElement("whatsapp-settings-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function connectWhatsappSettingsEvents(handlers) {
    getElement("whatsapp-settings-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        await handlers.onSave(getFormValues());
    });
    getElement("btn-clear-whatsapp-settings").addEventListener("click", async () => {
        if (window.confirm("Limpar a configuração de WhatsApp deste aparelho?")) {
            await handlers.onClear();
        }
    });
}

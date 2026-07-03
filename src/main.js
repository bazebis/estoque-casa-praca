import "./styles.css";

let itensEstoque = JSON.parse(localStorage.getItem("itensEstoque")) || [
    { nome: "AGUA", unidade: "fardos" },
    { nome: "COCA", unidade: "fardos 6un" }
];

let indiceAtual = 0;
let itensParaRepor = [];

function salvarLocalStorage() {
    localStorage.setItem("itensEstoque", JSON.stringify(itensEstoque));
}

function adicionarItem() {
    const nomeInput = document.getElementById("novo-item-nome");
    const unidadeInput = document.getElementById("novo-item-unidade");
    const nome = nomeInput.value.trim();
    const unidade = unidadeInput.value.trim();

    if (!nome || !unidade) {
        return;
    }

    itensEstoque.push({ nome, unidade });
    salvarLocalStorage();
    atualizarListaConfig();
    nomeInput.value = "";
    unidadeInput.value = "";
}

function atualizarListaConfig() {
    const lista = document.getElementById("lista-config");
    lista.innerHTML = "";

    itensEstoque.forEach((item, index) => {
        lista.innerHTML += `<li>${item.nome} (${item.unidade}) 
            <button data-index="${index}" class="btn-excluir-item">🗑️</button></li>`;
    });

    document.querySelectorAll(".btn-excluir-item").forEach((button) => {
        button.addEventListener("click", () => {
            excluirItem(Number(button.dataset.index));
        });
    });
}

function excluirItem(index) {
    itensEstoque.splice(index, 1);
    salvarLocalStorage();
    atualizarListaConfig();
}

function abrirConfigModal() {
    document.getElementById("configModal").style.display = "block";
    atualizarListaConfig();
}

function fecharConfigModal() {
    document.getElementById("configModal").style.display = "none";
}

function iniciarContagem() {
    itensParaRepor = [];
    indiceAtual = 0;
    contarItem();
}

function contarItem() {
    if (indiceAtual >= itensEstoque.length) {
        finalizarContagem();
        return;
    }

    document.getElementById("modal-mensagem").textContent = `Qtd de ${itensEstoque[indiceAtual].nome}:`;
    document.getElementById("itemModal").style.display = "block";
}

function confirmarQuantidade() {
    const quantidadeInput = document.getElementById("modal-quantidade");
    const qtd = quantidadeInput.value;

    if (qtd > 0) {
        itensParaRepor.push({ ...itensEstoque[indiceAtual], qtd });
    }

    quantidadeInput.value = "";
    indiceAtual++;
    contarItem();
}

function finalizarContagem() {
    document.getElementById("itemModal").style.display = "none";
    let msg = "Itens em Estoque:\n";

    itensParaRepor.forEach((item) => {
        msg += `- ${item.nome}: ${item.qtd} ${item.unidade}\n`;
    });

    document.getElementById("mensagem-whatsapp").textContent = msg;
    document.getElementById("lista-final").style.display = "block";
}

function enviarMensagem() {
    const msg = encodeURIComponent(document.getElementById("mensagem-whatsapp").textContent);
    window.open(`https://wa.me/5516997530847?text=${msg}`, "_blank");
}

function recomecarContagem() {
    location.reload();
}

document.getElementById("btn-iniciar-contagem").addEventListener("click", iniciarContagem);
document.getElementById("btn-config").addEventListener("click", abrirConfigModal);
document.getElementById("btn-confirmar-quantidade").addEventListener("click", confirmarQuantidade);
document.getElementById("btn-finalizar-contagem").addEventListener("click", finalizarContagem);
document.getElementById("btn-adicionar-item").addEventListener("click", adicionarItem);
document.getElementById("btn-fechar-config").addEventListener("click", fecharConfigModal);
document.getElementById("btn-enviar-mensagem").addEventListener("click", enviarMensagem);
document.getElementById("btn-recomecar-contagem").addEventListener("click", recomecarContagem);

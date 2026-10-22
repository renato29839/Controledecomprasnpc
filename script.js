import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getDatabase, ref, set, get, child, update } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyA4FscDy6sslpx4Gc5kP1ZbJRvqgZWwwGs",
    authDomain: "controldeestoque-94d4d.firebaseapp.com",
    projectId: "controldeestoque-94d4d",
    databaseURL: "https://controldeestoque-94d4d-default-rtdb.firebaseio.com",
    storageBucket: "controldeestoque-94d4d.firebasestorage.app",
    messagingSenderId: "908692444961",
    appId: "1:908692444961:web:e37a28dadca7d6ea2d1060"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const ACCOUNT_NAMES = {
    "compras@neuropsicocentro.com.br": "Gabriel Venancio",
    "compras1@neuropsicocentro.com.br": "Eduardo Lemos"
};
const DEFAULT_CONTEXT = { empresa_id: "empresa-demo", empresa_nome: "Matriz", empresa_razao_social: "NPC - Núcleo de Processos e Compras", empresa_cnpj: "00.000.000/0001-00", filial_id: "filial-matriz", setor_id: "almoxarifado-central", setor_nome: "Almoxarifado central", usuario_id: "usuario-local", usuario_nome: "Operador local" };
const COMPANY_REGISTRY_PATH = "cadastros/empresas";
const CONTEXT = { ...DEFAULT_CONTEXT };
const STATUSES = ["Rascunho", "Pendente_Aprovacao", "Aprovada", "Faturada", "Cancelada"];
const TRANSITIONS = { Rascunho: ["Pendente_Aprovacao", "Cancelada"], Pendente_Aprovacao: ["Aprovada", "Cancelada"], Aprovada: ["Faturada", "Cancelada"], Faturada: [], Cancelada: [] };
const state = { consumo: [], companies: [] };
const array = value => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const stockTolerance = (...values) => Number.EPSILON * Math.max(1, ...values.map(value => Math.abs(value))) * 4;
const money = value => num(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const html = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const id6 = value => String(value || "").slice(-6).padStart(6, "0");
const scopePath = (collection, context = CONTEXT) => `empresas/${context.empresa_id}/filiais/${context.filial_id}/setores/${context.setor_id}/${collection}`;
const scoped = (entity, context = CONTEXT) => ({ ...entity, empresa_id: entity.empresa_id || context.empresa_id, filial_id: entity.filial_id || context.filial_id, setor_id: entity.setor_id || context.setor_id, updated_at: new Date().toISOString() });

async function read(path) {
    try { const snapshot = await get(child(ref(db), path)); return snapshot.exists() ? snapshot.val() : []; }
    catch (error) { console.error(error); throw new Error("Não foi possível consultar os dados."); }
}
async function write(path, data) {
    try { await set(ref(db, path), data); }
    catch (error) { console.error(error); throw new Error("Não foi possível salvar os dados."); }
}
async function writeAtomic(paths) {
    try { await update(ref(db), paths); }
    catch (error) {
        console.error(error);
        if (error.code === "PERMISSION_DENIED" || error.code === "database/permission-denied") {
            throw new Error("O Firebase negou a gravação. Confira se a sessão está ativa e se as regras do Realtime Database foram publicadas.");
        }
        if (error.code === "NETWORK_ERROR" || error.code === "database/network-error") {
            throw new Error("Falha de conexão com o Firebase. Verifique a internet e tente novamente.");
        }
        throw new Error(`Não foi possível concluir a operação no banco de dados${error.message ? `: ${error.message}` : "."}`);
    }
}
async function collection(name, context = CONTEXT) {
    const current = array(await read(scopePath(name, context)));
    if (current.length || context.empresa_id !== DEFAULT_CONTEXT.empresa_id) return current.map(item => scoped(item, context));
    return array(await read(name)).filter(item => (!item.empresa_id || item.empresa_id === context.empresa_id) && (!item.setor_id || item.setor_id === context.setor_id)).map(item => scoped(item, context));
}
async function saveCollection(name, data, context = CONTEXT) { await write(scopePath(name, context), array(data).map(item => scoped(item, context))); }
function companyModel(company) {
    const id = String(company.id || "").trim();
    const name = String(company.nome || company.empresa_nome || "").trim();
    if (!id || !name) throw new Error("Cada empresa precisa ter um identificador e um nome.");
    return {
        id,
        nome: name,
        razao_social: String(company.razao_social || name).trim(),
        cnpj: String(company.cnpj || "").trim(),
        filial_id: String(company.filial_id || `filial-${id}`).trim(),
        setor_id: String(company.setor_id || `almoxarifado-${id}`).trim(),
        setor_nome: String(company.setor_nome || "Almoxarifado central").trim(),
        ativo: company.ativo !== false
    };
}
async function loadCompanies() {
    let companies = array(await read(COMPANY_REGISTRY_PATH)).map(companyModel);
    if (!companies.length) {
        companies = [companyModel({ ...DEFAULT_CONTEXT, id: DEFAULT_CONTEXT.empresa_id, nome: DEFAULT_CONTEXT.empresa_nome, razao_social: DEFAULT_CONTEXT.empresa_razao_social, cnpj: DEFAULT_CONTEXT.empresa_cnpj })];
        await write(COMPANY_REGISTRY_PATH, companies);
    }
    state.companies = companies;
    return companies;
}
function productModel(product, context = CONTEXT) { return scoped({ id: product.id || Date.now(), codigo: product.codigo || String(product.id || "SEM-CODIGO"), nome: product.nome || product.descricao || "Produto sem descrição", descricao: product.descricao || product.nome || "", ncm: product.ncm || "", unidade_medida: product.unidade_medida || product.unidade || "UN", estoque: Math.max(0, num(product.estoque)), preco: num(product.preco), custo_medio: num(product.custo_medio || product.preco) }, context); }
function orderModel(order, context = CONTEXT) {
    const items = array(order.itens).map(item => ({ product_id: item.product_id || "", codigo: item.codigo || item.id || "", descricao: item.descricao || item.nome || "Item sem descrição", ncm: item.ncm || "", unidade_medida: item.unidade_medida || item.unidade || "UN", qtd: num(item.qtd || item.quantidade), preco: num(item.preco || item.preco_unitario), impostos: { icms: num(item.impostos?.icms || item.icms), ipi: num(item.impostos?.ipi || item.ipi), pis: num(item.impostos?.pis || item.pis), cofins: num(item.impostos?.cofins || item.cofins) } }));
    return scoped({ ...order, id: order.id || Date.now(), numero: order.numero || `OC-${id6(order.id || Date.now())}`, status: STATUSES.includes(order.status) ? order.status : order.status === "Recebida" ? "Faturada" : "Aprovada", data_emissao: order.data_emissao || order.data || new Date().toISOString(), filial_compradora: { razao_social: order.filial_compradora?.razao_social || CONTEXT.empresa_razao_social, cnpj: order.filial_compradora?.cnpj || CONTEXT.empresa_cnpj, ie: order.filial_compradora?.ie || "", endereco_faturamento: order.filial_compradora?.endereco_faturamento || "", endereco_entrega: order.filial_compradora?.endereco_entrega || "" }, fornecedor: { razao_social: order.fornecedor?.razao_social || order.fornecedorNome || "Fornecedor não informado", cnpj: order.fornecedor?.cnpj || "", ie: order.fornecedor?.ie || "", endereco: order.fornecedor?.endereco || "" }, fornecedorNome: order.fornecedorNome || order.fornecedor?.razao_social || "Fornecedor não informado", condicoes_pagamento: { forma: order.condicoes_pagamento?.forma || order.forma_pagamento || "A definir", prazo: order.condicoes_pagamento?.prazo || order.prazo_pagamento || "A definir", frete: order.condicoes_pagamento?.frete || order.tipo_frete || "CIF" }, itens: items }, context);
}
function movementRecord(data, context = CONTEXT) {
    return scoped({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        data: new Date().toISOString(),
        usuario_id: context.usuario_id,
        usuario_nome: context.usuario_nome,
        tipo_movimentacao: data.tipo_movimentacao,
        produto_id: data.produto_id,
        produto: data.produto,
        codigo_produto: data.codigo_produto,
        saldo_anterior: num(data.saldo_anterior),
        quantidade: num(data.quantidade),
        saldo_final: num(data.saldo_final),
        custo_medio: num(data.custo_medio),
        origem_empresa_id: data.origem_empresa_id || context.empresa_id,
        origem_setor_id: data.origem_setor_id || context.setor_id,
        destino_empresa_id: data.destino_empresa_id || "",
        destino_setor_id: data.destino_setor_id || "",
        destino_utilizacao: String(data.destino_utilizacao || "").trim(),
        referencia_id: data.referencia_id || "",
        origem: data.origem || ""
    }, context);
}
async function moveStockBatch(changes, context = CONTEXT) {
    const [rawProducts, rawMovements] = await Promise.all([collection("produtos", context), collection("movimentacoes", context)]);
    const products = rawProducts.map(item => productModel(item, context));
    const movements = [...rawMovements];
    for (const change of changes) {
        const index = products.findIndex(item => String(item.id) === String(change.productId) || item.codigo === change.productId);
        if (index < 0) throw new Error("Produto não encontrado no setor informado.");
        const product = products[index];
        const quantity = num(change.quantity);
        const outbound = ["SAIDA_CONSUMO", "TRANSFERENCIA_SAIDA"].includes(change.type);
        if (quantity <= 0) throw new Error("A quantidade deve ser maior que zero.");
        const destination = typeof change.destination === "string" ? change.destination.trim() : "";
        if (change.type === "SAIDA_CONSUMO" && !destination) throw new Error("Informe o destino ou local de utilização para cada saída.");
        if (outbound && quantity > product.estoque + stockTolerance(product.estoque, quantity)) throw new Error(`Saldo insuficiente para ${product.nome}. Disponível: ${product.estoque}.`);
        const before = product.estoque;
        const after = outbound ? Math.max(0, before - quantity) : before + quantity;
        products[index] = productModel({ ...product, estoque: after }, context);
        movements.push(movementRecord({
            tipo_movimentacao: change.type,
            produto_id: product.id,
            produto: product.nome,
            codigo_produto: product.codigo,
            saldo_anterior: before,
            quantidade,
            saldo_final: after,
            custo_medio: product.custo_medio,
            referencia_id: change.referenceId,
            origem: change.origin,
            destino_utilizacao: destination,
            destino_empresa_id: change.destination?.empresa_id,
            destino_setor_id: change.destination?.setor_id
        }, context));
    }
    await writeAtomic({
        [scopePath("produtos", context)]: products.map(item => scoped(item, context)),
        [scopePath("movimentacoes", context)]: movements.map(item => scoped(item, context))
    });
}
function orderTotal(order) { return order.itens.reduce((sum, item) => sum + item.qtd * item.preco, 0); }
function orderDate(order) { const value = order.data_pedido || order.data_emissao || order.data; if (!value) return ""; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10); }
function csvCell(value) { let text = String(value ?? ""); if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
function downloadCsv(filename, rows) { const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(";")).join("\r\n")}`; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

async function receiveOrder(id) {
    const [rawOrders, rawProducts, rawMovements] = await Promise.all([
        collection("ordens"),
        collection("produtos"),
        collection("movimentacoes")
    ]);
    const orders = rawOrders.map(orderModel);
    const orderIndex = orders.findIndex(order => String(order.id) === String(id));
    if (orderIndex < 0) throw new Error("Ordem de compra não encontrada.");
    const order = orders[orderIndex];
    if (order.status !== "Aprovada") throw new Error("Somente O.C. aprovada pode ser faturada.");
    if (!order.itens.length) throw new Error("A ordem não possui itens para receber.");

    const products = rawProducts.map(item => productModel(item));
    const movements = [...rawMovements];
    for (const item of order.itens) {
        const productIndex = products.findIndex(product =>
            (item.product_id && String(product.id) === String(item.product_id)) ||
            (item.codigo && product.codigo === item.codigo) ||
            product.nome === item.descricao
        );
        if (productIndex < 0) throw new Error(`Produto ${item.descricao} não cadastrado no estoque.`);
        if (item.qtd <= 0) throw new Error(`Quantidade inválida para o produto ${item.descricao}.`);
        const product = products[productIndex];
        const before = product.estoque;
        const after = before + item.qtd;
        products[productIndex] = productModel({ ...product, estoque: after });
        movements.push(movementRecord({
            tipo_movimentacao: "ENTRADA_COMPRA",
            produto_id: product.id,
            produto: product.nome,
            codigo_produto: product.codigo,
            saldo_anterior: before,
            quantidade: item.qtd,
            saldo_final: after,
            custo_medio: product.custo_medio,
            referencia_id: order.id,
            origem: `OC ${order.numero}`
        }));
    }
    order.status = "Faturada";
    order.faturada_at = new Date().toISOString();
    orders[orderIndex] = order;
    await writeAtomic({
        [scopePath("produtos")]: products.map(item => scoped(item)),
        [scopePath("movimentacoes")]: movements.map(item => scoped(item)),
        [scopePath("ordens")]: orders.map(item => scoped(item))
    });
}
async function transferStock(data) {
    const company = state.companies.find(item => item.id === data.targetCompanyId && item.ativo);
    if (!company) throw new Error("Selecione uma empresa de destino cadastrada.");
    if (company.id === CONTEXT.empresa_id) throw new Error("A empresa de destino deve ser diferente da origem.");
    const quantity = num(data.quantity);
    if (quantity <= 0) throw new Error("A quantidade da transferência deve ser maior que zero.");
    const targetContext = { ...CONTEXT, empresa_id: company.id, empresa_nome: company.nome, empresa_razao_social: company.razao_social, empresa_cnpj: company.cnpj, filial_id: company.filial_id, setor_id: company.setor_id, setor_nome: company.setor_nome };
    const [sourceProductsRaw, sourceMovementsRaw, targetProductsRaw, targetMovementsRaw] = await Promise.all([
        collection("produtos"),
        collection("movimentacoes"),
        collection("produtos", targetContext),
        collection("movimentacoes", targetContext)
    ]);
    const sourceProducts = sourceProductsRaw.map(item => productModel(item));
    const sourceIndex = sourceProducts.findIndex(product => String(product.id) === String(data.productId));
    if (sourceIndex < 0) throw new Error("Produto não encontrado no estoque de origem.");
    const source = sourceProducts[sourceIndex];
    if (source.estoque < quantity) throw new Error(`Saldo insuficiente. Disponível: ${source.estoque}.`);
    const targetProducts = targetProductsRaw.map(item => productModel(item, targetContext));
    const targetIndex = targetProducts.findIndex(item => item.codigo === source.codigo);
    const target = targetIndex >= 0 ? targetProducts[targetIndex] : productModel({ ...source, estoque: 0 }, targetContext);
    const reference = `TR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sourceBefore = source.estoque;
    const targetBefore = target.estoque;
    sourceProducts[sourceIndex] = productModel({ ...source, estoque: sourceBefore - quantity });
    const updatedTarget = productModel({ ...target, estoque: targetBefore + quantity, custo_medio: source.custo_medio }, targetContext);
    if (targetIndex >= 0) targetProducts[targetIndex] = updatedTarget;
    else targetProducts.push(updatedTarget);
    const sourceMovements = [...sourceMovementsRaw, movementRecord({
        tipo_movimentacao: "TRANSFERENCIA_SAIDA",
        produto_id: source.id,
        produto: source.nome,
        codigo_produto: source.codigo,
        saldo_anterior: sourceBefore,
        quantidade,
        saldo_final: sourceBefore - quantity,
        custo_medio: source.custo_medio,
        referencia_id: reference,
        origem: CONTEXT.setor_nome,
        destino_utilizacao: `${company.nome} · ${company.setor_nome}`,
        destino_empresa_id: company.id,
        destino_setor_id: company.setor_id
    })];
    const targetMovements = [...targetMovementsRaw, movementRecord({
        tipo_movimentacao: "TRANSFERENCIA_ENTRADA",
        produto_id: updatedTarget.id,
        produto: updatedTarget.nome,
        codigo_produto: updatedTarget.codigo,
        saldo_anterior: targetBefore,
        quantidade,
        saldo_final: targetBefore + quantity,
        custo_medio: updatedTarget.custo_medio,
        referencia_id: reference,
        origem: CONTEXT.setor_nome,
        origem_empresa_id: CONTEXT.empresa_id,
        origem_setor_id: CONTEXT.setor_id
    }, targetContext)];
    await writeAtomic({
        [scopePath("produtos")]: sourceProducts.map(item => scoped(item)),
        [scopePath("movimentacoes")]: sourceMovements.map(item => scoped(item)),
        [scopePath("produtos", targetContext)]: targetProducts.map(item => scoped(item, targetContext)),
        [scopePath("movimentacoes", targetContext)]: targetMovements.map(item => scoped(item, targetContext))
    });
}

function modal(title, body, save) { document.getElementById("modal-overlay")?.remove(); document.body.insertAdjacentHTML("beforeend", `<div id="modal-overlay"><div class="modal-container"><div class="modal-heading"><h2>${html(title)}</h2><button class="btn-icon" id="modal-close"><i class="fa-solid fa-xmark"></i></button></div>${body}<div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Cancelar</button><button class="btn-add" id="modal-save">Salvar</button></div></div></div>`); const close = () => document.getElementById("modal-overlay")?.remove(); document.getElementById("modal-close").onclick = close; document.getElementById("modal-cancel").onclick = close; document.getElementById("modal-save").onclick = async () => { try { await save(); close(); } catch (error) { alert(error.message); } }; }
function renderOrder(order) { return `<article class="order-document order-summary-card"><div class="order-compact-row"><div class="order-compact-main"><span class="order-status-dot ${order.status === "Faturada" ? "is-received" : ""}"></span><div><strong>${html(order.numero)}</strong><span>${html(order.fornecedorNome)}</span></div></div><div class="order-compact-meta"><span class="order-status-label">${html(order.status)}</span><span>${new Date(order.data_emissao).toLocaleDateString("pt-BR")}</span><strong>${money(orderTotal(order))}</strong></div><div class="order-compact-actions"><button class="btn-icon" onclick="window.imprimirOrdem('${order.id}')" title="Imprimir"><i class="fa-solid fa-print"></i></button><button class="btn-icon btn-icon-primary" onclick="document.getElementById('details-${order.id}').open = !document.getElementById('details-${order.id}').open" title="Detalhes"><i class="fa-solid fa-chevron-down"></i></button></div></div><details id="details-${order.id}" class="order-details"><summary>Ver dados fiscais, condições e itens</summary><div class="order-detail-grid"><div><span class="doc-label">Filial compradora</span><strong>${html(order.filial_compradora.razao_social)}</strong><p>CNPJ: ${html(order.filial_compradora.cnpj)} · IE: ${html(order.filial_compradora.ie || "Não informado")}</p><p>Entrega: ${html(order.filial_compradora.endereco_entrega || "Não informado")}</p></div><div><span class="doc-label">Fornecedor e condições</span><strong>${html(order.fornecedor.razao_social)}</strong><p>CNPJ: ${html(order.fornecedor.cnpj || "Não informado")} · IE: ${html(order.fornecedor.ie || "Não informado")}</p><p>Pagamento: ${html(order.condicoes_pagamento.forma)} · Prazo: ${html(order.condicoes_pagamento.prazo)} · ${html(order.condicoes_pagamento.frete)}</p></div></div><div class="order-items"><table class="data-table"><thead><tr><th>Código</th><th>Descrição</th><th>NCM</th><th>UM</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${order.itens.map(item => `<tr><td>${html(item.codigo)}</td><td>${html(item.descricao)}</td><td>${html(item.ncm || "-")}</td><td>${html(item.unidade_medida)}</td><td>${item.qtd}</td><td>${money(item.preco)}</td><td>${money(item.qtd * item.preco)}</td></tr>`).join("")}</tbody></table></div><div class="order-summary"><strong>Total: ${money(orderTotal(order))}</strong></div><div class="order-footer"><span>Empresa: ${html(order.empresa_id)} · Setor: ${html(order.setor_id)}</span><select onchange="window.atualizarStatusOC('${order.id}', this.value)"><option value="${order.status}" selected>${html(order.status)}</option>${(TRANSITIONS[order.status] || []).map(status => `<option value="${status}">${status}</option>`).join("")}</select></div></details></article>`; }

async function lookupCnpj(value) {
    const cnpj = String(value || "").replace(/\D/g, "");
    if (cnpj.length !== 14) throw new Error("Informe um CNPJ válido com 14 dígitos.");
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!response.ok) {
        if (response.status === 404) throw new Error("CNPJ não encontrado na consulta pública.");
        if (response.status === 429) throw new Error("Limite de consultas atingido. Tente novamente mais tarde.");
        throw new Error(`A consulta de CNPJ falhou (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!data.razao_social) throw new Error("A consulta não retornou a razão social do CNPJ.");
    return data;
}

function attachCnpjLookup(buttonId, inputId, onResult) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    button.title = "Consulta pública de dados cadastrais via BrasilAPI (base da Receita Federal)";
    button.onclick = async () => {
        button.disabled = true;
        button.textContent = "Consultando...";
        try {
            onResult(await lookupCnpj(input.value));
        } catch (error) {
            alert(error.message);
        } finally {
            button.disabled = false;
            button.textContent = "Buscar dados";
        }
    };
}

document.addEventListener("DOMContentLoaded", () => {
    const content = document.getElementById("content-area");
    const pageTitle = document.getElementById("page-title");
    const companySelector = document.getElementById("company-selector");
    const loginScreen = document.getElementById("login-screen");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    const loginSubmit = document.getElementById("login-submit");
    const appShell = document.getElementById("app-shell");
    document.getElementById("current-date").textContent = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();
        loginError.textContent = "";
        loginSubmit.disabled = true;
        try {
            await signInWithEmailAndPassword(
                auth,
                document.getElementById("login-email").value.trim().toLowerCase(),
                document.getElementById("login-password").value
            );
        } catch (error) {
            console.error(error);
            const messages = {
                "auth/invalid-credential": "E-mail ou senha incorretos.",
                "auth/user-not-found": "E-mail ou senha incorretos.",
                "auth/wrong-password": "E-mail ou senha incorretos.",
                "auth/too-many-requests": "Muitas tentativas. Aguarde e tente novamente.",
                "auth/network-request-failed": "Falha de conexão. Verifique sua internet e tente novamente."
            };
            loginError.textContent = messages[error.code] || "Não foi possível entrar. Confira os dados e tente novamente.";
        } finally {
            loginSubmit.disabled = false;
        }
    });
    document.getElementById("logout-button").addEventListener("click", () => {
        signOut(auth).catch(error => {
            console.error(error);
            alert("Não foi possível encerrar a sessão.");
        });
    });
    let activePage = "dashboard";
    let requestedPage = activePage;
    let pageNavigation = Promise.resolve();
    const queueRender = (target, beforeRender = () => {}) => {
        requestedPage = target;
        pageNavigation = pageNavigation.catch(error => console.error(error)).then(async () => {
            beforeRender();
            const rendered = await render(target);
            if (rendered) await enhancePage(target);
        });
        return pageNavigation;
    };
    const rerenderPage = async () => queueRender(activePage);
    function addTableActions(table, records, handlers, useExistingActionCell = false) {
        const header = table.tHead?.rows[0];
        const body = table.tBodies[0];
        if (!header || !body) return;
        if (!useExistingActionCell) {
            const actionHeader = document.createElement("th");
            actionHeader.textContent = "Ações";
            header.append(actionHeader);
            const emptyCell = body.querySelector(".table-empty");
            if (emptyCell) emptyCell.colSpan = header.cells.length;
        }
        records.forEach((record, index) => {
            const row = body.rows[index];
            if (!row || row.querySelector(".table-empty")) return;
            const cell = useExistingActionCell ? row.cells[row.cells.length - 1] : row.insertCell();
            cell.classList.add("row-actions");
            const edit = document.createElement("button");
            edit.className = "btn-row-action";
            edit.type = "button";
            edit.title = "Editar";
            edit.setAttribute("aria-label", `Editar ${record.nome || record.razaoSocial || record.razao_social || "cadastro"}`);
            edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
            edit.onclick = () => handlers.edit(record, index);
            const remove = document.createElement("button");
            remove.className = "btn-row-action btn-row-delete";
            remove.type = "button";
            remove.title = "Excluir";
            remove.setAttribute("aria-label", `Excluir ${record.nome || record.razaoSocial || record.razao_social || "cadastro"}`);
            remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
            remove.onclick = () => handlers.remove(record, index);
            cell.append(edit, remove);
        });
    }
    async function enhancePage(target) {
        if (target === "produtos") {
            const products = (await collection("produtos")).map(productModel);
            document.getElementById("new-product").onclick = () => openProductForm();
            addTableActions(content.querySelector(".data-table"), products, {
                edit: product => openProductForm(product),
                remove: async product => {
                    try {
                        const currentProducts = (await collection("produtos")).map(productModel);
                        const currentProduct = currentProducts.find(item => String(item.id) === String(product.id));
                        if (!currentProduct) throw new Error("O produto não está mais cadastrado.");
                        if (num(currentProduct.estoque) > 0) throw new Error("Não é possível excluir um produto com saldo em estoque.");
                        const movements = await collection("movimentacoes");
                        if (movements.some(item => String(item.produto_id) === String(currentProduct.id) || item.codigo_produto === currentProduct.codigo)) {
                            throw new Error("Não é possível excluir um produto que já possui movimentações. Ajuste o estoque e mantenha o histórico.");
                        }
                        if (!confirm(`Excluir o produto “${product.nome}”?`)) return;
                        await saveCollection("produtos", currentProducts.filter(item => String(item.id) !== String(currentProduct.id)));
                        await rerenderPage();
                    } catch (error) { alert(error.message); }
                }
            });
        } else if (target === "fornecedores") {
            const suppliers = await collection("fornecedores");
            document.getElementById("new-supplier").onclick = () => openSupplierForm();
            addTableActions(content.querySelector(".data-table"), suppliers, {
                edit: (supplier, index) => openSupplierForm(supplier, index),
                remove: async (supplier, index) => {
                    if (!confirm(`Excluir o fornecedor “${supplier.razaoSocial || supplier.razao_social}”?`)) return;
                    try {
                        await saveCollection("fornecedores", suppliers.filter((item, currentIndex) => currentIndex !== index));
                        await rerenderPage();
                    } catch (error) { alert(error.message); }
                }
            });
        } else if (target === "unidades") {
            document.getElementById("new-company").onclick = () => openCompanyForm();
            addTableActions(content.querySelector(".company-table"), state.companies, {
                edit: company => openCompanyForm(company),
                remove: async company => {
                    try {
                        if (String(company.id) === String(CONTEXT.empresa_id)) throw new Error("Troque para outra empresa antes de excluir a unidade ativa.");
                        if (company.ativo && state.companies.filter(item => item.ativo).length <= 1) throw new Error("Não é possível excluir a última unidade ativa.");
                        const targetContext = { ...CONTEXT, empresa_id: company.id, empresa_nome: company.nome, filial_id: company.filial_id, setor_id: company.setor_id, setor_nome: company.setor_nome };
                        const related = await Promise.all(["produtos", "ordens", "movimentacoes", "fornecedores", "centros_resultados", "despesas"].map(name => collection(name, targetContext)));
                        if (related.some(items => items.length)) throw new Error("Esta unidade possui estoque, pedidos ou movimentações. Mantenha o histórico e desative a unidade em vez de excluí-la.");
                        if (!confirm(`Excluir a unidade “${company.nome}”?`)) return;
                        state.companies = state.companies.filter(item => String(item.id) !== String(company.id));
                        await write(COMPANY_REGISTRY_PATH, state.companies);
                        refreshCompanySelector();
                        await rerenderPage();
                    } catch (error) { alert(error.message); }
                }
            });
            content.querySelectorAll(".company-table tbody tr").forEach((row, index) => {
                if (!state.companies[index] || row.querySelector(".table-empty")) return;
                const cell = row.querySelector(".row-actions");
                if (!cell) return;
                const company = state.companies[index];
                const toggle = document.createElement("button");
                toggle.className = "btn-row-action";
                toggle.type = "button";
                toggle.title = company.ativo ? "Desativar" : "Ativar";
                toggle.setAttribute("aria-label", `${company.ativo ? "Desativar" : "Ativar"} ${company.nome}`);
                toggle.innerHTML = `<i class="fa-solid ${company.ativo ? "fa-toggle-on" : "fa-toggle-off"}"></i>`;
                toggle.onclick = async () => {
                    try {
                        if (company.ativo && String(company.id) === String(CONTEXT.empresa_id)) throw new Error("Troque para outra empresa antes de desativar a unidade ativa.");
                        if (company.ativo && state.companies.filter(item => item.ativo).length <= 1) throw new Error("Mantenha pelo menos uma unidade ativa.");
                        const updated = state.companies.map(item => String(item.id) === String(company.id) ? { ...item, ativo: !item.ativo } : item);
                        await write(COMPANY_REGISTRY_PATH, updated);
                        state.companies = updated;
                        refreshCompanySelector();
                        await rerenderPage();
                    } catch (error) { alert(error.message); }
                };
                cell.prepend(toggle);
            });
        } else if (target === "centros-resultados" || target === "despesas") {
            const name = target === "centros-resultados" ? "centros_resultados" : "despesas";
            const title = target === "centros-resultados" ? "Centros de resultados" : "Despesas";
            const description = target === "centros-resultados" ? "Classifique cada compra pelo centro de resultado responsável." : "Cadastre as categorias usadas para analisar os gastos.";
            const items = await collection(name);
            addTableActions(content.querySelector(".data-table"), items, {
                edit: (item, index) => openCatalogForm(name, title, items, item, index),
                remove: async (item, index) => {
                    try {
                        const orders = await collection("ordens");
                        const referenceField = name === "centros_resultados" ? "centro_resultado_id" : "despesa_id";
                        if (orders.some(order => String(order[referenceField]) === String(item.id))) throw new Error("Este cadastro já é usado em uma ordem de compra. Desative-o para preservar o histórico.");
                        if (!confirm(`Excluir o cadastro “${item.nome || item.descricao}”?`)) return;
                        await saveCollection(name, items.filter((current, currentIndex) => currentIndex !== index));
                        await rerenderPage();
                    } catch (error) { alert(error.message); }
                }
            }, true);
        } else if (target === "ordens") {
            const orders = (await collection("ordens")).map(orderModel).reverse();
            content.querySelectorAll(".order-summary-card").forEach((card, index) => {
                const order = orders[index];
                if (!order) return;
                const orderMain = card.querySelector(".order-compact-main > div");
                if (orderMain) {
                    const creator = document.createElement("span");
                    creator.className = "order-creator";
                    creator.textContent = `Criado por: ${order.criado_por?.nome || order.criado_por?.email || "Responsável não registrado"}`;
                    if (order.criado_por?.email) creator.title = order.criado_por.email;
                    orderMain.append(creator);
                }
                if (order.status !== "Rascunho") return;
                const actions = card.querySelector(".order-compact-actions");
                if (!actions) return;
                const edit = document.createElement("button");
                edit.className = "btn-secondary order-edit-action";
                edit.type = "button";
                edit.title = "Editar ordem de compra";
                edit.setAttribute("aria-label", `Editar rascunho ${order.numero}`);
                edit.innerHTML = '<i class="fa-solid fa-pen"></i> Editar';
                edit.onclick = async () => {
                    try {
                        const latest = (await collection("ordens")).find(item => String(item.id) === String(order.id));
                        if (!latest || orderModel(latest).status !== "Rascunho") {
                            throw new Error("Somente ordens em rascunho podem ser editadas.");
                        }
                        await openOrderEditor(orderModel(latest));
                    } catch (error) {
                        alert(error.message);
                    }
                };
                const remove = document.createElement("button");
                remove.className = "btn-icon btn-row-delete";
                remove.type = "button";
                remove.title = "Excluir rascunho";
                remove.setAttribute("aria-label", `Excluir rascunho ${order.numero}`);
                remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
                remove.onclick = async () => {
                    if (!confirm(`Excluir o rascunho ${order.numero}?`)) return;
                    try {
                        const current = await collection("ordens");
                        const latest = current.find(item => String(item.id) === String(order.id));
                        if (!latest || orderModel(latest).status !== "Rascunho") throw new Error("A ordem deixou de ser um rascunho e não pode ser excluída.");
                        await saveCollection("ordens", current.filter(item => String(item.id) !== String(order.id)));
                        await rerenderPage();
                    } catch (error) { alert(error.message); }
                };
                actions.prepend(edit, remove);
            });
        }
    }
    const refreshCompanySelector = () => {
        companySelector.innerHTML = state.companies.filter(company => company.ativo).map(company => `<option value="${html(company.id)}">${html(company.nome)}</option>`).join("");
        companySelector.value = CONTEXT.empresa_id;
        document.getElementById("context-badge").textContent = `${CONTEXT.empresa_nome} · ${CONTEXT.setor_nome}`;
    };
    const activateCompany = company => {
        Object.assign(CONTEXT, {
            empresa_id: company.id,
            empresa_nome: company.nome,
            empresa_razao_social: company.razao_social,
            empresa_cnpj: company.cnpj,
            filial_id: company.filial_id,
            setor_id: company.setor_id,
            setor_nome: company.setor_nome
        });
        try { localStorage.setItem("npc-empresa-ativa", company.id); }
        catch (error) { console.warn("Não foi possível salvar a empresa selecionada neste navegador.", error); }
        refreshCompanySelector();
    };
    const render = async target => {
        activePage = target;
        content.innerHTML = `<div class="card loading-state"><i class="fa-solid fa-circle-notch fa-spin"></i><h3>Carregando...</h3></div>`;
        try {
            if (target === "dashboard") await dashboard();
            if (target === "produtos") await productsPage();
            if (target === "fornecedores") await suppliersPage();
            if (target === "unidades") await unitsPage();
            if (target === "centros-resultados") await catalogPage("centros_resultados", "Centros de resultados", "Classifique cada compra pelo centro de resultado responsável.");
            if (target === "despesas") await catalogPage("despesas", "Despesas", "Cadastre as categorias usadas para analisar os gastos.");
            if (target === "ordens") await ordersPage();
            if (target === "analise") await analysisPage();
            if (target === "saidas") await consumptionPage();
            if (target === "transferencias") await transferPage();
            if (target === "movimentacoes") await movementsPage();
            return true;
        } catch (error) {
            console.error(error);
            content.innerHTML = `<div class="card empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Não foi possível carregar</h3><p>${html(error.message)}</p></div>`;
            return false;
        }
    };
    companySelector.addEventListener("change", () => {
        const company = state.companies.find(item => item.id === companySelector.value && item.ativo);
        if (!company) return;
        const target = requestedPage;
        queueRender(target, () => {
            activateCompany(company);
            state.consumo = [];
        }).catch(error => alert(error.message));
    });
    document.addEventListener("click", event => {
        const item = event.target.closest(".menu-item");
        if (!item) return;
        const target = item.dataset.target;
        document.querySelectorAll(".menu-item").forEach(menu => menu.classList.toggle("active", menu === item));
        queueRender(target).catch(error => alert(error.message));
    });
    function openProductForm(product) {
        const editing = Boolean(product);
        modal(editing ? "Editar produto" : "Novo produto", `<div class="form-grid"><label>Código<input id="p-code" required value="${html(product?.codigo || "")}"></label><label>Descrição<input id="p-name" required value="${html(product?.nome || "")}"></label><label>NCM<input id="p-ncm" value="${html(product?.ncm || "")}"></label><label>Unidade<input id="p-unit" value="${html(product?.unidade_medida || "UN")}"></label><label>Estoque inicial<input id="p-stock" type="number" min="0" value="${html(product?.estoque ?? 0)}" ${editing ? "readonly" : ""}></label><label>Custo médio<input id="p-cost" type="number" min="0" step="0.01" value="${html(product?.custo_medio ?? 0)}"></label></div>${editing ? '<p class="muted-text">O saldo é alterado pelas operações de entrada, saída e transferência.</p>' : ""}`, async () => {
            const code = document.getElementById("p-code").value.trim();
            const name = document.getElementById("p-name").value.trim();
            if (!code || !name) throw new Error("Código e descrição são obrigatórios.");
            const products = (await collection("produtos")).map(productModel);
            const currentProduct = product ? products.find(item => String(item.id) === String(product.id)) : null;
            if (product && !currentProduct) throw new Error("O produto não está mais cadastrado.");
            if (products.some(item => String(item.id) !== String(product?.id) && item.codigo.toLocaleLowerCase("pt-BR") === code.toLocaleLowerCase("pt-BR"))) throw new Error("Já existe um produto com esse código.");
            const updated = productModel({
                ...(currentProduct || product),
                id: product?.id || Date.now(),
                codigo: code,
                nome: name,
                ncm: document.getElementById("p-ncm").value.trim(),
                unidade_medida: document.getElementById("p-unit").value.trim() || "UN",
                estoque: currentProduct ? currentProduct.estoque : num(document.getElementById("p-stock").value),
                preco: num(document.getElementById("p-cost").value),
                custo_medio: num(document.getElementById("p-cost").value)
            });
            await saveCollection("produtos", product ? products.map(item => String(item.id) === String(product.id) ? updated : item) : [...products, updated]);
            await rerenderPage();
        });
    }

    function openSupplierForm(supplier, supplierIndex) {
        const editing = Boolean(supplier);
        modal(editing ? "Editar fornecedor" : "Novo fornecedor", `<div class="form-grid"><label>Razão social<input id="s-name" required value="${html(supplier?.razaoSocial || supplier?.razao_social || "")}"></label><div class="field-action"><label for="s-cnpj">CNPJ</label><div class="field-action-controls"><input id="s-cnpj" required maxlength="18" placeholder="00.000.000/0000-00" value="${html(supplier?.cnpj || "")}"><button class="btn-secondary" type="button" id="s-lookup">Buscar dados</button></div></div><label>IE<input id="s-ie" value="${html(supplier?.ie || "")}"></label><label class="field-full">Endereço<input id="s-address" value="${html(supplier?.endereco || "")}"></label></div>`, async () => {
            const razaoSocial = document.getElementById("s-name").value.trim();
            const cnpj = document.getElementById("s-cnpj").value.trim();
            if (!razaoSocial || !cnpj) throw new Error("Razão social e CNPJ são obrigatórios.");
            const suppliers = await collection("fornecedores");
            const updated = scoped({ ...supplier, id: supplier?.id || Date.now(), razaoSocial, cnpj, ie: document.getElementById("s-ie").value.trim(), endereco: document.getElementById("s-address").value.trim() });
            await saveCollection("fornecedores", supplier ? suppliers.map((item, index) => index === supplierIndex ? updated : item) : [...suppliers, updated]);
            await rerenderPage();
        });
        attachCnpjLookup("s-lookup", "s-cnpj", data => {
            document.getElementById("s-name").value = data.razao_social || "";
            document.getElementById("s-address").value = [data.logradouro, data.numero, data.complemento, data.bairro, data.municipio, data.uf, data.cep].filter(Boolean).join(", ");
        });
    }

    function openCatalogForm(collectionName, title, items, item, itemIndex) {
        const editing = Boolean(item);
        modal(`${editing ? "Editar" : "Novo cadastro"} · ${title}`, `<div class="form-grid"><label>Nome<input id="catalog-name" required maxlength="100" autocomplete="off" value="${html(item?.nome || item?.descricao || "")}"></label><label>Código (opcional)<input id="catalog-code" maxlength="30" autocomplete="off" value="${html(item?.codigo || "")}"></label></div>`, async () => {
            const name = document.getElementById("catalog-name").value.trim();
            const code = document.getElementById("catalog-code").value.trim();
            if (!name) throw new Error("Informe o nome do cadastro.");
            if (items.some((current, index) => index !== itemIndex && String(current.nome || current.descricao || "").trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) throw new Error("Já existe um cadastro com esse nome.");
            const updated = scoped({ ...item, id: item?.id || Date.now(), nome: name, codigo: code, ativo: item?.ativo !== false });
            await saveCollection(collectionName, item ? items.map((current, index) => index === itemIndex ? updated : current) : [...items, updated]);
            await rerenderPage();
        });
    }

    function openCompanyForm(company) {
        const editing = Boolean(company);
        modal(editing ? "Editar unidade" : "Cadastrar empresa", `<div class="form-grid"><label>Nome de exibição<input id="company-name" required maxlength="100" placeholder="Ex.: Unidade Norte" value="${html(company?.nome || "")}"></label><label>Razão social<input id="company-legal-name" required maxlength="150" value="${html(company?.razao_social || "")}"></label><div class="field-action"><label for="company-cnpj">CNPJ</label><div class="field-action-controls"><input id="company-cnpj" maxlength="18" placeholder="00.000.000/0000-00" value="${html(company?.cnpj || "")}"><button class="btn-secondary" type="button" id="company-lookup">Buscar dados</button></div></div>${editing ? "" : '<label>Identificação da filial<input id="company-branch" maxlength="60" placeholder="Preenchimento automático se vazio"></label>'}<label>Nome do estoque/setor<input id="company-sector-name" required maxlength="100" value="${html(company?.setor_nome || "Almoxarifado central")}"></label></div>`, async () => {
            const name = document.getElementById("company-name").value.trim();
            const legalName = document.getElementById("company-legal-name").value.trim();
            const cnpj = document.getElementById("company-cnpj").value.trim();
            const sectorName = document.getElementById("company-sector-name").value.trim();
            if (!name || !legalName || !sectorName) throw new Error("Nome, razão social e nome do estoque são obrigatórios.");
            if (state.companies.some(current => String(current.id) !== String(company?.id) && current.nome.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) throw new Error("Já existe uma empresa com esse nome.");
            let updated;
            if (company) {
                updated = companyModel({ ...company, nome: name, razao_social: legalName, cnpj, setor_nome: sectorName });
            } else {
                const id = `empresa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const safeId = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
                const branch = document.getElementById("company-branch").value.trim();
                updated = companyModel({ id, nome: name, razao_social: legalName, cnpj, filial_id: branch ? safeId(branch) : `filial-${id}`, setor_id: `estoque-${id}`, setor_nome: sectorName, ativo: true });
            }
            state.companies = company ? state.companies.map(current => String(current.id) === String(company.id) ? updated : current) : [...state.companies, updated];
            await write(COMPANY_REGISTRY_PATH, state.companies);
            if (String(updated.id) === String(CONTEXT.empresa_id)) activateCompany(updated);
            refreshCompanySelector();
            await rerenderPage();
        });
        attachCnpjLookup("company-lookup", "company-cnpj", data => {
            document.getElementById("company-legal-name").value = data.razao_social || "";
            if (!editing && !document.getElementById("company-name").value.trim()) document.getElementById("company-name").value = data.nome_fantasia || data.razao_social || "";
        });
    }

    async function dashboard() { pageTitle.textContent = "Resumo do dia"; const [rawProducts, orders, movements] = await Promise.all([collection("produtos"), collection("ordens"), collection("movimentacoes")]); const products = rawProducts.map(productModel); const qty = products.reduce((sum, item) => sum + num(item.estoque), 0); const value = products.reduce((sum, item) => sum + num(item.estoque) * num(item.custo_medio || item.preco), 0); content.innerHTML = `<div class="kpi-grid"><div class="card kpi-card"><small>ESTOQUE TOTAL</small><strong>${qty}</strong><span>Itens em estoque</span></div><div class="card kpi-card"><small>VALOR EM ESTOQUE</small><strong>${money(value)}</strong><span>Custo médio consolidado</span></div><div class="card kpi-card"><small>ORDENS DE COMPRA</small><strong>${orders.length}</strong><span>${html(CONTEXT.empresa_nome)}</span></div></div><div class="card"><div class="section-heading"><div><h3>Últimas movimentações</h3><p>Auditoria de ${html(CONTEXT.setor_nome)}.</p></div><span class="context-chip">${html(CONTEXT.empresa_nome)} · ${html(CONTEXT.setor_nome)}</span></div><table class="data-table"><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Quantidade</th><th>Saldo final</th><th>Usuário</th></tr></thead><tbody>${movements.slice(-8).reverse().map(item => `<tr><td>${new Date(item.data).toLocaleString("pt-BR")}</td><td><span class="status-chip">${html(item.tipo_movimentacao || item.tipo || "LEGADO")}</span></td><td>${html(item.produto)}</td><td>${item.quantidade ?? item.qtd ?? 0}</td><td>${item.saldo_final ?? "-"}</td><td>${html(item.usuario_nome || "Registro anterior")}</td></tr>`).join("") || `<tr><td colspan="6" class="table-empty">Nenhuma movimentacao.</td></tr>`}</tbody></table></div>`; }
    async function productsPage() { pageTitle.textContent = "Produtos e estoque"; const products = (await collection("produtos")).map(productModel); content.innerHTML = `<div class="section-heading"><div><h3>Saldo por produto</h3><p>Unidade: ${html(CONTEXT.empresa_nome)} · ${html(CONTEXT.setor_nome)}</p></div><button class="btn-add" id="new-product"><i class="fa-solid fa-plus"></i> Novo produto</button></div><div class="card table-card"><table class="data-table"><thead><tr><th>Código</th><th>Descrição</th><th>NCM</th><th>Unidade</th><th>Saldo</th><th>Custo médio</th></tr></thead><tbody>${products.map(item => `<tr><td>${html(item.codigo)}</td><td><strong>${html(item.nome)}</strong></td><td>${html(item.ncm || "-")}</td><td>${html(item.unidade_medida)}</td><td>${item.estoque}</td><td>${money(item.custo_medio)}</td></tr>`).join("") || `<tr><td colspan="6" class="table-empty">Nenhum produto.</td></tr>`}</tbody></table></div>`; document.getElementById("new-product").onclick = () => modal("Novo produto", `<div class="form-grid"><label>Código<input id="p-code" required></label><label>Descrição<input id="p-name" required></label><label>NCM<input id="p-ncm"></label><label>Unidade<input id="p-unit" value="UN"></label><label>Estoque inicial<input id="p-stock" type="number" min="0" value="0"></label><label>Custo médio<input id="p-cost" type="number" min="0" step="0.01" value="0"></label></div>`, async () => { const item = productModel({ id: Date.now(), codigo: document.getElementById("p-code").value.trim(), nome: document.getElementById("p-name").value.trim(), ncm: document.getElementById("p-ncm").value.trim(), unidade_medida: document.getElementById("p-unit").value.trim(), estoque: num(document.getElementById("p-stock").value), preco: num(document.getElementById("p-cost").value) }); if (!item.codigo || !item.nome) throw new Error("Código e descrição sao obrigatórios."); await saveCollection("produtos", [...products, item]); await productsPage(); }); }
    async function suppliersPage() { pageTitle.textContent = "Fornecedores"; const suppliers = await collection("fornecedores"); content.innerHTML = `<div class="section-heading"><div><h3>Cadastro de fornecedores</h3><p>Dados fiscais usados nas O.C.</p></div><button class="btn-add" id="new-supplier"><i class="fa-solid fa-plus"></i> Novo fornecedor</button></div><div class="card table-card"><table class="data-table"><thead><tr><th>Razão social</th><th>CNPJ</th><th>IE</th><th>Endereço</th></tr></thead><tbody>${suppliers.map(item => `<tr><td><strong>${html(item.razaoSocial || item.razao_social)}</strong></td><td>${html(item.cnpj || "-")}</td><td>${html(item.ie || "-")}</td><td>${html(item.endereco || "-")}</td></tr>`).join("") || `<tr><td colspan="4" class="table-empty">Nenhum fornecedor.</td></tr>`}</tbody></table></div>`; document.getElementById("new-supplier").onclick = () => modal("Novo fornecedor", `<div class="form-grid"><label>Razão social<input id="s-name" required></label><label>CNPJ<input id="s-cnpj" required></label><label>IE<input id="s-ie"></label><label class="field-full">Endereço<input id="s-address"></label></div>`, async () => { const item = scoped({ id: Date.now(), razaoSocial: document.getElementById("s-name").value.trim(), cnpj: document.getElementById("s-cnpj").value.trim(), ie: document.getElementById("s-ie").value.trim(), endereco: document.getElementById("s-address").value.trim() }); if (!item.razaoSocial || !item.cnpj) throw new Error("Razão social e CNPJ sao obrigatórios."); await saveCollection("fornecedores", [...suppliers, item]); await suppliersPage(); }); }
    async function unitsPage() {
        pageTitle.textContent = "Empresas, filiais e estoques";
        const inventory = await Promise.all(state.companies.map(async company => {
            const context = { ...CONTEXT, empresa_id: company.id, empresa_nome: company.nome, empresa_razao_social: company.razao_social, empresa_cnpj: company.cnpj, filial_id: company.filial_id, setor_id: company.setor_id, setor_nome: company.setor_nome };
            const products = (await collection("produtos", context)).map(item => productModel(item, context));
            return { company, productCount: products.length, stockQuantity: products.reduce((total, product) => total + product.estoque, 0) };
        }));
        content.innerHTML = `<div class="section-heading"><div><h3>Cadastro de empresas</h3><p>Cada empresa mantém seu próprio estoque, pedidos, saídas e histórico. Selecione a empresa ativa no topo para trocar os dados exibidos.</p></div><button class="btn-add" id="new-company"><i class="fa-solid fa-plus"></i> Cadastrar empresa</button></div><div class="card table-card"><table class="data-table company-table"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Filial</th><th>Estoque</th><th>Produtos</th><th>Situação</th></tr></thead><tbody>${inventory.map(({ company, productCount, stockQuantity }) => `<tr class="${company.id === CONTEXT.empresa_id ? "company-current" : ""}"><td><strong>${html(company.nome)}</strong>${company.id === CONTEXT.empresa_id ? `<span class="status-chip">Ativa</span>` : ""}</td><td>${html(company.cnpj || "-")}</td><td>${html(company.filial_id)}</td><td>${stockQuantity}</td><td>${productCount}</td><td>${company.ativo ? "Ativa" : "Inativa"}</td></tr>`).join("")}</tbody></table></div><div class="card context-panel company-context"><span class="context-chip">EMPRESA SELECIONADA</span><h3>${html(CONTEXT.empresa_razao_social)}</h3><p>CNPJ: <strong>${html(CONTEXT.empresa_cnpj || "Não informado")}</strong> · Filial: <strong>${html(CONTEXT.filial_id)}</strong> · Estoque/setor: <strong>${html(CONTEXT.setor_nome)}</strong></p><p class="muted-text">Os registros são separados pelo identificador da empresa, filial e estoque. Trocar a empresa ativa atualiza as telas de produtos, saídas, compras e análises.</p></div>`;
        document.getElementById("new-company").onclick = () => modal("Cadastrar empresa", `<div class="form-grid"><label>Nome de exibição<input id="company-name" required maxlength="100" placeholder="Ex.: Unidade Norte"></label><label>Razão social<input id="company-legal-name" required maxlength="150"></label><label>CNPJ<input id="company-cnpj" maxlength="24" placeholder="00.000.000/0000-00"></label><label>Identificação da filial<input id="company-branch" maxlength="60" placeholder="Preenchimento automático se vazio"></label><label>Nome do estoque/setor<input id="company-sector-name" required maxlength="100" value="Almoxarifado central"></label></div>`, async () => {
            const name = document.getElementById("company-name").value.trim();
            const legalName = document.getElementById("company-legal-name").value.trim();
            const cnpj = document.getElementById("company-cnpj").value.trim();
            const sectorName = document.getElementById("company-sector-name").value.trim();
            if (!name || !legalName || !sectorName) throw new Error("Nome, razão social e nome do estoque são obrigatórios.");
            if (state.companies.some(company => company.nome.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) throw new Error("Já existe uma empresa com esse nome.");
            const id = `empresa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const safeId = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
            const branch = document.getElementById("company-branch").value.trim();
            const company = companyModel({ id, nome: name, razao_social: legalName, cnpj, filial_id: branch ? safeId(branch) : `filial-${id}`, setor_id: `estoque-${id}`, setor_nome: sectorName, ativo: true });
            const companies = [...state.companies, company];
            await write(COMPANY_REGISTRY_PATH, companies);
            state.companies = companies;
            refreshCompanySelector();
            await unitsPage();
        });
    }
    async function catalogPage(collectionName, title, description) {
        pageTitle.textContent = title;
        const items = await collection(collectionName);
        content.innerHTML = `<div class="section-heading"><div><h3>${html(title)}</h3><p>${html(description)}</p></div><button class="btn-add" id="new-catalog-item"><i class="fa-solid fa-plus"></i> Novo cadastro</button></div><div class="card table-card"><table class="data-table"><thead><tr><th>Código</th><th>Nome</th><th>Situação</th><th>Ação</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${html(item.codigo || "-")}</td><td><strong>${html(item.nome || item.descricao || "-")}</strong></td><td><span class="status-chip ${item.ativo === false ? "is-inactive" : ""}">${item.ativo === false ? "Inativo" : "Ativo"}</span></td><td><button class="btn-secondary catalog-toggle" data-index="${index}">${item.ativo === false ? "Ativar" : "Desativar"}</button></td></tr>`).join("") || `<tr><td colspan="4" class="table-empty">Nenhum cadastro. Use “Novo cadastro” para começar.</td></tr>`}</tbody></table></div>`;
        document.getElementById("new-catalog-item").onclick = () => modal(`Novo cadastro · ${title}`, `<div class="form-grid"><label>Nome<input id="catalog-name" required maxlength="100" autocomplete="off"></label><label>Código (opcional)<input id="catalog-code" maxlength="30" autocomplete="off"></label></div>`, async () => {
            const name = document.getElementById("catalog-name").value.trim();
            const code = document.getElementById("catalog-code").value.trim();
            if (!name) throw new Error("Informe o nome do cadastro.");
            if (items.some(item => String(item.nome || item.descricao || "").trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) throw new Error("Já existe um cadastro com esse nome.");
            await saveCollection(collectionName, [...items, scoped({ id: Date.now(), nome: name, codigo: code, ativo: true })]);
            await catalogPage(collectionName, title, description);
        });
        content.querySelectorAll(".catalog-toggle").forEach(button => {
            button.onclick = async () => {
                try {
                    const index = Number(button.dataset.index);
                    items[index] = { ...items[index], ativo: items[index].ativo === false };
                    await saveCollection(collectionName, items);
                    await catalogPage(collectionName, title, description);
                } catch (error) { alert(error.message); }
            };
        });
    }

    async function analysisPage() {
        pageTitle.textContent = "Análise e exportação";
        const [orders, centers, expenses] = await Promise.all([collection("ordens"), collection("centros_resultados"), collection("despesas")]);
        const centerNames = [...new Set([...centers.map(item => item.nome), ...orders.map(order => order.centro_resultado || order.setor)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        const expenseNames = [...new Set([...expenses.map(item => item.nome), ...orders.map(order => order.despesa)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        const rows = orders.map(order => {
            const date = orderDate(order);
            const value = orderTotal(order);
            const freight = num(order.valor_frete);
            return {
                date,
                invoice: order.nota_fiscal || "",
                supplier: order.fornecedor?.razao_social || order.fornecedorNome || "",
                buyer: order.comprador || "",
                value,
                freight,
                total: value + freight - num(order.valor_saving),
                saving: num(order.valor_saving),
                payment: order.condicoes_pagamento?.forma || "",
                center: order.centro_resultado || order.setor || "",
                expense: order.despesa || "",
                unit: order.unidade || order.empresa_nome || CONTEXT.empresa_nome,
                productService: order.tipo_produto_servico || "Produto",
                emergency: order.emergencial || "Não",
                recurrence: order.recorrencia || "Pontual",
                product: order.itens.map(item => item.descricao || item.nome || "").filter(Boolean).join(" · ")
            };
        });
        content.innerHTML = `<div class="section-heading"><div><h3>Relatório de compras</h3><p>Filtre os lançamentos e exporte os dados no formato da planilha de referência.</p></div><button class="btn-add" id="export-report"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button></div><div class="card report-filters"><div class="form-grid"><label>Data inicial<input id="report-from" type="date"></label><label>Data final<input id="report-to" type="date"></label><label>Centro de resultados<select id="report-center"><option value="">Todos</option>${centerNames.map(name => `<option value="${html(name)}">${html(name)}</option>`).join("")}</select></label><label>Despesa<select id="report-expense"><option value="">Todas</option>${expenseNames.map(name => `<option value="${html(name)}">${html(name)}</option>`).join("")}</select></label><label class="field-full">Buscar fornecedor, comprador ou produto<input id="report-search" type="search" placeholder="Digite para filtrar"></label></div></div><div class="kpi-grid report-kpis"><div class="card kpi-card"><small>PEDIDOS NO FILTRO</small><strong id="report-count">0</strong><span>Ordens de compra</span></div><div class="card kpi-card"><small>VALOR DOS PEDIDOS</small><strong id="report-value">${money(0)}</strong><span>Sem frete</span></div><div class="card kpi-card"><small>VALOR TOTAL</small><strong id="report-total">${money(0)}</strong><span>Pedidos + frete - saving</span></div></div><div class="card table-card"><table class="data-table analysis-table"><thead><tr><th>Data do pedido</th><th>Nota fiscal</th><th>Fornecedor</th><th>Comprador</th><th>Valor</th><th>Valor_frete</th><th>Valor_total</th><th>Valor_saving</th><th>Forma de pagamento</th><th>Setor</th><th>Despesa</th><th>Unidade</th><th>Produto/Serviço</th><th>Emergenciais</th><th>Recorrência</th></tr></thead><tbody id="report-body"></tbody></table></div>`;
        const visibleRows = () => {
            const from = document.getElementById("report-from").value;
            const to = document.getElementById("report-to").value;
            const center = document.getElementById("report-center").value;
            const expense = document.getElementById("report-expense").value;
            const search = document.getElementById("report-search").value.trim().toLocaleLowerCase("pt-BR");
            return rows.filter(row => (!from || row.date >= from) && (!to || row.date <= to) && (!center || row.center === center) && (!expense || row.expense === expense) && (!search || `${row.supplier} ${row.buyer} ${row.product}`.toLocaleLowerCase("pt-BR").includes(search)));
        };
        const renderRows = () => {
            const visible = visibleRows();
            document.getElementById("report-count").textContent = String(visible.length);
            document.getElementById("report-value").textContent = money(visible.reduce((sum, row) => sum + row.value, 0));
            document.getElementById("report-total").textContent = money(visible.reduce((sum, row) => sum + row.total, 0));
            document.getElementById("report-body").innerHTML = visible.map(row => `<tr><td>${row.date ? row.date.split("-").reverse().join("/") : "-"}</td><td>${html(row.invoice || "-")}</td><td>${html(row.supplier || "-")}</td><td>${html(row.buyer || "-")}</td><td>${money(row.value)}</td><td>${money(row.freight)}</td><td>${money(row.total)}</td><td>${money(row.saving)}</td><td>${html(row.payment || "-")}</td><td>${html(row.center || "-")}</td><td>${html(row.expense || "-")}</td><td>${html(row.unit || "-")}</td><td title="${html(row.product)}">${html(row.productService)}</td><td>${html(row.emergency)}</td><td>${html(row.recurrence)}</td></tr>`).join("") || `<tr><td colspan="15" class="table-empty">Nenhum pedido corresponde aos filtros.</td></tr>`;
        };
        content.querySelectorAll("#report-from, #report-to, #report-center, #report-expense, #report-search").forEach(input => input.addEventListener("input", renderRows));
        document.getElementById("export-report").onclick = () => {
            const headers = ["Data do pedido", "Nota fiscal", "Fornecedor", "Comprador", "Valor", "Valor_frete", "Valor_total", "Valor_saving", "Forma de pagamento", "Setor", "Despesa", "Unidade", "Produto/Serviço", "Emergenciais", "Recorrência"];
            const csvRows = visibleRows().map(row => [row.date ? row.date.split("-").reverse().join("/") : "", row.invoice, row.supplier, row.buyer, row.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), row.freight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), row.total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), row.saving.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), row.payment, row.center, row.expense, row.unit, row.productService, row.emergency, row.recurrence]);
            downloadCsv(`analise-compras-${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...csvRows]);
        };
        renderRows();
    }

    function configureOrderSupplierFields(suppliers, currentSupplier = {}, currentSupplierId = "") {
        const supplierInput = document.getElementById("o-supplier");
        const cnpjInput = document.getElementById("o-supplier-cnpj");
        const ieInput = document.getElementById("o-supplier-ie");
        const addressInput = document.getElementById("o-supplier-address");
        const currentValue = currentSupplierId || currentSupplier.cnpj || currentSupplier.razao_social || currentSupplier.razaoSocial || "";
        const select = document.createElement("select");
        select.id = "o-supplier";
        select.required = true;
        const selectedIndex = suppliers.findIndex(supplier => {
            const supplierId = String(supplier.id || "");
            const supplierCnpj = String(supplier.cnpj || "").replace(/\D/g, "");
            const supplierName = String(supplier.razaoSocial || supplier.razao_social || "").trim().toLocaleLowerCase("pt-BR");
            const currentName = String(currentSupplier.razao_social || currentSupplier.razaoSocial || "").trim().toLocaleLowerCase("pt-BR");
            return (currentSupplierId && supplierId && supplierId === String(currentSupplierId)) ||
                (currentSupplier.cnpj && supplierCnpj && supplierCnpj === String(currentSupplier.cnpj).replace(/\D/g, "")) ||
                (currentName && supplierName && supplierName === currentName);
        });
        select.innerHTML = `<option value="">Selecione um fornecedor</option>${suppliers.map((supplier, index) => `<option value="${html(String(supplier.id || supplier.cnpj || `supplier-${index}`))}" ${index === selectedIndex ? "selected" : ""}>${html(supplier.razaoSocial || supplier.razao_social || "Fornecedor sem razão social")}</option>`).join("")}`;
        supplierInput.replaceWith(select);
        if (cnpjInput) cnpjInput.readOnly = true;
        if (ieInput) ieInput.readOnly = true;
        if (!addressInput) {
            const label = document.createElement("label");
            label.innerHTML = 'Endereço do fornecedor<input id="o-supplier-address" readonly>';
            if (ieInput) ieInput.closest("label").insertAdjacentElement("afterend", label);
            else cnpjInput.closest("label").insertAdjacentElement("afterend", label);
        }
        const populatedAddressInput = document.getElementById("o-supplier-address");
        const populate = () => {
            const supplierValue = select.value;
            const supplier = suppliers.find(item => String(item.id || item.cnpj || "") === String(supplierValue)) || null;
            const nextCnpj = supplier?.cnpj || (currentSupplier.cnpj && valueMatchesCurrent(currentSupplier, supplierValue) ? currentSupplier.cnpj : "");
            const nextIe = supplier?.ie || (currentSupplier.ie && valueMatchesCurrent(currentSupplier, supplierValue) ? currentSupplier.ie : "");
            const nextAddress = supplier?.endereco || (currentSupplier.endereco && valueMatchesCurrent(currentSupplier, supplierValue) ? currentSupplier.endereco : "");
            document.getElementById("o-supplier-cnpj").value = nextCnpj;
            document.getElementById("o-supplier-ie").value = nextIe;
            populatedAddressInput.value = nextAddress;
        };
        const valueMatchesCurrent = (supplier, value) => {
            if (!supplier || !value) return false;
            const name = String(supplier.razao_social || supplier.razaoSocial || "").trim().toLocaleLowerCase("pt-BR");
            const cnpj = String(supplier.cnpj || "").replace(/\D/g, "");
            if (value === String(supplier.id || "")) return true;
            if (value === cnpj) return true;
            if (name && value === name) return true;
            return false;
        };
        select.addEventListener("change", populate);
        if (currentValue) {
            const matchingValue = suppliers.find(item => String(item.id || item.cnpj || "") === String(currentSupplierId || currentValue)) ||
                suppliers.find(item => String(item.cnpj || "").replace(/\D/g, "") === String(currentSupplier.cnpj || "").replace(/\D/g, "")) ||
                suppliers.find(item => String(item.razaoSocial || item.razao_social || "").trim().toLocaleLowerCase("pt-BR") === String(currentSupplier.razao_social || currentSupplier.razaoSocial || "").trim().toLocaleLowerCase("pt-BR"));
            if (matchingValue) select.value = String(matchingValue.id || matchingValue.cnpj || "");
        }
        populate();
    }

    function getOrderSupplier(suppliers, existingSupplier = {}, existingSupplierId = "") {
        const supplierValue = document.getElementById("o-supplier").value;
        if (!supplierValue) throw new Error("Selecione um fornecedor cadastrado.");
        const supplier = suppliers.find(item => String(item.id || item.cnpj || "") === String(supplierValue));
        if (!supplier) throw new Error("O fornecedor selecionado não está mais cadastrado.");
        return {
            id: supplier.id || supplier.cnpj || "",
            data: {
                razao_social: supplier.razaoSocial || supplier.razao_social || "",
                cnpj: supplier.cnpj || "",
                ie: supplier.ie || "",
                endereco: supplier.endereco || ""
            }
        };
    }

    async function openOrderEditor(order) {
        if (order.status !== "Rascunho") throw new Error("Somente ordens em rascunho podem ser editadas.");
        const [centers, expenses, suppliers] = await Promise.all([collection("centros_resultados"), collection("despesas"), collection("fornecedores")]);
        const activeCenters = centers.filter(item => item.ativo !== false || String(item.id) === String(order.centro_resultado_id));
        const activeExpenses = expenses.filter(item => item.ativo !== false || String(item.id) === String(order.despesa_id));
        const centerOptions = activeCenters.map(item => `<option value="${html(item.id)}" ${String(item.id) === String(order.centro_resultado_id) ? "selected" : ""}>${html(item.nome)}</option>`).join("");
        const expenseOptions = activeExpenses.map(item => `<option value="${html(item.id)}" ${String(item.id) === String(order.despesa_id) ? "selected" : ""}>${html(item.nome)}</option>`).join("");
        const item = order.itens[0] || {};
        const today = String(order.data_pedido || order.data_emissao || "").slice(0, 10);
        modal(`Editar rascunho · ${order.numero}`, `<div class="form-section"><h4>Dados da compra</h4><div class="form-grid"><label>Data do pedido<input id="o-date" type="date" value="${html(today)}" required></label><label>Nota fiscal<input id="o-invoice" maxlength="80" value="${html(order.nota_fiscal || "")}"></label><label>Comprador<input id="o-buyer" value="${html(order.comprador || CONTEXT.usuario_nome)}" required></label><label>Unidade<input id="o-unit-name" value="${html(order.unidade || CONTEXT.empresa_nome)}" required></label><label>Centro de resultados<select id="o-center" required>${centerOptions}</select></label><label>Despesa<select id="o-expense" required>${expenseOptions}</select></label><label>Tipo de item<select id="o-product-type"><option ${order.tipo_produto_servico === "Produto" ? "selected" : ""}>Produto</option><option ${order.tipo_produto_servico === "Serviço" ? "selected" : ""}>Serviço</option></select></label><label>Emergencial<select id="o-emergency"><option ${order.emergencial === "Não" ? "selected" : ""}>Não</option><option ${order.emergencial === "Sim" ? "selected" : ""}>Sim</option></select></label><label>Recorrência<select id="o-recurrence">${["Pontual", "Mensal", "Semanal", "Anual"].map(value => `<option ${order.recorrencia === value ? "selected" : ""}>${value}</option>`).join("")}</select></label></div></div><div class="form-section"><h4>Filial compradora</h4><div class="form-grid"><label>Razão social<input id="o-company" value="${html(order.filial_compradora.razao_social)}" required></label><label>CNPJ<input id="o-cnpj" value="${html(order.filial_compradora.cnpj)}" required></label><label>IE<input id="o-ie" value="${html(order.filial_compradora.ie)}"></label><label>Endereço de faturamento<input id="o-billing" value="${html(order.filial_compradora.endereco_faturamento)}"></label><label>Endereço de entrega<input id="o-delivery" value="${html(order.filial_compradora.endereco_entrega)}"></label></div></div><div class="form-section"><h4>Fornecedor e pagamento</h4><div class="form-grid"><label>Razão social<input id="o-supplier" value="${html(order.fornecedor.razao_social)}" required></label><label>CNPJ<input id="o-supplier-cnpj" value="${html(order.fornecedor.cnpj)}"></label><label>IE<input id="o-supplier-ie" value="${html(order.fornecedor.ie)}"></label><label>Forma de pagamento<input id="o-payment" value="${html(order.condicoes_pagamento.forma)}"></label><label>Prazo<input id="o-term" value="${html(order.condicoes_pagamento.prazo)}"></label><label>Tipo de frete<select id="o-freight"><option ${order.condicoes_pagamento.frete === "FOB" ? "selected" : ""}>FOB</option><option ${order.condicoes_pagamento.frete === "CIF" ? "selected" : ""}>CIF</option></select></label><label>Valor do frete<input id="o-freight-value" type="number" min="0" step="0.01" value="${num(order.valor_frete)}"></label><label>Valor saving<input id="o-saving" type="number" min="0" step="0.01" value="${num(order.valor_saving)}"></label></div></div><div class="form-section"><h4>Item</h4><div class="form-grid"><label>Código<input id="o-code" value="${html(item.codigo || "")}" required></label><label>Descrição<input id="o-description" value="${html(item.descricao || "")}" required></label><label>NCM<input id="o-ncm" value="${html(item.ncm || "")}"></label><label>Unidade de medida<input id="o-unit" value="${html(item.unidade_medida || "UN")}"></label><label>Quantidade<input id="o-qty" type="number" min="0.01" step="0.01" value="${num(item.qtd)}"></label><label>Preço unitário<input id="o-price" type="number" min="0" step="0.01" value="${num(item.preco)}"></label>${["icms", "ipi", "pis", "cofins"].map(tax => `<label>${tax.toUpperCase()} %<input id="o-${tax}" type="number" min="0" step="0.01" value="${num(item.impostos?.[tax])}"></label>`).join("")}</div></div>`, async () => {
            const required = ["o-date", "o-buyer", "o-unit-name", "o-center", "o-expense", "o-company", "o-cnpj", "o-code", "o-description"];
            if (required.some(id => !document.getElementById(id).value.trim())) throw new Error("Preencha os campos obrigatórios.");
            const selectedCenter = activeCenters.find(current => String(current.id) === document.getElementById("o-center").value);
            const selectedExpense = activeExpenses.find(current => String(current.id) === document.getElementById("o-expense").value);
            if (!selectedCenter || !selectedExpense) throw new Error("Selecione um centro de resultados e uma despesa.");
            const selectedSupplier = getOrderSupplier(suppliers, order.fornecedor, order.fornecedor_id);
            const quantity = num(document.getElementById("o-qty").value);
            const price = num(document.getElementById("o-price").value);
            const freight = num(document.getElementById("o-freight-value").value);
            const saving = num(document.getElementById("o-saving").value);
            if (quantity <= 0 || price < 0 || freight < 0 || saving < 0) throw new Error("Informe valores válidos para quantidade, preço, frete e saving.");
            const date = document.getElementById("o-date").value;
            const updated = orderModel({
                ...order,
                data_pedido: date,
                data_emissao: new Date(`${date}T12:00:00`).toISOString(),
                nota_fiscal: document.getElementById("o-invoice").value.trim(),
                comprador: document.getElementById("o-buyer").value.trim(),
                unidade: document.getElementById("o-unit-name").value.trim(),
                centro_resultado_id: selectedCenter.id,
                centro_resultado: selectedCenter.nome,
                despesa_id: selectedExpense.id,
                despesa: selectedExpense.nome,
                tipo_produto_servico: document.getElementById("o-product-type").value,
                emergencial: document.getElementById("o-emergency").value,
                recorrencia: document.getElementById("o-recurrence").value,
                valor_frete: freight,
                valor_saving: saving,
                filial_compradora: { razao_social: document.getElementById("o-company").value.trim(), cnpj: document.getElementById("o-cnpj").value.trim(), ie: document.getElementById("o-ie").value.trim(), endereco_faturamento: document.getElementById("o-billing").value.trim(), endereco_entrega: document.getElementById("o-delivery").value.trim() },
                fornecedor_id: selectedSupplier.id,
                fornecedor: selectedSupplier.data,
                fornecedorNome: selectedSupplier.data.razao_social,
                condicoes_pagamento: { forma: document.getElementById("o-payment").value.trim(), prazo: document.getElementById("o-term").value.trim(), frete: document.getElementById("o-freight").value },
                itens: [{ ...item, codigo: document.getElementById("o-code").value.trim(), descricao: document.getElementById("o-description").value.trim(), ncm: document.getElementById("o-ncm").value.trim(), unidade_medida: document.getElementById("o-unit").value.trim(), qtd: quantity, preco: price, impostos: { icms: num(document.getElementById("o-icms").value), ipi: num(document.getElementById("o-ipi").value), pis: num(document.getElementById("o-pis").value), cofins: num(document.getElementById("o-cofins").value) } }, ...order.itens.slice(1)]
            });
            const orders = await collection("ordens");
            const latest = orders.find(current => String(current.id) === String(order.id));
            if (!latest || orderModel(latest).status !== "Rascunho") throw new Error("A ordem deixou de ser um rascunho e não pode ser editada.");
            await saveCollection("ordens", orders.map(current => String(current.id) === String(order.id) ? updated : current));
            await rerenderPage();
        });
        configureOrderSupplierFields(suppliers, order.fornecedor, order.fornecedor_id);
    }
    async function ordersPage() { pageTitle.textContent = "Ordens de compra"; const orders = (await collection("ordens")).map(orderModel).reverse(); content.innerHTML = `<div class="order-toolbar"><div><h3>Pedidos de compra</h3><p>Unidade: ${html(CONTEXT.empresa_nome)} · ${html(CONTEXT.setor_nome)}</p></div><button class="btn-add" id="new-order"><i class="fa-solid fa-plus"></i> Nova O.C.</button></div>${orders.length ? `<div class="orders-list">${orders.map(renderOrder).join("")}</div>` : `<div class="card empty-state"><i class="fa-solid fa-file-circle-plus"></i><h3>Nenhuma ordem de compra</h3><p>Crie uma O.C. com dados fiscais completos.</p></div>`}`; document.getElementById("new-order").onclick = () => openOrder().catch(error => alert(error.message)); }
    async function openOrder() {
        const [centers, expenses, suppliers] = await Promise.all([collection("centros_resultados"), collection("despesas"), collection("fornecedores")]);
        const activeCenters = centers.filter(item => item.ativo !== false);
        const activeExpenses = expenses.filter(item => item.ativo !== false);
        const centerOptions = activeCenters.map(item => `<option value="${html(item.id)}">${html(item.nome)}</option>`).join("");
        const expenseOptions = activeExpenses.map(item => `<option value="${html(item.id)}">${html(item.nome)}</option>`).join("");
        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        modal("Nova ordem de compra", `<div class="form-section"><h4>Dados da compra</h4><div class="form-grid"><label>Data do pedido<input id="o-date" type="date" value="${today}" required></label><label>Nota fiscal<input id="o-invoice" maxlength="80"></label><label>Comprador<input id="o-buyer" value="${html(CONTEXT.usuario_nome)}" required></label><label>Unidade<input id="o-unit-name" value="${html(CONTEXT.empresa_nome)}" required></label><label>Centro de resultados<select id="o-center" required><option value="">Selecione um centro de resultados</option>${centerOptions}</select></label><label>Despesa<select id="o-expense" required><option value="">Selecione uma despesa</option>${expenseOptions}</select></label><label>Tipo de item<select id="o-product-type"><option>Produto</option><option>Serviço</option></select></label><label>Emergencial<select id="o-emergency"><option>Não</option><option>Sim</option></select></label><label>Recorrência<select id="o-recurrence"><option>Pontual</option><option>Mensal</option><option>Semanal</option><option>Anual</option></select></label></div></div><div class="form-section"><h4>Filial compradora</h4><div class="form-grid"><label>Razão social<input id="o-company" value="${html(CONTEXT.empresa_razao_social)}" required></label><label>CNPJ<input id="o-cnpj" value="${html(CONTEXT.empresa_cnpj)}" required></label><label>IE<input id="o-ie"></label><label>Endereço de faturamento<input id="o-billing"></label><label>Endereço de entrega<input id="o-delivery"></label></div></div><div class="form-section"><h4>Fornecedor e pagamento</h4><div class="form-grid"><label>Razão social<input id="o-supplier" required></label><label>CNPJ<input id="o-supplier-cnpj"></label><label>IE<input id="o-supplier-ie"></label><label>Forma de pagamento<input id="o-payment" placeholder="Ex.: boleto, cartão"></label><label>Prazo<input id="o-term"></label><label>Tipo de frete<select id="o-freight"><option>FOB</option><option selected>CIF</option></select></label><label>Valor do frete<input id="o-freight-value" type="number" min="0" step="0.01" value="0"></label><label>Valor saving<input id="o-saving" type="number" min="0" step="0.01" value="0"></label></div></div><div class="form-section"><h4>Item</h4><div class="form-grid"><label>Código<input id="o-code" required></label><label>Descrição<input id="o-description" required></label><label>NCM<input id="o-ncm"></label><label>Unidade de medida<input id="o-unit" value="UN"></label><label>Quantidade<input id="o-qty" type="number" min="0.01" step="0.01" value="1"></label><label>Preço unitário<input id="o-price" type="number" min="0" step="0.01" value="0"></label><label>ICMS %<input id="o-icms" type="number" min="0" step="0.01" value="0"></label><label>IPI %<input id="o-ipi" type="number" min="0" step="0.01" value="0"></label><label>PIS %<input id="o-pis" type="number" min="0" step="0.01" value="0"></label><label>COFINS %<input id="o-cofins" type="number" min="0" step="0.01" value="0"></label></div></div>`, async () => {
            const required = ["o-date", "o-buyer", "o-unit-name", "o-center", "o-expense", "o-company", "o-cnpj", "o-code", "o-description"];
            if (required.some(id => !document.getElementById(id).value.trim())) throw new Error("Preencha os campos obrigatórios, incluindo centro de resultados e despesa.");
            const selectedCenter = activeCenters.find(item => String(item.id) === document.getElementById("o-center").value);
            const selectedExpense = activeExpenses.find(item => String(item.id) === document.getElementById("o-expense").value);
            if (!selectedCenter || !selectedExpense) throw new Error("Selecione um centro de resultados e uma despesa ativos.");
            const selectedSupplier = getOrderSupplier(suppliers);
            const order = orderModel({
                id: Date.now(),
                status: "Rascunho",
                data_pedido: document.getElementById("o-date").value,
                nota_fiscal: document.getElementById("o-invoice").value.trim(),
                comprador: document.getElementById("o-buyer").value.trim(),
                valor_frete: num(document.getElementById("o-freight-value").value),
                valor_saving: num(document.getElementById("o-saving").value),
                centro_resultado_id: selectedCenter.id,
                centro_resultado: selectedCenter.nome,
                despesa_id: selectedExpense.id,
                despesa: selectedExpense.nome,
                unidade: document.getElementById("o-unit-name").value.trim(),
                tipo_produto_servico: document.getElementById("o-product-type").value,
                emergencial: document.getElementById("o-emergency").value,
                recorrencia: document.getElementById("o-recurrence").value,
                filial_compradora: { razao_social: document.getElementById("o-company").value.trim(), cnpj: document.getElementById("o-cnpj").value.trim(), ie: document.getElementById("o-ie").value.trim(), endereco_faturamento: document.getElementById("o-billing").value.trim(), endereco_entrega: document.getElementById("o-delivery").value.trim() },
                fornecedor_id: selectedSupplier.id,
                fornecedor: selectedSupplier.data,
                fornecedorNome: selectedSupplier.data.razao_social,
                condicoes_pagamento: { forma: document.getElementById("o-payment").value.trim(), prazo: document.getElementById("o-term").value.trim(), frete: document.getElementById("o-freight").value },
                itens: [{ codigo: document.getElementById("o-code").value.trim(), descricao: document.getElementById("o-description").value.trim(), ncm: document.getElementById("o-ncm").value.trim(), unidade_medida: document.getElementById("o-unit").value.trim(), qtd: num(document.getElementById("o-qty").value), preco: num(document.getElementById("o-price").value), icms: num(document.getElementById("o-icms").value), ipi: num(document.getElementById("o-ipi").value), pis: num(document.getElementById("o-pis").value), cofins: num(document.getElementById("o-cofins").value) }]
            });
            if (order.itens[0].qtd <= 0 || order.itens[0].preco < 0 || order.valor_frete < 0 || order.valor_saving < 0) throw new Error("Informe valores válidos para quantidade, preço, frete e saving.");
            const orders = await collection("ordens");
            orders.push(order);
            await saveCollection("ordens", orders);
            await ordersPage();
        });
        configureOrderSupplierFields(suppliers);
    }
    window.atualizarStatusOC = async (id, next) => { try { const orders = (await collection("ordens")).map(orderModel); const order = orders.find(item => String(item.id) === String(id)); if (!order || !TRANSITIONS[order.status]?.includes(next)) throw new Error("Transicao de status invalida."); if (next === "Faturada") await receiveOrder(id); else { order.status = next; await saveCollection("ordens", orders); } await ordersPage(); } catch (error) { alert(error.message); await ordersPage(); } };
    async function consumptionPage() {
        pageTitle.textContent = "Saída e consumo";
        let products = (await collection("produtos")).map(productModel);
        state.consumo = [];
        const productOptions = () => products.map(item =>
            `<option value="${html(String(item.id))}">${html(item.codigo)} · ${html(item.nome)} · saldo ${item.estoque} ${html(item.unidade_medida)}</option>`
        ).join("");
        content.innerHTML = `<div class="card operation-card"><div class="section-heading"><div><h3>Registrar saída de itens</h3><p>Cada item é salvo imediatamente. Informe onde será utilizado; depois, o formulário fica pronto para o próximo.</p></div><span class="context-chip">Estoque: ${html(CONTEXT.empresa_nome)} · ${html(CONTEXT.setor_nome)}</span></div><div class="form-grid consumption-form"><label class="field-full">Buscar produto<input id="c-search" type="search" placeholder="Buscar por nome, código, descrição ou NCM" autocomplete="off" ${products.length ? "" : "disabled"}></label><label class="field-full">Produto<select id="c-product" ${products.length ? "required" : "disabled"}><option value="">Selecione um produto</option>${productOptions()}</select><span id="c-product-stock" class="muted-text">Selecione um produto para consultar o saldo atual.</span><span id="c-search-count" class="muted-text" aria-live="polite"></span></label><label>Quantidade<input id="c-qty" type="number" min="0.01" step="0.01" value="1" ${products.length ? "" : "disabled"}></label><label class="field-full">Destino / local de utilização<input id="c-destination" maxlength="160" placeholder="Ex.: unidade, setor, sala ou equipamento" required ${products.length ? "" : "disabled"}></label><button class="btn-add align-end" id="c-add" type="button" ${products.length ? "" : "disabled"}><i class="fa-solid fa-check"></i> Registrar saída e adicionar outro</button></div>${products.length ? "" : `<p class="muted-text">Nenhum produto cadastrado neste estoque.</p>`}<div class="operation-list" id="c-list"><strong>Saídas registradas nesta sessão</strong><div class="consumption-history"><p class="muted-text">Nenhuma saída registrada ainda.</p></div></div></div>`;
        const productSelect = document.getElementById("c-product");
        const productSearch = document.getElementById("c-search");
        const productStock = document.getElementById("c-product-stock");
        const searchCount = document.getElementById("c-search-count");
        const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
        const filterProducts = () => {
            const query = normalizeSearch(productSearch.value);
            const matches = products.filter(product =>
                normalizeSearch([product.codigo, product.nome, product.descricao, product.ncm].join(" ")).includes(query)
            );
            [...productSelect.options].forEach(option => {
                if (!option.value) return;
                option.hidden = Boolean(query) &&
                    option.value !== productSelect.value &&
                    !matches.some(product => String(product.id) === option.value);
            });
            searchCount.textContent = query
                ? `${matches.length} produto(s) encontrado(s).`
                : `${products.length} produto(s) disponível(is).`;
        };
        const updateSelectedStock = () => {
            const product = products.find(item => String(item.id) === productSelect.value);
            productStock.textContent = product
                ? `Saldo disponível: ${product.estoque} ${product.unidade_medida}.`
                : "Selecione um produto para consultar o saldo atual.";
        };
        productSearch.addEventListener("input", filterProducts);
        productSelect.addEventListener("change", updateSelectedStock);
        filterProducts();
        const renderConsumptionHistory = () => {
            const history = document.querySelector(".consumption-history");
            history.innerHTML = state.consumo.length
                ? state.consumo.map(item => `<div class="consumption-line"><span><strong>${html(item.codigo)} · ${html(item.nome)}</strong><small>${item.qtd} ${html(item.unidade_medida)} · Destino: ${html(item.destino)} · Salvo</small></span><i class="fa-solid fa-circle-check" aria-label="Saída salva"></i></div>`).join("")
                : `<p class="muted-text">Nenhuma saída registrada ainda.</p>`;
        };
        document.getElementById("c-add").onclick = async event => {
            const product = products.find(item => String(item.id) === productSelect.value);
            const quantity = Number(document.getElementById("c-qty").value);
            const destination = document.getElementById("c-destination").value.trim();
            if (!product) return alert("Selecione um produto cadastrado.");
            if (!Number.isFinite(quantity) || quantity <= 0) return alert("Informe uma quantidade maior que zero.");
            if (!destination) return alert("Informe o destino ou local de utilização do item.");
            const button = event.currentTarget;
            button.disabled = true;
            try {
                button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando saída...';
                await moveStockBatch([{
                    productId: product.id,
                    quantity,
                    type: "SAIDA_CONSUMO",
                    origin: CONTEXT.setor_nome,
                    destination
                }]);
            } catch (error) {
                alert(error.message);
                button.disabled = false;
                button.innerHTML = '<i class="fa-solid fa-check"></i> Registrar saída e adicionar outro';
                return;
            }
            state.consumo.push({ id: product.id, codigo: product.codigo, nome: product.nome, unidade_medida: product.unidade_medida, qtd: quantity, destino });
            renderConsumptionHistory();
            productSelect.value = "";
            productSearch.value = "";
            document.getElementById("c-qty").value = "1";
            document.getElementById("c-destination").value = "";
            productStock.textContent = "Selecione um produto para consultar o saldo atual.";
            button.innerHTML = '<i class="fa-solid fa-check"></i> Registrar saída e adicionar outro';
            button.disabled = false;
            try {
                products = (await collection("produtos")).map(productModel);
                productSelect.innerHTML = `<option value="">Selecione um produto</option>${productOptions()}`;
                filterProducts();
            } catch (error) {
                console.error(error);
                alert(`A saída foi salva, mas não foi possível atualizar o saldo exibido. Atualize a tela antes de continuar. ${error.message}`);
            }
        };
    }
    async function transferPage() {
        pageTitle.textContent = "Transferências entre empresas";
        const products = (await collection("produtos")).map(productModel);
        const targets = state.companies.filter(company => company.ativo && company.id !== CONTEXT.empresa_id);
        const canTransfer = products.length > 0 && targets.length > 0;
        content.innerHTML = `<div class="card operation-card"><div class="section-heading"><div><h3>Transferir estoque</h3><p>A transferência registra a saída nesta empresa e a entrada no estoque da empresa selecionada.</p></div><span class="context-chip">Origem: ${html(CONTEXT.empresa_nome)} · ${html(CONTEXT.setor_nome)}</span></div><div class="form-grid"><label class="field-wide">Produto<select id="t-product" ${products.length ? "required" : "disabled"}><option value="">Selecione um produto</option>${products.map(item => `<option value="${html(item.id)}">${html(item.codigo)} · ${html(item.nome)} · saldo ${item.estoque}</option>`).join("")}</select></label><label>Quantidade<input id="t-qty" type="number" min="0.01" step="0.01" value="1" ${products.length ? "" : "disabled"}></label><label class="field-wide">Empresa de destino<select id="t-company" required ${targets.length ? "" : "disabled"}><option value="">Selecione uma empresa</option>${targets.map(company => `<option value="${html(company.id)}">${html(company.nome)} · ${html(company.setor_nome)}</option>`).join("")}</select></label></div>${canTransfer ? `<button class="btn-add" id="t-confirm">Confirmar transferência</button>` : `<p class="muted-text">${products.length ? "Cadastre outra empresa para habilitar transferências entre estoques." : "Cadastre um produto com saldo para habilitar transferências."}</p>`}</div>`;
        const confirm = document.getElementById("t-confirm");
        if (confirm) confirm.onclick = async () => {
            try {
                await transferStock({
                    productId: document.getElementById("t-product").value,
                    quantity: num(document.getElementById("t-qty").value),
                    targetCompanyId: document.getElementById("t-company").value
                });
                alert("Transferência registrada nos dois estoques.");
                await transferPage();
            } catch (error) {
                alert(error.message);
            }
        };
    }
    async function movementsPage() {
        pageTitle.textContent = "Auditoria de estoque";
        const movements = (await collection("movimentacoes")).reverse();
        content.innerHTML = `<div class="section-heading"><div><h3>Livro de movimentações</h3><p>Consulte responsável, local de utilização, saldos e quantidade movimentada.</p></div></div><div class="card table-card"><table class="data-table audit-table"><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Destino / utilização</th><th>Saldo anterior</th><th>Quantidade</th><th>Saldo final</th><th>Custo médio</th><th>Usuário</th></tr></thead><tbody>${movements.map(item => {
            const destination = item.destino_utilizacao || (item.destino_setor_id ? `${item.destino_empresa_id || ""} · ${item.destino_setor_id}` : "-");
            return `<tr><td>${new Date(item.data).toLocaleString("pt-BR")}</td><td><span class="status-chip">${html(item.tipo_movimentacao || item.tipo || "LEGADO")}</span></td><td>${html(item.codigo_produto || item.produto)}</td><td>${html(destination)}</td><td>${item.saldo_anterior}</td><td>${item.quantidade ?? item.qtd ?? 0}</td><td>${item.saldo_final ?? "-"}</td><td>${money(item.custo_medio)}</td><td>${html(item.usuario_nome || "Registro anterior")}</td></tr>`;
        }).join("") || `<tr><td colspan="9" class="table-empty">Nenhuma movimentação.</td></tr>`}</tbody></table></div>`;
    }
    window.imprimirOrdem = async id => { const order = (await collection("ordens")).map(orderModel).find(item => String(item.id) === String(id)); if (!order) return alert("Ordem não encontrada."); const printWindow = window.open("", "_blank", "width=900,height=700"); if (!printWindow) return alert("Permita pop-ups para imprimir."); const rows = order.itens.map(item => `<tr><td>${html(item.codigo)}</td><td>${html(item.descricao)}</td><td>${html(item.ncm)}</td><td>${item.qtd} ${html(item.unidade_medida)}</td><td>${money(item.preco)}</td><td>${money(item.qtd * item.preco)}</td></tr>`).join(""); printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${html(order.numero)}</title><style>body{font:12px Arial;padding:28px;color:#15232b}header{display:flex;justify-content:space-between;border-bottom:2px solid #087f73;padding-bottom:14px}h1{font-size:20px}.meta{text-align:right}.meta strong{display:block;font-size:20px}.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #c8d5da;margin:18px 0}.box{padding:12px}.box+.box{border-left:1px solid #c8d5da}table{width:100%;border-collapse:collapse}th{background:#e7f5f2;padding:8px;text-align:left;font-size:10px}td{padding:8px;border-bottom:1px solid #dfe7ea}th:not(:first-child),td:not(:first-child){text-align:right}.total{margin:18px 0 0 auto;width:250px;border-top:2px solid #15232b;padding-top:9px;display:flex;justify-content:space-between;font-weight:bold}@page{size:A4;margin:14mm}</style></head><body><header><div><h1>${html(order.filial_compradora.razao_social)}</h1><p>CNPJ: ${html(order.filial_compradora.cnpj)} · IE: ${html(order.filial_compradora.ie)}</p><p>Entrega: ${html(order.filial_compradora.endereco_entrega)}</p></div><div class="meta">ORDEM DE COMPRA<strong>${html(order.numero)}</strong><span>${new Date(order.data_emissao).toLocaleDateString("pt-BR")}</span></div></header><div class="grid"><div class="box"><strong>FORNECEDOR</strong><p>${html(order.fornecedor.razao_social)}</p><p>CNPJ: ${html(order.fornecedor.cnpj)} · IE: ${html(order.fornecedor.ie)}</p></div><div class="box"><strong>CONDIÇÕES</strong><p>${html(order.condicoes_pagamento.forma)} · ${html(order.condicoes_pagamento.prazo)} · ${html(order.condicoes_pagamento.frete)}</p></div></div><table><thead><tr><th>Código</th><th>Descrição</th><th>NCM</th><th>Quantidade</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><span>Total</span><span>${money(orderTotal(order))}</span></div></body></html>`); printWindow.document.close(); printWindow.onload = () => printWindow.print(); };
    function orderItemRow(products, item = {}) {
        const selectedProduct = products.find(product =>
            (item.product_id && String(product.id) === String(item.product_id)) ||
            (item.codigo && String(product.codigo) === String(item.codigo))
        );
        const options = products.map(product =>
            `<option value="${html(String(product.id))}" ${selectedProduct && String(product.id) === String(selectedProduct.id) ? "selected" : ""}>${html(product.codigo)} · ${html(product.nome)} · saldo ${product.estoque}</option>`
        ).join("");
        const legacyNote = !selectedProduct && item.descricao
            ? `Item anterior: ${html(item.codigo)} · ${html(item.descricao)}. Selecione um produto cadastrado para continuar.`
            : "Selecione um produto para carregar descrição, NCM e unidade.";
        return `<div class="form-grid order-item-row"><label class="order-item-product">Produto do cadastro<input data-item-search type="search" placeholder="Buscar por nome, código, descrição ou NCM" autocomplete="off"><select data-item-product required><option value="">Selecione um produto</option>${options}</select><span class="order-item-detail">${legacyNote}</span><span class="order-item-search-count" data-item-search-count aria-live="polite"></span></label><label>Quantidade<input data-item-quantity type="number" min="0.01" step="0.01" value="${num(item.qtd) || 1}" required></label><label>Preço unitário<input data-item-price type="number" min="0" step="0.01" value="${num(item.preco)}" required></label><button class="order-item-remove" type="button" aria-label="Remover item" title="Remover item"><i class="fa-solid fa-trash"></i></button><details class="order-item-taxes"><summary>Impostos do item</summary><div class="form-grid">${["icms", "ipi", "pis", "cofins"].map(tax => `<label>${tax.toUpperCase()} %<input data-item-tax="${tax}" type="number" min="0" step="0.01" value="${num(item.impostos?.[tax])}"></label>`).join("")}</div></details></div>`;
    }

    async function openCatalogOrder(existingOrder = null) {
        const [centers, expenses, suppliers, rawProducts] = await Promise.all([
            collection("centros_resultados"),
            collection("despesas"),
            collection("fornecedores"),
            collection("produtos")
        ]);
        const products = rawProducts.map(productModel);
        const activeCenters = centers.filter(item => item.ativo !== false || String(item.id) === String(existingOrder?.centro_resultado_id));
        const activeExpenses = expenses.filter(item => item.ativo !== false || String(item.id) === String(existingOrder?.despesa_id));
        const centerOptions = activeCenters.map(item =>
            `<option value="${html(String(item.id))}" ${String(item.id) === String(existingOrder?.centro_resultado_id) ? "selected" : ""}>${html(item.nome)}</option>`
        ).join("");
        const expenseOptions = activeExpenses.map(item =>
            `<option value="${html(String(item.id))}" ${String(item.id) === String(existingOrder?.despesa_id) ? "selected" : ""}>${html(item.nome)}</option>`
        ).join("");
        const date = String(existingOrder?.data_pedido || existingOrder?.data_emissao || "").slice(0, 10) ||
            new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const existingItems = existingOrder?.itens?.length ? existingOrder.itens : [{}];
        const itemRows = existingItems.map(item => orderItemRow(products, item)).join("");
        const company = existingOrder?.filial_compradora || {};
        const supplier = existingOrder?.fornecedor || {};
        const conditions = existingOrder?.condicoes_pagamento || {};
        const title = existingOrder ? `Editar rascunho · ${existingOrder.numero}` : "Nova ordem de compra";

        modal(title, `<div class="form-section"><h4>Dados da compra</h4><div class="form-grid"><label>Data do pedido<input id="o-date" type="date" value="${html(date)}" required></label><label>Nota fiscal<input id="o-invoice" maxlength="80" value="${html(existingOrder?.nota_fiscal || "")}"></label><label>Comprador<input id="o-buyer" value="${html(existingOrder?.comprador || CONTEXT.usuario_nome)}" required></label><label>Unidade<input id="o-unit-name" value="${html(existingOrder?.unidade || CONTEXT.empresa_nome)}" required></label><label>Centro de resultados<select id="o-center" required><option value="">Selecione um centro de resultados</option>${centerOptions}</select></label><label>Despesa<select id="o-expense" required><option value="">Selecione uma despesa</option>${expenseOptions}</select></label><label>Tipo de item<select id="o-product-type"><option ${existingOrder?.tipo_produto_servico === "Produto" ? "selected" : ""}>Produto</option><option ${existingOrder?.tipo_produto_servico === "Serviço" ? "selected" : ""}>Serviço</option></select></label><label>Emergencial<select id="o-emergency"><option ${existingOrder?.emergencial === "Não" ? "selected" : ""}>Não</option><option ${existingOrder?.emergencial === "Sim" ? "selected" : ""}>Sim</option></select></label><label>Recorrência<select id="o-recurrence">${["Pontual", "Mensal", "Semanal", "Anual"].map(value => `<option ${existingOrder?.recorrencia === value ? "selected" : ""}>${value}</option>`).join("")}</select></label></div></div><div class="form-section"><h4>Filial compradora</h4><div class="form-grid"><label>Razão social<input id="o-company" value="${html(company.razao_social || CONTEXT.empresa_razao_social)}" required></label><label>CNPJ<input id="o-cnpj" value="${html(company.cnpj || CONTEXT.empresa_cnpj)}" required></label><label>IE<input id="o-ie" value="${html(company.ie || "")}"></label><label>Endereço de faturamento<input id="o-billing" value="${html(company.endereco_faturamento || "")}"></label><label>Endereço de entrega<input id="o-delivery" value="${html(company.endereco_entrega || "")}"></label></div></div><div class="form-section"><h4>Fornecedor e pagamento</h4><div class="form-grid"><label>Razão social<select id="o-supplier" required><option value="">Selecione um fornecedor</option></select></label><label>CNPJ<input id="o-supplier-cnpj" value="${html(supplier.cnpj || "")}"></label><label>IE<input id="o-supplier-ie" value="${html(supplier.ie || "")}"></label><label>Forma de pagamento<input id="o-payment" placeholder="Ex.: boleto, cartão" value="${html(conditions.forma || "")}"></label><label>Prazo<input id="o-term" value="${html(conditions.prazo || "")}"></label><label>Tipo de frete<select id="o-freight"><option ${conditions.frete === "FOB" ? "selected" : ""}>FOB</option><option ${conditions.frete !== "FOB" ? "selected" : ""}>CIF</option></select></label><label>Valor do frete<input id="o-freight-value" type="number" min="0" step="0.01" value="${num(existingOrder?.valor_frete)}"></label><label>Valor saving<input id="o-saving" type="number" min="0" step="0.01" value="${num(existingOrder?.valor_saving)}"></label><label class="field-full">Endereço do fornecedor<input id="o-supplier-address" value="${html(supplier.endereco || "")}"></label></div></div><div class="form-section"><div class="order-items-toolbar"><div><h4>Itens da ordem</h4><p>Escolha os produtos cadastrados; descrição, NCM e unidade são vinculados ao cadastro.</p></div><button class="btn-secondary" id="o-add-item" type="button"><i class="fa-solid fa-plus"></i> Adicionar item</button></div><div class="order-item-lines" id="o-item-lines">${itemRows}</div>${products.length ? "" : `<p class="muted-text">Cadastre produtos antes de incluí-los na ordem de compra.</p>`}</div>`, async () => {
            const required = ["o-date", "o-buyer", "o-unit-name", "o-center", "o-expense", "o-company", "o-cnpj"];
            if (required.some(id => !document.getElementById(id).value.trim())) throw new Error("Preencha os campos obrigatórios, incluindo centro de resultados e despesa.");
            const selectedCenter = activeCenters.find(item => String(item.id) === document.getElementById("o-center").value);
            const selectedExpense = activeExpenses.find(item => String(item.id) === document.getElementById("o-expense").value);
            if (!selectedCenter || !selectedExpense) throw new Error("Selecione um centro de resultados e uma despesa ativos.");
            const selectedSupplier = getOrderSupplier(suppliers, supplier, existingOrder?.fornecedor_id || "");
            const itemRows = [...document.querySelectorAll("#o-item-lines .order-item-row")];
            if (!itemRows.length) throw new Error("Adicione pelo menos um item à ordem.");
            const items = itemRows.map(row => {
                const productId = row.querySelector("[data-item-product]").value;
                const product = products.find(item => String(item.id) === productId);
                const quantity = num(row.querySelector("[data-item-quantity]").value);
                const price = num(row.querySelector("[data-item-price]").value);
                if (!product) throw new Error("Selecione um produto cadastrado para cada item.");
                if (quantity <= 0 || price < 0) throw new Error("Informe quantidade e preço válidos para todos os itens.");
                return {
                    product_id: product.id,
                    codigo: product.codigo,
                    descricao: product.descricao || product.nome,
                    ncm: product.ncm || "",
                    unidade_medida: product.unidade_medida || "UN",
                    qtd: quantity,
                    preco: price,
                    impostos: Object.fromEntries(["icms", "ipi", "pis", "cofins"].map(tax => [tax, num(row.querySelector(`[data-item-tax="${tax}"]`).value)]))
                };
            });
            const dateValue = document.getElementById("o-date").value;
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("Entre novamente para registrar a ordem.");
            const order = orderModel({
                ...(existingOrder || {}),
                ...(!existingOrder ? {
                    criado_por: {
                        uid: currentUser.uid,
                        email: currentUser.email || "",
                        nome: ACCOUNT_NAMES[String(currentUser.email || "").toLowerCase()] || currentUser.displayName || currentUser.email || "Usuário"
                    },
                    criado_em: new Date().toISOString()
                } : {}),
                id: existingOrder?.id || Date.now(),
                status: existingOrder?.status || "Rascunho",
                data_pedido: dateValue,
                data_emissao: new Date(`${dateValue}T12:00:00`).toISOString(),
                nota_fiscal: document.getElementById("o-invoice").value.trim(),
                comprador: document.getElementById("o-buyer").value.trim(),
                unidade: document.getElementById("o-unit-name").value.trim(),
                centro_resultado_id: selectedCenter.id,
                centro_resultado: selectedCenter.nome,
                despesa_id: selectedExpense.id,
                despesa: selectedExpense.nome,
                tipo_produto_servico: document.getElementById("o-product-type").value,
                emergencial: document.getElementById("o-emergency").value,
                recorrencia: document.getElementById("o-recurrence").value,
                valor_frete: num(document.getElementById("o-freight-value").value),
                valor_saving: num(document.getElementById("o-saving").value),
                filial_compradora: {
                    razao_social: document.getElementById("o-company").value.trim(),
                    cnpj: document.getElementById("o-cnpj").value.trim(),
                    ie: document.getElementById("o-ie").value.trim(),
                    endereco_faturamento: document.getElementById("o-billing").value.trim(),
                    endereco_entrega: document.getElementById("o-delivery").value.trim()
                },
                fornecedor_id: selectedSupplier.id,
                fornecedor: selectedSupplier.data,
                fornecedorNome: selectedSupplier.data.razao_social,
                condicoes_pagamento: {
                    forma: document.getElementById("o-payment").value.trim(),
                    prazo: document.getElementById("o-term").value.trim(),
                    frete: document.getElementById("o-freight").value
                },
                itens: items
            });
            if (order.valor_frete < 0 || order.valor_saving < 0) throw new Error("Informe valores válidos para frete e saving.");
            const orders = await collection("ordens");
            if (existingOrder) {
                const latest = orders.find(current => String(current.id) === String(existingOrder.id));
                if (!latest || orderModel(latest).status !== "Rascunho") throw new Error("A ordem deixou de ser um rascunho e não pode ser editada.");
                await saveCollection("ordens", orders.map(current => String(current.id) === String(existingOrder.id) ? order : current));
            } else {
                orders.push(order);
                await saveCollection("ordens", orders);
            }
            await ordersPage();
        });

        configureOrderSupplierFields(suppliers, supplier, existingOrder?.fornecedor_id || "");
        const list = document.getElementById("o-item-lines");
        const bindItemRow = row => {
            const productSelect = row.querySelector("[data-item-product]");
            const searchInput = row.querySelector("[data-item-search]");
            const searchCount = row.querySelector("[data-item-search-count]");
            const normalizeSearch = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
            const filterProducts = () => {
                const query = normalizeSearch(searchInput.value);
                const matches = products.filter(product => normalizeSearch([
                    product.codigo,
                    product.nome,
                    product.descricao,
                    product.ncm
                ].join(" ")).includes(query));
                [...productSelect.options].forEach(option => {
                    if (!option.value) return;
                    option.hidden = query !== "" &&
                        String(option.value) !== productSelect.value &&
                        !matches.some(product => String(product.id) === option.value);
                });
                searchCount.textContent = query
                    ? matches.length
                        ? `${matches.length} produto(s) encontrado(s). Escolha na lista.`
                        : "Nenhum produto encontrado. Tente outro termo."
                    : `${products.length} produto(s) disponível(is).`;
            };
            const updateProductDetail = product => {
                const detail = row.querySelector(".order-item-detail");
                if (!product) {
                    detail.textContent = "Selecione um produto para carregar descrição, NCM e unidade.";
                    return;
                }
                detail.textContent = `${product.descricao || product.nome} · NCM ${product.ncm || "não informado"} · ${product.unidade_medida || "UN"} · saldo ${product.estoque}`;
            };
            searchInput.addEventListener("input", filterProducts);
            productSelect.addEventListener("change", event => {
                const product = products.find(item => String(item.id) === event.currentTarget.value);
                updateProductDetail(product);
                filterProducts();
                if (!product) return;
                row.querySelector("[data-item-price]").value = String(num(product.preco || product.custo_medio));
            });
            row.querySelector(".order-item-remove").addEventListener("click", () => {
                if (list.querySelectorAll(".order-item-row").length === 1) {
                    row.remove();
                    list.insertAdjacentHTML("beforeend", orderItemRow(products));
                    bindItemRow(list.lastElementChild);
                    return;
                }
                row.remove();
            });
            if (productSelect.value) {
                const product = products.find(item => String(item.id) === productSelect.value);
                updateProductDetail(product);
            }
            filterProducts();
        };
        list.querySelectorAll(".order-item-row").forEach(bindItemRow);
        document.getElementById("o-add-item").addEventListener("click", () => {
            list.insertAdjacentHTML("beforeend", orderItemRow(products));
            bindItemRow(list.lastElementChild);
        });
    }

    openOrder = () => openCatalogOrder();
    openOrderEditor = order => openCatalogOrder(order);

    window.imprimirOrdem = async id => {
        const printWindow = window.open("", "_blank", "width=900,height=900");
        if (!printWindow) return alert("Permita pop-ups para imprimir.");
        try {
            const order = (await collection("ordens")).map(orderModel).find(item => String(item.id) === String(id));
            if (!order) {
                printWindow.close();
                return alert("Ordem não encontrada.");
            }
            const formatDate = value => {
                if (!value) return "-";
                const text = String(value);
                const brazilianDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                const date = /^\d{4}-\d{2}-\d{2}/.test(text)
                    ? new Date(`${text.slice(0, 10)}T12:00:00`)
                    : brazilianDate
                        ? new Date(`${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}T12:00:00`)
                        : new Date(text);
                return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
            };
            const orderDate = [order.data_pedido, order.data_emissao, order.data]
                .map(formatDate)
                .find(value => value !== "-") || "-";
            const subtotal = orderTotal(order);
            const freight = num(order.valor_frete);
            const saving = num(order.valor_saving);
            const total = subtotal + freight - saving;
            const rows = order.itens.map((item, index) => {
                const taxes = ["icms", "ipi", "pis", "cofins"]
                    .map(tax => `${tax.toUpperCase()} ${num(item.impostos?.[tax]).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`)
                    .join(" · ");
                return `<tr>
                    <td class="center">${index + 1}</td>
                    <td>${html(item.codigo || "-")}</td>
                    <td><strong>${html(item.descricao)}</strong><br><span class="small">NCM: ${html(item.ncm || "-")} · ${taxes}</span></td>
                    <td class="number">${num(item.qtd).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="center">${html(item.unidade_medida || "UN")}</td>
                    <td class="number">${money(item.preco)}</td>
                    <td class="number">${money(item.qtd * item.preco)}</td>
                </tr>`;
            }).join("");
            const company = order.filial_compradora;
            const supplier = order.fornecedor;
            const conditions = order.condicoes_pagamento;
            printWindow.addEventListener("load", () => setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 300), { once: true });
            printWindow.document.write(`<!doctype html>
                <html lang="pt-br">
                <head>
                    <meta charset="utf-8">
                    <title>Ordem de compra ${html(order.numero)}</title>
                    <style>
                        *{box-sizing:border-box}
                        body{color:#1f2933;font:9pt Arial,Helvetica,sans-serif;margin:0}
                        main{margin:0 auto;max-width:194mm}
                        table{border-collapse:collapse;width:100%}
                        .brand{border-bottom:2px solid #159b8e;font-size:12pt;font-weight:700;padding:0 0 5px}
                        h1{font-size:14pt;margin:8px 0;text-align:center}
                        .metadata,.buyer,.supplier,.items,.summary{margin-top:5px}
                        .metadata td,.buyer td,.supplier td{border:1px solid #9ca3af;padding:4px 5px;vertical-align:top}
                        .label{color:#4b5563;font-size:7pt}
                        .value{font-weight:600;overflow-wrap:anywhere}
                        .section-title{background:#e5e7eb;border:1px solid #9ca3af;font-weight:700;padding:4px;text-align:center}
                        .items{table-layout:fixed}
                        .items th{background:#e5e7eb;border:1px solid #6b7280;padding:5px 4px;text-align:left}
                        .items td{border:1px solid #9ca3af;padding:5px 4px;vertical-align:top;overflow-wrap:anywhere}
                        .items tbody tr:nth-child(even){background:#f3f4f6}
                        .items tr{break-inside:avoid;page-break-inside:avoid}
                        .center{text-align:center!important}
                        .number{text-align:right!important;white-space:nowrap}
                        .small{color:#4b5563;font-size:7pt}
                        .summary td{padding:3px 5px;vertical-align:top}
                        .observations{border:1px solid #9ca3af;min-height:42px;width:58%}
                        .totals{border:1px solid #9ca3af;width:42%}
                        .total-label{text-align:right}
                        .grand-total{border-top:1px solid #6b7280;font-size:11pt;font-weight:700}
                        .payment{border-top:1px solid #9ca3af;margin-top:6px;padding-top:5px}
                        .signature{break-inside:avoid;display:flex;gap:10%;justify-content:center;margin-top:24px;text-align:center}
                        .signature span{border-top:1px solid #4b5563;flex:0 1 40%;padding-top:4px}
                        thead{display:table-header-group}
                        tfoot{display:table-footer-group}
                        @page{size:A4 portrait;margin:8mm}
                        @media print{main{max-width:none}}
                    </style>
                </head>
                <body>
                    <main>
                        <div class="brand">NPC - Sistema de compras</div>
                        <h1>PEDIDO DE COMPRA</h1>
                        <table class="metadata">
                            <tr>
                                <td><span class="label">Número do pedido</span><br><span class="value">${html(order.numero)}</span></td>
                                <td><span class="label">Data do pedido</span><br><span class="value">${orderDate}</span></td>
                                <td><span class="label">Comprador</span><br><span class="value">${html(order.comprador || "-")}</span></td>
                                <td><span class="label">Unidade / destino</span><br><span class="value">${html(order.unidade || order.empresa_nome || "-")}</span></td>
                                <td><span class="label">Situação</span><br><span class="value">${html(order.status || "-")}</span></td>
                            </tr>
                            <tr>
                                <td><span class="label">Centro de resultados</span><br><span class="value">${html(order.centro_resultado || "-")}</span></td>
                                <td><span class="label">Despesa</span><br><span class="value">${html(order.despesa || "-")}</span></td>
                                <td><span class="label">Tipo de item</span><br><span class="value">${html(order.tipo_produto_servico || "-")}</span></td>
                                <td><span class="label">Emergencial</span><br><span class="value">${html(order.emergencial || "-")}</span></td>
                                <td><span class="label">Recorrência</span><br><span class="value">${html(order.recorrencia || "-")}</span></td>
                            </tr>
                        </table>
                        <div class="section-title">DADOS DA UNIDADE COMPRADORA</div>
                        <table class="buyer">
                            <tr>
                                <td><span class="label">Razão social</span><br><span class="value">${html(company.razao_social || "-")}</span></td>
                                <td><span class="label">CNPJ</span><br><span class="value">${html(company.cnpj || "-")}</span></td>
                                <td><span class="label">Inscrição estadual</span><br><span class="value">${html(company.ie || "-")}</span></td>
                            </tr>
                            <tr>
                                <td colspan="3"><span class="label">Endereço de faturamento</span><br><span class="value">${html(company.endereco_faturamento || "-")}</span></td>
                            </tr>
                            <tr>
                                <td colspan="3"><span class="label">Endereço de entrega</span><br><span class="value">${html(company.endereco_entrega || "-")}</span></td>
                            </tr>
                        </table>
                        <div class="section-title">DADOS DO FORNECEDOR</div>
                        <table class="supplier">
                            <tr>
                                <td><span class="label">Razão social</span><br><span class="value">${html(supplier.razao_social || "-")}</span></td>
                                <td><span class="label">CNPJ</span><br><span class="value">${html(supplier.cnpj || "-")}</span></td>
                                <td><span class="label">Inscrição estadual</span><br><span class="value">${html(supplier.ie || "-")}</span></td>
                            </tr>
                            <tr>
                                <td colspan="3"><span class="label">Endereço</span><br><span class="value">${html(supplier.endereco || "-")}</span></td>
                            </tr>
                        </table>
                        <table class="items">
                            <thead><tr>
                                <th style="width:5%">ITEM</th><th style="width:12%">CÓDIGO</th><th style="width:38%">DESCRIÇÃO / NCM / IMPOSTOS</th>
                                <th style="width:9%">QTDE</th><th style="width:7%">UND</th><th style="width:14%">UNITÁRIO</th><th style="width:15%">TOTAL</th>
                            </tr></thead>
                            <tbody>${rows || `<tr><td colspan="7">Nenhum item informado.</td></tr>`}</tbody>
                        </table>
                        <table class="summary">
                            <tr>
                                <td class="observations"><strong>OBSERVAÇÃO</strong><br>${html(order.observacao || order.observacoes || "-")}</td>
                                <td class="totals">
                                    <table>
                                        <tr><td class="total-label">NOTA FISCAL</td><td class="number">${html(order.nota_fiscal || "-")}</td></tr>
                                        <tr><td class="total-label">SUBTOTAL</td><td class="number">${money(subtotal)}</td></tr>
                                        <tr><td class="total-label">FRETE (${html(conditions.frete || "-")})</td><td class="number">${money(freight)}</td></tr>
                                        <tr><td class="total-label">SAVING / DESCONTO</td><td class="number">-${money(saving)}</td></tr>
                                        <tr class="grand-total"><td class="total-label">TOTAL</td><td class="number">${money(total)}</td></tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                        <div class="payment"><strong>CONDIÇÕES DE PAGAMENTO:</strong> ${html(conditions.forma || "-")} · ${html(conditions.prazo || "-")}<br>
                            <span class="small">Frete: ${html(conditions.frete || "-")} · Valor do frete: ${money(freight)} · Saving: ${money(saving)} · Impresso em: ${formatDate(new Date().toISOString())}</span>
                        </div>
                        <div class="signature"><span>Autorizado por</span><span>Fornecedor / recebimento</span></div>
                    </main>
                </body>
                </html>`);
            printWindow.document.close();
        } catch (error) {
            printWindow.close();
            console.error(error);
            alert(`Não foi possível preparar a impressão: ${error.message}`);
        }
    };

    onAuthStateChanged(auth, user => {
        if (!user) {
            appShell.hidden = true;
            loginScreen.hidden = false;
            document.getElementById("signed-in-user").textContent = "";
            document.getElementById("login-password").value = "";
            return;
        }
        const email = String(user.email || "").toLowerCase();
        const responsible = ACCOUNT_NAMES[email];
        if (!responsible) {
            loginError.textContent = "Este usuário não está autorizado a acessar o sistema.";
            signOut(auth).catch(error => {
                console.error(error);
                loginError.textContent = "Usuário não autorizado; não foi possível encerrar a sessão automaticamente.";
            });
            return;
        }
        CONTEXT.usuario_id = user.uid;
        CONTEXT.usuario_nome = responsible;
        loginScreen.hidden = true;
        appShell.hidden = false;
        document.getElementById("signed-in-user").textContent = responsible;
        loadCompanies().then(companies => {
            let selectedId = DEFAULT_CONTEXT.empresa_id;
            try { selectedId = localStorage.getItem("npc-empresa-ativa") || selectedId; }
            catch (error) { console.warn("Não foi possível recuperar a empresa selecionada neste navegador.", error); }
            activateCompany(companies.find(company => company.id === selectedId && company.ativo) || companies.find(company => company.ativo) || companies[0]);
            render("dashboard");
        }).catch(error => {
            console.error(error);
            content.innerHTML = `<div class="card empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>Não foi possível carregar as empresas</h3><p>${html(error.message)}</p></div>`;
        });
    });
});

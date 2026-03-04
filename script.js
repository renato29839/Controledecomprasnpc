import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, child } from "firebase/database";

// 1. CONFIGURAÇÃO FIREBASE (Verifique se a databaseURL termina com .firebaseio.com)
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
const db = getDatabase(app);

// Variáveis de controle globais do script
let itensTemp = [];

document.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('pt-BR');

    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');

    // === 2. FUNÇÕES DE BANCO DE DADOS ===
    const fetchData = async (path) => {
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, path));
            return snapshot.exists() ? snapshot.val() : [];
        } catch (error) {
            console.error("Erro Firebase:", error);
            return [];
        }
    };

    const saveData = async (path, data) => {
        try {
            await set(ref(db, path), data);
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao sincronizar com a nuvem.");
        }
    };

    // === 3. NAVEGAÇÃO ===
    document.addEventListener('click', async (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (menuItem) {
            e.preventDefault();
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            menuItem.classList.add('active');
            renderPage(menuItem.getAttribute('data-target'));
        }
    });

    async function renderPage(target) {
        contentArea.innerHTML = `<div class="card" style="text-align:center"><h3><i class="fa-solid fa-spinner fa-spin"></i> Carregando ${target}...</h3></div>`;
        if (target === 'dashboard') await renderDashboard();
        else if (target === 'produtos') await renderProdutos();
        else if (target === 'fornecedores') await renderFornecedores();
        else if (target === 'ordens') await renderOrdens();
    }

    // === 4. DASHBOARD ===
    async function renderDashboard() {
        pageTitle.innerText = "Dashboard";
        const [p, f, o] = await Promise.all([fetchData('produtos'), fetchData('fornecedores'), fetchData('ordens')]);
        const gastoTotal = o.reduce((sum, order) => sum + (order.total || 0), 0);
        
        contentArea.innerHTML = `
            <div class="stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                <div class="card"><h3>Produtos</h3><p class="value info" style="font-size:24px; color:var(--primary)">${p.length}</p></div>
                <div class="card"><h3>Fornecedores</h3><p class="value info" style="font-size:24px; color:var(--primary)">${f.length}</p></div>
                <div class="card"><h3>Pendentes</h3><p class="value warning" style="font-size:24px; color:orange">${o.filter(i => i.status === 'Pendente').length}</p></div>
                <div class="card"><h3>Total Compras</h3><p style="font-size:20px; font-weight:bold; color:var(--primary)">R$ ${gastoTotal.toFixed(2)}</p></div>
            </div>`;
    }

    // === 5. MÓDULO PRODUTOS ===
    async function renderProdutos(filtro = "") {
        pageTitle.innerText = "Gestão de Produtos";
        let produtos = await fetchData('produtos');
        if (filtro) produtos = produtos.filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase()));

        contentArea.innerHTML = `
            <div class="card">
                <div style="display:flex; justify-content: space-between; margin-bottom: 20px;">
                    <button class="btn-add" id="btn-novo-produto">+ Novo Produto</button>
                    <input type="text" id="search-prod" placeholder="Pesquisar..." value="${filtro}" style="padding:8px; width:250px">
                </div>
                <table class="data-table">
                    <thead><tr><th>ID</th><th>Nome</th><th>Estoque</th><th>Preço</th><th>Ações</th></tr></thead>
                    <tbody>
                        ${produtos.map(p => `<tr>
                            <td>#${p.id}</td><td>${p.nome}</td>
                            <td><b>${p.estoque}</b></td><td>R$ ${parseFloat(p.preco).toFixed(2)}</td>
                            <td>
                                <button class="edit-prod" data-id="${p.id}" style="color:blue; border:none; background:none; cursor:pointer"><i class="fa-solid fa-pen"></i></button>
                                <button class="del-prod" data-id="${p.id}" style="color:red; border:none; background:none; cursor:pointer; margin-left:10px"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;

        document.getElementById('btn-novo-produto').onclick = () => abrirModalProduto();
        document.getElementById('search-prod').oninput = (e) => renderProdutos(e.target.value);
        document.querySelectorAll('.edit-prod').forEach(btn => btn.onclick = () => abrirModalProduto(Number(btn.dataset.id)));
        document.querySelectorAll('.del-prod').forEach(btn => btn.onclick = () => excluirItem('produtos', Number(btn.dataset.id)));
    }

    // === 6. MÓDULO FORNECEDORES (CORRIGIDO) ===
    async function renderFornecedores(filtro = "") {
        pageTitle.innerText = "Gestão de Fornecedores";
        let fornecedores = await fetchData('fornecedores');
        if (filtro) fornecedores = fornecedores.filter(f => f.razaoSocial.toLowerCase().includes(filtro.toLowerCase()));

        contentArea.innerHTML = `
            <div class="card">
                <div style="display:flex; justify-content: space-between; margin-bottom: 20px;">
                    <button class="btn-add" id="btn-novo-forn">+ Novo Fornecedor</button>
                    <input type="text" id="search-forn" placeholder="Buscar..." value="${filtro}" style="padding:8px; width:250px">
                </div>
                <table class="data-table">
                    <thead><tr><th>Cód</th><th>Razão Social</th><th>CNPJ</th><th>Ações</th></tr></thead>
                    <tbody>
                        ${fornecedores.map(f => `<tr>
                            <td><b>${f.id}</b></td><td>${f.razaoSocial}</td><td>${f.cnpj}</td>
                            <td>
                                <button class="edit-forn" data-id="${f.id}" style="color:blue; border:none; background:none; cursor:pointer"><i class="fa-solid fa-pen"></i></button>
                                <button class="del-forn" data-id="${f.id}" style="color:red; border:none; background:none; cursor:pointer; margin-left:10px"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;

        document.getElementById('btn-novo-forn').onclick = () => abrirModalFornecedor();
        document.getElementById('search-forn').oninput = (e) => renderFornecedores(e.target.value);
        document.querySelectorAll('.edit-forn').forEach(btn => btn.onclick = () => abrirModalFornecedor(Number(btn.dataset.id)));
        document.querySelectorAll('.del-forn').forEach(btn => btn.onclick = () => excluirItem('fornecedores', Number(btn.dataset.id)));
    }

    // === 7. MODAIS E SALVAMENTO (ASYNC) ===
    window.abrirModalProduto = async (id = null) => {
        const produtos = await fetchData('produtos');
        const prod = id ? produtos.find(p => p.id === id) : { nome: '', estoque: '', preco: '' };
        renderBaseModal(id ? 'Editar Produto' : 'Novo Produto', `
            <input type="text" id="m-nome" placeholder="Nome" value="${prod.nome}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="number" id="m-estoque" placeholder="Estoque" value="${prod.estoque}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="number" step="0.01" id="m-preco" placeholder="Preço" value="${prod.preco}" style="width:100%; padding:10px">
        `, async () => {
            let dados = await fetchData('produtos');
            const novo = { id: id || Date.now(), nome: document.getElementById('m-nome').value, estoque: Number(document.getElementById('m-estoque').value), preco: Number(document.getElementById('m-preco').value) };
            if(id) dados = dados.map(p => p.id === id ? novo : p); else dados.push(novo);
            await saveData('produtos', dados);
            renderProdutos();
        });
    };

    window.abrirModalFornecedor = async (id = null) => {
        const fornecedores = await fetchData('fornecedores');
        const forn = id ? fornecedores.find(f => f.id === id) : { razaoSocial: '', cnpj: '', endereco: '' };
        renderBaseModal(id ? 'Editar Fornecedor' : 'Novo Fornecedor', `
            <div style="display:flex; gap:10px; margin-bottom:10px">
                <input type="text" id="m-cnpj" placeholder="CNPJ" value="${forn.cnpj}" style="flex:2; padding:10px">
                <button id="btn-puxar-cnpj" class="btn-add" style="flex:1.2; font-size:11px; background:#4a5568">Puxar Receita</button>
            </div>
            <input type="text" id="m-razao" placeholder="Razão Social" value="${forn.razaoSocial}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="m-end" placeholder="Endereço" value="${forn.endereco}" style="width:100%; padding:10px">
        `, async () => {
            let dados = await fetchData('fornecedores');
            const novo = { id: id || (dados.length > 0 ? Math.max(...dados.map(f => f.id)) + 1 : 1), razaoSocial: document.getElementById('m-razao').value, cnpj: document.getElementById('m-cnpj').value, endereco: document.getElementById('m-end').value };
            if(id) dados = dados.map(f => f.id === id ? novo : f); else dados.push(novo);
            await saveData('fornecedores', dados);
            renderFornecedores();
        });

        document.getElementById('btn-puxar-cnpj').onclick = async () => {
            const cnpj = document.getElementById('m-cnpj').value.replace(/\D/g, '');
            if(cnpj.length !== 14) return alert("CNPJ Inválido");
            try {
                const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
                const data = await res.json();
                document.getElementById('m-razao').value = data.razao_social || "";
                document.getElementById('m-end').value = `${data.logradouro}, ${data.numero} - ${data.municipio}/${data.uf}`;
            } catch (e) { alert("Erro ao consultar CNPJ."); }
        };
    };

    // Auxiliar: Modal Base
    function renderBaseModal(titulo, html, onSave) {
        const modal = `<div id="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999">
            <div class="card" style="width:420px; background:white; padding:20px; border-radius:8px">
                <h3>${titulo}</h3><br>${html}<br>
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:15px">
                    <button id="btn-m-cancel">Cancelar</button>
                    <button class="btn-add" id="btn-m-save">Salvar</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modal);
        document.getElementById('btn-m-cancel').onclick = () => document.getElementById('modal-overlay').remove();
        document.getElementById('btn-m-save').onclick = async () => { await onSave(); document.getElementById('modal-overlay').remove(); };
    }

    // === 8. ORDENS DE COMPRA (COMPLETO) ===
    async function renderOrdens() {
        pageTitle.innerText = "Ordens de Compra";
        const ordens = await fetchData('ordens');
        contentArea.innerHTML = `
            <div class="card">
                <button class="btn-add" id="btn-nova-oc" style="margin-bottom:20px">+ Nova Ordem de Compra</button>
                <table class="data-table">
                    <thead><tr><th>Nº</th><th>Fornecedor</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead>
                    <tbody>
                        ${ordens.map(o => `<tr>
                            <td>#${o.id}</td><td>${o.fornecedorNome}</td><td>R$ ${o.total.toFixed(2)}</td>
                            <td><span style="background:${o.status === 'Entregue' ? '#c6f6d5' : '#fed7d7'}; padding:4px 8px; border-radius:4px">${o.status}</span></td>
                            <td>
                                <button class="print-oc" data-id="${o.id}" style="color:green; border:none; background:none; cursor:pointer"><i class="fa-solid fa-file-pdf"></i></button>
                                <button class="del-oc" data-id="${o.id}" style="color:red; border:none; background:none; cursor:pointer; margin-left:8px"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        document.getElementById('btn-nova-oc').onclick = () => abrirModalOrdem();
        document.querySelectorAll('.del-oc').forEach(b => b.onclick = () => excluirItem('ordens', Number(b.dataset.id)));
        document.querySelectorAll('.print-oc').forEach(b => b.onclick = () => imprimirOC(Number(b.dataset.id)));
    }

    async function abrirModalOrdem(id = null) {
        const [fornecedores, produtos] = await Promise.all([fetchData('fornecedores'), fetchData('produtos')]);
        if(!fornecedores.length || !produtos.length) return alert("Cadastre dados primeiro!");
        itensTemp = [];

        const html = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
                <select id="oc-forn" style="padding:10px">
                    ${fornecedores.map(f => `<option value="${f.id}">${f.razaoSocial}</option>`).join('')}
                </select>
                <input type="date" id="oc-data" style="padding:10px">
            </div>
            <div style="background:#f9f9f9; padding:10px; border-radius:8px; display:flex; gap:10px; margin-bottom:10px">
                <select id="oc-prod" style="flex:2; padding:10px">${produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
                <input type="number" id="oc-qtd" placeholder="Qtd" style="flex:0.5; padding:10px">
                <button class="btn-add" id="btn-add-item-oc">+</button>
            </div>
            <div id="lista-itens-oc" style="max-height:150px; overflow-y:auto; font-size:12px; border:1px solid #eee; padding:5px"></div>
            <h4 id="oc-total" style="text-align:right; margin-top:10px">Total: R$ 0.00</h4>
        `;

        renderBaseModal('Nova Ordem', html, async () => {
            if(!itensTemp.length) return alert("Adicione itens!");
            let ordens = await fetchData('ordens');
            const forn = fornecedores.find(f => f.id == document.getElementById('oc-forn').value);
            const nova = {
                id: (ordens.length > 0 ? Math.max(...ordens.map(o => o.id)) + 1 : 1),
                fornecedorId: forn.id, fornecedorNome: forn.razaoSocial,
                status: 'Pendente', itens: itensTemp,
                total: itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0)
            };
            ordens.push(nova);
            await saveData('ordens', ordens);
            renderOrdens();
        });

        document.getElementById('btn-add-item-oc').onclick = () => {
            const p = produtos.find(p => p.id == document.getElementById('oc-prod').value);
            const qtd = parseInt(document.getElementById('oc-qtd').value);
            if(qtd > 0) {
                itensTemp.push({ id: p.id, nome: p.nome, preco: p.preco, qtd });
                renderItensOC();
            }
        };
    }

    function renderItensOC() {
        const div = document.getElementById('lista-itens-oc');
        div.innerHTML = itensTemp.map(i => `<div>${i.nome} - ${i.qtd}x | R$ ${(i.qtd*i.preco).toFixed(2)}</div>`).join('');
        const total = itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0);
        document.getElementById('oc-total').innerText = `Total: R$ ${total.toFixed(2)}`;
    }

    // === GERAL ===
    async function excluirItem(path, id) {
        if(confirm("Deseja excluir?")) {
            let dados = await fetchData(path);
            dados = dados.filter(d => d.id !== id);
            await saveData(path, dados);
            renderPage(path === 'produtos' ? 'produtos' : (path === 'fornecedores' ? 'fornecedores' : 'ordens'));
        }
    }

    // PDF Simplificado para teste
    async function imprimirOC(id) {
        const ordens = await fetchData('ordens');
        const o = ordens.find(x => x.id === id);
        const win = window.open('', '_blank');
        win.document.write(`<h1>Ordem de Compra #${o.id}</h1><p>Fornecedor: ${o.fornecedorNome}</p><h3>Total: R$ ${o.total.toFixed(2)}</h3>`);
        win.print();
    }

    // Início
    renderDashboard();
});

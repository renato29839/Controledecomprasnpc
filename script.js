import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, child } from "firebase/database";

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
let itensTemp = [];

document.addEventListener('DOMContentLoaded', () => {
    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('pt-BR');

    const fetchData = async (path) => {
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, path));
            return snapshot.exists() ? snapshot.val() : [];
        } catch (error) { return []; }
    };

    const saveData = async (path, data) => { await set(ref(db, path), data); };

    document.addEventListener('click', async (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (menuItem) {
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            menuItem.classList.add('active');
            renderPage(menuItem.getAttribute('data-target'));
        }
    });

    async function renderPage(target) {
        contentArea.innerHTML = `<div class="card" style="text-align:center"><h3><i class="fa-solid fa-spinner fa-spin"></i> Carregando...</h3></div>`;
        if (target === 'dashboard') await renderDashboard();
        else if (target === 'unidades') await renderUnidades();
        else if (target === 'produtos') await renderProdutos();
        else if (target === 'fornecedores') await renderFornecedores();
        else if (target === 'ordens') await renderOrdens();
    }

    async function renderDashboard() {
        pageTitle.innerText = "Dashboard Geral";
        const [p, f, o, u] = await Promise.all([fetchData('produtos'), fetchData('fornecedores'), fetchData('ordens'), fetchData('unidades')]);
        const total = o.reduce((sum, order) => sum + (order.total || 0), 0);
        contentArea.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                <div class="card"><h3>Unidades</h3><p style="font-size:24px; color:var(--primary)">${u.length}</p></div>
                <div class="card"><h3>Produtos</h3><p style="font-size:24px; color:var(--primary)">${p.length}</p></div>
                <div class="card"><h3>Ordens Emitidas</h3><p style="font-size:24px; color:var(--primary)">${o.length}</p></div>
                <div class="card"><h3>Investimento Total</h3><p style="font-size:22px; font-weight:bold; color:#20B2AA">R$ ${total.toFixed(2)}</p></div>
            </div>`;
    }

    // --- SEÇÃO DE PRODUTOS ---
    async function renderProdutos() {
        pageTitle.innerText = "Produtos";
        const produtos = await fetchData('produtos');
        contentArea.innerHTML = `<div class="card">
            <button class="btn-add" id="btn-novo-prod" style="margin-bottom:20px">+ Novo Produto</button>
            <table class="data-table"><thead><tr><th>Nome</th><th>Estoque</th><th>Preço</th><th>Ações</th></tr></thead>
            <tbody>${produtos.map(p => `<tr><td>${p.nome}</td><td>${p.estoque}</td><td>R$ ${p.preco.toFixed(2)}</td>
            <td>
                <button class="btn-edit" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-del" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-novo-prod').onclick = () => abrirModalProduto();
        document.querySelectorAll('.btn-edit').forEach(b => b.onclick = () => abrirModalProduto(Number(b.dataset.id)));
        document.querySelectorAll('.btn-del').forEach(b => b.onclick = () => excluirItem('produtos', Number(b.dataset.id)));
    }

    async function abrirModalProduto(editId = null) {
        let dados = await fetchData('produtos');
        let p = editId ? dados.find(x => x.id === editId) : { nome: '', estoque: '', preco: '' };
        renderBaseModal(editId ? 'Editar Produto' : 'Novo Produto', `
            <input type="text" id="p-nome" placeholder="Nome" value="${p.nome}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="number" id="p-estoque" placeholder="Estoque" value="${p.estoque}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="number" step="0.01" id="p-preco" placeholder="Preço" value="${p.preco}" style="width:100%; padding:10px">
        `, async () => {
            const novo = { id: editId || Date.now(), nome: document.getElementById('p-nome').value, estoque: Number(document.getElementById('p-estoque').value), preco: Number(document.getElementById('p-preco').value) };
            const atualizados = editId ? dados.map(x => x.id === editId ? novo : x) : [...dados, novo];
            await saveData('produtos', atualizados); renderProdutos();
        });
    }

    // --- SEÇÃO DE FORNECEDORES ---
    async function renderFornecedores() {
        pageTitle.innerText = "Fornecedores";
        const forn = await fetchData('fornecedores');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-novo-forn" style="margin-bottom:20px">+ Novo Fornecedor</button>
            <table class="data-table"><thead><tr><th>Razão Social</th><th>CNPJ</th><th>Ações</th></tr></thead>
            <tbody>${forn.map(f => `<tr><td>${f.razaoSocial}</td><td>${f.cnpj}</td>
            <td>
                <button class="btn-edit" data-id="${f.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-del" data-id="${f.id}"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-novo-forn').onclick = () => abrirModalFornecedor();
        document.querySelectorAll('.btn-edit').forEach(b => b.onclick = () => abrirModalFornecedor(Number(b.dataset.id)));
        document.querySelectorAll('.btn-del').forEach(b => b.onclick = () => excluirItem('fornecedores', Number(b.dataset.id)));
    }

    async function abrirModalFornecedor(editId = null) {
        let dados = await fetchData('fornecedores');
        let f = editId ? dados.find(x => x.id === editId) : { razaoSocial: '', cnpj: '', endereco: '' };
        renderBaseModal(editId ? 'Editar Fornecedor' : 'Novo Fornecedor', `
            <input type="text" id="f-cnpj" placeholder="CNPJ" value="${f.cnpj}" style="width:100%; padding:10px; margin-bottom:10px">
            <button id="btn-f-api" class="btn-add" style="width:100%; margin-bottom:10px; background:#4a5568">Consultar Receita</button>
            <input type="text" id="f-razao" placeholder="Razão Social" value="${f.razaoSocial}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="f-end" placeholder="Endereço" value="${f.endereco}" style="width:100%; padding:10px">
        `, async () => {
            const novo = { id: editId || Date.now(), razaoSocial: document.getElementById('f-razao').value, cnpj: document.getElementById('f-cnpj').value, endereco: document.getElementById('f-end').value };
            const atualizados = editId ? dados.map(x => x.id === editId ? novo : x) : [...dados, novo];
            await saveData('fornecedores', atualizados); renderFornecedores();
        });
        document.getElementById('btn-f-api').onclick = async () => {
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${document.getElementById('f-cnpj').value.replace(/\D/g, '')}`);
            const d = await res.json();
            document.getElementById('f-razao').value = d.razao_social || "";
            document.getElementById('f-end').value = `${d.logradouro}, ${d.numero} - ${d.bairro}`;
        };
    }

    // --- SEÇÃO DE ORDENS DE COMPRA ---
    async function renderOrdens() {
        pageTitle.innerText = "Ordens de Compra";
        const ordens = await fetchData('ordens');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-nova-oc" style="margin-bottom:20px">+ Gerar Ordem</button>
            <table class="data-table"><thead><tr><th>Nº</th><th>Destino</th><th>Total</th><th>Ações</th></tr></thead>
            <tbody>${ordens.map(o => `<tr><td>#${o.id}</td><td>${o.destinoNome}</td><td>R$ ${o.total.toFixed(2)}</td>
            <td>
                <button class="btn-edit" data-id="${o.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="print-oc" data-id="${o.id}" style="color:#20B2AA; border:none; background:none; cursor:pointer; margin: 0 10px;"><i class="fa-solid fa-file-pdf"></i></button>
                <button class="btn-del" data-id="${o.id}"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-nova-oc').onclick = () => abrirModalOrdem();
        document.querySelectorAll('.btn-edit').forEach(b => b.onclick = () => abrirModalOrdem(Number(b.dataset.id)));
        document.querySelectorAll('.btn-del').forEach(b => b.onclick = () => excluirItem('ordens', Number(b.dataset.id)));
        document.querySelectorAll('.print-oc').forEach(b => b.onclick = () => imprimirOC(Number(b.dataset.id)));
    }

    async function abrirModalOrdem(editId = null) {
        const [fornecedores, produtos, unidades, ordens] = await Promise.all([fetchData('fornecedores'), fetchData('produtos'), fetchData('unidades'), fetchData('ordens')]);
        let ordemEdit = editId ? ordens.find(o => o.id === editId) : null;
        itensTemp = ordemEdit ? [...ordemEdit.itens] : [];

        const html = `
            <div class="modal-scroll" style="max-height: 70vh;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div><label><b>Destino:</b></label><select id="oc-uni" style="width:100%; padding:10px; margin-top:5px">${unidades.map(u => `<option value="${u.id}" ${ordemEdit?.destinoNome === u.nomeFantasia ? 'selected' : ''}>${u.nomeFantasia}</option>`).join('')}</select></div>
                    <div><label><b>Fornecedor:</b></label><select id="oc-forn" style="width:100%; padding:10px; margin-top:5px">${fornecedores.map(f => `<option value="${f.id}" ${ordemEdit?.fornecedorNome === f.razaoSocial ? 'selected' : ''}>${f.razaoSocial}</option>`).join('')}</select></div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div><label><b>Pagamento:</b></label><input type="text" id="oc-pgto" placeholder="Ex: Boleto" value="${ordemEdit?.pagamento || ''}" style="width:100%; padding:10px; margin-top:5px"></div>
                    <div><label><b>Entrega:</b></label><input type="date" id="oc-data" value="${ordemEdit?.dataEntrega || ''}" style="width:100%; padding:10px; margin-top:5px"></div>
                </div>
                <div style="background:#f0fdfa; padding:15px; border-radius:10px; border:2px solid var(--primary); margin-bottom: 15px;">
                    <div style="display:flex; gap:10px"><select id="oc-p-sel" style="flex:3; padding:10px">${produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
                    <input type="number" id="oc-p-qtd" placeholder="Qtd" style="flex:1; padding:10px"><button id="btn-add-item" class="btn-add">Add</button></div>
                </div>
                <div id="oc-lista" style="border:1px solid #ddd; border-radius:8px; padding:15px; background:#fff;"></div>
                <h2 id="oc-total" style="text-align:right; margin-top:15px; color:var(--primary)">Total: R$ 0.00</h2>
            </div>`;

        renderBaseModal(editId ? `Editar Ordem #${editId}` : 'Nova Ordem', html, async () => {
            if(!itensTemp.length) return alert("Adicione itens!");
            const uni = unidades.find(u => u.id == document.getElementById('oc-uni').value);
            const forn = fornecedores.find(f => f.id == document.getElementById('oc-forn').value);
            const novaOrdem = { id: editId || Date.now(), destinoNome: uni.nomeFantasia, fornecedorNome: forn.razaoSocial, pagamento: document.getElementById('oc-pgto').value, dataEntrega: document.getElementById('oc-data').value, total: itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0), itens: itensTemp };
            const atualizadas = editId ? ordens.map(o => o.id === editId ? novaOrdem : o) : [...ordens, novaOrdem];
            await saveData('ordens', atualizadas); renderOrdens();
        }, "800px");

        const atualizarLista = () => {
            document.getElementById('oc-lista').innerHTML = itensTemp.map((i, idx) => `<div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #eee"><span>${i.nome} (x${i.qtd})</span><button onclick="window.removerItemOC(${idx})" style="color:red; background:none; border:none; cursor:pointer">X</button></div>`).join('');
            document.getElementById('oc-total').innerText = `Total: R$ ${itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0).toFixed(2)}`;
        };
        window.removerItemOC = (idx) => { itensTemp.splice(idx, 1); atualizarLista(); };
        document.getElementById('btn-add-item').onclick = () => {
            const p = produtos.find(x => x.id == document.getElementById('oc-p-sel').value);
            const q = Number(document.getElementById('oc-p-qtd').value);
            if(p && q > 0) { itensTemp.push({ nome: p.nome, preco: p.preco, qtd: q }); atualizarLista(); }
        };
        atualizarLista();
    }

    // --- SEÇÃO DE UNIDADES ---
    async function renderUnidades() {
        pageTitle.innerText = "Unidades (Destinos)";
        const unidades = await fetchData('unidades');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-nova-uni" style="margin-bottom:20px">+ Nova Unidade</button>
            <table class="data-table"><thead><tr><th>Unidade</th><th>Ações</th></tr></thead>
            <tbody>${unidades.map(u => `<tr><td>${u.nomeFantasia}</td><td><button class="btn-del" data-id="${u.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-nova-uni').onclick = () => renderBaseModal('Nova Unidade', `
            <input type="text" id="u-cnpj" placeholder="CNPJ" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="u-nome" placeholder="Nome Fantasia" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="u-end" placeholder="Endereço" style="width:100%; padding:10px">
        `, async () => {
            let u = await fetchData('unidades'); u.push({ id: Date.now(), nomeFantasia: document.getElementById('u-nome').value, cnpj: document.getElementById('u-cnpj').value, endereco: document.getElementById('u-end').value });
            await saveData('unidades', u); renderUnidades();
        });
    }

    // --- MODAL BASE ---
    function renderBaseModal(titulo, html, onSave, maxWidth = "500px") {
        if(document.getElementById('modal-overlay')) document.getElementById('modal-overlay').remove();
        document.body.insertAdjacentHTML('beforeend', `<div id="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:10000; padding:20px;">
            <div class="modal-container" style="width:100%; max-width:${maxWidth}; background:white; padding:30px; border-radius:15px; display:flex; flex-direction:column;">
                <h2 style="color:var(--primary); margin-bottom:20px;">${titulo}</h2>${html}
                <div style="display:flex; justify-content:flex-end; gap:15px; margin-top:25px; border-top:1px solid #eee; padding-top:20px">
                    <button id="btn-cancel" style="padding:10px 20px; cursor:pointer; border-radius:8px; border:none; background:#eee">Cancelar</button>
                    <button class="btn-add" id="btn-save" style="padding:10px 20px">Salvar</button>
                </div></div></div>`);
        document.getElementById('btn-cancel').onclick = () => document.getElementById('modal-overlay').remove();
        document.getElementById('btn-save').onclick = async () => { await onSave(); document.getElementById('modal-overlay').remove(); };
    }

    async function excluirItem(path, id) {
        if(confirm("Excluir definitivamente?")) { let d = await fetchData(path); await saveData(path, d.filter(x => x.id !== id)); renderPage(path); }
    }

    // --- IMPRESSÃO COMPACTA E OTIMIZADA ---
    async function imprimirOC(id) {
        const [ordens, fornecedores, unidades] = await Promise.all([fetchData('ordens'), fetchData('fornecedores'), fetchData('unidades')]);
        const o = ordens.find(x => x.id === id);
        const f = fornecedores.find(x => x.razaoSocial === o.fornecedorNome) || {};
        const u = unidades.find(x => x.nomeFantasia === o.destinoNome) || {};
        
        const win = window.open('', '', 'width=900,height=800');
        win.document.write(`<html><head><style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; font-size: 11px; line-height: 1.3; }
            .header-table { width: 100%; border-bottom: 3px solid #2eb8ac; margin-bottom: 10px; }
            .logo-cell { width: 120px; padding-bottom: 5px; }
            .title-cell { text-align: right; vertical-align: bottom; }
            .title-cell h1 { color: #2eb8ac; margin: 0; font-size: 22px; text-transform: uppercase; }
            .info-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc; margin-bottom: 10px; }
            .box-title { background: #2eb8ac; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-bottom: 5px; display: inline-block; font-size: 10px; }
            .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
            table.items-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            table.items-table th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #2eb8ac; color: #475569; }
            table.items-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
            .total-row { text-align: right; font-size: 16px; color: #2eb8ac; font-weight: bold; padding: 10px 0; }
            .sig-area { margin-top: 60px; display: flex; justify-content: space-around; }
            .sig-line { border-top: 1px solid #475569; width: 220px; text-align: center; padding-top: 5px; font-weight: bold; color: #475569; }
            @media print { .no-print { display: none; } }
        </style></head><body>
            <table class="header-table"><tr>
                <td class="logo-cell"><img src="https://i.postimg.cc/Wz5R0cdL/LOGONPC.png" width="100"></td>
                <td class="title-cell"><h1>Ordem de Compra</h1><p style="margin:2px 0;">Nº OC: <b>${o.id}</b> | Emissão: <b>${new Date(o.id).toLocaleDateString('pt-BR')}</b></p></td>
            </tr></table>

            <div class="info-box">
                <span class="box-title">ESTABELECIMENTO / COMPRADOR</span>
                <p style="margin:2px 0;"><b>Razão Social:</b> ${u.nomeFantasia || o.destinoNome} | <b>CNPJ:</b> ${u.cnpj || '---'}</p>
                <p style="margin:2px 0;"><b>Endereço de Entrega:</b> ${u.endereco || '---'}</p>
            </div>

            <div class="info-box">
                <span class="box-title">FORNECEDOR</span>
                <p style="margin:2px 0;"><b>Razão Social:</b> ${f.razaoSocial || o.fornecedorNome} | <b>CNPJ:</b> ${f.cnpj || '---'}</p>
                <p style="margin:2px 0;"><b>Endereço:</b> ${f.endereco || '---'}</p>
            </div>

            <div class="data-grid">
                <div class="info-box" style="margin:0"><span class="box-title">FORMA DE PAGAMENTO</span><p><b>${o.pagamento || 'A combinar'}</b></p></div>
                <div class="info-box" style="margin:0"><span class="box-title">PREVISÃO DE ENTREGA</span><p><b>${o.dataEntrega ? new Date(o.dataEntrega).toLocaleDateString('pt-BR') : 'Imediata'}</b></p></div>
            </div>

            <table class="items-table">
                <thead><tr><th style="width:50px">Item</th><th>Descrição do Produto/Serviço</th><th style="text-align:center">Qtd</th><th style="text-align:right">Preço Unit.</th><th style="text-align:right">Total</th></tr></thead>
                <tbody>${o.itens.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.nome}</td><td style="text-align:center">${i.qtd}</td><td style="text-align:right">R$ ${i.preco.toFixed(2)}</td><td style="text-align:right">R$ ${(i.qtd*i.preco).toFixed(2)}</td></tr>`).join('')}</tbody>
            </table>

            <div class="total-row">VALOR TOTAL DA ORDEM: R$ ${o.total.toFixed(2)}</div>

            <div class="sig-area">
                <div class="sig-line">Setor de Compras / Logística<br><span style="font-size:9px; font-weight:normal;">${u.nomeFantasia || o.destinoNome}</span></div>
                <div class="sig-line">Aprovação / Fornecedor<br><span style="font-size:9px; font-weight:normal;">${o.fornecedorNome}</span></div>
            </div>

            <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); };</script>
        </body></html>`);
        win.document.close();
    }

    renderDashboard();
});

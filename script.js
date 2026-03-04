import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, child } from "firebase/database";

// 1. CONFIGURAÇÃO FIREBASE
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

    // --- FUNÇÕES CORE ---
    const fetchData = async (path) => {
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, path));
            return snapshot.exists() ? snapshot.val() : [];
        } catch (error) { return []; }
    };

    const saveData = async (path, data) => {
        await set(ref(db, path), data);
    };

    // --- NAVEGAÇÃO ---
    document.addEventListener('click', async (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (menuItem) {
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            menuItem.classList.add('active');
            renderPage(menuItem.getAttribute('data-target'));
        }
    });

    async function renderPage(target) {
        contentArea.innerHTML = `<div class="card" style="text-align:center"><h3>Carregando...</h3></div>`;
        if (target === 'dashboard') await renderDashboard();
        else if (target === 'unidades') await renderUnidades();
        else if (target === 'produtos') await renderProdutos();
        else if (target === 'fornecedores') await renderFornecedores();
        else if (target === 'ordens') await renderOrdens();
    }

    // --- DASHBOARD ---
    async function renderDashboard() {
        pageTitle.innerText = "Dashboard Geral";
        const [p, f, o, u] = await Promise.all([fetchData('produtos'), fetchData('fornecedores'), fetchData('ordens'), fetchData('unidades')]);
        const total = o.reduce((sum, order) => sum + (order.total || 0), 0);
        contentArea.innerHTML = `<div class="stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
            <div class="card"><h3>Unidades</h3><p style="font-size:24px; color:var(--primary)">${u.length}</p></div>
            <div class="card"><h3>Produtos</h3><p style="font-size:24px; color:var(--primary)">${p.length}</p></div>
            <div class="card"><h3>Total Investido</h3><p style="font-size:22px; font-weight:bold; color:#20B2AA">R$ ${total.toFixed(2)}</p></div>
        </div>`;
    }

    // --- UNIDADES ---
    async function renderUnidades() {
        pageTitle.innerText = "Unidades de Destino";
        const unidades = await fetchData('unidades');
        contentArea.innerHTML = `<div class="card">
            <button class="btn-add" id="btn-nova-unidade" style="margin-bottom:20px">+ Cadastrar Unidade</button>
            <table class="data-table"><thead><tr><th>Unidade</th><th>CNPJ</th><th>Ações</th></tr></thead>
            <tbody>${unidades.map(u => `<tr><td><b>${u.nomeFantasia}</b></td><td>${u.cnpj}</td><td><button class="del-uni" data-id="${u.id}" style="color:red; border:none; background:none; cursor:pointer"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody>
            </table></div>`;
        document.getElementById('btn-nova-unidade').onclick = () => abrirModalUnidade();
        document.querySelectorAll('.del-uni').forEach(b => b.onclick = () => excluirItem('unidades', Number(b.dataset.id)));
    }

    function abrirModalUnidade() {
        renderBaseModal('Cadastrar Unidade', `
            <input type="text" id="m-u-cnpj" placeholder="CNPJ" style="width:100%; padding:10px; margin-bottom:10px">
            <button id="btn-u-api" class="btn-add" style="width:100%; margin-bottom:10px; background:#4a5568">Consultar Receita</button>
            <input type="text" id="m-u-nome" placeholder="Nome Fantasia" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="m-u-razao" placeholder="Razão Social" style="width:100%; padding:10px; margin-bottom:10px">
            <textarea id="m-u-end" placeholder="Endereço" style="width:100%; padding:10px; height:50px"></textarea>
        `, async () => {
            let dados = await fetchData('unidades');
            dados.push({ id: Date.now(), nomeFantasia: document.getElementById('m-u-nome').value, razaoSocial: document.getElementById('m-u-razao').value, cnpj: document.getElementById('m-u-cnpj').value, endereco: document.getElementById('m-u-end').value });
            await saveData('unidades', dados); renderUnidades();
        });
        document.getElementById('btn-u-api').onclick = async () => {
            const cnpj = document.getElementById('m-u-cnpj').value.replace(/\D/g, '');
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            const d = await res.json();
            document.getElementById('m-u-razao').value = d.razao_social || "";
            document.getElementById('m-u-end').value = `${d.logradouro}, ${d.numero} - ${d.bairro}, ${d.municipio}/${d.uf}`;
            document.getElementById('m-u-nome').value = d.nome_fantasia || d.razao_social;
        };
    }

    // --- PRODUTOS (COM IMPORTAÇÃO EM MASSA) ---
    async function renderProdutos() {
        pageTitle.innerText = "Produtos";
        const produtos = await fetchData('produtos');
        contentArea.innerHTML = `<div class="card">
            <div style="display:flex; gap:10px; margin-bottom:20px">
                <button class="btn-add" id="btn-novo-prod">+ Novo Produto</button>
                <button class="btn-add" id="btn-import-csv" style="background:#4a5568"><i class="fa-solid fa-file-import"></i> Importar CSV</button>
                <input type="file" id="csv-file" accept=".csv" style="display:none">
            </div>
            <table class="data-table"><thead><tr><th>Nome</th><th>Estoque</th><th>Preço</th><th>Ações</th></tr></thead>
            <tbody>${produtos.map(p => `<tr><td>${p.nome}</td><td>${p.estoque}</td><td>R$ ${p.preco.toFixed(2)}</td><td><button class="del-prod" data-id="${p.id}" style="color:red; border:none; background:none; cursor:pointer"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody>
            </table></div>`;
        
        document.getElementById('btn-novo-prod').onclick = () => abrirModalProduto();
        document.getElementById('btn-import-csv').onclick = () => document.getElementById('csv-file').click();
        document.getElementById('csv-file').onchange = (e) => importarCSV(e);
        document.querySelectorAll('.del-prod').forEach(b => b.onclick = () => excluirItem('produtos', Number(b.dataset.id)));
    }

    function abrirModalProduto() {
        renderBaseModal('Novo Produto', `<input type="text" id="p-nome" placeholder="Nome" style="width:100%; padding:10px; margin-bottom:10px"><input type="number" id="p-estoque" placeholder="Estoque" style="width:100%; padding:10px; margin-bottom:10px"><input type="number" step="0.01" id="p-preco" placeholder="Preço" style="width:100%; padding:10px">`, async () => {
            let dados = await fetchData('produtos');
            dados.push({ id: Date.now(), nome: document.getElementById('p-nome').value, estoque: Number(document.getElementById('p-estoque').value), preco: Number(document.getElementById('p-preco').value) });
            await saveData('produtos', dados); renderProdutos();
        });
    }

    async function importarCSV(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const lines = text.split('\n');
            let produtos = await fetchData('produtos');
            lines.forEach(line => {
                const cols = line.split(',');
                if (cols.length >= 3 && cols[0].trim() !== "nome") {
                    produtos.push({
                        id: Date.now() + Math.random(),
                        nome: cols[0].trim(),
                        estoque: Number(cols[1]),
                        preco: Number(cols[2])
                    });
                }
            });
            await saveData('produtos', produtos);
            renderProdutos();
            alert("Produtos importados com sucesso!");
        };
        reader.readAsText(file);
    }

    // --- FORNECEDORES ---
    async function renderFornecedores() {
        pageTitle.innerText = "Fornecedores";
        const fornecedores = await fetchData('fornecedores');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-novo-forn" style="margin-bottom:20px">+ Novo Fornecedor</button>
            <table class="data-table"><thead><tr><th>Razão Social</th><th>CNPJ</th><th>Ações</th></tr></thead>
            <tbody>${fornecedores.map(f => `<tr><td>${f.razaoSocial}</td><td>${f.cnpj}</td><td><button class="del-forn" data-id="${f.id}" style="color:red; border:none; background:none; cursor:pointer"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody>
            </table></div>`;
        document.getElementById('btn-novo-forn').onclick = () => abrirModalFornecedor();
        document.querySelectorAll('.del-forn').forEach(b => b.onclick = () => excluirItem('fornecedores', Number(b.dataset.id)));
    }

    function abrirModalFornecedor() {
        renderBaseModal('Novo Fornecedor', `
            <input type="text" id="f-cnpj" placeholder="CNPJ" style="width:100%; padding:10px; margin-bottom:10px">
            <button id="btn-f-api" class="btn-add" style="width:100%; margin-bottom:10px; background:#4a5568">Consultar Receita</button>
            <input type="text" id="f-razao" placeholder="Razão Social" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="f-end" placeholder="Endereço" style="width:100%; padding:10px">
        `, async () => {
            let dados = await fetchData('fornecedores');
            dados.push({ id: Date.now(), razaoSocial: document.getElementById('f-razao').value, cnpj: document.getElementById('f-cnpj').value, endereco: document.getElementById('f-end').value });
            await saveData('fornecedores', dados); renderFornecedores();
        });
        document.getElementById('btn-f-api').onclick = async () => {
            const cnpj = document.getElementById('f-cnpj').value.replace(/\D/g, '');
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            const d = await res.json();
            document.getElementById('f-razao').value = d.razao_social || "";
            document.getElementById('f-end').value = `${d.logradouro}, ${d.numero} - ${d.bairro}, ${d.municipio}/${d.uf}`;
        };
    }

    // --- ORDENS DE COMPRA (COM PESQUISA DE ITEM) ---
    async function renderOrdens() {
        pageTitle.innerText = "Ordens de Compra";
        const ordens = await fetchData('ordens');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-nova-oc" style="margin-bottom:20px">+ Gerar Ordem de Compra</button>
            <table class="data-table"><thead><tr><th>Nº</th><th>Destino</th><th>Fornecedor</th><th>Total</th><th>Ações</th></tr></thead>
            <tbody>${ordens.map(o => `<tr><td>#${o.id}</td><td><b>${o.destinoNome}</b></td><td>${o.fornecedorNome}</td><td>R$ ${o.total.toFixed(2)}</td>
            <td><button class="print-oc" data-id="${o.id}" style="color:#20B2AA; border:none; background:none; cursor:pointer; font-size:18px"><i class="fa-solid fa-file-pdf"></i></button><button class="del-oc" data-id="${o.id}" style="color:red; border:none; background:none; cursor:pointer; margin-left:15px"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody>
            </table></div>`;
        document.getElementById('btn-nova-oc').onclick = () => abrirModalOrdem();
        document.querySelectorAll('.del-oc').forEach(b => b.onclick = () => excluirItem('ordens', Number(b.dataset.id)));
        document.querySelectorAll('.print-oc').forEach(b => b.onclick = () => imprimirOC(Number(b.dataset.id)));
    }

    async function abrirModalOrdem() {
        const [fornecedores, produtos, unidades] = await Promise.all([fetchData('fornecedores'), fetchData('produtos'), fetchData('unidades')]);
        if(!unidades.length) return alert("Cadastre as UNIDADES primeiro!");
        itensTemp = [];
        const html = `
            <label><b>Destino:</b></label><select id="oc-uni" style="width:100%; padding:10px; margin-bottom:10px">${unidades.map(u => `<option value="${u.id}">${u.nomeFantasia}</option>`).join('')}</select>
            <label><b>Fornecedor:</b></label><select id="oc-forn" style="width:100%; padding:10px; margin-bottom:10px">${fornecedores.map(f => `<option value="${f.id}">${f.razaoSocial}</option>`).join('')}</select>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px">
                <input type="text" id="oc-pgto" placeholder="Forma Pagamento" style="padding:10px"><input type="date" id="oc-data" style="padding:10px">
            </div>
            
            <div style="background:#e6fffa; padding:15px; border-radius:8px; margin-bottom:10px; border:1px solid #20B2AA;">
                <label><b>Pesquisar Item:</b></label>
                <input type="text" id="oc-search" placeholder="Digite o nome do produto..." style="width:100%; padding:10px; margin-bottom:10px; border-radius:4px; border:1px solid #ccc">
                <div style="display:flex; gap:5px">
                    <select id="oc-p-sel" style="flex:2; padding:10px">${produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
                    <input type="number" id="oc-p-qtd" placeholder="Qtd" style="flex:0.5; padding:10px"><button id="btn-add-item" class="btn-add" style="flex:0.3">+</button>
                </div>
            </div>

            <div id="oc-lista" style="font-size:13px; max-height:100px; overflow-y:auto; margin-bottom:10px"></div>
            <h3 id="oc-total" style="text-align:right; color:#20B2AA">Total: R$ 0.00</h3>`;

        renderBaseModal('Nova Ordem de Compra', html, async () => {
            if(!itensTemp.length) return alert("Adicione itens!");
            let ordens = await fetchData('ordens');
            const uni = unidades.find(u => u.id == document.getElementById('oc-uni').value);
            const forn = fornecedores.find(f => f.id == document.getElementById('oc-forn').value);
            ordens.push({ id: Date.now(), destinoNome: uni.nomeFantasia, destinoEndereco: uni.endereco, destinoCnpj: uni.cnpj, destinoRazao: uni.razaoSocial, fornecedorNome: forn.razaoSocial, pagamento: document.getElementById('oc-pgto').value, dataEntrega: document.getElementById('oc-data').value, itens: itensTemp, total: itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0) });
            await saveData('ordens', ordens); renderOrdens();
        });

        // Lógica de pesquisa dinâmica
        const searchInput = document.getElementById('oc-search');
        const selectProd = document.getElementById('oc-p-sel');
        searchInput.oninput = () => {
            const term = searchInput.value.toLowerCase();
            const filtered = produtos.filter(p => p.nome.toLowerCase().includes(term));
            selectProd.innerHTML = filtered.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        };

        document.getElementById('btn-add-item').onclick = () => {
            const p = produtos.find(p => p.id == selectProd.value);
            const q = Number(document.getElementById('oc-p-qtd').value);
            if(p && q > 0) {
                itensTemp.push({ nome: p.nome, preco: p.preco, qtd: q });
                document.getElementById('oc-lista').innerHTML = itensTemp.map(i => `<div style="display:flex; justify-content:space-between; padding:3px; border-bottom:1px solid #eee"><span>${i.nome} (x${i.qtd})</span><b>R$ ${(i.qtd*i.preco).toFixed(2)}</b></div>`).join('');
                document.getElementById('oc-total').innerText = `Total: R$ ${itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0).toFixed(2)}`;
            }
        };
    }

    // --- IMPRESSÃO ---
    async function imprimirOC(id) {
        const ordens = await fetchData('ordens');
        const o = ordens.find(x => x.id === id);
        const win = window.open('', '', 'width=900,height=1000');
        win.document.write(`
            <html><head><title>OC ${o.id}</title>
            <style>
                body { font-family: sans-serif; margin: 0; padding: 0; color: #333; }
                .wrapper { padding: 40px; }
                .header { display: flex; justify-content: space-between; align-items: stretch; border-bottom: 4px solid #20B2AA; padding-bottom: 15px; margin-bottom: 30px; }
                .logo-side { display: flex; align-items: center; flex: 1; }
                .logo { height: 75px; width: auto; object-fit: contain; }
                .info-side { flex: 1; text-align: right; display: flex; flex-direction: column; justify-content: center; }
                .title { color: #20B2AA; font-size: 22px; font-weight: bold; margin: 0; }
                .order-meta { font-size: 12px; color: #555; margin-top: 4px; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                .info-box { border: 1px solid #eee; padding: 15px; border-radius: 5px; background: #fafafa; }
                .info-box h3 { margin-top: 0; color: #20B2AA; font-size: 13px; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 5px; }
                .info-box p { margin: 4px 0; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th { background: #20B2AA; color: white; padding: 10px; text-align: left; font-size: 12px; }
                td { padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; }
                .total-row { font-size: 16px; font-weight: bold; color: #20B2AA; text-align: right; }
                .payment-box { background: #f0fdfa; padding: 15px; border-radius: 5px; border: 1px dashed #20B2AA; margin-top: 20px; margin-bottom: 50px;}
                .footer-sigs { display: flex; justify-content: space-around; margin-top: 80px; }
                .sig-line { border-top: 1px solid #444; width: 260px; text-align: center; padding-top: 8px; font-size: 11px; font-weight: bold; }
            </style></head>
            <body><div class="wrapper">
                <div class="header">
                    <div class="logo-side"><img src="https://i.postimg.cc/Wz5R0cdL/LOGONPC.png" class="logo"></div>
                    <div class="info-side"><div class="title">ORDEM DE COMPRA</div><div class="order-meta"><b>NÚMERO DA OC:</b> #${o.id}<br><b>EMISSÃO:</b> ${new Date(o.id).toLocaleDateString('pt-BR')}</div></div>
                </div>
                <div class="info-grid">
                    <div class="info-box"><h3>COMPRADOR</h3><p><b>${o.destinoNome}</b></p><p>${o.destinoRazao || ''}</p><p>${o.destinoCnpj || ''}</p></div>
                    <div class="info-box"><h3>FORNECEDOR</h3><p><b>${o.fornecedorNome}</b></p></div>
                </div>
                <table><thead><tr><th>Descrição</th><th style="text-align:center">Qtd</th><th>Unitário</th><th>Total</th></tr></thead>
                <tbody>${o.itens.map(i => `<tr><td>${i.nome}</td><td style="text-align:center">${i.qtd}</td><td>R$ ${i.preco.toFixed(2)}</td><td>R$ ${(i.qtd*i.preco).toFixed(2)}</td></tr>`).join('')}</tbody>
                </table>
                <div class="total-row">VALOR TOTAL: R$ ${o.total.toFixed(2)}</div>
                <div class="payment-box"><p style="font-size:12px;"><b>FORMA DE PAGAMENTO:</b> ${o.pagamento || 'A DEFINIR'} | <b>ENTREGA:</b> ${o.dataEntrega || 'IMEDIATO'}</p></div>
                <div class="footer-sigs"><div class="sig-line">${o.destinoNome.toUpperCase()}</div><div class="sig-line">${o.fornecedorNome.toUpperCase()}</div></div>
            </div></body></html>
        `);
        win.document.close();
        setTimeout(() => win.print(), 500);
    }

    // --- AUXILIARES ---
    function renderBaseModal(titulo, html, onSave) {
        const modal = `<div id="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999">
            <div class="card" style="width:480px; background:white; padding:25px; border-radius:10px; max-height:90vh; overflow-y:auto">
                <h2 style="color:var(--primary); margin-top:0">${titulo}</h2><br>${html}<br>
                <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px">
                    <button id="btn-cancel" style="padding:10px 20px; border:none; background:#eee; cursor:pointer; border-radius:5px">Cancelar</button>
                    <button class="btn-add" id="btn-save">Salvar</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modal);
        document.getElementById('btn-cancel').onclick = () => document.getElementById('modal-overlay').remove();
        document.getElementById('btn-save').onclick = async () => { await onSave(); document.getElementById('modal-overlay').remove(); };
    }

    async function excluirItem(path, id) {
        if(confirm("Excluir registro?")) {
            let dados = await fetchData(path);
            dados = dados.filter(d => d.id !== id);
            await saveData(path, dados); renderPage(path);
        }
    }

    renderDashboard();
});

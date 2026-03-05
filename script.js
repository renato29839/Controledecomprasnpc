
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
let itensSaidaTemp = [];

document.addEventListener('DOMContentLoaded', () => {
    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');

    const fetchData = async (path) => {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, path));
        return snapshot.exists() ? snapshot.val() : [];
    };

    const saveData = async (path, data) => { await set(ref(db, path), data); };

    window.confirmarExclusao = async (path, id, callback) => {
        if (confirm("Deseja realmente excluir este registro?")) {
            let dados = await fetchData(path);
            dados = dados.filter(item => item.id != id);
            await saveData(path, dados);
            callback();
        }
    };

    // --- NAVEGAÇÃO ---
    document.addEventListener('click', (e) => {
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
        else if (target === 'saidas') await renderSaidas();
        else if (target === 'movimentacoes') await renderMovimentacoes();
    }

    // --- DASHBOARD ---
    async function renderDashboard() {
        pageTitle.innerText = "Resumo do Sistema";
        const [p, o, u] = await Promise.all([fetchData('produtos'), fetchData('ordens'), fetchData('unidades')]);
        const totalRecebido = o.filter(x => x.status === 'Recebida').reduce((s, i) => s + i.total, 0);
        contentArea.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
                <div class="card"><h3>Unidades</h3><p style="font-size:24px; color:#2eb8ac">${u.length}</p></div>
                <div class="card"><h3>Produtos</h3><p style="font-size:24px; color:#2eb8ac">${p.length}</p></div>
                <div class="card"><h3>Total Recebido</h3><p style="font-size:24px; color:#20B2AA">R$ ${totalRecebido.toFixed(2)}</p></div>
            </div>`;
    }

    // --- UNIDADES ---
    async function renderUnidades() {
        pageTitle.innerText = "Unidades";
        const unidades = await fetchData('unidades');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-nova-uni" style="margin-bottom:20px">+ Nova Unidade</button>
            <table class="data-table"><thead><tr><th style="text-align:left">Unidade</th><th style="text-align:left">CNPJ</th><th>Ações</th></tr></thead>
            <tbody>${unidades.map(u => `<tr><td style="text-align:left">${u.nomeFantasia}</td><td style="text-align:left">${u.cnpj}</td>
            <td>
                <button onclick="window.editarUnidade('${u.id}')" style="color:#3b82f6; background:none; border:none; cursor:pointer; margin-right:10px"><i class="fa-solid fa-pen"></i></button>
                <button onclick="window.confirmarExclusao('unidades', '${u.id}', renderUnidades)" style="color:#ef4444; background:none; border:none; cursor:pointer"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-nova-uni').onclick = () => window.editarUnidade();
    }

    window.editarUnidade = async (id = null) => {
        let unidades = await fetchData('unidades');
        const u = id ? unidades.find(x => x.id == id) : { nomeFantasia: '', cnpj: '', endereco: '' };
        renderBaseModal(id ? 'Editar Unidade' : 'Nova Unidade', `
            <input type="text" id="u-cnpj" value="${u.cnpj}" placeholder="CNPJ" style="width:100%; padding:10px; margin-bottom:10px">
            <button id="btn-u-api" class="btn-add" style="width:100%; margin-bottom:10px; background:#4a5568">Consultar Receita</button>
            <input type="text" id="u-nome" value="${u.nomeFantasia}" placeholder="Nome Fantasia" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="u-end" value="${u.endereco}" placeholder="Endereço Completo" style="width:100%; padding:10px">
        `, async () => {
            const data = { id: id || Date.now(), nomeFantasia: document.getElementById('u-nome').value, cnpj: document.getElementById('u-cnpj').value, endereco: document.getElementById('u-end').value };
            if(id) { const idx = unidades.findIndex(x => x.id == id); unidades[idx] = data; } else { unidades.push(data); }
            await saveData('unidades', unidades); renderUnidades();
        });
        document.getElementById('btn-u-api').onclick = async () => {
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${document.getElementById('u-cnpj').value.replace(/\D/g, '')}`);
            const d = await res.json();
            document.getElementById('u-nome').value = d.nome_fantasia || d.razao_social;
            document.getElementById('u-end').value = `${d.logradouro}, ${d.numero} - ${d.bairro}`;
        };
    };

    // --- FORNECEDORES ---
    async function renderFornecedores() {
        pageTitle.innerText = "Fornecedores";
        const fornecedores = await fetchData('fornecedores');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-novo-forn" style="margin-bottom:20px">+ Novo Fornecedor</button>
            <table class="data-table"><thead><tr><th style="text-align:left">Razão Social</th><th style="text-align:left">CNPJ</th><th>Ações</th></tr></thead>
            <tbody>${fornecedores.map(f => `<tr><td style="text-align:left">${f.razaoSocial}</td><td style="text-align:left">${f.cnpj}</td>
            <td>
                <button onclick="window.editarFornecedor('${f.id}')" style="color:#3b82f6; background:none; border:none; cursor:pointer; margin-right:10px"><i class="fa-solid fa-pen"></i></button>
                <button onclick="window.confirmarExclusao('fornecedores', '${f.id}', renderFornecedores)" style="color:#ef4444; background:none; border:none; cursor:pointer"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-novo-forn').onclick = () => window.editarFornecedor();
    }

    window.editarFornecedor = async (id = null) => {
        let f = await fetchData('fornecedores');
        const forn = id ? f.find(x => x.id == id) : { razaoSocial: '', cnpj: '', endereco: '' };
        renderBaseModal(id ? 'Editar Fornecedor' : 'Novo Fornecedor', `
            <input type="text" id="f-cnpj" value="${forn.cnpj}" placeholder="CNPJ" style="width:100%; padding:10px; margin-bottom:10px">
            <button id="btn-f-api" class="btn-add" style="width:100%; margin-bottom:10px; background:#4a5568">Consultar Receita</button>
            <input type="text" id="f-razao" value="${forn.razaoSocial}" placeholder="Razão Social" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="f-end" value="${forn.endereco}" placeholder="Endereço" style="width:100%; padding:10px">
        `, async () => {
            const data = { id: id || Date.now(), razaoSocial: document.getElementById('f-razao').value, cnpj: document.getElementById('f-cnpj').value, endereco: document.getElementById('f-end').value };
            if(id) { const idx = f.findIndex(x => x.id == id); f[idx] = data; } else { f.push(data); }
            await saveData('fornecedores', f); renderFornecedores();
        });
        document.getElementById('btn-f-api').onclick = async () => {
            const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${document.getElementById('f-cnpj').value.replace(/\D/g, '')}`);
            const d = await res.json();
            document.getElementById('f-razao').value = d.razao_social;
            document.getElementById('f-end').value = `${d.logradouro}, ${d.numero} - ${d.bairro}`;
        };
    };

    // --- PRODUTOS ---
    async function renderProdutos() {
        pageTitle.innerText = "Produtos";
        const produtos = await fetchData('produtos');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-novo-prod" style="margin-bottom:20px">+ Novo Produto</button>
            <table class="data-table"><thead><tr><th style="text-align:left">Nome</th><th style="text-align:left">Estoque</th><th style="text-align:left">Preço</th><th>Ações</th></tr></thead>
            <tbody>${produtos.map(p => `<tr><td style="text-align:left">${p.nome}</td><td style="text-align:left">${p.estoque}</td><td style="text-align:left">R$ ${p.preco.toFixed(2)}</td>
            <td>
                <button onclick="window.editarProduto('${p.id}')" style="color:#3b82f6; background:none; border:none; cursor:pointer; margin-right:10px"><i class="fa-solid fa-pen"></i></button>
                <button onclick="window.confirmarExclusao('produtos', '${p.id}', renderProdutos)" style="color:#ef4444; background:none; border:none; cursor:pointer"><i class="fa-solid fa-trash"></i></button>
            </td></tr>`).join('')}</tbody></table></div>`;
        document.getElementById('btn-novo-prod').onclick = () => window.editarProduto();
    }

    window.editarProduto = async (id = null) => {
        let p = await fetchData('produtos');
        const prod = id ? p.find(x => x.id == id) : { nome: '', estoque: 0, preco: 0 };
        renderBaseModal(id ? 'Editar Produto' : 'Novo Produto', `
            <input type="text" id="p-nome" value="${prod.nome}" style="width:100%; padding:10px; margin-bottom:10px" placeholder="Nome">
            <input type="number" id="p-estoque" value="${prod.estoque}" style="width:100%; padding:10px; margin-bottom:10px" placeholder="Estoque">
            <input type="number" step="0.01" id="p-preco" value="${prod.preco}" style="width:100%; padding:10px" placeholder="Preço">
        `, async () => {
            const data = { id: id || Date.now(), nome: document.getElementById('p-nome').value, estoque: Number(document.getElementById('p-estoque').value), preco: Number(document.getElementById('p-preco').value) };
            if(id) { const idx = p.findIndex(x => x.id == id); p[idx] = data; } else { p.push(data); }
            await saveData('produtos', p); renderProdutos();
        });
    };

    // --- ORDENS DE COMPRA ---
    async function renderOrdens() {
        pageTitle.innerText = "Ordens de Compra";
        const ordens = await fetchData('ordens');
        contentArea.innerHTML = `<div class="card"><button class="btn-add" id="btn-nova-oc" style="margin-bottom:20px">+ Gerar Ordem</button>
            <table class="data-table"><thead><tr><th style="text-align:left">Nº</th><th style="text-align:left">Destino</th><th style="text-align:left">Status</th><th style="text-align:left">Total</th><th>Ações</th></tr></thead>
            <tbody>${ordens.map(o => {
                const color = o.status === 'Recebida' ? '#2eb8ac' : o.status === 'Aprovada' ? '#3b82f6' : o.status === 'Cancelada' ? '#ef4444' : '#f59e0b';
                return `<tr><td style="text-align:left">#${o.id}</td><td style="text-align:left">${o.destinoNome}</td>
                <td style="text-align:left"><span style="background:${color}; color:white; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:bold">${o.status || 'Pendente'}</span></td>
                <td style="text-align:left">R$ ${o.total.toFixed(2)}</td>
                <td>
                    <select onchange="window.atualizarStatusOC('${o.id}', this.value)" style="padding:4px; font-size:11px" ${o.status === 'Recebida' ? 'disabled' : ''}>
                        <option value="Pendente" ${o.status==='Pendente'?'selected':''}>Pendente</option>
                        <option value="Aprovada" ${o.status==='Aprovada'?'selected':''}>Aprovada</option>
                        <option value="Recebida" ${o.status==='Recebida'?'selected':''}>Recebida</option>
                        <option value="Cancelada" ${o.status==='Cancelada'?'selected':''}>Cancelada</option>
                    </select>
                    <button onclick="window.imprimirOC('${o.id}')" style="color:#20B2AA; border:none; background:none; cursor:pointer; margin-left:8px"><i class="fa-solid fa-print"></i></button>
                    <button onclick="window.confirmarExclusao('ordens', '${o.id}', renderOrdens)" style="color:#ef4444; background:none; border:none; cursor:pointer; margin-left:8px"><i class="fa-solid fa-trash"></i></button>
                </td></tr>`}).join('')}</tbody></table></div>`;
        document.getElementById('btn-nova-oc').onclick = () => window.abrirModalOrdem();
    }

    window.atualizarStatusOC = async (id, novoStatus) => {
        let ordens = await fetchData('ordens');
        let produtos = await fetchData('produtos');
        let movs = await fetchData('movimentacoes');
        const idx = ordens.findIndex(o => o.id == id);
        
        if (novoStatus === 'Recebida' && ordens[idx].status !== 'Recebida') {
            ordens[idx].itens.forEach(item => {
                const pIdx = produtos.findIndex(p => p.nome === item.nome);
                if (pIdx !== -1) {
                    produtos[pIdx].estoque = Number(produtos[pIdx].estoque) + Number(item.qtd);
                    movs.push({ data: Date.now(), tipo: 'ENTRADA', produto: item.nome, qtd: item.qtd, origem: `OC #${id} - ${ordens[idx].destinoNome}` });
                }
            });
            await Promise.all([saveData('produtos', produtos), saveData('movimentacoes', movs)]);
        }
        ordens[idx].status = novoStatus;
        await saveData('ordens', ordens); renderOrdens();
    };

    window.abrirModalOrdem = async () => {
        const [fornecedores, produtos, unidades, ordens] = await Promise.all([fetchData('fornecedores'), fetchData('produtos'), fetchData('unidades'), fetchData('ordens')]);
        itensTemp = [];
        renderBaseModal('Nova Ordem de Compra', `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
                <select id="oc-uni" style="padding:10px">${unidades.map(u => `<option value="${u.id}">${u.nomeFantasia}</option>`).join('')}</select>
                <select id="oc-forn" style="padding:10px">${fornecedores.map(f => `<option value="${f.id}">${f.razaoSocial}</option>`).join('')}</select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
                <input type="text" id="oc-pag" placeholder="Pagamento (Ex: Boleto 30d)" style="padding:10px">
                <input type="text" id="oc-prazo" placeholder="Prazo de Entrega" style="padding:10px">
            </div>
            <div style="background:#f0fdfa; padding:10px; border:1px solid #2eb8ac; border-radius:8px; margin-bottom:10px">
                <input type="text" id="p-search" placeholder="🔍 Pesquisar produto..." style="width:100%; padding:10px; margin-bottom:10px">
                <div style="display:flex; gap:5px">
                    <select id="oc-p-sel" style="flex:3; padding:10px">${produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
                    <input type="number" id="oc-p-qtd" placeholder="Qtd" style="flex:1; padding:10px">
                    <button id="btn-add-item" class="btn-add">Add</button>
                </div>
            </div>
            <div id="oc-lista" style="max-height:150px; overflow-y:auto; border:1px solid #eee; padding:10px; font-size:12px"></div>
            <h3 id="oc-total" style="text-align:right">Total: R$ 0.00</h3>
        `, async () => {
            const uni = unidades.find(u => u.id == document.getElementById('oc-uni').value);
            const forn = fornecedores.find(f => f.id == document.getElementById('oc-forn').value);
            ordens.push({ 
                id: Date.now(), 
                destinoNome: uni.nomeFantasia, 
                destinoEnd: uni.endereco || 'Endereço não cadastrado',
                destinoCnpj: uni.cnpj || '---',
                fornecedorNome: forn.razaoSocial, 
                fornecedorEnd: forn.endereco || 'Endereço não cadastrado',
                fornecedorCnpj: forn.cnpj || '---',
                formaPagamento: document.getElementById('oc-pag').value, 
                prazoEntrega: document.getElementById('oc-prazo').value,
                status: 'Pendente', 
                total: itensTemp.reduce((s,i)=>s+(i.qtd*i.preco),0), 
                itens: itensTemp 
            });
            await saveData('ordens', ordens); renderOrdens();
        }, "750px");

        document.getElementById('p-search').oninput = (e) => {
            const f = produtos.filter(p => p.nome.toLowerCase().includes(e.target.value.toLowerCase()));
            document.getElementById('oc-p-sel').innerHTML = f.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        };
        document.getElementById('btn-add-item').onclick = () => {
            const p = produtos.find(x => x.id == document.getElementById('oc-p-sel').value);
            const q = Number(document.getElementById('oc-p-qtd').value);
            if(p && q > 0) { 
                itensTemp.push({nome: p.nome, preco: p.preco, qtd: q}); 
                document.getElementById('oc-lista').innerHTML = itensTemp.map(i=>`<div>${i.nome} (x${i.qtd})</div>`).join('');
                document.getElementById('oc-total').innerText = `Total: R$ ${itensTemp.reduce((s,i)=>s+(i.qtd*i.preco),0).toFixed(2)}`;
            }
        };
    };

    // --- SAÍDAS DE ESTOQUE ---
    async function renderSaidas() {
        pageTitle.innerText = "Saída de Material (Consumo)";
        const [produtos, unidades] = await Promise.all([fetchData('produtos'), fetchData('unidades')]);
        itensSaidaTemp = [];
        contentArea.innerHTML = `<div class="card"><div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px">
            <div style="background:#f8fafc; padding:20px; border-radius:10px">
                <label><b>Unidade Destino:</b></label><select id="out-uni" style="width:100%; padding:10px; margin-bottom:20px">${unidades.map(u => `<option value="${u.id}">${u.nomeFantasia}</option>`).join('')}</select>
                <div style="background:white; padding:15px; border:1px solid #2eb8ac; border-radius:8px">
                    <input type="text" id="out-search" placeholder="🔍 Buscar produto..." style="width:100%; padding:10px; margin-bottom:10px">
                    <select id="out-prod-sel" style="width:100%; padding:10px; margin-bottom:10px">${produtos.map(p => `<option value="${p.id}">${p.nome} (Saldo: ${p.estoque})</option>`).join('')}</select>
                    <div style="display:flex; gap:10px"><input type="number" id="out-qtd" placeholder="Qtd" style="flex:1; padding:10px"><button id="btn-add-saida" class="btn-add" style="flex:1">+ Adicionar</button></div>
                </div>
            </div>
            <div style="background:white; border:1px solid #eee; padding:15px; border-radius:10px">
                <h4>Itens para Saída</h4><div id="lista-saida-review" style="min-height:100px; text-align:left; font-size:12px"></div>
                <button id="btn-finalizar-saida" class="btn-add" style="width:100%; background:#ef4444; margin-top:15px">Confirmar Baixa</button>
            </div>
        </div></div>`;
        document.getElementById('out-search').oninput = (e) => {
            const f = produtos.filter(p => p.nome.toLowerCase().includes(e.target.value.toLowerCase()));
            document.getElementById('out-prod-sel').innerHTML = f.map(p => `<option value="${p.id}">${p.nome} (Saldo: ${p.estoque})</option>`).join('');
        };
        document.getElementById('btn-add-saida').onclick = () => {
            const p = produtos.find(x => x.id == document.getElementById('out-prod-sel').value);
            const q = Number(document.getElementById('out-qtd').value);
            if(p && q > 0 && p.estoque >= q) {
                itensSaidaTemp.push({ id: p.id, nome: p.nome, qtd: q });
                document.getElementById('lista-saida-review').innerHTML = itensSaidaTemp.map(i => `<div>${i.nome} (x${i.qtd})</div>`).join('');
            } else { alert("Estoque insuficiente!"); }
        };
        document.getElementById('btn-finalizar-saida').onclick = async () => {
            if(itensSaidaTemp.length === 0) return;
            let p = await fetchData('produtos'); let m = await fetchData('movimentacoes'); const u = unidades.find(un => un.id == document.getElementById('out-uni').value);
            itensSaidaTemp.forEach(item => { const idx = p.findIndex(x => x.id == item.id); p[idx].estoque -= item.qtd; m.push({ data: Date.now(), tipo: 'SAÍDA', produto: item.nome, qtd: item.qtd, origem: `Consumo: ${u.nomeFantasia}` }); });
            await Promise.all([saveData('produtos', p), saveData('movimentacoes', m)]); alert("Saída realizada!"); renderPage('movimentacoes');
        };
    }

    // --- MOVIMENTAÇÕES ---
    async function renderMovimentacoes() {
        pageTitle.innerText = "Histórico de Movimentações";
        const movs = await fetchData('movimentacoes');
        contentArea.innerHTML = `<div class="card"><table class="data-table"><thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Tipo</th><th style="text-align:left">Produto</th><th style="text-align:left">Qtd</th><th style="text-align:left">Origem/Destino</th></tr></thead>
        <tbody>${movs.reverse().map(m => `<tr><td style="text-align:left">${new Date(m.data).toLocaleString()}</td><td style="text-align:left; color:${m.tipo==='ENTRADA'?'green':'red'}; font-weight:bold">${m.tipo}</td><td style="text-align:left">${m.produto}</td><td style="text-align:left">${m.qtd}</td><td style="text-align:left">${m.origem}</td></tr>`).join('')}</tbody></table></div>`;
    }

    // --- IMPRESSÃO PROFISSIONAL (COM ENDEREÇOS CORRIGIDOS) ---
    window.imprimirOC = async (id) => {
        const ordens = await fetchData('ordens');
        const o = ordens.find(x => x.id == id);
        
        const win = window.open('', '', 'width=900,height=800');
        win.document.write(`<html><head><style>
            @page { size: portrait; margin: 12mm; }
            body { font-family: 'Segoe UI', sans-serif; color: #333; margin: 0; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2eb8ac; padding-bottom: 10px; margin-bottom: 15px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
            .info-box { border: 1px solid #e2e8f0; padding: 8px; border-radius: 5px; background: #f8fafc; font-size: 10px; }
            .label { font-size: 8px; font-weight: bold; color: #2eb8ac; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; display: block; margin-bottom: 3px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f1f5f9; font-size: 10px; padding: 6px; border-bottom: 2px solid #2eb8ac; text-align: left; }
            td { padding: 6px; border-bottom: 1px solid #f1f5f9; font-size: 9px; }
            .total-final { font-size: 16px; color: #2eb8ac; font-weight: bold; text-align: right; margin-top: 15px; }
            .sig { margin-top: 50px; display: flex; justify-content: space-around; }
            .sig-line { border-top: 1px solid #94a3b8; width: 200px; text-align: center; font-size: 9px; padding-top: 3px; }
        </style></head><body>
            <div class="header"><img src="https://i.postimg.cc/mD3m8vS0/npc-logo.png" width="120">
            <div style="text-align:right"><h1 style="color:#2eb8ac; margin:0; font-size:20px">ORDEM DE COMPRA</h1><p style="font-size:10px">#${o.id} | ${new Date(o.id).toLocaleDateString()}</p></div></div>
            
            <div class="info-grid">
                <div class="info-box">
                    <span class="label">Comprador (Destino)</span>
                    <b>${o.destinoNome}</b><br>
                    CNPJ: ${o.destinoCnpj}<br>
                    Endereço: ${o.destinoEnd}
                </div>
                <div class="info-box">
                    <span class="label">Fornecedor</span>
                    <b>${o.fornecedorNome}</b><br>
                    CNPJ: ${o.fornecedorCnpj}<br>
                    Endereço: ${o.fornecedorEnd}
                </div>
            </div>

            <div class="info-grid">
                <div class="info-box"><span class="label">Condições de Pagamento</span><b>${o.formaPagamento || '---'}</b></div>
                <div class="info-box"><span class="label">Prazo de Entrega</span><b>${o.prazoEntrega || '---'}</b></div>
            </div>

            <table><thead><tr><th>#</th><th>Descrição</th><th style="width:40px">Qtd</th><th style="width:80px">Unit</th><th style="width:80px">Total</th></tr></thead>
            <tbody>${o.itens.map((i,idx)=>`<tr><td>${idx+1}</td><td>${i.nome.toUpperCase()}</td><td>${i.qtd}</td><td>R$ ${i.preco.toFixed(2)}</td><td>R$ ${(i.qtd*i.preco).toFixed(2)}</td></tr>`).join('')}</tbody></table>
            
            <div class="total-final">TOTAL DA ORDEM: R$ ${o.total.toFixed(2)}</div>
            
            <div class="sig">
                <div class="sig-line">SOLICITANTE / COMPRAS</div>
                <div class="sig-line">APROVAÇÃO DIRETORIA</div>
            </div>
            <script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},500);};</script></body></html>`);
        win.document.close();
    };

    function renderBaseModal(titulo, html, onSave, maxWidth = "500px") {
        if(document.getElementById('modal-overlay')) document.getElementById('modal-overlay').remove();
        document.body.insertAdjacentHTML('beforeend', `<div id="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:10000; padding:20px;">
            <div style="width:100%; max-width:${maxWidth}; background:white; padding:30px; border-radius:15px;">
                <h2 style="color:#2eb8ac; text-align:left; margin-bottom:15px">${titulo}</h2>${html}
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px">
                    <button id="btn-cancel" style="padding:10px 20px; border:none; background:#eee; cursor:pointer; border-radius:5px">Cancelar</button>
                    <button class="btn-add" id="btn-save">Emitir Ordem</button>
                </div></div></div>`);
        document.getElementById('btn-cancel').onclick = () => document.getElementById('modal-overlay').remove();
        document.getElementById('btn-save').onclick = async () => { await onSave(); document.getElementById('modal-overlay').remove(); };
    }

    renderDashboard();
});


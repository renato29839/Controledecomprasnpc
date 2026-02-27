document.addEventListener('DOMContentLoaded', () => {
    // === 1. CONFIGURAÇÕES E DATA ===
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('pt-BR');

    const contentArea = document.getElementById('content-area');
    const pageTitle = document.getElementById('page-title');

    // === 2. BANCO DE DADOS (LocalStorage) ===
    const getProdutos = () => JSON.parse(localStorage.getItem('produtos-npc')) || [];
    const saveProdutos = (p) => localStorage.setItem('produtos-npc', JSON.stringify(p));
    
    const getFornecedores = () => JSON.parse(localStorage.getItem('fornecedores-npc')) || [];
    const saveFornecedores = (f) => localStorage.setItem('fornecedores-npc', JSON.stringify(f));

    const getOrdens = () => JSON.parse(localStorage.getItem('ordens-npc')) || [];
    const saveOrdens = (o) => localStorage.setItem('ordens-npc', JSON.stringify(o));

    // === 3. NAVEGAÇÃO ===
    document.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (menuItem) {
            e.preventDefault();
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            menuItem.classList.add('active');
            renderPage(menuItem.getAttribute('data-target'));
        }
    });

    function renderPage(target) {
        if (target === 'dashboard') renderDashboard();
        else if (target === 'produtos') renderProdutos();
        else if (target === 'fornecedores') renderFornecedores();
        else if (target === 'ordens') renderOrdens();
    }

    // === 4. DASHBOARD ===
    function renderDashboard() {
        pageTitle.innerText = "Dashboard";
        const o = getOrdens();
        const gastoTotal = o.reduce((sum, order) => sum + order.total, 0);
        contentArea.innerHTML = `
            <div class="stats-grid">
                <div class="card"><h3>Produtos</h3><p class="value info">${getProdutos().length}</p></div>
                <div class="card"><h3>Fornecedores</h3><p class="value info">${getFornecedores().length}</p></div>
                <div class="card"><h3>Ordens Pendentes</h3><p class="value warning">${o.filter(i => i.status === 'Pendente').length}</p></div>
                <div class="card"><h3>Total Compras</h3><p class="value info">R$ ${gastoTotal.toFixed(2)}</p></div>
            </div>`;
    }

    // === 5. MÓDULO PRODUTOS ===
    function renderProdutos(filtro = "") {
        pageTitle.innerText = "Gestão de Produtos";
        const produtos = getProdutos().filter(p => p.nome.toLowerCase().includes(filtro.toLowerCase()));
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
                                <button onclick="abrirModalProduto(${p.id})" style="color:blue; border:none; background:none; cursor:pointer"><i class="fa-solid fa-pen"></i></button>
                                <button onclick="excluirItem('produto', ${p.id})" style="color:red; border:none; background:none; cursor:pointer; margin-left:10px"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        document.getElementById('search-prod').oninput = (e) => renderProdutos(e.target.value);
        document.getElementById('btn-novo-produto').onclick = () => abrirModalProduto();
    }

    // === 6. MÓDULO FORNECEDORES (COM API CNPJ) ===
    function renderFornecedores(filtro = "") {
        pageTitle.innerText = "Gestão de Fornecedores";
        const fornecedores = getFornecedores().filter(f => f.razaoSocial.toLowerCase().includes(filtro.toLowerCase()));
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
                                <button onclick="abrirModalFornecedor(${f.id})" style="color:blue; border:none; background:none; cursor:pointer"><i class="fa-solid fa-pen"></i></button>
                                <button onclick="excluirItem('fornecedor', ${f.id})" style="color:red; border:none; background:none; cursor:pointer; margin-left:10px"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        document.getElementById('search-forn').oninput = (e) => renderFornecedores(e.target.value);
        document.getElementById('btn-novo-forn').onclick = () => abrirModalFornecedor();
    }

    // FUNÇÃO PARA BUSCAR CNPJ NA API (RECEITA FEDERAL)
    window.buscarCNPJ = async () => {
        const cnpjInput = document.getElementById('m-cnpj');
        const cnpj = cnpjInput.value.replace(/\D/g, '');
        
        if (cnpj.length !== 14) return alert("Digite um CNPJ válido com 14 dígitos.");

        const btn = document.getElementById('btn-api');
        const originalText = btn.innerText;
        btn.innerText = "Consultando...";
        btn.disabled = true;

        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (!response.ok) throw new Error("CNPJ não encontrado");
            const data = await response.json();

            document.getElementById('m-razao').value = data.razao_social || "";
            document.getElementById('m-end').value = `${data.logradouro || ""}, ${data.numero || ""} - ${data.bairro || ""}, ${data.municipio || ""}/${data.uf || ""}`;
            
        } catch (error) {
            alert("Erro ao consultar CNPJ. Verifique o número ou tente novamente mais tarde.");
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    // === 7. MODAIS ===
    window.abrirModalProduto = (id = null) => {
        const prod = id ? getProdutos().find(p => p.id === id) : { nome: '', estoque: '', preco: '' };
        renderModal('Produto', id, `
            <input type="text" id="m-nome" placeholder="Nome" value="${prod.nome}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="number" id="m-estoque" placeholder="Estoque" value="${prod.estoque}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="number" step="0.01" id="m-preco" placeholder="Preço" value="${prod.preco}" style="width:100%; padding:10px">
        `, 'salvarProduto');
    };

    window.abrirModalFornecedor = (id = null) => {
        const forn = id ? getFornecedores().find(f => f.id === id) : { razaoSocial: '', cnpj: '', endereco: '' };
        renderModal('Fornecedor', id, `
            <div style="display:flex; gap:10px; margin-bottom:10px">
                <input type="text" id="m-cnpj" placeholder="CNPJ (Somente números)" value="${forn.cnpj}" style="flex:2; padding:10px">
                <button id="btn-api" onclick="buscarCNPJ()" class="btn-add" style="flex:1.2; font-size:11px; background:#4a5568">Puxar Receita</button>
            </div>
            <input type="text" id="m-razao" placeholder="Razão Social" value="${forn.razaoSocial}" style="width:100%; padding:10px; margin-bottom:10px">
            <input type="text" id="m-end" placeholder="Endereço Completo" value="${forn.endereco}" style="width:100%; padding:10px">
        `, 'salvarFornecedor');
    };

    // === 8. ORDENS DE COMPRA (MODELO HARMONIZADO) ===
    let itensTemp = [];

    window.abrirModalOrdem = (id = null) => {
        const fornecedores = getFornecedores();
        const produtos = getProdutos();
        if(!fornecedores.length || !produtos.length) return alert("Cadastre produtos e fornecedores primeiro!");

        const ordem = id ? getOrdens().find(o => o.id === id) : null;
        itensTemp = ordem ? [...ordem.itens] : [];

        const modalHtml = `
            <div id="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999">
                <div class="card" style="width:750px; background:white; padding:25px; border-radius:8px; max-height:90vh; overflow-y:auto">
                    <h3>${id ? 'Editar' : 'Nova'} Ordem de Compra</h3><br>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px">
                        <select id="oc-forn" style="padding:10px">
                            ${fornecedores.map(f => `<option value="${f.id}" ${ordem && ordem.fornecedorId == f.id ? 'selected' : ''}>${f.razaoSocial}</option>`).join('')}
                        </select>
                        <input type="date" id="oc-data" value="${ordem ? ordem.dataEntrega : ''}" style="padding:10px">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px">
                        <input type="text" id="oc-pgto" placeholder="Condição de Pagamento" value="${ordem ? ordem.pagamento : ''}" style="padding:10px">
                        <select id="oc-status" style="padding:10px">
                            <option value="Pendente" ${ordem?.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                            <option value="Entregue" ${ordem?.status === 'Entregue' ? 'selected' : ''}>Entregue</option>
                        </select>
                    </div>
                    <div style="background:#f4f4f4; padding:15px; border-radius:8px; display:flex; gap:10px; margin-bottom:15px">
                        <select id="oc-prod-sel" style="flex:2; padding:10px">
                            ${produtos.map(p => `<option value="${p.id}">${p.nome} - R$ ${p.preco}</option>`).join('')}
                        </select>
                        <input type="number" id="oc-qtd" placeholder="Qtd" style="flex:0.5; padding:10px">
                        <button class="btn-add" onclick="adicionarItemOC()">+</button>
                    </div>
                    <table class="data-table">
                        <thead><tr><th>Item</th><th>Qtd</th><th>Subtotal</th><th>X</th></tr></thead>
                        <tbody id="corpo-itens-oc"></tbody>
                    </table>
                    <div style="text-align:right; margin-top:20px">
                        <h2 id="oc-total-display">Total: R$ 0.00</h2><br>
                        <button onclick="document.getElementById('modal-overlay').remove()">Cancelar</button>
                        <button class="btn-add" onclick="finalizarOrdem(${id})">Gravar Ordem</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        atualizarTabelaItens();
    };

    function renderOrdens() {
        pageTitle.innerText = "Ordens de Compra";
        const ordens = getOrdens();
        contentArea.innerHTML = `
            <div class="card">
                <div style="display:flex; justify-content: space-between; margin-bottom: 20px;">
                    <button class="btn-add" id="btn-nova-oc">+ Nova Ordem de Compra</button>
                </div>
                <table class="data-table">
                    <thead><tr><th>Nº OC</th><th>Fornecedor</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead>
                    <tbody>
                        ${ordens.map(o => `<tr>
                            <td><b>#${o.id}</b></td><td>${o.fornecedorNome}</td>
                            <td>R$ ${o.total.toFixed(2)}</td>
                            <td><span style="background:${o.status === 'Entregue' ? '#c6f6d5' : '#fed7d7'}; padding:4px 8px; border-radius:4px; font-size:12px">${o.status}</span></td>
                            <td>
                                <button onclick="imprimirOC(${o.id})" title="Gerar PDF" style="color:green; border:none; background:none; cursor:pointer"><i class="fa-solid fa-file-pdf"></i></button>
                                <button onclick="abrirModalOrdem(${o.id})" title="Editar" style="color:blue; border:none; background:none; cursor:pointer; margin-left:8px"><i class="fa-solid fa-pen"></i></button>
                                <button onclick="excluirOrdem(${o.id})" title="Excluir" style="color:red; border:none; background:none; cursor:pointer; margin-left:8px"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        document.getElementById('btn-nova-oc').onclick = () => abrirModalOrdem();
    }

    // === 9. LOGICA DE SALVAMENTO E AUXILIARES ===
    function renderModal(titulo, id, campos, funcaoSalvar) {
        const modal = `<div id="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999">
            <div class="card" style="width:450px; background:white; padding:20px; border-radius:8px">
                <h3>${id ? 'Editar' : 'Novo'} ${titulo}</h3><br>${campos}<br><br>
                <div style="display:flex; justify-content:flex-end; gap:10px">
                    <button onclick="document.getElementById('modal-overlay').remove()">Cancelar</button>
                    <button class="btn-add" onclick="window.${funcaoSalvar}(${id})">Salvar</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modal);
    }

    window.adicionarItemOC = () => {
        const idProd = document.getElementById('oc-prod-sel').value;
        const qtd = parseInt(document.getElementById('oc-qtd').value);
        if(!qtd || qtd <= 0) return alert("Qtd inválida");
        const produto = getProdutos().find(p => p.id == idProd);
        const existente = itensTemp.find(i => i.id == idProd);
        if(existente) existente.qtd += qtd;
        else itensTemp.push({ id: produto.id, nome: produto.nome, preco: produto.preco, qtd: qtd });
        atualizarTabelaItens();
    };

    window.removerItemOC = (id) => { itensTemp = itensTemp.filter(i => i.id != id); atualizarTabelaItens(); };

    function atualizarTabelaItens() {
        const corpo = document.getElementById('corpo-itens-oc');
        let total = 0;
        if(!corpo) return;
        corpo.innerHTML = itensTemp.map(i => {
            const sub = i.qtd * i.preco; total += sub;
            return `<tr><td>${i.nome}</td><td>${i.qtd}</td><td>R$ ${sub.toFixed(2)}</td>
            <td><button onclick="removerItemOC(${i.id})" style="color:red; border:none; background:none; cursor:pointer">X</button></td></tr>`;
        }).join('');
        document.getElementById('oc-total-display').innerText = `Total: R$ ${total.toFixed(2)}`;
    }

    window.salvarProduto = (id) => {
        let dados = getProdutos();
        const novo = { id: id || Date.now(), nome: document.getElementById('m-nome').value, estoque: Number(document.getElementById('m-estoque').value), preco: Number(document.getElementById('m-preco').value) };
        if(id) dados = dados.map(p => p.id === id ? novo : p); else dados.push(novo);
        saveProdutos(dados); document.getElementById('modal-overlay').remove(); renderProdutos();
    };

    window.salvarFornecedor = (id) => {
        let dados = getFornecedores();
        const proxId = dados.length > 0 ? Math.max(...dados.map(f => f.id)) + 1 : 1;
        const novo = { id: id || proxId, razaoSocial: document.getElementById('m-razao').value, cnpj: document.getElementById('m-cnpj').value, endereco: document.getElementById('m-end').value };
        if(id) dados = dados.map(f => f.id === id ? novo : f); else dados.push(novo);
        saveFornecedores(dados); document.getElementById('modal-overlay').remove(); renderFornecedores();
    };

    window.finalizarOrdem = (id) => {
        if(!itensTemp.length) return alert("Adicione itens!");
        let ordens = getOrdens();
        const forn = getFornecedores().find(f => f.id == document.getElementById('oc-forn').value);
        const novaOC = {
            id: id || (ordens.length > 0 ? Math.max(...ordens.map(o => o.id)) + 1 : 1),
            fornecedorId: forn.id, fornecedorNome: forn.razaoSocial,
            dataEntrega: document.getElementById('oc-data').value,
            pagamento: document.getElementById('oc-pgto').value,
            status: document.getElementById('oc-status').value,
            itens: itensTemp, total: itensTemp.reduce((s, i) => s + (i.qtd * i.preco), 0)
        };
        if(id) ordens = ordens.map(o => o.id === id ? novaOC : o); else ordens.push(novaOC);
        saveOrdens(ordens); document.getElementById('modal-overlay').remove(); renderOrdens();
    };

    window.excluirItem = (tipo, id) => {
        if(confirm("Excluir item?")) {
            if(tipo === 'produto') saveProdutos(getProdutos().filter(p => p.id !== id));
            else saveFornecedores(getFornecedores().filter(f => f.id !== id));
            renderPage(tipo === 'produto' ? 'produtos' : 'fornecedores');
        }
    };
    window.excluirOrdem = (id) => { if(confirm("Excluir OC?")){ saveOrdens(getOrdens().filter(o => o.id !== id)); renderOrdens(); }};

    // === 10. IMPRESSÃO PDF (MODELO HARMONIZADO FINAL) ===
    window.imprimirOC = (id) => {
        const ordem = getOrdens().find(o => o.id === id);
        const forn = getFornecedores().find(f => f.id == ordem.fornecedorId);
        const dataAtual = new Date();
        const win = window.open('', '_blank');

        win.document.write(`
            <html>
            <head>
                <title>Ordem de Compra #${ordem.id}</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; color: #334155; padding: 30px; line-height: 1.5; }
                    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
                    .logo { width: 100px; }
                    .doc-title { text-align: right; }
                    .doc-title h1 { color: #2eb8ac; margin: 0; font-size: 24px; letter-spacing: 1px; }
                    .doc-title p { margin: 2px 0; font-size: 12px; color: #64748b; }
                    .hr-main { border-top: 3px solid #2eb8ac; margin: 15px 0 25px 0; }
                    .info-block { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px; overflow: hidden; }
                    .info-header { background: #f0f9f8; color: #2eb8ac; padding: 6px 12px; font-size: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; }
                    .info-body { padding: 10px 12px; font-size: 11px; display: flex; justify-content: space-between; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                    th { background: #f8fafc; padding: 10px; text-align: left; border-bottom: 2px solid #2eb8ac; color: #475569; text-transform: uppercase; }
                    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
                    .text-right { text-align: right; }
                    .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .total-label { font-size: 16px; font-weight: bold; color: #1e293b; }
                    .rubrica-area { text-align: center; font-size: 10px; color: #94a3b8; }
                    .line { border-top: 1px solid #cbd5e1; width: 180px; margin-bottom: 5px; }
                </style>
            </head>
            <body>
                <div class="page-header">
                    <img src="https://i.postimg.cc/Wz5R0cdL/LOGONPC.png" class="logo">
                    <div class="doc-title">
                        <h1>ORDEM DE COMPRA</h1>
                        <p><strong>Nº ${ordem.id}</strong></p>
                        <p>Emissão: ${dataAtual.toLocaleDateString('pt-BR')} ${dataAtual.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                </div>
                <div class="hr-main"></div>
                <div class="info-block">
                    <div class="info-header">Estabelecimento</div>
                    <div class="info-body">
                        <span><strong>Razão Social:</strong> INSTITUTO NEUROPSICOCENTRO DE ENSINO LTDA</span>
                        <span><strong>CNPJ:</strong> 10.372.500/0001-08</span>
                    </div>
                    <div style="padding: 0 12px 10px 12px; font-size: 11px;"><strong>Endereço de Entrega:</strong> Rua Desembargador Leite Albuquerque, 1320</div>
                </div>
                <div class="info-block">
                    <div class="info-header">Fornecedor</div>
                    <div class="info-body">
                        <span><strong>Razão Social:</strong> ${forn.razaoSocial}</span>
                        <span><strong>CNPJ:</strong> ${forn.cnpj}</span>
                    </div>
                    <div style="padding: 0 12px 10px 12px; font-size: 11px;"><strong>Endereço:</strong> ${forn.endereco}</div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div class="info-block"><div class="info-header">Condição de Pagamento</div><div class="info-body">${ordem.pagamento || 'A DEFINIR'}</div></div>
                    <div class="info-block"><div class="info-header">Status</div><div class="info-body">${ordem.status}</div></div>
                </div>
                <table>
                    <thead><tr><th>Descrição</th><th class="text-right">Qtd</th><th class="text-right">Unitário</th><th class="text-right">Total</th></tr></thead>
                    <tbody>
                        ${ordem.itens.map((i, idx) => `
                            <tr>
                                <td>${idx + 1}. ${i.nome.toUpperCase()}</td>
                                <td class="text-right">${i.qtd}</td>
                                <td class="text-right">R$ ${i.preco.toFixed(2)}</td>
                                <td class="text-right"><strong>R$ ${(i.qtd * i.preco).toFixed(2)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="footer">
                    <div class="total-label">VALOR TOTAL: R$ ${ordem.total.toFixed(2)}</div>
                    <div class="rubrica-area"><div class="line"></div>Rubrica</div>
                </div>
                <script>window.onload = function() { setTimeout(() => { window.print(); window.close(); }, 500); };</script>
            </body>
            </html>
        `);
        win.document.close();
    };

    // Renderiza a página inicial
    renderDashboard();
});
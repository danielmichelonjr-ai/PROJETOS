// Relatório Cotação x Faturamento (gráficos d3 e tabelas), montado direto no DOM.
// Arquivo em JavaScript puro de propósito: o mesmo texto é embutido no "Gerar arquivo HTML".
// Usa o d3 global (window.d3) e os elementos de cotacaoTemplate.html.
window.montarRelatorio = function (DATA, OPC) {
  const opts0 = OPC || {};
  const L = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['R$', ''] });
  const n0 = L.format(',.0f'), n1 = L.format(',.1f'), pct = L.format('.1%');
  const pd = d3.utcParse('%Y-%m-%d'), dm = d3.utcFormat('%d/%m');
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const diaLbl = (d) => SEM[pd(d).getUTCDay()] + ' ' + dm(pd(d));
  const C = (i) => `var(--c${i % 9})`;
  const PEND = 'FAT. PENDENTE', NAO_FAT = 'Ainda não faturado';
  const DIC = DATA.dic;
  const P = DATA.pedidos.map((a) => ({ dia: DIC.dias[a[0]], hora: a[1], serie: a[2], origem: DIC.origens[a[3]], cot: DIC.transp[a[4]], erp: DIC.transp[a[5]], outra: a[6],
    nf: a[7], oc: a[8], canal: DIC.canais[a[9]], cep: a[10], cidade: DIC.cidades[a[11]], uf: a[12], frete: a[13], cotacao: a[14], n: 1 }));
  const rows = P;
  const DIAS = Array.from(new Set(rows.map((r) => r.dia))).sort();
  const NDIAS = DIAS.length, ULT = NDIAS - 1, DI = new Map(DIAS.map((d, i) => [d, i]));
  // Último dia parcial só quando o período vai até o fim da base (um mês fechado não tem dia parcial).
  const PARC = opts0.parcial !== false && NDIAS > 1, IP = PARC ? ULT : -1, NC = PARC ? ULT : NDIAS;
  const first = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';

  // ---------- árvore ----------
  const mk = (id, nome, nivel, pai) => ({ id, nome, nivel, pai, total: 0, dias: new Array(NDIAS).fill(0), filhos: new Map(), series: new Set(), outra: 0, fat: 0 });
  const raiz = mk('all', 'Todas as origens', 0, null);
  rows.forEach((r) => {
    const i = DI.get(r.dia);
    let o = raiz.filhos.get(r.origem); if (!o) raiz.filhos.set(r.origem, o = mk('o|' + r.origem, r.origem, 1, raiz));
    let c = o.filhos.get(r.cot); if (!c) o.filhos.set(r.cot, c = mk('c|' + r.origem + '|' + r.cot, r.cot, 2, o));
    let e = c.filhos.get(r.erp); if (!e) c.filhos.set(r.erp, e = mk('e|' + r.origem + '|' + r.cot + '|' + r.erp, r.erp, 3, c));
    [raiz, o, c, e].forEach((x) => { x.total += r.n; x.dias[i] += r.n; if (r.serie) x.series.add(r.serie); if (r.outra) x.outra += r.n; if (r.erp !== NAO_FAT) x.fat += r.n; });
  });
  const ordena = (m) => Array.from(m.values()).sort((a, b) => b.total - a.total);
  const ORIGENS = ordena(raiz.filhos).sort((a, b) => (a.nome === PEND) - (b.nome === PEND) || b.total - a.total);
  const COR = new Map(ORIGENS.map((o, i) => [o.nome, C(i)]));
  const byId = new Map(); const idx = (n) => { byId.set(n.id, n); n.filhos.forEach(idx); }; idx(raiz);
  const media = (n) => d3.mean(n.dias.slice(0, NC));
  const faturados = raiz.total - (raiz.filhos.get(PEND)?.total || 0);

  // ---------- tooltip ----------
  const tipOf = (box) => {
    let t = box.querySelector('.tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; t.hidden = true; box.appendChild(t); }
    return {
      show(ev, lines) {
        t.replaceChildren(); lines.forEach(([a, b, cor], k) => {
          const d = document.createElement('div');
          if (k === 0) { d.className = 't'; d.textContent = a; }
          else { d.className = 'r'; const x = document.createElement('span'); if (cor) { const i = document.createElement('i'); i.style.background = cor; x.appendChild(i); } x.append(a); const y = document.createElement('span'); y.textContent = b; d.append(x, y); }
          t.appendChild(d);
        });
        t.hidden = false; const bb = box.getBoundingClientRect(); const w = t.offsetWidth, h = t.offsetHeight;
        let x = ev.clientX - bb.left + 12, y = ev.clientY - bb.top - h - 10;
        if (x + w > bb.width) x = ev.clientX - bb.left - w - 12; if (x < 0) x = 0; if (y < 0) y = ev.clientY - bb.top + 16;
        t.style.left = x + 'px'; t.style.top = y + 'px';
      },
      hide() { t.hidden = true; },
    };
  };
  const eixos = (svg, x, y, W, H, m, narrow) => {
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(n0))
      .call((g) => g.select('.domain').remove()).call((g) => g.selectAll('.tick line').attr('stroke-dasharray', '2,3'));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickFormat((v, i) => (narrow && i % 2) ? '' : dm(pd(v))).tickSize(0)).call((g) => g.select('.domain').remove())
      .selectAll('text').attr('dy', '1.2em');
  };

  // ---------- cabeçalho e indicadores ----------
  const M = DATA.meta;
  document.getElementById('periodo').textContent = `Pedidos por data de pagamento · ${dm(pd(DIAS[0]))} a ${dm(pd(DIAS[ULT]))}/${DIAS[ULT].slice(0, 4)}` + (PARC ? ` · ${dm(pd(DIAS[ULT]))} parcial (dados até ${M.ultimo.slice(-5)})` : '') + (opts0.mes ? ' · cancelados fora da contagem' : ` · ${n0(M.cancelados)} cancelados fora da contagem`);
  const ip = d3.maxIndex(raiz.dias.slice(0, NC));
  const tiles = [
    ['Pedidos no período', n0(raiz.total), `${dm(pd(DIAS[0]))} a ${dm(pd(DIAS[ULT]))}, sem cancelados`, ''],
    ['Média por dia', n1(media(raiz)), `Dias completos: ${dm(pd(DIAS[0]))} a ${dm(pd(DIAS[NC - 1]))}`, ''],
    ['Pico diário', n0(raiz.dias[ip]), 'em ' + diaLbl(DIAS[ip]), ''],
    ['Faturados', n0(faturados), pct(faturados / raiz.total) + ' dos pedidos com NF', 'ok'],
    ['Faturou com outra transportadora', pct(raiz.outra / faturados), n0(raiz.outra) + ' dos faturados saíram por transportadora diferente da cotada', 'warn'],
    ['Fat. pendente', n0(raiz.total - faturados), pct((raiz.total - faturados) / raiz.total) + ' ainda sem NF', 'warn'],
  ];
  document.getElementById('kpis').replaceChildren(...tiles.map(([a, b, c, cls]) => {
    const d = document.createElement('div'); d.className = 'tile';
    const l = document.createElement('span'); l.className = 'lbl'; l.textContent = a;
    const v = document.createElement('span'); v.className = 'big ' + cls; v.textContent = b;
    const s = document.createElement('span'); s.className = 'note'; s.textContent = c;
    d.append(l, v, s); return d;
  }));
  document.getElementById('nota-fonte').textContent = M.fonte || 'de pedidos';
  document.getElementById('rodape').textContent = opts0.arquivo
    ? `Arquivo gerado em ${opts0.geradoEm} a partir da planilha ${M.fonte} (dados até ${M.ultimo}). Os dados estão dentro deste arquivo; não precisa de internet nem de login.`
    : `Base: planilha ${M.fonte} (dados até ${M.ultimo}).`;

  // ---------- evolução diária (empilhado) ----------
  document.getElementById('legenda').replaceChildren(...ORIGENS.map((o) => {
    const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = COR.get(o.nome);
    s.append(i, `${o.nome} · ${pct(o.total / raiz.total)}`); return s;
  }));
  function drawDia() {
    const el = document.getElementById('ch-dia'); el.replaceChildren();
    const W = Math.max(300, el.clientWidth), H = 300, m = { t: 18, r: 8, b: 30, l: 44 }, narrow = W < 640;
    const tab = DIAS.map((d, i) => { const o = { dia: d }; ORIGENS.forEach((x) => { o[x.nome] = x.dias[i]; }); return o; });
    const st = d3.stack().keys(ORIGENS.map((o) => o.nome))(tab);
    const x = d3.scaleBand().domain(DIAS).range([m.l, W - m.r]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(raiz.dias)]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img').attr('aria-label', 'Barras empilhadas de pedidos por dia e origem');
    eixos(svg, x, y, W, H, m, narrow);
    svg.append('g').selectAll('g').data(st).join('g').style('fill', (s) => COR.get(s.key))
      .selectAll('rect').data((s) => s).join('rect').attr('x', (r) => x(r.data.dia)).attr('width', x.bandwidth())
      .attr('y', (r) => y(r[1])).attr('height', (r) => Math.max(0, y(r[0]) - y(r[1]))).style('opacity', (r) => r.data.dia === DIAS[IP] ? 0.45 : 1);
    if (!narrow) svg.append('g').selectAll('text').data(DIAS).join('text').attr('class', 'val').attr('text-anchor', 'middle')
      .attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', (d, i) => y(raiz.dias[i]) - 5).text((d, i) => n0(raiz.dias[i]));
    const tip = tipOf(el);
    svg.append('g').selectAll('rect').data(DIAS).join('rect').attr('x', (d) => x(d)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.b - m.t).style('fill', 'transparent')
      .attr('class', 'clicavel').on('click', (ev, d) => setCtx({ dia: d }))
      .on('pointermove', (ev, d) => { const i = DI.get(d); tip.show(ev, [[diaLbl(d) + (i === IP ? ' (parcial)' : '') + ' · ' + n0(raiz.dias[i])], ...ORIGENS.map((o) => [o.nome, n0(o.dias[i]) + '  (' + pct(raiz.dias[i] ? o.dias[i] / raiz.dias[i] : 0) + ')', COR.get(o.nome)])]); })
      .on('pointerleave', () => tip.hide());
  }

  // ---------- mini gráficos por origem ----------
  function drawMinis() {
    const box = document.getElementById('minis'); box.replaceChildren();
    ORIGENS.forEach((o) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mini';
      b.setAttribute('aria-label', 'Abrir ' + o.nome + ' na árvore');
      const h = document.createElement('div'); h.className = 'h';
      const nm = document.createElement('span'); nm.className = 'n'; const sw = document.createElement('i'); sw.style.background = COR.get(o.nome); nm.append(sw, o.nome);
      const tt = document.createElement('span'); tt.className = 't'; tt.textContent = n0(o.total);
      h.append(nm, tt);
      const s = document.createElement('div'); s.className = 's';
      s.textContent = (o.series.size ? 'Série ' + Array.from(o.series).sort((a, c) => a - c).join(', ') + ' · ' : 'Sem NF · ') + 'média ' + n1(media(o)) + '/dia';
      const ch = document.createElement('div'); ch.className = 'chart';
      b.append(h, s, ch); box.appendChild(b);
      const W = Math.max(200, ch.clientWidth || 220), H = 64;
      const x = d3.scaleBand().domain(DIAS).range([0, W]).padding(0.18);
      const y = d3.scaleLinear().domain([0, d3.max(o.dias) || 1]).range([H - 2, 4]);
      const svg = d3.select(ch).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img').attr('aria-label', 'Pedidos por dia de ' + o.nome);
      const tip = tipOf(ch);
      svg.selectAll('rect').data(o.dias).join('rect').attr('x', (v, i) => x(DIAS[i])).attr('width', x.bandwidth()).attr('y', (v) => y(v)).attr('height', (v) => H - 2 - y(v))
        .attr('rx', 1).style('fill', COR.get(o.nome)).style('opacity', (v, i) => i === IP ? 0.4 : 1);
      svg.selectAll('rect.hit').data(o.dias).join('rect').attr('class', 'hit').attr('x', (v, i) => x(DIAS[i])).attr('width', x.bandwidth()).attr('y', 0).attr('height', H).style('fill', 'transparent')
        .on('pointermove', (ev) => { const i = Math.min(ULT, Math.max(0, Math.floor(d3.pointer(ev, svg.node())[0] / x.step()))); tip.show(ev, [[o.nome], [diaLbl(DIAS[i]) + (i === IP ? ' (parcial)' : ''), n0(o.dias[i])]]); })
        .on('pointerleave', () => tip.hide());
      b.addEventListener('click', () => { estado.origem = o.nome; selOrig.value = o.nome; abertos.add(o.id); selecionar(o.id); render(); setCtx({ origem: o.nome }); document.getElementById('arvore').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    });
  }

  // ---------- gráfico de detalhe ----------
  let selId = 'all';
  function drawDet() {
    const n = byId.get(selId) || raiz;
    const p = document.getElementById('det-path'); p.replaceChildren();
    const cadeia = []; for (let x = n; x; x = x.pai) cadeia.unshift(x);
    const nomes = ['', 'Origem', 'Cotou', 'Faturou'];
    cadeia.forEach((x, k) => {
      if (k) p.append(' › ');
      const s = document.createElement('span'); if (x.nivel) { const lv = document.createElement('span'); lv.className = 'lv'; lv.textContent = nomes[x.nivel] + ': '; s.appendChild(lv); }
      s.append(x.nome); p.appendChild(s);
    });
    p.append(` — ${n0(n.total)} pedidos · média ${n1(media(n))}/dia`);
    const el = document.getElementById('ch-det'); el.replaceChildren();
    const W = Math.max(300, el.clientWidth), H = 200, m = { t: 18, r: 8, b: 28, l: 44 }, narrow = W < 640;
    const x = d3.scaleBand().domain(DIAS).range([m.l, W - m.r]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(n.dias) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img').attr('aria-label', 'Pedidos por dia da linha selecionada');
    eixos(svg, x, y, W, H, m, narrow);
    const cor = n.nivel === 0 ? 'var(--accent)' : COR.get(cadeia[1].nome);
    const tip = tipOf(el);
    svg.append('g').selectAll('rect').data(n.dias).join('rect').attr('x', (v, i) => x(DIAS[i])).attr('width', x.bandwidth()).attr('y', (v) => y(v)).attr('height', (v) => y(0) - y(v))
      .attr('rx', 2).style('fill', cor).style('opacity', (v, i) => i === IP ? 0.4 : 1)
      .on('pointermove', (ev, v) => { const i = Math.min(ULT, Math.max(0, Math.floor((d3.pointer(ev, svg.node())[0] - m.l) / x.step()))); tip.show(ev, [[diaLbl(DIAS[i]) + (i === IP ? ' (parcial)' : '')], ['Pedidos', n0(n.dias[i])], ['% do dia (geral)', pct(raiz.dias[i] ? n.dias[i] / raiz.dias[i] : 0)]]); })
      .on('pointerleave', () => tip.hide());
    if (!narrow) svg.append('g').selectAll('text').data(n.dias).join('text').attr('class', 'val').attr('text-anchor', 'middle')
      .attr('x', (v, i) => x(DIAS[i]) + x.bandwidth() / 2).attr('y', (v) => y(v) - 4).text((v) => v ? n0(v) : '');
    const ym = y(media(n));
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', ym).attr('y2', ym).style('stroke', 'var(--fg)').attr('stroke-dasharray', '5,4').attr('opacity', .6).attr('pointer-events', 'none');
    svg.append('text').attr('x', W - m.r).attr('y', ym - 5).attr('text-anchor', 'end').text('média ' + n1(media(n)));
  }
  function selecionar(id) { selId = id; drawDet(); document.querySelectorAll('#tabela tr.nav').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === id)); }

  // ---------- tabela árvore ----------
  const estado = { origem: '', busca: '' };
  const abertos = new Set(ORIGENS.map((o) => o.id));
  const selOrig = document.getElementById('f-origem');
  selOrig.replaceChildren(new Option('Todas', ''), ...ORIGENS.map((o) => new Option(o.nome, o.nome)));
  function render() {
    const t = document.getElementById('tabela'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    const th = (txt, cls, sub) => { const c = document.createElement('th'); c.textContent = txt; if (sub) { const s = document.createElement('small'); s.textContent = sub; c.appendChild(s); } if (cls) c.className = cls; c.scope = 'col'; hr.appendChild(c); };
    th('Origem › Cotou › Faturou', 'nm'); th('Série', 'sr');
    DIAS.forEach((d, i) => th(dm(pd(d)), i === IP ? 'part' : '', SEM[pd(d).getUTCDay()] + (i === IP ? '*' : '')));
    th('Total', 'sep'); th('Média/dia'); th('% no nível acima'); th('% do total'); th('Faturou com outra', 'sep');
    const tb = t.createTBody();
    const q = estado.busca.trim().toLowerCase();
    const casa = (n) => !q || n.nome.toLowerCase().includes(q) || Array.from(n.filhos.values()).some(casa);
    const linha = (n) => {
      const tr = tb.insertRow(); tr.className = 'nav l' + n.nivel + (n.id === selId ? ' sel' : ''); tr.dataset.id = n.id; tr.tabIndex = 0;
      const max = d3.max(n.dias.slice(0, NC)) || 1;
      const c0 = tr.insertCell(); c0.className = 'nm'; c0.title = n.nome;
      const tem = n.nivel < 3 && n.filhos.size;
      const aberto = abertos.has(n.id) || (q && n.nivel < 3);
      if (n.nivel < 3) { const car = document.createElement('span'); car.className = 'car'; car.textContent = tem ? (aberto ? '▾' : '▸') : ''; c0.appendChild(car); tr.setAttribute('aria-expanded', String(!!aberto)); }
      if (n.nivel === 1) { const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = COR.get(n.nome); c0.appendChild(sw); }
      c0.append(n.nome);
      const cs = tr.insertCell(); cs.className = 'sr'; cs.textContent = n.nivel === 1 ? (n.series.size ? Array.from(n.series).sort((a, b) => a - b).join(', ') : '—') : '';
      n.dias.forEach((v, i) => { const c = tr.insertCell(); c.textContent = v ? n0(v) : '·'; if (i === IP) c.className = 'part'; if (v) c.style.background = `color-mix(in srgb, ${COR.get(n.nivel === 1 ? n.nome : (n.nivel === 2 ? n.pai.nome : n.pai.pai.nome))} ${Math.round(6 + 40 * (v / max))}%, transparent)`; });
      const add = (txt, cls) => { const c = tr.insertCell(); c.textContent = txt; if (cls) c.className = cls; return c; };
      add(n0(n.total), 'sep'); add(n1(media(n))); add(pct(n.total / n.pai.total)); add(pct(n.total / raiz.total));
      const co = add(n.fat ? (n.outra ? n0(n.outra) + ' · ' + pct(n.outra / n.fat) : '—') : '', 'sep'); if (n.fat && n.outra / n.fat >= 0.2) co.classList.add('diff');
      const toggle = () => { if (abertos.has(n.id)) abertos.delete(n.id); else abertos.add(n.id); render(); };
      tr.addEventListener('click', (e) => { selecionar(n.id); ctxNo(n, {}); if (tem && (e.target.classList.contains('car') || n.nivel < 3)) toggle(); });
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionar(n.id); if (tem) toggle(); } });
      if (aberto && tem) ordena(n.filhos).filter(casa).forEach(linha);
    };
    ORIGENS.filter((o) => !estado.origem || o.nome === estado.origem).filter(casa).forEach(linha);
    const tr = tb.insertRow(); tr.className = 'tot';
    const nm = tr.insertCell(); nm.className = 'nm'; nm.textContent = 'TOTAL GERAL'; tr.insertCell();
    raiz.dias.forEach((v, i) => { const c = tr.insertCell(); c.textContent = n0(v); if (i === IP) c.className = 'part'; });
    [n0(raiz.total), n1(media(raiz)), '', '100,0%', n0(raiz.outra) + ' · ' + pct(raiz.outra / faturados)].forEach((v, k) => { const c = tr.insertCell(); c.textContent = v; if (k === 0 || k === 4) c.className = 'sep'; });
  }
  selOrig.addEventListener('change', () => { estado.origem = selOrig.value; if (selOrig.value) { const o = raiz.filhos.get(selOrig.value); abertos.add(o.id); selecionar(o.id); } else selecionar('all'); render(); });
  document.getElementById('f-busca').addEventListener('input', (e) => { estado.busca = e.target.value; render(); });
  document.getElementById('b-n1').addEventListener('click', () => { abertos.clear(); render(); });
  document.getElementById('b-n2').addEventListener('click', () => { abertos.clear(); ORIGENS.forEach((o) => abertos.add(o.id)); render(); });
  document.getElementById('b-n3').addEventListener('click', () => { byId.forEach((n) => { if (n.nivel === 1 || n.nivel === 2) abertos.add(n.id); }); render(); });

  // ---------- cotada x faturada ----------
  const selCmp = document.getElementById('f-cmp');
  const fatOrig = ORIGENS.filter((o) => o.nome !== PEND);
  selCmp.replaceChildren(new Option('Todas as faturadas', ''), ...fatOrig.map((o) => new Option(o.nome, o.nome)));
  function drawCmp() {
    const os = fatOrig.filter((o) => !selCmp.value || o.nome === selCmp.value);
    const cot = new Map(), erp = new Map();
    os.forEach((o) => o.filhos.forEach((c) => { cot.set(c.nome, (cot.get(c.nome) || 0) + c.total); c.filhos.forEach((e) => erp.set(e.nome, (erp.get(e.nome) || 0) + e.total)); }));
    const tot = d3.sum(Array.from(cot.values()));
    const lista = (m, el, cls) => {
      const arr = Array.from(m).sort((a, b) => b[1] - a[1]); const mx = arr.length ? arr[0][1] : 1;
      el.replaceChildren(...arr.map(([nome, v]) => {
        const r = document.createElement('div'); r.className = 'bar ' + cls;
        const l = document.createElement('span'); l.className = 'l'; l.textContent = nome; l.title = nome;
        const b = document.createElement('span'); b.className = 'b';
        const f = document.createElement('span'); f.className = 'f'; f.style.width = (100 * v / mx * 0.78) + '%';
        const t = document.createElement('span'); t.className = 'v'; t.textContent = n0(v) + ' · ' + pct(v / tot);
        b.append(f, t); r.append(l, b);
        r.classList.add('clicavel'); r.tabIndex = 0; r.title = 'Ver os pedidos na lista';
        const go = () => setCtx(Object.assign({ origem: selCmp.value || undefined, fat: true }, cls === 'cot' ? { cot: nome } : { erp: nome }));
        r.addEventListener('click', go); r.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        return r;
      }));
    };
    lista(cot, document.getElementById('bars-cot'), 'cot');
    lista(erp, document.getElementById('bars-erp'), 'erp');
    const pares = new Map();
    rows.filter((r) => r.outra && r.origem !== PEND && (!selCmp.value || r.origem === selCmp.value)).forEach((r) => {
      const k = r.origem + '\u0000' + r.cot + '\u0000' + r.erp; pares.set(k, (pares.get(k) || 0) + r.n);
    });
    const arr = Array.from(pares).map(([k, v]) => [...k.split('\u0000'), v]).sort((a, b) => b[3] - a[3]);
    const fatSel = d3.sum(os, (o) => o.fat);
    document.getElementById('pares-tot').textContent = `· ${n0(d3.sum(arr, (a) => a[3]))} pedidos (${pct(fatSel ? d3.sum(arr, (a) => a[3]) / fatSel : 0)} dos faturados)`;
    const t = document.getElementById('pares'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    ['Origem', 'Cotou (coluna R)', 'Faturou (ERP, coluna O)', 'Pedidos'].forEach((h, k) => { const c = document.createElement('th'); c.textContent = h; c.scope = 'col'; if (k < 3) c.style.textAlign = 'left'; hr.appendChild(c); });
    const tb = t.createTBody();
    arr.forEach(([o, c, e, v]) => { const tr = tb.insertRow(); tr.className = 'clicavel'; tr.addEventListener('click', () => setCtx({ origem: o, cot: c, erp: e })); [o, c, e, n0(v)].forEach((x, k) => { const td = tr.insertCell(); td.textContent = x; if (k < 3) td.style.textAlign = 'left'; if (k === 0) { const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = COR.get(o); td.prepend(sw); } }); });
    if (!arr.length) { const tr = tb.insertRow(); const td = tr.insertCell(); td.colSpan = 4; td.style.textAlign = 'left'; td.textContent = 'Nenhum pedido faturado com transportadora diferente da cotada.'; }
  }
  selCmp.addEventListener('change', drawCmp);

  // ---------- cotado pela Filial SP, faturado por outra origem ----------
  const COT_SP = new Set(['Transvanio', 'Zelog Standard', 'Vm Transportes', 'Dominalog Filial Sp', 'Tsl Filial Sp', 'Formato Transportes Standard', 'Idh Transportes', 'Tradicional Log', 'Atual Cargas Filial Sp', 'Transiga Filial Sp', 'Trans Sua Log - Standard', 'Flog Filial Sp', 'Passaro Transportes', 'Petrymar Ms - Filial Sp', 'Petrymar Mt - Filial Sp']);
  const SP = 'FILIAL SP';
  const spRows = rows.filter((r) => COT_SP.has(r.cot));
  const spFat = spRows.filter((r) => r.origem !== PEND);
  const spFora = spFat.filter((r) => r.origem !== SP);
  const spTot = d3.sum(spFat, (r) => r.n), spForaTot = d3.sum(spFora, (r) => r.n), spPend = d3.sum(spRows.filter((r) => r.origem === PEND), (r) => r.n);
  (function () {
    const tiles = [
      ['Cotados pela Filial SP', n0(spTot + spPend), 'pedidos cotados por essas 15 transportadoras', ''],
      ['Faturados pela Filial SP', n0(spTot - spForaTot), pct((spTot - spForaTot) / spTot) + ' dos já faturados', 'ok'],
      ['Faturados por outra origem', n0(spForaTot), pct(spForaTot / spTot) + ' dos já faturados', 'warn'],
      ['Ainda sem NF', n0(spPend), 'origem ainda não definida', ''],
    ];
    document.getElementById('spf-kpis').replaceChildren(...tiles.map(([a, b, c, cls]) => {
      const d = document.createElement('div'); d.className = 'tile';
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = a;
      const v = document.createElement('span'); v.className = 'big ' + cls; v.textContent = b;
      const t = document.createElement('span'); t.className = 'note'; t.textContent = c;
      d.append(l, v, t); return d;
    }));
    // matriz cotação x origem
    const origCols = ORIGENS.map((o) => o.nome).filter((o) => o !== PEND && spFat.some((r) => r.origem === o));
    const porCot = d3.rollup(spRows, (v) => d3.rollup(v, (w) => d3.sum(w, (r) => r.n), (r) => r.origem), (r) => r.cot);
    const linhas = Array.from(COT_SP).map((c) => {
      const m = porCot.get(c) || new Map(); const fat = d3.sum(origCols, (o) => m.get(o) || 0); const fora = fat - (m.get(SP) || 0);
      return { c, m, fat, fora, pend: m.get(PEND) || 0 };
    }).sort((a, b) => b.fora - a.fora || b.fat - a.fat);
    const t = document.getElementById('spf-matriz'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    const th = (txt, cls, cor) => { const c = document.createElement('th'); c.scope = 'col'; if (cls) c.className = cls; if (cor) { const i = document.createElement('i'); i.className = 'sw'; i.style.background = cor; c.appendChild(i); } c.append(txt); hr.appendChild(c); };
    th('Transportadora cotada', 'nm');
    origCols.forEach((o) => th(o, '', COR.get(o)));
    th('Total faturado', 'sep'); th('Fora da Filial SP'); th('% fora'); th('Ainda sem NF', 'sep');
    const tb = t.createTBody();
    const maxFora = d3.max(linhas, (l) => l.fora) || 1;
    linhas.forEach((l) => {
      const tr = tb.insertRow(); tr.className = 'nav l2'; tr.tabIndex = 0;
      const c0 = tr.insertCell(); c0.className = 'nm'; c0.textContent = l.c;
      origCols.forEach((o) => { const v = l.m.get(o) || 0; const c = tr.insertCell(); c.textContent = v ? n0(v) : '·'; if (v && o !== SP) c.style.background = `color-mix(in srgb, ${COR.get(o)} ${Math.round(10 + 40 * v / maxFora)}%, transparent)`; });
      const add = (v, cls) => { const c = tr.insertCell(); c.textContent = v; if (cls) c.className = cls; return c; };
      add(n0(l.fat), 'sep'); add(l.fora ? n0(l.fora) : '·'); const cp = add(l.fat ? pct(l.fora / l.fat) : '—'); if (l.fat && l.fora / l.fat >= 0.1) cp.classList.add('diff');
      add(l.pend ? n0(l.pend) : '·', 'sep');
      const go = () => { setCtx({ cot: l.c, foraSP: true }); spfSel = 'c|' + l.c; abertosSpf.clear(); spfTree.filhos.forEach((o) => { abertosSpf.add(o.id); if (o.filhos.has(l.c)) abertosSpf.add(o.filhos.get(l.c).id); }); renderSpf(); document.getElementById('spf-arvore').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    const tr = tb.insertRow(); tr.className = 'tot';
    const nm = tr.insertCell(); nm.className = 'nm'; nm.textContent = 'TOTAL';
    origCols.forEach((o) => { const c = tr.insertCell(); c.textContent = n0(d3.sum(linhas, (l) => l.m.get(o) || 0)); });
    [[n0(spTot), 'sep'], [n0(spForaTot)], [pct(spForaTot / spTot)], [n0(spPend), 'sep']].forEach(([v, cls]) => { const c = tr.insertCell(); c.textContent = v; if (cls) c.className = cls; });
  })();
  // árvore dos que saíram fora da Filial SP
  const spfTree = mk('spf', 'Fora da Filial SP', 0, null);
  spFora.forEach((r) => {
    const i = DI.get(r.dia);
    let o = spfTree.filhos.get(r.origem); if (!o) spfTree.filhos.set(r.origem, o = mk('so|' + r.origem, r.origem, 1, spfTree));
    let c = o.filhos.get(r.cot); if (!c) o.filhos.set(r.cot, c = mk('sc|' + r.origem + '|' + r.cot, r.cot, 2, o));
    let e = c.filhos.get(r.erp); if (!e) c.filhos.set(r.erp, e = mk('se|' + r.origem + '|' + r.cot + '|' + r.erp, r.erp, 3, c));
    [spfTree, o, c, e].forEach((x) => { x.total += r.n; x.dias[i] += r.n; if (r.serie) x.series.add(r.serie); });
  });
  const spfOrig = ordena(spfTree.filhos);
  const abertosSpf = new Set(spfOrig.map((o) => o.id));
  let spfSel = '';
  function renderSpf() {
    const t = document.getElementById('spf-arvore'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    const th = (txt, cls, sub) => { const c = document.createElement('th'); c.textContent = txt; if (sub) { const s = document.createElement('small'); s.textContent = sub; c.appendChild(s); } if (cls) c.className = cls; c.scope = 'col'; hr.appendChild(c); };
    th('Origem › Cotou › Faturou', 'nm'); th('Série', 'sr');
    DIAS.forEach((d, i) => th(dm(pd(d)), i === IP ? 'part' : '', SEM[pd(d).getUTCDay()] + (i === IP ? '*' : '')));
    th('Total', 'sep'); th('% no nível acima'); th('% dos fora da SP');
    const tb = t.createTBody();
    const linha = (n) => {
      const tr = tb.insertRow(); tr.className = 'nav l' + n.nivel + (spfSel && (n.id === spfSel || n.id.endsWith(spfSel.slice(1)) && n.nivel === 2) ? ' sel' : ''); tr.tabIndex = 0;
      const tem = n.nivel < 3 && n.filhos.size, aberto = abertosSpf.has(n.id);
      const c0 = tr.insertCell(); c0.className = 'nm'; c0.title = n.nome;
      if (n.nivel < 3) { const car = document.createElement('span'); car.className = 'car'; car.textContent = tem ? (aberto ? '▾' : '▸') : ''; c0.appendChild(car); tr.setAttribute('aria-expanded', String(aberto)); }
      if (n.nivel === 1) { const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = COR.get(n.nome); c0.appendChild(sw); }
      c0.append(n.nome);
      const cs = tr.insertCell(); cs.className = 'sr'; cs.textContent = n.nivel === 1 ? Array.from(n.series).sort((a, b) => a - b).join(', ') : '';
      const max = d3.max(n.dias.slice(0, NC)) || 1; const base = n.nivel === 1 ? n.nome : n.nivel === 2 ? n.pai.nome : n.pai.pai.nome;
      n.dias.forEach((v, i) => { const c = tr.insertCell(); c.textContent = v ? n0(v) : '·'; if (i === IP) c.className = 'part'; if (v) c.style.background = `color-mix(in srgb, ${COR.get(base)} ${Math.round(6 + 40 * (v / max))}%, transparent)`; });
      [[n0(n.total), 'sep'], [pct(n.total / n.pai.total)], [pct(n.total / spfTree.total)]].forEach(([v, cls]) => { const c = tr.insertCell(); c.textContent = v; if (cls) c.className = cls; });
      tr.addEventListener('click', () => ctxNo(n, { foraSP: true }));
      if (tem) { const tg = () => { if (abertosSpf.has(n.id)) abertosSpf.delete(n.id); else abertosSpf.add(n.id); renderSpf(); }; tr.addEventListener('click', tg); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } }); }
      if (tem && aberto) ordena(n.filhos).forEach(linha);
    };
    spfOrig.forEach(linha);
    const tr = tb.insertRow(); tr.className = 'tot';
    const nm = tr.insertCell(); nm.className = 'nm'; nm.textContent = 'TOTAL FORA DA FILIAL SP'; tr.insertCell();
    spfTree.dias.forEach((v, i) => { const c = tr.insertCell(); c.textContent = n0(v); if (i === IP) c.className = 'part'; });
    [[n0(spfTree.total), 'sep'], [''], ['100,0%']].forEach(([v, cls]) => { const c = tr.insertCell(); c.textContent = v; if (cls) c.className = cls; });
  }
  document.getElementById('spf-b1').addEventListener('click', () => { abertosSpf.clear(); spfSel = ''; renderSpf(); });
  document.getElementById('spf-b2').addEventListener('click', () => { abertosSpf.clear(); spfOrig.forEach((o) => abertosSpf.add(o.id)); renderSpf(); });
  document.getElementById('spf-b3').addEventListener('click', () => { spfOrig.forEach((o) => { abertosSpf.add(o.id); o.filhos.forEach((c) => abertosSpf.add(c.id)); }); renderSpf(); });
  document.getElementById('spf-leg').replaceChildren(...spfOrig.map((o) => { const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = COR.get(o.nome); s.append(i, `${o.nome} · ${n0(o.total)}`); return s; }));
  function drawSpfDia() {
    const el = document.getElementById('spf-dia'); el.replaceChildren();
    const W = Math.max(300, el.clientWidth), H = 240, m = { t: 18, r: 8, b: 28, l: 40 }, narrow = W < 640;
    const keys = spfOrig.map((o) => o.nome);
    const tab = DIAS.map((d, i) => { const o = { dia: d }; spfOrig.forEach((x) => { o[x.nome] = x.dias[i]; }); return o; });
    const st = d3.stack().keys(keys)(tab);
    const x = d3.scaleBand().domain(DIAS).range([m.l, W - m.r]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(spfTree.dias) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img').attr('aria-label', 'Pedidos cotados pela Filial SP e faturados por outra origem, por dia');
    eixos(svg, x, y, W, H, m, narrow);
    svg.append('g').selectAll('g').data(st).join('g').style('fill', (s) => COR.get(s.key)).selectAll('rect').data((s) => s).join('rect')
      .attr('x', (r) => x(r.data.dia)).attr('width', x.bandwidth()).attr('y', (r) => y(r[1])).attr('height', (r) => Math.max(0, y(r[0]) - y(r[1]))).style('opacity', (r) => r.data.dia === DIAS[IP] ? 0.45 : 1);
    if (!narrow) svg.append('g').selectAll('text').data(spfTree.dias).join('text').attr('class', 'val').attr('text-anchor', 'middle')
      .attr('x', (v, i) => x(DIAS[i]) + x.bandwidth() / 2).attr('y', (v) => y(v) - 4).text((v) => v ? n0(v) : '');
    const tip = tipOf(el);
    svg.append('g').selectAll('rect').data(DIAS).join('rect').attr('x', (d) => x(d)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.b - m.t).style('fill', 'transparent')
      .attr('class', 'clicavel').on('click', (ev, d) => setCtx({ dia: d, foraSP: true }))
      .on('pointermove', (ev, d) => { const i = DI.get(d); tip.show(ev, [[diaLbl(d) + (i === IP ? ' (parcial)' : '') + ' · ' + n0(spfTree.dias[i])], ...spfOrig.map((o) => [o.nome, n0(o.dias[i]), COR.get(o.nome)])]); })
      .on('pointerleave', () => tip.hide());
  }
  // ---------- quadro de pedidos ----------
  const BRL = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['R$ ', ''] }).format('$,.2f');
  let ctx = {};
  const pg = { i: 0, tam: 100 }; let ord = { k: 'dt', dir: 1 };
  const ctxTexto = (c) => [c.dia && 'Dia ' + diaLbl(c.dia), c.origem && 'Origem: ' + c.origem, c.cot && 'Cotou: ' + c.cot, c.erp && 'Faturou: ' + c.erp,
    c.foraSP && 'cotado pela Filial SP e faturado por outra origem', c.fat && !c.foraSP && 'só faturados'].filter(Boolean).join(' › ');
  function setCtx(c) { ctx = c || {}; pg.i = 0; renderPed(); }
  function ctxNo(n, extra) {
    const c = Object.assign({}, extra);
    for (let x = n; x && x.nivel; x = x.pai) { if (x.nivel === 1) c.origem = x.nome; if (x.nivel === 2) c.cot = x.nome; if (x.nivel === 3) c.erp = x.nome; }
    setCtx(c);
  }
  const opts = (el, vals, todos) => { el.replaceChildren(new Option(todos, ''), ...vals.map((v) => new Option(v, v))); };
  const uniq = (f) => Array.from(new Set(P.map(f).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  opts(document.getElementById('pf-origem'), ORIGENS.map((o) => o.nome), 'Todas');
  opts(document.getElementById('pf-canal'), uniq((r) => r.canal), 'Todos');
  opts(document.getElementById('pf-uf'), uniq((r) => r.uf), 'Todos');
  opts(document.getElementById('pf-cot'), uniq((r) => r.cot), 'Todas');
  opts(document.getElementById('pf-erp'), uniq((r) => r.erp), 'Todas');
  document.getElementById('pf-cidades').replaceChildren(...uniq((r) => r.cidade).map((c) => { const o = document.createElement('option'); o.value = c; return o; }));
  const F = { origem: 'pf-origem', nf: 'pf-nf', canal: 'pf-canal', cidade: 'pf-cidade', uf: 'pf-uf', cot: 'pf-cot', erp: 'pf-erp' };
  const val = (k) => document.getElementById(F[k]).value.trim();
  Object.values(F).forEach((id) => document.getElementById(id).addEventListener('input', () => { pg.i = 0; renderPed(); }));
  document.getElementById('pf-limpar').addEventListener('click', () => { Object.values(F).forEach((id) => { document.getElementById(id).value = ''; }); pg.i = 0; renderPed(); });
  document.getElementById('ped-ctx-x').addEventListener('click', () => setCtx({}));
  document.getElementById('ped-go').addEventListener('click', () => document.getElementById('pedidos').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.getElementById('pg-ant').addEventListener('click', () => { if (pg.i > 0) { pg.i--; renderPed(); } });
  document.getElementById('pg-prox').addEventListener('click', () => { pg.i++; renderPed(); });
  const COLS = [
    ['dt', 'Data', (r) => dm(pd(r.dia)), (r) => r.dia + r.hora],
    ['origem', 'Origem', (r) => r.origem, (r) => r.origem],
    ['nf', 'NF', (r) => r.nf || '—', (r) => r.nf],
    ['oc', 'Ordem compra', (r) => r.oc, (r) => r.oc],
    ['canal', 'Canal', (r) => r.canal, (r) => r.canal],
    ['cidade', 'Cidade', (r) => r.cidade, (r) => r.cidade],
    ['uf', 'UF', (r) => r.uf, (r) => r.uf],
    ['cot', 'Transp. cotada', (r) => r.cot, (r) => r.cot],
    ['erp', 'Transp. faturada', (r) => r.erp, (r) => r.erp],
    ['frete', 'Frete pedido', (r) => r.frete == null ? '—' : BRL(r.frete), (r) => r.frete ?? -1, 'num'],
    ['cotacao', 'Cotação transp.', (r) => r.cotacao == null ? '—' : BRL(r.cotacao), (r) => r.cotacao ?? -1, 'num'],
  ];
  function renderPed() {
    const q = { origem: val('origem'), nf: val('nf').toLowerCase(), canal: val('canal'), cidade: val('cidade').toLowerCase(), uf: val('uf'), cot: val('cot'), erp: val('erp') };
    const c = ctx;
    const lst = P.filter((r) => (!c.origem || r.origem === c.origem) && (!c.cot || r.cot === c.cot) && (!c.erp || r.erp === c.erp) && (!c.dia || r.dia === c.dia)
      && (!c.fat || r.origem !== PEND) && (!c.foraSP || (COT_SP.has(r.cot) && r.origem !== SP && r.origem !== PEND))
      && (!q.origem || r.origem === q.origem) && (!q.nf || r.nf.toLowerCase().includes(q.nf)) && (!q.canal || r.canal === q.canal) && (!q.cidade || r.cidade.toLowerCase().includes(q.cidade))
      && (!q.uf || r.uf === q.uf) && (!q.cot || r.cot === q.cot) && (!q.erp || r.erp === q.erp));
    const col = COLS.find((x) => x[0] === ord.k);
    lst.sort((a, b) => { const x = col[3](a), y = col[3](b); return (x < y ? -1 : x > y ? 1 : 0) * ord.dir; });
    const temCtx = Object.keys(c).some((k) => c[k]);
    document.getElementById('ped-ctx').hidden = !temCtx; document.getElementById('ped-ctx-txt').textContent = ctxTexto(c);
    const go = document.getElementById('ped-go'); go.hidden = !temCtx; go.textContent = `Ver ${n0(lst.length)} pedidos ↓`;
    const sf = d3.sum(lst, (r) => r.frete || 0), sc = d3.sum(lst, (r) => r.cotacao || 0);
    const res = document.getElementById('ped-res'); res.replaceChildren();
    [['Pedidos', n0(lst.length)], ['Frete pedido', BRL(sf)], ['Cotação transportador', BRL(sc)], ['Diferença (frete − cotação)', BRL(sf - sc)]].forEach(([a, b]) => { const s = document.createElement('span'); const bb = document.createElement('b'); bb.textContent = b; s.append(a + ': ', bb); res.appendChild(s); });
    const paginas = Math.max(1, Math.ceil(lst.length / pg.tam)); if (pg.i >= paginas) pg.i = paginas - 1;
    const t = document.getElementById('ped-tab'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    COLS.forEach(([k, nome, , , cls]) => {
      const th = document.createElement('th'); th.textContent = nome; th.scope = 'col'; th.tabIndex = 0; if (cls) th.className = cls;
      if (ord.k === k) th.setAttribute('aria-sort', ord.dir > 0 ? 'ascending' : 'descending');
      const s = () => { ord = { k, dir: ord.k === k ? -ord.dir : 1 }; renderPed(); };
      th.addEventListener('click', s); th.addEventListener('keydown', (e) => { if (e.key === 'Enter') s(); });
      hr.appendChild(th);
    });
    const tb = t.createTBody();
    lst.slice(pg.i * pg.tam, (pg.i + 1) * pg.tam).forEach((r) => {
      const tr = tb.insertRow();
      COLS.forEach(([k, , f, , cls]) => {
        const td = tr.insertCell(); td.textContent = f(r); if (cls) td.className = cls;
        if (k === 'erp' || k === 'cot' || k === 'cidade' || k === 'canal') { td.classList.add('cut'); td.title = f(r); }
        if (k === 'cidade') { td.title = `${r.cidade} - ${r.uf} · CEP ${r.cep || 'não informado'}`; td.classList.add('cep'); }
        if (k === 'origem') { const i = document.createElement('i'); i.className = 'sw'; i.style.background = COR.get(r.origem); td.prepend(i); }
        if (k === 'erp' && r.outra) { td.classList.add('dif'); td.title = 'Faturado por transportadora diferente da cotada'; }
      });
    });
    if (!lst.length) { const tr = tb.insertRow(); const td = tr.insertCell(); td.colSpan = COLS.length; td.textContent = 'Nenhum pedido com esses filtros.'; }
    document.getElementById('pg-txt').textContent = lst.length ? `${n0(pg.i * pg.tam + 1)}–${n0(Math.min(lst.length, (pg.i + 1) * pg.tam))} de ${n0(lst.length)} · página ${pg.i + 1} de ${paginas}` : '';
    document.getElementById('pg-ant').disabled = pg.i === 0; document.getElementById('pg-prox').disabled = pg.i >= paginas - 1;
  }
  // ---------- início ----------
  const tudo = () => { drawDia(); drawMinis(); drawDet(); drawSpfDia(); };
  render(); tudo(); drawCmp(); renderSpf(); renderPed();
  if (window.__vpResize) removeEventListener('resize', window.__vpResize);
  let w = innerWidth, to; window.__vpResize = () => { clearTimeout(to); to = setTimeout(() => { if (innerWidth !== w) { w = innerWidth; tudo(); } }, 150); };
  addEventListener('resize', window.__vpResize);
};

// Botões de mês acima do relatório: só os meses que existem na base. Cada clique remonta o relatório com o mês escolhido.
window.montarComMeses = function (DATA, OPC, alvo, TEMPLATE) {
  const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dias = DATA.dic.dias, cont = new Map();
  DATA.pedidos.forEach((a) => { const m = dias[a[0]].slice(0, 7); cont.set(m, (cont.get(m) || 0) + 1); });
  const meses = Array.from(cont.keys()).sort();
  const ultimoMes = meses[meses.length - 1];
  const fmt = (n) => n.toLocaleString('pt-BR');
  let sel = OPC.mesInicial && (OPC.mesInicial === 'todos' || cont.has(OPC.mesInicial)) ? OPC.mesInicial : (meses.length > 1 ? ultimoMes : 'todos');
  function montar() {
    if (window.__vpResize) removeEventListener('resize', window.__vpResize);
    alvo.innerHTML = TEMPLATE;
    const dados = sel === 'todos' ? DATA : { meta: DATA.meta, dic: DATA.dic, pedidos: DATA.pedidos.filter((a) => dias[a[0]].startsWith(sel)) };
    window.montarRelatorio(dados, Object.assign({}, OPC, { mes: sel === 'todos' ? '' : sel, parcial: sel === 'todos' || sel === ultimoMes }));
    const nav = alvo.querySelector('#meses');
    if (!nav) return;
    if (meses.length < 2) { nav.hidden = true; return; }
    const botao = (valor, rotulo, n) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (valor === sel ? ' pri' : '');
      b.setAttribute('aria-pressed', String(valor === sel));
      b.textContent = rotulo + ' · ' + fmt(n);
      b.addEventListener('click', () => { if (valor === sel) return; sel = valor; if (OPC.aoMudarMes) OPC.aoMudarMes(sel); montar(); });
      return b;
    };
    const lbl = document.createElement('span'); lbl.className = 'sub'; lbl.textContent = 'Mês:';
    nav.replaceChildren(lbl, ...meses.map((m) => botao(m, NOMES[+m.slice(5) - 1] + '/' + m.slice(0, 4), cont.get(m))), botao('todos', 'Todos', DATA.pedidos.length));
  }
  montar();
};

// Desenha o fluxograma a partir de data.js e cuida das interações: folha de dados, tour, console e tema.
(function () {
  "use strict";

  const P = window.PLANT;
  const NS = "http://www.w3.org/2000/svg";
  const byTag = new Map(P.nodes.map((n) => [n.tag, n]));
  const svg = document.getElementById("plant");
  const mq = window.matchMedia("(max-width: 820px)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const VIEW = { d: "0 0 1600 760", m: "0 0 400 1610" };

  // Meia altura de cada símbolo, usada para posicionar os rótulos abaixo dele.
  const HALF = { tank: 50, column: 115, reactor: 70, exchanger: 46, valve: 18, control: 42, feed: 24, compressor: 42, outlet: 26 };
  const STATUS_TEXT = { comissionamento: "em comissionamento", projeto: "em projeto" };
  const STATUS_LONG = {
    operando: "Em operação",
    comissionamento: "Em comissionamento: montado, ainda em testes",
    projeto: "Em projeto: planejado ou preparado, ainda não operando",
  };

  let layout = mq.matches ? "m" : "d";
  let running = false;
  let current = null;
  let returnFocus = null;

  // ---------- Símbolos ----------
  function symbol(n) {
    const lvl = { "TK-101": 0.85, "TK-501": 0.7, "TK-502": 0.25, "TK-503": 0.6, "TK-504": 0.55, "TK-505": 0.15, "TK-506": 0.45 }[n.tag] || 0.5;
    const clip = "clip-" + n.tag;
    switch (n.kind) {
      case "tank":
        return `<clipPath id="${clip}"><rect x="-48" y="-50" width="96" height="100" rx="24"/></clipPath>
          <rect class="eq" x="-48" y="-50" width="96" height="100" rx="24"/>
          <rect class="liquid" clip-path="url(#${clip})" x="-48" y="-50" width="96" height="100" style="--lvl:${lvl}"/>
          <rect class="eq-line" x="-48" y="-50" width="96" height="100" rx="24"/>
          <line class="eq-thin" x1="-48" y1="-26" x2="48" y2="-26"/><line class="eq-thin" x1="-48" y1="26" x2="48" y2="26"/>`;
      case "column": {
        let trays = "";
        for (let i = 0, y = -82; y <= 82; y += 24, i++) {
          trays += i % 2 ? `<line class="eq-thin" x1="-18" y1="${y}" x2="34" y2="${y}"/>` : `<line class="eq-thin" x1="-34" y1="${y}" x2="18" y2="${y}"/>`;
        }
        return `<rect class="eq" x="-34" y="-115" width="68" height="230" rx="34"/>${trays}`;
      }
      case "reactor":
        return `<rect class="eq" x="-62" y="-70" width="124" height="140" rx="40"/>
          <rect class="eq" x="-14" y="-104" width="28" height="20" rx="2"/>
          <text class="eq-txt" x="0" y="-94">M</text>
          <line class="eq-line" x1="0" y1="-84" x2="0" y2="36"/>
          <g class="impeller"><line class="eq-line" x1="-30" y1="36" x2="30" y2="36"/><rect class="eq" x="-30" y="28" width="14" height="16"/><rect class="eq" x="16" y="28" width="14" height="16"/></g>
          <line class="eq-thin" x1="-62" y1="-30" x2="-50" y2="-30"/><line class="eq-thin" x1="50" y1="-30" x2="62" y2="-30"/>`;
      case "exchanger":
        return `<circle class="eq" r="46"/><polyline class="eq-line" points="-46,0 -30,-20 -12,20 6,-20 24,20 46,0"/>`;
      case "valve":
        return `<path class="eq valve-body" d="M-30,-18 L0,0 L-30,18 Z M30,-18 L0,0 L30,18 Z"/>
          <line class="eq-line" x1="0" y1="0" x2="0" y2="-34"/>
          <rect class="eq" x="-20" y="-58" width="40" height="24" rx="2"/>
          <text class="eq-txt" x="0" y="-46">HS</text>`;
      case "control":
        return `<rect class="eq" x="-62" y="-42" width="124" height="84" rx="4"/>
          <rect class="eq-thin" x="-50" y="-30" width="30" height="22"/><rect class="eq-thin" x="-15" y="-30" width="30" height="22"/><rect class="eq-thin" x="20" y="-30" width="30" height="22"/>
          <line class="eq-thin" x1="-50" y1="14" x2="50" y2="14"/>
          <circle class="led" cx="-36" cy="28" r="4"/><circle class="led" cx="-22" cy="28" r="4"/><circle class="led" cx="-8" cy="28" r="4"/>`;
      case "feed":
        return `<path class="eq" d="M-60,-24 H30 L60,0 L30,24 H-60 Z"/>`;
      case "compressor":
        return `<circle class="eq" r="42"/><path class="eq-line" d="M-34,-24 L36,-10 M-34,24 L36,10"/>`;
      case "outlet":
        return `<path class="eq" d="M-62,-26 H34 L64,0 L34,26 H-62 Z"/><text class="eq-txt" x="-8" y="0">contato</text>`;
      default:
        return `<circle class="eq" r="30"/>`;
    }
  }

  // Quebra nomes longos em até duas linhas: primeiro no ":", depois no espaço mais perto do meio.
  function splitName(name) {
    if (name.includes(":")) {
      const [a, b] = name.split(":");
      return [a + ":", b.trim()];
    }
    if (name.length <= 18) return [name];
    const mid = Math.floor(name.length / 2);
    let cut = -1;
    for (let d = 0; d < mid; d++) {
      if (name[mid + d] === " ") { cut = mid + d; break; }
      if (name[mid - d] === " ") { cut = mid - d; break; }
    }
    return cut < 0 ? [name] : [name.slice(0, cut), name.slice(cut + 1)];
  }

  // ---------- Rotas das tubulações ----------
  function points(pipe) {
    const a = byTag.get(pipe.from)[layout];
    const b = byTag.get(pipe.to)[layout];
    const s = pipe[layout];
    if (s.pts) return s.pts;
    if (s.trunk !== undefined) return [a, [a[0], s.split], [s.trunk, s.split], [s.trunk, b[1]], b];
    switch (s.route) {
      case "hv": return [a, [b[0], a[1]], b];
      case "vh": return [a, [a[0], b[1]], b];
      case "hvh": return [a, [s.mid, a[1]], [s.mid, b[1]], b];
      case "vhv": return [a, [a[0], s.mid], [b[0], s.mid], b];
      default: return [a, b];
    }
  }
  const toD = (pts) => "M" + pts.map((p) => p.join(",")).join(" L");
  const lengthOf = (pts) => pts.slice(1).reduce((acc, p, i) => acc + Math.abs(p[0] - pts[i][0]) + Math.abs(p[1] - pts[i][1]), 0);

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // ---------- Render ----------
  function render(animate) {
    svg.setAttribute("viewBox", VIEW[layout]);
    svg.classList.toggle("plant--d", layout === "d");
    svg.textContent = "";
    const gPipes = el("g", { class: "pipes" });
    const gFlows = el("g", { class: "flows", "aria-hidden": "true" });
    const gNodes = el("g", { class: "nodes" });
    svg.append(gPipes, gFlows, gNodes);

    P.pipes.forEach((pipe, i) => {
      const pts = points(pipe);
      const d = toD(pts);
      const len = lengthOf(pts);
      const path = el("path", { d, class: `pipe pipe--${pipe.type}`, "data-from": pipe.from, "data-to": pipe.to });
      path.style.setProperty("--len", len);
      path.style.setProperty("--delay", 0.15 + i * 0.06 + "s");
      gPipes.append(path);
      if (pipe.type !== "signal" && pipe.type !== "planned") {
        gFlows.append(el("path", { d, class: `flow flow--${pipe.type}` }));
      }
      if (pipe.label) {
        // Rótulo no meio do segmento mais longo.
        let best = 0, bi = 1;
        for (let k = 1; k < pts.length; k++) {
          const l = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
          if (l > best) { best = l; bi = k; }
        }
        const [x1, y1] = pts[bi - 1], [x2, y2] = pts[bi];
        const vertical = x1 === x2;
        const t = el("text", {
          class: "lbl lbl-pipe",
          x: (x1 + x2) / 2 + (vertical ? 0 : 0),
          y: (y1 + y2) / 2 + (vertical ? 0 : -10),
          "aria-hidden": "true",
        });
        if (vertical) t.setAttribute("transform", `rotate(-90 ${(x1 + x2) / 2} ${(y1 + y2) / 2}) translate(0 -10)`);
        t.textContent = pipe.label;
        gPipes.append(t);
      }
    });

    const order = P.tour;
    P.nodes.forEach((n) => {
      const [x, y] = n[layout];
      const g = el("g", {
        class: `node node--${n.status}${n.featured ? " node--featured" : ""}`,
        transform: `translate(${x} ${y})`,
        tabindex: "0",
        role: "button",
        "data-tag": n.tag,
        "aria-label": `${n.tag}, ${n.name}. Abrir folha de dados`,
      });
      g.style.setProperty("--delay", 0.1 + order.indexOf(n.tag) * 0.07 + "s");
      // O case principal é desenhado maior que os outros tanques.
      const scale = n.featured ? 1.3 : 1;
      const h = HALF[n.kind] * scale;
      const halo = el("rect", { class: "halo", x: -74 * scale, y: -h - (n.kind === "reactor" ? 40 : n.kind === "valve" ? 46 : 8), width: 148 * scale, height: h * 2 + 90 + (n.kind === "reactor" ? 32 : n.kind === "valve" ? 38 : 0) + (n.featured ? 18 : 0), rx: 6 });
      g.append(halo);
      const sym = el("g", { "aria-hidden": "true", transform: `scale(${scale})` });
      sym.innerHTML = symbol(n);
      g.append(sym);

      let ly = h + 22;
      const tag = el("text", { class: "lbl lbl-tag", x: 0, y: ly, "aria-hidden": "true" });
      tag.textContent = n.tag;
      g.append(tag);
      splitName(n.name).forEach((line) => {
        ly += 18;
        const t = el("text", { class: "lbl lbl-name", x: 0, y: ly, "aria-hidden": "true" });
        t.textContent = line;
        g.append(t);
      });
      if (n.featured) {
        ly += 17;
        const f = el("text", { class: "lbl lbl-feature", x: 0, y: ly, "aria-hidden": "true" });
        f.textContent = "case principal";
        g.append(f);
      }
      if (STATUS_TEXT[n.status]) {
        ly += 17;
        const s = el("text", { class: "lbl lbl-status", x: 0, y: ly, "aria-hidden": "true" });
        s.textContent = STATUS_TEXT[n.status];
        g.append(s);
      }
      gNodes.append(g);
    });

    if (animate && !reduced) {
      svg.classList.add("is-drawing");
      setTimeout(() => svg.classList.remove("is-drawing"), 2600);
    }
    if (current) mark(current.tag);
  }

  // ---------- Destaque de linhas conectadas ----------
  function light(tag, on) {
    svg.querySelectorAll(`.pipe[data-from="${tag}"], .pipe[data-to="${tag}"]`).forEach((p) => p.classList.toggle("is-lit", on));
  }
  function mark(tag) {
    svg.querySelectorAll(".node.is-selected").forEach((n) => n.classList.remove("is-selected"));
    const g = svg.querySelector(`.node[data-tag="${tag}"]`);
    if (g) g.classList.add("is-selected");
  }

  svg.addEventListener("pointerover", (e) => { const g = e.target.closest(".node"); if (g) light(g.dataset.tag, true); });
  svg.addEventListener("pointerout", (e) => { const g = e.target.closest(".node"); if (g) light(g.dataset.tag, false); });
  svg.addEventListener("focusin", (e) => { const g = e.target.closest(".node"); if (g) light(g.dataset.tag, true); });
  svg.addEventListener("focusout", (e) => { const g = e.target.closest(".node"); if (g) light(g.dataset.tag, false); });
  svg.addEventListener("click", (e) => { const g = e.target.closest(".node"); if (g) open(g.dataset.tag, g); });
  svg.addEventListener("keydown", (e) => {
    const g = e.target.closest(".node");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(g.dataset.tag, g); }
  });

  // ---------- Folha de dados ----------
  const ds = document.getElementById("datasheet");
  const dsBody = ds.querySelector("tbody");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function contactList() {
    const p = P.person;
    return `<ul>
      <li><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></li>
      <li><a href="${esc(p.linkedin)}">LinkedIn</a></li>
      <li><a href="${esc(p.github)}">GitHub</a></li></ul>`;
  }
  function rows(n) {
    return [
      ["Serviço", esc(n.service)],
      ["Status", `<span class="status-pill status-pill--${n.status}">${STATUS_LONG[n.status]}</span>`],
      ...(n.problem ? [["Problema", esc(n.problem)]] : []),
      ["Entra", esc(n.inputs)],
      ["Sai", esc(n.outputs)],
      ...(n.extra || []).map(([k, v]) => [esc(k), esc(v)]),
      [n.instruments === "contact" ? "Canais" : "Instrumentos", n.instruments === "contact" ? contactList() : esc(n.instruments)],
      ["Notas", esc(n.notes)],
      ...(n.demo ? [["Demo", `<a href="${esc(n.demo)}">Abrir a versão pública</a>`]] : []),
    ];
  }

  function open(tag, fromEl) {
    const n = byTag.get(tag);
    if (!n) return false;
    if (!ds.classList.contains("is-open")) returnFocus = fromEl || document.activeElement;
    current = n;
    ds.querySelector(".ds-tag").textContent = n.tag;
    ds.querySelector(".ds-name").textContent = n.name;
    dsBody.innerHTML = rows(n).map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("");
    const i = P.tour.indexOf(tag);
    ds.querySelector(".ds-count").textContent = `${i + 1} de ${P.tour.length}`;
    ds.querySelector(".ds-prev").disabled = i <= 0;
    ds.querySelector(".ds-next").disabled = i >= P.tour.length - 1;
    ds.classList.add("is-open");
    ds.removeAttribute("inert");
    ds.setAttribute("aria-hidden", "false");
    ds.querySelector("table").scrollTop = 0;
    mark(tag);
    document.getElementById("ds-title").focus({ preventScroll: true });
    return true;
  }
  function close() {
    if (!ds.classList.contains("is-open")) return;
    ds.classList.remove("is-open");
    ds.setAttribute("aria-hidden", "true");
    ds.setAttribute("inert", "");
    svg.querySelectorAll(".node.is-selected").forEach((g) => g.classList.remove("is-selected"));
    current = null;
    const target = returnFocus && document.contains(returnFocus) ? returnFocus : null;
    if (target) target.focus({ preventScroll: true });
    returnFocus = null;
  }
  function step(delta) {
    if (!current) return;
    const i = P.tour.indexOf(current.tag) + delta;
    if (i >= 0 && i < P.tour.length) open(P.tour[i]);
  }
  ds.querySelector(".ds-close").addEventListener("click", close);
  ds.querySelector(".ds-prev").addEventListener("click", () => step(-1));
  ds.querySelector(".ds-next").addEventListener("click", () => step(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (ds.classList.contains("is-open") && e.target.tagName !== "INPUT") {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
  });

  // ---------- Planta em operação ----------
  const runBtn = document.getElementById("run");
  function setRunning(on) {
    running = on;
    svg.classList.toggle("is-running", on);
    runBtn.setAttribute("aria-pressed", String(on));
    runBtn.textContent = on ? "Parar a planta" : "Partir a planta";
  }
  runBtn.addEventListener("click", () => {
    setRunning(!running);
    log(running ? "Planta em operação. Bombas ligadas, tanques enchendo." : "Planta parada. Nada se perde: o estado fica no Cérebro-Luan.");
  });

  document.getElementById("tour").addEventListener("click", (e) => {
    if (!running) setRunning(true);
    open(P.tour[0], e.currentTarget);
  });

  // ---------- Tema ----------
  document.getElementById("theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("planta-tema", root.dataset.theme); } catch (err) { /* sem armazenamento: o tema vale só nesta visita */ }
    log(dark ? "Folha de desenho, modo dia." : "Sala de controle, turno da noite.");
  });

  // ---------- Versão em texto ----------
  const texto = document.getElementById("texto");
  function buildText() {
    document.getElementById("texto-list").innerHTML = P.tour.map((tag) => {
      const n = byTag.get(tag);
      return `<article><h3><small>${n.tag}</small>${esc(n.name)}</h3><dl>${rows(n).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></article>`;
    }).join("");
  }
  function showText() {
    texto.hidden = false;
    texto.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    document.getElementById("texto-title").setAttribute("tabindex", "-1");
    document.getElementById("texto-title").focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-action="texto"]').forEach((b) => b.addEventListener("click", showText));
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    if (!running) setRunning(true);
    open(b.dataset.open, b);
  }));
  document.querySelector(".skip").addEventListener("click", () => { texto.hidden = false; });

  // ---------- Indicadores ----------
  document.getElementById("gauges").innerHTML = P.gauges.map((g) =>
    `<li><div class="bubble" aria-hidden="true"><b>${esc(g.letters)}</b><span>${esc(g.value)}</span></div><p><span class="sr-only">${esc(g.value)} </span>${esc(g.label)}</p></li>`
  ).join("");

  // ---------- Console ----------
  const logEl = document.getElementById("log");
  const input = document.getElementById("cmd");
  const history = [];
  let hIndex = 0;

  function log(text, cls) {
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.textContent = text;
    logEl.append(li);
    while (logEl.children.length > 40) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
    return li;
  }
  function logTags(prefix, tags) {
    const li = log(prefix);
    tags.forEach((t, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.addEventListener("click", () => open(t, b));
      li.append(i ? ", " : " ", b);
    });
  }
  function find(q) {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    const norm = (x) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return P.nodes.find((n) => n.tag.toLowerCase() === s)
      || P.nodes.find((n) => norm(n.name).includes(norm(s)))
      || P.nodes.find((n) => n.tag.toLowerCase().includes(s));
  }

  const COMMANDS = {
    ajuda() {
      log("Comandos: sobre, lista, abrir <tag ou nome>, tour, partir, parar, contato, stack, tema, texto, limpar.");
    },
    sobre() {
      log("Luan, estudante de Engenharia Química na UFSC (conclusão prevista em 2028.1). Uso IA como alavanca para construir ferramentas de ponta a ponta, com revisão cruzada e aprovação humana.");
    },
    lista() { logTags("Equipamentos:", P.tour); },
    ls() { COMMANDS.lista(); },
    abrir(arg) {
      const n = find(arg || "");
      if (n) open(n.tag, input);
      else log(`Nenhum equipamento encontrado para "${arg || ""}". Digite lista para ver as tags.`, "warn");
    },
    open(arg) { COMMANDS.abrir(arg); },
    tour() { if (!running) setRunning(true); open(P.tour[0], input); },
    partir() { setRunning(true); log("Planta em operação."); },
    parar() { setRunning(false); log("Planta parada."); },
    contato() { open("N-900", input); },
    stack() {
      log("Claude Code, Codex, Claude, ChatGPT e Gemini; MCP; TypeScript, Cloudflare D1 e Drizzle; Python; Google Apps Script e Planilhas; Canva; Git. Ainda não usei n8n, Make ou Zapier em produção.");
    },
    tema() { document.getElementById("theme").click(); },
    texto() { showText(); },
    limpar() { logEl.textContent = ""; },
    clear() { COMMANDS.limpar(); },
    sudo() {
      log("Permissão negada. Toda ação externa passa pelo XV-450 e precisa de aprovação humana explícita.", "warn");
      const g = svg.querySelector('.node[data-tag="XV-450"]');
      if (g) { light("XV-450", true); setTimeout(() => light("XV-450", false), 1800); }
    },
  };

  document.getElementById("prompt").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    input.value = "";
    if (!raw) return;
    history.push(raw);
    hIndex = history.length;
    log("$ " + raw, "you");
    const [cmd, ...rest] = raw.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    if (fn) fn(rest.join(" "));
    else if (find(raw)) open(find(raw).tag, input);
    else log(`Comando não reconhecido: ${cmd}. Digite ajuda.`, "warn");
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && hIndex > 0) { hIndex--; input.value = history[hIndex]; e.preventDefault(); }
    if (e.key === "ArrowDown" && hIndex < history.length) { hIndex++; input.value = history[hIndex] || ""; e.preventDefault(); }
  });

  // ---------- Início ----------
  mq.addEventListener("change", () => { layout = mq.matches ? "m" : "d"; render(false); });
  render(true);
  buildText();
  log("Planta Luan, revisão A. Desenho carregado.");
  logTags("Clique num equipamento, digite ajuda, ou comece por", ["T-201", "R-301", "TK-501"]);
  setTimeout(() => setRunning(true), reduced ? 0 : 2200);
})();

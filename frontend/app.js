"use strict";

const API = "";
let TOKEN = localStorage.getItem("aoneart_token") || null;
let CURRENT_USER = null;
let CUSTOMERS_CACHE = [];
let currentView = "dashboard";
let reportDate = new Date();

// ---------- helpers ----------

function money(n) {
  n = Number(n || 0);
  return "Rs " + n.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function api(path, { method = "GET", body = null, isForm = false } = {}) {
  const headers = {};
  if (TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : null,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || "Kuch ghalat ho gaya");
  }
  return data;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

// ---------- section field configs ----------

const SECTION_LABEL = {
  wall_clocks: "Wall Clocks",
  watches: "Watches",
  ads: "Ads",
  other: "Other Expenses",
};

function canEdit(section) {
  if (!CURRENT_USER) return false;
  return CURRENT_USER.role === "admin" || CURRENT_USER.section === section;
}

// ---------- modal ----------

function openModal(title, bodyNode) {
  const tpl = document.getElementById("tpl-modal");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = title;
  node.querySelector(".modal-body").appendChild(bodyNode);
  node.querySelector(".modal-close").onclick = () => node.remove();
  node.addEventListener("click", (e) => { if (e.target === node) node.remove(); });
  document.body.appendChild(node);
  return node;
}

// ---------- auth ----------

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  try {
    const data = await api("/api/login", { method: "POST", body: { username, password } });
    TOKEN = data.token;
    CURRENT_USER = data.user;
    localStorage.setItem("aoneart_token", TOKEN);
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem("aoneart_token");
  document.getElementById("app-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
});

async function tryAutoLogin() {
  if (!TOKEN) return;
  try {
    CURRENT_USER = await api("/api/me");
    enterApp();
  } catch (e) {
    TOKEN = null;
    localStorage.removeItem("aoneart_token");
  }
}

function enterApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("user-name").textContent = `${CURRENT_USER.name} · ${CURRENT_USER.role === "admin" ? "Admin" : SECTION_LABEL[CURRENT_USER.section]}`;
  loadCustomers();
  setView("dashboard");
}

// ---------- nav ----------

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const titles = { dashboard: "Dashboard", wall_clocks: "Wall Clocks", watches: "Watches", ads: "Ads", more: "More" };
  document.getElementById("page-title").textContent = titles[view] || "AOneArt";
  const root = document.getElementById("view-root");
  root.innerHTML = "";
  if (view === "dashboard") renderDashboard(root);
  else if (["wall_clocks", "watches", "ads"].includes(view)) renderSection(root, view);
  else if (view === "more") renderMore(root);
  else if (view === "other") renderSection(root, "other");
  else if (view === "investments") renderInvestments(root);
  else if (view === "report") renderReport(root);
  else if (view === "audit") renderAudit(root);
}

// expose for "more" menu buttons
window.setView = setView;

// ---------- customers ----------

async function loadCustomers() {
  try { CUSTOMERS_CACHE = await api("/api/customers"); } catch (e) { /* ignore */ }
}

function customerSelectHTML(selectedId) {
  const opts = CUSTOMERS_CACHE.map(
    (c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(c.name)}${c.phone ? " · " + escapeHtml(c.phone) : ""}</option>`
  ).join("");
  return `<option value="">-- Naya customer --</option>${opts}`;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// ---------- dashboard ----------

async function renderDashboard(root) {
  root.innerHTML = `<div class="empty-state">Loading...</div>`;
  try {
    const now = new Date();
    const report = await api(`/api/report/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
    const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });
    root.innerHTML = "";
    const head = el(`<div class="section-head"><h2>This Month — ${monthName}</h2></div>`);
    root.appendChild(head);

    const grid = el(`<div class="stat-grid"></div>`);
    grid.appendChild(el(statCard("Total Sales", money(report.totals.sales))));
    grid.appendChild(el(statCard("Total Costs", money(report.totals.costs))));
    grid.appendChild(el(statCard("Net Profit", money(report.totals.net_profit))));
    grid.appendChild(el(statCard("Investments In", money(report.investments.total))));
    root.appendChild(grid);

    root.appendChild(el(sectionMini("Wall Clocks", report.wall_clocks.count, money(report.wall_clocks.profit), "profit")));
    root.appendChild(el(sectionMini("Watches", report.watches.count, money(report.watches.profit), "profit")));
    root.appendChild(el(sectionMini("Ads spend", report.ads.count, money(report.ads.spend), "spend")));
    root.appendChild(el(sectionMini("Other expenses", report.other.count, money(report.other.spend), "spend")));

    const goReport = el(`<button class="btn-secondary" style="margin-top:10px;width:100%">Full monthly report &rarr;</button>`);
    goReport.onclick = () => setView("report");
    root.appendChild(goReport);
  } catch (err) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function sectionMini(name, count, value, kind) {
  return `<div class="card"><div class="card-top"><b>${name}</b><span class="card-date">${count} entries</span></div>
    <div class="card-figures"><div class="figure"><div class="label">${kind === "profit" ? "Profit" : "Spend"}</div><div class="value">${value}</div></div></div></div>`;
}

// ---------- generic section list + form ----------

async function renderSection(root, section) {
  root.innerHTML = `<div class="empty-state">Loading...</div>`;
  let entries = [];
  try { entries = await api(`/api/entries/${section}`); }
  catch (err) { root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; return; }

  root.innerHTML = "";
  const head = el(`<div class="section-head"><h2>${SECTION_LABEL[section]}</h2></div>`);
  if (canEdit(section)) {
    const addBtn = el(`<button class="btn-add">+ Add</button>`);
    addBtn.onclick = () => openEntryForm(section);
    head.appendChild(addBtn);
  }
  root.appendChild(head);

  if (entries.length === 0) {
    root.appendChild(el(`<div class="empty-state">Abhi tak koi entry nahi hai.</div>`));
    return;
  }
  entries.forEach((entry) => root.appendChild(renderEntryCard(section, entry)));
}

function renderEntryCard(section, entry) {
  let figures = "";
  let desc = entry.description || "";
  let customerLine = "";

  if (section === "wall_clocks") {
    figures = `
      <div class="figure"><div class="label">Cutting</div><div class="value">${money(entry.cutting_dealer_cost)}</div></div>
      <div class="figure"><div class="label">Paint</div><div class="value">${money(entry.paint_dealer_cost)}</div></div>
      <div class="figure"><div class="label">Other charges</div><div class="value">${money(entry.other_charges)}</div></div>
      <div class="figure"><div class="label">Sale price</div><div class="value">${money(entry.sale_price)}</div></div>
      <div class="figure"><div class="label">Delivery</div><div class="value">${money(entry.delivery_charge)}</div></div>
      <div class="figure"><div class="label">Profit</div><div class="value ${entry.profit >= 0 ? "profit-pos" : "profit-neg"}">${money(entry.profit)}</div></div>`;
    if (entry.customer) customerLine = `<div class="card-desc"><b>Customer:</b> ${escapeHtml(entry.customer.name)}${entry.customer.phone ? " · " + escapeHtml(entry.customer.phone) : ""}</div>`;
    if (entry.other_charges_desc) desc += (desc ? " — " : "") + entry.other_charges_desc;
  } else if (section === "watches") {
    figures = `
      <div class="figure"><div class="label">Buy price</div><div class="value">${money(entry.buy_price)}</div></div>
      <div class="figure"><div class="label">Sale price</div><div class="value">${money(entry.sale_price)}</div></div>
      <div class="figure"><div class="label">Delivery</div><div class="value">${money(entry.delivery_charge)}</div></div>
      <div class="figure"><div class="label">Profit</div><div class="value ${entry.profit >= 0 ? "profit-pos" : "profit-neg"}">${money(entry.profit)}</div></div>`;
    if (entry.customer) customerLine = `<div class="card-desc"><b>Customer:</b> ${escapeHtml(entry.customer.name)}${entry.customer.phone ? " · " + escapeHtml(entry.customer.phone) : ""}</div>`;
  } else if (section === "ads") {
    figures = `
      <div class="figure"><div class="label">Daily budget</div><div class="value">${money(entry.daily_budget)}</div></div>
      <div class="figure"><div class="label">Ads running</div><div class="value">${entry.ads_count}</div></div>`;
  } else if (section === "other") {
    figures = `
      <div class="figure"><div class="label">${escapeHtml(entry.expense_type || "Other")}</div><div class="value">${money(entry.amount)}</div></div>`;
  }

  const card = el(`
    <div class="card">
      <div class="card-top"><b>${entry.date || ""}</b><span class="card-date">by ${escapeHtml(entry.created_by || "?")}</span></div>
      <div class="card-figures">${figures}</div>
      ${customerLine}
      ${desc ? `<div class="card-desc">${escapeHtml(desc)}</div>` : ""}
      ${entry.image_path ? `<img class="card-thumb" src="${entry.image_path}" />` : ""}
      <div class="card-meta">Updated ${new Date(entry.updated_at).toLocaleString()}</div>
    </div>
  `);

  if (canEdit(section)) {
    const actions = el(`<div class="card-actions"></div>`);
    const editBtn = el(`<button>Edit</button>`);
    editBtn.onclick = () => openEntryForm(section, entry);
    const delBtn = el(`<button class="danger">Delete</button>`);
    delBtn.onclick = () => confirmDelete(section, entry);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
  }
  return card;
}

function confirmDelete(section, entry) {
  const body = el(`
    <div>
      <p>Ye entry delete karni hai? Ye history mai audit log ke through record rahega.</p>
      <div class="form-actions">
        <button class="btn-secondary" id="cancel-del">Cancel</button>
        <button class="btn-primary" id="confirm-del" style="background:var(--danger)">Delete</button>
      </div>
    </div>
  `);
  const modal = openModal("Confirm delete", body);
  body.querySelector("#cancel-del").onclick = () => modal.remove();
  body.querySelector("#confirm-del").onclick = async () => {
    try {
      const endpoint = section === "investment" ? `/api/investments/${entry.id}` : `/api/entries/${section}/${entry.id}`;
      await api(endpoint, { method: "DELETE" });
      modal.remove();
      toast("Delete ho gaya");
      setView(currentView);
    } catch (err) { toast(err.message); }
  };
}

function fieldsFor(section) {
  const common = [{ key: "date", label: "Date", type: "date", required: true }];
  if (section === "wall_clocks") {
    return common.concat([
      { key: "cutting_dealer_cost", label: "Cutting dealer cost", type: "number" },
      { key: "paint_dealer_cost", label: "Paint dealer cost", type: "number" },
      { key: "other_charges", label: "Other charges", type: "number" },
      { key: "other_charges_desc", label: "Other charges — what for", type: "text" },
      { key: "customer_select", label: "Customer", type: "customer" },
      { key: "sale_price", label: "Sale price to customer", type: "number" },
      { key: "delivery_charge", label: "Delivery charge", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "image", label: "Photo (optional)", type: "file" },
    ]);
  }
  if (section === "watches") {
    return common.concat([
      { key: "buy_price", label: "Buy price", type: "number" },
      { key: "sale_price", label: "Sale price", type: "number" },
      { key: "delivery_charge", label: "Delivery charge", type: "number" },
      { key: "customer_select", label: "Customer", type: "customer" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "image", label: "Photo (optional)", type: "file" },
    ]);
  }
  if (section === "ads") {
    return common.concat([
      { key: "daily_budget", label: "Meta ads — budget per day", type: "number" },
      { key: "ads_count", label: "Number of ads running", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
    ]);
  }
  if (section === "other") {
    return common.concat([
      { key: "expense_type", label: "Type", type: "select", options: ["petrol", "food", "other"] },
      { key: "amount", label: "Amount", type: "number" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "image", label: "Photo (optional)", type: "file" },
    ]);
  }
  return common;
}

function fieldHTML(f, entry) {
  const val = (k) => (entry ? entry[k] : "") ?? "";
  if (f.type === "textarea") {
    return `<label>${f.label}<textarea name="${f.key}">${escapeHtml(val(f.key))}</textarea></label>`;
  }
  if (f.type === "select") {
    const opts = f.options.map((o) => `<option value="${o}" ${val(f.key) === o ? "selected" : ""}>${o}</option>`).join("");
    return `<label>${f.label}<select name="${f.key}">${opts}</select></label>`;
  }
  if (f.type === "customer") {
    return `<label>${f.label}<select name="customer_id">${customerSelectHTML(entry && entry.customer ? entry.customer.id : "")}</select></label>
      <label>New customer name <span style="opacity:.6">(agar naya hai)</span><input type="text" name="new_customer_name" /></label>
      <label>New customer phone<input type="text" name="new_customer_phone" /></label>`;
  }
  if (f.type === "file") {
    return `<label>${f.label}<input type="file" name="${f.key}" accept="image/*" /></label>`;
  }
  return `<label>${f.label}<input type="${f.type}" name="${f.key}" value="${escapeHtml(val(f.key))}" ${f.required ? "required" : ""} /></label>`;
}

function openEntryForm(section, entry = null) {
  const fields = fieldsFor(section);
  const form = el(`<form class="form-grid"></form>`);
  fields.forEach((f) => {
    const wrap = el(`<div style="display:contents"></div>`);
    wrap.innerHTML = fieldHTML(f, entry);
    Array.from(wrap.children).forEach((c) => form.appendChild(c));
  });
  if (!entry) {
    const dateInput = form.querySelector('[name="date"]');
    if (dateInput) dateInput.value = todayStr();
  }
  const actions = el(`<div class="form-actions">
      <button type="button" class="btn-secondary" id="cancel-entry">Cancel</button>
      <button type="submit" class="btn-primary">${entry ? "Save changes" : "Add entry"}</button>
    </div>`);
  form.appendChild(actions);

  const modal = openModal(entry ? `Edit — ${SECTION_LABEL[section]}` : `Add — ${SECTION_LABEL[section]}`, form);
  form.querySelector("#cancel-entry").onclick = () => modal.remove();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      let customerId = form.customer_id ? form.customer_id.value : null;
      const newName = form.new_customer_name ? form.new_customer_name.value.trim() : "";
      if (newName) {
        const c = await api("/api/customers", { method: "POST", body: { name: newName, phone: form.new_customer_phone.value.trim() } });
        customerId = c.id;
        CUSTOMERS_CACHE.push(c);
      }
      const fd = new FormData();
      fields.forEach((f) => {
        if (f.type === "customer" || f.type === "file") return;
        fd.append(f.key, form[f.key] ? form[f.key].value : "");
      });
      if (customerId) fd.append("customer_id", customerId);
      const fileInput = form.querySelector('[name="image"]');
      if (fileInput && fileInput.files[0]) fd.append("image", fileInput.files[0]);

      if (entry) await api(`/api/entries/${section}/${entry.id}`, { method: "PUT", body: fd, isForm: true });
      else await api(`/api/entries/${section}`, { method: "POST", body: fd, isForm: true });

      modal.remove();
      toast(entry ? "Update ho gaya" : "Add ho gaya");
      setView(currentView);
    } catch (err) { toast(err.message); }
  });
}

// ---------- more menu ----------

function renderMore(root) {
  const list = el(`<div class="more-list"></div>`);
  const items = [
    ["other", "Other Expenses", "Petrol, food, misc"],
    ["investments", "Investments", "Who invested how much, in which section"],
    ["report", "Monthly Report", "Sales, cost, profit per month"],
    ["audit", "Audit Log", "Who changed what, and when"],
  ];
  items.forEach(([view, title, sub]) => {
    const b = el(`<button>${title}<span>&rarr;</span></button>`);
    const subEl = document.createElement("span");
    subEl.className = "sub";
    subEl.textContent = sub;
    b.insertBefore(subEl, b.lastElementChild);
    b.onclick = () => setView(view);
    list.appendChild(b);
  });
  root.appendChild(el(`<div class="section-head"><h2>More</h2></div>`));
  root.appendChild(list);
}

// ---------- investments ----------

async function renderInvestments(root) {
  root.innerHTML = `<div class="empty-state">Loading...</div>`;
  let rows = [];
  try { rows = await api("/api/investments"); }
  catch (err) { root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; return; }
  root.innerHTML = "";
  const head = el(`<div class="section-head"><h2>Investments</h2></div>`);
  const addBtn = el(`<button class="btn-add">+ Add</button>`);
  addBtn.onclick = () => openInvestmentForm();
  head.appendChild(addBtn);
  root.appendChild(head);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  root.appendChild(el(statCardWrap("Total invested", money(total))));

  if (rows.length === 0) { root.appendChild(el(`<div class="empty-state">Abhi tak koi investment record nahi.</div>`)); return; }

  rows.forEach((r) => {
    const card = el(`
      <div class="card">
        <div class="card-top"><b>${escapeHtml(r.investor_name || "?")}</b><span class="card-date">${r.date}</span></div>
        <div class="card-figures">
          <div class="figure"><div class="label">Amount</div><div class="value">${money(r.amount)}</div></div>
          <div class="figure"><div class="label">Section</div><div class="value">${SECTION_LABEL[r.section] || r.section}</div></div>
        </div>
        ${r.description ? `<div class="card-desc">${escapeHtml(r.description)}</div>` : ""}
        ${r.image_path ? `<img class="card-thumb" src="${r.image_path}" />` : ""}
        <div class="card-meta">Added by ${escapeHtml(r.created_by || "?")} · ${new Date(r.updated_at).toLocaleString()}</div>
      </div>
    `);
    if (CURRENT_USER.role === "admin") {
      const actions = el(`<div class="card-actions"></div>`);
      const editBtn = el(`<button>Edit</button>`);
      editBtn.onclick = () => openInvestmentForm(r);
      const delBtn = el(`<button class="danger">Delete</button>`);
      delBtn.onclick = () => confirmDelete("investment", r);
      actions.appendChild(editBtn); actions.appendChild(delBtn);
      card.appendChild(actions);
    }
    root.appendChild(card);
  });
}

function statCardWrap(label, value) {
  return `<div class="stat-card" style="margin-bottom:14px">${statCard(label, value)}</div>`.replace(/^<div class="stat-card"[^>]*>/, '<div class="stat-card" style="margin-bottom:14px">');
}

function openInvestmentForm(entry = null) {
  const form = el(`<form class="form-grid">
    <label>Date<input type="date" name="date" required /></label>
    <label>Investor name<input type="text" name="investor_name" required /></label>
    <label>Amount<input type="number" name="amount" required /></label>
    <label>Section<select name="section">
      <option value="general">General / whole business</option>
      <option value="wall_clocks">Wall Clocks</option>
      <option value="watches">Watches</option>
      <option value="ads">Ads</option>
      <option value="other">Other</option>
    </select></label>
    <label>Description<textarea name="description"></textarea></label>
    <label>Photo (optional)<input type="file" name="image" accept="image/*" /></label>
    <div class="form-actions">
      <button type="button" class="btn-secondary" id="cancel-inv">Cancel</button>
      <button type="submit" class="btn-primary">${entry ? "Save changes" : "Add investment"}</button>
    </div>
  </form>`);
  if (entry) {
    form.date.value = entry.date;
    form.investor_name.value = entry.investor_name || "";
    form.amount.value = entry.amount;
    form.section.value = entry.section;
    form.description.value = entry.description || "";
  } else {
    form.date.value = todayStr();
  }
  const modal = openModal(entry ? "Edit investment" : "Add investment", form);
  form.querySelector("#cancel-inv").onclick = () => modal.remove();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(form);
      if (entry) await api(`/api/investments/${entry.id}`, { method: "PUT", body: fd, isForm: true });
      else await api("/api/investments", { method: "POST", body: fd, isForm: true });
      modal.remove();
      toast("Saved");
      setView("investments");
    } catch (err) { toast(err.message); }
  });
}

// ---------- monthly report ----------

async function renderReport(root) {
  root.innerHTML = `<div class="empty-state">Loading...</div>`;
  const y = reportDate.getFullYear();
  const m = reportDate.getMonth() + 1;
  let r;
  try { r = await api(`/api/report/monthly?year=${y}&month=${m}`); }
  catch (err) { root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; return; }
  root.innerHTML = "";
  root.appendChild(el(`<div class="section-head"><h2>Monthly Report</h2></div>`));
  const switcher = el(`<div class="month-switch">
    <button id="prev-m">&larr;</button>
    <span>${reportDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
    <button id="next-m">&rarr;</button>
  </div>`);
  root.appendChild(switcher);
  switcher.querySelector("#prev-m").onclick = () => { reportDate.setMonth(reportDate.getMonth() - 1); renderReport(root); };
  switcher.querySelector("#next-m").onclick = () => { reportDate.setMonth(reportDate.getMonth() + 1); renderReport(root); };

  const grid = el(`<div class="stat-grid"></div>`);
  grid.appendChild(el(statCard("Total Sales", money(r.totals.sales))));
  grid.appendChild(el(statCard("Total Costs", money(r.totals.costs))));
  grid.appendChild(el(statCard("Net Profit", money(r.totals.net_profit))));
  grid.appendChild(el(statCard("Investments In", money(r.investments.total))));
  root.appendChild(grid);

  const rows = [
    ["Wall Clocks", r.wall_clocks.count, `Sales ${money(r.wall_clocks.sales)} · Cost ${money(r.wall_clocks.cost)}`, money(r.wall_clocks.profit)],
    ["Watches", r.watches.count, `Sales ${money(r.watches.sales)} · Cost ${money(r.watches.cost)}`, money(r.watches.profit)],
    ["Ads", r.ads.count, "Spend", money(r.ads.spend)],
    ["Other Expenses", r.other.count, "Spend", money(r.other.spend)],
  ];
  rows.forEach(([name, count, sub, val]) => {
    root.appendChild(el(`<div class="card"><div class="card-top"><b>${name}</b><span class="card-date">${count} entries</span></div>
      <div class="card-desc">${sub}</div>
      <div class="card-figures"><div class="figure"><div class="label">Total</div><div class="value">${val}</div></div></div></div>`));
  });
}

// ---------- audit log ----------

async function renderAudit(root) {
  root.innerHTML = `<div class="empty-state">Loading...</div>`;
  let rows = [];
  try { rows = await api("/api/audit-log"); }
  catch (err) { root.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; return; }
  root.innerHTML = "";
  root.appendChild(el(`<div class="section-head"><h2>Audit Log</h2></div>`));
  if (rows.length === 0) { root.appendChild(el(`<div class="empty-state">Abhi tak koi change record nahi.</div>`)); return; }
  const wrap = el(`<div class="card"></div>`);
  rows.forEach((r) => {
    const item = el(`<div class="audit-item">
      <div><b>${escapeHtml(r.changed_by)}</b> ${r.action}d a <b>${r.table_name.replace("_", " ")}</b> record (#${r.record_id})</div>
      <div class="when">${new Date(r.changed_at).toLocaleString()}</div>
    </div>`);
    wrap.appendChild(item);
  });
  root.appendChild(wrap);
}

// ---------- boot ----------

tryAutoLogin();

// service worker registration (best-effort, ignored if unsupported)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const form = document.getElementById('searchForm');
const resultsDiv = document.getElementById('results');
const sortHidden = document.getElementById('sort');
const sortButtons = document.querySelectorAll('.sort-pill-group .btn');
const searchBtn = document.getElementById('searchBtn');

sortButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    sortButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    sortHidden.value = btn.getAttribute('data-sort');
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const q = document.getElementById('q').value.trim();
  const qty = document.getElementById('qty').value;
  const sort = document.getElementById('sort').value;

  if (!q) return;

  resultsDiv.innerHTML = `
    <div class="alert-soft d-flex align-items-center gap-2">
      <div class="spinner-border spinner-border-sm" role="status"></div>
      <div>Идёт поиск по запросу <strong>${escapeHtml(q)}</strong>...</div>
    </div>
  `;

  searchBtn.disabled = true;
  const originalText = searchBtn.innerHTML;
  searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Поиск...';

  const params = new URLSearchParams({ q, qty, sort });

  try {
    const res = await fetch('api.php?' + params.toString());
    const data = await res.json();
    renderResults(data, q);
  } catch (err) {
    console.error(err);
    resultsDiv.innerHTML = `
      <div class="alert alert-danger rounded-4">
        Не удалось получить данные с сервера. Проверьте подключение или лог сервера.
      </div>
    `;
  } finally {
    searchBtn.disabled = false;
    searchBtn.innerHTML = originalText;
  }
});

function formatMoney(v) {
  return v.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// основной рендер результатов
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function renderResults(data, query) {
  const container =
    document.getElementById("resultsContainer") ||
    document.getElementById("results-container");

  if (!container) return;

  container.innerHTML = "";

  if (data.error) {
    container.innerHTML = `
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <p class="mb-1 text-secondary">Результаты для запроса: <span class="fw-semibold text-primary">${escapeHtml(
            query
          )}</span></p>
          <p class="mb-0 text-danger">${escapeHtml(data.error)}</p>
        </div>
      </div>
    `;
    return;
  }

  const offers = Array.isArray(data.offers) ? data.offers : [];

  // считаем поставщиков и товаров
  const supplierSet = new Set();
  const productSet = new Set();

  offers.forEach((o) => {
    if (o.supplier_name) {
      const key = `${o.supplier_name}|${o.city || ""}`;
      supplierSet.add(key);
    }
    if (o.product_id != null) {
      productSet.add(o.product_id);
    }
  });

  const suppliersCount = supplierSet.size;
  const productsCount =
    typeof data.distinct_products === "number"
      ? data.distinct_products
      : productSet.size;

  // карточка с результатами
  const summaryHtml = `
    <div class="card shadow-sm mb-4">
      <div class="card-body position-relative">
        <div class="d-flex justify-content-between flex-wrap gap-2">
          <div>
            <p class="mb-1 text-secondary">
              Результаты для запроса:
              <span class="fw-semibold text-primary" id="resultsQuery">
                ${escapeHtml(query)}
              </span>
            </p>
            <p class="mb-1">
              Найдено товаров:
              <span class="fw-semibold">${productsCount}</span>
              по запросу "<span class="fst-italic">${escapeHtml(
                query
              )}</span>".
            </p>
            <p class="mb-0 text-muted small">
              Итоговый подбор по цене и сроку выполняется только для одного конкретного товара.
              Уточните запрос (например, по артикулу), если нужен расчёт суммы и разбивки по поставщикам.
            </p>
          </div>
          <div class="text-end small text-muted">
            <div>Поставщиков: <span class="fw-semibold" id="suppliersCount">${suppliersCount}</span></div>
            <div>Товаров: <span class="fw-semibold" id="productsCount">${productsCount}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // таблица с предложениями
  let rowsHtml = "";

  offers.forEach((o) => {
    const inStock = Number(o.stock || 0);
    const stockBadge =
      inStock > 0
        ? `<span class="badge rounded-pill bg-success-subtle text-success fw-normal px-3 py-2">${inStock}</span>`
        : `<span class="badge rounded-pill bg-danger-subtle text-danger fw-normal px-3 py-2">нет</span>`;

    rowsHtml += `
      <tr>
        <td class="align-middle">
          <div class="fw-semibold small text-primary">${escapeHtml(
            o.sku || ""
          )}</div>
          <div class="small text-muted">
            ${escapeHtml(o.product_name || "")}
          </div>
        </td>
        <td class="align-middle small">${escapeHtml(
          o.supplier_name || ""
        )}</td>
        <td class="align-middle small">${escapeHtml(o.city || "")}</td>
        <td class="align-middle text-center">${stockBadge}</td>
        <td class="align-middle text-center small">${
          o.lead_time_days != null ? Number(o.lead_time_days) : ""
        }</td>
        <td class="align-middle text-end small">
          ${formatMoney(o.price_no_vat)}
        </td>
        <td class="align-middle text-end small">
          ${formatMoney(o.price_with_vat)}
        </td>
      </tr>
    `;
  });

  const tableHtml = `
    <div class="card shadow-sm">
      <div class="card-body">
        <p class="text-uppercase small text-muted mb-3">
          Все предложения по запросу
        </p>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr class="text-muted small">
                <th scope="col">Товар</th>
                <th scope="col">Поставщик</th>
                <th scope="col">Город</th>
                <th scope="col" class="text-center">Наличие, шт</th>
                <th scope="col" class="text-center">Срок, дней</th>
                <th scope="col" class="text-end">Цена без НДС</th>
                <th scope="col" class="text-end">Цена с НДС</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="7" class="text-center text-muted py-4">Предложений нет</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // блок итога по одному товару
  let allocationHtml = "";

  if (data.product && data.totals && Array.isArray(data.allocation)) {
    const p = data.product;
    const t = data.totals;
    const requestedQty = data.requested_qty || 0;
    const missing = t.missing_qty || 0;

    let allocationRows = "";
    data.allocation.forEach((row) => {
      allocationRows += `
        <tr>
          <td class="align-middle small">${escapeHtml(
            row.supplier_name || ""
          )}</td>
          <td class="align-middle small">${escapeHtml(row.city || "")}</td>
          <td class="align-middle text-center small">${row.lead_time_days}</td>
          <td class="align-middle text-center small">${row.take}</td>
          <td class="align-middle text-end small">${formatMoney(
            row.price_no_vat
          )}</td>
          <td class="align-middle text-end small">${formatMoney(
            row.price_with_vat
          )}</td>
          <td class="align-middle text-end small">${formatMoney(
            row.line_total_no_vat
          )}</td>
          <td class="align-middle text-end small">${formatMoney(
            row.line_total_with_vat
          )}</td>
        </tr>
      `;
    });

    allocationHtml = `
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <p class="text-uppercase small text-muted mb-2">
            Итоговый подбор по поставщикам
          </p>
          <p class="mb-1 small">
            Товар:
            <span class="fw-semibold">${escapeHtml(p.sku || "")}</span>
            — ${escapeHtml(p.name || "")}
          </p>
          <p class="mb-3 small text-muted">
            Запрошенное количество: <span class="fw-semibold">${requestedQty}</span>
            шт. Подобрано: <span class="fw-semibold">${t.allocated_qty}</span> шт.
            ${
              missing > 0
                ? `Ещё не хватает <span class="fw-semibold">${missing}</span> шт.`
                : ""
            }
          </p>
          <div class="table-responsive mb-3">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr class="text-muted small">
                  <th>Поставщик</th>
                  <th>Город</th>
                  <th class="text-center">Срок, дней</th>
                  <th class="text-center">Кол-во, шт</th>
                  <th class="text-end">Цена без НДС</th>
                  <th class="text-end">Цена с НДС</th>
                  <th class="text-end">Сумма без НДС</th>
                  <th class="text-end">Сумма с НДС</th>
                </tr>
              </thead>
              <tbody>
                ${allocationRows || `<tr><td colspan="8" class="text-center text-muted py-3">Нечего распределять</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-end gap-3 small">
            <div>
              <div class="text-muted">Итого без НДС</div>
              <div class="fw-semibold">${formatMoney(t.total_no_vat)}</div>
            </div>
            <div>
              <div class="text-muted">Итого с НДС</div>
              <div class="fw-semibold">${formatMoney(t.total_with_vat)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = summaryHtml + allocationHtml + tableHtml;
}
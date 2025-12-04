const form = document.getElementById('searchForm');
const resultsDiv = document.getElementById('results');
const sortHidden = document.getElementById('sort');
const sortButtons = document.querySelectorAll('.sort-pill-group .btn');
const searchBtn = document.getElementById('searchBtn');

// Переключение сортировки
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

// Основной рендер результатов
function renderResults(data, query) {
  if (data.error) {
    resultsDiv.innerHTML = `
      <div class="alert alert-warning rounded-4">
        Запрос: <strong>${escapeHtml(query)}</strong><br>
        ${escapeHtml(data.error)}
      </div>
    `;
    return;
  }

  const offers = data.offers || [];

  // Считаем количество разных товаров
  const uniqueProducts = {};
  offers.forEach(o => {
    if (!uniqueProducts[o.product_id]) {
      uniqueProducts[o.product_id] = {
        sku: o.sku,
        name: o.product_name
      };
    }
  });
  const productCount = Object.keys(uniqueProducts).length;

  const allocation = data.allocation || [];
  const totals = data.totals || {};
  const missing = totals.missing_qty || 0;
  const offersCount = offers.length;

  let html = '';

  html += `
    <div class="card mb-4 border-0">
      <div class="card-body px-3 px-md-4 py-3 py-md-4 rounded-4 bg-white">
        <div class="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">
          <h5 class="card-title mb-0">
            Результаты для запроса:
            <span class="text-primary">${escapeHtml(query)}</span>
          </h5>
          <div class="results-summary text-end">
            <div>Поставщиков: <strong>${offersCount}</strong></div>
            <div>Товаров: <strong>${productCount}</strong></div>
          </div>
        </div>
  `;

  if (productCount === 1 && offers.length > 0) {
    const onlyKey = Object.keys(uniqueProducts)[0];
    const up = uniqueProducts[onlyKey];

    html += `
      <p class="mb-2">
        Найден товар:
        <span class="badge-soft badge-soft-success ms-1">
          ${escapeHtml(up.sku || '')}
        </span>
        <span class="text-muted ms-1">${escapeHtml(up.name || '')}</span>
      </p>
      <p class="mb-3 text-muted">
        Запрошено: <strong>${data.requested_qty}</strong> шт.
      </p>
    `;
  } else if (productCount > 1) {
    html += `
      <p class="mb-2">
        Найдено товаров: <strong>${productCount}</strong> по запросу "${escapeHtml(query)}".
      </p>
      <p class="mb-3 text-muted">
        Итоговый подбор по цене и сроку выполняется только для одного конкретного товара.
        Уточните запрос (например, по артикулу), если нужен расчёт суммы и разбивки по поставщикам.
      </p>
    `;
  } else {
    html += `
      <p class="mb-0 text-muted">
        По запросу ничего не найдено.
      </p>
    `;
  }

  html += `
      </div>
    </div>
  `;

  // Подбор по поставщикам (только если один товар)
  if (productCount === 1 && allocation.length > 0) {
    html += `
      <div class="card mb-4 border-0">
        <div class="card-body px-3 px-md-4 py-3 py-md-4 rounded-4 bg-white">
          <div class="separator-label mb-2">Подбор по поставщикам</div>
          <div class="table-responsive mb-3">
            <table class="table table-sm table-striped align-middle mb-0">
              <thead>
                <tr>
                  <th>Поставщик</th>
                  <th>Город</th>
                  <th>Кол-во, шт</th>
                  <th>Срок, дней</th>
                  <th>Цена без НДС</th>
                  <th>Цена с НДС</th>
                  <th>Сумма без НДС</th>
                  <th>Сумма с НДС</th>
                </tr>
              </thead>
              <tbody>
    `;

    allocation.forEach(line => {
      const badgeStock =
        line.take === 0
          ? '<span class="badge-soft badge-soft-danger">нет</span>'
          : `<span class="badge-soft badge-soft-success">${line.take} шт</span>`;

      html += `
        <tr>
          <td>${escapeHtml(line.supplier_name)}</td>
          <td>${escapeHtml(line.city)}</td>
          <td>${badgeStock}</td>
          <td>${line.lead_time_days}</td>
          <td>${formatMoney(line.price_no_vat)}</td>
          <td>${formatMoney(line.price_with_vat)}</td>
          <td>${formatMoney(line.line_total_no_vat)}</td>
          <td>${formatMoney(line.line_total_with_vat)}</td>
        </tr>
      `;
    });

    html += `
              </tbody>
            </table>
          </div>
          <div class="alert-soft mt-2">
            <div><strong>Итого без НДС:</strong> ${formatMoney(totals.total_no_vat || 0)} ₽</div>
            <div><strong>Итого с НДС:</strong> ${formatMoney(totals.total_with_vat || 0)} ₽</div>
            <div>
              <strong>Фактически подобрано:</strong> ${totals.allocated_qty || 0} шт
              ${missing > 0 ? `<span class="badge-soft badge-soft-danger ms-2">Недостача: ${missing} шт</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Таблица всех предложений
  if (offers.length > 0) {
    html += `
      <div class="card border-0">
        <div class="card-body px-3 px-md-4 py-3 py-md-4 rounded-4 bg-white">
          <div class="separator-label mb-2">Все предложения по запросу</div>
          <div class="table-responsive">
            <table class="table table-sm table-striped align-middle mb-0">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Поставщик</th>
                  <th>Город</th>
                  <th>Наличие, шт</th>
                  <th>Срок, дней</th>
                  <th>Цена без НДС</th>
                  <th>Цена с НДС</th>
                </tr>
              </thead>
              <tbody>
    `;

    offers.forEach(o => {
      let stockBadge;
      if (o.stock <= 0) {
        stockBadge = '<span class="badge-soft badge-soft-danger">нет</span>';
      } else if (o.stock < 5) {
        stockBadge = `<span class="badge-soft badge-soft-warning">${o.stock}</span>`;
      } else {
        stockBadge = `<span class="badge-soft badge-soft-success">${o.stock}</span>`;
      }

      html += `
        <tr>
          <td>
            <div class="small fw-semibold">${escapeHtml(o.sku || '')}</div>
            <div class="small text-muted">${escapeHtml(o.product_name || '')}</div>
          </td>
          <td>${escapeHtml(o.supplier_name)}</td>
          <td>${escapeHtml(o.city)}</td>
          <td>${stockBadge}</td>
          <td>${o.lead_time_days}</td>
          <td>${formatMoney(o.price_no_vat)}</td>
          <td>${formatMoney(o.price_with_vat)}</td>
        </tr>
      `;
    });

    html += `
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  resultsDiv.innerHTML = html;
}
(function () {
  const state = {
    items: [],
    sortField: 'created_at',
    sortDirection: 'desc',
    search: '',
    shortageOnly: false,
  };

  const DEFAULT_DIRECTIONS = {
    created_at: 'desc',
    name: 'asc',
    quantity: 'asc',
    received_date: 'desc',
  };

  const els = {
    list: document.getElementById('item-list'),
    search: document.getElementById('search-input'),
    sortButtons: Array.from(document.querySelectorAll('.sort-btn')),
    shortageToggle: document.getElementById('shortage-only-toggle'),
    error: document.getElementById('item-error'),
  };

  function showError(message) {
    if (!els.error) return;
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function clearError() {
    if (els.error) els.error.hidden = true;
  }

  function updateSortButtonLabels() {
    els.sortButtons.forEach((btn) => {
      const field = btn.dataset.sort;
      const isActive = field === state.sortField;
      btn.classList.toggle('is-active', isActive);
      const base = btn.textContent.replace(/ [▲▼]$/, '');
      btn.textContent = base + (isActive ? (state.sortDirection === 'asc' ? ' ▲' : ' ▼') : '');
    });
  }

  function renderItemRow(item) {
    const shortfall = item.target_quantity - item.quantity;
    const isShort = shortfall > 0;
    return `
      <div class="item-row" data-id="${item.id}">
        <div class="item-info">
          <div class="item-name-line">
            <span class="item-name">${escapeHtml(item.name)}</span>
            ${isShort ? `<span class="badge-shortage">${shortfall}개 부족</span>` : ''}
          </div>
          <div class="item-meta">
            ${escapeHtml(item.category)} · 등록자 ${escapeHtml(item.created_by_nickname)} · 입고일 ${formatDate(item.received_date)} · 수정 ${formatDateTime(item.updated_at)}
          </div>
        </div>
        <div class="item-qty">
          <span class="qty-display">${item.quantity} / 적정 ${item.target_quantity}</span>
          <div class="qty-controls">
            <button type="button" class="qty-btn qty-minus" aria-label="수량 감소">−</button>
            <input type="number" class="qty-amount" min="1" step="1" value="1" aria-label="변경 수량" />
            <button type="button" class="qty-btn qty-plus" aria-label="수량 증가">+</button>
          </div>
        </div>
        <button type="button" class="delete-btn">삭제</button>
      </div>
    `;
  }

  function getFiltered() {
    let list = state.items.slice();

    if (state.shortageOnly) {
      list = list.filter((item) => item.quantity < item.target_quantity);
    }

    if (state.search) {
      const q = state.search.toLowerCase();
      list = list.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.created_by_nickname.toLowerCase().includes(q)
      );
    }

    const field = state.sortField;
    const dir = state.sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (field === 'name') {
        return dir * a.name.localeCompare(b.name, 'ko');
      }
      let va = a[field];
      let vb = b[field];
      if (field === 'created_at' || field === 'received_date') {
        va = new Date(va).getTime();
        vb = new Date(vb).getTime();
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    return list;
  }

  function render() {
    const list = getFiltered();
    if (!list.length) {
      els.list.innerHTML = '<p class="empty">표시할 물품이 없습니다.</p>';
      return;
    }
    els.list.innerHTML = list.map(renderItemRow).join('');
  }

  async function reload() {
    try {
      const { data, error } = await supabaseClient.from('items').select('*');
      if (error) throw error;
      state.items = data;
      clearError();
      render();
    } catch (err) {
      console.error(err);
      showError('물품 목록을 불러오지 못했습니다.');
    }
  }

  async function handleQuantityChange(itemId, amount, isIncrease) {
    const nickname = NicknameModule.ensure('수량 변경자 닉네임을 입력해 주세요');
    if (!nickname) return;
    const fn = isIncrease ? 'increase_item_quantity' : 'decrease_item_quantity';
    try {
      const { error } = await supabaseClient.rpc(fn, {
        p_item_id: itemId,
        p_amount: amount,
        p_actor_nickname: nickname,
      });
      if (error) throw error;
      await reload();
    } catch (err) {
      console.error(err);
      showError('수량 변경에 실패했습니다.');
    }
  }

  async function handleDelete(itemId, itemName) {
    if (!window.confirm(`"${itemName}" 물품을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const nickname = NicknameModule.ensure('삭제자 닉네임을 입력해 주세요');
    if (!nickname) return;
    try {
      const { error } = await supabaseClient.rpc('delete_item', {
        p_item_id: itemId,
        p_actor_nickname: nickname,
      });
      if (error) throw error;
      await reload();
    } catch (err) {
      console.error(err);
      showError('삭제에 실패했습니다.');
    }
  }

  function wireEvents() {
    els.search.addEventListener('input', () => {
      state.search = els.search.value.trim();
      render();
    });

    els.sortButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.sort;
        if (state.sortField === field) {
          state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortField = field;
          state.sortDirection = DEFAULT_DIRECTIONS[field];
        }
        updateSortButtonLabels();
        render();
      });
    });

    els.shortageToggle.addEventListener('change', () => {
      state.shortageOnly = els.shortageToggle.checked;
      render();
    });

    els.list.addEventListener('click', (event) => {
      const row = event.target.closest('.item-row');
      if (!row) return;
      const itemId = row.dataset.id;
      const item = state.items.find((i) => i.id === itemId);
      if (!item) return;

      if (event.target.classList.contains('qty-plus') || event.target.classList.contains('qty-minus')) {
        const amountInput = row.querySelector('.qty-amount');
        const amount = Math.max(1, parseInt(amountInput.value, 10) || 1);
        handleQuantityChange(itemId, amount, event.target.classList.contains('qty-plus'));
      } else if (event.target.classList.contains('delete-btn')) {
        handleDelete(itemId, item.name);
      }
    });
  }

  function applyQueryFilter() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('filter') === 'shortage') {
      state.shortageOnly = true;
      els.shortageToggle.checked = true;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyQueryFilter();
    updateSortButtonLabels();
    wireEvents();
    reload();
  });
})();

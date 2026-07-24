(function () {
  const els = {
    totalCount: document.getElementById('total-item-count'),
    recentList: document.getElementById('recent-changes-list'),
    shortageList: document.getElementById('shortage-list'),
    shortageSummary: document.getElementById('shortage-summary'),
    categoryChartCanvas: document.getElementById('category-chart'),
    error: document.getElementById('dashboard-error'),
  };

  function showError(message) {
    if (!els.error) return;
    els.error.textContent = message;
    els.error.hidden = false;
  }

  function hasBatchim(word) {
    if (!word) return false;
    const code = word.charCodeAt(word.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return false;
    return (code - 0xac00) % 28 !== 0;
  }

  function withObjectParticle(word) {
    return `${word}${hasBatchim(word) ? '을' : '를'}`;
  }

  function actionLabel(log) {
    const actor = escapeHtml(log.actor_nickname || '알 수 없음');
    const rawName = log.item_name_snapshot || '(삭제된 물품)';
    const name = `<strong>${escapeHtml(rawName)}</strong>`;
    const nameWithParticle = `<strong>${escapeHtml(withObjectParticle(rawName))}</strong>`;
    switch (log.action) {
      case 'CREATE':
        return `${actor}님이 ${nameWithParticle} 등록했습니다 (수량 ${log.quantity_after})`;
      case 'INCREASE':
        return `${actor}님이 ${name} 수량을 ${log.quantity_change}개 늘렸습니다 (${log.quantity_before} → ${log.quantity_after})`;
      case 'DECREASE':
        return `${actor}님이 ${name} 수량을 ${Math.abs(log.quantity_change)}개 줄였습니다 (${log.quantity_before} → ${log.quantity_after})`;
      case 'DELETE':
        return `${actor}님이 ${nameWithParticle} 삭제했습니다`;
      case 'IMPORT':
        return `${actor}님이 ${nameWithParticle} 일괄 반영했습니다`;
      default:
        return `${actor}님이 ${name}에 변경을 남겼습니다`;
    }
  }

  function renderRecentChanges(logs) {
    if (!logs.length) {
      els.recentList.innerHTML = '<li class="empty">변경 내역이 없습니다.</li>';
      return;
    }
    els.recentList.innerHTML = logs.map((log) => `
      <li>
        <div class="log-line">${actionLabel(log)}</div>
        <div class="log-time">${formatDateTime(log.created_at)}</div>
      </li>
    `).join('');
  }

  function renderShortage(items) {
    const shortageItems = items
      .filter((item) => item.quantity < item.target_quantity)
      .map((item) => ({ ...item, shortfall: item.target_quantity - item.quantity }))
      .sort((a, b) => b.shortfall - a.shortfall);

    if (!shortageItems.length) {
      els.shortageList.innerHTML = '<li class="empty">부족한 물품이 없습니다.</li>';
      els.shortageSummary.innerHTML = '';
      return;
    }

    const top5 = shortageItems.slice(0, 5);
    els.shortageList.innerHTML = top5.map((item) => `
      <li>
        <span class="shortage-name">${escapeHtml(item.name)}</span>
        <span class="shortage-ratio">현재 ${item.quantity} / 적정 ${item.target_quantity}</span>
        <span class="shortage-badge">-${item.shortfall}개</span>
      </li>
    `).join('');

    const totalShortfall = shortageItems.reduce((sum, item) => sum + item.shortfall, 0);
    els.shortageSummary.innerHTML = `
      <span>부족 ${shortageItems.length}건 · 채우려면 ${totalShortfall}개</span>
      <a href="item.html?filter=shortage">전체 목록 보기 →</a>
    `;
  }

  function renderCategoryChart(items) {
    const counts = CATEGORIES.map((cat) => items.filter((item) => item.category === cat).length);
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    new Chart(els.categoryChartCanvas, {
      type: 'doughnut',
      data: {
        labels: CATEGORIES,
        datasets: [{
          data: counts,
          backgroundColor: ['#4f46e5', '#f59e0b', '#10b981', '#94a3b8'],
          borderWidth: 0,
        }],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, color: textColor },
          },
        },
      },
    });
  }

  async function load() {
    try {
      const [{ data: items, error: itemsError }, { data: logs, error: logsError }] = await Promise.all([
        supabaseClient.from('items').select('*'),
        supabaseClient.from('item_logs').select('*').order('created_at', { ascending: false }).limit(10),
      ]);

      if (itemsError) throw itemsError;
      if (logsError) throw logsError;

      els.totalCount.textContent = items.length;
      renderCategoryChart(items);
      renderShortage(items);
      renderRecentChanges(logs);
    } catch (err) {
      console.error(err);
      showError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  document.addEventListener('DOMContentLoaded', load);
})();

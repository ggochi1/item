(function () {
  const MODEL_STORAGE_KEY = 'supply-app-ai-model';

  const els = {
    modelSelect: document.getElementById('ai-model-select'),
    input: document.getElementById('ai-input'),
    analyzeBtn: document.getElementById('ai-analyze-btn'),
    status: document.getElementById('ai-status'),
    error: document.getElementById('ai-error'),
    previewSection: document.getElementById('ai-preview-section'),
    previewSummary: document.getElementById('ai-preview-summary'),
    previewBody: document.getElementById('ai-preview-body'),
    confirmBtn: document.getElementById('ai-confirm-btn'),
    cancelBtn: document.getElementById('ai-cancel-btn'),
  };

  let previewItems = [];

  function setStatus(message) {
    els.status.hidden = !message;
    els.status.textContent = message || '';
  }

  function showError(message) {
    els.error.hidden = false;
    els.error.textContent = message;
  }

  function clearError() {
    els.error.hidden = true;
    els.error.textContent = '';
  }

  function populateModels() {
    els.modelSelect.innerHTML = AI_MODELS.map((m) => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('');
    const saved = localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved && AI_MODELS.some((m) => m.id === saved)) {
      els.modelSelect.value = saved;
    }
    els.modelSelect.addEventListener('change', () => {
      localStorage.setItem(MODEL_STORAGE_KEY, els.modelSelect.value);
    });
  }

  function renderPreview(items) {
    previewItems = items.map((item) => ({ ...item }));

    if (!previewItems.length) {
      els.previewSection.hidden = true;
      showError('등록할 물품을 찾지 못했어요. 문장을 조금 더 구체적으로 써 주세요.');
      return;
    }

    els.previewSection.hidden = false;
    els.previewSummary.textContent = `${previewItems.length}건을 찾았어요. 카테고리는 AI의 추측값이니 필요하면 고쳐 주세요.`;
    els.previewBody.innerHTML = previewItems.map((item, idx) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.quantity}</td>
        <td>
          <select class="ai-category-select" data-index="${idx}">
            ${CATEGORIES.map((cat) => `<option value="${cat}" ${cat === item.category ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
          </select>
        </td>
        <td>${escapeHtml(item.received_date)}</td>
      </tr>
    `).join('');

    els.previewBody.querySelectorAll('.ai-category-select').forEach((select) => {
      select.addEventListener('change', () => {
        const idx = Number(select.dataset.index);
        previewItems[idx].category = select.value;
      });
    });
  }

  async function handleAnalyze() {
    clearError();
    els.previewSection.hidden = true;

    const text = els.input.value.trim();
    if (!text) {
      showError('내용을 입력해 주세요.');
      return;
    }

    els.analyzeBtn.disabled = true;
    setStatus('AI가 분석하는 중...');

    try {
      const { data, error } = await supabaseClient.functions.invoke('parse-items', {
        body: { text, model: els.modelSelect.value },
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      setStatus('');
      renderPreview((data && data.items) || []);
    } catch (err) {
      console.error(err);
      setStatus('');
      showError((err && err.message) || 'AI 분석에 실패했습니다. 아래 직접 입력 폼을 이용해 주세요.');
    } finally {
      els.analyzeBtn.disabled = false;
    }
  }

  async function handleConfirm() {
    if (!previewItems.length) return;
    const nickname = NicknameModule.ensure('등록자 닉네임을 입력해 주세요');
    if (!nickname) return;

    els.confirmBtn.disabled = true;
    els.confirmBtn.textContent = '등록 중...';

    try {
      const payload = previewItems.map((item) => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        target_quantity: 5,
        received_date: item.received_date,
        actor_nickname: nickname,
      }));

      const { error } = await supabaseClient.rpc('import_items', { p_rows: payload });
      if (error) throw error;

      els.previewSection.hidden = true;
      els.input.value = '';
      previewItems = [];
      setStatus('등록 완료! 목록으로 이동합니다...');
      setTimeout(() => {
        window.location.href = 'item.html';
      }, 700);
    } catch (err) {
      console.error(err);
      showError('등록에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      els.confirmBtn.disabled = false;
      els.confirmBtn.textContent = '확인하고 등록';
    }
  }

  function handleCancel() {
    previewItems = [];
    els.previewSection.hidden = true;
    clearError();
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      populateModels();
      els.analyzeBtn.addEventListener('click', handleAnalyze);
      els.confirmBtn.addEventListener('click', handleConfirm);
      els.cancelBtn.addEventListener('click', handleCancel);
    } catch (err) {
      // AI 등록 UI 초기화가 실패해도 register.js가 처리하는 수동 입력 폼은 별개로 계속 동작한다.
      console.error('AI 등록 UI 초기화 실패', err);
    }
  });
})();

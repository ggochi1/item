(function () {
  const REQUIRED_HEADERS = ['물품이름', '카테고리', '수량', '등록자', '입고일', '적정재고량'];
  const XLSX_CDN_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  let xlsxLoadPromise = null;

  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoadPromise) return xlsxLoadPromise;
    xlsxLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = XLSX_CDN_URL;
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => {
        xlsxLoadPromise = null;
        reject(new Error('엑셀 처리 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
      };
      document.head.appendChild(script);
    });
    return xlsxLoadPromise;
  }

  const els = {
    templateBtn: document.getElementById('template-btn'),
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    status: document.getElementById('import-status'),
    topError: document.getElementById('import-top-error'),
    previewSection: document.getElementById('preview-section'),
    previewBody: document.getElementById('preview-body'),
    previewSummary: document.getElementById('preview-summary'),
    rowErrors: document.getElementById('row-errors'),
    confirmBtn: document.getElementById('confirm-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    resultBanner: document.getElementById('import-result'),
  };

  let existingNames = new Set();
  let mergedRows = [];

  function showTopError(message) {
    els.topError.textContent = message;
    els.topError.hidden = false;
  }

  function clearTopError() {
    els.topError.hidden = true;
    els.topError.textContent = '';
  }

  function setStatus(message) {
    if (!message) {
      els.status.hidden = true;
      els.status.textContent = '';
      return;
    }
    els.status.hidden = false;
    els.status.textContent = message;
  }

  async function loadExistingNames() {
    try {
      const { data, error } = await supabaseClient.from('items').select('name');
      if (error) throw error;
      existingNames = new Set(data.map((row) => row.name));
    } catch (err) {
      console.error(err);
      existingNames = new Set();
    }
  }

  async function downloadTemplate() {
    try {
      setStatus('양식 파일을 준비하는 중...');
      const XLSX = await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet([REQUIRED_HEADERS]);
      ws['!cols'] = REQUIRED_HEADERS.map(() => ({ wch: 14 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '물품목록');
      XLSX.writeFile(wb, '물품등록_양식.xlsx');
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus('');
      showTopError(err.message || '양식 파일을 만들지 못했습니다.');
    }
  }

  function toDateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseExcelDate(value, XLSX) {
    if (value instanceof Date && !isNaN(value)) {
      return toDateStr(value);
    }
    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      return toDateStr(new Date(parsed.y, parsed.m - 1, parsed.d));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const normalized = trimmed.replace(/[./]/g, '-');
      const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!match) return null;
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      const dateObj = new Date(y, m - 1, d);
      if (dateObj.getFullYear() === y && dateObj.getMonth() === m - 1 && dateObj.getDate() === d) {
        return toDateStr(dateObj);
      }
      return null;
    }
    return null;
  }

  function toNonNegativeInt(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
    return n;
  }

  function validateRow(raw, rowNumber, XLSX) {
    const errors = [];
    const name = String(raw['물품이름'] ?? '').trim();
    const category = String(raw['카테고리'] ?? '').trim();
    const actor = String(raw['등록자'] ?? '').trim();

    if (!name) errors.push('물품이름이 비어 있습니다.');
    if (!CATEGORIES.includes(category)) errors.push(`카테고리는 ${CATEGORIES.join('/')} 중 하나여야 합니다.`);

    const quantity = toNonNegativeInt(raw['수량']);
    if (quantity === null) errors.push('수량은 0 이상의 정수여야 합니다.');

    if (!actor) errors.push('등록자가 비어 있습니다.');

    const receivedDate = parseExcelDate(raw['입고일'], XLSX);
    if (!receivedDate) {
      errors.push('입고일 형식을 확인해 주세요 (예: 2026-07-24).');
    } else if (receivedDate > todayStr()) {
      errors.push('입고일은 오늘보다 미래일 수 없습니다.');
    }

    const targetQuantity = toNonNegativeInt(raw['적정재고량']);
    if (targetQuantity === null) errors.push('적정재고량은 0 이상의 정수여야 합니다.');

    if (errors.length) {
      return { ok: false, rowNumber, name: name || `(${rowNumber}행)`, errors };
    }
    return {
      ok: true,
      rowNumber,
      data: { name, category, quantity, target_quantity: targetQuantity, received_date: receivedDate, actor_nickname: actor },
    };
  }

  function mergeByName(validRows) {
    const order = [];
    const map = new Map();
    validRows.forEach(({ data }) => {
      if (!map.has(data.name)) {
        map.set(data.name, { ...data, quantity: 0, sourceRows: [] });
        order.push(data.name);
      }
      const entry = map.get(data.name);
      entry.quantity += data.quantity;
      entry.sourceRows.push(data);
    });
    return order.map((name) => map.get(name));
  }

  function renderRowErrors(invalidRows) {
    if (!invalidRows.length) {
      els.rowErrors.innerHTML = '';
      els.rowErrors.hidden = true;
      return;
    }
    els.rowErrors.hidden = false;
    els.rowErrors.innerHTML = `
      <p class="row-errors-title">건너뛴 행 (${invalidRows.length}건)</p>
      <ul>
        ${invalidRows.map((row) => `<li><strong>${row.rowNumber}행</strong> (${escapeHtml(row.name)}) — ${escapeHtml(row.errors.join(' / '))}</li>`).join('')}
      </ul>
    `;
  }

  function renderPreview(merged) {
    if (!merged.length) {
      els.previewSection.hidden = true;
      return;
    }
    els.previewSection.hidden = false;
    els.previewBody.innerHTML = merged.map((row) => {
      const isNew = !existingNames.has(row.name);
      return `
        <tr>
          <td><span class="status-pill ${isNew ? 'status-new' : 'status-update'}">${isNew ? '신규' : '갱신'}</span></td>
          <td>${escapeHtml(row.name)}</td>
          <td>${escapeHtml(isNew ? row.category : '기존 값 유지')}</td>
          <td>${isNew ? '+' : '+'}${row.quantity}</td>
          <td>${escapeHtml(row.actor_nickname)}</td>
          <td>${escapeHtml(isNew ? row.received_date : '기존 값 유지')}</td>
          <td>${escapeHtml(isNew ? String(row.target_quantity) : '기존 값 유지')}</td>
        </tr>
      `;
    }).join('');

    const newCount = merged.filter((row) => !existingNames.has(row.name)).length;
    const updateCount = merged.length - newCount;
    els.previewSummary.textContent = `총 ${merged.length}건 — 신규 ${newCount}건, 기존 물품 수량 갱신 ${updateCount}건`;
  }

  async function handleFile(file) {
    clearTopError();
    els.resultBanner.hidden = true;
    els.previewSection.hidden = true;
    mergedRows = [];

    if (!file) return;

    const validExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!validExt) {
      showTopError('엑셀(.xlsx, .xls) 또는 csv 파일만 업로드할 수 있습니다.');
      return;
    }

    try {
      setStatus('엑셀 처리 라이브러리를 불러오는 중...');
      const XLSX = await loadXLSX();

      setStatus('파일을 읽는 중...');
      const isCsv = /\.csv$/i.test(file.name);
      let workbook;
      if (isCsv) {
        // CSV has no built-in encoding info; reading as text lets the browser
        // decode UTF-8 correctly. Reading it as a raw byte array (like .xlsx)
        // would corrupt non-ASCII (e.g. Korean) headers/values.
        const text = await file.text();
        workbook = XLSX.read(text, { type: 'string', cellDates: true });
      } else {
        const buffer = await file.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      }
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })[0] || [];
      const normalizedHeader = headerRow.map((h) => String(h).trim());
      const missingHeaders = REQUIRED_HEADERS.filter((h) => !normalizedHeader.includes(h));
      if (missingHeaders.length) {
        setStatus('');
        showTopError(`양식의 칸 이름을 확인해 주세요. 빠진 칸: ${missingHeaders.join(', ')} (순서: ${REQUIRED_HEADERS.join(' / ')})`);
        return;
      }

      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) {
        setStatus('');
        showTopError('업로드한 파일에 데이터 행이 없습니다.');
        return;
      }

      await loadExistingNames();

      const validRows = [];
      const invalidRows = [];
      rows.forEach((raw, idx) => {
        const rowNumber = idx + 2; // header is row 1
        const result = validateRow(raw, rowNumber, XLSX);
        if (result.ok) validRows.push(result);
        else invalidRows.push(result);
      });

      mergedRows = mergeByName(validRows);

      setStatus('');
      renderRowErrors(invalidRows);
      renderPreview(mergedRows);

      if (!mergedRows.length) {
        showTopError('저장할 수 있는 정상 행이 없습니다. 파일 내용을 확인해 주세요.');
      }
    } catch (err) {
      console.error(err);
      setStatus('');
      showTopError(err.message || '파일을 읽는 중 문제가 발생했습니다.');
    }
  }

  async function handleConfirm() {
    if (!mergedRows.length) return;
    const nickname = NicknameModule.ensure('업로드 담당자 닉네임을 입력해 주세요');
    if (!nickname) return;

    els.confirmBtn.disabled = true;
    els.confirmBtn.textContent = '저장 중...';

    try {
      const payload = mergedRows.map((row) => ({
        name: row.name,
        category: row.category,
        quantity: row.quantity,
        target_quantity: row.target_quantity,
        received_date: row.received_date,
        actor_nickname: row.actor_nickname,
      }));

      const { data, error } = await supabaseClient.rpc('import_items', { p_rows: payload });
      if (error) throw error;

      const createdCount = data.filter((r) => r.result_action === 'CREATED').length;
      const updatedCount = data.filter((r) => r.result_action === 'UPDATED').length;

      els.resultBanner.textContent = `저장 완료 — 신규 ${createdCount}건, 갱신 ${updatedCount}건. 목록으로 이동합니다...`;
      els.resultBanner.hidden = false;
      els.previewSection.hidden = true;
      mergedRows = [];
      els.fileInput.value = '';

      setTimeout(() => {
        window.location.href = 'item.html';
      }, 900);
    } catch (err) {
      console.error(err);
      showTopError('저장에 실패했습니다. 아무 것도 반영되지 않았으니 파일을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      els.confirmBtn.disabled = false;
      els.confirmBtn.textContent = '확인하고 저장';
    }
  }

  function handleCancel() {
    mergedRows = [];
    els.previewSection.hidden = true;
    els.rowErrors.hidden = true;
    els.fileInput.value = '';
    clearTopError();
  }

  function wireDropZone() {
    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        els.fileInput.click();
      }
    });

    els.fileInput.addEventListener('change', () => {
      const file = els.fileInput.files && els.fileInput.files[0];
      handleFile(file);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove('is-dragover');
      });
    });

    els.dropZone.addEventListener('drop', (event) => {
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      handleFile(file);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    els.templateBtn.addEventListener('click', downloadTemplate);
    els.confirmBtn.addEventListener('click', handleConfirm);
    els.cancelBtn.addEventListener('click', handleCancel);
    wireDropZone();
  });
})();

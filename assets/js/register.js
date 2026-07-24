(function () {
  const form = document.getElementById('register-form');
  const nameInput = document.getElementById('name-input');
  const categorySelect = document.getElementById('category-select');
  const quantityInput = document.getElementById('quantity-input');
  const targetInput = document.getElementById('target-input');
  const dateInput = document.getElementById('received-date-input');
  const nicknameInput = document.getElementById('nickname-form-input');
  const errorEl = document.getElementById('register-error');
  const successEl = document.getElementById('register-success');

  function populateCategories() {
    categorySelect.innerHTML = CATEGORIES.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
  }

  function setDefaults() {
    const today = todayStr();
    dateInput.value = today;
    dateInput.max = today;
    targetInput.value = 5;
    quantityInput.value = 0;
    nicknameInput.value = NicknameModule.get();
  }

  function showError(message) {
    successEl.hidden = true;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearMessages() {
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearMessages();

    const name = nameInput.value.trim();
    const category = categorySelect.value;
    const quantity = parseInt(quantityInput.value, 10);
    const targetQuantity = parseInt(targetInput.value, 10);
    const receivedDate = dateInput.value;
    const nickname = nicknameInput.value.trim();
    const today = todayStr();

    if (!name) return showError('물품 이름을 입력해 주세요.');
    if (!CATEGORIES.includes(category)) return showError('카테고리를 선택해 주세요.');
    if (!Number.isInteger(quantity) || quantity < 0) return showError('수량은 0 이상의 숫자여야 합니다.');
    if (!Number.isInteger(targetQuantity) || targetQuantity < 0) return showError('적정 재고량은 0 이상의 숫자여야 합니다.');
    if (!receivedDate) return showError('입고일을 선택해 주세요.');
    if (receivedDate > today) return showError('입고일은 오늘보다 미래일 수 없습니다.');
    if (!nickname) return showError('등록자 닉네임을 입력해 주세요.');

    try {
      const { error } = await supabaseClient.rpc('create_item', {
        p_name: name,
        p_category: category,
        p_quantity: quantity,
        p_target_quantity: targetQuantity,
        p_received_date: receivedDate,
        p_created_by_nickname: nickname,
      });
      if (error) throw error;

      NicknameModule.set(nickname);
      successEl.textContent = '물품이 등록되었습니다. 목록으로 이동합니다...';
      successEl.hidden = false;
      setTimeout(() => {
        window.location.href = 'item.html';
      }, 700);
    } catch (err) {
      console.error(err);
      showError('등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateCategories();
    setDefaults();
    form.addEventListener('submit', handleSubmit);
  });
})();

(function () {
  const NAV_ITEMS = [
    { href: 'index.html', label: '현황 대시보드', icon: '📊' },
    { href: 'item.html', label: '물품 목록', icon: '📦' },
    { href: 'register.html', label: '물품 등록', icon: '➕' },
    { href: 'import.html', label: '엑셀 업로드', icon: '📥' },
  ];

  function currentPage() {
    const path = window.location.pathname.split('/').pop();
    return path || 'index.html';
  }

  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const current = currentPage();

    const navHtml = NAV_ITEMS.map((item) => {
      const active = item.href === current ? ' is-active' : '';
      return `<a class="nav-item${active}" href="${item.href}">
        <span aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
      </a>`;
    }).join('');

    sidebar.innerHTML = `
      <div class="sidebar-header">🗂️ 공용 물품 관리</div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-footer">
        <div class="nickname-box">
          <label for="nickname-input">내 닉네임</label>
          <input id="nickname-input" type="text" maxlength="20" placeholder="닉네임 입력" />
        </div>
        <div>
          <span class="theme-switch-label">화면 밝기</span>
          <div class="theme-switch" role="group" aria-label="화면 밝기">
            <button type="button" data-theme-choice="system">시스템</button>
            <button type="button" data-theme-choice="light">밝게</button>
            <button type="button" data-theme-choice="dark">어둡게</button>
          </div>
        </div>
      </div>
    `;
  }

  function wireMobileToggle() {
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !hamburger || !backdrop) return;

    function openSidebar() {
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-visible');
      hamburger.setAttribute('aria-expanded', 'true');
    }
    function closeSidebar() {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-visible');
      hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', () => {
      if (sidebar.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    });
    backdrop.addEventListener('click', closeSidebar);
    sidebar.querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', closeSidebar));
  }

  function wireThemeSwitch() {
    const buttons = document.querySelectorAll('[data-theme-choice]');
    const current = ThemeModule.getPreference();
    buttons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === current);
      btn.addEventListener('click', () => {
        ThemeModule.setPreference(btn.dataset.themeChoice);
        buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });
  }

  function wireNickname() {
    const input = document.getElementById('nickname-input');
    if (!input) return;
    input.value = NicknameModule.get();
    input.addEventListener('change', () => {
      NicknameModule.set(input.value);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderSidebar();
    wireMobileToggle();
    wireThemeSwitch();
    wireNickname();
  });
})();

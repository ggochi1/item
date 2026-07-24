const NicknameModule = (function () {
  const STORAGE_KEY = 'supply-app-nickname';

  function get() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function set(nickname) {
    const trimmed = (nickname || '').trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
    return trimmed;
  }

  function ensure(message) {
    let name = get();
    if (!name) {
      const input = window.prompt(message || '닉네임을 입력해 주세요 (변경 기록에 남습니다)', '');
      name = set(input || '');
    }
    return name;
  }

  return { get, set, ensure };
})();

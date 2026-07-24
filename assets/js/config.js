const SUPABASE_URL = 'https://zxojwktfmanqypkxjnpp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b2p3a3RmbWFucXlwa3hqbnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzM3NDgsImV4cCI6MjEwMDQwOTc0OH0.U-zbw-Svkxw0zvZRuf0KgVkyavxHvRBtSfvkdB_GR3k';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = ['문구류', '전자기기', '청소용품', '기타'];

// 물품 등록 화면의 "말로 등록하기(AI)"에서 고를 수 있는 모델.
// 셋 다 무료 모델이지만, 실제 요청 전 Edge Function에서 OpenRouter 가격을 다시 확인한다.
const AI_MODELS = [
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'NVIDIA Nemotron 3 Nano (무료)' },
  { id: 'google/gemma-4-31b-it:free', label: 'Google Gemma 4 31B (무료)' },
  { id: 'openai/gpt-oss-20b:free', label: 'OpenAI GPT-OSS 20B (무료)' },
];

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatDate(dateStr) {
  return dateStr || '-';
}

// Phones get a retro "PC only" screen instead of the decks.
// Add ?mobile=1 to the URL to preview it on desktop, ?mobile=0 to skip it.
const BYPASS_KEY = 'bit-cheer-mobile-bypass';

function looksMobile() {
  const forced = new URLSearchParams(location.search).get('mobile');
  if (forced === '1') return true;
  if (forced === '0') return false;
  try { if (sessionStorage.getItem(BYPASS_KEY)) return false; } catch {}
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|BlackBerry/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; catch touch screens that are also small.
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
}

function loadApp() {
  import('./main.js');
}

if (looksMobile()) {
  import('./mobile-gate.js').then(({ showMobileGate }) => {
    showMobileGate(document.getElementById('app'), () => {
      try { sessionStorage.setItem(BYPASS_KEY, '1'); } catch {}
      document.documentElement.classList.remove('mobile-gated');
      document.getElementById('app').innerHTML = '<p class="loading">bit.cheer · loading your decks… good luck, brave one.</p>';
      loadApp();
    });
  });
} else {
  loadApp();
}

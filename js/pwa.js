/**
 * PWA Registration & Floating Install Button Controller
 * รองรับทั้ง Android/Desktop (beforeinstallprompt) และ iOS Safari (คำแนะนำ Add to Home Screen)
 */

(function () {
  const MINIMIZE_KEY = 'pwa_install_minimized';
  let deferredInstallPrompt = null;

  function isStandaloneMode() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIosSafari() {
    const ua = window.navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    return isIos && isSafari;
  }

  function isMinimized() {
    try {
      return localStorage.getItem(MINIMIZE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function getFloatingEl() {
    return document.getElementById('pwaInstallFloating');
  }

  function applyFloatingState(minimized) {
    const expandedEl = document.getElementById('pwaInstallExpanded');
    const miniEl = document.getElementById('pwaInstallMini');
    if (expandedEl) expandedEl.classList.toggle('hidden', minimized);
    if (miniEl) miniEl.classList.toggle('hidden', !minimized);
  }

  function showFloatingButton() {
    if (isStandaloneMode()) return;
    const el = getFloatingEl();
    if (!el) return;
    applyFloatingState(isMinimized());
    el.classList.remove('hidden');
  }

  function hideFloatingButton() {
    const el = getFloatingEl();
    if (el) el.classList.add('hidden');
  }

  function showIosInstallGuide() {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'ติดตั้งแอปบน iPhone / iPad',
        html: `
          <div class="text-left text-sm text-slate-600 space-y-3 leading-relaxed">
            <div class="flex items-start gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <p>กดปุ่ม <b>แชร์ (Share)</b> <i class="fas fa-arrow-up-from-bracket text-blue-600 mx-1"></i> ที่แถบเครื่องมือของ Safari</p>
            </div>
            <div class="flex items-start gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <p>เลื่อนลงแล้วเลือก <b>"เพิ่มไปยังหน้าจอโฮม"</b> <span class="text-xs text-slate-400">(Add to Home Screen)</span></p>
            </div>
          </div>
        `,
        imageUrl: 'assets/icon-192.png',
        imageWidth: 64,
        imageHeight: 64,
        imageAlt: 'ไอคอนแอป เฝ้าน้ำหยงมัส',
        confirmButtonText: 'เข้าใจแล้ว',
        confirmButtonColor: '#1e3a8a',
        customClass: { popup: 'rounded-[1.75rem]' }
      });
    } else {
      alert('บน Safari ให้กดปุ่ม แชร์ (Share) แล้วเลือก "เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)');
    }
  }

  async function triggerPwaInstall() {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice && choice.outcome === 'accepted') {
          hideFloatingButton();
        }
      } catch (err) {
        console.warn('PWA install prompt error:', err);
      }
      return;
    }

    if (isIosSafari()) {
      showIosInstallGuide();
    }
  }

  function minimizePwaInstallBanner() {
    try {
      localStorage.setItem(MINIMIZE_KEY, '1');
    } catch (e) {}
    applyFloatingState(true);
  }

  function expandPwaInstallBanner() {
    try {
      localStorage.removeItem(MINIMIZE_KEY);
    } catch (e) {}
    applyFloatingState(false);
  }

  window.triggerPwaInstall = triggerPwaInstall;
  window.minimizePwaInstallBanner = minimizePwaInstallBanner;
  window.expandPwaInstallBanner = expandPwaInstallBanner;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showFloatingButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hideFloatingButton();
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (isStandaloneMode()) {
      hideFloatingButton();
      return;
    }
    if (isIosSafari()) {
      showFloatingButton();
    }
  });
})();


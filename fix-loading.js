// ====== Startup safety net (fix-loading.js) ======
// Works even if app.js or Firebase fails, so the loading screen never stays forever.
(function () {
  // 1. Remove the splash after 5 seconds, whatever app.js did
  setTimeout(function () {
    var splash = document.getElementById('splashScreen');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.pointerEvents = 'none';
      setTimeout(function () { splash.remove(); }, 800);
    }
  }, 5000);

  // 2. After 6 seconds, explain what stopped the page instead of showing a blank loading screen
  setTimeout(function () {
    var loader = document.getElementById('bookLoader');
    var problem = '';

    if (typeof window.toggleTheme !== 'function') {
      problem = 'app.js did not load. Make sure index.html, style.css, app.js and shop.js are in the same folder, and that app.js has no paste errors.';
    } else if (typeof window.firebase === 'undefined') {
      problem = 'Firebase did not load. Check your internet connection or firewall.';
    } else if (loader && loader.style.display !== 'none') {
      problem = 'app.js stopped early. Open the browser console (F12) to see the error.';
    }

    if (problem) {
      var box = document.createElement('div');
      box.textContent = problem;
      box.style.cssText = 'position:fixed; left:16px; right:16px; bottom:16px; z-index:100000; background:#7f1d1d; color:#fff; padding:14px 16px; border-radius:10px; font:14px/1.5 system-ui, sans-serif;';
      document.body.appendChild(box);
    }
  }, 6000);
})();

window.addEventListener('error', event => {
  if (!event.message) return;
  let panel = document.getElementById('startup-error');
  if (!panel) {
    panel = document.createElement('p');
    panel.id = 'startup-error';
    panel.setAttribute('role', 'alert');
    panel.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:9999;background:#fff3e4;color:#542c10;border:1px solid #e1bb89;border-radius:10px;padding:18px;font:14px system-ui';
    document.body.appendChild(panel);
  }
  panel.textContent = 'Skyline could not finish starting: ' + event.message + '. Please copy this message so the error can be fixed.';
});

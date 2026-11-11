// Shared product-page mobile navigation
document.addEventListener('DOMContentLoaded', () => {
  const menu = document.getElementById('mobileMenu');
  const btn = document.getElementById('menuBtn');
  const toggle = document.getElementById('solutionsMobileToggle');
  const submenu = document.getElementById('solutionsMobileMenu');

  if (btn && menu) {
    btn.addEventListener('click', () => {
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('lock', open);
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('lock');
    }));
  }

  if (toggle && submenu) {
    toggle.addEventListener('click', () => {
      const open = !submenu.classList.contains('open');
      submenu.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
});
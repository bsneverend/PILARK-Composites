// Shared product-page mobile navigation
document.addEventListener('DOMContentLoaded', () => {
  const navInner = document.querySelector('.nav-inner');
  if (!navInner) return;

  // Product SEO pages historically had the mobile CSS but not the mobile
  // navigation markup. Build it here so every product page uses the same menu.
  let btn = document.getElementById('menuBtn');
  let menu = document.getElementById('mobileMenu');

  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'menuBtn';
    btn.className = 'menu-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = '☰';
    navInner.appendChild(btn);
  }

  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'mobileMenu';
    menu.className = 'mobile-menu';
    menu.innerHTML = `
      <a href="../index.html#company">About Us</a>
      <a href="../index.html#products">Products</a>
      <div class="mobile-submenu-wrap">
        <button id="solutionsMobileToggle" class="mobile-submenu-toggle" type="button" aria-expanded="false">
          Solutions <span aria-hidden="true">+</span>
        </button>
        <div id="solutionsMobileMenu" class="mobile-submenu">
          <a href="../index.html#applications">Applications</a>
          <a href="../index.html#services">Services</a>
          <a href="../index.html#quality">Quality</a>
        </div>
      </div>
      <a href="../index.html#catalog">Catalog</a>
      <a href="../index.html#clients">Our Clients</a>
      <a href="../admin.html">Login</a>
      <a href="../index.html#contact">Contact</a>
    `;
    document.body.appendChild(menu);
  }

  const toggle = document.getElementById('solutionsMobileToggle');
  const submenu = document.getElementById('solutionsMobileMenu');

  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('lock', open);
    });
  }

  menu.querySelectorAll('a').forEach(a => {
    if (!a.dataset.bound) {
      a.dataset.bound = '1';
      a.addEventListener('click', () => {
        menu.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Open menu');
        document.body.classList.remove('lock');
      });
    }
  });

  if (toggle && submenu && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const open = !submenu.classList.contains('open');
      submenu.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      const icon = toggle.querySelector('span');
      if (icon) icon.textContent = open ? '−' : '+';
    });
  }
});
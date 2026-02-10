// Docs sidebar toggle (mobile)
document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.docs-sidebar-toggle');
  var sidebar = document.querySelector('.docs-sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      toggle.textContent = sidebar.classList.contains('open') ? 'Hide Navigation' : 'Show Navigation';
    });
  }

  // Highlight active sidebar link
  var path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
  var links = document.querySelectorAll('.docs-sidebar a');
  links.forEach(function (link) {
    var href = link.getAttribute('href').replace(/\.html$/, '').replace(/\/$/, '');
    if (href === path) {
      link.classList.add('active');
    }
  });
});

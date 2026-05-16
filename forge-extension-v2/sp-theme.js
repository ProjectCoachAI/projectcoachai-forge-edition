function setTheme(t) {
  document.body.setAttribute('data-theme', t);
  try { localStorage.setItem('forge_sp_theme', t); } catch(e){}
  const p = document.getElementById('spThemePicker');
  if(p) p.style.display = 'none';
}

function toggleThemePicker() {
  const p = document.getElementById('spThemePicker');
  if(!p) return;
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
}

// Wire up theme buttons
document.addEventListener('DOMContentLoaded', function() {
  // Restore saved theme
  try {
    const saved = localStorage.getItem('forge_sp_theme') || 'dark';
    document.body.setAttribute('data-theme', saved);
  } catch(e){}

  // Theme button
  const btn = document.getElementById('spThemeBtn');
  if(btn) btn.addEventListener('click', toggleThemePicker);

  // Theme picker buttons
  const picker = document.getElementById('spThemePicker');
  if(picker) {
    picker.querySelectorAll('button[data-theme]').forEach(function(b) {
      b.addEventListener('click', function() { setTheme(b.getAttribute('data-theme')); });
    });
  }
});

// Forge Global Header Auth — included on all pages
(async function() {
  if (typeof Forge === 'undefined') return;
  let user = Forge.getUser ? Forge.getUser() : null;
  if (!user && Forge.restoreSession) user = await Forge.restoreSession().catch(() => null);
  const el = document.getElementById('headerAuth');
  if (!el) return;
  if (!user) {
    el.innerHTML =
      '<a href="/signin.html" class="btn btn-ghost" style="font-size:13px">Sign In</a>' +
      '<a href="/register.html" class="btn btn-primary" style="font-size:13px;margin-left:8px">Start Free</a>';
    return;
  }
  const tier = Forge.getTierInfo ? Forge.getTierInfo(user.tier || 'starter') : {badge:null};
  const avatarHtml = user.avatar
    ? '<img src="'+user.avatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
    : (user.name||'U')[0].toUpperCase();
  const tierBadge = tier.badge ? '<span class="tier-badge">'+tier.badge+'</span>' : '';
  const firstName = (user.name||'Account').split(' ')[0];
  const langFlags = { en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', it: '🇮🇹' };
  const activeLang = (function(){ try { return localStorage.getItem('forge_language') || 'en'; } catch(_){ return 'en'; } })();
  const langFlag = activeLang !== 'en' ? ' <span title="Response language: ' + activeLang + '" style="font-size:12px;opacity:0.85;">' + (langFlags[activeLang]||'🇬🇧') + '</span>' : '';
  el.innerHTML =
    '<div class="user-pill" onclick="location.href=&quot;/profile.html&quot;" title="View profile">' +
      '<div class="user-avatar">'+avatarHtml+'</div>' +
      firstName + langFlag + tierBadge +
    '</div>' +
    '<a href="/forge-feature-chooser.html" class="btn btn-primary" style="font-size:12px;">Go to workspace</a>' +
    '<button class="btn btn-ghost" onclick="Forge.auth.signout().then(()=>window.location.href=&quot;/signin.html&quot;)">Sign Out</button>';
  // Active nav tab
  document.querySelectorAll('.nav-tab').forEach(tab => {
    try {
      const tabPath = new URL(tab.href).pathname.replace('.html','');
      const curPath = window.location.pathname.replace('.html','');
      if (curPath === tabPath || (tabPath !== '/' && curPath.startsWith(tabPath))) {
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
      }
    } catch(_) {}
  });
})();
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
  el.innerHTML =
    '<div class="user-pill" onclick="location.href=&quot;/profile.html&quot;" title="View profile">' +
      '<div class="user-avatar">'+avatarHtml+'</div>' +
      firstName + tierBadge +
    '</div>' +
    '<a href="/forge-feature-chooser.html" class="btn btn-primary" style="font-size:12px;">Go to workspace</a>' +
    '<button class="btn btn-ghost" onclick="Forge.auth.signout().then(()=>window.location.href=&quot;/signin.html&quot;)">Sign Out</button>';
})();

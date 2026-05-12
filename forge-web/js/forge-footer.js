// Forge Global Footer — inject standard footer on all pages
document.addEventListener('DOMContentLoaded', function() {
  const footer = document.querySelector('footer.forge-footer');
  if (!footer) return;
  footer.innerHTML =
    '<div class="footer-tagline">The decision layer on top of AI.<br>Local-first. Your accounts. Your data.</div>' +
    '<div class="footer-links">' +
      '<a href="/pricing.html">Pricing</a><span class="sep">&middot;</span>' +
      '<a href="/why-forge.html">Why Forge</a><span class="sep">&middot;</span>' +
      '<a href="/why-excel.html">Why Excel</a><span class="sep">&middot;</span>' +
      '<a href="/help.html">Help</a><span class="sep">&middot;</span>' +
      '<a href="/contact.html">Contact</a><span class="sep">&middot;</span>' +
      '<a href="/profile.html">Profile</a><span class="sep">&middot;</span>' +
      '<a href="/privacy.html">Privacy</a><span class="sep">&middot;</span>' +
      '<a href="/terms.html">Terms</a><span class="sep">&middot;</span>' +
      '<a href="#" onclick="inviteColleague();return false;" style="color:var(--accent);font-weight:600">&#127881; Invite a Colleague</a>' +
    '</div>';
});

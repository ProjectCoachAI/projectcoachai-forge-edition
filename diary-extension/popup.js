// Diary Extension — Popup

document.addEventListener('DOMContentLoaded', function() {
  chrome.runtime.sendMessage({ type: 'GET_TOKEN_BG' }, function(r) {
    var token = r && r.token;
    if (!token) {
      document.getElementById('signedOut').style.display = 'block';
      return;
    }
    // Verify token and get user
    fetch('https://api.projectcoachai.com/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(function(res) { return res.json(); })
      .then(function(data) {
        if (data && data.user) {
          document.getElementById('signedIn').style.display = 'block';
          document.getElementById('userEmail').textContent = data.user.email || '';
        } else {
          chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN_BG' });
          document.getElementById('signedOut').style.display = 'block';
        }
      })
      .catch(function() {
        document.getElementById('signedOut').style.display = 'block';
      });
  });

  document.getElementById('signOutBtn') && document.getElementById('signOutBtn').addEventListener('click', function() {
    chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN_BG' }, function() {
      document.getElementById('signedIn').style.display = 'none';
      document.getElementById('signedOut').style.display = 'block';
    });
  });
});

/* login.html only */

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  form.classList.add('was-validated');
  if (!form.checkValidity()) return;

  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const submitBtn = form.querySelector('button[type=submit]');
  hideAlert();
  setLoading(submitBtn, true, 'Signing in…');

  const res = await api('login.php', {
    email,
    password: document.getElementById('loginPassword').value,
    remember: document.getElementById('remember').checked
  });
  if (!res.ok) {
    setLoading(submitBtn, false);
    showAlert('danger', res.message);
    return;
  }
  Theme.set(res.user.theme);                 // use the theme saved on the account
  window.location.href = 'dashboard.html';
});
